import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/providers/location_context_provider.dart';
import 'package:makan_mana/core/services/cloud_suggestion_service.dart';
import 'package:makan_mana/features/explore/explore_pagination_controller.dart';
import 'package:makan_mana/models/place_summary.dart';
import 'package:makan_mana/repositories/auth_repository.dart';

/// Phase 2.2A — ujian kawalan pagination Explore.

PlaceSummary p(String id) => PlaceSummary(
      placeId: id,
      name: id,
      cuisine: 'cafe',
      emoji: '🍽️',
      rating: 4.0,
      userRatingCount: 10,
      priceLevel: 2,
      distanceKm: 1,
      isOpen: true,
      address: 'x',
      matchScore: 50,
      matchReasonKeys: const [],
    );

/// Fake: page 1 = p0..p11 (cursor→12), page 2 = p12..p19 (end). p11 repeats on
/// page 2 to prove dedupe.
class _FakeService extends CloudSuggestionService {
  _FakeService() : super(firebaseReady: true);
  int calls = 0;
  @override
  Future<PlacesPage?> getNearbyPlacesPage({
    double? lat,
    double? lng,
    int? radius,
    String? languageCode,
    String? query,
    int cursor = 0,
  }) async {
    calls++;
    if (cursor == 0) {
      return PlacesPage(
        places: List.generate(12, (i) => p('p$i')),
        nextCursor: 12,
        endOfResults: false,
      );
    }
    return PlacesPage(
      places: [
        p('p11'),
        ...List.generate(8, (i) => p('p${12 + i}'))
      ], // p11 dup
      nextCursor: null, endOfResults: true,
    );
  }
}

ProviderContainer makeContainer(CloudSuggestionService fake) {
  final container = ProviderContainer(
    overrides: [
      firebaseReadyProvider.overrideWith((ref) => true),
      // The pagination fake requires cloud suggestions but not a real
      // Firebase Auth app. Keep the location context anonymous in tests.
      authRepositoryProvider
          .overrideWithValue(AuthRepository(firebaseReady: false)),
      locationContextProvider.overrideWith(
        (ref) async => const LocationRequestContext(radiusMeters: 3000),
      ),
      cloudSuggestionServiceProvider.overrideWithValue(fake),
    ],
  );
  // This provider is auto-disposed. Keep it observed for each contract test
  // so a page request cannot complete after its controller is disposed.
  container.listen(explorePaginationProvider, (_, __) {});
  return container;
}


/// SEARCH SCALABILITY — a synthetic pool big enough that a 12-item page cannot
/// possibly be "all of it". Honours the cursor and records every query it was
/// asked for, so a test can prove the query travelled with the page request.
class _SearchFakeService extends CloudSuggestionService {
  _SearchFakeService({required this.matching, this.delay = Duration.zero})
      : super(firebaseReady: true);

  /// How many restaurants match the search term.
  final int matching;
  final Duration delay;
  final List<String> queries = [];
  final List<int> cursors = [];
  int calls = 0;

  static const int pageSize = 12;

  @override
  Future<PlacesPage?> getNearbyPlacesPage({
    double? lat,
    double? lng,
    int? radius,
    String? languageCode,
    String? query,
    int cursor = 0,
  }) async {
    calls++;
    final q = (query ?? '').trim();
    queries.add(q);
    cursors.add(cursor);
    if (delay != Duration.zero) await Future<void>.delayed(delay);

    // The server searches the FULL pool and only then paginates.
    final prefix = q.isEmpty ? 'all' : q;
    final start = cursor;
    final end = (start + pageSize) > matching ? matching : (start + pageSize);
    final slice = <PlaceSummary>[
      for (var i = start; i < end; i++) p('$prefix-$i'),
    ];
    final done = end >= matching;
    return PlacesPage(
      places: slice,
      nextCursor: done ? null : end,
      endOfResults: done,
    );
  }
}

