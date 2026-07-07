import 'dart:ui';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/social/social_providers.dart';
import '../features/suggestions/spin_controller.dart';
import '../models/daily_usage.dart';
import '../models/meal.dart';
import '../models/place_summary.dart';
import '../repositories/auth_repository.dart';
import '../repositories/event_repository.dart';
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

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(firebaseReady: ref.watch(firebaseReadyProvider)),
);

final userRepositoryProvider = Provider<UserRepository>(
  (ref) => UserRepository(firebaseReady: ref.watch(firebaseReadyProvider)),
);

final profileRepositoryProvider = Provider<ProfileRepository>(
  (ref) => ProfileRepository(
    firebaseReady: ref.watch(firebaseReadyProvider),
    prefs: ref.watch(appPrefsProvider),
  ),
);

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
  final position =
      await ref.watch(locationServiceProvider).getPosition();
  final remote = await ref.watch(cloudSuggestionServiceProvider).getNearbyPlaces(
        lat: position?.latitude,
        lng: position?.longitude,
        radius: 3000,
        languageCode: ref.watch(languageProvider).languageCode,
      );
  if (remote != null && remote.isNotEmpty) return remote;
  return ref.watch(dummySuggestionServiceProvider).nearby(limit: 12);
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
