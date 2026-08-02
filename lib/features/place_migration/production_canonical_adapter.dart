/// PART 1 Phase 1.14E — penyesuai BACA kanonikal PRODUKSI.
///
/// Menyediakan bacaan kanonikal produksi sebenar (place_registry →
/// place_publication_heads → place_publications) HANYA untuk kohort pemilik/
/// penguji dalaman, dengan jatuh-balik legasi SERTA-MERTA. Ia:
/// - TIDAK PERNAH menulis;
/// - TIDAK PERNAH mereka nilai tidak diketahui (keadaan diserahkan apa adanya);
/// - TIDAK PERNAH menggunakan places_cache sebagai kebenaran satu-tempat;
/// - TIDAK PERNAH menyekat bacaan legasi kerana kanonikal tiada;
/// - mengekalkan placeId yang diminta (pemanggil tidak nampak ID bertukar);
/// - menghormati emergencyLegacyOverride yang mengatasi segala mod lain.
///
/// Tiada mod kanonikal awam/global dalam fasa ini.
library;

import 'dart:async';

import 'alias_resolution.dart';
import 'place_read_repository.dart' show PlaceReadFallbackReason;
import 'read_comparison.dart';

/// Mod bacaan produksi untuk fasa ini (kohort dalaman sahaja).
enum ProductionReadMode {
  legacyOnly,
  shadowRead,
  canonicalForInternalCohort,
  emergencyLegacyOverride,
}

enum ProductionReadSource { canonical, legacy }

/// Keupayaan baca kanonikal — lalai SELAMAT (semua OFF/legacyOnly).
class CanonicalReadCapability {
  const CanonicalReadCapability({
    this.productionCanonicalReadAllowed = false,
    this.canonicalAdapterAvailable = false,
    this.emergencyLegacyOverride = false,
  });

  final bool productionCanonicalReadAllowed;
  final bool canonicalAdapterAvailable;

  /// Menang ke atas setiap mod lain apabila benar.
  final bool emergencyLegacyOverride;

  bool get canonicalReadable =>
      productionCanonicalReadAllowed &&
      canonicalAdapterAvailable &&
      !emergencyLegacyOverride;
}

/// Gerbang kohort: hanya UID pemilik/penguji dalaman menerima kanonikal.
class CanonicalCohortGate {
  const CanonicalCohortGate(this._internalUids);
  final Set<String> _internalUids;
  bool isMember(String? uid) => uid != null && _internalUids.contains(uid);
}

/// Sumber kanonikal produksi (disuntik; impl Firestore nipis di luar unit test).
abstract class ProductionCanonicalSource {
  /// Baca penerbitan aktif untuk ID kanonikal. `null` bila tiada/tak sah.
  Future<ComparablePlaceView?> readActivePublication(String canonicalPlaceId);

  /// Adakah kanonikal ini disekat (jangan sajikan; jatuh balik legasi).
  bool isBlocked(String canonicalPlaceId);
}

/// Sumber kanonikal dalam-memori untuk ujian.
class InMemoryCanonicalSource implements ProductionCanonicalSource {
  InMemoryCanonicalSource({
    Map<String, ComparablePlaceView>? records,
    Set<String>? blocked,
    this.latency = Duration.zero,
    this.failNextRead = false,
  })  : _records = records ?? <String, ComparablePlaceView>{},
        _blocked = blocked ?? <String>{};

  final Map<String, ComparablePlaceView> _records;
  final Set<String> _blocked;
  Duration latency;
  bool failNextRead;

  void seed(String id, ComparablePlaceView v) => _records[id] = v;
  void block(String id) => _blocked.add(id);

  @override
  bool isBlocked(String canonicalPlaceId) => _blocked.contains(canonicalPlaceId);

  @override
  Future<ComparablePlaceView?> readActivePublication(String canonicalPlaceId) async {
    if (latency > Duration.zero) await Future<void>.delayed(latency);
    if (failNextRead) {
      failNextRead = false;
      throw StateError('canonical_source_failure');
    }
    return _records[canonicalPlaceId];
  }
}

