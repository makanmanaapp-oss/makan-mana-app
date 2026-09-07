// MalaysiaStateResolver — resolver-level tests (presentation personalisation).
//
// Covers HOME-R3 Part 14 #24 (failed resolver → null, Home stays language-only)
// and Part 11 (resolve only when the coarse grid changes; a failure never
// breaks Home). Uses an injectable fake geocoder so nothing here touches GPS or
// the device/network geocoder.
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/core/location/malaysia_state_resolver.dart';

class _FakeGeocoder implements MalaysiaAdministrativeGeocoder {
  _FakeGeocoder(this._area, {this.throwOnCall = false});

  final MalaysiaAdministrativeArea? _area;
  final bool throwOnCall;
  int calls = 0;

  @override
  Future<MalaysiaAdministrativeArea?> reverse(
      double latitude, double longitude) async {
    calls++;
    if (throwOnCall) throw Exception('geocoder unavailable');
    return _area;
  }
}

void main() {
  test('resolves a Malaysian administrativeArea to the normalized state',
      () async {
    final r = MalaysiaStateResolver(
      geocoder: _FakeGeocoder(
          const MalaysiaAdministrativeArea(country: 'MY', administrativeArea: 'Kelantan')),
    );
    expect(await r.resolve(6.1254, 102.2381), 'Kelantan');
  });

  test('non-Malaysian country never resolves a state (honest null)', () async {
    final r = MalaysiaStateResolver(
      geocoder: _FakeGeocoder(
          const MalaysiaAdministrativeArea(country: 'SG', administrativeArea: 'Central')),
    );
    expect(await r.resolve(1.2900, 103.8500), isNull);
  });

  test('unknown Malaysian administrativeArea does not guess a state', () async {
    final r = MalaysiaStateResolver(
      geocoder: _FakeGeocoder(const MalaysiaAdministrativeArea(
          country: 'Malaysia', administrativeArea: 'Somewhere Unknown')),
    );
    expect(await r.resolve(3.1000, 101.6000), isNull);
  });

  test('null administrativeArea inside Malaysia resolves to null', () async {
    final r = MalaysiaStateResolver(
      geocoder: _FakeGeocoder(
          const MalaysiaAdministrativeArea(country: 'MY', administrativeArea: null)),
    );
    expect(await r.resolve(3.1000, 101.6000), isNull);
  });

  test('#24 failed geocoder (throws) => null; no exception escapes to Home',
      () async {
    final r = MalaysiaStateResolver(geocoder: _FakeGeocoder(null, throwOnCall: true));
    expect(await r.resolve(3.1000, 101.6000), isNull);
  });

  test('#11 caches per 3dp grid: one geocode per grid, re-geocode on new grid',
      () async {
    final g = _FakeGeocoder(
        const MalaysiaAdministrativeArea(country: 'MY', administrativeArea: 'Perak'));
    final r = MalaysiaStateResolver(geocoder: g);

    expect(await r.resolve(4.5971, 101.0901), 'Perak'); // grid 4.597,101.090
    await r.resolve(4.5971, 101.0901); // exact same coordinate → cache hit
    await r.resolve(4.5974, 101.0904); // same 3dp grid (4.597,101.090)
    expect(g.calls, 1, reason: 'same coarse grid must not re-geocode');

    await r.resolve(3.1390, 101.6869); // different grid → one new geocode
    expect(g.calls, 2);
  });

  test('a failure is cached too (no repeated geocode storm for a bad grid)',
      () async {
    final g = _FakeGeocoder(null, throwOnCall: true);
    final r = MalaysiaStateResolver(geocoder: g);
    expect(await r.resolve(3.1000, 101.6000), isNull);
    expect(await r.resolve(3.1000, 101.6000), isNull);
    expect(g.calls, 1, reason: 'failed grid result is cached, not retried');
  });
}
