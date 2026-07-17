import 'package:flutter/material.dart';

import 'fit_models.dart';

/// Tukar ID stabil kepada segmen kunci PascalCase.
/// 'fighterCamp' -> 'FighterCamp', 'mmaHybrid' -> 'MmaHybrid'.
String _pascal(String id) => id[0].toUpperCase() + id.substring(1);

/// Definisi satu Sport Mood (30 mod, 5 kategori - spec V3 dikunci).
///
/// [id] ialah ID stabil dan sumber kebenaran untuk semua kunci localization.
/// [canonicalName] ialah nilai data stabil (bukan salinan paparan) - ia
/// ditulis ke `workout_sessions.workoutName` supaya rekod tersimpan kekal
/// bebas bahasa. Teks yang dilihat pengguna diselesaikan pada masa paparan
/// melalui [titleKey] / [purposeKey] / [foodFocusKey].
class SportMood {
  const SportMood({
    required this.id,
    required this.canonicalName,
    required this.category,
    required this.icon,
    required this.intensity, // low | medium | high
    required this.baseDuration,
    required this.mainWork,
    this.isRecovery = false,
  });

  final String id;

  /// Nama kanonik English - nilai data stabil, jangan terjemah.
  final String canonicalName;

  final String category;
  final IconData icon;
  final String intensity;
  final int baseDuration;
  final List<WorkoutBlock> mainWork;
  final bool isRecovery;

  /// Kunci localization diterbitkan daripada ID stabil.
  String get titleKey => 'sportMood${_pascal(id)}Title';
  String get purposeKey => 'sportMood${_pascal(id)}Purpose';
  String get foodFocusKey => 'sportMood${_pascal(id)}FoodFocus';
}

class SportMoodCategories {
  SportMoodCategories._();
  static const combat = 'combat';
  static const running = 'running';
  static const gym = 'gym';
  static const sport = 'sport';
  static const recovery = 'recovery';

  static const order = [combat, running, gym, sport, recovery];

  /// Kunci localization label kategori yang dilihat pengguna.
  static String labelKey(String category) =>
      'sportMoodCategory${_pascal(category)}';

  static const icons = {
    combat: Icons.sports_mma,
    running: Icons.directions_run,
    gym: Icons.fitness_center,
    sport: Icons.sports_tennis,
    recovery: Icons.self_improvement,
  };
}

/// Bina satu blok senaman.
///
/// [canonicalName] / [canonicalDetail] dikekalkan sebagai nilai data stabil
/// untuk keserasian persistence dan sebagai sandaran akhir paparan.
WorkoutBlock _b(
  String moodId,
  String blockId,
  String canonicalName,
  String canonicalDetail,
) {
  final prefix = 'sportWorkout${_pascal(moodId)}${_pascal(blockId)}';
  return WorkoutBlock(
    id: blockId,
    name: canonicalName,
    detail: canonicalDetail,
    nameKey: '${prefix}Name',
    detailKey: '${prefix}Detail',
  );
}

/// Senarai penuh 30 Sport Mood.
const _c = SportMoodCategories.combat;
const _r = SportMoodCategories.running;
const _g = SportMoodCategories.gym;
const _s = SportMoodCategories.sport;
const _rec = SportMoodCategories.recovery;

