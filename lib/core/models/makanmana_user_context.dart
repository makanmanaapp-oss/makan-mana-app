/// MakanMana Core Spine — satu sumber kebenaran (single source of truth)
/// untuk keseluruhan konteks pengguna: identiti, lokasi, radius, profil
/// makanan, mood, tema, food memory, sejarah makan, diet goal, jambatan
/// Fit/Sport, bajet dan sesi cadangan.
///
/// Nota seni bina (Prompt 2):
/// - Ini HANYA lapisan konteks. Ia tidak mengubah enjin cadangan, Home,
///   Meal Plan atau UI radius.
/// - Semua medan ada nilai lalai selamat supaya dokumen Firestore yang
///   hilang/separa tidak akan menyebabkan crash.
/// - Radius disimpan dalam KM (bukan meter). Guna [effectiveRadiusMeters]
///   apabila memanggil Cloud Function nanti (Prompt 6).
library;

enum ContextLoadStatus { idle, loading, ready, error }

/// Nilai lalai berkongsi supaya konsisten di seluruh app.
class ContextDefaults {
  ContextDefaults._();

  static const languageCode = 'ms';
  static const plan = 'free';
  static const role = 'user';
  static const selectedMood = 'moodLapar';
  static const spinTheme = 'magicPlate';

  static const radiusKm = 3.0;
  static const defaultRadiusKm = 3.0;
  static const preferredNearbyDistanceKm = 3.0;
  static const maxTravelDistanceKm = 15.0;

  static const budgetMin = 8;
  static const budgetMax = 30; // selaras dgn UserProfile lama (elak regresi)
  static const spicyPreference = 2; // 0..3 (selaras UserProfile lama)
  static const stepTarget = 8000;
  static const budgetMode = 'balanced';

  static const allowedPlans = {'free', 'plus', 'pro'};
  static const allowedRoles = {
    'user',
    'owner',
    'admin',
    'cs_support',
    'developer',
  };
  static const allowedLanguages = {'ms', 'en', 'zh', 'ta'};
}

/// Konteks pengguna global — objek keadaan tidak boleh ubah (immutable).
class MakanManaUserContext {
  const MakanManaUserContext({
    this.loadStatus = ContextLoadStatus.idle,
    this.loadedUid,
    this.lastError,
    // A. Identiti
    this.uid = '',
    this.email = '',
    this.displayName = '',
    this.plan = ContextDefaults.plan,
    this.role = ContextDefaults.role,
    this.languageCode = ContextDefaults.languageCode,
    this.createdAt,
    this.updatedAt,
    // B. Lokasi & radius
    this.currentLat,
    this.currentLng,
    this.locationName,
    this.locationGrid,
    this.selectedRadiusKm = ContextDefaults.radiusKm,
    this.defaultRadiusKm = ContextDefaults.defaultRadiusKm,
    this.preferredNearbyDistanceKm =
        ContextDefaults.preferredNearbyDistanceKm,
    this.maxTravelDistanceKm = ContextDefaults.maxTravelDistanceKm,
    this.locationPermissionStatus = 'unknown',
    this.lastLocationUpdatedAt,
    // C. Profil Makanan
    this.dietType = 'none',
    this.halalPreference = true,
    this.allergies = const [],
    this.budgetMin = ContextDefaults.budgetMin,
    this.budgetMax = ContextDefaults.budgetMax,
    this.favoriteCuisines = const [],
    this.spicyPreference = ContextDefaults.spicyPreference,
    this.usualMealTimes = const ['lunch', 'dinner'],
    this.dislikedFoods = const [],
    this.preferredMealTypes = const [],
    this.drinkPreference,
    this.sweetDrinkHabit,
    // D. Mood
    this.selectedMood = ContextDefaults.selectedMood,
    this.selectedMoodCategory,
    this.moodFormulaId,
    this.activeMoodWeights = const {},
    this.lastMoodChangedAt,
    // E. Tema / spin
    this.activeSpinTheme = ContextDefaults.spinTheme,
    this.activeButtonLabel,
    this.hapticEnabled = true,
    this.soundEnabled = false,
    this.seasonalThemeEnabled = true,
    // F. Food Memory ringkasan
    this.foodMemorySummary,
    this.topCuisines = const [],
    this.avoidedCuisines = const [],
    this.preferredPriceLevel,
    this.preferredDistanceKm = ContextDefaults.preferredNearbyDistanceKm,
    this.commonRejectReasons = const [],
    this.repeatTolerance = 0.5,
    this.explorationLevel = 0.5,
    this.healthyPreference,
    this.heavyFoodFrequency,
    this.acceptRate,
    this.rejectRate,
    this.lastFoodMemoryUpdatedAt,
    // G. Sejarah makan ringkasan
    this.lastMeals = const [],
    this.lastMealAt,
    this.recentCuisineTags = const [],
    this.recentHealthTags = const [],
    this.recentPlaceIds = const [],
    // H. Pro / Diet Goal
    this.dietGoal = 'seimbang',
    this.healthGoal,
    this.calorieTarget,
    this.proteinTarget,
    this.carbsTarget,
    this.fatTarget,
    this.mealPlanPreference,
    this.aiCoachEnabled = false,
    // I. Fit / Sport bridge
    this.fitGoal = 'none',
    this.sportMood = 'none',
    this.trainingDay = false,
    this.stepTarget = ContextDefaults.stepTarget,
    this.dailyFitScore,
    // J. Bajet
    this.dailyBudget,
    this.weeklyBudget,
    this.monthlyBudget,
    this.budgetMode = ContextDefaults.budgetMode,
    this.budgetLeftToday,
    this.budgetLeftWeek,
    this.averageMealSpend,
    this.drinkSpendPattern,
    // K. Sesi cadangan
    this.activeSuggestionSessionId,
    this.lastSuggestionId,
    this.shownPlaceIds = const [],
    this.rejectedPlaceIds = const [],
    this.acceptedPlaceId,
  });

