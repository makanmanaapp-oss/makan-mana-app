/// PART 1 Phase 1.12 Part L — perbandingan bacaan bayangan sisi klien.
///
/// Cermin `shadowRead.ts` backend. Membandingkan KEADAAN, bukan nilai mentah:
/// "tidak diketahui" lawan "tidak diketahui" ialah padanan; "tidak diketahui"
/// lawan nilai sebenar ialah ketidakpadanan.
///
/// Tulen dan tanpa I/O. Tiada data pengguna dilog.
library;

const String kComparisonVersion = '1.12.0';

/// Toleransi koordinat: ~11 m. Lebih daripada ini bermakna kedai lain.
const double kCoordinateToleranceDegrees = 0.0001;

enum ComparisonSeverity { match, info, warning, critical }

enum ComparedField {
  title,
  address,
  coordinates,
  ratingState,
  reviewCountState,
  priceState,
  hoursState,
  businessState,
  imageState,
  halalState,
  tagIds,
}

/// Medan yang ketidakpadanannya bermakna pengguna melihat kedai berbeza atau
/// maklumat keselamatan berbeza.
const Set<ComparedField> kCriticalFields = {
  ComparedField.title,
  ComparedField.coordinates,
  ComparedField.businessState,
  ComparedField.halalState,
};

/// Paparan ringkas tempat daripada mana-mana sumber.
class ComparablePlaceView {
  const ComparablePlaceView({
    required this.placeId,
    required this.title,
    this.address,
    this.lat,
    this.lng,
    this.ratingState = 'rating_hidden',
    this.reviewCountState = 'count_hidden',
    this.priceState = 'price_unknown',
    this.hoursState = 'hours_unknown',
    this.businessState = 'status_unknown',
    this.imageState = 'image_absent',
    this.halalState = 'halal_unknown',
    this.tagIds = const [],
  });

  final String placeId;
  final String title;
  final String? address;
  final double? lat;
  final double? lng;
  final String ratingState;
  final String reviewCountState;
  final String priceState;
  final String hoursState;
  final String businessState;
  final String imageState;
  final String halalState;
  final List<String> tagIds;
}

class FieldComparison {
  const FieldComparison({
    required this.field,
    required this.legacyValue,
    required this.canonicalValue,
    required this.match,
    required this.severity,
  });

  final ComparedField field;
  final String legacyValue;
  final String canonicalValue;
  final bool match;
  final ComparisonSeverity severity;
}

class PlaceReadComparison {
  const PlaceReadComparison({
    required this.placeId,
    required this.legacySource,
    required this.canonicalSource,
    required this.identityMatch,
    required this.fieldComparisons,
    required this.severity,
    this.missingLegacyFields = const [],
    this.missingCanonicalFields = const [],
    this.warnings = const [],
    this.comparisonVersion = kComparisonVersion,
  });

  final String placeId;
  final String legacySource;
  final String canonicalSource;
  final bool identityMatch;
  final List<FieldComparison> fieldComparisons;
  final List<ComparedField> missingLegacyFields;
  final List<ComparedField> missingCanonicalFields;
  final List<String> warnings;
  final ComparisonSeverity severity;
  final String comparisonVersion;

  List<FieldComparison> get mismatches =>
      fieldComparisons.where((f) => !f.match).toList();
}

String _coordinateLabel(double? lat, double? lng) {
  if (lat == null || lng == null) return 'unknown';
  return '${lat.toStringAsFixed(5)},${lng.toStringAsFixed(5)}';
}

bool _coordinatesMatch(ComparablePlaceView a, ComparablePlaceView b) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
    // Kedua-duanya tidak diketahui = padan; satu diketahui = tidak padan.
    return a.lat == b.lat && a.lng == b.lng;
  }
  return (a.lat! - b.lat!).abs() <= kCoordinateToleranceDegrees &&
      (a.lng! - b.lng!).abs() <= kCoordinateToleranceDegrees;
}

ComparisonSeverity _severityFor(ComparedField field, bool match) {
  if (match) return ComparisonSeverity.match;
  return kCriticalFields.contains(field)
      ? ComparisonSeverity.critical
      : ComparisonSeverity.warning;
}

FieldComparison _compare(ComparedField field, String legacy, String canonical) {
  final match = legacy == canonical;
  return FieldComparison(
    field: field,
    legacyValue: legacy,
    canonicalValue: canonical,
    match: match,
    severity: _severityFor(field, match),
  );
}