final List<SportMood> kSportMoods = [
  // A. Combat & Fighter
  SportMood(
    id: 'fighterCamp',
    canonicalName: 'Fighter Camp',
    category: _c,
    icon: Icons.sports_mma,
    intensity: 'high',
    baseDuration: 60,
    mainWork: [
      _b('fighterCamp', 'skipping', 'Skipping', '4 x 2 min, rehat 45 saat'),
      _b('fighterCamp', 'shadowBoxing', 'Shadow boxing',
          '3 x 3 min, teknik bersih'),
      _b('fighterCamp', 'burpees', 'Burpees', '4 x 10'),
      _b('fighterCamp', 'pushUp', 'Push-up', '4 x 12'),
      _b('fighterCamp', 'sitUpTwist', 'Sit-up + twist', '3 x 20'),
    ],
  ),
  SportMood(
    id: 'boxingConditioning',
    canonicalName: 'Boxing Conditioning',
    category: _c,
    icon: Icons.sports_kabaddi,
    intensity: 'high',
    baseDuration: 45,
    mainWork: [
      _b('boxingConditioning', 'jabCross', 'Jab-cross drill', '5 x 2 min'),
      _b('boxingConditioning', 'speedPunches', 'Speed punches',
          '4 x 30 saat maksimum'),
      _b('boxingConditioning', 'plankShoulderTap', 'Plank shoulder tap',
          '3 x 20'),
      _b('boxingConditioning', 'jumpRopeSprint', 'Jump rope sprint',
          '4 x 45 saat'),
    ],
  ),
  SportMood(
    id: 'muayThai',
    canonicalName: 'Muay Thai Mode',
    category: _c,
    icon: Icons.sports_martial_arts,
    intensity: 'high',
    baseDuration: 60,
    mainWork: [
      _b('muayThai', 'teepDrill', 'Teep drill', '3 x 12 setiap kaki'),
      _b('muayThai', 'roundhouse', 'Roundhouse (shadow)',
          '4 x 10 setiap sisi'),
      _b('muayThai', 'kneeStrikes', 'Knee strikes', '3 x 15 setiap lutut'),
      _b('muayThai', 'squatJump', 'Squat jump', '3 x 12'),
      _b('muayThai', 'corePlank', 'Core plank', '3 x 45 saat'),
    ],
  ),
  SportMood(
    id: 'mmaHybrid',
    canonicalName: 'MMA Hybrid',
    category: _c,
    icon: Icons.sports_handball,
    intensity: 'high',
    baseDuration: 60,
    mainWork: [
      _b('mmaHybrid', 'sprawlDrill', 'Sprawl drill', '4 x 10'),
      _b('mmaHybrid', 'shadowStriking', 'Shadow striking', '3 x 3 min'),
      _b('mmaHybrid', 'bearCrawl', 'Bear crawl', '3 x 20 meter'),
      _b('mmaHybrid', 'hipEscape', 'Hip escape (shrimp)',
          '3 x 10 setiap sisi'),
      _b('mmaHybrid', 'squatPress', 'Squat + press', '3 x 12'),
    ],
  ),
  SportMood(
    id: 'selfDefence',
    canonicalName: 'Self Defence Fit',
    category: _c,
    icon: Icons.shield_outlined,
    intensity: 'medium',
    baseDuration: 40,
    mainWork: [
      _b('selfDefence', 'palmStrike', 'Palm strike drill', '3 x 12'),
      _b('selfDefence', 'kneeElbow', 'Knee + elbow combo', '3 x 10'),
      _b('selfDefence', 'footwork', 'Footwork keluar sudut', '4 x 30 saat'),
      _b('selfDefence', 'pushUp', 'Push-up', '3 x 10'),
    ],
  ),

  // B. Running & Endurance
  SportMood(
    id: 'easyRun',
    canonicalName: 'Easy Run',
    category: _r,
    icon: Icons.directions_walk,
    intensity: 'low',
    baseDuration: 30,
    mainWork: [
      _b('easyRun', 'easyRun', 'Larian mudah',
          '20-30 min, boleh berbual sambil lari'),
      _b('easyRun', 'strides', 'Strides', '4 x 20 saat laju terkawal'),
    ],
  ),
  SportMood(
    id: 'speedRun',
    canonicalName: 'Speed Run',
    category: _r,
    icon: Icons.bolt,
    intensity: 'high',
    baseDuration: 40,
    mainWork: [
      _b('speedRun', 'interval400', 'Interval 400m',
          '6 x 400m pace laju, jog 90 saat'),
      _b('speedRun', 'hillSprint', 'Sprint bukit / tangga', '4 x 20 saat'),
    ],
  ),
  SportMood(
    id: 'prep5km',
    canonicalName: '5KM Prep',
    category: _r,
    icon: Icons.flag_outlined,
    intensity: 'medium',
    baseDuration: 40,
    mainWork: [
      _b('prep5km', 'tempoRun', 'Tempo run', '15 min pace selesa-laju'),
      _b('prep5km', 'interval1km', 'Interval 1km',
          '2 x 1km pace race, rehat 2 min'),
    ],
  ),
  SportMood(
    id: 'prep10km',
    canonicalName: '10KM Prep',
    category: _r,
    icon: Icons.emoji_flags_outlined,
    intensity: 'medium',
    baseDuration: 55,
    mainWork: [
      _b('prep10km', 'longSteady', 'Long steady run',
          '40-50 min pace stabil'),
      _b('prep10km', 'surge', 'Surge', '5 x 1 min laju dalam larian'),
    ],
  ),
  SportMood(
    id: 'trailRun',
    canonicalName: 'Trail Run',
    category: _r,
    icon: Icons.terrain,
    intensity: 'medium',
    baseDuration: 60,
    mainWork: [
      _b('trailRun', 'trailRun', 'Larian denai',
          '45-60 min, jaga langkah di turunan'),
      _b('trailRun', 'calfRaises', 'Calf raises', '3 x 15 selepas larian'),
    ],
  ),
  SportMood(
    id: 'marathonBase',
    canonicalName: 'Marathon Base',
    category: _r,
    icon: Icons.route,
    intensity: 'medium',
    baseDuration: 75,
    mainWork: [
      _b('marathonBase', 'longRun', 'Long run', '60-90 min pace mudah'),
      _b('marathonBase', 'refuel', 'Refuel dalam sesi',
          'Air/isotonik setiap 20 min'),
    ],
  ),

  // C. Gym & Body Goal
  SportMood(
    id: 'muscleGain',
    canonicalName: 'Muscle Gain',
    category: _g,
    icon: Icons.fitness_center,
    intensity: 'high',
    baseDuration: 60,
    mainWork: [
      _b('muscleGain', 'squatLegPress', 'Squat / Leg press', '4 x 8-10'),
      _b('muscleGain', 'benchPushUp', 'Bench / Push-up berat', '4 x 8-10'),
      _b('muscleGain', 'rowPulldown', 'Row / Lat pulldown', '4 x 10'),
      _b('muscleGain', 'shoulderPress', 'Shoulder press', '3 x 10'),
      _b('muscleGain', 'armSuperset', 'Bicep + tricep superset', '3 x 12'),
    ],
  ),
  SportMood(
    id: 'fatLoss',
    canonicalName: 'Fat Loss',
    category: _g,
    icon: Icons.local_fire_department_outlined,
    intensity: 'medium',
    baseDuration: 45,
    mainWork: [
      _b('fatLoss', 'circuitSquat', 'Circuit: squat', '3 pusingan x 15'),
      _b('fatLoss', 'circuitPushUp', 'Circuit: push-up', '3 pusingan x 12'),
      _b('fatLoss', 'circuitMountainClimber', 'Circuit: mountain climber',
          '3 pusingan x 30 saat'),
      _b('fatLoss', 'circuitRowing', 'Circuit: rowing / jumping jack',
          '3 pusingan x 45 saat'),
      _b('fatLoss', 'finisherWalk', 'Jalan pantas penamat', '10 min'),
    ],
  ),
  SportMood(
    id: 'bodyRecomp',
    canonicalName: 'Body Recomp',
    category: _g,
    icon: Icons.sync_alt,
    intensity: 'medium',
    baseDuration: 50,
    mainWork: [
      _b('bodyRecomp', 'gobletSquat', 'Goblet squat', '4 x 10'),
      _b('bodyRecomp', 'romanianDeadlift', 'Romanian deadlift', '3 x 10'),
      _b('bodyRecomp', 'pushUpBench', 'Push-up / bench', '4 x 10'),
      _b('bodyRecomp', 'oneArmRow', 'One-arm row', '3 x 12 setiap sisi'),
      _b('bodyRecomp', 'farmerCarry', 'Farmer carry', '3 x 30 meter'),
    ],
  ),
  SportMood(
    id: 'strengthDay',
    canonicalName: 'Strength Day',
    category: _g,
    icon: Icons.line_weight,
    intensity: 'high',
    baseDuration: 60,
    mainWork: [
      _b('strengthDay', 'heavySquat', 'Squat berat', '5 x 5'),
      _b('strengthDay', 'deadlift', 'Deadlift', '3 x 5'),
      _b('strengthDay', 'overheadPress', 'Overhead press', '4 x 6'),
      _b('strengthDay', 'weightedPlank', 'Plank berbeban', '3 x 30 saat'),
    ],
  ),
  SportMood(
    id: 'upperBody',
    canonicalName: 'Upper Body',
    category: _g,
    icon: Icons.accessibility_new,
    intensity: 'medium',
    baseDuration: 50,
    mainWork: [
      _b('upperBody', 'pushUpBench', 'Push-up / bench', '4 x 10'),
      _b('upperBody', 'pullUpRow', 'Pull-up / row', '4 x 8'),
      _b('upperBody', 'lateralRaise', 'Lateral raise', '3 x 12'),
      _b('upperBody', 'bicepCurl', 'Bicep curl', '3 x 12'),
      _b('upperBody', 'tricepDip', 'Tricep dip', '3 x 10'),
    ],
  ),
  SportMood(
    id: 'lowerBody',
    canonicalName: 'Lower Body',
    category: _g,
    icon: Icons.airline_seat_legroom_extra,
    intensity: 'medium',
    baseDuration: 50,
    mainWork: [
      _b('lowerBody', 'squat', 'Squat', '4 x 10'),
      _b('lowerBody', 'walkingLunge', 'Lunge berjalan', '3 x 10 setiap kaki'),
      _b('lowerBody', 'hipThrust', 'Hip thrust / glute bridge', '4 x 12'),
      _b('lowerBody', 'calfRaise', 'Calf raise', '3 x 15'),
    ],
  ),
  SportMood(
    id: 'coreAbs',
    canonicalName: 'Core & Abs',
    category: _g,
    icon: Icons.crop_square,
    intensity: 'medium',
    baseDuration: 30,
    mainWork: [
      _b('coreAbs', 'plank', 'Plank', '3 x 45 saat'),
      _b('coreAbs', 'deadBug', 'Dead bug', '3 x 10 setiap sisi'),
      _b('coreAbs', 'russianTwist', 'Russian twist', '3 x 20'),
      _b('coreAbs', 'legRaise', 'Leg raise', '3 x 12'),
      _b('coreAbs', 'sidePlank', 'Side plank', '2 x 30 saat setiap sisi'),
    ],
  ),
  SportMood(
    id: 'homeWorkout',
    canonicalName: 'Home Workout',
    category: _g,
    icon: Icons.home_outlined,
    intensity: 'medium',
    baseDuration: 35,
    mainWork: [
      _b('homeWorkout', 'bodyweightSquat', 'Squat badan', '3 x 15'),
      _b('homeWorkout', 'pushUp', 'Push-up', '3 x 10'),
      _b('homeWorkout', 'reverseLunge', 'Reverse lunge',
          '3 x 10 setiap kaki'),
      _b('homeWorkout', 'supermanHold', 'Superman hold', '3 x 20 saat'),
      _b('homeWorkout', 'jumpingJack', 'Jumping jack', '3 x 45 saat'),
    ],
  ),
  SportMood(
    id: 'busy20min',
    canonicalName: 'Busy 20-Min Fit',
    category: _g,
    icon: Icons.timer_outlined,
    intensity: 'medium',
    baseDuration: 20,
    mainWork: [
      _b(
          'busy20min',
          'emom20',
          'EMOM 20 min',
          'Minit 1: 10 squat • Minit 2: 8 push-up • '
              'Minit 3: 30s plank • Minit 4: 10 lunge • ulang'),
    ],
  ),

  // D. Sport Specific
  SportMood(
    id: 'footballMatchday',
    canonicalName: 'Football Matchday',
    category: _s,
    icon: Icons.sports_soccer,
    intensity: 'medium',
    baseDuration: 40,
    mainWork: [
      _b('footballMatchday', 'dynamicStretch', 'Dynamic stretch', '8 min'),
      _b('footballMatchday', 'shortSprint', 'Pecutan pendek', '6 x 20 meter'),
      _b('footballMatchday', 'passingDrill', 'Passing / juggling drill',
          '15 min'),
      _b('footballMatchday', 'agilityLadder', 'Agility ladder / cone',
          '4 set'),
    ],
  ),
  SportMood(
    id: 'badmintonAgility',
    canonicalName: 'Badminton Agility',
    category: _s,
    icon: Icons.sports_tennis,
    intensity: 'medium',
    baseDuration: 45,
    mainWork: [
      _b('badmintonAgility', 'footworkDrill', 'Footwork drill',
          '4 x 45 saat'),
      _b('badmintonAgility', 'shadowSwing', 'Shadow swing', '3 x 12'),
      _b('badmintonAgility', 'lateralShuffle', 'Lateral shuffle',
          '4 x 30 saat'),
      _b('badmintonAgility', 'corePlank', 'Core plank', '3 x 30 saat'),
    ],
  ),
  SportMood(
    id: 'basketballEnergy',
    canonicalName: 'Basketball Energy',
    category: _s,
    icon: Icons.sports_basketball,
    intensity: 'high',
    baseDuration: 45,
    mainWork: [
      _b('basketballEnergy', 'squatJump', 'Squat jump', '4 x 10'),
      _b('basketballEnergy', 'suicideSprint', 'Suicide sprint', '4 set'),
      _b('basketballEnergy', 'defensiveSlide', 'Defensive slide',
          '4 x 30 saat'),
      _b('basketballEnergy', 'layupDrill', 'Layup / shooting drill', '15 min'),
    ],
  ),
  SportMood(
    id: 'tennisMode',
    canonicalName: 'Tennis Mode',
    category: _s,
    icon: Icons.sports_baseball_outlined,
    intensity: 'medium',
    baseDuration: 45,
    mainWork: [
      _b('tennisMode', 'shadowStroke', 'Shadow stroke', '4 x 12'),
      _b('tennisMode', 'sideShuffle', 'Side shuffle + split step',
          '4 x 30 saat'),
      _b('tennisMode', 'medBallRotation', 'Med-ball rotation / twist',
          '3 x 10 setiap sisi'),
      _b('tennisMode', 'wallRally', 'Wall rally', '10 min'),
    ],
  ),
  SportMood(
    id: 'cyclistEndurance',
    canonicalName: 'Cyclist Endurance',
    category: _s,
    icon: Icons.directions_bike,
    intensity: 'medium',
    baseDuration: 60,
    mainWork: [
      _b('cyclistEndurance', 'steadyRide', 'Kayuhan steady',
          '45-60 min zon selesa'),
      _b('cyclistEndurance', 'cadenceDrill', 'Cadence drill',
          '5 x 1 min kelajuan kayuh tinggi'),
    ],
  ),
  SportMood(
    id: 'swimmerMode',
    canonicalName: 'Swimmer Mode',
    category: _s,
    icon: Icons.pool,
    intensity: 'medium',
    baseDuration: 45,
    mainWork: [
      _b('swimmerMode', 'warmupLaps', 'Warm-up laps', '4 x 50m mudah'),
      _b('swimmerMode', 'mainSet', 'Main set', '6 x 100m, rehat 20 saat'),
      _b('swimmerMode', 'kickDrill', 'Kick drill', '4 x 50m dengan board'),
    ],
  ),
  SportMood(
    id: 'hikingMode',
    canonicalName: 'Hiking Mode',
    category: _s,
    icon: Icons.hiking,
    intensity: 'medium',
    baseDuration: 60,
    mainWork: [
      _b('hikingMode', 'stepUp', 'Step-up', '4 x 12 setiap kaki'),
      _b('hikingMode', 'inclineWalk', 'Jalan cerun / tangga', '30 min'),
      _b('hikingMode', 'farmerCarryPack', 'Farmer carry (beg)',
          '3 x 40 meter'),
    ],
  ),
  SportMood(
    id: 'courtGame',
    canonicalName: 'Court Game Mode',
    category: _s,
    icon: Icons.stadium_outlined,
    intensity: 'medium',
    baseDuration: 60,
    mainWork: [
      _b('courtGame', 'dynamicWarmup', 'Dynamic warm-up', '10 min'),
      _b('courtGame', 'gamePlay', 'Permainan', '45-60 min'),
      _b('courtGame', 'coolWalk', 'Cool walk', '5 min selepas tamat'),
    ],
  ),

  // E. Recovery
  SportMood(
    id: 'mobilityRecovery',
    canonicalName: 'Mobility & Recovery',
    category: _rec,
    icon: Icons.self_improvement,
    intensity: 'low',
    baseDuration: 25,
    isRecovery: true,
    mainWork: [
      _b('mobilityRecovery', 'catCow', 'Cat-cow', '2 x 10'),
      _b('mobilityRecovery', 'hipOpener', 'Hip opener (90/90)',
          '2 x 45 saat setiap sisi'),
      _b('mobilityRecovery', 'hamstringStretch', 'Hamstring stretch',
          '2 x 45 saat'),
      _b('mobilityRecovery', 'thoracicRotation', 'Thoracic rotation',
          '2 x 8 setiap sisi'),
      _b('mobilityRecovery', 'deepBreathing', 'Pernafasan dalam', '5 min'),
    ],
  ),
  SportMood(
    id: 'restDayNutrition',
    canonicalName: 'Rest Day Nutrition',
    category: _rec,
    icon: Icons.spa_outlined,
    intensity: 'low',
    baseDuration: 0,
    isRecovery: true,
    mainWork: [
      _b('restDayNutrition', 'easyWalk', 'Jalan santai',
          '15-20 min selepas makan'),
      _b('restDayNutrition', 'lightStretch', 'Stretching ringan',
          '10 min sebelum tidur'),
    ],
  ),
];

SportMood sportMoodById(String? id) => kSportMoods.firstWhere((m) => m.id == id,
    orElse: () => kSportMoods.firstWhere((m) => m.id == 'homeWorkout'));

/// Mood dikumpul ikut kategori (untuk skrin /fit/sport-moods).
Map<String, List<SportMood>> sportMoodsByCategory() {
  final map = <String, List<SportMood>>{};
  for (final cat in SportMoodCategories.order) {
    map[cat] = kSportMoods.where((m) => m.category == cat).toList();
  }
  return map;
}
