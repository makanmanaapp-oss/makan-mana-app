import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/providers/location_context_provider.dart';
import 'package:makan_mana/core/providers/makanmana_user_context_provider.dart';
import 'package:makan_mana/core/services/cloud_suggestion_service.dart';
import 'package:makan_mana/core/services/location_service.dart';
import 'package:makan_mana/features/explore/explore_pagination_controller.dart';
import 'package:makan_mana/models/place_summary.dart';

/// LOCATION CONSISTENCY HOTFIX — Home, Explore & Spin mesti guna lat/lng/radius
/// yang SAMA dari satu konteks authoritative. Menghalang regresi Explore=KL.

PlaceSummary _p(String id) => PlaceSummary(
      placeId: id, name: id, cuisine: 'cafe', emoji: '🍽️',
      rating: 4.0, userRatingCount: 10, priceLevel: 2, distanceKm: 1,
      isOpen: true, address: 'x', matchScore: 50, matchReasonKeys: const [],
    );

Position _pos(double lat, double lng) => Position(
      latitude: lat, longitude: lng, timestamp: DateTime(2026, 1, 1),
      accuracy: 5, altitude: 0, altitudeAccuracy: 0, heading: 0,
      headingAccuracy: 0, speed: 0, speedAccuracy: 0, isMocked: true,
    );

/// LocationService boleh kawal (tiada Geolocator sebenar dalam ujian).
class _FakeLocation extends LocationService {
  _FakeLocation(this.next);
  Position? next;
  @override
  Future<Position?> getPosition() async => next;
}

/// Merekod lat/lng/radius yang DIHANTAR oleh Home (getNearbyPlaces) dan
/// Explore (getNearbyPlacesPage) supaya boleh dibandingkan.
class _RecordingService extends CloudSuggestionService {
  _RecordingService() : super(firebaseReady: true);
  double? homeLat, homeLng, exploreLat, exploreLng;
  int? homeRadius, exploreRadius;

  @override
  Future<List<PlaceSummary>?> getNearbyPlaces({
    double? lat, double? lng, int? radius, String? languageCode,
  }) async {
    homeLat = lat; homeLng = lng; homeRadius = radius;
    return [_p('h1')];
  }

  @override
  Future<PlacesPage?> getNearbyPlacesPage({
    double? lat, double? lng, int? radius, String? languageCode, int cursor = 0,
  }) async {
    exploreLat = lat; exploreLng = lng; exploreRadius = radius;
    return PlacesPage(
      places: List.generate(12, (i) => _p('e$i')),
      nextCursor: 12, endOfResults: false,
    );
  }
}

late SharedPreferences _prefs;

ProviderContainer _container(_RecordingService rec, LocationService loc) =>
    ProviderContainer(overrides: [
      firebaseReadyProvider.overrideWith((ref) => true),
      sharedPreferencesProvider.overrideWithValue(_prefs),
      cloudSuggestionServiceProvider.overrideWithValue(rec),
      locationServiceProvider.overrideWithValue(loc),
    ]);

