/// Sport Mood + workout block copy (English).
///
/// Key set must stay identical to kSportStringsMs / Zh / Ta.
library;

const Map<String, String> kSportStringsEn = {
  // ---------- Category labels ----------
  'sportMoodCategoryCombat': 'Combat & Fighter',
  'sportMoodCategoryRunning': 'Running & Endurance',
  'sportMoodCategoryGym': 'Gym & Body Goal',
  'sportMoodCategorySport': 'Sport Specific',
  'sportMoodCategoryRecovery': 'Recovery',

  // ---------- Daily plan coach notes ----------
  'fitCoachNoteFatLoss':
      'Consistency beats perfection. Finish this session, then pick a '
          'protein-rich dinner.',
  'fitCoachNoteMuscleGain':
      'Focus on technique and add load gradually. Eat enough today.',
  'fitCoachNoteDefault':
      'Move today, even briefly. Your body will thank you tomorrow.',
  'fitCoachNoteInjury':
      'Injury on record - intensity has been lowered. Stop immediately if it '
          'hurts, and see a qualified professional if it persists.',
  'fitCoachNoteRestDay':
      'Rest days matter too. Keep protein up and sleep well - your body '
          'rebuilds while you rest.',
  'fitWorkoutFallback': 'Workout session',
  'fitIntensityLow': 'low',
  'fitIntensityMedium': 'medium',
  'fitIntensityHigh': 'high',
  'fitStatusCompleted': 'Completed',
  'fitStatusSkipped': 'Skipped',

  // ---------- Shared warm-up blocks ----------
  'sportWarmupBriskWalkName': 'Brisk walk / light jog',
  'sportWarmupBriskWalkDetail': '5 min',
  'sportWarmupJointMobilityName': 'Joint mobility',
  'sportWarmupJointMobilityDetail': 'Ankles, hips, shoulders - 3 min',
  'sportWarmupDynamicStretchName': 'Dynamic stretch',
  'sportWarmupDynamicStretchDetail': 'Leg swings, arm circles - 2 min',

  // ---------- Shared cool-down blocks ----------
  'sportCooldownHamstringName': 'Hamstring stretch',
  'sportCooldownHamstringDetail': '2 x 30 sec',
  'sportCooldownQuadCalfName': 'Quad + calf stretch',
  'sportCooldownQuadCalfDetail': '2 x 30 sec',
  'sportCooldownBreathingName': 'Slow breathing',
  'sportCooldownBreathingDetail': '2 min',

  // ==========================================================
  // A. Combat & Fighter
  // ==========================================================

  // 1. fighterCamp
  'sportMoodFighterCampTitle': 'Fighter Camp',
  'sportMoodFighterCampPurpose': "A fighter's stamina, power and mindset",
  'sportMoodFighterCampFoodFocus': 'Moderate carbs + high protein',
  'sportWorkoutFighterCampSkippingName': 'Skipping',
  'sportWorkoutFighterCampSkippingDetail': '4 x 2 min, rest 45 sec',
  'sportWorkoutFighterCampShadowBoxingName': 'Shadow boxing',
  'sportWorkoutFighterCampShadowBoxingDetail': '3 x 3 min, clean technique',
  'sportWorkoutFighterCampBurpeesName': 'Burpees',
  'sportWorkoutFighterCampBurpeesDetail': '4 x 10',
  'sportWorkoutFighterCampPushUpName': 'Push-up',
  'sportWorkoutFighterCampPushUpDetail': '4 x 12',
  'sportWorkoutFighterCampSitUpTwistName': 'Sit-up + twist',
  'sportWorkoutFighterCampSitUpTwistDetail': '3 x 20',

  // 2. boxingConditioning
  'sportMoodBoxingConditioningTitle': 'Boxing Conditioning',
  'sportMoodBoxingConditioningPurpose': 'Hand speed and shoulder endurance',
  'sportMoodBoxingConditioningFoodFocus': 'Recovery protein + enough water',
  'sportWorkoutBoxingConditioningJabCrossName': 'Jab-cross drill',
  'sportWorkoutBoxingConditioningJabCrossDetail': '5 x 2 min',
  'sportWorkoutBoxingConditioningSpeedPunchesName': 'Speed punches',
  'sportWorkoutBoxingConditioningSpeedPunchesDetail': '4 x 30 sec all-out',
  'sportWorkoutBoxingConditioningPlankShoulderTapName': 'Plank shoulder tap',
  'sportWorkoutBoxingConditioningPlankShoulderTapDetail': '3 x 20',
  'sportWorkoutBoxingConditioningJumpRopeSprintName': 'Jump rope sprint',
  'sportWorkoutBoxingConditioningJumpRopeSprintDetail': '4 x 45 sec',

  // 3. muayThai
  'sportMoodMuayThaiTitle': 'Muay Thai Mode',
  'sportMoodMuayThaiPurpose': 'Knee, kick and clinch strength',
  'sportMoodMuayThaiFoodFocus': 'Carbs before the session, protein after',
  'sportWorkoutMuayThaiTeepDrillName': 'Teep drill',
  'sportWorkoutMuayThaiTeepDrillDetail': '3 x 12 each leg',
  'sportWorkoutMuayThaiRoundhouseName': 'Roundhouse (shadow)',
  'sportWorkoutMuayThaiRoundhouseDetail': '4 x 10 each side',
  'sportWorkoutMuayThaiKneeStrikesName': 'Knee strikes',
  'sportWorkoutMuayThaiKneeStrikesDetail': '3 x 15 each knee',
  'sportWorkoutMuayThaiSquatJumpName': 'Squat jump',
  'sportWorkoutMuayThaiSquatJumpDetail': '3 x 12',
  'sportWorkoutMuayThaiCorePlankName': 'Core plank',
  'sportWorkoutMuayThaiCorePlankDetail': '3 x 45 sec',

  // 4. mmaHybrid
  'sportMoodMmaHybridTitle': 'MMA Hybrid',
  'sportMoodMmaHybridPurpose': 'Striking, grappling and cardio engine combined',
  'sportMoodMmaHybridFoodFocus': 'Enough calories, avoid a big deficit',
  'sportWorkoutMmaHybridSprawlDrillName': 'Sprawl drill',
  'sportWorkoutMmaHybridSprawlDrillDetail': '4 x 10',
  'sportWorkoutMmaHybridShadowStrikingName': 'Shadow striking',
  'sportWorkoutMmaHybridShadowStrikingDetail': '3 x 3 min',
  'sportWorkoutMmaHybridBearCrawlName': 'Bear crawl',
  'sportWorkoutMmaHybridBearCrawlDetail': '3 x 20 metres',
  'sportWorkoutMmaHybridHipEscapeName': 'Hip escape (shrimp)',
  'sportWorkoutMmaHybridHipEscapeDetail': '3 x 10 each side',
  'sportWorkoutMmaHybridSquatPressName': 'Squat + press',
  'sportWorkoutMmaHybridSquatPressDetail': '3 x 12',

  // 5. selfDefence
  'sportMoodSelfDefenceTitle': 'Self Defence Fit',
  'sportMoodSelfDefencePurpose': 'Base fitness + self-defence reflexes',
  'sportMoodSelfDefenceFoodFocus':
      'Eat balanced, avoid heavy meals before the session',
  'sportWorkoutSelfDefencePalmStrikeName': 'Palm strike drill',
  'sportWorkoutSelfDefencePalmStrikeDetail': '3 x 12',
  'sportWorkoutSelfDefenceKneeElbowName': 'Knee + elbow combo',
  'sportWorkoutSelfDefenceKneeElbowDetail': '3 x 10',
  'sportWorkoutSelfDefenceFootworkName': 'Footwork out of corners',
  'sportWorkoutSelfDefenceFootworkDetail': '4 x 30 sec',
  'sportWorkoutSelfDefencePushUpName': 'Push-up',
  'sportWorkoutSelfDefencePushUpDetail': '3 x 10',

  // ==========================================================
  // B. Running & Endurance
  // ==========================================================

  // 6. easyRun
  'sportMoodEasyRunTitle': 'Easy Run',
  'sportMoodEasyRunPurpose': 'Relaxed run to build an aerobic base',
  'sportMoodEasyRunFoodFocus': 'Light food, stay hydrated',
  'sportWorkoutEasyRunEasyRunName': 'Easy run',
  'sportWorkoutEasyRunEasyRunDetail': '20-30 min, able to hold a conversation',
  'sportWorkoutEasyRunStridesName': 'Strides',
  'sportWorkoutEasyRunStridesDetail': '4 x 20 sec controlled speed',

  // 7. speedRun
  'sportMoodSpeedRunTitle': 'Speed Run',
  'sportMoodSpeedRunPurpose': 'Sprint intervals for speed',
  'sportMoodSpeedRunFoodFocus': 'Carbs 1-2 hours before the session',
  'sportWorkoutSpeedRunInterval400Name': 'Interval 400m',
  'sportWorkoutSpeedRunInterval400Detail': '6 x 400m fast pace, jog 90 sec',
  'sportWorkoutSpeedRunHillSprintName': 'Hill / stair sprint',
  'sportWorkoutSpeedRunHillSprintDetail': '4 x 20 sec',

  // 8. prep5km
  'sportMoodPrep5kmTitle': '5KM Prep',
  'sportMoodPrep5kmPurpose': 'Prep for a first 5KM race / PB',
  'sportMoodPrep5kmFoodFocus': 'Moderate carbs, avoid oily food',
  'sportWorkoutPrep5kmTempoRunName': 'Tempo run',
  'sportWorkoutPrep5kmTempoRunDetail': '15 min comfortably hard pace',
  'sportWorkoutPrep5kmInterval1kmName': 'Interval 1km',
  'sportWorkoutPrep5kmInterval1kmDetail': '2 x 1km race pace, rest 2 min',

  // 9. prep10km
  'sportMoodPrep10kmTitle': '10KM Prep',
  'sportMoodPrep10kmPurpose': 'Endurance for 10KM',
  'sportMoodPrep10kmFoodFocus': 'Enough carbs + electrolytes',
  'sportWorkoutPrep10kmLongSteadyName': 'Long steady run',
  'sportWorkoutPrep10kmLongSteadyDetail': '40-50 min steady pace',
  'sportWorkoutPrep10kmSurgeName': 'Surge',
  'sportWorkoutPrep10kmSurgeDetail': '5 x 1 min fast within the run',

  // 10. trailRun
  'sportMoodTrailRunTitle': 'Trail Run',
  'sportMoodTrailRunPurpose': 'Trail running - strong legs, good balance',
  'sportMoodTrailRunFoodFocus': 'Easy-to-carry snacks + extra water',
  'sportWorkoutTrailRunTrailRunName': 'Trail run',
  'sportWorkoutTrailRunTrailRunDetail':
      '45-60 min, watch your footing on descents',
  'sportWorkoutTrailRunCalfRaisesName': 'Calf raises',
  'sportWorkoutTrailRunCalfRaisesDetail': '3 x 15 after the run',

  // 11. marathonBase
  'sportMoodMarathonBaseTitle': 'Marathon Base',
  'sportMoodMarathonBasePurpose': 'Build long-distance base safely',
  'sportMoodMarathonBaseFoodFocus': 'High carbs on long training days',
  'sportWorkoutMarathonBaseLongRunName': 'Long run',
  'sportWorkoutMarathonBaseLongRunDetail': '60-90 min easy pace',
  'sportWorkoutMarathonBaseRefuelName': 'In-session refuel',
  'sportWorkoutMarathonBaseRefuelDetail': 'Water/isotonic every 20 min',

  // ==========================================================
  // C. Gym & Body Goal
  // ==========================================================

  // 12. muscleGain
  'sportMoodMuscleGainTitle': 'Muscle Gain',
  'sportMoodMuscleGainPurpose': 'Hypertrophy - build muscle progressively',
  'sportMoodMuscleGainFoodFocus': 'Small surplus + 2g/kg protein',
  'sportWorkoutMuscleGainSquatLegPressName': 'Squat / Leg press',
  'sportWorkoutMuscleGainSquatLegPressDetail': '4 x 8-10',
  'sportWorkoutMuscleGainBenchPushUpName': 'Bench / Weighted push-up',
  'sportWorkoutMuscleGainBenchPushUpDetail': '4 x 8-10',
  'sportWorkoutMuscleGainRowPulldownName': 'Row / Lat pulldown',
  'sportWorkoutMuscleGainRowPulldownDetail': '4 x 10',
  'sportWorkoutMuscleGainShoulderPressName': 'Shoulder press',
  'sportWorkoutMuscleGainShoulderPressDetail': '3 x 10',
  'sportWorkoutMuscleGainArmSupersetName': 'Bicep + tricep superset',
  'sportWorkoutMuscleGainArmSupersetDetail': '3 x 12',

  // 13. fatLoss
  'sportMoodFatLossTitle': 'Fat Loss',
  'sportMoodFatLossPurpose': 'Burn fat, keep muscle',
  'sportMoodFatLossFoodFocus': 'Safe deficit + high protein',
  'sportWorkoutFatLossCircuitSquatName': 'Circuit: squat',
  'sportWorkoutFatLossCircuitSquatDetail': '3 rounds x 15',
  'sportWorkoutFatLossCircuitPushUpName': 'Circuit: push-up',
  'sportWorkoutFatLossCircuitPushUpDetail': '3 rounds x 12',
  'sportWorkoutFatLossCircuitMountainClimberName': 'Circuit: mountain climber',
  'sportWorkoutFatLossCircuitMountainClimberDetail': '3 rounds x 30 sec',
  'sportWorkoutFatLossCircuitRowingName': 'Circuit: rowing / jumping jack',
  'sportWorkoutFatLossCircuitRowingDetail': '3 rounds x 45 sec',
  'sportWorkoutFatLossFinisherWalkName': 'Brisk walk finisher',
  'sportWorkoutFatLossFinisherWalkDetail': '10 min',

  // 14. bodyRecomp
  'sportMoodBodyRecompTitle': 'Body Recomp',
  'sportMoodBodyRecompPurpose': 'Lose fat + gain muscle at the same time',
  'sportMoodBodyRecompFoodFocus': 'Calories near maintenance, high protein',
  'sportWorkoutBodyRecompGobletSquatName': 'Goblet squat',
  'sportWorkoutBodyRecompGobletSquatDetail': '4 x 10',
  'sportWorkoutBodyRecompRomanianDeadliftName': 'Romanian deadlift',
  'sportWorkoutBodyRecompRomanianDeadliftDetail': '3 x 10',
  'sportWorkoutBodyRecompPushUpBenchName': 'Push-up / bench',
  'sportWorkoutBodyRecompPushUpBenchDetail': '4 x 10',
  'sportWorkoutBodyRecompOneArmRowName': 'One-arm row',
  'sportWorkoutBodyRecompOneArmRowDetail': '3 x 12 each side',
  'sportWorkoutBodyRecompFarmerCarryName': 'Farmer carry',
  'sportWorkoutBodyRecompFarmerCarryDetail': '3 x 30 metres',

  // 15. strengthDay
  'sportMoodStrengthDayTitle': 'Strength Day',
  'sportMoodStrengthDayPurpose': 'Max strength - heavy load, low reps',
  'sportMoodStrengthDayFoodFocus': 'Carbs before, protein after',
  'sportWorkoutStrengthDayHeavySquatName': 'Heavy squat',
  'sportWorkoutStrengthDayHeavySquatDetail': '5 x 5',
  'sportWorkoutStrengthDayDeadliftName': 'Deadlift',
  'sportWorkoutStrengthDayDeadliftDetail': '3 x 5',
  'sportWorkoutStrengthDayOverheadPressName': 'Overhead press',
  'sportWorkoutStrengthDayOverheadPressDetail': '4 x 6',
  'sportWorkoutStrengthDayWeightedPlankName': 'Weighted plank',
  'sportWorkoutStrengthDayWeightedPlankDetail': '3 x 30 sec',

  // 16. upperBody
  'sportMoodUpperBodyTitle': 'Upper Body',
  'sportMoodUpperBodyPurpose': 'Focus on chest, back, shoulders and arms',
  'sportMoodUpperBodyFoodFocus': 'Recovery protein',
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
  'sportMoodLowerBodyPurpose': 'Strong legs and glutes',
  'sportMoodLowerBodyFoodFocus': 'Carbs + protein after the session',
  'sportWorkoutLowerBodySquatName': 'Squat',
  'sportWorkoutLowerBodySquatDetail': '4 x 10',
  'sportWorkoutLowerBodyWalkingLungeName': 'Walking lunge',
  'sportWorkoutLowerBodyWalkingLungeDetail': '3 x 10 each leg',
  'sportWorkoutLowerBodyHipThrustName': 'Hip thrust / glute bridge',
  'sportWorkoutLowerBodyHipThrustDetail': '4 x 12',
  'sportWorkoutLowerBodyCalfRaiseName': 'Calf raise',
  'sportWorkoutLowerBodyCalfRaiseDetail': '3 x 15',

  // 18. coreAbs
  'sportMoodCoreAbsTitle': 'Core & Abs',
  'sportMoodCoreAbsPurpose': 'Strong core, better posture',
  'sportMoodCoreAbsFoodFocus': 'Cut back on sugary drinks today',
  'sportWorkoutCoreAbsPlankName': 'Plank',
  'sportWorkoutCoreAbsPlankDetail': '3 x 45 sec',
  'sportWorkoutCoreAbsDeadBugName': 'Dead bug',
  'sportWorkoutCoreAbsDeadBugDetail': '3 x 10 each side',
  'sportWorkoutCoreAbsRussianTwistName': 'Russian twist',
  'sportWorkoutCoreAbsRussianTwistDetail': '3 x 20',
  'sportWorkoutCoreAbsLegRaiseName': 'Leg raise',
  'sportWorkoutCoreAbsLegRaiseDetail': '3 x 12',
  'sportWorkoutCoreAbsSidePlankName': 'Side plank',
  'sportWorkoutCoreAbsSidePlankDetail': '2 x 30 sec each side',

  // 19. homeWorkout
  'sportMoodHomeWorkoutTitle': 'Home Workout',
  'sportMoodHomeWorkoutPurpose': 'Full body at home with no equipment',
  'sportMoodHomeWorkoutFoodFocus': 'Eat balanced, cook at home if you can',
  'sportWorkoutHomeWorkoutBodyweightSquatName': 'Bodyweight squat',
  'sportWorkoutHomeWorkoutBodyweightSquatDetail': '3 x 15',
  'sportWorkoutHomeWorkoutPushUpName': 'Push-up',
  'sportWorkoutHomeWorkoutPushUpDetail': '3 x 10',
  'sportWorkoutHomeWorkoutReverseLungeName': 'Reverse lunge',
  'sportWorkoutHomeWorkoutReverseLungeDetail': '3 x 10 each leg',
  'sportWorkoutHomeWorkoutSupermanHoldName': 'Superman hold',
  'sportWorkoutHomeWorkoutSupermanHoldDetail': '3 x 20 sec',
  'sportWorkoutHomeWorkoutJumpingJackName': 'Jumping jack',
  'sportWorkoutHomeWorkoutJumpingJackDetail': '3 x 45 sec',

  // 20. busy20min
  'sportMoodBusy20minTitle': 'Busy 20-Min Fit',
  'sportMoodBusy20minPurpose': 'Short & sharp for busy days',
  'sportMoodBusy20minFoodFocus': 'Pick a simple protein-rich meal',
  'sportWorkoutBusy20minEmom20Name': 'EMOM 20 min',
  'sportWorkoutBusy20minEmom20Detail':
      'Minute 1: 10 squats • Minute 2: 8 push-ups • Minute 3: 30s plank • '
          'Minute 4: 10 lunges • repeat',

  // ==========================================================
  // D. Sport Specific
  // ==========================================================

  // 21. footballMatchday
  'sportMoodFootballMatchdayTitle': 'Football Matchday',
  'sportMoodFootballMatchdayPurpose': 'Prep for football match day',
  'sportMoodFootballMatchdayFoodFocus':
      'Carbs 3 hours before, avoid oily food',
  'sportWorkoutFootballMatchdayDynamicStretchName': 'Dynamic stretch',
  'sportWorkoutFootballMatchdayDynamicStretchDetail': '8 min',
  'sportWorkoutFootballMatchdayShortSprintName': 'Short sprints',
  'sportWorkoutFootballMatchdayShortSprintDetail': '6 x 20 metres',
  'sportWorkoutFootballMatchdayPassingDrillName': 'Passing / juggling drill',
  'sportWorkoutFootballMatchdayPassingDrillDetail': '15 min',
  'sportWorkoutFootballMatchdayAgilityLadderName': 'Agility ladder / cone',
  'sportWorkoutFootballMatchdayAgilityLadderDetail': '4 sets',

  // 22. badmintonAgility
  'sportMoodBadmintonAgilityTitle': 'Badminton Agility',
  'sportMoodBadmintonAgilityPurpose': 'Footwork, speed and court stamina',
  'sportMoodBadmintonAgilityFoodFocus': 'Light carbs + recovery protein',
  'sportWorkoutBadmintonAgilityFootworkDrillName': 'Footwork drill',
  'sportWorkoutBadmintonAgilityFootworkDrillDetail': '4 x 45 sec',
  'sportWorkoutBadmintonAgilityShadowSwingName': 'Shadow swing',
  'sportWorkoutBadmintonAgilityShadowSwingDetail': '3 x 12',
  'sportWorkoutBadmintonAgilityLateralShuffleName': 'Lateral shuffle',
  'sportWorkoutBadmintonAgilityLateralShuffleDetail': '4 x 30 sec',
  'sportWorkoutBadmintonAgilityCorePlankName': 'Core plank',
  'sportWorkoutBadmintonAgilityCorePlankDetail': '3 x 30 sec',

  // 23. basketballEnergy
  'sportMoodBasketballEnergyTitle': 'Basketball Energy',
  'sportMoodBasketballEnergyPurpose': 'Jumping, sprinting and game engine',
  'sportMoodBasketballEnergyFoodFocus': 'Enough calories, high hydration',
  'sportWorkoutBasketballEnergySquatJumpName': 'Squat jump',
  'sportWorkoutBasketballEnergySquatJumpDetail': '4 x 10',
  'sportWorkoutBasketballEnergySuicideSprintName': 'Suicide sprint',
  'sportWorkoutBasketballEnergySuicideSprintDetail': '4 sets',
  'sportWorkoutBasketballEnergyDefensiveSlideName': 'Defensive slide',
  'sportWorkoutBasketballEnergyDefensiveSlideDetail': '4 x 30 sec',
  'sportWorkoutBasketballEnergyLayupDrillName': 'Layup / shooting drill',
  'sportWorkoutBasketballEnergyLayupDrillDetail': '15 min',

  // 24. tennisMode
  'sportMoodTennisModeTitle': 'Tennis Mode',
  'sportMoodTennisModePurpose': 'Core rotation and lateral movement',
  'sportMoodTennisModeFoodFocus': 'Moderate carbs + electrolytes',
  'sportWorkoutTennisModeShadowStrokeName': 'Shadow stroke',
  'sportWorkoutTennisModeShadowStrokeDetail': '4 x 12',
  'sportWorkoutTennisModeSideShuffleName': 'Side shuffle + split step',
  'sportWorkoutTennisModeSideShuffleDetail': '4 x 30 sec',
  'sportWorkoutTennisModeMedBallRotationName': 'Med-ball rotation / twist',
  'sportWorkoutTennisModeMedBallRotationDetail': '3 x 10 each side',
  'sportWorkoutTennisModeWallRallyName': 'Wall rally',
  'sportWorkoutTennisModeWallRallyDetail': '10 min',

  // 25. cyclistEndurance
  'sportMoodCyclistEnduranceTitle': 'Cyclist Endurance',
  'sportMoodCyclistEndurancePurpose': 'Riding endurance and stable legs',
  'sportMoodCyclistEnduranceFoodFocus': 'Steady carbs for long sessions',
  'sportWorkoutCyclistEnduranceSteadyRideName': 'Steady ride',
  'sportWorkoutCyclistEnduranceSteadyRideDetail': '45-60 min comfort zone',
  'sportWorkoutCyclistEnduranceCadenceDrillName': 'Cadence drill',
  'sportWorkoutCyclistEnduranceCadenceDrillDetail': '5 x 1 min high cadence',

  // 26. swimmerMode
  'sportMoodSwimmerModeTitle': 'Swimmer Mode',
  'sportMoodSwimmerModePurpose': 'Swimming technique and stamina',
  'sportMoodSwimmerModeFoodFocus': 'Light meal 1 hour before swimming',
  'sportWorkoutSwimmerModeWarmupLapsName': 'Warm-up laps',
  'sportWorkoutSwimmerModeWarmupLapsDetail': '4 x 50m easy',
  'sportWorkoutSwimmerModeMainSetName': 'Main set',
  'sportWorkoutSwimmerModeMainSetDetail': '6 x 100m, rest 20 sec',
  'sportWorkoutSwimmerModeKickDrillName': 'Kick drill',
  'sportWorkoutSwimmerModeKickDrillDetail': '4 x 50m with a board',

  // 27. hikingMode
  'sportMoodHikingModeTitle': 'Hiking Mode',
  'sportMoodHikingModePurpose': 'Hiking prep - legs & cardio',
  'sportMoodHikingModeFoodFocus': 'Energy snacks + 2L water on the hike',
  'sportWorkoutHikingModeStepUpName': 'Step-up',
  'sportWorkoutHikingModeStepUpDetail': '4 x 12 each leg',
  'sportWorkoutHikingModeInclineWalkName': 'Incline / stair walk',
  'sportWorkoutHikingModeInclineWalkDetail': '30 min',
  'sportWorkoutHikingModeFarmerCarryPackName': 'Farmer carry (pack)',
  'sportWorkoutHikingModeFarmerCarryPackDetail': '3 x 40 metres',

  // 28. courtGame
  'sportMoodCourtGameTitle': 'Court Game Mode',
  'sportMoodCourtGamePurpose': 'Casual court games with friends',
  'sportMoodCourtGameFoodFocus': 'Avoid heavy meals an hour before playing',
  'sportWorkoutCourtGameDynamicWarmupName': 'Dynamic warm-up',
  'sportWorkoutCourtGameDynamicWarmupDetail': '10 min',
  'sportWorkoutCourtGameGamePlayName': 'Game play',
  'sportWorkoutCourtGameGamePlayDetail': '45-60 min',
  'sportWorkoutCourtGameCoolWalkName': 'Cool walk',
  'sportWorkoutCourtGameCoolWalkDetail': '5 min after finishing',

  // ==========================================================
  // E. Recovery
  // ==========================================================

  // 29. mobilityRecovery
  'sportMoodMobilityRecoveryTitle': 'Mobility & Recovery',
  'sportMoodMobilityRecoveryPurpose': 'Loosen joints, recover muscles',
  'sportMoodMobilityRecoveryFoodFocus': 'Protein + fruit, sleep early',
  'sportWorkoutMobilityRecoveryCatCowName': 'Cat-cow',
  'sportWorkoutMobilityRecoveryCatCowDetail': '2 x 10',
  'sportWorkoutMobilityRecoveryHipOpenerName': 'Hip opener (90/90)',
  'sportWorkoutMobilityRecoveryHipOpenerDetail': '2 x 45 sec each side',
  'sportWorkoutMobilityRecoveryHamstringStretchName': 'Hamstring stretch',
  'sportWorkoutMobilityRecoveryHamstringStretchDetail': '2 x 45 sec',
  'sportWorkoutMobilityRecoveryThoracicRotationName': 'Thoracic rotation',
  'sportWorkoutMobilityRecoveryThoracicRotationDetail': '2 x 8 each side',
  'sportWorkoutMobilityRecoveryDeepBreathingName': 'Deep breathing',
  'sportWorkoutMobilityRecoveryDeepBreathingDetail': '5 min',

  // 30. restDayNutrition
  'sportMoodRestDayNutritionTitle': 'Rest Day Nutrition',
  'sportMoodRestDayNutritionPurpose': 'Rest day - focus on food & recovery',
  'sportMoodRestDayNutritionFoodFocus': 'Keep protein high, moderate carbs',
  'sportWorkoutRestDayNutritionEasyWalkName': 'Easy walk',
  'sportWorkoutRestDayNutritionEasyWalkDetail': '15-20 min after a meal',
  'sportWorkoutRestDayNutritionLightStretchName': 'Light stretching',
  'sportWorkoutRestDayNutritionLightStretchDetail': '10 min before bed',
};
