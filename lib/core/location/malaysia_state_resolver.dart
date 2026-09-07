import 'package:flutter/foundation.dart';
import 'package:geocoding/geocoding.dart';

import 'malaysia_state_hero_voice.dart';

/// Batas yang boleh dimock supaya ujian tidak bergantung kepada GPS atau
/// geocoder rangkaian/peranti sebenar.
abstract class MalaysiaAdministrativeGeocoder {
  Future<MalaysiaAdministrativeArea?> reverse(
      double latitude, double longitude);
}

class MalaysiaAdministrativeArea {
  const MalaysiaAdministrativeArea({
    required this.country,
    required this.administrativeArea,
  });

  final String? country;
  final String? administrativeArea;
}

class PlatformMalaysiaAdministrativeGeocoder
    implements MalaysiaAdministrativeGeocoder {
  @override
  Future<MalaysiaAdministrativeArea?> reverse(
      double latitude, double longitude) async {
    final placemarks =
        await Geocoding().placemarkFromCoordinates(latitude, longitude);
    if (placemarks.isEmpty) return null;
    final place = placemarks.first;
    return MalaysiaAdministrativeArea(
      country: place.isoCountryCode ?? place.country,
      administrativeArea: place.administrativeArea,
    );
  }
}

/// Resolver coarse-state bagi sesi semasa. Cache termasuk keputusan null/error
/// agar Home tidak mencuba geocode berulang untuk grid lokasi yang sama.
class MalaysiaStateResolver {
  MalaysiaStateResolver({required MalaysiaAdministrativeGeocoder geocoder})
      : _geocoder = geocoder;

  final MalaysiaAdministrativeGeocoder _geocoder;
  final Map<String, String?> _cache = {};

  // QA multi-state sahaja: dart-define ini dibaca dalam debug, tiada UI dan
  // kDebugMode memastikan release tidak boleh mengaktifkannya.
  static const _debugStateDefine =
      String.fromEnvironment('MM_DEBUG_MALAYSIA_STATE');

  /// Suntikan QA peranti sahaja. Dalam release nilainya sentiasa null.
  static String? get debugStateForQa =>
      kDebugMode ? MalaysiaStateHeroVoice.normalize(_debugStateDefine) : null;

  Future<String?> resolve(double latitude, double longitude) async {
    final key = _keyFor(latitude, longitude);
    if (_cache.containsKey(key)) return _cache[key];

    final debugState = debugStateForQa;
    if (debugState != null) {
      _cache[key] = debugState;
      return debugState;
    }

    String? resolved;
    try {
      final area = await _geocoder.reverse(latitude, longitude);
      if (_isMalaysia(area?.country)) {
        resolved = MalaysiaStateHeroVoice.normalize(area?.administrativeArea);
      }
    } catch (_) {
      // Safe fallback: coordinates remain usable; Hero stays language-only.
      resolved = null;
    }
    _cache[key] = resolved;
    if (kDebugMode) {
      debugPrint('MakanMana local Hero state: ${resolved ?? 'unavailable'}');
    }
    return resolved;
  }

  static String keyFor(double latitude, double longitude) =>
      _keyFor(latitude, longitude);

  static String _keyFor(double latitude, double longitude) =>
      '${latitude.toStringAsFixed(3)},${longitude.toStringAsFixed(3)}';

  static bool _isMalaysia(String? country) {
    final value = country?.trim().toLowerCase();
    return value == 'malaysia' || value == 'my';
  }
}
