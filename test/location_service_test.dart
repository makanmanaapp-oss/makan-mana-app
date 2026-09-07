// LocationService lifecycle tests (QA-DEV8) — deterministic, injected clock +
// mockable backend + mock SharedPreferences. No real user coordinates.
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:makan_mana/core/services/location_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _nowMs = 1000000000000; // clock tetap untuk semua ujian
int _now() => _nowMs;
const _hour = 3600 * 1000;

Position _pos(double lat, double lng, {int? tsMs}) => Position(
      latitude: lat,
      longitude: lng,
      timestamp: DateTime.fromMillisecondsSinceEpoch(tsMs ?? 0),
      accuracy: 0,
      altitude: 0,
      altitudeAccuracy: 0,
      heading: 0,
      headingAccuracy: 0,
      speed: 0,
      speedAccuracy: 0,
    );

class _FakeBackend implements LocationBackend {
  _FakeBackend({
    this.serviceEnabled = true,
    this.permission = LocationPermission.always,
    this.current,
    this.currentThrows = false,
    this.osLast,
  });
  bool serviceEnabled;
  LocationPermission permission;
  Position? current;
  bool currentThrows;
  Position? osLast;

  @override
  Future<bool> isLocationServiceEnabled() async => serviceEnabled;
  @override
  Future<LocationPermission> checkPermission() async => permission;
  @override
  Future<LocationPermission> requestPermission() async => permission;
  @override
  Future<Position> getCurrentPosition() async {
    if (currentThrows || current == null) throw Exception('no fix');
    return current!;
  }

  @override
  Future<Position?> getLastKnownPosition() async => osLast;
}

Map<String, Object> _persisted(String uid, double lat, double lng, int tsMs) => {
      'flutter.mm_last_valid_lat::$uid': lat,
      'flutter.mm_last_valid_lng::$uid': lng,
      'flutter.mm_last_valid_loc_ts::$uid': tsMs,
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('1: LIVE succeeds -> LIVE', () async {
    final s = LocationService(
        backend: _FakeBackend(current: _pos(3.2, 101.5)), nowMs: _now);
    expect(await s.getPosition(uid: 'A'), isNotNull);
    expect(s.lastSource, LocationSource.live);
  });

  test('2: LIVE fails, OS last-known 1h old -> LAST_VALID', () async {
    final s = LocationService(
        backend: _FakeBackend(
            currentThrows: true, osLast: _pos(3.2, 101.5, tsMs: _nowMs - _hour)),
        nowMs: _now);
    expect(await s.getPosition(uid: 'A'), isNotNull);
    expect(s.lastSource, LocationSource.lastValid);
  });

  test('3: LIVE fails, OS 48h stale ignored, recent persisted accepted',
      () async {
    SharedPreferences.setMockInitialValues(
        _persisted('A', 3.2, 101.5, _nowMs - _hour));
    final s = LocationService(
        backend: _FakeBackend(
            currentThrows: true, osLast: _pos(9, 9, tsMs: _nowMs - 48 * _hour)),
        nowMs: _now);
    final p = await s.getPosition(uid: 'A');
    expect(s.lastSource, LocationSource.lastValid);
    expect(p!.latitude, 3.2); // persisted, BUKAN OS basi (9,9)
  });

  test('4: OS stale + persisted stale -> UNAVAILABLE', () async {
    SharedPreferences.setMockInitialValues(
        _persisted('A', 3.2, 101.5, _nowMs - 48 * _hour));
    final s = LocationService(
        backend: _FakeBackend(
            currentThrows: true, osLast: _pos(9, 9, tsMs: _nowMs - 48 * _hour)),
        nowMs: _now);
    expect(await s.getPosition(uid: 'A'), isNull);
    expect(s.lastSource, LocationSource.unavailable);
  });

  test('5: explicit permission denied -> UNAVAILABLE despite recent OS+persisted',
      () async {
    SharedPreferences.setMockInitialValues(
        _persisted('A', 3.2, 101.5, _nowMs - _hour));
    final s = LocationService(
        backend: _FakeBackend(
            permission: LocationPermission.deniedForever,
            osLast: _pos(9, 9, tsMs: _nowMs - _hour)),
        nowMs: _now);
    expect(await s.getPosition(uid: 'A'), isNull);
    expect(s.lastSource, LocationSource.unavailable);
  });

  test('6: UID A persisted, current UID B -> A never returned', () async {
    SharedPreferences.setMockInitialValues(
        _persisted('A', 3.2, 101.5, _nowMs - _hour));
    final s = LocationService(
        backend: _FakeBackend(currentThrows: true, osLast: null), nowMs: _now);
    expect(await s.getPosition(uid: 'B'), isNull); // B tidak warisi lokasi A
    expect(s.lastSource, LocationSource.unavailable);
  });

  test('7: clear UID A -> A persisted keys removed', () async {
    SharedPreferences.setMockInitialValues(_persisted('A', 3.2, 101.5, _nowMs));
    final s = LocationService(backend: _FakeBackend(), nowMs: _now);
    await s.clearPersistedLocation(uid: 'A');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getDouble('mm_last_valid_lat::A'), isNull);
    expect(prefs.getInt('mm_last_valid_loc_ts::A'), isNull);
  });

  test('8: clear does not touch other UID or manual/independent keys', () async {
    SharedPreferences.setMockInitialValues({
      ..._persisted('A', 3.2, 101.5, _nowMs),
      ..._persisted('B', 4.0, 102.0, _nowMs),
      'flutter.manualLocationName': 'Kuala Lumpur',
    });
    final s = LocationService(backend: _FakeBackend(), nowMs: _now);
    await s.clearPersistedLocation(uid: 'A');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('manualLocationName'), 'Kuala Lumpur');
    expect(prefs.getDouble('mm_last_valid_lat::B'), 4.0); // UID B kekal
  });

  test('9: stale persisted -> removed on read', () async {
    SharedPreferences.setMockInitialValues(
        _persisted('A', 3.2, 101.5, _nowMs - 48 * _hour));
    final s = LocationService(
        backend: _FakeBackend(currentThrows: true, osLast: null), nowMs: _now);
    await s.getPosition(uid: 'A'); // baca → basi → buang
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getDouble('mm_last_valid_lat::A'), isNull);
    expect(prefs.getInt('mm_last_valid_loc_ts::A'), isNull);
  });

  test('10: old GLOBAL QA-DEV6 keys deleted once (not migrated)', () async {
    SharedPreferences.setMockInitialValues({
      'flutter.mm_last_valid_lat': 3.2,
      'flutter.mm_last_valid_lng': 101.5,
      'flutter.mm_last_valid_loc_ts': _nowMs,
    });
    final s = LocationService(
        backend: _FakeBackend(current: _pos(4.0, 102.0)), nowMs: _now);
    await s.getPosition(uid: 'A');
    final prefs = await SharedPreferences.getInstance();
    // Kunci global lama DIPADAM (bukan dimigrasi ke ::A).
    expect(prefs.getDouble('mm_last_valid_lat'), isNull);
    expect(prefs.getDouble('mm_last_valid_lat::A'), isNotNull);
  });

  test('11: device location service OFF (technical) -> LAST_VALID from persisted',
      () async {
    SharedPreferences.setMockInitialValues(
        _persisted('A', 3.2, 101.5, _nowMs - _hour));
    final s = LocationService(
        backend: _FakeBackend(serviceEnabled: false), nowMs: _now);
    final p = await s.getPosition(uid: 'A');
    expect(s.lastSource, LocationSource.lastValid); // bukan UNAVAILABLE
    expect(p!.latitude, 3.2);
  });
}
