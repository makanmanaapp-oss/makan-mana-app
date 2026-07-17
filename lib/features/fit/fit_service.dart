import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../../core/utils/time_slot_utils.dart';
import '../../models/event_log.dart';
import '../../models/place_summary.dart';
import '../../repositories/event_repository.dart';
import 'fit_models.dart';
import 'sport_moods_data.dart';

/// Enjin MakanMana Fit Coach (V3).
/// Semua tulisan log guna corak fire-and-forget (jangan tunggu ack server).
class FitService {
  FitService({
    required this.firebaseReady,
    required this.uid,
    required this.plan,
    required this.languageCode,
    required EventRepository events,
  }) : _events = events;

  final bool firebaseReady;
  final String uid;
  final String plan;
  final String languageCode;
  final EventRepository _events;

  FirebaseFirestore get _db => FirebaseFirestore.instance;
  bool get _ready => firebaseReady && uid.isNotEmpty;

  static String dateKey(DateTime d) =>
      '${d.year}${d.month.toString().padLeft(2, '0')}${d.day.toString().padLeft(2, '0')}';

  static String weekKey(DateTime d) {
    final monday = d.subtract(Duration(days: d.weekday - 1));
    return dateKey(monday);
  }

  void logEvent(String type, {Map<String, dynamic> metadata = const {}}) {
    unawaited(_events.log(EventLog(
      userId: uid,
      eventType: type,
      timeSlot: TimeSlotUtils.now(),
      languageCode: languageCode,
      plan: plan,
      metadata: metadata,
    )));
  }

  void _fireAndForget(Future<void> future, String label) {
    unawaited(future.then(
      (v) {},
      onError: (Object e) => debugPrint('MakanMana Fit: $label gagal: $e'),
    ));
  }

  // ---------- Profil ----------

  Future<void> saveProfile(FitnessProfile profile) async {
    if (!_ready) return;
    _fireAndForget(
      _db.collection('fitness_profiles').doc(uid).set({
        ...profile.toMap(),
        'userId': uid,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true)),
      'saveProfile',
    );
    logEvent('fit_onboarding_completed',
        metadata: {'goal': profile.mainGoal, 'level': profile.fitnessLevel});
  }

  Future<void> updateProfileFields(Map<String, dynamic> fields) async {
    if (!_ready) return;
    _fireAndForget(
      _db.collection('fitness_profiles').doc(uid).set({
        ...fields,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true)),
      'updateProfile',
    );
  }

  void selectSportMood(String moodId) {
    updateProfileFields({'selectedSportMood': moodId});
    _fireAndForget(
      _db.collection('sport_preferences').doc(uid).set({
        'userId': uid,
        'selectedSportMoods': FieldValue.arrayUnion([moodId]),
        'primarySportGoal': moodId,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true)),
      'sportPreference',
    );
    logEvent('sport_mood_selected', metadata: {'mood': moodId});
  }

  // ---------- Ukuran badan ----------

  void addBodyMeasurement({
    required double weightKg,
    double? bodyFatPercentage,
    double? muscleMassKg,
    double? waistCm,
    String? notes,
  }) {
    if (!_ready) return;
    final now = DateTime.now();
    _fireAndForget(
      _db
          .collection('body_measurements')
          .doc(uid)
          .collection('entries')
          .doc(dateKey(now))
          .set({
        'userId': uid,
        'date': dateKey(now),
        'weightKg': weightKg,
        'bodyFatPercentage': bodyFatPercentage,
        'muscleMassKg': muscleMassKg,
        'waistCm': waistCm,
        'notes': notes,
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true)),
      'bodyMeasurement',
    );
    // Segerakkan berat terkini ke profil (sasaran dikira dari sini).
    updateProfileFields({
      'weightKg': weightKg,
      if (bodyFatPercentage != null) 'bodyFatPercentage': bodyFatPercentage,
      if (muscleMassKg != null) 'muscleMassKg': muscleMassKg,
      if (waistCm != null) 'waistCm': waistCm,
    });
    logEvent('body_measurement_added');
  }

  // ---------- Metrik harian ----------

