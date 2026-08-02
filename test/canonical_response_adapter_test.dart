import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/models/place_summary.dart';

/// PART 1 Phase 1.14G — ujian adapter respons kanonikal (Flutter side, Part F/G).

Map<String, dynamic> base({String? dataSource, String? canonicalId}) => {
      'placeId': 'ChIJprovider0001',
      'name': 'Nasi Kandar',
      'cuisine': 'Restoran',
      'emoji': '🍛',
      'rating': 4.3,
      'userRatingCount': 120,
      'priceLevel': 2,
      'distanceKm': 1.1,
      'isOpen': true,
      'address': 'Jalan Ampang, KL',
      'matchScore': 82,
      'matchReasonKeys': ['withinBudget'],
      if (dataSource != null) 'dataSource': dataSource,
      if (canonicalId != null) 'canonicalPlaceId': canonicalId,
    };

void main() {
  test('canonical response → dataSource canonical + canonicalPlaceId parsed', () {
    final p = PlaceSummary.fromMap(base(dataSource: 'canonical', canonicalId: 'PLC-abc123def456'));
    expect(p.dataSource, 'canonical');
    expect(p.isCanonicalData, true);
    expect(p.canonicalPlaceId, 'PLC-abc123def456');
    expect(p.placeId, 'ChIJprovider0001'); // stable routing id preserved
  });

  test('legacy response → dataSource legacy, not canonical', () {
    final p = PlaceSummary.fromMap(base(dataSource: 'legacy'));
    expect(p.dataSource, 'legacy');
    expect(p.isCanonicalData, false);
  });

  test('public response (no dataSource field) → null, not canonical, no break', () {
    final p = PlaceSummary.fromMap(base());
    expect(p.dataSource, isNull);
    expect(p.isCanonicalData, false);
    expect(p.canonicalPlaceId, isNull);
    expect(p.name, 'Nasi Kandar');
  });

  test('copyWithSource preserves dataSource + canonicalPlaceId (identity stable)', () {
    final p = PlaceSummary.fromMap(base(dataSource: 'canonical', canonicalId: 'PLC-xyz'))
        .copyWithSource('offline_fallback');
    expect(p.source, 'offline_fallback');
    expect(p.dataSource, 'canonical');
    expect(p.canonicalPlaceId, 'PLC-xyz');
    expect(p.placeId, 'ChIJprovider0001');
  });
}
