import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart' show Locale, ThemeMode, debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/social/social_providers.dart';
import '../features/suggestions/spin_controller.dart';
import '../features/suggestions/suggestion_action_controller.dart';
import '../models/daily_usage.dart';
import '../models/meal.dart';
import '../models/place_summary.dart';
import '../models/user_profile.dart';
import '../repositories/auth_repository.dart';
import '../repositories/event_repository.dart';
import 'services/event_logger.dart';
import 'services/user_brain_service.dart';
import '../repositories/meal_repository.dart';
import '../repositories/profile_repository.dart';
import '../repositories/suggestion_repository.dart';
import '../repositories/usage_repository.dart';
import '../repositories/user_repository.dart';
import 'services/app_prefs.dart';
import 'services/cloud_suggestion_service.dart';
import 'services/dummy_suggestion_service.dart';
import 'services/location_service.dart';
import 'services/mock_purchase_service.dart';
import 'services/notification_service.dart';
import 'mood/mood_formula.dart';
import 'entitlement/entitlement.dart';
import 'entitlement/plan_tier.dart';
import 'providers/location_context_provider.dart';
import 'providers/makanmana_user_context_provider.dart';
import 'services/coupon_service.dart';
import 'services/purchase_service.dart';
import 'services/review_service.dart';

/// Di-override dalam main.dart selepas init.
final sharedPreferencesProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('Override dalam main.dart'),
);

/// true jika Firebase.initializeApp berjaya (selepas flutterfire configure).
final firebaseReadyProvider = Provider<bool>((ref) => false);

final appPrefsProvider =
    Provider<AppPrefs>((ref) => AppPrefs(ref.watch(sharedPreferencesProvider)));

class LanguageNotifier extends StateNotifier<Locale> {
  LanguageNotifier(this._prefs) : super(Locale(_prefs.language ?? 'ms'));

  final AppPrefs _prefs;

  Future<void> setLanguage(String code) async {
    await _prefs.setLanguage(code);
    state = Locale(code);
  }
}

final languageProvider = StateNotifierProvider<LanguageNotifier, Locale>(
  (ref) => LanguageNotifier(ref.watch(appPrefsProvider)),
);

/// SP10: penukar rentetan keutamaan -> ThemeMode (tulen, diuji unit).
/// BRIGHT MODE spec: lalai = Bright (light) melainkan pengguna pilih
/// sendiri; 'system' hanya jika dipilih secara eksplisit.
ThemeMode themeModeFromPref(String? value) => switch (value) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      'system' => ThemeMode.system,
      _ => ThemeMode.light,
    };

/// SP10: Appearance (System/Light/Dark). Keutamaan peranti
/// (SharedPreferences) + cermin ke users/{uid}.uiPreferences.appearance
/// (medan selamat — BUKAN dalam senarai protected SP9.2A).
class AppearanceNotifier extends StateNotifier<ThemeMode> {
  AppearanceNotifier(this._ref)
      : super(themeModeFromPref(_ref.read(appPrefsProvider).appearance));

  final Ref _ref;

  Future<void> setAppearance(String value) async {
    state = themeModeFromPref(value);
    await _ref.read(appPrefsProvider).setAppearance(value);
    // Cermin durable (fire-and-forget; log sahaja jika gagal).
    final uid = _ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    if (uid.isEmpty || !_ref.read(firebaseReadyProvider)) return;
    FirebaseFirestore.instance.collection('users').doc(uid).set({
      'uiPreferences': {'appearance': value},
    }, SetOptions(merge: true)).catchError((Object e) {
      debugPrint('MakanMana appearance sync gagal: $e');
    });
  }
}

final appearanceProvider =
    StateNotifierProvider<AppearanceNotifier, ThemeMode>(
  (ref) => AppearanceNotifier(ref),
);

/// SP7.2: strim auth Firebase — emit setiap kali log masuk/keluar.
final authStateChangesProvider = StreamProvider<User?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(null);
  return FirebaseAuth.instance.authStateChanges();
});

/// SP7.2: uid pengguna semasa, REAKTIF. '' jika belum log masuk.
/// Frame pertama (strim belum emit) fallback ke nilai segerak supaya
/// splash/permulaan app tidak berkelip.
final currentUidProvider = Provider<String>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return '';
  final auth = ref.watch(authStateChangesProvider);
  if (auth.isLoading) return FirebaseAuth.instance.currentUser?.uid ?? '';
  return auth.value?.uid ?? '';
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  // SP7.2 FIX tukar akaun: repo ini di-watch oleh semua provider berskop
  // uid (feed/DM/grup/fit/wallet/plan...). Dengan watch uid semasa di sini,
  // pertukaran akaun me-rebuild repo -> SEMUA provider tersebut dimulakan
  // semula dengan uid baharu. Tanpa ini, strim lama kekal (data akaun
  // lama kelihatan sampai app di-restart).
  ref.watch(currentUidProvider);
  return AuthRepository(firebaseReady: ref.watch(firebaseReadyProvider));
});