  DocumentReference<Map<String, dynamic>> _metricsDoc([DateTime? day]) => _db
      .collection('fitness_metrics')
      .doc('${uid}_${dateKey(day ?? DateTime.now())}');

  void _touchMetrics(Map<String, dynamic> fields) {
    if (!_ready) return;
    final now = DateTime.now();
    _fireAndForget(
      _metricsDoc(now).set({
        'userId': uid,
        'date': dateKey(now),
        ...fields,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true)),
      'metrics',
    );
  }

  void logMeal({
    required String menuName,
    required int calories,
    required int proteinG,
    required int carbsG,
    required int fatG,
    required String source, // manual | quick_log | restaurant
    String? placeId,
    String? placeName,
    bool isHealthy = true,
    bool sugaryDrink = false,
    String mealTime = 'lunch',
    String? notes,
  }) {
    if (!_ready) return;
    final now = DateTime.now();
    _fireAndForget(
      _db.collection('meal_logs').add({
        'userId': uid,
        'date': dateKey(now),
        'mealTime': mealTime,
        'source': source,
        'placeId': placeId,
        'placeNameSnapshot': placeName,
        'menuName': menuName,
        'caloriesEstimate': calories,
        'proteinEstimate': proteinG,
        'carbsEstimate': carbsG,
        'fatEstimate': fatG,
        'isHealthy': isHealthy,
        'sugaryDrink': sugaryDrink,
        'notes': notes,
        'createdAt': FieldValue.serverTimestamp(),
      }),
      'mealLog',
    );
    _touchMetrics({
      'caloriesIn': FieldValue.increment(calories),
      'protein': FieldValue.increment(proteinG),
      'carbs': FieldValue.increment(carbsG),
      'fat': FieldValue.increment(fatG),
      'mealCount': FieldValue.increment(1),
      if (isHealthy) 'healthyMealCount': FieldValue.increment(1),
      if (sugaryDrink) 'sugaryDrinkCount': FieldValue.increment(1),
    });
    logEvent('meal_logged', metadata: {
      'source': source,
      'calories': calories,
      'protein': proteinG,
    });
  }

  void logWater(int ml) => _touchMetrics({'waterMl': FieldValue.increment(ml)});

  void logSteps(int steps, int stepTarget) {
    _touchMetrics({'steps': steps});
    final now = DateTime.now();
    _fireAndForget(
      _db.collection('activity_daily').doc('${uid}_${dateKey(now)}').set({
        'userId': uid,
        'date': dateKey(now),
        'steps': steps,
        'stepTarget': stepTarget,
        'source': 'manual',
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true)),
      'activity',
    );
  }

  // ---------- Workout ----------

  void logWorkout({
    required DailyPlan plan_,
    required String status, // completed | skipped
    String? feedback, // done | tooEasy | tooHard | noTime | pain
  }) {
    if (!_ready) return;
    final now = DateTime.now();
    _fireAndForget(
      _db.collection('workout_sessions').add({
        'userId': uid,
        'date': dateKey(now),
        'sportMood': plan_.moodId,
        'workoutName': plan_.workoutName,
        'durationMinutes': plan_.durationMinutes,
        'intensity': plan_.intensity,
        'status': status,
        'feedback': feedback,
        'painReported': feedback == 'pain',
        'completedAt':
            status == 'completed' ? FieldValue.serverTimestamp() : null,
        'createdAt': FieldValue.serverTimestamp(),
      }),
      'workoutSession',
    );
    _touchMetrics({
      if (status == 'completed') 'workoutCompleted': true,
      if (status == 'skipped') 'workoutSkipped': true,
    });
    logEvent(
      status == 'completed' ? 'workout_completed' : 'workout_skipped',
      metadata: {'mood': plan_.moodId, 'feedback': feedback},
    );
    if (feedback == 'tooEasy' || feedback == 'tooHard') {
      logEvent('workout_feedback_submitted', metadata: {'feedback': feedback});
    }
  }

  // ---------- Penjana pelan harian ----------