/// Hasil bacaan penyesuai produksi.
class ProductionReadOutcome {
  const ProductionReadOutcome({
    required this.placeId,
    required this.view,
    required this.source,
    this.canonicalPlaceId,
    this.fellBackToLegacy = false,
    this.fallbackReason,
  });

  final String placeId;
  final ComparablePlaceView view;
  final ProductionReadSource source;
  final String? canonicalPlaceId;
  final bool fellBackToLegacy;
  final PlaceReadFallbackReason? fallbackReason;
}

/// Had masa bacaan kanonikal produksi.
const Duration kProductionCanonicalTimeout = Duration(milliseconds: 800);

/// Penyesuai baca kanonikal produksi.
class ProductionCanonicalReadAdapter {
  ProductionCanonicalReadAdapter({
    required this.legacyLookup,
    required this.canonicalSource,
    required this.aliasResolver,
    required this.capability,
    required this.cohortGate,
    this.mode = ProductionReadMode.legacyOnly,
    this.timeout = kProductionCanonicalTimeout,
  });

  /// Carian legasi (disuntik). SENTIASA tersedia — laluan produksi.
  final Future<ComparablePlaceView?> Function(String placeId) legacyLookup;
  final ProductionCanonicalSource canonicalSource;
  final AliasResolver aliasResolver;
  final CanonicalReadCapability capability;
  final CanonicalCohortGate cohortGate;
  final ProductionReadMode mode;
  final Duration timeout;

  /// Adakah kanonikal patut disajikan kepada [uid] ini sekarang?
  bool _canonicalEligible(String? uid) {
    if (capability.emergencyLegacyOverride) return false;
    if (mode == ProductionReadMode.legacyOnly) return false;
    if (mode == ProductionReadMode.emergencyLegacyOverride) return false;
    if (!capability.canonicalReadable) return false;
    if (mode != ProductionReadMode.canonicalForInternalCohort) return false;
    return cohortGate.isMember(uid);
  }

  Future<ProductionReadOutcome?> read(String placeId, {required String? uid}) async {
    // Legasi sentiasa laluan asas.
    Future<ProductionReadOutcome?> legacy(PlaceReadFallbackReason? reason) async {
      final v = await legacyLookup(placeId);
      if (v == null) return null;
      return ProductionReadOutcome(
        placeId: placeId,
        view: v,
        source: ProductionReadSource.legacy,
        fellBackToLegacy: reason != null,
        fallbackReason: reason,
      );
    }

    if (capability.emergencyLegacyOverride ||
        mode == ProductionReadMode.emergencyLegacyOverride) {
      return legacy(PlaceReadFallbackReason.modeIsLegacyOnly);
    }
    if (!_canonicalEligible(uid)) {
      return legacy(PlaceReadFallbackReason.modeIsLegacyOnly);
    }

    // Selesaikan alias → kanonikal.
    final resolution = aliasResolver.resolve(placeId);
    switch (resolution.status) {
      case AliasResolutionStatus.notFound:
        return legacy(PlaceReadFallbackReason.aliasNotFound);
      case AliasResolutionStatus.circular:
        return legacy(PlaceReadFallbackReason.aliasCircular);
      case AliasResolutionStatus.resolved:
        break;
    }
    final canonicalId = resolution.canonicalPlaceId!;
    if (canonicalSource.isBlocked(canonicalId)) {
      return legacy(PlaceReadFallbackReason.canonicalBlocked);
    }

    try {
      final view =
          await canonicalSource.readActivePublication(canonicalId).timeout(timeout);
      if (view == null) {
        return legacy(PlaceReadFallbackReason.canonicalMissing);
      }
      // Kanonikal sah → sajikan, kekalkan placeId yang diminta.
      return ProductionReadOutcome(
        placeId: placeId,
        view: view,
        source: ProductionReadSource.canonical,
        canonicalPlaceId: canonicalId,
      );
    } on TimeoutException {
      return legacy(PlaceReadFallbackReason.canonicalTimeout);
    } catch (_) {
      return legacy(PlaceReadFallbackReason.canonicalError);
    }
  }
}
