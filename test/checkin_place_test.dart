import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/social/checkin_place.dart';

void main() {
  group('CheckinPlace', () {
    test('manual place never claims verification', () {
      final place = CheckinPlace.manual('  Warung Pagi  ', areaLabel: '  PJ ');
      expect(place.name, 'Warung Pagi');
      expect(place.areaLabel, 'PJ');
      expect(place.provider, 'manual');
      expect(place.verified, isFalse);
      expect(place.isManual, isTrue);
      expect(place.placeId, isNull);
      expect(place.providerPlaceId, isNull);
    });

    test('maps a verified shared-place response', () {
      final place = CheckinPlace.fromMap({
        'placeId': 'mm_123',
        'providerPlaceId': 'google_123',
        'provider': 'makanmana',
        'name': 'Kedai Uji',
        'areaLabel': 'Shah Alam',
        'address': 'Seksyen 7, Shah Alam',
        'lat': 3.073,
        'lng': 101.519,
        'source': 'makanmana_shared',
        'verified': true,
      });
      expect(place.placeId, 'mm_123');
      expect(place.providerPlaceId, 'google_123');
      expect(place.verified, isTrue);
      expect(place.lat, closeTo(3.073, 0.0001));
      expect(place.lng, closeTo(101.519, 0.0001));
    });

    test('missing server fields get safe defaults', () {
      final place = CheckinPlace.fromMap({'name': 'Kedai'});
      expect(place.provider, 'google');
      expect(place.source, 'google_places');
      expect(place.verified, isFalse);
      expect(place.areaLabel, isEmpty);
      expect(place.lat, isNull);
    });

    test('wire payload retains identifiers for server re-resolution', () {
      final place = CheckinPlace.fromMap({
        'placeId': 'mm_a',
        'providerPlaceId': 'google_a',
        'provider': 'makanmana',
        'name': 'Kedai A',
        'verified': true,
      });
      final wire = place.toWire();
      expect(wire['placeId'], 'mm_a');
      expect(wire['providerPlaceId'], 'google_a');
      expect(wire['verified'], isTrue);
      expect(wire['isManual'], isFalse);
    });

    test('manual wire payload is explicitly isolated from global IDs', () {
      final wire = CheckinPlace.manual('Gerai Jalanan').toWire();
      expect(wire['provider'], 'manual');
      expect(wire['source'], 'manual');
      expect(wire['isManual'], isTrue);
      expect(wire['placeId'], isNull);
      expect(wire['providerPlaceId'], isNull);
    });
  });
}
