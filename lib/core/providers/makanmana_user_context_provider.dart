import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/event_log.dart';
import '../data/makanmana_user_context_repository.dart';
import '../models/makanmana_user_context.dart';
import '../providers.dart';
import '../utils/time_slot_utils.dart';

/// Repositori Core Spine.
final makanManaUserContextRepositoryProvider =
    Provider<MakanManaUserContextRepository>(
  (ref) => MakanManaUserContextRepository(
    firebaseReady: ref.watch(firebaseReadyProvider),
  ),
);

/// Provider Core Spine — satu sumber kebenaran global.
///
/// Nota: kekal hidup sepanjang sesi (bukan autoDispose) supaya jambatan
/// (mood/bahasa/tema) berterusan mendengar perubahan provider lama.
final makanManaUserContextProvider = StateNotifierProvider<
    MakanManaUserContextNotifier, MakanManaUserContext>(
  (ref) => MakanManaUserContextNotifier(ref),
);

class MakanManaUserContextNotifier
    extends StateNotifier<MakanManaUserContext> {
  MakanManaUserContextNotifier(this._ref)
      : super(const MakanManaUserContext()) {
    _bridgeLegacyProviders();
  }

  final Ref _ref;

  bool _suppressMood = false;
  bool _suppressLanguage = false;
  bool _suppressTheme = false;

  MakanManaUserContextRepository get _repo =>
      _ref.read(makanManaUserContextRepositoryProvider);

  String get _uid =>
      _ref.read(authRepositoryProvider).currentUser?.uid ?? '';

  // ---------------- Jambatan provider lama (backward compat) ----------------

  /// Dengar provider lama supaya sebarang perubahan (dari skrin sedia ada)
  /// turut mengemas kini konteks global + log event — tanpa menyentuh
  /// skrin tersebut.
  void _bridgeLegacyProviders() {
    _ref.listen<String>(selectedMoodProvider, (prev, next) {
      if (_suppressMood || prev == next) return;
      _applyMood(next, source: 'legacy_provider');
    });
    _ref.listen(languageProvider, (prev, next) {
      final code = next.languageCode;
      if (_suppressLanguage || prev?.languageCode == code) return;
      _applyLanguage(code, source: 'legacy_provider', persist: true);
    });
    _ref.listen<String>(spinThemeProvider, (prev, next) {
      if (_suppressTheme || prev == next) return;
      _applyTheme(next, source: 'legacy_provider', persist: true);
    });
  }

  // ---------------- Hidrat ----------------

  /// Muatkan konteks untuk [uid]. Dilangkau jika sudah dimuat & tidak paksa.
  Future<void> loadForUser(String uid, {bool force = false}) async {
    if (uid.isEmpty) return;
    // Langkau jika sudah/sedang dimuat utk uid sama (elak double-load
    // dari splash + Home). Paksa hanya melalui refresh().
    if (!force &&
        state.loadedUid == uid &&
        (state.loadStatus == ContextLoadStatus.ready ||
            state.loadStatus == ContextLoadStatus.loading)) {
      return;
    }
    // Bawa nilai sesi semasa (mood/bahasa/tema) sebagai asas.
    final base = state.copyWith(
      loadStatus: ContextLoadStatus.loading,
      loadedUid: uid,
      uid: uid,
      selectedMood: _ref.read(selectedMoodProvider),
      activeSpinTheme: _ref.read(spinThemeProvider),
      languageCode: _ref.read(languageProvider).languageCode,
    );
    state = base;
    final hydrated = await _repo.hydrate(uid: uid, base: base);
    // Kekalkan bahasa = locale app semasa (Firestore ialah simpanan durable,
    // tetapi Prompt 2 tidak menukar bahasa yang dilihat).
    state = hydrated.copyWith(
      languageCode: _ref.read(languageProvider).languageCode,
    );
  }

  Future<void> refresh() => loadForUser(_uid, force: true);

  void clear() {
    state = const MakanManaUserContext();
  }

  // ---------------- Kaedah kemas kini ----------------

  Future<void> updateLanguage(String code) async {
    _suppressLanguage = true;
    try {
      await _ref.read(languageProvider.notifier).setLanguage(code);
    } finally {
      _suppressLanguage = false;
    }
    _applyLanguage(code, source: 'updateLanguage', persist: true);
  }

  void updateSelectedMood(String moodId, {String? category}) {
    _suppressMood = true;
    _ref.read(selectedMoodProvider.notifier).state = moodId;
    _suppressMood = false;
    _applyMood(moodId, category: category, source: 'updateSelectedMood');
  }

  void updateSelectedRadiusKm(double radiusKm) {
    final old = state.selectedRadiusKm;
    state = state.copyWith(selectedRadiusKm: radiusKm);
    _log('radius_changed',
        metadata: {'oldValue': old, 'newValue': radiusKm, 'unit': 'km'});
  }

  Future<void> updateDefaultRadiusKm(double radiusKm) async {
    state = state.copyWith(
        defaultRadiusKm: radiusKm, selectedRadiusKm: radiusKm);
    await _repo.writeProfileFields(_uid, {'defaultRadiusKm': radiusKm});
    _log('radius_changed',
        metadata: {'newValue': radiusKm, 'scope': 'default', 'unit': 'km'});
  }

  Future<void> updateLocation(
    double lat,
    double lng, {
    String? locationName,
    String? locationGrid,
    String permissionStatus = 'granted',
  }) async {
    state = state.copyWith(
      currentLat: lat,
      currentLng: lng,
      locationName: locationName,
      locationGrid: locationGrid,
      locationPermissionStatus: permissionStatus,
      lastLocationUpdatedAt: DateTime.now(),
    );
  }

  Future<void> updateFoodProfile(Map<String, dynamic> fields) async {
    state = state.copyWith(
      dietType: fields['dietType'] as String?,
      halalPreference: fields['halalPreference'] as bool?,
      allergies: _asStrList(fields['allergies']) ?? state.allergies,
      budgetMin: (fields['budgetMin'] as num?)?.toInt(),
      budgetMax: (fields['budgetMax'] as num?)?.toInt(),
      favoriteCuisines:
          _asStrList(fields['favoriteCuisines']) ?? state.favoriteCuisines,
      spicyPreference: (fields['spicyPreference'] as num?)?.toInt(),
      usualMealTimes:
          _asStrList(fields['usualMealTimes']) ?? state.usualMealTimes,
      dislikedFoods:
          _asStrList(fields['dislikedFoods']) ?? state.dislikedFoods,
      preferredMealTypes: _asStrList(fields['preferredMealTypes']) ??
          state.preferredMealTypes,
      drinkPreference: fields['drinkPreference'] as String?,
      sweetDrinkHabit: fields['sweetDrinkHabit'] as String?,
    );
    await _repo.writeProfileFields(_uid, fields);
    _log('profile_updated', metadata: {'fields': fields.keys.toList()});
    // Prompt 9: profil berubah -> kemas kini Food Memory (throttled).
    _ref.read(userBrainServiceProvider).recalculate();
  }

  Future<void> updateDietAndAllergy({
    String? dietType,
    bool? halalPreference,
    List<String>? allergies,
  }) =>
      updateFoodProfile({
        if (dietType != null) 'dietType': dietType,
        if (halalPreference != null) 'halalPreference': halalPreference,
        if (allergies != null) 'allergies': allergies,
      });

  Future<void> updateBudgetRange(int budgetMin, int budgetMax) =>
      updateFoodProfile({'budgetMin': budgetMin, 'budgetMax': budgetMax});

  Future<void> updateFavoriteCuisines(List<String> cuisines) =>
      updateFoodProfile({'favoriteCuisines': cuisines});

  Future<void> updateSpicyPreference(int level) =>
      updateFoodProfile({'spicyPreference': level});

  Future<void> updateUsualMealTimes(List<String> times) =>
      updateFoodProfile({'usualMealTimes': times});

  Future<void> updateDietGoal(String dietGoal) async {
    final old = state.dietGoal;
    state = state.copyWith(dietGoal: dietGoal);
    await _repo.writeDietGoal(_uid, dietGoal);
    _log('diet_goal_updated',
        metadata: {'oldValue': old, 'newValue': dietGoal});
  }

  Future<void> updateFitGoal(String fitGoal) async {
    final old = state.fitGoal;
    state = state.copyWith(fitGoal: fitGoal);
    await _repo.writeFitGoal(_uid, fitGoal);
    _log('fit_goal_updated',
        metadata: {'oldValue': old, 'newValue': fitGoal});
  }

  Future<void> updateSportMood(String sportMood) async {
    state = state.copyWith(sportMood: sportMood);
    await _repo.writeSportMood(_uid, sportMood);
    _log('sport_mood_selected', metadata: {'newValue': sportMood});
  }

  void updateSpinTheme(String themeId) {
    _suppressTheme = true;
    _ref.read(spinThemeProvider.notifier).state = themeId;
    _suppressTheme = false;
    _applyTheme(themeId, source: 'updateSpinTheme', persist: true);
  }

  /// Asas payload untuk getSuggestions (Prompt 6). Tidak dipanggil oleh Home.
  Map<String, dynamic> buildSuggestionRequestBase() =>
      state.buildSuggestionRequestBase();

  // ---------------- Dalaman ----------------

  void _applyMood(String moodId, {String? category, required String source}) {
    final old = state.selectedMood;
    state = state.copyWith(
      selectedMood: moodId,
      selectedMoodCategory: category,
      lastMoodChangedAt: DateTime.now(),
    );
    _log('mood_selected', metadata: {
      'oldMood': old,
      'newMood': moodId,
      if (category != null) 'moodCategory': category,
      'selectedRadiusKm': state.effectiveRadiusKm,
      'sourceScreen': source,
    });
  }

  void _applyLanguage(String code,
      {required String source, required bool persist}) {
    state = state.copyWith(languageCode: code);
    if (persist) {
      // Simpan durable ke users/{uid}.language (migrasi dari SharedPreferences).
      _repo.writeLanguage(_uid, code);
    }
    _log('language_changed', metadata: {'newValue': code, 'source': source});
  }

  void _applyTheme(String themeId,
      {required String source, required bool persist}) {
    state = state.copyWith(activeSpinTheme: themeId);
    if (persist) {
      _ref.read(appPrefsProvider).setSpinTheme(themeId);
      _repo.writeUiPreferences(_uid, {'spinTheme': themeId});
    }
    _log('spin_theme_changed',
        metadata: {'newValue': themeId, 'source': source});
  }

  /// Pembalut log selamat — guna pipeline event AI Brain sedia ada.
  /// Tiada butiran kesihatan/badan sensitif dilog dalam produksi.
  void _log(String type, {Map<String, dynamic> metadata = const {}}) {
    try {
      _ref.read(eventRepositoryProvider).log(EventLog(
            userId: _uid,
            eventType: type,
            timeSlot: TimeSlotUtils.now(),
            languageCode: state.languageCode,
            plan: state.plan,
            mood: state.selectedMood,
            metadata: metadata,
          ));
    } catch (e) {
      // Log tidak boleh menyekat kemas kini konteks.
      debugPrint('MakanMana context: log $type gagal: $e');
    }
  }

  static List<String>? _asStrList(Object? v) {
    if (v is List) {
      return v.map((e) => e.toString()).toList();
    }
    return null;
  }
}