  /// Blok memanaskan badan yang dikongsi semua mood bukan-pemulihan.
  /// name/detail ialah teks kanonik stabil; paparan guna nameKey/detailKey.
  static const List<WorkoutBlock> _kWarmupBlocks = [
    WorkoutBlock(
      id: 'briskWalk',
      name: 'Jalan pantas / jog ringan',
      detail: '5 min',
      nameKey: 'sportWarmupBriskWalkName',
      detailKey: 'sportWarmupBriskWalkDetail',
    ),
    WorkoutBlock(
      id: 'jointMobility',
      name: 'Mobiliti sendi',
      detail: 'Buku lali, pinggul, bahu - 3 min',
      nameKey: 'sportWarmupJointMobilityName',
      detailKey: 'sportWarmupJointMobilityDetail',
    ),
    WorkoutBlock(
      id: 'dynamicStretch',
      name: 'Dynamic stretch',
      detail: 'Leg swing, arm circle - 2 min',
      nameKey: 'sportWarmupDynamicStretchName',
      detailKey: 'sportWarmupDynamicStretchDetail',
    ),
  ];

  /// Blok menyejukkan badan yang dikongsi semua mood bukan-pemulihan.
  static const List<WorkoutBlock> _kCooldownBlocks = [
    WorkoutBlock(
      id: 'hamstring',
      name: 'Hamstring stretch',
      detail: '2 x 30 saat',
      nameKey: 'sportCooldownHamstringName',
      detailKey: 'sportCooldownHamstringDetail',
    ),
    WorkoutBlock(
      id: 'quadCalf',
      name: 'Quad + calf stretch',
      detail: '2 x 30 saat',
      nameKey: 'sportCooldownQuadCalfName',
      detailKey: 'sportCooldownQuadCalfDetail',
    ),
    WorkoutBlock(
      id: 'breathing',
      name: 'Pernafasan perlahan',
      detail: '2 min',
      nameKey: 'sportCooldownBreathingName',
      detailKey: 'sportCooldownBreathingDetail',
    ),
  ];

  /// Pelan deterministik dari Sport Mood + profil.
  /// Skala volum ikut tahap; potong intensiti jika ada kecederaan.
  DailyPlan generateDailyPlan(FitnessProfile profile, {DateTime? day}) {
    final date = day ?? DateTime.now();
    final mood = sportMoodById(profile.selectedSportMood);
    final dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    final todayName = dayNames[date.weekday - 1];
    final isTrainingDay = profile.preferredTrainingDays.isEmpty ||
        profile.preferredTrainingDays.contains(todayName);

    if (!isTrainingDay || mood.id == 'restDayNutrition') {
      final rest = sportMoodById('restDayNutrition');
      return DailyPlan(
        moodId: rest.id,
        workoutName: rest.canonicalName,
        workoutNameKey: rest.titleKey,
        durationMinutes: 20,
        intensity: 'low',
        warmup: const [],
        main: rest.mainWork,
        cooldown: const [],
        foodFocusKey: rest.foodFocusKey,
        coachNoteKey: 'fitCoachNoteRestDay',
        isRestDay: true,
      );
    }

    final levelFactor = switch (profile.fitnessLevel) {
      'beginner' => 0.75,
      'advanced' => 1.15,
      'athlete' => 1.3,
      _ => 1.0,
    };
    final hasInjury = profile.injuries.isNotEmpty;
    final intensity = hasInjury && mood.intensity == 'high'
        ? 'medium'
        : (profile.fitnessLevel == 'beginner' && mood.intensity == 'high'
            ? 'medium'
            : mood.intensity);
    final duration = (mood.baseDuration * levelFactor)
        .clamp(15, profile.sessionDurationMinutes.toDouble())
        .round();

    final warmup = mood.isRecovery ? const <WorkoutBlock>[] : _kWarmupBlocks;
    final cooldown =
        mood.isRecovery ? const <WorkoutBlock>[] : _kCooldownBlocks;

    var noteKey = switch (profile.mainGoal) {
      'fatLoss' => 'fitCoachNoteFatLoss',
      'muscleGain' => 'fitCoachNoteMuscleGain',
      _ => 'fitCoachNoteDefault',
    };
    if (hasInjury) {
      noteKey = 'fitCoachNoteInjury';
    }

    return DailyPlan(
      moodId: mood.id,
      workoutName: mood.canonicalName,
      workoutNameKey: mood.titleKey,
      durationMinutes: duration,
      intensity: intensity,
      warmup: warmup,
      main: mood.mainWork,
      cooldown: cooldown,
      foodFocusKey: mood.foodFocusKey,
      coachNoteKey: noteKey,
      isRestDay: false,
    );
  }

