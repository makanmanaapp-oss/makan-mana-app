/// PART 1 Phase 1.12 Part M — abstraksi bacaan tempat legasi/canonical.
///
/// UI produksi TIDAK berubah dalam fasa ini: mod lalai ialah `legacyOnly`,
/// jadi [DualPlaceReadRepository] berkelakuan sama seperti laluan legasi.
///
/// Peraturan yang dikuatkuasakan di sini:
/// - kegagalan canonical jatuh balik ke legasi;
/// - had masa canonical jatuh balik ke legasi;
/// - alias yang hilang jatuh balik ke legasi;
/// - hasil legasi TIDAK PERNAH dilambatkan oleh bacaan bayangan;
/// - placeId stabil dikekalkan;
/// - tiada hasil tempat berganda.
library;

import 'dart:async';

import 'alias_resolution.dart';
import 'place_migration_flags.dart';
import 'read_comparison.dart';

/// Paparan tempat yang neutral-sumber (cukup untuk kad dan butiran).
class PlaceReadResult {
  const PlaceReadResult({
    required this.placeId,
    required this.view,
    required this.source,
    this.canonicalPlaceId,
    this.fellBackToLegacy = false,
    this.fallbackReason,
    this.comparison,
  });

  /// ID stabil yang dilihat pemanggil — SENTIASA ID yang mereka minta.
  final String placeId;
  final ComparablePlaceView view;

  /// Sumber sebenar yang menyediakan [view].
  final PlaceReadSource source;

  /// ID canonical apabila alias diselesaikan (diagnostik QA sahaja).
  final String? canonicalPlaceId;

  final bool fellBackToLegacy;
  final PlaceReadFallbackReason? fallbackReason;

  /// Diisi hanya dalam mod bacaan bayangan (debug/ujian).
  final PlaceReadComparison? comparison;
}

enum PlaceReadSource { legacy, canonicalStub, none }

enum PlaceReadFallbackReason {
  canonicalError,
  canonicalTimeout,
  canonicalMissing,
  aliasNotFound,
  aliasCircular,
  canonicalBlocked,
  modeIsLegacyOnly,
}

/// Sempadan bacaan tunggal yang digunakan oleh lapisan kad/butiran.
abstract class PlaceReadRepository {
  Future<PlaceReadResult?> readPlace(String placeId);
  Future<List<PlaceReadResult>> readPlaces(List<String> placeIds);
}

// ---------------------------------------------------------------------------
// Legasi
// ---------------------------------------------------------------------------

/// Pembaca legasi. Ini adalah laluan produksi dan kekal tidak berubah.
class LegacyPlaceReadRepository implements PlaceReadRepository {
  LegacyPlaceReadRepository(this._lookup);

  /// Disuntik supaya ujian boleh membekalkan data legasi tanpa Firestore.
  final Future<ComparablePlaceView?> Function(String placeId) _lookup;

  @override
  Future<PlaceReadResult?> readPlace(String placeId) async {
    final view = await _lookup(placeId);
    if (view == null) return null;
    return PlaceReadResult(
      placeId: placeId,
      view: view,
      source: PlaceReadSource.legacy,
    );
  }

