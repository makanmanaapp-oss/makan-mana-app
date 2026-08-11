import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/core/mood/availability_label.dart';
import 'package:makan_mana/core/mood/mood_formula.dart';
import 'package:makan_mana/models/place_summary.dart';

/// Phase 2.3C — explainability consistency: status buka berasas bukti + sebab
/// Supper berpada. Tiada perubahan skor/ranking.

PlaceSummary p({
  String cuisine = 'restoran',
  bool isOpen = true,
  List<String> negatives = const [],
}) =>
    PlaceSummary(
      placeId: 'x', name: 'X', cuisine: cuisine, emoji: '🍽️',
      rating: 4.2, userRatingCount: 200, priceLevel: 2, distanceKm: 1.0,
      isOpen: isOpen, address: 'a', matchScore: 80, matchReasonKeys: const [],
      negativeSignals: negatives, priceEstimate: 'RM10 - RM20',
    );

void main() {
  group('availability status (evidence-based)', () {
    test('D1: unknown hours never generate open_now', () {
      final place = p(isOpen: true, negatives: ['hours_unverified']);
      expect(availabilityDisplay(place), AvailabilityDisplay.hoursNotVerified);
      expect(availabilityLabelKey(place), 'openStatusUnknown');
      expect(showsOpenNow(place), isFalse);
    });

    test('D2: stale/unverified hours never generate open_now even if isOpen', () {
      // 'hours_unverified' mewakili data hilang/basi → tidak boleh "Open now".
      final place = p(isOpen: true, negatives: ['hours_unverified', 'price_estimated']);
      expect(showsOpenNow(place), isFalse);
    });

    test('D3: confirmed-open verified hours generate open_now', () {
      final place = p(isOpen: true, negatives: ['allergy_data_unknown']);
      expect(availabilityDisplay(place), AvailabilityDisplay.openNow);
      expect(availabilityLabelKey(place), 'openNow');
      expect(showsOpenNow(place), isTrue);
    });

    test('D3b: verified but closed → closedNow', () {
      final place = p(isOpen: false, negatives: const []);
      expect(availabilityLabelKey(place), 'closedNow');
      expect(showsOpenNow(place), isFalse);
    });

    test('D4: open_now and hours_unverified cannot coexist', () {
      // Untuk sebarang tempat: jika papar open_now → tiada hours_unverified.
      for (final open in [true, false]) {
        for (final neg in [<String>[], ['hours_unverified']]) {
          final place = p(isOpen: open, negatives: neg);
          if (showsOpenNow(place)) {
            expect(place.negativeSignals.contains('hours_unverified'), isFalse);
          }
        }
      }
    });
  });

  group('Supper reason (bounded unless evidence)', () {
    test('D5: Supper without supper-tag uses bounded wording', () {
      final r = moodReasonKeys('moodSupper', p(cuisine: 'western', isOpen: true));
      expect(r, contains('reasonSupperBounded'));
      expect(r, isNot(contains('reasonSupper')));
    });

    test('D6: Supper with supper-tag + verified open uses stronger reason', () {
      final r = moodReasonKeys('moodSupper', p(cuisine: 'mamak', isOpen: true));
      expect(r, contains('reasonSupper'));
    });

    test('D7: Supper with supper-tag but unverified hours stays bounded', () {
      final r = moodReasonKeys('moodSupper',
          p(cuisine: 'mamak', isOpen: true, negatives: ['hours_unverified']));
      expect(r, contains('reasonSupperBounded'));
      expect(r, isNot(contains('reasonSupper')));
    });

    test('D7b: Supper closed → bounded (no current-suitability claim)', () {
      final r = moodReasonKeys('moodSupper', p(cuisine: 'mamak', isOpen: false));
      expect(r, contains('reasonSupperBounded'));
    });
  });

  group('Pedas reason (evidence-gated, unchanged)', () {
    test('C: spicy cuisine keeps reasonSpicy', () {
      final r = moodReasonKeys('moodPedas', p(cuisine: 'thai', isOpen: true));
      expect(r, contains('reasonSpicy'));
    });
    test('C: non-spicy cuisine does not claim spicy', () {
      final r = moodReasonKeys('moodPedas', p(cuisine: 'bakery', isOpen: true));
      expect(r, isNot(contains('reasonSpicy')));
    });
  });

  test('D8: ranking order unchanged (applyMoodRanking still deterministic)', () {
    // 2.3C hanya ubah teks sebab + label status, BUKAN skor/ranking.
    PlaceSummary mk(String id, String cuisine, double dist, int ms) =>
        PlaceSummary(
          placeId: id, name: id, cuisine: cuisine, emoji: '🍽️', rating: 4.3,
          userRatingCount: 300, priceLevel: 2, distanceKm: dist, isOpen: true,
          address: 'a', matchScore: ms, matchReasonKeys: const [],
        );
    final ranked = applyMoodRanking(
      [mk('a', 'mamak', 0.5, 90), mk('b', 'western', 4.0, 60)],
      moodId: 'moodSupper', radiusKm: 15,
    );
    // Susunan sama seperti sebelum 2.3C (dekat + tag-supper dahulu).
    expect(ranked.first.placeId, 'a');
  });
}