  // ---------- MenuFitScore ----------

  /// Pangkalan menu Malaysia dengan anggaran makro (nilai purata hidangan).
  static const List<Map<String, dynamic>> _menuDb = [
    {
      'n': 'Nasi ayam (tanpa kulit) + telur',
      'c': 620,
      'p': 42,
      'cb': 72,
      'f': 16,
      'h': true,
      'cui': ['malay', 'chinese', 'chicken'],
      'rm': 10
    },
    {
      'n': 'Ayam bakar + nasi separuh + sayur',
      'c': 540,
      'p': 45,
      'cb': 48,
      'f': 15,
      'h': true,
      'cui': ['malay', 'western', 'chicken'],
      'rm': 13
    },
    {
      'n': 'Ikan bakar + nasi + ulam',
      'c': 520,
      'p': 40,
      'cb': 52,
      'f': 14,
      'h': true,
      'cui': ['malay', 'seafood'],
      'rm': 15
    },
    {
      'n': 'Sup ayam + nasi separuh',
      'c': 430,
      'p': 32,
      'cb': 45,
      'f': 10,
      'h': true,
      'cui': ['malay', 'thai', 'chicken'],
      'rm': 9
    },
    {
      'n': 'Nasi campur: ayam + 2 sayur',
      'c': 650,
      'p': 38,
      'cb': 78,
      'f': 18,
      'h': true,
      'cui': ['malay'],
      'rm': 10
    },
    {
      'n': 'Tomyam ayam + nasi putih',
      'c': 560,
      'p': 34,
      'cb': 62,
      'f': 16,
      'h': true,
      'cui': ['thai', 'malay'],
      'rm': 11
    },
    {
      'n': 'Chicken chop grilled + salad',
      'c': 580,
      'p': 44,
      'cb': 40,
      'f': 24,
      'h': true,
      'cui': ['western', 'chicken'],
      'rm': 16
    },
    {
      'n': 'Nasi kandar ayam + sayur (kuah sikit)',
      'c': 720,
      'p': 36,
      'cb': 88,
      'f': 22,
      'h': false,
      'cui': ['mamak', 'indian'],
      'rm': 11
    },
    {
      'n': 'Thosai + dhal (2 keping)',
      'c': 420,
      'p': 14,
      'cb': 70,
      'f': 9,
      'h': true,
      'cui': ['indian', 'mamak'],
      'rm': 6
    },
    {
      'n': 'Mee sup ayam',
      'c': 460,
      'p': 26,
      'cb': 58,
      'f': 12,
      'h': true,
      'cui': ['malay', 'chinese', 'noodle'],
      'rm': 8
    },
    {
      'n': 'Nasi lemak biasa + telur',
      'c': 680,
      'p': 18,
      'cb': 82,
      'f': 30,
      'h': false,
      'cui': ['malay'],
      'rm': 6
    },
    {
      'n': 'Mee goreng mamak',
      'c': 750,
      'p': 22,
      'cb': 92,
      'f': 30,
      'h': false,
      'cui': ['mamak', 'noodle'],
      'rm': 8
    },
    {
      'n': 'Roti telur + dhal',
      'c': 480,
      'p': 16,
      'cb': 58,
      'f': 20,
      'h': false,
      'cui': ['mamak', 'indian'],
      'rm': 5
    },
    {
      'n': 'Kebab ayam (extra ayam, less mayo)',
      'c': 520,
      'p': 35,
      'cb': 48,
      'f': 18,
      'h': true,
      'cui': ['western', 'arab'],
      'rm': 12
    },
    {
      'n': 'Salad bowl ayam grill',
      'c': 420,
      'p': 38,
      'cb': 24,
      'f': 18,
      'h': true,
      'cui': ['western', 'healthy', 'cafe'],
      'rm': 18
    },
    {
      'n': 'Nasi goreng ayam (minta kurang minyak)',
      'c': 640,
      'p': 28,
      'cb': 78,
      'f': 22,
      'h': false,
      'cui': ['malay', 'chinese', 'thai'],
      'rm': 9
    },
    {
      'n': 'Chicken rice bowl + telur',
      'c': 590,
      'p': 40,
      'cb': 64,
      'f': 16,
      'h': true,
      'cui': ['korean', 'japanese', 'cafe', 'chicken'],
      'rm': 15
    },
    {
      'n': 'Sushi set + miso soup',
      'c': 480,
      'p': 24,
      'cb': 70,
      'f': 10,
      'h': true,
      'cui': ['japanese'],
      'rm': 20
    },
    {
      'n': 'Pho / kuey teow sup daging',
      'c': 450,
      'p': 28,
      'cb': 56,
      'f': 10,
      'h': true,
      'cui': ['vietnamese', 'chinese', 'noodle'],
      'rm': 12
    },
    {
      'n': 'Burger ayam grill (no cheese)',
      'c': 560,
      'p': 32,
      'cb': 52,
      'f': 22,
      'h': false,
      'cui': ['western', 'fastfood'],
      'rm': 12
    },
  ];