  @override
  Future<List<PlaceReadResult>> readPlaces(List<String> placeIds) async {
    final out = <PlaceReadResult>[];
    for (final id in placeIds) {
      final result = await readPlace(id);
      if (result != null) out.add(result);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Stub canonical
// ---------------------------------------------------------------------------

/// Stub pembaca canonical.
///
/// TIDAK disambungkan kepada Firebase produksi. Ia dilayan oleh data yang
/// disuntik supaya bacaan bayangan dan jatuh balik boleh diuji sepenuhnya
/// sebelum penyesuai sebenar wujud.
class CanonicalPlaceReadRepositoryStub implements PlaceReadRepository {
  CanonicalPlaceReadRepositoryStub({
    Map<String, ComparablePlaceView>? records,
    Set<String>? blockedCanonicalIds,
    this.latency = Duration.zero,
    this.failNextRead = false,
  })  : _records = records ?? <String, ComparablePlaceView>{},
        _blocked = blockedCanonicalIds ?? <String>{};

  final Map<String, ComparablePlaceView> _records;
  final Set<String> _blocked;

  /// Kelewatan tiruan untuk menguji had masa.
  Duration latency;

  /// Suntikan kegagalan untuk menguji jatuh balik.
  bool failNextRead;

  void seed(String canonicalPlaceId, ComparablePlaceView view) {
    _records[canonicalPlaceId] = view;
  }

  void block(String canonicalPlaceId) => _blocked.add(canonicalPlaceId);

  bool isBlocked(String canonicalPlaceId) => _blocked.contains(canonicalPlaceId);

  @override
  Future<PlaceReadResult?> readPlace(String canonicalPlaceId) async {
    if (latency > Duration.zero) await Future<void>.delayed(latency);
    if (failNextRead) {
      failNextRead = false;
      throw StateError('canonical_stub_failure');
    }
    final view = _records[canonicalPlaceId];
    if (view == null) return null;
    return PlaceReadResult(
      placeId: canonicalPlaceId,
      view: view,
      source: PlaceReadSource.canonicalStub,
      canonicalPlaceId: canonicalPlaceId,
    );
  }

  @override
  Future<List<PlaceReadResult>> readPlaces(List<String> placeIds) async {
    final out = <PlaceReadResult>[];
    for (final id in placeIds) {
      final result = await readPlace(id);
      if (result != null) out.add(result);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Dual read
// ---------------------------------------------------------------------------

/// Had masa bacaan canonical. Melebihinya bermakna kita menggunakan legasi.
const Duration kCanonicalReadTimeout = Duration(milliseconds: 800);

/// Pembaca dwi-mod yang mengarahkan mengikut [PlaceMigrationFeatureFlags].
class DualPlaceReadRepository implements PlaceReadRepository {
  DualPlaceReadRepository({
    required this.legacy,
    required this.canonical,
    required this.aliasResolver,
    this.canonicalTimeout = kCanonicalReadTimeout,
    this.onComparison,
  });

  final PlaceReadRepository legacy;
  final CanonicalPlaceReadRepositoryStub canonical;
  final AliasResolver aliasResolver;
  final Duration canonicalTimeout;

  /// Dipanggil untuk setiap perbandingan bayangan (diagnostik QA sahaja).
  final void Function(PlaceReadComparison comparison)? onComparison;

  PlaceReadMode get _mode => PlaceMigrationFeatureFlags.canonicalPlaceReadMode;

  @override
  Future<PlaceReadResult?> readPlace(String placeId) async {
    switch (_mode) {
      case PlaceReadMode.legacyOnly:
        return legacy.readPlace(placeId);

      case PlaceReadMode.shadowRead:
        return _shadowRead(placeId);

      case PlaceReadMode.canonicalPreferredWithLegacyFallback:
        return _canonicalPreferred(placeId);

      case PlaceReadMode.canonicalOnlyTest:
        return _canonicalOnly(placeId);
    }
  }

  @override
  Future<List<PlaceReadResult>> readPlaces(List<String> placeIds) async {
    // Nyahduplikasi ID input: satu tempat tidak boleh muncul dua kali walaupun
    // pemanggil meminta ID legasi DAN ID canonicalnya.
    final seen = <String>{};
    final out = <PlaceReadResult>[];
    for (final id in placeIds) {
      final result = await readPlace(id);
      if (result == null) continue;
      // Kunci nyahduplikasi ialah ID canonical apabila diketahui, jika tidak
      // ID stabil yang diminta.
      final key = result.canonicalPlaceId ?? result.placeId;
      if (!seen.add(key)) continue;
      out.add(result);
    }
    return out;
  }

  // --- Bacaan bayangan -----------------------------------------------------

  /// Legasi kekal yang dilihat pengguna. Canonical dibaca selari dan hasilnya
  /// dibuang selepas perbandingan. Bacaan canonical TIDAK PERNAH melambatkan
  /// hasil legasi: ia diselesaikan dahulu, kemudian kita membandingkan.
  Future<PlaceReadResult?> _shadowRead(String placeId) async {
    final legacyResult = await legacy.readPlace(placeId);
    if (legacyResult == null) return null;

    // Selepas titik ini hasil legasi sudah siap; kerja bayangan adalah tambahan
    // dan dilindungi had masa serta penangkap ralat.
    PlaceReadComparison? comparison;
    try {
      final resolution = aliasResolver.resolve(placeId);
      if (resolution.status == AliasResolutionStatus.resolved) {
        final canonicalResult = await canonical
            .readPlace(resolution.canonicalPlaceId!)
            .timeout(canonicalTimeout);
        if (canonicalResult != null) {
          comparison = comparePlaceReads(
            legacyResult.view,
            canonicalResult.view,
            legacySource: 'legacy',
            canonicalSource: 'canonical_stub',
          );
          onComparison?.call(comparison);
        }
      }
    } catch (_) {
      // Kegagalan bayangan TIDAK PERNAH menjejaskan pengguna.
    }

    return PlaceReadResult(
      placeId: legacyResult.placeId,
      view: legacyResult.view,
      source: PlaceReadSource.legacy,
      canonicalPlaceId: comparison == null ? null : legacyResult.canonicalPlaceId,
      comparison: comparison,
    );
  }

  // --- Canonical diutamakan ------------------------------------------------

  Future<PlaceReadResult?> _canonicalPreferred(String placeId) async {
    final attempt = await _tryCanonical(placeId);
    if (attempt.result != null) return attempt.result;

    final legacyResult = await legacy.readPlace(placeId);
    if (legacyResult == null) return null;
    return PlaceReadResult(
      placeId: legacyResult.placeId,
      view: legacyResult.view,
      source: PlaceReadSource.legacy,
      fellBackToLegacy: true,
      fallbackReason: attempt.reason,
    );
  }

  // --- Canonical sahaja (ujian) -------------------------------------------

  Future<PlaceReadResult?> _canonicalOnly(String placeId) async {
    final attempt = await _tryCanonical(placeId);
    return attempt.result;
  }

  Future<({PlaceReadResult? result, PlaceReadFallbackReason reason})>
      _tryCanonical(String placeId) async {
    final resolution = aliasResolver.resolve(placeId);
    switch (resolution.status) {
      case AliasResolutionStatus.notFound:
        return (result: null, reason: PlaceReadFallbackReason.aliasNotFound);
      case AliasResolutionStatus.circular:
        return (result: null, reason: PlaceReadFallbackReason.aliasCircular);
      case AliasResolutionStatus.resolved:
        break;
    }

    final canonicalId = resolution.canonicalPlaceId!;
    if (canonical.isBlocked(canonicalId)) {
      return (result: null, reason: PlaceReadFallbackReason.canonicalBlocked);
    }

    try {
      final result = await canonical.readPlace(canonicalId).timeout(canonicalTimeout);
      if (result == null) {
        return (result: null, reason: PlaceReadFallbackReason.canonicalMissing);
      }
      // ID stabil yang diminta dikekalkan — pemanggil tidak pernah melihat
      // ID bertukar di bawahnya.
      return (
        result: PlaceReadResult(
          placeId: placeId,
          view: result.view,
          source: PlaceReadSource.canonicalStub,
          canonicalPlaceId: canonicalId,
        ),
        reason: PlaceReadFallbackReason.canonicalMissing,
      );
    } on TimeoutException {
      return (result: null, reason: PlaceReadFallbackReason.canonicalTimeout);
    } catch (_) {
      return (result: null, reason: PlaceReadFallbackReason.canonicalError);
    }
  }
}
