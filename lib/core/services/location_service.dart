import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

/// Lokasi peranti untuk cadangan berdekatan (Milestone 4).
/// Sentiasa selamat-gagal: pulangkan null jika ditolak/tiada GPS —
/// pelayan akan guna lokasi lalai (pusat KL).
class LocationService {
  Position? _lastPosition;

  Position? get lastPosition => _lastPosition;

  Future<Position?> getPosition() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        return _lastPosition;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return _lastPosition;
      }

      // Cuba kedudukan terkini dengan had masa pendek; fallback last known.
      try {
        _lastPosition = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.medium,
            timeLimit: Duration(seconds: 6),
          ),
        );
      } catch (_) {
        _lastPosition =
            await Geolocator.getLastKnownPosition() ?? _lastPosition;
      }
      return _lastPosition;
    } catch (e) {
      debugPrint('MakanMana: lokasi gagal: $e');
      return _lastPosition;
    }
  }
}