void main() {
  setUp(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    _prefs = await SharedPreferences.getInstance();
  });

  test('Home and Explore use IDENTICAL coordinates (Penang, not KL)', () async {
    final rec = _RecordingService();
    final c = _container(rec, _FakeLocation(_pos(5.4141, 100.3288)));
    addTearDown(c.dispose);

    await c.read(nearbyPlacesProvider.future); // Home
    await c.read(explorePaginationProvider.notifier).loadFirst(); // Explore

    expect(rec.homeLat, 5.4141);
    expect(rec.exploreLat, 5.4141);
    expect(rec.homeLng, 100.3288);
    expect(rec.exploreLng, 100.3288);
    // BUKAN lokasi lalai KL.
    expect(rec.exploreLat, isNot(3.1478));
  });

  test('radius matches across Home and Explore', () async {
    final rec = _RecordingService();
    final c = _container(rec, _FakeLocation(_pos(5.4141, 100.3288)));
    addTearDown(c.dispose);
    // Tetapkan radius bukan lalai.
    c.read(makanManaUserContextProvider.notifier).updateSelectedRadiusKm(7.0);

    await c.read(nearbyPlacesProvider.future);
    await c.read(explorePaginationProvider.notifier).loadFirst();

    expect(rec.homeRadius, 7000);
    expect(rec.exploreRadius, 7000);
    expect(rec.homeRadius, rec.exploreRadius);
  });

  test('location change RESETS Explore pages + uses new coords', () async {
    final rec = _RecordingService();
    final loc = _FakeLocation(_pos(3.1478, 101.6953)); // start KL
    final c = _container(rec, loc);
    addTearDown(c.dispose);
    // Kekalkan controller hidup (macam skrin Explore yang watch) supaya
    // pendengar perubahan lokasi kekal aktif.
    final keepAlive = c.listen(explorePaginationProvider, (_, __) {});
    addTearDown(keepAlive.close);

    await c.read(explorePaginationProvider.notifier).loadFirst();
    expect(rec.exploreLat, 3.1478);
    expect(c.read(explorePaginationProvider).cursor, 12);

    // Pindah ke Penang + invalidate lokasi.
    loc.next = _pos(5.4141, 100.3288);
    c.invalidate(locationContextProvider);
    await c.read(locationContextProvider.future);
    // Tunggu pendengar reset + refetch selesai (deterministik, poll pendek).
    for (var i = 0; i < 100; i++) {
      if (rec.exploreLat == 5.4141 &&
          c.read(explorePaginationProvider).places.length == 12) break;
      await Future<void>.delayed(Duration.zero);
    }

    // Explore reset & re-fetch dengan koordinat baharu.
    expect(rec.exploreLat, 5.4141);
    expect(c.read(explorePaginationProvider).places.length, 12);
  });

  test('stale KL cacheKey is NOT reused for another area', () {
    const kl = LocationRequestContext(
        lat: 3.1478, lng: 101.6953, radiusMeters: 3000,
        locationGrid: '3.148,101.695');
    const penang = LocationRequestContext(
        lat: 5.4141, lng: 100.3288, radiusMeters: 3000,
        locationGrid: '5.414,100.329');
    expect(kl.cacheKey, isNot(penang.cacheKey));
    // Radius berbeza pun tukar kunci (pool berubah).
    const klWide = LocationRequestContext(
        lat: 3.1478, lng: 101.6953, radiusMeters: 8000,
        locationGrid: '3.148,101.695');
    expect(kl.cacheKey, isNot(klWide.cacheKey));
  });

  test('NO hardcoded KL/test coordinates in client runtime (lib/)', () {
    final offenders = <String>[];
    for (final f in Directory('lib').listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart')) continue;
      final txt = f.readAsStringSync();
      if (txt.contains('3.1478') || txt.contains('101.6953')) {
        offenders.add(f.path);
      }
    }
    expect(offenders, isEmpty,
        reason: 'Koordinat KL keras dijumpai dalam runtime: $offenders');
  });

  test('Spin context changes with location (payload lat/lng follow GPS)',
      () async {
    // Spin guna buildSuggestionRequestBase (lat/lng dari konteks yang dikemas
    // kini oleh locationContextProvider) — jadi ia ikut lokasi semasa.
    final c = ProviderContainer(overrides: [
      sharedPreferencesProvider.overrideWithValue(_prefs),
    ]);
    addTearDown(c.dispose);
    final n = c.read(makanManaUserContextProvider.notifier);
    await n.updateLocation(3.1478, 101.6953, locationGrid: '3.148,101.695');
    final p1 = c.read(makanManaUserContextProvider).buildSuggestionRequestBase();
    await n.updateLocation(5.4141, 100.3288, locationGrid: '5.414,100.329');
    final p2 = c.read(makanManaUserContextProvider).buildSuggestionRequestBase();
    expect(p1['lat'], 3.1478);
    expect(p2['lat'], 5.4141);
    expect(p1['lat'], isNot(p2['lat']));
  });

  test('public and owner behavior consistent (coords independent of plan)',
      () async {
    // Free plan
    final recFree = _RecordingService();
    final cFree = _container(recFree, _FakeLocation(_pos(5.4141, 100.3288)));
    addTearDown(cFree.dispose);
    cFree.read(makanManaUserContextProvider.notifier); // plan default free
    await cFree.read(explorePaginationProvider.notifier).loadFirst();

    // "Owner-ish" — radius sama, plan berbeza tidak mengubah lokasi.
    final recOwner = _RecordingService();
    final cOwner = _container(recOwner, _FakeLocation(_pos(5.4141, 100.3288)));
    addTearDown(cOwner.dispose);
    await cOwner.read(explorePaginationProvider.notifier).loadFirst();

    expect(recFree.exploreLat, recOwner.exploreLat);
    expect(recFree.exploreLng, recOwner.exploreLng);
    expect(recFree.exploreRadius, recOwner.exploreRadius);
  });
}
