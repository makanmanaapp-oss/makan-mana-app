import 'package:flutter/material.dart';

import 'fit_models.dart';

/// Definisi satu Sport Mood (30 mod, 5 kategori - spec V3 dikunci).
class SportMood {
  const SportMood({
    required this.id,
    required this.name,
    required this.category,
    required this.icon,
    required this.purpose,
    required this.intensity, // low | medium | high
    required this.baseDuration,
    required this.foodFocus,
    required this.mainWork,
    this.isRecovery = false,
  });

  final String id;
  final String name;
  final String category;
  final IconData icon;
  final String purpose;
  final String intensity;
  final int baseDuration;
  final String foodFocus;
  final List<WorkoutBlock> mainWork;
  final bool isRecovery;
}

class SportMoodCategories {
  SportMoodCategories._();
  static const combat = 'combat';
  static const running = 'running';
  static const gym = 'gym';
  static const sport = 'sport';
  static const recovery = 'recovery';

  static const order = [combat, running, gym, sport, recovery];

  static const labels = {
    combat: 'Combat & Fighter',
    running: 'Running & Endurance',
    gym: 'Gym & Body Goal',
    sport: 'Sport Specific',
    recovery: 'Recovery',
  };

  static const icons = {
    combat: Icons.sports_mma,
    running: Icons.directions_run,
    gym: Icons.fitness_center,
    sport: Icons.sports_tennis,
    recovery: Icons.self_improvement,
  };
}