  /// Jana cadangan menu berpandukan MenuFitScore (formula spec V3).
  /// TIDAK memblok makanan - hanya menyusun & memberi panduan.
  List<MenuSuggestion> suggestMenus({
    required FitnessProfile profile,
    required NutritionTargets targets,
    required DailyMetrics today,
    List<PlaceSummary> nearby = const [],
    bool trainingDay = true,
    int limit = 3,
    bool logShown = true,
  }) {
    final remainingCal =
        (targets.calories - today.caloriesIn).clamp(300, targets.calories);
    final remainingProtein =
        (targets.proteinG - today.proteinG).clamp(0, targets.proteinG);
    final scored = <(double, MenuSuggestion)>[];

    for (final m in _menuDb) {
      final cal = m['c'] as int;
      final protein = m['p'] as int;
      final healthy = m['h'] as bool;
      final rm = m['rm'] as int;
      final cuisines = (m['cui'] as List).cast<String>();

      double score = 50;
      // goalMatch + proteinScore
      if (remainingProtein > 30) score += (protein / 45 * 20).clamp(0, 20);
      if (profile.mainGoal == 'muscleGain') score += protein > 35 ? 10 : 0;
      // calorieFit: hampir dengan baki kalori / bilangan makan tinggal.
      final slotCal = remainingCal / 2;
      final calDiff = (cal - slotCal).abs() / slotCal;
      score += (12 * (1 - calDiff)).clamp(0, 12);
      // budgetFit
      if (rm >= profile.budgetMin && rm <= profile.budgetMax) score += 8;
      // trainingDayFit: hari latihan boleh karbohidrat lebih.
      if (trainingDay && (m['cb'] as int) > 55) score += 4;
      if (!trainingDay && (m['cb'] as int) > 80) score -= 4;
      // unhealthyPenalty (panduan, bukan larangan)
      if (!healthy &&
          (profile.mainGoal == 'fatLoss' || profile.mainGoal == 'leanBody')) {
        score -= 15;
      }
      // distanceFit + padanan kedai berdekatan.
      String? placeId;
      String? placeName;
      for (final p in nearby) {
        final cui = p.cuisine.toLowerCase();
        if (cuisines.any((c) => cui.contains(c))) {
          placeId = p.placeId;
          placeName = p.name;
          score += 6;
          break;
        }
      }

      final reasons = <String>[
        if (protein >= 35) 'Protein tinggi (${protein}g)',
        if (healthy) 'Pilihan seimbang',
        if (cal <= slotCal * 1.05) 'Kalori terkawal untuk baki hari ini',
        if (rm <= profile.budgetMax) 'Dalam bajet RM${profile.budgetMax}',
        if (!healthy)
          'Kurang sesuai untuk matlamat hari ini - jika pilih juga, kurangkan minuman manis',
      ];

      scored.add((
        score,
        MenuSuggestion(
          menuName: m['n'] as String,
          calories: cal,
          proteinG: protein,
          carbsG: m['cb'] as int,
          fatG: m['f'] as int,
          fitScore: score.clamp(20, 98).round(),
          reasons: reasons.take(3).toList(),
          placeId: placeId,
          placeName: placeName,
          isHealthy: healthy,
          priceEstimate: rm,
        )
      ));
    }

    scored.sort((a, b) => b.$1.compareTo(a.$1));
    if (logShown) {
      logEvent('menu_recommendation_shown', metadata: {'count': limit});
    }
    return scored.take(limit).map((e) => e.$2).toList();
  }