  // Meta
  final ContextLoadStatus loadStatus;
  final String? loadedUid;
  final String? lastError;

  // A. Identiti
  final String uid;
  final String email;
  final String displayName;
  final String plan;
  final String role;
  final String languageCode;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  // B. Lokasi & radius
  final double? currentLat;
  final double? currentLng;
  final String? locationName;
  final String? locationGrid;
  final double selectedRadiusKm;
  final double defaultRadiusKm;
  final double preferredNearbyDistanceKm;
  final double maxTravelDistanceKm;
  final String locationPermissionStatus;
  final DateTime? lastLocationUpdatedAt;

  // C. Profil Makanan
  final String dietType;
  final bool halalPreference;
  final List<String> allergies;
  final int budgetMin;
  final int budgetMax;
  final List<String> favoriteCuisines;
  final int spicyPreference;
  final List<String> usualMealTimes;
  final List<String> dislikedFoods;
  final List<String> preferredMealTypes;
  final String? drinkPreference;
  final String? sweetDrinkHabit;

  // D. Mood
  final String selectedMood;
  final String? selectedMoodCategory;
  final String? moodFormulaId;
  final Map<String, double> activeMoodWeights;
  final DateTime? lastMoodChangedAt;

  // E. Tema / spin
  final String activeSpinTheme;
  final String? activeButtonLabel;
  final bool hapticEnabled;
  final bool soundEnabled;
  final bool seasonalThemeEnabled;

  // F. Food Memory
  final Map<String, dynamic>? foodMemorySummary;
  final List<String> topCuisines;
  final List<String> avoidedCuisines;
  final int? preferredPriceLevel;
  final double preferredDistanceKm;
  final List<String> commonRejectReasons;
  final double repeatTolerance;
  final double explorationLevel;
  final double? healthyPreference;
  final double? heavyFoodFrequency;
  final double? acceptRate;
  final double? rejectRate;
  final DateTime? lastFoodMemoryUpdatedAt;

  // G. Sejarah makan
  final List<Map<String, dynamic>> lastMeals;
  final DateTime? lastMealAt;
  final List<String> recentCuisineTags;
  final List<String> recentHealthTags;
  final List<String> recentPlaceIds;

  // H. Pro / Diet Goal
  final String dietGoal;
  final String? healthGoal;
  final int? calorieTarget;
  final int? proteinTarget;
  final int? carbsTarget;
  final int? fatTarget;
  final String? mealPlanPreference;
  final bool aiCoachEnabled;

