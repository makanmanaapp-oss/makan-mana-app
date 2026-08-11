import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import 'makanmana_user_context_provider.dart';

/// LOCATION CONSISTENCY HOTFIX — satu konteks permintaan lokasi AUTHORITATIF
/// yang dikongsi Home, Explore, Spin dan Restaurant Detail.
///
/// Sebelum ini Explore TIDAK menghantar lat/lng langsung → pelayan jatuh ke
/// lokasi lalai (pusat KL) manakala Home/Spin menghantar GPS sebenar → dua
/// permukaan menunjuk kawasan berbeza. Provider ini menyelesaikan lokasi
/// SEKALI dan menyebarkannya ke semua permukaan supaya konsisten.
@immutable
class LocationRequestContext {
  const LocationRequestContext({
    this.lat,
    this.lng,
    required this.radiusMeters,
    this.locationGrid,
    this.locationUpdatedAt,
    this.source = 'none',
  });

  final double? lat;
  final double? lng;
  final int radiusMeters;

  /// Grid 3dp (≈110 m) — untuk kunci cache klien + diagnostik. Padan kasar
  /// dengan bucket pelayan (contextHash guna latGrid 3dp).
  final String? locationGrid;
  final DateTime? locationUpdatedAt;

  /// 'device_gps' | 'stored' | 'none' — sumber koordinat (kejujuran UI).
  final String source;

  bool get hasLocation => lat != null && lng != null;
  int get radiusKmRounded => (radiusMeters / 1000).round();

  /// Grid 3dp deterministik untuk (lat,lng).
  static String gridFor(double lat, double lng) =>
      '${lat.toStringAsFixed(3)},${lng.toStringAsFixed(3)}';

  /// Kunci cache klien = grid lokasi + radius. Berubah bila LOKASI atau RADIUS
  /// berubah → paksa Explore reset & Home refetch (elak guna cache KL basi
  /// untuk kawasan lain).
  String get cacheKey =>
      hasLocation ? '${locationGrid}_r$radiusMeters' : 'no-loc_r$radiusMeters';

  /// Koordinat bertopeng untuk panel diagnostik debug (bukan lokasi penuh).
  String maskedLatLng() {
    if (!hasLocation) return 'no-loc';
    return '${lat!.toStringAsFixed(2)}…, ${lng!.toStringAsFixed(2)}…';
  }

  LocationRequestContext copyWith({
    double? lat,
    double? lng,
    int? radiusMeters,
    String? locationGrid,
    DateTime? locationUpdatedAt,
    String? source,
  }) =>
      LocationRequestContext(
        lat: lat ?? this.lat,
        lng: lng ?? this.lng,
        radiusMeters: radiusMeters ?? this.radiusMeters,
        locationGrid: locationGrid ?? this.locationGrid,
        locationUpdatedAt: locationUpdatedAt ?? this.locationUpdatedAt,
        source: source ?? this.source,
      );
}

/// Provider AUTHORITATIF: menyelesaikan lokasi peranti + radius SEKALI dan
/// menyebarkannya ke konteks global. Home/Explore/Spin WATCH provider ini —
/// jadi ketiga-tiganya guna lat/lng/radius yang SAMA.
///
/// Invalidasi (ref.invalidate) → GPS diselesai semula → Home refetch (watch
/// .future), Explore reset (pendengar cacheKey), Spin dapat contextHash baharu.
final locationContextProvider =
    FutureProvider<LocationRequestContext>((ref) async {
  // Radius dari Core Spine (satu sumber). Perubahan radius = resolve semula.
  final radiusM = ref.watch(
      makanManaUserContextProvider.select((c) => c.effectiveRadiusMeters));

  final pos = await ref.watch(locationServiceProvider).getPosition();
  if (pos != null) {
    final grid = LocationRequestContext.gridFor(pos.latitude, pos.longitude);
    // Sebarkan ke konteks global (payload Spin + diagnostik membacanya).
    // updateLocation TIDAK menukar radius → tiada gelung rebuild.
    ref.read(makanManaUserContextProvider.notifier).updateLocation(
          pos.latitude,
          pos.longitude,
          locationGrid: grid,
        );
    return LocationRequestContext(
      lat: pos.latitude,
      lng: pos.longitude,
      radiusMeters: radiusM,
      locationGrid: grid,
      locationUpdatedAt: DateTime.now(),
      source: 'device_gps',
    );
  }

  // Tiada fix peranti — guna semula lokasi tersimpan (JANGAN suntik KL di sini).
  final ctx = ref.read(makanManaUserContextProvider);
  return LocationRequestContext(
    lat: ctx.currentLat,
    lng: ctx.currentLng,
    radiusMeters: radiusM,
    locationGrid: ctx.locationGrid,
    locationUpdatedAt: ctx.lastLocationUpdatedAt,
    source: ctx.currentLat != null ? 'stored' : 'none',
  );
});
