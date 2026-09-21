/// The canonical detail page must not assert an opening status it cannot know.
///
/// FOUND ON A REAL DEVICE while testing the featured-shop CTA. The page showed
/// a red "Tutup" pill and, three lines below it, "Waktu operasi belum
/// disahkan" — it asserted the restaurant was CLOSED and admitted in the same
/// view that it had no evidence for that.
///
/// The cause was in the adapter: `p.isOpen ? hoursUnknown : closedNow`, which
/// is backwards twice. An OPEN place reported "hours unknown", and a place with
/// no hours data at all reported CLOSED. `availabilityDisplay` — the documented
/// single source of UI truth — was never consulted.
///
/// These tests pin the mapping directly, because the bug was invisible to every
/// existing test: the adapter compiled, rendered and looked entirely plausible.
library;

import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/features/place_cards/place_card_view_model.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_adapter.dart';
import 'package:makan_mana/models/place_summary.dart';

PlaceSummary _place({
  bool isOpen = false,
  List<String> negativeSignals = const [],
}) =>
    PlaceSummary(
      placeId: 'p1',
      name: 'Kedai Ujian',
      cuisine: '',
      emoji: '',
      rating: 0,
      userRatingCount: 0,
      priceLevel: 0,
      distanceKm: 0,
      isOpen: isOpen,
      address: '',
      matchScore: 0,
      matchReasonKeys: const [],
      negativeSignals: negativeSignals,
    );

CardHoursState _state(PlaceSummary p) =>
    restaurantDetailFromSummary(p).hours.model.state;

void main() {
  test('unverified hours are UNKNOWN, never closed', () {
    // The regression: this returned `closedNow`, so every featured shop — none
    // of which carries opening hours — was announced as shut.
    expect(
      _state(_place(negativeSignals: const ['hours_unverified'])),
      CardHoursState.hoursUnknown,
    );
    // And an unverified place must not be called open either, whatever the
    // stale `isOpen` flag happens to say.
    expect(
      _state(_place(isOpen: true, negativeSignals: const ['hours_unverified'])),
      CardHoursState.hoursUnknown,
    );
  });

  test('legacy isOpen is STILL not trusted to claim open — unchanged', () {
    // This is an existing, deliberate decision: `isOpen` comes from a cached
    // provider snapshot, so it is downgraded rather than announced. The fix
    // above deliberately does not touch it — the bug was the closed direction,
    // and widening the change would have overridden a choice nobody asked me
    // to revisit. Pinned here so the narrowness is intentional, not accidental.
    expect(_state(_place(isOpen: true)), CardHoursState.hoursUnknown);
  });

  test('a verified closed place still says closed', () {
    // The honest case must survive the fix: this is a real fact when hours
    // were verified, and hiding it would be the opposite error.
    expect(_state(_place(isOpen: false)), CardHoursState.closedNow);
  });

  test('this page never claims a restaurant is open', () {
    // Neither branch can produce `openNow`, so the contradiction that started
    // this — a status pill disagreeing with the hours line under it — cannot
    // reappear from either direction.
    for (final p in [
      _place(isOpen: true, negativeSignals: const ['hours_unverified']),
      _place(negativeSignals: const ['hours_unverified']),
      _place(isOpen: true),
      _place(),
    ]) {
      expect(_state(p), isNot(CardHoursState.openNow));
    }
  });
}
