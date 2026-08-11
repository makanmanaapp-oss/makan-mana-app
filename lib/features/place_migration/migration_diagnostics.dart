/// PART 1 Phase 1.12 Part P — diagnostik QA (DEBUG/UJIAN SAHAJA).
///
/// Diagnostik TIDAK PERNAH dipaparkan dalam UI keluaran. [MigrationDiagnostics]
/// mengembalikan `null` snapshot apabila diagnostik dimatikan atau apabila
/// berjalan dalam mod keluaran, jadi tiada widget boleh merendernya secara
/// tidak sengaja.
///
/// Ia juga TIDAK PERNAH merekod data pengguna: tiada UID, tiada nama paparan,
/// tiada koordinat pengguna — hanya identiti tempat dan keputusan penghalaan.
library;

import 'package:flutter/foundation.dart';

import 'place_migration_flags.dart';
import 'place_read_repository.dart';
import 'read_comparison.dart';

/// Satu petikan keadaan bacaan untuk QA.
class MigrationDiagnosticsSnapshot {
  const MigrationDiagnosticsSnapshot({
    required this.readMode,
    required this.sourceUsed,
    required this.aliasResolution,
    required this.shadowMismatchCount,
    this.legacyFallbackReason,
    this.migrationPlanId,
    this.canonicalPublicationVersion,
    this.legacyPlaceId,
    this.canonicalPlaceId,
  });

  final PlaceReadMode readMode;
  final PlaceReadSource sourceUsed;
  final String aliasResolution;
  final int shadowMismatchCount;
  final PlaceReadFallbackReason? legacyFallbackReason;
  final String? migrationPlanId;
  final int? canonicalPublicationVersion;
  final String? legacyPlaceId;
  final String? canonicalPlaceId;

  /// Baris yang boleh dibaca manusia untuk overlay QA.
  List<({String label, String value})> get rows => [
        (label: 'Read mode', value: readMode.name),
        (label: 'Source used', value: sourceUsed.name),
        (label: 'Alias resolution', value: aliasResolution),
        (
          label: 'Legacy fallback',
          value: legacyFallbackReason?.name ?? 'none',
        ),
        (label: 'Shadow mismatches', value: '$shadowMismatchCount'),
        (label: 'Migration plan', value: migrationPlanId ?? 'none'),
        (
          label: 'Canonical version',
          value: canonicalPublicationVersion?.toString() ?? 'none',
        ),
        (label: 'Legacy place ID', value: legacyPlaceId ?? 'none'),
        (label: 'Canonical place ID', value: canonicalPlaceId ?? 'none'),
      ];
}

/// Pengumpul diagnostik. Mati secara lalai.
class MigrationDiagnostics {
  MigrationDiagnostics._();

  static final List<PlaceReadComparison> _comparisons = <PlaceReadComparison>[];
  static String? _migrationPlanId;

  /// Rekod perbandingan bayangan. Tiada operasi apabila diagnostik dimatikan.
  static void recordComparison(PlaceReadComparison comparison) {
    if (!_enabled) return;
    _comparisons.add(comparison);
  }

  static void setMigrationPlanId(String? planId) {
    if (!_enabled) return;
    _migrationPlanId = planId;
  }

  static void reset() {
    _comparisons.clear();
    _migrationPlanId = null;
  }

  static List<PlaceReadComparison> get comparisons =>
      List.unmodifiable(_comparisons);

  static ShadowComparisonSummary get summary =>
      summarizeComparisons(_comparisons);

  /// Diagnostik hidup HANYA apabila flag dihidupkan DAN kita bukan dalam
  /// binaan keluaran. Kedua-dua syarat diperlukan.
  static bool get _enabled =>
      !kReleaseMode && PlaceMigrationFeatureFlags.migrationDiagnosticsEnabled;

  /// Petikan semasa, atau `null` apabila diagnostik tidak sepatutnya dilihat.
  ///
  /// Widget mesti memeriksa `null` dan tidak merender apa-apa — inilah pagar
  /// yang menghalang diagnostik daripada bocor ke dalam keluaran.
  static MigrationDiagnosticsSnapshot? snapshotFor(PlaceReadResult? result) {
    if (!_enabled) return null;
    return MigrationDiagnosticsSnapshot(
      readMode: PlaceMigrationFeatureFlags.canonicalPlaceReadMode,
      sourceUsed: result?.source ?? PlaceReadSource.none,
      aliasResolution: result?.canonicalPlaceId == null ? 'not_resolved' : 'resolved',
      shadowMismatchCount: summary.mismatches,
      legacyFallbackReason: result?.fallbackReason,
      migrationPlanId: _migrationPlanId,
      legacyPlaceId: result?.placeId,
      canonicalPlaceId: result?.canonicalPlaceId,
    );
  }

  /// Timpaan ujian sahaja bagi `kReleaseMode` tidak mungkin, jadi ujian
  /// keluaran menggunakan kaedah ini untuk menyoal peraturan secara langsung.
  @visibleForTesting
  static bool wouldBeVisible({required bool releaseMode, required bool flagOn}) =>
      !releaseMode && flagOn;
}
