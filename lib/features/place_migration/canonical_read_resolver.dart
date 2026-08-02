/// PART 1 Phase 1.14F-R — penyelesai sumber baca kanonikal (TULEN).
///
/// Menentukan sama ada satu tempat disajikan melalui laluan KANONIKAL atau
/// LEGASI untuk pengguna semasa. Kekangan keselamatan: koleksi kanonikal
/// (place_registry/place_publications/aliases) ialah SERVER-ONLY (rules), jadi
/// klien TIDAK boleh membacanya terus. Namun klien BOLEH membaca `place_details`
/// yang membawa penanda provenans yang ditulis-pelayan `locationSource ==
/// 'google_places_details'` untuk 25 rekod yang dimigrasi (dari enrichment
/// 1.14C.1). Penanda itu mengenal pasti kohort kanonikal dengan selamat di klien.
///
/// Peraturan:
///   - emergencyLegacyOverride menang → legasi.
///   - bukan kohort / mod legacyOnly → legasi.
///   - kohort + tempat diperkaya (penanda hadir) → kanonikal.
///   - selainnya → legasi (fallback jujur).
library;

/// Penanda provenans yang ditulis-pelayan pada place_details untuk kohort migrasi.
const String kCanonicalEnrichmentMarker = 'google_places_details';

enum CardReadSource { canonical, legacy }

class CanonicalSourceDecision {
  const CanonicalSourceDecision({
    required this.source,
    required this.reason,
  });
  final CardReadSource source;
  final String reason;

  bool get isCanonical => source == CardReadSource.canonical;
}

/// Adakah dokumen place_details ini membawa penanda enrichment kanonikal?
bool placeIsCanonicalEnriched(Map<String, dynamic>? placeDetails) {
  if (placeDetails == null) return false;
  final loc = placeDetails['locationSource'];
  final hasCoords = placeDetails['location'] is Map &&
      (placeDetails['location'] as Map)['latitude'] is num &&
      (placeDetails['location'] as Map)['longitude'] is num;
  return loc == kCanonicalEnrichmentMarker && hasCoords;
}

/// Keputusan sumber TULEN.
CanonicalSourceDecision resolveCanonicalSource({
  required bool cohortActive,
  required bool canonicalCardsOrDetailEnabled,
  required bool emergencyLegacyOverride,
  required bool placeIsEnriched,
}) {
  if (emergencyLegacyOverride) {
    return const CanonicalSourceDecision(
      source: CardReadSource.legacy,
      reason: 'emergency_legacy_override',
    );
  }
  if (!cohortActive) {
    return const CanonicalSourceDecision(
      source: CardReadSource.legacy,
      reason: 'not_internal_cohort',
    );
  }
  if (!canonicalCardsOrDetailEnabled) {
    return const CanonicalSourceDecision(
      source: CardReadSource.legacy,
      reason: 'canonical_flags_off',
    );
  }
  if (!placeIsEnriched) {
    return const CanonicalSourceDecision(
      source: CardReadSource.legacy,
      reason: 'place_not_migrated_legacy_fallback',
    );
  }
  return const CanonicalSourceDecision(
    source: CardReadSource.canonical,
    reason: 'cohort_canonical_enriched',
  );
}
