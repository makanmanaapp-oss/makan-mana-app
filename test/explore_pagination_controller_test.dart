import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/services/cloud_suggestion_service.dart';
import 'package:makan_mana/features/explore/explore_pagination_controller.dart';
import 'package:makan_mana/models/place_summary.dart';

/// Phase 2.2A — ujian kawalan pagination Explore.

PlaceSummary p(String id) => PlaceSummary(
      placeId: id, name: id, cuisine: 'cafe', emoji: '🍽️',
      rating: 4.0, userRatingCount: 10, priceLevel: 2, distanceKm: 1,
      isOpen: true, address: 'x', matchScore: 50, matchReasonKeys: const [],
    );

/// Fake: page 1 = p0..p11 (cursor→12), page 2 = p12..p19 (end). p11 repeats on
/// page 2 to prove dedupe.
class _FakeService extends CloudSuggestionService {
  _FakeService() : super(firebaseReady: true);
  int calls = 0;
  @override
  Future<PlacesPage?> getNearbyPlacesPage({
    double? lat, double? lng, int? radius, String? languageCode, int cursor = 0,
  }) async {
    calls++;
    if (cursor == 0) {
      return PlacesPage(
        places: List.generate(12, (i) => p('p$i')),
        nextCursor: 12, endOfResults: false,
      );
    }
    return PlacesPage(
      places: [p('p11'), ...List.generate(8, (i) => p('p${12 + i}'))], // p11 dup
      nextCursor: null, endOfResults: true,
    );
  }
}

ProviderContainer makeContainer(CloudSuggestionService fake) => ProviderContainer(
      overrides: [
        firebaseReadyProvider.overrideWith((ref) => true),
        cloudSuggestionServiceProvider.overrideWithValue(fake),
      ],
    );

void main() {
  test('page 1 loads 12', () async {
    final fake = _FakeService();
    final c = makeContainer(fake);
    addTearDown(c.dispose);
    await c.read(explorePaginationProvider.notifier).loadFirst();
    final s = c.read(explorePaginationProvider);
    expect(s.places.length, 12);
    expect(s.endOfResults, false);
    expect(s.cursor, 12);
  });

  test('load more appends next page, dedupes across pages, ends', () async {
    final fake = _FakeService();
    final c = makeContainer(fake);
    addTearDown(c.dispose);
    await c.read(explorePaginationProvider.notifier).loadFirst();
    await c.read(explorePaginationProvider.notifier).loadMore();
    final s = c.read(explorePaginationProvider);
    // 12 + 8 unique (p11 duplicate dropped) = 20
    expect(s.places.length, 20);
    expect(s.places.map((e) => e.placeId).toSet().length, 20); // no duplicates
    expect(s.endOfResults, true);
  });

  test('loadMore is a no-op once endOfResults', () async {
    final fake = _FakeService();
    final c = makeContainer(fake);
    addTearDown(c.dispose);
    await c.read(explorePaginationProvider.notifier).loadFirst();
    await c.read(explorePaginationProvider.notifier).loadMore();
    final callsBefore = fake.calls;
    await c.read(explorePaginationProvider.notifier).loadMore(); // should do nothing
    expect(fake.calls, callsBefore);
  });

  test('loadFirst only fetches once (initialized guard)', () async {
    final fake = _FakeService();
    final c = makeContainer(fake);
    addTearDown(c.dispose);
    await c.read(explorePaginationProvider.notifier).loadFirst();
    await c.read(explorePaginationProvider.notifier).loadFirst();
    expect(fake.calls, 1);
  });

  test('refresh creates a clean snapshot', () async {
    final fake = _FakeService();
    final c = makeContainer(fake);
    addTearDown(c.dispose);
    await c.read(explorePaginationProvider.notifier).loadFirst();
    await c.read(explorePaginationProvider.notifier).loadMore();
    await c.read(explorePaginationProvider.notifier).refresh();
    final s = c.read(explorePaginationProvider);
    expect(s.places.length, 12); // back to page 1 only
    expect(s.endOfResults, false);
  });
}
