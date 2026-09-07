import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Sumber lokasi terakhir yang dipulangkan getPosition — untuk diagnostik QA +
/// kejujuran keadaan lokasi. BUKAN PII (tiada koordinat didedah di sini).
enum LocationSource { live, lastValid, unavailable }

/// Seam boleh-mock untuk ujian deterministik (lalai: Geolocator sebenar).
abstract class LocationBackend {
  Future<bool> isLocationServiceEnabled();
  Future<LocationPermission> checkPermission();
  Future<LocationPermission> requestPermission();
  Future<Position> getCurrentPosition();
  Future<Position?> getLastKnownPosition();
}

class GeolocatorBackend implements LocationBackend {
  const GeolocatorBackend();
  @override
  Future<bool> isLocationServiceEnabled() =>
      Geolocator.isLocationServiceEnabled();
  @override
  Future<LocationPermission> checkPermission() => Geolocator.checkPermission();
  @override
  Future<LocationPermission> requestPermission() =>
      Geolocator.requestPermission();
  @override
  Future<Position> getCurrentPosition() => Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 6),
        ),
      );
  @override
  Future<Position?> getLastKnownPosition() =>
      Geolocator.getLastKnownPosition();
}

typedef NowMs = int Function();

/// Lokasi peranti untuk cadangan berdekatan.
///
/// AUTHORITY LOKASI (QA-DEV6/7/8):
///  * Kegagalan GPS SEMENTARA tidak jatuh senyap ke KL.
///  * SATU kontrak kesegaran 24 jam untuk SEMUA fallback auto (OS last-known +
///    last-valid disimpan). Lebih tua = STALE → tidak digunakan.
///  * Simpanan last-valid BERSKOP-UID; pengawal dalam-memori elak bocor akaun.
///  * Penolakan KEBENARAN eksplisit → UNAVAILABLE (menang atas SEMUA fallback).
///  * Entri basi DIBUANG (bukan dibaca berulang). Kunci global lama (QA-DEV6)
///    dipadam sekali (bukan dimigrasi — pemilikan tak terbukti).
///  * clearPersistedLocation dipanggil semasa log keluar.
class LocationService {
  LocationService({
    LocationBackend backend = const GeolocatorBackend(),
    NowMs? nowMs,
  })  : _backend = backend,
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch);

  final LocationBackend _backend;
  final NowMs _now;

  Position? _lastPosition;
  String? _lastPositionUid;
  LocationSource _lastSource = LocationSource.unavailable;
  String? _uid;
  bool _legacyCleaned = false;

  /// Satu TTL kesegaran (24 jam) untuk OS last-known + last-valid disimpan.
  static const _ttlMs = 24 * 60 * 60 * 1000;

  static const _kLat = 'mm_last_valid_lat';
  static const _kLng = 'mm_last_valid_lng';
  static const _kTs = 'mm_last_valid_loc_ts';

  Position? get lastPosition => _lastPosition;
  LocationSource get lastSource => _lastSource;

  String _key(String base, String? uid) =>
      '$base::${(uid == null || uid.isEmpty) ? 'anon' : uid}';

  bool _isFresh(DateTime? ts) {
    if (ts == null) return false;
    return _now() - ts.millisecondsSinceEpoch <= _ttlMs;
  }

  Future<Position?> getPosition({String? uid}) async {
    await _cleanupLegacyKeys();
    if (uid != _lastPositionUid) {
      _lastPosition = null; // akaun berbeza → jangan warisi lokasi lama
      _lastPositionUid = uid;
    }
    _uid = uid;
    try {
      if (!await _backend.isLocationServiceEnabled()) {
        // Perkhidmatan lokasi peranti DIMATIKAN (teknikal) → last-valid segar.
        return await _fallback(allowPersisted: true);
      }
      var permission = await _backend.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await _backend.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        // PENOLAKAN EKSPLISIT menang atas SEMUA fallback (OS + disimpan).
        _lastSource = LocationSource.unavailable;
        return null;
      }
      try {
        final pos = await _backend.getCurrentPosition();
        _lastPosition = pos;
        _lastPositionUid = uid;
        _lastSource = LocationSource.live;
        await _persist(pos, uid);
        return pos;
      } catch (_) {
        final osLast = await _backend.getLastKnownPosition();
        return await _fallback(osLast: osLast, allowPersisted: true);
      }
    } catch (e) {
      debugPrint('MakanMana: lokasi gagal: $e');
      return await _fallback(allowPersisted: true);
    }
  }

  /// OS last-known digunakan HANYA jika SEGAR (<= TTL) — tidak memintas dasar
  /// kesegaran. Kemudian last-valid sesi, kemudian last-valid disimpan
  /// (UID-scoped + TTL). Memulangkan LAST_VALID, BUKAN KL. Null = UNAVAILABLE.
  Future<Position?> _fallback({
    Position? osLast,
    required bool allowPersisted,
  }) async {
    Position? candidate;
    if (osLast != null && _isFresh(osLast.timestamp)) candidate = osLast;
    candidate ??= _lastPosition;
    if (candidate == null && allowPersisted) {
      candidate = await _loadPersisted(_uid);
    }
    if (candidate != null) {
      _lastPosition = candidate;
      _lastPositionUid = _uid;
      _lastSource = LocationSource.lastValid;
      if (identical(candidate, osLast)) {
        await _persist(osLast!, _uid); // seed simpanan dgn fix OS segar
      }
      return candidate;
    }
    _lastSource = LocationSource.unavailable;
    return null;
  }

  Future<void> _persist(Position p, String? uid) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setDouble(_key(_kLat, uid), p.latitude);
      await prefs.setDouble(_key(_kLng, uid), p.longitude);
      await prefs.setInt(_key(_kTs, uid), _now());
    } catch (_) {
      // Kegagalan simpanan tidak boleh menjejaskan aliran lokasi.
    }
  }

  Future<Position?> _loadPersisted(String? uid) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final ts = prefs.getInt(_key(_kTs, uid));
      final lat = prefs.getDouble(_key(_kLat, uid));
      final lng = prefs.getDouble(_key(_kLng, uid));
      if (lat == null || lng == null || ts == null) return null;
      if (_now() - ts > _ttlMs) {
        // BASI → buang entri (jangan baca berulang selamanya); UID ini sahaja.
        await prefs.remove(_key(_kLat, uid));
        await prefs.remove(_key(_kLng, uid));
        await prefs.remove(_key(_kTs, uid));
        return null;
      }
      return Position(
        latitude: lat,
        longitude: lng,
        timestamp: DateTime.fromMillisecondsSinceEpoch(ts),
        accuracy: 0,
        altitude: 0,
        altitudeAccuracy: 0,
        heading: 0,
        headingAccuracy: 0,
        speed: 0,
        speedAccuracy: 0,
      );
    } catch (_) {
      return null;
    }
  }

  /// Padam lokasi tepat disimpan untuk [uid] + buang salinan dalam-memori
  /// (log keluar / pengasingan akaun). Tidak menyentuh UID lain / lokasi manual.
  Future<void> clearPersistedLocation({String? uid}) async {
    _lastPosition = null;
    _lastPositionUid = null;
    _lastSource = LocationSource.unavailable;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_key(_kLat, uid));
      await prefs.remove(_key(_kLng, uid));
      await prefs.remove(_key(_kTs, uid));
    } catch (_) {}
  }

  /// Buang SEKALI kunci global lama (QA-DEV6, tanpa skop UID). Padam sahaja —
  /// JANGAN migrasi koordinat (pemilikan tak boleh dibukti).
  Future<void> _cleanupLegacyKeys() async {
    if (_legacyCleaned) return;
    _legacyCleaned = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_kLat);
      await prefs.remove(_kLng);
      await prefs.remove(_kTs);
    } catch (_) {}
  }
}
