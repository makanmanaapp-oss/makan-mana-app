/// MakanMana V3 - Fit Coach data models.
/// Semua model ringan (Map-based Firestore) - selari dengan corak V1/V2.
library;

/// Profil kecergasan pengguna: fitness_profiles/{uid}.
class FitnessProfile {
  const FitnessProfile({
    required this.heightCm,
    required this.weightKg,
    required this.age,
    required this.gender,
    required this.mainGoal,
    required this.fitnessLevel,
    this.bodyFatPercentage,
    this.muscleMassKg,
    this.waistCm,
    this.targetWeightKg,
    this.trainingAccess = const [],
    this.injuries = const [],
    this.medicalConditions = const [],
    this.trainingDaysPerWeek = 3,
    this.preferredTrainingDays = const [],
    this.sessionDurationMinutes = 45,
    this.halalPreference = true,
    this.allergies = const [],
    this.foodDislikes = const [],
    this.budgetMin = 8,
    this.budgetMax = 20,
    this.stepTarget = 8000,
    this.waterTargetMl = 2500,
    this.selectedSportMood,
  });

  final double heightCm;
  final double weightKg;
  final int age;
  final String gender; // male | female
  final String mainGoal;
  final String fitnessLevel; // beginner | intermediate | advanced | athlete
  final double? bodyFatPercentage;
  final double? muscleMassKg;
  final double? waistCm;
  final double? targetWeightKg;
  final List<String> trainingAccess;
  final List<String> injuries;
  final List<String> medicalConditions;
  final int trainingDaysPerWeek;
  final List<String> preferredTrainingDays;
  final int sessionDurationMinutes;
  final bool halalPreference;
  final List<String> allergies;
  final List<String> foodDislikes;
  final int budgetMin;
  final int budgetMax;
  final int stepTarget;
  final int waterTargetMl;
  final String? selectedSportMood;

  Map<String, dynamic> toMap() => {
        'heightCm': heightCm,
        'weightKg': weightKg,
        'age': age,
        'gender': gender,
        'mainGoal': mainGoal,
        'fitnessLevel': fitnessLevel,
        'bodyFatPercentage': bodyFatPercentage,
        'muscleMassKg': muscleMassKg,
        'waistCm': waistCm,
        'targetWeightKg': targetWeightKg,
        'trainingAccess': trainingAccess,
        'injuries': injuries,
        'medicalConditions': medicalConditions,
        'trainingDaysPerWeek': trainingDaysPerWeek,
        'preferredTrainingDays': preferredTrainingDays,
        'sessionDurationMinutes': sessionDurationMinutes,
        'halalPreference': halalPreference,
        'allergies': allergies,
        'foodDislikes': foodDislikes,
        'budgetMin': budgetMin,
        'budgetMax': budgetMax,
        'stepTarget': stepTarget,
        'waterTargetMl': waterTargetMl,
        'selectedSportMood': selectedSportMood,
      };

  static FitnessProfile? fromMap(Map<String, dynamic>? m) {
    if (m == null || m['heightCm'] == null) return null;
    List<String> strList(dynamic v) =>
        (v as List?)?.map((e) => '$e').toList() ?? const [];
    double? d(dynamic v) => (v as num?)?.toDouble();
    return FitnessProfile(
      heightCm: d(m['heightCm']) ?? 170,
      weightKg: d(m['weightKg']) ?? 70,
      age: (m['age'] as num?)?.toInt() ?? 25,
      gender: m['gender'] as String? ?? 'male',
      mainGoal: m['mainGoal'] as String? ?? 'healthyLifestyle',
      fitnessLevel: m['fitnessLevel'] as String? ?? 'beginner',
      bodyFatPercentage: d(m['bodyFatPercentage']),
      muscleMassKg: d(m['muscleMassKg']),
      waistCm: d(m['waistCm']),
      targetWeightKg: d(m['targetWeightKg']),
      trainingAccess: strList(m['trainingAccess']),
      injuries: strList(m['injuries']),
      medicalConditions: strList(m['medicalConditions']),
      trainingDaysPerWeek: (m['trainingDaysPerWeek'] as num?)?.toInt() ?? 3,
      preferredTrainingDays: strList(m['preferredTrainingDays']),
      sessionDurationMinutes:
          (m['sessionDurationMinutes'] as num?)?.toInt() ?? 45,
      halalPreference: m['halalPreference'] as bool? ?? true,
      allergies: strList(m['allergies']),
      foodDislikes: strList(m['foodDislikes']),
      budgetMin: (m['budgetMin'] as num?)?.toInt() ?? 8,
      budgetMax: (m['budgetMax'] as num?)?.toInt() ?? 20,
      stepTarget: (m['stepTarget'] as num?)?.toInt() ?? 8000,
      waterTargetMl: (m['waterTargetMl'] as num?)?.toInt() ?? 2500,
      selectedSportMood: m['selectedSportMood'] as String?,
    );
  }
}