final userRepositoryProvider = Provider<UserRepository>(
  (ref) => UserRepository(firebaseReady: ref.watch(firebaseReadyProvider)),
);

final profileRepositoryProvider = Provider<ProfileRepository>(
  (ref) => ProfileRepository(
    firebaseReady: ref.watch(firebaseReadyProvider),
    prefs: ref.watch(appPrefsProvider),
  ),
);

/// ISSUE 003 — muatan sekali UserProfile penuh (termasuk medan kanonikal
/// baharu) untuk paparan Taste Profile. Refresh dgn ref.invalidate.
final loadedUserProfileProvider =
    FutureProvider.autoDispose<UserProfile?>((ref) async {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  return ref.read(profileRepositoryProvider).loadProfile(uid);
});

/// PROMPT 12: pelanggan callable kupon Pro Trial.
final couponServiceProvider =
    Provider<CouponService>((ref) => CouponService());

final dummySuggestionServiceProvider =
    Provider<DummySuggestionService>((ref) => DummySuggestionService());

/// Klien Cloud Functions (Milestone 3). SpinController cuba ini dahulu.
final cloudSuggestionServiceProvider = Provider<CloudSuggestionService>(
  (ref) =>
      CloudSuggestionService(firebaseReady: ref.watch(firebaseReadyProvider)),
);

/// Lokasi peranti (Milestone 4).
final locationServiceProvider =
    Provider<LocationService>((ref) => LocationService());

/// Notifikasi push (V2).
final notificationServiceProvider = Provider<NotificationService>(
  (ref) =>
      NotificationService(firebaseReady: ref.watch(firebaseReadyProvider)),
);

/// Mock pembelian langganan (M5) - ganti dengan RevenueCat kemudian.
final mockPurchaseServiceProvider = Provider<MockPurchaseService>(
  (ref) =>
      MockPurchaseService(firebaseReady: ref.watch(firebaseReadyProvider)),
);

/// Google Play Billing sebenar (M6). Fallback ke mock jika store
/// belum tersedia (app belum di Play Console).
final purchaseServiceProvider = Provider<PurchaseService>((ref) {
  final service =
      PurchaseService(firebaseReady: ref.watch(firebaseReadyProvider));
  ref.onDispose(service.dispose);
  return service;
});

/// Aliran hasil pembelian server-authoritative (pending/jaya/gagal/batal) —
/// UI paywall dengar untuk mesej jujur. TIADA plan ditulis dari klien.
final purchaseResultsProvider = StreamProvider<PurchaseResult>((ref) {
  return ref.watch(purchaseServiceProvider).results;
});

/// Mood terpilih di Home - dihantar ke getSuggestions semasa spin.
final selectedMoodProvider = StateProvider<String>((ref) => 'moodLapar');

/// Tema butang Spin aktif (visual sahaja, tidak ubah algoritma).
final spinThemeProvider = StateProvider<String>(
  (ref) => ref.watch(appPrefsProvider).spinTheme,
);

/// Kegemaran (Save - ciri Plus): status satu tempat.
final isFavoriteProvider =
    StreamProvider.autoDispose.family<bool, String>((ref, placeId) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(false);
  }
  return FirebaseFirestore.instance
      .collection('users')
      .doc(uid)
      .collection('favorites')
      .doc(placeId)
      .snapshots()
      .map((snap) => snap.exists);
});

/// Senarai kegemaran penuh.
final favoritesProvider =
    StreamProvider<List<Map<String, dynamic>>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('users')
      .doc(uid)
      .collection('favorites')
      .orderBy('addedAt', descending: true)
      .limit(100)
      .snapshots()
      .map((snap) => snap.docs.map((d) => d.data()).toList());
});

/// Sistem rating kedai.
final reviewServiceProvider = Provider<ReviewService>(
  (ref) => ReviewService(
    firebaseReady: ref.watch(firebaseReadyProvider),
    prefs: ref.watch(appPrefsProvider),
    socialService: ref.watch(socialServiceProvider),
  ),
);

/// Ulasan komuniti sesebuah kedai (10 terbaru, approved sahaja).
final placeReviewsProvider = StreamProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>((ref, placeId) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(const []);
  return FirebaseFirestore.instance
      .collection('place_reviews')
      .where('placeId', isEqualTo: placeId)
      .where('status', isEqualTo: 'approved')
      .orderBy('createdAt', descending: true)
      .limit(10)
      .snapshots()
      .map((snap) => snap.docs.map((d) => d.data()).toList());
});

/// Skor komuniti kedai (communityRating/communityCount dari place_details).
final placeCommunityProvider = StreamProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, placeId) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(null);
  return FirebaseFirestore.instance
      .collection('place_details')
      .doc(placeId)
      .snapshots()
      .map((snap) => snap.data());
});