  void acceptMenuSuggestion(MenuSuggestion s, FitnessProfile profile) {
    if (_ready) {
      _fireAndForget(
        _db.collection('menu_recommendations').add({
          'userId': uid,
          'date': dateKey(DateTime.now()),
          'placeId': s.placeId,
          'placeNameSnapshot': s.placeName,
          'menuName': s.menuName,
          'estimatedCalories': s.calories,
          'estimatedProtein': s.proteinG,
          'fitScore': s.fitScore,
          'goalMode': profile.mainGoal,
          'sportMood': profile.selectedSportMood,
          'accepted': true,
          'createdAt': FieldValue.serverTimestamp(),
        }),
        'menuRecommendation',
      );
    }
    logMeal(
      menuName: s.menuName,
      calories: s.calories,
      proteinG: s.proteinG,
      carbsG: s.carbsG,
      fatG: s.fatG,
      source: 'restaurant',
      placeId: s.placeId,
      placeName: s.placeName,
      isHealthy: s.isHealthy,
      mealTime: TimeSlotUtils.now(),
    );
    logEvent('menu_recommendation_accepted',
        metadata: {'menu': s.menuName, 'fitScore': s.fitScore});
  }

  // ---------- Coach insight ----------

  /// Nasihat pendek berpandukan data - nada positif, tiada shame.
  String coachInsight({
    required FitnessProfile profile,
    required NutritionTargets targets,
    required DailyMetrics today,
    required int fitScore,
  }) {
    final proteinLeft = targets.proteinG - today.proteinG;
    if (today.mealCount == 0 && today.steps < 1000) {
      return 'Hari baru bermula. Log makanan pertama dan cuba capai '
          '${_fmtSteps(profile.stepTarget)} langkah hari ini.';
    }
    if (proteinLeft > 25) {
      return 'Protein kurang ${proteinLeft}g lagi. Untuk makan seterusnya, '
          'pilih ayam bakar, ikan, telur atau tauhu.';
    }
    if (today.steps < profile.stepTarget * 0.5 && DateTime.now().hour >= 15) {
      return 'Langkah masih rendah. Jalan 10 minit selepas makan pun sudah membantu.';
    }
    if (today.waterMl < targets.waterMl * 0.5 && DateTime.now().hour >= 14) {
      return 'Air baru ${(today.waterMl / 1000).toStringAsFixed(1)}L. '
          'Sasaran ${(targets.waterMl / 1000).toStringAsFixed(1)}L - minum segelas sekarang.';
    }
    if (today.caloriesIn > targets.calories * 1.2) {
      return 'Kalori hari ini lebih sasaran. Tak apa - pilih makan malam ringan '
          'dan jalan santai 15 minit.';
    }
    if (fitScore >= 80) {
      return 'Prestasi hari ini cemerlang. Kekalkan momentum - tidur cukup malam ini.';
    }
    if (today.workoutCompleted) {
      return 'Latihan selesai. Fokus sekarang: protein pemulihan dan hidrasi.';
    }
    return 'Progres yang baik. Satu perkara kecil lagi: habiskan sasaran air anda.';
  }