  // I. Fit / Sport bridge
  final String fitGoal;
  final String sportMood;
  final bool trainingDay;
  final int stepTarget;
  final int? dailyFitScore;

  // J. Bajet
  final double? dailyBudget;
  final double? weeklyBudget;
  final double? monthlyBudget;
  final String budgetMode;
  final double? budgetLeftToday;
  final double? budgetLeftWeek;
  final double? averageMealSpend;
  final String? drinkSpendPattern;

  // K. Sesi cadangan
  final String? activeSuggestionSessionId;
  final String? lastSuggestionId;
  final List<String> shownPlaceIds;
  final List<String> rejectedPlaceIds;
  final String? acceptedPlaceId;

  // ---------------- Helper terbitan ----------------

  bool get isReady => loadStatus == ContextLoadStatus.ready;
  bool get isPro => plan == 'pro';
  bool get isPlusOrPro => plan == 'plus' || plan == 'pro';

  /// Radius berkesan (KM) — cap pada julat munasabah.
  double get effectiveRadiusKm {
    final r = selectedRadiusKm > 0 ? selectedRadiusKm : defaultRadiusKm;
    if (r <= 0) return ContextDefaults.defaultRadiusKm;
    return r.clamp(0.5, maxTravelDistanceKm).toDouble();
  }

  /// Radius berkesan dalam meter (untuk Cloud Function nanti).
  int get effectiveRadiusMeters => (effectiveRadiusKm * 1000).round();

  /// Cuisine kegemaran dinormalkan huruf kecil (untuk padanan selamat).
  List<String> get favoriteCuisinesLower =>
      favoriteCuisines.map((c) => c.toLowerCase()).toList();

  // ---------------- Payload builder (Prompt 6) ----------------

  /// Asas payload untuk getSuggestions. TIDAK dipanggil oleh Home dalam
  /// Prompt 2 — hanya disediakan & boleh diperiksa/diuji.
  Map<String, dynamic> buildSuggestionRequestBase() => {
        'userId': uid,
        'languageCode': languageCode,
        'plan': plan,
        'lat': currentLat,
        'lng': currentLng,
        'radiusKm': effectiveRadiusKm,
        'radiusMeters': effectiveRadiusMeters,
        'locationGrid': locationGrid,
        'selectedMood': selectedMood,
        'dietType': dietType,
        'halalPreference': halalPreference,
        'allergies': allergies,
        'budgetMin': budgetMin,
        'budgetMax': budgetMax,
        'favoriteCuisines': favoriteCuisines,
        'spicyPreference': spicyPreference,
        'usualMealTimes': usualMealTimes,
        'dietGoal': dietGoal,
        'fitGoal': fitGoal,
        'sportMood': sportMood,
        'lastMeals': lastMeals,
        'recentCuisineTags': recentCuisineTags,
        'recentHealthTags': recentHealthTags,
        'recentPlaceIds': recentPlaceIds,
        'foodMemorySummary': foodMemorySummary,
        'preferredDistanceKm': preferredDistanceKm,
        'preferredPriceLevel': preferredPriceLevel,
        'commonRejectReasons': commonRejectReasons,
      };

  /// Alias kegunaan lain.
  Map<String, dynamic> toSuggestionPayload() => buildSuggestionRequestBase();
  Map<String, dynamic> toGetSuggestionsPayload() =>
      buildSuggestionRequestBase();

