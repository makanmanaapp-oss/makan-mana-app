/// Sport Mood + workout block copy (Bahasa Melayu) - sumber rujukan.
///
/// Kunci dijana daripada ID stabil: `sportMood<Id><Field>` dan
/// `sportWorkout<MoodId><BlockId><Name|Detail>`. Jangan ubah nama kunci
/// tanpa mengemas kini sport_moods_data.dart.
library;

const Map<String, String> kSportStringsMs = {
  // ---------- Label kategori ----------
  'sportMoodCategoryCombat': 'Combat & Fighter',
  'sportMoodCategoryRunning': 'Larian & Daya Tahan',
  'sportMoodCategoryGym': 'Gim & Matlamat Badan',
  'sportMoodCategorySport': 'Sukan Khusus',
  'sportMoodCategoryRecovery': 'Pemulihan',

  // ---------- Nota jurulatih pelan harian ----------
  'fitCoachNoteFatLoss':
      'Konsisten kalahkan sempurna. Habiskan sesi ini, kemudian pilih makan '
          'malam berprotein.',
  'fitCoachNoteMuscleGain':
      'Fokus teknik dan tambah beban sedikit demi sedikit. Makan cukup hari ini.',
  'fitCoachNoteDefault':
      'Gerak hari ini, sekejap pun jadi. Badan esok akan berterima kasih.',
  'fitCoachNoteInjury':
      'Ada rekod kecederaan - intensiti diturunkan. Berhenti serta-merta jika '
          'sakit dan jumpa profesional bertauliah jika berlarutan.',
  'fitCoachNoteRestDay':
      'Hari rehat pun penting. Protein kekal, tidur cukup - badan membina '
          'semasa rehat.',
  'fitWorkoutFallback': 'Sesi latihan',
  'fitIntensityLow': 'rendah',
  'fitIntensityMedium': 'sederhana',
  'fitIntensityHigh': 'tinggi',
  'fitStatusCompleted': 'Selesai',
  'fitStatusSkipped': 'Dilangkau',

  // ---------- Blok memanaskan badan (dikongsi) ----------
  'sportWarmupBriskWalkName': 'Jalan pantas / jog ringan',
  'sportWarmupBriskWalkDetail': '5 min',
  'sportWarmupJointMobilityName': 'Mobiliti sendi',
  'sportWarmupJointMobilityDetail': 'Buku lali, pinggul, bahu - 3 min',
  'sportWarmupDynamicStretchName': 'Dynamic stretch',
  'sportWarmupDynamicStretchDetail': 'Leg swing, arm circle - 2 min',

  // ---------- Blok menyejukkan badan (dikongsi) ----------
  'sportCooldownHamstringName': 'Hamstring stretch',
  'sportCooldownHamstringDetail': '2 x 30 saat',
  'sportCooldownQuadCalfName': 'Quad + calf stretch',
  'sportCooldownQuadCalfDetail': '2 x 30 saat',
  'sportCooldownBreathingName': 'Pernafasan perlahan',
  'sportCooldownBreathingDetail': '2 min',

  // ==========================================================
  // A. Combat & Fighter
  // ==========================================================

  // 1. fighterCamp
  'sportMoodFighterCampTitle': 'Fighter Camp',
  'sportMoodFighterCampPurpose': 'Stamina, kuasa dan mental seorang fighter',
  'sportMoodFighterCampFoodFocus': 'Karbohidrat sederhana + protein tinggi',
  'sportWorkoutFighterCampSkippingName': 'Skipping',
  'sportWorkoutFighterCampSkippingDetail': '4 x 2 min, rehat 45 saat',
  'sportWorkoutFighterCampShadowBoxingName': 'Shadow boxing',
  'sportWorkoutFighterCampShadowBoxingDetail': '3 x 3 min, teknik bersih',
  'sportWorkoutFighterCampBurpeesName': 'Burpees',
  'sportWorkoutFighterCampBurpeesDetail': '4 x 10',
  'sportWorkoutFighterCampPushUpName': 'Push-up',
  'sportWorkoutFighterCampPushUpDetail': '4 x 12',
  'sportWorkoutFighterCampSitUpTwistName': 'Sit-up + twist',
  'sportWorkoutFighterCampSitUpTwistDetail': '3 x 20',

  // 2. boxingConditioning
  'sportMoodBoxingConditioningTitle': 'Boxing Conditioning',
  'sportMoodBoxingConditioningPurpose': 'Kelajuan tangan dan daya tahan bahu',
  'sportMoodBoxingConditioningFoodFocus': 'Protein pemulihan + air secukupnya',
  'sportWorkoutBoxingConditioningJabCrossName': 'Jab-cross drill',
  'sportWorkoutBoxingConditioningJabCrossDetail': '5 x 2 min',
  'sportWorkoutBoxingConditioningSpeedPunchesName': 'Speed punches',
  'sportWorkoutBoxingConditioningSpeedPunchesDetail': '4 x 30 saat maksimum',
  'sportWorkoutBoxingConditioningPlankShoulderTapName': 'Plank shoulder tap',
  'sportWorkoutBoxingConditioningPlankShoulderTapDetail': '3 x 20',
  'sportWorkoutBoxingConditioningJumpRopeSprintName': 'Jump rope sprint',
  'sportWorkoutBoxingConditioningJumpRopeSprintDetail': '4 x 45 saat',

  // 3. muayThai
  'sportMoodMuayThaiTitle': 'Muay Thai Mode',
  'sportMoodMuayThaiPurpose': 'Kekuatan lutut, sepakan dan clinch',
  'sportMoodMuayThaiFoodFocus': 'Karbohidrat sebelum sesi, protein selepas',
  'sportWorkoutMuayThaiTeepDrillName': 'Teep drill',
  'sportWorkoutMuayThaiTeepDrillDetail': '3 x 12 setiap kaki',
  'sportWorkoutMuayThaiRoundhouseName': 'Roundhouse (shadow)',
  'sportWorkoutMuayThaiRoundhouseDetail': '4 x 10 setiap sisi',
  'sportWorkoutMuayThaiKneeStrikesName': 'Knee strikes',
  'sportWorkoutMuayThaiKneeStrikesDetail': '3 x 15 setiap lutut',
  'sportWorkoutMuayThaiSquatJumpName': 'Squat jump',
  'sportWorkoutMuayThaiSquatJumpDetail': '3 x 12',
  'sportWorkoutMuayThaiCorePlankName': 'Core plank',
  'sportWorkoutMuayThaiCorePlankDetail': '3 x 45 saat',

  // 4. mmaHybrid
  'sportMoodMmaHybridTitle': 'MMA Hybrid',
  'sportMoodMmaHybridPurpose':
      'Gabungan striking, grappling dan enjin kardio',
  'sportMoodMmaHybridFoodFocus': 'Kalori mencukupi, jangan defisit besar',
  'sportWorkoutMmaHybridSprawlDrillName': 'Sprawl drill',
  'sportWorkoutMmaHybridSprawlDrillDetail': '4 x 10',
  'sportWorkoutMmaHybridShadowStrikingName': 'Shadow striking',
  'sportWorkoutMmaHybridShadowStrikingDetail': '3 x 3 min',
  'sportWorkoutMmaHybridBearCrawlName': 'Bear crawl',
  'sportWorkoutMmaHybridBearCrawlDetail': '3 x 20 meter',
  'sportWorkoutMmaHybridHipEscapeName': 'Hip escape (shrimp)',
  'sportWorkoutMmaHybridHipEscapeDetail': '3 x 10 setiap sisi',
  'sportWorkoutMmaHybridSquatPressName': 'Squat + press',
  'sportWorkoutMmaHybridSquatPressDetail': '3 x 12',

  // 5. selfDefence
  'sportMoodSelfDefenceTitle': 'Self Defence Fit',
  'sportMoodSelfDefencePurpose': 'Kecergasan asas + refleks pertahanan diri',
  'sportMoodSelfDefenceFoodFocus':
      'Makan seimbang, elak makanan berat sebelum sesi',
  'sportWorkoutSelfDefencePalmStrikeName': 'Palm strike drill',
  'sportWorkoutSelfDefencePalmStrikeDetail': '3 x 12',
  'sportWorkoutSelfDefenceKneeElbowName': 'Knee + elbow combo',
  'sportWorkoutSelfDefenceKneeElbowDetail': '3 x 10',
  'sportWorkoutSelfDefenceFootworkName': 'Footwork keluar sudut',
  'sportWorkoutSelfDefenceFootworkDetail': '4 x 30 saat',
  'sportWorkoutSelfDefencePushUpName': 'Push-up',
  'sportWorkoutSelfDefencePushUpDetail': '3 x 10',

  // ==========================================================
  // B. Larian & Daya Tahan
  // ==========================================================

  // 6. easyRun
  'sportMoodEasyRunTitle': 'Easy Run',
  'sportMoodEasyRunPurpose': 'Larian santai bina asas aerobik',
  'sportMoodEasyRunFoodFocus': 'Makanan ringan, hidrasi cukup',
  'sportWorkoutEasyRunEasyRunName': 'Larian mudah',
  'sportWorkoutEasyRunEasyRunDetail': '20-30 min, boleh berbual sambil lari',
  'sportWorkoutEasyRunStridesName': 'Strides',
  'sportWorkoutEasyRunStridesDetail': '4 x 20 saat laju terkawal',

  // 7. speedRun
  'sportMoodSpeedRunTitle': 'Speed Run',
  'sportMoodSpeedRunPurpose': 'Interval pecut untuk kelajuan',
  'sportMoodSpeedRunFoodFocus': 'Karbohidrat 1-2 jam sebelum sesi',
  'sportWorkoutSpeedRunInterval400Name': 'Interval 400m',
  'sportWorkoutSpeedRunInterval400Detail': '6 x 400m pace laju, jog 90 saat',
  'sportWorkoutSpeedRunHillSprintName': 'Sprint bukit / tangga',
  'sportWorkoutSpeedRunHillSprintDetail': '4 x 20 saat',

  // 8. prep5km
  'sportMoodPrep5kmTitle': '5KM Prep',
  'sportMoodPrep5kmPurpose': 'Persediaan race 5KM pertama / PB',
  'sportMoodPrep5kmFoodFocus':
      'Karbohidrat sederhana, elak makanan berminyak',
  'sportWorkoutPrep5kmTempoRunName': 'Tempo run',
  'sportWorkoutPrep5kmTempoRunDetail': '15 min pace selesa-laju',
  'sportWorkoutPrep5kmInterval1kmName': 'Interval 1km',
  'sportWorkoutPrep5kmInterval1kmDetail': '2 x 1km pace race, rehat 2 min',

  // 9. prep10km
  'sportMoodPrep10kmTitle': '10KM Prep',
  'sportMoodPrep10kmPurpose': 'Daya tahan untuk 10KM',
  'sportMoodPrep10kmFoodFocus': 'Karbohidrat cukup + elektrolit',
  'sportWorkoutPrep10kmLongSteadyName': 'Long steady run',
  'sportWorkoutPrep10kmLongSteadyDetail': '40-50 min pace stabil',
  'sportWorkoutPrep10kmSurgeName': 'Surge',
  'sportWorkoutPrep10kmSurgeDetail': '5 x 1 min laju dalam larian',

  // 10. trailRun
  'sportMoodTrailRunTitle': 'Trail Run',
  'sportMoodTrailRunPurpose': 'Larian denai - kaki kuat, imbangan baik',
  'sportMoodTrailRunFoodFocus': 'Snek mudah bawa + air lebih',
  'sportWorkoutTrailRunTrailRunName': 'Larian denai',
  'sportWorkoutTrailRunTrailRunDetail': '45-60 min, jaga langkah di turunan',
  'sportWorkoutTrailRunCalfRaisesName': 'Calf raises',
  'sportWorkoutTrailRunCalfRaisesDetail': '3 x 15 selepas larian',

  // 11. marathonBase
  'sportMoodMarathonBaseTitle': 'Marathon Base',
  'sportMoodMarathonBasePurpose': 'Bina base jarak jauh secara selamat',
  'sportMoodMarathonBaseFoodFocus':
      'Karbohidrat tinggi hari latihan panjang',
  'sportWorkoutMarathonBaseLongRunName': 'Long run',
  'sportWorkoutMarathonBaseLongRunDetail': '60-90 min pace mudah',
  'sportWorkoutMarathonBaseRefuelName': 'Refuel dalam sesi',
  'sportWorkoutMarathonBaseRefuelDetail': 'Air/isotonik setiap 20 min',

  // ==========================================================
  // C. Gim & Matlamat Badan
  // ==========================================================

  // 12. muscleGain
  'sportMoodMuscleGainTitle': 'Muscle Gain',
  'sportMoodMuscleGainPurpose': 'Hipertrofi - bina otot secara progresif',
  'sportMoodMuscleGainFoodFocus': 'Surplus kecil + protein 2g/kg',
  'sportWorkoutMuscleGainSquatLegPressName': 'Squat / Leg press',
  'sportWorkoutMuscleGainSquatLegPressDetail': '4 x 8-10',
  'sportWorkoutMuscleGainBenchPushUpName': 'Bench / Push-up berat',
  'sportWorkoutMuscleGainBenchPushUpDetail': '4 x 8-10',
  'sportWorkoutMuscleGainRowPulldownName': 'Row / Lat pulldown',
  'sportWorkoutMuscleGainRowPulldownDetail': '4 x 10',
  'sportWorkoutMuscleGainShoulderPressName': 'Shoulder press',
  'sportWorkoutMuscleGainShoulderPressDetail': '3 x 10',
  'sportWorkoutMuscleGainArmSupersetName': 'Bicep + tricep superset',
  'sportWorkoutMuscleGainArmSupersetDetail': '3 x 12',

  // 13. fatLoss
  'sportMoodFatLossTitle': 'Fat Loss',
  'sportMoodFatLossPurpose': 'Bakar lemak, kekalkan otot',
  'sportMoodFatLossFoodFocus': 'Defisit selamat + protein tinggi',
  'sportWorkoutFatLossCircuitSquatName': 'Circuit: squat',
  'sportWorkoutFatLossCircuitSquatDetail': '3 pusingan x 15',
  'sportWorkoutFatLossCircuitPushUpName': 'Circuit: push-up',
  'sportWorkoutFatLossCircuitPushUpDetail': '3 pusingan x 12',
  'sportWorkoutFatLossCircuitMountainClimberName': 'Circuit: mountain climber',
  'sportWorkoutFatLossCircuitMountainClimberDetail': '3 pusingan x 30 saat',
  'sportWorkoutFatLossCircuitRowingName': 'Circuit: rowing / jumping jack',
  'sportWorkoutFatLossCircuitRowingDetail': '3 pusingan x 45 saat',
  'sportWorkoutFatLossFinisherWalkName': 'Jalan pantas penamat',
  'sportWorkoutFatLossFinisherWalkDetail': '10 min',

  // 14. bodyRecomp
  'sportMoodBodyRecompTitle': 'Body Recomp',
  'sportMoodBodyRecompPurpose': 'Turun lemak + naik otot serentak',
  'sportMoodBodyRecompFoodFocus':
      'Kalori sekitar maintenance, protein tinggi',
  'sportWorkoutBodyRecompGobletSquatName': 'Goblet squat',
  'sportWorkoutBodyRecompGobletSquatDetail': '4 x 10',
  'sportWorkoutBodyRecompRomanianDeadliftName': 'Romanian deadlift',
  'sportWorkoutBodyRecompRomanianDeadliftDetail': '3 x 10',
  'sportWorkoutBodyRecompPushUpBenchName': 'Push-up / bench',
  'sportWorkoutBodyRecompPushUpBenchDetail': '4 x 10',
  'sportWorkoutBodyRecompOneArmRowName': 'One-arm row',
  'sportWorkoutBodyRecompOneArmRowDetail': '3 x 12 setiap sisi',
  'sportWorkoutBodyRecompFarmerCarryName': 'Farmer carry',
  'sportWorkoutBodyRecompFarmerCarryDetail': '3 x 30 meter',

  // 15. strengthDay
  'sportMoodStrengthDayTitle': 'Strength Day',
  'sportMoodStrengthDayPurpose':
      'Kekuatan maksimum - beban berat, rep rendah',
  'sportMoodStrengthDayFoodFocus': 'Karbohidrat sebelum, protein selepas',
  'sportWorkoutStrengthDayHeavySquatName': 'Squat berat',
  'sportWorkoutStrengthDayHeavySquatDetail': '5 x 5',
  'sportWorkoutStrengthDayDeadliftName': 'Deadlift',
  'sportWorkoutStrengthDayDeadliftDetail': '3 x 5',
  'sportWorkoutStrengthDayOverheadPressName': 'Overhead press',
  'sportWorkoutStrengthDayOverheadPressDetail': '4 x 6',
  'sportWorkoutStrengthDayWeightedPlankName': 'Plank berbeban',
  'sportWorkoutStrengthDayWeightedPlankDetail': '3 x 30 saat',

  // 16. upperBody
  'sportMoodUpperBodyTitle': 'Upper Body',
  'sportMoodUpperBodyPurpose': 'Fokus dada, belakang, bahu dan lengan',
  'sportMoodUpperBodyFoodFocus': 'Protein pemulihan',
  'sportWorkoutUpperBodyPushUpBenchName': 'Push-up / bench',
  'sportWorkoutUpperBodyPushUpBenchDetail': '4 x 10',
  'sportWorkoutUpperBodyPullUpRowName': 'Pull-up / row',
  'sportWorkoutUpperBodyPullUpRowDetail': '4 x 8',
  'sportWorkoutUpperBodyLateralRaiseName': 'Lateral raise',
  'sportWorkoutUpperBodyLateralRaiseDetail': '3 x 12',
  'sportWorkoutUpperBodyBicepCurlName': 'Bicep curl',
  'sportWorkoutUpperBodyBicepCurlDetail': '3 x 12',
  'sportWorkoutUpperBodyTricepDipName': 'Tricep dip',
  'sportWorkoutUpperBodyTricepDipDetail': '3 x 10',

  // 17. lowerBody
  'sportMoodLowerBodyTitle': 'Lower Body',
  'sportMoodLowerBodyPurpose': 'Kaki dan punggung kuat',
  'sportMoodLowerBodyFoodFocus': 'Karbohidrat + protein selepas sesi',
  'sportWorkoutLowerBodySquatName': 'Squat',
  'sportWorkoutLowerBodySquatDetail': '4 x 10',
  'sportWorkoutLowerBodyWalkingLungeName': 'Lunge berjalan',
  'sportWorkoutLowerBodyWalkingLungeDetail': '3 x 10 setiap kaki',
  'sportWorkoutLowerBodyHipThrustName': 'Hip thrust / glute bridge',
  'sportWorkoutLowerBodyHipThrustDetail': '4 x 12',
  'sportWorkoutLowerBodyCalfRaiseName': 'Calf raise',
  'sportWorkoutLowerBodyCalfRaiseDetail': '3 x 15',

  // 18. coreAbs
  'sportMoodCoreAbsTitle': 'Core & Abs',
  'sportMoodCoreAbsPurpose': 'Teras kuat, postur baik',
  'sportMoodCoreAbsFoodFocus': 'Kurangkan minuman manis hari ini',
  'sportWorkoutCoreAbsPlankName': 'Plank',
  'sportWorkoutCoreAbsPlankDetail': '3 x 45 saat',
  'sportWorkoutCoreAbsDeadBugName': 'Dead bug',
  'sportWorkoutCoreAbsDeadBugDetail': '3 x 10 setiap sisi',
  'sportWorkoutCoreAbsRussianTwistName': 'Russian twist',
  'sportWorkoutCoreAbsRussianTwistDetail': '3 x 20',
  'sportWorkoutCoreAbsLegRaiseName': 'Leg raise',
  'sportWorkoutCoreAbsLegRaiseDetail': '3 x 12',
  'sportWorkoutCoreAbsSidePlankName': 'Side plank',
  'sportWorkoutCoreAbsSidePlankDetail': '2 x 30 saat setiap sisi',

  // 19. homeWorkout
  'sportMoodHomeWorkoutTitle': 'Home Workout',
  'sportMoodHomeWorkoutPurpose': 'Full body tanpa peralatan di rumah',
  'sportMoodHomeWorkoutFoodFocus':
      'Makan seimbang, masak sendiri jika boleh',
  'sportWorkoutHomeWorkoutBodyweightSquatName': 'Squat badan',
  'sportWorkoutHomeWorkoutBodyweightSquatDetail': '3 x 15',
  'sportWorkoutHomeWorkoutPushUpName': 'Push-up',
  'sportWorkoutHomeWorkoutPushUpDetail': '3 x 10',
  'sportWorkoutHomeWorkoutReverseLungeName': 'Reverse lunge',
  'sportWorkoutHomeWorkoutReverseLungeDetail': '3 x 10 setiap kaki',
  'sportWorkoutHomeWorkoutSupermanHoldName': 'Superman hold',
  'sportWorkoutHomeWorkoutSupermanHoldDetail': '3 x 20 saat',
  'sportWorkoutHomeWorkoutJumpingJackName': 'Jumping jack',
  'sportWorkoutHomeWorkoutJumpingJackDetail': '3 x 45 saat',

  // 20. busy20min
  'sportMoodBusy20minTitle': 'Busy 20-Min Fit',
  'sportMoodBusy20minPurpose': 'Padat & pantas untuk hari sibuk',
  'sportMoodBusy20minFoodFocus': 'Pilih menu ringkas berprotein',
  'sportWorkoutBusy20minEmom20Name': 'EMOM 20 min',
  'sportWorkoutBusy20minEmom20Detail':
      'Minit 1: 10 squat • Minit 2: 8 push-up • Minit 3: 30s plank • '
          'Minit 4: 10 lunge • ulang',

  // ==========================================================
  // D. Sukan Khusus
  // ==========================================================

  // 21. footballMatchday
  'sportMoodFootballMatchdayTitle': 'Football Matchday',
  'sportMoodFootballMatchdayPurpose': 'Persediaan hari perlawanan bola',
  'sportMoodFootballMatchdayFoodFocus':
      'Karbohidrat 3 jam sebelum, elak makanan berminyak',
  'sportWorkoutFootballMatchdayDynamicStretchName': 'Dynamic stretch',
  'sportWorkoutFootballMatchdayDynamicStretchDetail': '8 min',
  'sportWorkoutFootballMatchdayShortSprintName': 'Pecutan pendek',
  'sportWorkoutFootballMatchdayShortSprintDetail': '6 x 20 meter',
  'sportWorkoutFootballMatchdayPassingDrillName': 'Passing / juggling drill',
  'sportWorkoutFootballMatchdayPassingDrillDetail': '15 min',
  'sportWorkoutFootballMatchdayAgilityLadderName': 'Agility ladder / cone',
  'sportWorkoutFootballMatchdayAgilityLadderDetail': '4 set',

  // 22. badmintonAgility
  'sportMoodBadmintonAgilityTitle': 'Badminton Agility',
  'sportMoodBadmintonAgilityPurpose': 'Footwork, kelajuan dan stamina court',
  'sportMoodBadmintonAgilityFoodFocus':
      'Karbohidrat ringan + protein pemulihan',
  'sportWorkoutBadmintonAgilityFootworkDrillName': 'Footwork drill',
  'sportWorkoutBadmintonAgilityFootworkDrillDetail': '4 x 45 saat',
  'sportWorkoutBadmintonAgilityShadowSwingName': 'Shadow swing',
  'sportWorkoutBadmintonAgilityShadowSwingDetail': '3 x 12',
  'sportWorkoutBadmintonAgilityLateralShuffleName': 'Lateral shuffle',
  'sportWorkoutBadmintonAgilityLateralShuffleDetail': '4 x 30 saat',
  'sportWorkoutBadmintonAgilityCorePlankName': 'Core plank',
  'sportWorkoutBadmintonAgilityCorePlankDetail': '3 x 30 saat',

  // 23. basketballEnergy
  'sportMoodBasketballEnergyTitle': 'Basketball Energy',
  'sportMoodBasketballEnergyPurpose': 'Lompatan, pecutan dan enjin permainan',
  'sportMoodBasketballEnergyFoodFocus': 'Kalori cukup, hidrasi tinggi',
  'sportWorkoutBasketballEnergySquatJumpName': 'Squat jump',
  'sportWorkoutBasketballEnergySquatJumpDetail': '4 x 10',
  'sportWorkoutBasketballEnergySuicideSprintName': 'Suicide sprint',
  'sportWorkoutBasketballEnergySuicideSprintDetail': '4 set',
  'sportWorkoutBasketballEnergyDefensiveSlideName': 'Defensive slide',
  'sportWorkoutBasketballEnergyDefensiveSlideDetail': '4 x 30 saat',
  'sportWorkoutBasketballEnergyLayupDrillName': 'Layup / shooting drill',
  'sportWorkoutBasketballEnergyLayupDrillDetail': '15 min',

  // 24. tennisMode
  'sportMoodTennisModeTitle': 'Tennis Mode',
  'sportMoodTennisModePurpose': 'Rotasi teras dan pergerakan sisi',
  'sportMoodTennisModeFoodFocus': 'Karbohidrat sederhana + elektrolit',
  'sportWorkoutTennisModeShadowStrokeName': 'Shadow stroke',
  'sportWorkoutTennisModeShadowStrokeDetail': '4 x 12',
  'sportWorkoutTennisModeSideShuffleName': 'Side shuffle + split step',
  'sportWorkoutTennisModeSideShuffleDetail': '4 x 30 saat',
  'sportWorkoutTennisModeMedBallRotationName': 'Med-ball rotation / twist',
  'sportWorkoutTennisModeMedBallRotationDetail': '3 x 10 setiap sisi',
  'sportWorkoutTennisModeWallRallyName': 'Wall rally',
  'sportWorkoutTennisModeWallRallyDetail': '10 min',

  // 25. cyclistEndurance
  'sportMoodCyclistEnduranceTitle': 'Cyclist Endurance',
  'sportMoodCyclistEndurancePurpose': 'Daya tahan kayuhan dan kaki stabil',
  'sportMoodCyclistEnduranceFoodFocus':
      'Karbohidrat berterusan untuk sesi panjang',
  'sportWorkoutCyclistEnduranceSteadyRideName': 'Kayuhan steady',
  'sportWorkoutCyclistEnduranceSteadyRideDetail': '45-60 min zon selesa',
  'sportWorkoutCyclistEnduranceCadenceDrillName': 'Cadence drill',
  'sportWorkoutCyclistEnduranceCadenceDrillDetail':
      '5 x 1 min kelajuan kayuh tinggi',

  // 26. swimmerMode
  'sportMoodSwimmerModeTitle': 'Swimmer Mode',
  'sportMoodSwimmerModePurpose': 'Teknik dan stamina renang',
  'sportMoodSwimmerModeFoodFocus': 'Makan ringan 1 jam sebelum renang',
  'sportWorkoutSwimmerModeWarmupLapsName': 'Warm-up laps',
  'sportWorkoutSwimmerModeWarmupLapsDetail': '4 x 50m mudah',
  'sportWorkoutSwimmerModeMainSetName': 'Main set',
  'sportWorkoutSwimmerModeMainSetDetail': '6 x 100m, rehat 20 saat',
  'sportWorkoutSwimmerModeKickDrillName': 'Kick drill',
  'sportWorkoutSwimmerModeKickDrillDetail': '4 x 50m dengan board',

  // 27. hikingMode
  'sportMoodHikingModeTitle': 'Hiking Mode',
  'sportMoodHikingModePurpose': 'Persediaan mendaki - kaki & kardio',
  'sportMoodHikingModeFoodFocus': 'Snek tenaga + air 2L semasa mendaki',
  'sportWorkoutHikingModeStepUpName': 'Step-up',
  'sportWorkoutHikingModeStepUpDetail': '4 x 12 setiap kaki',
  'sportWorkoutHikingModeInclineWalkName': 'Jalan cerun / tangga',
  'sportWorkoutHikingModeInclineWalkDetail': '30 min',
  'sportWorkoutHikingModeFarmerCarryPackName': 'Farmer carry (beg)',
  'sportWorkoutHikingModeFarmerCarryPackDetail': '3 x 40 meter',

  // 28. courtGame
  'sportMoodCourtGameTitle': 'Court Game Mode',
  'sportMoodCourtGamePurpose': 'Sesi permainan court santai bersama kawan',
  'sportMoodCourtGameFoodFocus': 'Elak makan berat sejam sebelum main',
  'sportWorkoutCourtGameDynamicWarmupName': 'Dynamic warm-up',
  'sportWorkoutCourtGameDynamicWarmupDetail': '10 min',
  'sportWorkoutCourtGameGamePlayName': 'Permainan',
  'sportWorkoutCourtGameGamePlayDetail': '45-60 min',
  'sportWorkoutCourtGameCoolWalkName': 'Cool walk',
  'sportWorkoutCourtGameCoolWalkDetail': '5 min selepas tamat',

  // ==========================================================
  // E. Pemulihan
  // ==========================================================

  // 29. mobilityRecovery
  'sportMoodMobilityRecoveryTitle': 'Mobility & Recovery',
  'sportMoodMobilityRecoveryPurpose': 'Longgarkan sendi, pulihkan otot',
  'sportMoodMobilityRecoveryFoodFocus': 'Protein + buah, tidur awal',
  'sportWorkoutMobilityRecoveryCatCowName': 'Cat-cow',
  'sportWorkoutMobilityRecoveryCatCowDetail': '2 x 10',
  'sportWorkoutMobilityRecoveryHipOpenerName': 'Hip opener (90/90)',
  'sportWorkoutMobilityRecoveryHipOpenerDetail': '2 x 45 saat setiap sisi',
  'sportWorkoutMobilityRecoveryHamstringStretchName': 'Hamstring stretch',
  'sportWorkoutMobilityRecoveryHamstringStretchDetail': '2 x 45 saat',
  'sportWorkoutMobilityRecoveryThoracicRotationName': 'Thoracic rotation',
  'sportWorkoutMobilityRecoveryThoracicRotationDetail': '2 x 8 setiap sisi',
  'sportWorkoutMobilityRecoveryDeepBreathingName': 'Pernafasan dalam',
  'sportWorkoutMobilityRecoveryDeepBreathingDetail': '5 min',

  // 30. restDayNutrition
  'sportMoodRestDayNutritionTitle': 'Rest Day Nutrition',
  'sportMoodRestDayNutritionPurpose':
      'Hari rehat - fokus pemakanan & pemulihan',
  'sportMoodRestDayNutritionFoodFocus':
      'Protein kekal tinggi, karbohidrat sederhana',
  'sportWorkoutRestDayNutritionEasyWalkName': 'Jalan santai',
  'sportWorkoutRestDayNutritionEasyWalkDetail': '15-20 min selepas makan',
  'sportWorkoutRestDayNutritionLightStretchName': 'Stretching ringan',
  'sportWorkoutRestDayNutritionLightStretchDetail': '10 min sebelum tidur',
};
