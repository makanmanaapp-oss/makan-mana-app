import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/providers/location_context_provider.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import '../../models/place_summary.dart';

/// Hasil cadangan untuk Home AI Pick (Prompt 6).
/// Satu model stabil dengan keadaan loading/error/empty/sample.
class HomeSuggestion {
  const HomeSuggestion({
    this.primary,
    this.alternatives = const [],
    this.source,
    this.sessionId,
    this.isSample = false,
    this.isEmpty = false,
    this.isUnavailable = false,
    this.retryable = true,
  });

  final PlaceSummary? primary;
  final List<PlaceSummary> alternatives;
  final String? source;
  final String? sessionId;

  /// true = data contoh/sampel (bukan cadangan live).
  final bool isSample;

  /// true = tiada calon ngam dalam radius/tapisan.
  final bool isEmpty;

  /// WAVE 4A: true = perkhidmatan cadangan tidak dapat dilayan. Berbeza
  /// daripada [isEmpty] — tiada restoran rekaan dipaparkan untuk menutupnya.
  final bool isUnavailable;

  /// WAVE 4A: berbaloi mencuba semula (gangguan lwn salah konfigurasi).
  final bool retryable;
}

/// Home AI Pick berkuasa getSuggestions (mode preview: TIADA had spin,
/// TIADA tulisan sesi). Segar bila mood/radius/profil/lokasi berubah.
final homeSuggestionProvider =
    FutureProvider.autoDispose<HomeSuggestion>((ref) async {
  // Kebergantungan sempit supaya tidak over-fetch setiap rebuild.
  // Lokasi dibundarkan (~1km) supaya jitter GPS tidak trigger refetch.
  ref.watch(makanManaUserContextProvider.select((c) => (
        c.selectedMood,
        c.effectiveRadiusMeters,
        c.budgetMin,
        c.budgetMax,
        c.dietType,
        c.halalPreference,
        c.spicyPreference,
        c.dietGoal,
        c.favoriteCuisines.join(','),
        c.allergies.join(','),
        ((c.currentLat ?? 0) * 100).round(),
        ((c.currentLng ?? 0) * 100).round(),
      )));

  // LOCATION CONSISTENCY — selesaikan lokasi AUTHORITATIF dahulu supaya AI Pick
  // guna GPS sebenar dari fetch pertama (elak fetch KL sementara sebelum GPS
  // sedia + jadikan Home AI Pick sekawasan dengan Explore & Spin). Refetch
  // automatik bila lokasi berubah (provider di-invalidate).
  final loc = await ref.watch(locationContextProvider.future);

  final full = ref.read(makanManaUserContextProvider);

  // AUTHORITY LOKASI (QA-DEV6): tiada lokasi sah (GPS gagal + tiada last-valid
  // disimpan) → JANGAN minta cadangan. Kalau lat/lng null dihantar, pelayan
  // jatuh senyap ke KL. Papar keadaan lokasi-tak-tersedia yang jujur — BUKAN
  // restoran sekitar Kuala Lumpur.
  if (!loc.hasLocation) {
    return const HomeSuggestion(isEmpty: true, source: 'location_unavailable');
  }

  // Tiada Firebase (mod demo eksplisit): tunjuk CONTOH berlabel, bukan "live".
  if (!ref.read(firebaseReadyProvider)) {
    final demo = ref.read(dummySuggestionServiceProvider);
    return HomeSuggestion(
      primary: demo.heroPick(),
      alternatives: demo.nearby(limit: 6),
      source: 'demo_preview',
      isSample: true,
    );
  }

  // LOCATION RACE FIX — lokasi untuk request preview datang TERUS daripada
  // locationContextProvider yang baru diselesaikan, bukan daripada snapshot
  // Core Spine yang boleh ditimpa seketika oleh hydration profil yang bermula
  // sebelum GPS siap. Ini memastikan Home AI Pick dan Nearby menghantar
  // koordinat/radius authoritative yang sama.
  final payload = {
    ...full.buildSuggestionRequestBase(),
    'lat': loc.lat,
    'lng': loc.lng,
    'radiusKm': loc.radiusMeters / 1000,
    'radiusMeters': loc.radiusMeters,
    'locationGrid': loc.locationGrid,
  };
  final res = await ref
      .read(cloudSuggestionServiceProvider)
      .getSuggestions(payload: payload, mode: 'preview');

  // WAVE 4A — Cloud Function tidak dapat dihubungi. Dahulu Home memaparkan
  // sepuluh restoran REKAAN di sini (dilabel sampel, tetapi masih rekaan pada
  // skrin produksi). Kini keadaan "tidak tersedia + cuba lagi" yang jujur.
  if (res == null) {
    return const HomeSuggestion(isUnavailable: true, source: 'unavailable');
  }
  if (res.isUnavailable) {
    return HomeSuggestion(
      isUnavailable: true,
      retryable: res.retryable,
      source: 'unavailable',
    );
  }
  if (res.isEmptyArea || res.place == null) {
    return const HomeSuggestion(isEmpty: true);
  }
  return HomeSuggestion(
    primary: res.place,
    alternatives: res.candidates,
    source: res.source,
    sessionId: res.sessionId,
    isSample: res.isSample,
  );
});