/// Sasaran nutrisi harian dikira dari profil (Mifflin-St Jeor).
class NutritionTargets {
  const NutritionTargets({
    required this.calories,
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
    required this.waterMl,
  });

  final int calories;
  final int proteinG;
  final int carbsG;
  final int fatG;
  final int waterMl;

  static NutritionTargets fromProfile(FitnessProfile p,
      {bool trainingDay = true}) {
    // BMR Mifflin-St Jeor.
    final s = p.gender == 'female' ? -161 : 5;
    final bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + s;
    // Faktor aktiviti dari kekerapan latihan.
    final activity = switch (p.trainingDaysPerWeek) {
      <= 1 => 1.3,
      <= 3 => 1.45,
      <= 5 => 1.6,
      _ => 1.72,
    };
    var tdee = bmr * activity;
    // Pelarasan matlamat - deficit selamat, TIADA deficit melampau.
    tdee += switch (p.mainGoal) {
      'fatLoss' => -400,
      'leanBody' => -250,
      'bodyRecomp' => -100,
      'muscleGain' => 300,
      _ => 0,
    };
    if (!trainingDay) tdee -= 100;
    // Lantai keselamatan: jangan bagi bawah 1400/1200 kcal.
    final floor = p.gender == 'female' ? 1200.0 : 1400.0;
    final calories = tdee.clamp(floor, 4200.0);

    final proteinPerKg = switch (p.mainGoal) {
      'muscleGain' => 2.0,
      'fatLoss' || 'bodyRecomp' || 'leanBody' => 1.8,
      'fighterFitness' || 'sportPerformance' => 1.7,
      _ => 1.4,
    };
    final proteinG = (p.weightKg * proteinPerKg).round();
    final fatG = (calories * 0.25 / 9).round();
    final carbsG =
        ((calories - proteinG * 4 - fatG * 9) / 4).clamp(60, 600).round();
    final waterMl = (p.weightKg * 35).clamp(2000, 4000).round();

    return NutritionTargets(
      calories: calories.round(),
      proteinG: proteinG,
      carbsG: carbsG,
      fatG: fatG,
      waterMl: waterMl,
    );
  }
}

/// Metrik harian: fitness_metrics/{uid_yyyyMMdd}.
class DailyMetrics {
  const DailyMetrics({
    this.caloriesIn = 0,
    this.proteinG = 0,
    this.carbsG = 0,
    this.fatG = 0,
    this.waterMl = 0,
    this.steps = 0,
    this.workoutCompleted = false,
    this.workoutSkipped = false,
    this.mealCount = 0,
    this.healthyMealCount = 0,
    this.sugaryDrinkCount = 0,
  });

  final int caloriesIn;
  final int proteinG;
  final int carbsG;
  final int fatG;
  final int waterMl;
  final int steps;
  final bool workoutCompleted;
  final bool workoutSkipped;
  final int mealCount;
  final int healthyMealCount;
  final int sugaryDrinkCount;

  static DailyMetrics fromMap(Map<String, dynamic>? m) {
    if (m == null) return const DailyMetrics();
    int i(dynamic v) => (v as num?)?.toInt() ?? 0;
    return DailyMetrics(
      caloriesIn: i(m['caloriesIn']),
      proteinG: i(m['protein']),
      carbsG: i(m['carbs']),
      fatG: i(m['fat']),
      waterMl: i(m['waterMl']),
      steps: i(m['steps']),
      workoutCompleted: m['workoutCompleted'] == true,
      workoutSkipped: m['workoutSkipped'] == true,
      mealCount: i(m['mealCount']),
      healthyMealCount: i(m['healthyMealCount']),
      sugaryDrinkCount: i(m['sugaryDrinkCount']),
    );
  }

