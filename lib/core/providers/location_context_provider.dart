import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../location/malaysia_state_resolver.dart';
import '../providers.dart';
import '../services/location_service.dart';
import 'makanmana_user_context_provider.dart';

final malaysiaAdministrativeGeocoderProvider =
    Provider<MalaysiaAdministrativeGeocoder>(
  (ref) => PlatformMalaysiaAdministrativeGeocoder(),
);

/// Satu resolver berskop aplikasi/session; cache grid 3dp hidup merentas
/// invalidation lokasi/radius, tetapi tidak menulis data lokasi ke backend.
final malaysiaStateResolverProvider = Provider<MalaysiaStateResolver>(
  (ref) => MalaysiaStateResolver(
    geocoder: ref.watch(malaysiaAdministrativeGeocoderProvider),
  ),
);

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

  // Suntikan state hanya untuk matriks QA debug. Ia memintas GPS supaya
  // empat dialek boleh diuji secara deterministik tanpa perjalanan; release
  // sentiasa menerima null daripada getter ini dan meneruskan aliran biasa.
  final qaState = MalaysiaStateResolver.debugStateForQa;
  if (qaState != null) {
    unawaited(_publishDebugStateForQa(ref, qaState));
    final context = ref.read(makanManaUserContextProvider);
    return LocationRequestContext(
      lat: context.currentLat,
      lng: context.currentLng,
      radiusMeters: radiusM,
      locationGrid: context.locationGrid,
      locationUpdatedAt: context.lastLocationUpdatedAt,
      source: 'debug_state_qa',
    );
  }

  final locService = ref.watch(locationServiceProvider);
  // Berskop-UID: lokasi tepat disimpan tidak bocor antara akaun (QA-DEV7).
  final uid = ref.read(authRepositoryProvider).currentUser?.uid;
  final pos = await locService.getPosition(uid: uid);
  if (pos != null) {
    final grid = LocationRequestContext.gridFor(pos.latitude, pos.longitude);
    final previousGrid = ref.read(makanManaUserContextProvider).locationGrid;
    // Sebarkan ke konteks global (payload Spin + diagnostik membacanya).
    // updateLocation TIDAK menukar radius → tiada gelung rebuild.
    ref.read(makanManaUserContextProvider.notifier).updateLocation(
          pos.latitude,
          pos.longitude,
          locationGrid: grid,
        );
    if (previousGrid != grid) {
      // Jangan paparkan dialek lokasi lama sementara grid baharu sedang
      // diselesaikan secara async.
      ref.read(makanManaUserContextProvider.notifier).updateLocationState(
            locationGrid: grid,
            resolvedState: null,
          );
    }
    // Pengayaan berasingan daripada request lokasi/cadangan: state tidak
    // menangguhkan Home, Spin atau Explore dan hanya geocode sekali per grid.
    unawaited(_resolveStateForCurrentGrid(
      ref,
      latitude: pos.latitude,
      longitude: pos.longitude,
      locationGrid: grid,
    ));
    // AUTHORITY LOKASI (QA-DEV6): bezakan LIVE vs LAST_VALID (kegagalan GPS
    // sementara guna lokasi sah TERAKHIR — BUKAN KL). Label jujur utk UI+QA.
    final src = locService.lastSource == LocationSource.lastValid
        ? 'last_valid'
        : 'device_gps';
    assert(() {
      // QA-only (di-strip release): TIADA koordinat — sumber+grid(hash)+radius.
      debugPrint('MM LOC: source=$src grid=${grid.hashCode} radiusM=$radiusM');
      return true;
    }());
    return LocationRequestContext(
      lat: pos.latitude,
      lng: pos.longitude,
      radiusMeters: radiusM,
      locationGrid: grid,
      locationUpdatedAt: DateTime.now(),
      source: src,
    );
  }

  // Tiada lokasi sah langsung (GPS gagal + tiada last-valid) — JANGAN suntik KL.
  final ctx = ref.read(makanManaUserContextProvider);
  assert(() {
    debugPrint('MM LOC: source=${ctx.currentLat != null ? 'stored' : 'unavailable'} '
        'radiusM=$radiusM');
    return true;
  }());
  return LocationRequestContext(
    lat: ctx.currentLat,
    lng: ctx.currentLng,
    radiusMeters: radiusM,
    locationGrid: ctx.locationGrid,
    locationUpdatedAt: ctx.lastLocationUpdatedAt,
    source: ctx.currentLat != null ? 'stored' : 'none',
  );
});

Future<void> _publishDebugStateForQa(Ref ref, String state) async {
  // Riverpod melarang StateNotifier dikemas kini semasa provider sedang
  // dibina. Tunggu penghidratan awal selesai; hanya laluan QA debug ini
  // berbuat demikian dan ia tidak menangguhkan Home.
  await Future<void>.delayed(const Duration(seconds: 7));
  ref
      .read(makanManaUserContextProvider.notifier)
      .updateDebugLocationStateForQa(state);
  debugPrint('MakanMana local Hero state: $state');
}

Future<void> _resolveStateForCurrentGrid(
  Ref ref, {
  required double latitude,
  required double longitude,
  required String locationGrid,
}) async {
  final resolved = await ref
      .read(malaysiaStateResolverProvider)
      .resolve(latitude, longitude);
  ref.read(makanManaUserContextProvider.notifier).updateLocationState(
        locationGrid: locationGrid,
        resolvedState: resolved,
      );
}