/// setSearchQuery debounces by 280ms and then refreshes.
Future<void> settleSearch() =>
    Future<void>.delayed(const Duration(milliseconds: 400));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

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
    await c
        .read(explorePaginationProvider.notifier)
        .loadMore(); // should do nothing
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

  // ---------------------------------------------------------------------
  // SEARCH PAGINATION — loadMore() used to bail whenever a query existed,
  // which capped every search at the first server page.
  // ---------------------------------------------------------------------

  test('S1. a search with more than 12 matches returns 12 on page 1', () async {
    final fake = _SearchFakeService(matching: 37);
    final c = makeContainer(fake);
    addTearDown(c.dispose);
    final n = c.read(explorePaginationProvider.notifier);
    await n.loadFirst();
    n.setSearchQuery('nasi');
    await settleSearch();
    final s = c.read(explorePaginationProvider);
    expect(s.places.length, 12);
    expect(s.endOfResults, false,
        reason: '37 matches cannot end after one page');
  });

  test('S2. page 2 of a search adds the next matches instead of stopping',
      () async {
    final fake = _SearchFakeService(matching: 37);
    final c = makeContainer(fake);
    addTearDown(c.dispose);
    final n = c.read(explorePaginationProvider.notifier);
    await n.loadFirst();
    n.setSearchQuery('nasi');
    await settleSearch();
    await n.loadMore();
    final s = c.read(explorePaginationProvider);
    expect(s.places.length, 24, reason: 'this was capped at 12 before the fix');
    expect(fake.queries.last, 'nasi',
        reason: 'the query must travel with the next page');
    expect(fake.cursors.last, 12, reason: 'and so must the cursor');
  });

  test('S3. paging a search never repeats an identity', () async {
    final fake = _SearchFakeService(matching: 37);
    final c = makeContainer(fake);
    addTearDown(c.dispose);
    final n = c.read(explorePaginationProvider.notifier);
    await n.loadFirst();
    n.setSearchQuery('nasi');
    await settleSearch();
    // 37 matches is three pages (12 + 12 + 12 = 36, then the last one).
    var guard = 0;
    while (!c.read(explorePaginationProvider).endOfResults && guard < 20) {
      await n.loadMore();
      guard++;
    }
    final s = c.read(explorePaginationProvider);
    final ids = s.places.map((e) => e.placeId).toList();
    expect(ids.toSet().length, ids.length, reason: 'no duplicate identity');
    expect(s.places.length, 37);
    expect(s.endOfResults, true);
  });

  test('S4. changing the query resets results and cursor', () async {
    final fake = _SearchFakeService(matching: 37);
    final c = makeContainer(fake);
    addTearDown(c.dispose);
    final n = c.read(explorePaginationProvider.notifier);
    await n.loadFirst();
    n.setSearchQuery('nasi');
    await settleSearch();
    await n.loadMore();
    expect(c.read(explorePaginationProvider).places.length, 24);

    n.setSearchQuery('mee');
    await settleSearch();
    final s = c.read(explorePaginationProvider);
    expect(s.places.length, 12, reason: 'a new query starts from page 1');
    expect(s.cursor, 12);
    expect(s.places.every((e) => e.placeId.startsWith('mee-')), true,
        reason: 'results from the previous query must not survive');
  });

  test('S5. a slow response for an old query cannot overwrite a newer one',
      () async {
    final fake = _SearchFakeService(
        matching: 37, delay: const Duration(milliseconds: 120));
    final c = makeContainer(fake);
    addTearDown(c.dispose);
    final n = c.read(explorePaginationProvider.notifier);
    await n.loadFirst();
    n.setSearchQuery('nasi');
    await settleSearch();
    // Start a page for "nasi", then switch query while it is still in flight.
    final inFlight = n.loadMore();
    n.setSearchQuery('mee');
    await inFlight;
    await settleSearch();
    final s = c.read(explorePaginationProvider);
    expect(s.places.every((e) => e.placeId.startsWith('mee-')), true,
        reason: 'stale page must not be merged into the new query');
  });

  test('S6. a search that fits in one page ends immediately', () async {
    final fake = _SearchFakeService(matching: 5);
    final c = makeContainer(fake);
    addTearDown(c.dispose);
    final n = c.read(explorePaginationProvider.notifier);
    await n.loadFirst();
    n.setSearchQuery('nasi');
    await settleSearch();
    final s = c.read(explorePaginationProvider);
    expect(s.places.length, 5);
    expect(s.endOfResults, true);
    final before = fake.calls;
    await n.loadMore();
    expect(fake.calls, before, reason: 'endOfResults must stop paging');
  });

  // ---------------------------------------------------------------------
  // SCALE — a page size is a page size, not a ceiling on how many
  // restaurants MakanMana can hold.
  // ---------------------------------------------------------------------

  for (final total in [20, 100, 401, 1000]) {
    test('S7. $total restaurants page through completely, no loss, no dupes',
        () async {
      final fake = _SearchFakeService(matching: total);
      final c = makeContainer(fake);
      addTearDown(c.dispose);
      final n = c.read(explorePaginationProvider.notifier);
      await n.loadFirst();
      var guard = 0;
      while (!c.read(explorePaginationProvider).endOfResults && guard < 500) {
        await n.loadMore();
        guard++;
      }
      final s = c.read(explorePaginationProvider);
      expect(s.places.length, total,
          reason: 'every restaurant must be reachable by scrolling');
      final ids = s.places.map((e) => e.placeId).toList();
      expect(ids.toSet().length, ids.length, reason: 'stable, no duplicates');
      expect(s.endOfResults, true);
      // 401 is the interesting one: it is past MAX_CANDIDATES_PER_CELL, so a
      // cell-sized cap must never become the number of restaurants a user sees.
    });
  }
}