WorkoutBlock _b(String name, String detail) =>
    WorkoutBlock(name: name, detail: detail);

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
    name: 'Fighter Camp',
    category: _c,
    icon: Icons.sports_mma,
    purpose: 'Stamina, kuasa dan mental seorang fighter',
    intensity: 'high',
    baseDuration: 60,
    foodFocus: 'Karbohidrat sederhana + protein tinggi',
    mainWork: [
      _b('Skipping', '4 x 2 min, rehat 45 saat'),
      _b('Shadow boxing', '3 x 3 min, teknik bersih'),
      _b('Burpees', '4 x 10'),
      _b('Push-up', '4 x 12'),
      _b('Sit-up + twist', '3 x 20'),
    ],
  ),
  SportMood(
    id: 'boxingConditioning',
    name: 'Boxing Conditioning',
    category: _c,
    icon: Icons.sports_kabaddi,
    purpose: 'Kelajuan tangan dan daya tahan bahu',
    intensity: 'high',
    baseDuration: 45,
    foodFocus: 'Protein pemulihan + air secukupnya',
    mainWork: [
      _b('Jab-cross drill', '5 x 2 min'),
      _b('Speed punches', '4 x 30 saat maksimum'),
      _b('Plank shoulder tap', '3 x 20'),
      _b('Jump rope sprint', '4 x 45 saat'),
    ],
  ),
  SportMood(
    id: 'muayThai',
    name: 'Muay Thai Mode',
    category: _c,
    icon: Icons.sports_martial_arts,
    purpose: 'Kekuatan lutut, sepakan dan clinch',
    intensity: 'high',
    baseDuration: 60,
    foodFocus: 'Karbohidrat sebelum sesi, protein selepas',
    mainWork: [
      _b('Teep drill', '3 x 12 setiap kaki'),
      _b('Roundhouse (shadow)', '4 x 10 setiap sisi'),
      _b('Knee strikes', '3 x 15 setiap lutut'),
      _b('Squat jump', '3 x 12'),
      _b('Core plank', '3 x 45 saat'),
    ],
  ),
  SportMood(
    id: 'mmaHybrid',
    name: 'MMA Hybrid',
    category: _c,
    icon: Icons.sports_handball,
    purpose: 'Gabungan striking, grappling dan enjin kardio',
    intensity: 'high',
    baseDuration: 60,
    foodFocus: 'Kalori mencukupi, jangan defisit besar',
    mainWork: [
      _b('Sprawl drill', '4 x 10'),
      _b('Shadow striking', '3 x 3 min'),
      _b('Bear crawl', '3 x 20 meter'),
      _b('Hip escape (shrimp)', '3 x 10 setiap sisi'),
      _b('Squat + press', '3 x 12'),
    ],
  ),
  SportMood(
    id: 'selfDefence',
    name: 'Self Defence Fit',
    category: _c,
    icon: Icons.shield_outlined,
    purpose: 'Kecergasan asas + refleks pertahanan diri',
    intensity: 'medium',
    baseDuration: 40,
    foodFocus: 'Makan seimbang, elak makanan berat sebelum sesi',
    mainWork: [
      _b('Palm strike drill', '3 x 12'),
      _b('Knee + elbow combo', '3 x 10'),
      _b('Footwork keluar sudut', '4 x 30 saat'),
      _b('Push-up', '3 x 10'),
    ],
  ),

  // B. Running & Endurance
  SportMood(
    id: 'easyRun',
    name: 'Easy Run',
    category: _r,
    icon: Icons.directions_walk,
    purpose: 'Larian santai bina asas aerobik',
    intensity: 'low',
    baseDuration: 30,
    foodFocus: 'Makanan ringan, hidrasi cukup',
    mainWork: [
      _b('Larian mudah', '20-30 min, boleh berbual sambil lari'),
      _b('Strides', '4 x 20 saat laju terkawal'),
    ],
  ),
  SportMood(
    id: 'speedRun',
    name: 'Speed Run',
    category: _r,
    icon: Icons.bolt,
    purpose: 'Interval pecut untuk kelajuan',
    intensity: 'high',
    baseDuration: 40,
    foodFocus: 'Karbohidrat 1-2 jam sebelum sesi',
    mainWork: [
      _b('Interval 400m', '6 x 400m pace laju, jog 90 saat'),
      _b('Sprint bukit / tangga', '4 x 20 saat'),
    ],
  ),
  SportMood(
    id: 'prep5km',
    name: '5KM Prep',
    category: _r,
    icon: Icons.flag_outlined,
    purpose: 'Persediaan race 5KM pertama / PB',
    intensity: 'medium',
    baseDuration: 40,
    foodFocus: 'Karbohidrat sederhana, elak makanan berminyak',
    mainWork: [
      _b('Tempo run', '15 min pace selesa-laju'),
      _b('Interval 1km', '2 x 1km pace race, rehat 2 min'),
    ],
  ),
  SportMood(
    id: 'prep10km',
    name: '10KM Prep',
    category: _r,
    icon: Icons.emoji_flags_outlined,
    purpose: 'Daya tahan untuk 10KM',
    intensity: 'medium',
    baseDuration: 55,
    foodFocus: 'Karbohidrat cukup + elektrolit',
    mainWork: [
      _b('Long steady run', '40-50 min pace stabil'),
      _b('Surge', '5 x 1 min laju dalam larian'),
    ],
  ),
  SportMood(
    id: 'trailRun',
    name: 'Trail Run',
    category: _r,
    icon: Icons.terrain,
    purpose: 'Larian denai - kaki kuat, imbangan baik',
    intensity: 'medium',
    baseDuration: 60,
    foodFocus: 'Snek mudah bawa + air lebih',
    mainWork: [
      _b('Larian denai', '45-60 min, jaga langkah di turunan'),
      _b('Calf raises', '3 x 15 selepas larian'),
    ],
  ),
  SportMood(
    id: 'marathonBase',
    name: 'Marathon Base',
    category: _r,
    icon: Icons.route,
    purpose: 'Bina base jarak jauh secara selamat',
    intensity: 'medium',
    baseDuration: 75,
    foodFocus: 'Karbohidrat tinggi hari latihan panjang',
    mainWork: [
      _b('Long run', '60-90 min pace mudah'),
      _b('Refuel dalam sesi', 'Air/isotonik setiap 20 min'),
    ],
  ),

  // C. Gym & Body Goal
  SportMood(
    id: 'muscleGain',
    name: 'Muscle Gain',
    category: _g,
    icon: Icons.fitness_center,
    purpose: 'Hipertrofi - bina otot secara progresif',
    intensity: 'high',
    baseDuration: 60,
    foodFocus: 'Surplus kecil + protein 2g/kg',
    mainWork: [
      _b('Squat / Leg press', '4 x 8-10'),
      _b('Bench / Push-up berat', '4 x 8-10'),
      _b('Row / Lat pulldown', '4 x 10'),
      _b('Shoulder press', '3 x 10'),
      _b('Bicep + tricep superset', '3 x 12'),
    ],
  ),
  SportMood(
    id: 'fatLoss',
    name: 'Fat Loss',
    category: _g,
    icon: Icons.local_fire_department_outlined,
    purpose: 'Bakar lemak, kekalkan otot',
    intensity: 'medium',
    baseDuration: 45,
    foodFocus: 'Defisit selamat + protein tinggi',
    mainWork: [
      _b('Circuit: squat', '3 pusingan x 15'),
      _b('Circuit: push-up', '3 pusingan x 12'),
      _b('Circuit: mountain climber', '3 pusingan x 30 saat'),
      _b('Circuit: rowing / jumping jack', '3 pusingan x 45 saat'),
      _b('Jalan pantas penamat', '10 min'),
    ],
  ),
  SportMood(
    id: 'bodyRecomp',
    name: 'Body Recomp',
    category: _g,
    icon: Icons.sync_alt,
    purpose: 'Turun lemak + naik otot serentak',
    intensity: 'medium',
    baseDuration: 50,
    foodFocus: 'Kalori sekitar maintenance, protein tinggi',
    mainWork: [
      _b('Goblet squat', '4 x 10'),
      _b('Romanian deadlift', '3 x 10'),
      _b('Push-up / bench', '4 x 10'),
      _b('One-arm row', '3 x 12 setiap sisi'),
      _b('Farmer carry', '3 x 30 meter'),
    ],
  ),
  SportMood(
    id: 'strengthDay',
    name: 'Strength Day',
    category: _g,
    icon: Icons.line_weight,
    purpose: 'Kekuatan maksimum - beban berat, rep rendah',
    intensity: 'high',
    baseDuration: 60,
    foodFocus: 'Karbohidrat sebelum, protein selepas',
    mainWork: [
      _b('Squat berat', '5 x 5'),
      _b('Deadlift', '3 x 5'),
      _b('Overhead press', '4 x 6'),
      _b('Plank berbeban', '3 x 30 saat'),
    ],
  ),
  SportMood(
    id: 'upperBody',
    name: 'Upper Body',
    category: _g,
    icon: Icons.accessibility_new,
    purpose: 'Fokus dada, belakang, bahu dan lengan',
    intensity: 'medium',
    baseDuration: 50,
    foodFocus: 'Protein pemulihan',
    mainWork: [
      _b('Push-up / bench', '4 x 10'),
      _b('Pull-up / row', '4 x 8'),
      _b('Lateral raise', '3 x 12'),
      _b('Bicep curl', '3 x 12'),
      _b('Tricep dip', '3 x 10'),
    ],
  ),
  SportMood(
    id: 'lowerBody',
    name: 'Lower Body',
    category: _g,
    icon: Icons.airline_seat_legroom_extra,
    purpose: 'Kaki dan punggung kuat',
    intensity: 'medium',
    baseDuration: 50,
    foodFocus: 'Karbohidrat + protein selepas sesi',
    mainWork: [
      _b('Squat', '4 x 10'),
      _b('Lunge berjalan', '3 x 10 setiap kaki'),
      _b('Hip thrust / glute bridge', '4 x 12'),
      _b('Calf raise', '3 x 15'),
    ],
  ),
  SportMood(
    id: 'coreAbs',
    name: 'Core & Abs',
    category: _g,
    icon: Icons.crop_square,
    purpose: 'Teras kuat, postur baik',
    intensity: 'medium',
    baseDuration: 30,
    foodFocus: 'Kurangkan minuman manis hari ini',
    mainWork: [
      _b('Plank', '3 x 45 saat'),
      _b('Dead bug', '3 x 10 setiap sisi'),
      _b('Russian twist', '3 x 20'),
      _b('Leg raise', '3 x 12'),
      _b('Side plank', '2 x 30 saat setiap sisi'),
    ],
  ),
  SportMood(
    id: 'homeWorkout',
    name: 'Home Workout',
    category: _g,
    icon: Icons.home_outlined,
    purpose: 'Full body tanpa peralatan di rumah',
    intensity: 'medium',
    baseDuration: 35,
    foodFocus: 'Makan seimbang, masak sendiri jika boleh',
    mainWork: [
      _b('Squat badan', '3 x 15'),
      _b('Push-up', '3 x 10'),
      _b('Reverse lunge', '3 x 10 setiap kaki'),
      _b('Superman hold', '3 x 20 saat'),
      _b('Jumping jack', '3 x 45 saat'),
    ],
  ),
  SportMood(
    id: 'busy20min',
    name: 'Busy 20-Min Fit',
    category: _g,
    icon: Icons.timer_outlined,
    purpose: 'Padat & pantas untuk hari sibuk',
    intensity: 'medium',
    baseDuration: 20,
    foodFocus: 'Pilih menu ringkas berprotein',
    mainWork: [
      _b(
          'EMOM 20 min',
          'Minit 1: 10 squat • Minit 2: 8 push-up • '
              'Minit 3: 30s plank • Minit 4: 10 lunge • ulang'),
    ],
  ),

  // D. Sport Specific
  SportMood(
    id: 'footballMatchday',
    name: 'Football Matchday',
    category: _s,
    icon: Icons.sports_soccer,
    purpose: 'Persediaan hari perlawanan bola',
    intensity: 'medium',
    baseDuration: 40,
    foodFocus: 'Karbohidrat 3 jam sebelum, elak makanan berminyak',
    mainWork: [
      _b('Dynamic stretch', '8 min'),
      _b('Pecutan pendek', '6 x 20 meter'),
      _b('Passing / juggling drill', '15 min'),
      _b('Agility ladder / cone', '4 set'),
    ],
  ),
  SportMood(
    id: 'badmintonAgility',
    name: 'Badminton Agility',
    category: _s,
    icon: Icons.sports_tennis,
    purpose: 'Footwork, kelajuan dan stamina court',
    intensity: 'medium',
    baseDuration: 45,
    foodFocus: 'Karbohidrat ringan + protein pemulihan',
    mainWork: [
      _b('Footwork drill', '4 x 45 saat'),
      _b('Shadow swing', '3 x 12'),
      _b('Lateral shuffle', '4 x 30 saat'),
      _b('Core plank', '3 x 30 saat'),
    ],
  ),
  SportMood(
    id: 'basketballEnergy',
    name: 'Basketball Energy',
    category: _s,
    icon: Icons.sports_basketball,
    purpose: 'Lompatan, pecutan dan enjin permainan',
    intensity: 'high',
    baseDuration: 45,
    foodFocus: 'Kalori cukup, hidrasi tinggi',
    mainWork: [
      _b('Squat jump', '4 x 10'),
      _b('Suicide sprint', '4 set'),
      _b('Defensive slide', '4 x 30 saat'),
      _b('Layup / shooting drill', '15 min'),
    ],
  ),
  SportMood(
    id: 'tennisMode',
    name: 'Tennis Mode',
    category: _s,
    icon: Icons.sports_baseball_outlined,
    purpose: 'Rotasi teras dan pergerakan sisi',
    intensity: 'medium',
    baseDuration: 45,
    foodFocus: 'Karbohidrat sederhana + elektrolit',
    mainWork: [
      _b('Shadow stroke', '4 x 12'),
      _b('Side shuffle + split step', '4 x 30 saat'),
      _b('Med-ball rotation / twist', '3 x 10 setiap sisi'),
      _b('Wall rally', '10 min'),
    ],
  ),
  SportMood(
    id: 'cyclistEndurance',
    name: 'Cyclist Endurance',
    category: _s,
    icon: Icons.directions_bike,
    purpose: 'Daya tahan kayuhan dan kaki stabil',
    intensity: 'medium',
    baseDuration: 60,
    foodFocus: 'Karbohidrat berterusan untuk sesi panjang',
    mainWork: [
      _b('Kayuhan steady', '45-60 min zon selesa'),
      _b('Cadence drill', '5 x 1 min kelajuan kayuh tinggi'),
    ],
  ),
  SportMood(
    id: 'swimmerMode',
    name: 'Swimmer Mode',
    category: _s,
    icon: Icons.pool,
    purpose: 'Teknik dan stamina renang',
    intensity: 'medium',
    baseDuration: 45,
    foodFocus: 'Makan ringan 1 jam sebelum renang',
    mainWork: [
      _b('Warm-up laps', '4 x 50m mudah'),
      _b('Main set', '6 x 100m, rehat 20 saat'),
      _b('Kick drill', '4 x 50m dengan board'),
    ],
  ),
  SportMood(
    id: 'hikingMode',
    name: 'Hiking Mode',
    category: _s,
    icon: Icons.hiking,
    purpose: 'Persediaan mendaki - kaki & kardio',
    intensity: 'medium',
    baseDuration: 60,
    foodFocus: 'Snek tenaga + air 2L semasa mendaki',
    mainWork: [
      _b('Step-up', '4 x 12 setiap kaki'),
      _b('Jalan cerun / tangga', '30 min'),
      _b('Farmer carry (beg)', '3 x 40 meter'),
    ],
  ),
  SportMood(
    id: 'courtGame',
    name: 'Court Game Mode',
    category: _s,
    icon: Icons.stadium_outlined,
    purpose: 'Sesi permainan court santai bersama kawan',
    intensity: 'medium',
    baseDuration: 60,
    foodFocus: 'Elak makan berat sejam sebelum main',
    mainWork: [
      _b('Dynamic warm-up', '10 min'),
      _b('Permainan', '45-60 min'),
      _b('Cool walk', '5 min selepas tamat'),
    ],
  ),

  // E. Recovery
  SportMood(
    id: 'mobilityRecovery',
    name: 'Mobility & Recovery',
    category: _rec,
    icon: Icons.self_improvement,
    purpose: 'Longgarkan sendi, pulihkan otot',
    intensity: 'low',
    baseDuration: 25,
    foodFocus: 'Protein + buah, tidur awal',
    isRecovery: true,
    mainWork: [
      _b('Cat-cow', '2 x 10'),
      _b('Hip opener (90/90)', '2 x 45 saat setiap sisi'),
      _b('Hamstring stretch', '2 x 45 saat'),
      _b('Thoracic rotation', '2 x 8 setiap sisi'),
      _b('Pernafasan dalam', '5 min'),
    ],
  ),
  SportMood(
    id: 'restDayNutrition',
    name: 'Rest Day Nutrition',
    category: _rec,
    icon: Icons.spa_outlined,
    purpose: 'Hari rehat - fokus pemakanan & pemulihan',
    intensity: 'low',
    baseDuration: 0,
    foodFocus: 'Protein kekal tinggi, karbohidrat sederhana',
    isRecovery: true,
    mainWork: [
      _b('Jalan santai', '15-20 min selepas makan'),
      _b('Stretching ringan', '10 min sebelum tidur'),
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
