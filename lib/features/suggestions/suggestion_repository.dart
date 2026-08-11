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
  });

  final PlaceSummary? primary;
  final List<PlaceSummary> alternatives;
  final String? source;
  final String? sessionId;

  /// true = data contoh/sampel (bukan cadangan live).
  final bool isSample;

  /// true = tiada calon ngam dalam radius/tapisan.
  final bool isEmpty;
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
  await ref.watch(locationContextProvider.future);

  final full = ref.read(makanManaUserContextProvider);
  final dummy = ref.read(dummySuggestionServiceProvider);

  // Tiada Firebase (mod dev): tunjuk SAMPEL berlabel, bukan "live".
  if (!ref.read(firebaseReadyProvider)) {
    return HomeSuggestion(
      primary: dummy.heroPick(),
      alternatives: dummy.nearby(limit: 6),
      source: 'demo_preview',
      isSample: true,
    );
  }

  final payload = full.buildSuggestionRequestBase();
  final res = await ref
      .read(cloudSuggestionServiceProvider)
      .getSuggestions(payload: payload, mode: 'preview');

  // Cloud Function tidak tersedia -> sampel jujur (dilabel), bukan palsu.
  if (res == null) {
    return HomeSuggestion(
      primary: dummy.heroPick(),
      alternatives: dummy.nearby(limit: 6),
      source: 'demo_preview',
      isSample: true,
    );
  }
  if (res.place == null) {
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