  static String _fmtSteps(int n) => n
      .toString()
      .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]},');

  // ---------- Laporan mingguan ----------

  /// Jana + cache laporan mingguan dari 7 hari metrik & sesi workout.
  Future<Map<String, dynamic>> buildWeeklyReport(
      FitnessProfile profile, NutritionTargets targets) async {
    if (!_ready) return _emptyReport();
    final now = DateTime.now();
    final monday = now.subtract(Duration(days: now.weekday - 1));
    final days = List.generate(7, (i) => monday.add(Duration(days: i)))
        .where((d) => !d.isAfter(now))
        .toList();

    var steps = 0, cal = 0, calDays = 0, proteinHit = 0, healthy = 0;
    var heavy = 0, sugary = 0, trained = 0, skipped = 0;
    for (final d in days) {
      try {
        final snap = await _metricsDoc(d).get();
        final m = DailyMetrics.fromMap(snap.data());
        steps += m.steps;
        if (m.caloriesIn > 0) {
          cal += m.caloriesIn;
          calDays++;
        }
        if (m.proteinG >= targets.proteinG * 0.9) proteinHit++;
        healthy += m.healthyMealCount;
        heavy += m.mealCount - m.healthyMealCount;
        sugary += m.sugaryDrinkCount;
        if (m.workoutCompleted) trained++;
        if (m.workoutSkipped && !m.workoutCompleted) skipped++;
      } catch (e) {
        debugPrint('MakanMana Fit: metrik $d gagal: $e');
      }
    }

    final planned = profile.trainingDaysPerWeek;
    final recommendations = <String>[
      if (proteinHit < days.length * 0.6)
        'Tambah protein waktu sarapan - telur atau ayam.',
      if (sugary > 3) 'Kurangkan minuman manis kepada 2 kali seminggu.',
      if (trained < planned)
        'Cuba kekalkan $planned sesi latihan minggu depan. Sesi pendek pun dikira.',
      if (steps / days.length < profile.stepTarget * 0.7)
        'Jalan 10 minit selepas makan tengah hari untuk naikkan langkah.',
      if (trained >= planned && proteinHit >= days.length * 0.6)
        'Minggu yang kuat. Kekalkan rutin sama - konsistensi ialah kunci.',
    ];

    final report = {
      'userId': uid,
      'weekStartDate': dateKey(monday),
      'trainingCompleted': trained,
      'trainingPlanned': planned,
      'trainingSkipped': skipped,
      'averageSteps': days.isEmpty ? 0 : (steps / days.length).round(),
      'averageCalories': calDays == 0 ? 0 : (cal / calDays).round(),
      'proteinHitRate':
          days.isEmpty ? 0 : (proteinHit / days.length * 100).round(),
      'healthyMealCount': healthy,
      'heavyMealCount': heavy,
      'sugaryDrinkCount': sugary,
      'coachSummary': trained >= planned
          ? 'Minggu yang konsisten. Latihan cukup - teruskan corak ini.'
          : 'Progres ada, cuma latihan belum cukup sasaran. Minggu depan kita perbaiki satu perkara sahaja.',
      'recommendations': recommendations.take(3).toList(),
      'createdAt': FieldValue.serverTimestamp(),
    };

    _fireAndForget(
      _db
          .collection('weekly_reports')
          .doc('${uid}_${weekKey(now)}')
          .set(report, SetOptions(merge: true)),
      'weeklyReport',
    );
    logEvent('weekly_report_viewed');
    return report;
  }

  Map<String, dynamic> _emptyReport() => {
        'trainingCompleted': 0,
        'trainingPlanned': 3,
        'averageSteps': 0,
        'averageCalories': 0,
        'proteinHitRate': 0,
        'healthyMealCount': 0,
        'heavyMealCount': 0,
        'sugaryDrinkCount': 0,
        'coachSummary':
            'Belum ada data minggu ini. Mula log makanan & latihan!',
        'recommendations': const <String>[],
      };

  // ---------- Kebenaran kesihatan / wearable ----------

  void saveHealthPermissions(Map<String, bool> perms) {
    if (!_ready) return;
    _fireAndForget(
      _db.collection('health_permissions').doc(uid).set({
        'userId': uid,
        ...perms,
        'lastPermissionCheck': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true)),
      'healthPermissions',
    );
    logEvent('health_permission_granted', metadata: perms);
  }
}