/// Bandingkan dua paparan.
PlaceReadComparison comparePlaceReads(
  ComparablePlaceView legacy,
  ComparablePlaceView canonical, {
  required String legacySource,
  required String canonicalSource,
}) {
  final coordsMatch = _coordinatesMatch(legacy, canonical);
  final comparisons = <FieldComparison>[
    _compare(ComparedField.title, legacy.title, canonical.title),
    _compare(ComparedField.address, legacy.address ?? 'unknown',
        canonical.address ?? 'unknown'),
    FieldComparison(
      field: ComparedField.coordinates,
      legacyValue: _coordinateLabel(legacy.lat, legacy.lng),
      canonicalValue: _coordinateLabel(canonical.lat, canonical.lng),
      match: coordsMatch,
      severity: _severityFor(ComparedField.coordinates, coordsMatch),
    ),
    _compare(ComparedField.ratingState, legacy.ratingState, canonical.ratingState),
    _compare(ComparedField.reviewCountState, legacy.reviewCountState,
        canonical.reviewCountState),
    _compare(ComparedField.priceState, legacy.priceState, canonical.priceState),
    _compare(ComparedField.hoursState, legacy.hoursState, canonical.hoursState),
    _compare(
        ComparedField.businessState, legacy.businessState, canonical.businessState),
    _compare(ComparedField.imageState, legacy.imageState, canonical.imageState),
    _compare(ComparedField.halalState, legacy.halalState, canonical.halalState),
    _compare(
      ComparedField.tagIds,
      (List<String>.from(legacy.tagIds)..sort()).join(','),
      (List<String>.from(canonical.tagIds)..sort()).join(','),
    ),
  ];

  final warnings = <String>[];
  if (legacy.placeId != canonical.placeId) {
    warnings.add('place_id_differs_alias_resolution_required');
  }

  final severity = comparisons.any((c) => c.severity == ComparisonSeverity.critical)
      ? ComparisonSeverity.critical
      : comparisons.any((c) => c.severity == ComparisonSeverity.warning)
          ? ComparisonSeverity.warning
          : warnings.isNotEmpty
              ? ComparisonSeverity.info
              : ComparisonSeverity.match;

  return PlaceReadComparison(
    placeId: legacy.placeId,
    legacySource: legacySource,
    canonicalSource: canonicalSource,
    identityMatch: comparisons
            .firstWhere((c) => c.field == ComparedField.title)
            .match &&
        coordsMatch,
    fieldComparisons: comparisons,
    missingLegacyFields: comparisons
        .where((c) => c.legacyValue == 'unknown' || c.legacyValue.isEmpty)
        .map((c) => c.field)
        .toList(),
    missingCanonicalFields: comparisons
        .where((c) => c.canonicalValue == 'unknown' || c.canonicalValue.isEmpty)
        .map((c) => c.field)
        .toList(),
    warnings: warnings,
    severity: severity,
  );
}

/// Ringkasan agregat untuk papan pemuka QA.
class ShadowComparisonSummary {
  const ShadowComparisonSummary({
    required this.totalCompared,
    required this.identityMatches,
    required this.mismatches,
    required this.criticalMismatches,
    required this.mismatchesByField,
  });

  final int totalCompared;
  final int identityMatches;
  final int mismatches;
  final int criticalMismatches;
  final Map<ComparedField, int> mismatchesByField;
}

ShadowComparisonSummary summarizeComparisons(
  List<PlaceReadComparison> comparisons,
) {
  final byField = <ComparedField, int>{};
  var mismatches = 0;
  var critical = 0;

  for (final comparison in comparisons) {
    var hasMismatch = false;
    for (final field in comparison.fieldComparisons) {
      if (field.match) continue;
      hasMismatch = true;
      byField[field.field] = (byField[field.field] ?? 0) + 1;
      if (field.severity == ComparisonSeverity.critical) critical++;
    }
    if (hasMismatch) mismatches++;
  }

  return ShadowComparisonSummary(
    totalCompared: comparisons.length,
    identityMatches: comparisons.where((c) => c.identityMatch).length,
    mismatches: mismatches,
    criticalMismatches: critical,
    mismatchesByField: byField,
  );
}