/// Tempat berdekatan sebenar untuk Home (hero pick + grid).
/// Fallback ke senarai dummy jika Functions/lokasi tidak tersedia.
final nearbyPlacesProvider =
    FutureProvider<List<PlaceSummary>>((ref) async {
  // Prompt 5: bergantung pada selectedMood — refresh & susun semula bila mood
  // berubah (aplikasi mood dilakukan di client).
  final moodId =
      ref.watch(makanManaUserContextProvider.select((c) => c.selectedMood));
  // LOCATION CONSISTENCY HOTFIX — lat/lng/radius dari SATU sumber authoritative
  // yang dikongsi Home/Explore/Spin. Menggantikan getPosition langsung supaya
  // Home & Explore TIDAK LAGI menunjuk kawasan berbeza. Watch .future = Home
  // refetch automatik bila lokasi/radius berubah (provider di-invalidate).
  final loc = await ref.watch(locationContextProvider.future);
  final remote = await ref.watch(cloudSuggestionServiceProvider).getNearbyPlaces(
        lat: loc.lat,
        lng: loc.lng,
        radius: loc.radiusMeters > 0 ? loc.radiusMeters : 3000,
        languageCode: ref.watch(languageProvider).languageCode,
      );
  final base = (remote != null && remote.isNotEmpty)
      ? remote
      : ref.watch(dummySuggestionServiceProvider).nearby(limit: 12);
  // Susun semula ikut mood (client-side). Tidak menyentuh skor backend.
  final recent = ref.read(makanManaUserContextProvider).recentPlaceIds;
  return applyMoodRanking(
    base,
    moodId: moodId,
    radiusKm: loc.radiusKmRounded,
    recentPlaceIds: recent,
  );
});

/// Cadangan semasa yang dipaparkan pada skrin Suggestion.
final currentSuggestionProvider = StateProvider<PlaceSummary?>((ref) => null);

// ---- Milestone 2: AI Brain asas + had harian ----

final mealRepositoryProvider = Provider<MealRepository>(
  (ref) => MealRepository(
    firebaseReady: ref.watch(firebaseReadyProvider),
    prefs: ref.watch(appPrefsProvider),
  ),
);

final eventRepositoryProvider = Provider<EventRepository>(
  (ref) => EventRepository(firebaseReady: ref.watch(firebaseReadyProvider)),
);

/// Prompt 8: pusat log event AI Brain (enrichment + sanitasi + fire-and-forget).
final eventLoggerProvider =
    Provider<EventLogger>((ref) => EventLogger(ref));

/// Prompt 9: pencetus kira-semula Food Memory / User Brain (throttled).
final userBrainServiceProvider = Provider<UserBrainService>(
  (ref) =>
      UserBrainService(firebaseReady: ref.watch(firebaseReadyProvider)),
);

/// Prompt 10: kelayakan pelan berpusat. Selaraskan userPlanProvider (stream
/// durable dari users/{uid}.plan) dengan MakanManaUserContext.plan.
final entitlementProvider = Provider<Entitlement>((ref) {
  final streamPlan = ref.watch(userPlanProvider).value;
  final ctxPlan =
      ref.watch(makanManaUserContextProvider.select((c) => c.plan));
  return Entitlement(PlanTier.parse(streamPlan ?? ctxPlan));
});

final usageRepositoryProvider = Provider<UsageRepository>(
  (ref) => UsageRepository(
    firebaseReady: ref.watch(firebaseReadyProvider),
    prefs: ref.watch(appPrefsProvider),
  ),
);

final suggestionRepositoryProvider = Provider<SuggestionRepository>(
  (ref) =>
      SuggestionRepository(firebaseReady: ref.watch(firebaseReadyProvider)),
);

final spinControllerProvider =
    Provider<SpinController>((ref) => SpinController(ref));

/// Prompt 7: gelung tindakan cadangan (accept/reject/next) — pemilik tunggal
/// tingkah laku Suggestion Screen untuk spin, preview (Home) dan sample.
final suggestionActionControllerProvider = StateNotifierProvider<
    SuggestionActionController, SuggestionActionState>(
  (ref) => SuggestionActionController(ref),
);

/// Rekod makan pengguna semasa (untuk History).
final mealsProvider = StreamProvider<List<Meal>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  return ref.watch(mealRepositoryProvider).watchMeals(uid);
});

/// Pelan semasa pengguna dari users/{uid}.plan (free | plus | pro).
/// Server ialah penguat kuasa sebenar; ini untuk paparan & fallback lokal.
final userPlanProvider = StreamProvider<String>((ref) {
  final firebaseReady = ref.watch(firebaseReadyProvider);
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!firebaseReady || uid.isEmpty) return Stream.value('free');
  return FirebaseFirestore.instance
      .collection('users')
      .doc(uid)
      .snapshots()
      .map((snap) => (snap.data()?['plan'] as String?) ?? 'free');
});

/// Penggunaan spin hari ini (untuk penunjuk di Home).
/// Guna autoDispose supaya dikira semula setiap kali Home dibina semula.
final dailyUsageProvider = FutureProvider.autoDispose<DailyUsage>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  final plan = ref.watch(userPlanProvider).value ?? 'free';
  return ref.watch(usageRepositoryProvider).getToday(uid, plan);
});