  /// Daily Fit Score 0-100 mengikut formula spec V3.
  int fitScore(NutritionTargets t, int stepTarget) {
    double score = 0;
    // stepsProgress (max 20)
    score += 20 * (steps / stepTarget).clamp(0, 1);
    // calorieTargetAccuracy (max 20): penuh jika 85-110% target.
    if (caloriesIn > 0) {
      final ratio = caloriesIn / t.calories;
      if (ratio >= 0.85 && ratio <= 1.10) {
        score += 20;
      } else if (ratio >= 0.6 && ratio < 0.85) {
        score += 12;
      } else if (ratio > 1.10 && ratio <= 1.25) {
        score += 10;
      } else if (ratio > 0) {
        score += 5;
      }
    }
    // proteinTarget (max 20)
    score += 20 * (proteinG / t.proteinG).clamp(0, 1);
    // workoutCompletion (max 20)
    if (workoutCompleted) score += 20;
    // waterIntake (max 10)
    score += 10 * (waterMl / t.waterMl).clamp(0, 1);
    // mealQuality (max 10)
    if (mealCount > 0) {
      score += 10 * (healthyMealCount / mealCount).clamp(0, 1);
    }
    // Penalti
    if (caloriesIn > t.calories * 1.3) score -= 10; // overeatPenalty
    if (workoutSkipped && !workoutCompleted) score -= 10;
    if (sugaryDrinkCount >= 2) score -= 4;
    return score.clamp(0, 100).round();
  }
}

/// Satu blok senaman dalam pelan harian.
///
/// [name] dan [detail] ialah teks kanonik yang stabil - ia kekal sebagai
/// muatan persistence dan TIDAK pernah diterjemah. [nameKey] / [detailKey]
/// ialah medan masa-jalan sahaja untuk paparan; ia sengaja dikecualikan
/// daripada [toMap] supaya format tersimpan kekal sama seperti sebelum ini.
class WorkoutBlock {
  const WorkoutBlock({
    required this.name,
    required this.detail,
    this.id,
    this.nameKey,
    this.detailKey,
  });

  final String name;
  final String detail;

  /// ID stabil blok (masa-jalan sahaja).
  final String? id;

  /// Kunci localization tajuk blok (masa-jalan sahaja).
  final String? nameKey;

  /// Kunci localization butiran blok (masa-jalan sahaja).
  final String? detailKey;

  /// Muatan persistence - kekal {name, detail} sahaja.
  Map<String, dynamic> toMap() => {'name': name, 'detail': detail};
}

/// Pelan latihan harian dijana dari Sport Mood + profil.
///
/// Pelan ini TIDAK disimpan ke Firestore - ia dijana semula pada masa-jalan
/// daripada profil. Satu-satunya medan pelan yang ditulis ke Firestore ialah
/// {sportMood, workoutName, durationMinutes, intensity} dalam
/// `workout_sessions` (lihat FitService.logWorkout). Oleh itu [workoutName]
/// mesti kekal teks kanonik English dan bukan label terjemahan.
class DailyPlan {
  const DailyPlan({
    required this.moodId,
    required this.workoutName,
    required this.durationMinutes,
    required this.intensity,
    required this.warmup,
    required this.main,
    required this.cooldown,
    required this.isRestDay,
    this.workoutNameKey,
    this.foodFocusKey,
    this.coachNoteKey,
  });

  /// ID Sport Mood stabil - sumber kebenaran untuk paparan berbilang bahasa.
  final String moodId;

  /// Nama kanonik (English) - ditulis ke workout_sessions.workoutName.
  final String workoutName;

  final int durationMinutes;
  final String intensity;
  final List<WorkoutBlock> warmup;
  final List<WorkoutBlock> main;
  final List<WorkoutBlock> cooldown;
  final bool isRestDay;

  /// Kunci paparan (masa-jalan sahaja - tidak pernah disimpan).
  final String? workoutNameKey;
  final String? foodFocusKey;
  final String? coachNoteKey;
}

/// Cadangan menu dengan MenuFitScore.
class MenuSuggestion {
  const MenuSuggestion({
    required this.menuName,
    required this.calories,
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
    required this.fitScore,
    required this.reasons,
    this.placeId,
    this.placeName,
    this.isHealthy = true,
    this.priceEstimate = 12,
  });

  final String menuName;
  final int calories;
  final int proteinG;
  final int carbsG;
  final int fatG;
  final int fitScore;
  final List<String> reasons;
  final String? placeId;
  final String? placeName;
  final bool isHealthy;
  final int priceEstimate;
}