  MakanManaUserContext copyWith({
    ContextLoadStatus? loadStatus,
    String? loadedUid,
    String? lastError,
    String? uid,
    String? email,
    String? displayName,
    String? plan,
    String? role,
    String? languageCode,
    DateTime? createdAt,
    DateTime? updatedAt,
    double? currentLat,
    double? currentLng,
    String? locationName,
    String? locationGrid,
    double? selectedRadiusKm,
    double? defaultRadiusKm,
    double? preferredNearbyDistanceKm,
    double? maxTravelDistanceKm,
    String? locationPermissionStatus,
    DateTime? lastLocationUpdatedAt,
    String? dietType,
    bool? halalPreference,
    List<String>? allergies,
    int? budgetMin,
    int? budgetMax,
    List<String>? favoriteCuisines,
    int? spicyPreference,
    List<String>? usualMealTimes,
    List<String>? dislikedFoods,
    List<String>? preferredMealTypes,
    String? drinkPreference,
    String? sweetDrinkHabit,
    String? selectedMood,
    String? selectedMoodCategory,
    String? moodFormulaId,
    Map<String, double>? activeMoodWeights,
    DateTime? lastMoodChangedAt,
    String? activeSpinTheme,
    String? activeButtonLabel,
    bool? hapticEnabled,
    bool? soundEnabled,
    bool? seasonalThemeEnabled,
    Map<String, dynamic>? foodMemorySummary,
    List<String>? topCuisines,
    List<String>? avoidedCuisines,
    int? preferredPriceLevel,
    double? preferredDistanceKm,
    List<String>? commonRejectReasons,
    double? repeatTolerance,
    double? explorationLevel,
    double? healthyPreference,
    double? heavyFoodFrequency,
    double? acceptRate,
    double? rejectRate,
    DateTime? lastFoodMemoryUpdatedAt,
    List<Map<String, dynamic>>? lastMeals,
    DateTime? lastMealAt,
    List<String>? recentCuisineTags,
    List<String>? recentHealthTags,
    List<String>? recentPlaceIds,
    String? dietGoal,
    String? healthGoal,
    int? calorieTarget,
    int? proteinTarget,
    int? carbsTarget,
    int? fatTarget,
    String? mealPlanPreference,
    bool? aiCoachEnabled,
    String? fitGoal,
    String? sportMood,
    bool? trainingDay,
    int? stepTarget,
    int? dailyFitScore,
    double? dailyBudget,
    double? weeklyBudget,
    double? monthlyBudget,
    String? budgetMode,
    double? budgetLeftToday,
    double? budgetLeftWeek,
    double? averageMealSpend,
    String? drinkSpendPattern,
    String? activeSuggestionSessionId,
    String? lastSuggestionId,
    List<String>? shownPlaceIds,
    List<String>? rejectedPlaceIds,
    String? acceptedPlaceId,
  }) {
    return MakanManaUserContext(
      loadStatus: loadStatus ?? this.loadStatus,
      loadedUid: loadedUid ?? this.loadedUid,
      lastError: lastError ?? this.lastError,
      uid: uid ?? this.uid,
      email: email ?? this.email,
      displayName: displayName ?? this.displayName,
      plan: plan ?? this.plan,
      role: role ?? this.role,
      languageCode: languageCode ?? this.languageCode,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      currentLat: currentLat ?? this.currentLat,
      currentLng: currentLng ?? this.currentLng,
      locationName: locationName ?? this.locationName,
      locationGrid: locationGrid ?? this.locationGrid,
      selectedRadiusKm: selectedRadiusKm ?? this.selectedRadiusKm,
      defaultRadiusKm: defaultRadiusKm ?? this.defaultRadiusKm,
      preferredNearbyDistanceKm:
          preferredNearbyDistanceKm ?? this.preferredNearbyDistanceKm,
      maxTravelDistanceKm: maxTravelDistanceKm ?? this.maxTravelDistanceKm,
      locationPermissionStatus:
          locationPermissionStatus ?? this.locationPermissionStatus,
      lastLocationUpdatedAt:
          lastLocationUpdatedAt ?? this.lastLocationUpdatedAt,
      dietType: dietType ?? this.dietType,
      halalPreference: halalPreference ?? this.halalPreference,
      allergies: allergies ?? this.allergies,
      budgetMin: budgetMin ?? this.budgetMin,
      budgetMax: budgetMax ?? this.budgetMax,
      favoriteCuisines: favoriteCuisines ?? this.favoriteCuisines,
      spicyPreference: spicyPreference ?? this.spicyPreference,
      usualMealTimes: usualMealTimes ?? this.usualMealTimes,
      dislikedFoods: dislikedFoods ?? this.dislikedFoods,
      preferredMealTypes: preferredMealTypes ?? this.preferredMealTypes,
      drinkPreference: drinkPreference ?? this.drinkPreference,
      sweetDrinkHabit: sweetDrinkHabit ?? this.sweetDrinkHabit,
      selectedMood: selectedMood ?? this.selectedMood,
      selectedMoodCategory: selectedMoodCategory ?? this.selectedMoodCategory,
      moodFormulaId: moodFormulaId ?? this.moodFormulaId,
      activeMoodWeights: activeMoodWeights ?? this.activeMoodWeights,
      lastMoodChangedAt: lastMoodChangedAt ?? this.lastMoodChangedAt,
      activeSpinTheme: activeSpinTheme ?? this.activeSpinTheme,
      activeButtonLabel: activeButtonLabel ?? this.activeButtonLabel,
      hapticEnabled: hapticEnabled ?? this.hapticEnabled,
      soundEnabled: soundEnabled ?? this.soundEnabled,
      seasonalThemeEnabled: seasonalThemeEnabled ?? this.seasonalThemeEnabled,
      foodMemorySummary: foodMemorySummary ?? this.foodMemorySummary,
      topCuisines: topCuisines ?? this.topCuisines,
      avoidedCuisines: avoidedCuisines ?? this.avoidedCuisines,
      preferredPriceLevel: preferredPriceLevel ?? this.preferredPriceLevel,
      preferredDistanceKm: preferredDistanceKm ?? this.preferredDistanceKm,
      commonRejectReasons: commonRejectReasons ?? this.commonRejectReasons,
      repeatTolerance: repeatTolerance ?? this.repeatTolerance,
      explorationLevel: explorationLevel ?? this.explorationLevel,
      healthyPreference: healthyPreference ?? this.healthyPreference,
      heavyFoodFrequency: heavyFoodFrequency ?? this.heavyFoodFrequency,
      acceptRate: acceptRate ?? this.acceptRate,
      rejectRate: rejectRate ?? this.rejectRate,
      lastFoodMemoryUpdatedAt:
          lastFoodMemoryUpdatedAt ?? this.lastFoodMemoryUpdatedAt,
      lastMeals: lastMeals ?? this.lastMeals,
      lastMealAt: lastMealAt ?? this.lastMealAt,
      recentCuisineTags: recentCuisineTags ?? this.recentCuisineTags,
      recentHealthTags: recentHealthTags ?? this.recentHealthTags,
      recentPlaceIds: recentPlaceIds ?? this.recentPlaceIds,
      dietGoal: dietGoal ?? this.dietGoal,
      healthGoal: healthGoal ?? this.healthGoal,
      calorieTarget: calorieTarget ?? this.calorieTarget,
      proteinTarget: proteinTarget ?? this.proteinTarget,
      carbsTarget: carbsTarget ?? this.carbsTarget,
      fatTarget: fatTarget ?? this.fatTarget,
      mealPlanPreference: mealPlanPreference ?? this.mealPlanPreference,
      aiCoachEnabled: aiCoachEnabled ?? this.aiCoachEnabled,
      fitGoal: fitGoal ?? this.fitGoal,
      sportMood: sportMood ?? this.sportMood,
      trainingDay: trainingDay ?? this.trainingDay,
      stepTarget: stepTarget ?? this.stepTarget,
      dailyFitScore: dailyFitScore ?? this.dailyFitScore,
      dailyBudget: dailyBudget ?? this.dailyBudget,
      weeklyBudget: weeklyBudget ?? this.weeklyBudget,
      monthlyBudget: monthlyBudget ?? this.monthlyBudget,
      budgetMode: budgetMode ?? this.budgetMode,
      budgetLeftToday: budgetLeftToday ?? this.budgetLeftToday,
      budgetLeftWeek: budgetLeftWeek ?? this.budgetLeftWeek,
      averageMealSpend: averageMealSpend ?? this.averageMealSpend,
      drinkSpendPattern: drinkSpendPattern ?? this.drinkSpendPattern,
      activeSuggestionSessionId:
          activeSuggestionSessionId ?? this.activeSuggestionSessionId,
      lastSuggestionId: lastSuggestionId ?? this.lastSuggestionId,
      shownPlaceIds: shownPlaceIds ?? this.shownPlaceIds,
      rejectedPlaceIds: rejectedPlaceIds ?? this.rejectedPlaceIds,
      acceptedPlaceId: acceptedPlaceId ?? this.acceptedPlaceId,
    );
  }
}
