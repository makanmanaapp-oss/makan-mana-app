/// Sport Mood + workout block copy (Tamil).
///
/// Status: pending native review (see docs/localization/fit_zh_ta_review.md).
/// Key set must stay identical to kSportStringsMs / En / Zh.
library;

const Map<String, String> kSportStringsTa = {
  // ---------- வகைப் பெயர்கள் ----------
  'sportMoodCategoryCombat': 'சண்டை & ஃபைட்டர்',
  'sportMoodCategoryRunning': 'ஓட்டம் & சகிப்புத்திறன்',
  'sportMoodCategoryGym': 'ஜிம் & உடல் இலக்கு',
  'sportMoodCategorySport': 'குறிப்பிட்ட விளையாட்டு',
  'sportMoodCategoryRecovery': 'மீட்பு',

  // ---------- தினசரி திட்ட பயிற்சியாளர் குறிப்புகள் ----------
  'fitCoachNoteFatLoss':
      'சரியாகச் செய்வதைவிட தொடர்ந்து செய்வது முக்கியம். இந்தப் பயிற்சியை '
          'முடித்துவிட்டு, புரதம் நிறைந்த இரவு உணவைத் தேர்வு செய்யுங்கள்.',
  'fitCoachNoteMuscleGain':
      'நுட்பத்தில் கவனம் வையுங்கள்; எடையை சிறிது சிறிதாக அதிகரியுங்கள். இன்று '
          'போதுமான அளவு சாப்பிடுங்கள்.',
  'fitCoachNoteDefault':
      'இன்று சிறிது நேரமாவது உடலை அசையுங்கள். நாளை உங்கள் உடல் நன்றி சொல்லும்.',
  'fitCoachNoteInjury':
      'காயப் பதிவு உள்ளது — தீவிரம் குறைக்கப்பட்டுள்ளது. வலி ஏற்பட்டால் உடனே '
          'நிறுத்துங்கள்; நீடித்தால் தகுதியான நிபுணரை அணுகுங்கள்.',
  'fitCoachNoteRestDay':
      'ஓய்வு நாளும் முக்கியம். புரதத்தைத் தொடருங்கள், நன்றாகத் தூங்குங்கள் — '
          'ஓய்வின்போதே உடல் கட்டமைக்கிறது.',
  'fitWorkoutFallback': 'பயிற்சி அமர்வு',
  'fitIntensityLow': 'குறைவு',
  'fitIntensityMedium': 'நடுத்தரம்',
  'fitIntensityHigh': 'அதிகம்',
  'fitStatusCompleted': 'முடிந்தது',
  'fitStatusSkipped': 'தவிர்க்கப்பட்டது',

  // ---------- பொதுவான வார்ம்-அப் ----------
  'sportWarmupBriskWalkName': 'விறுநடை / மெதுவான ஜாகிங்',
  'sportWarmupBriskWalkDetail': '5 நிமிடம்',
  'sportWarmupJointMobilityName': 'மூட்டு அசைவுத்திறன்',
  'sportWarmupJointMobilityDetail': 'கணுக்கால், இடுப்பு, தோள் — 3 நிமிடம்',
  'sportWarmupDynamicStretchName': 'இயங்கு நீட்சி',
  'sportWarmupDynamicStretchDetail': 'கால் ஆட்டம், கை சுழற்சி — 2 நிமிடம்',

  // ---------- பொதுவான கூல்-டவுன் ----------
  'sportCooldownHamstringName': 'தொடைத் தசை நீட்சி',
  'sportCooldownHamstringDetail': '2 செட் × 30 வினாடி',
  'sportCooldownQuadCalfName': 'முன்தொடை + கெண்டைக்கால் நீட்சி',
  'sportCooldownQuadCalfDetail': '2 செட் × 30 வினாடி',
  'sportCooldownBreathingName': 'மெதுவான மூச்சு',
  'sportCooldownBreathingDetail': '2 நிமிடம்',

  // ==========================================================
  // A. சண்டை & ஃபைட்டர்
  // ==========================================================

  // 1. fighterCamp
  'sportMoodFighterCampTitle': 'ஃபைட்டர் கேம்ப்',
  'sportMoodFighterCampPurpose':
      'ஒரு ஃபைட்டரின் சகிப்புத்திறன், வலிமை மற்றும் மன உறுதி',
  'sportMoodFighterCampFoodFocus': 'மிதமான கார்போஹைட்ரேட் + அதிக புரதம்',
  'sportWorkoutFighterCampSkippingName': 'கயிறு தாண்டல்',
  'sportWorkoutFighterCampSkippingDetail': '4 செட் × 2 நிமிடம், ஓய்வு 45 வினாடி',
  'sportWorkoutFighterCampShadowBoxingName': 'ஷேடோ பாக்ஸிங்',
  'sportWorkoutFighterCampShadowBoxingDetail':
      '3 செட் × 3 நிமிடம், நுட்பம் சுத்தமாக',
  'sportWorkoutFighterCampBurpeesName': 'பர்பீஸ்',
  'sportWorkoutFighterCampBurpeesDetail': '4 செட் × 10',
  'sportWorkoutFighterCampPushUpName': 'புஷ்-அப்',
  'sportWorkoutFighterCampPushUpDetail': '4 செட் × 12',
  'sportWorkoutFighterCampSitUpTwistName': 'சிட்-அப் + திருப்பம்',
  'sportWorkoutFighterCampSitUpTwistDetail': '3 செட் × 20',

  // 2. boxingConditioning
  'sportMoodBoxingConditioningTitle': 'பாக்ஸிங் உடற்தகுதி',
  'sportMoodBoxingConditioningPurpose': 'கை வேகம் மற்றும் தோள் சகிப்புத்திறன்',
  'sportMoodBoxingConditioningFoodFocus':
      'மீட்புக்கான புரதம் + போதுமான தண்ணீர்',
  'sportWorkoutBoxingConditioningJabCrossName': 'ஜாப்-கிராஸ் பயிற்சி',
  'sportWorkoutBoxingConditioningJabCrossDetail': '5 செட் × 2 நிமிடம்',
  'sportWorkoutBoxingConditioningSpeedPunchesName': 'வேக குத்துகள்',
  'sportWorkoutBoxingConditioningSpeedPunchesDetail':
      '4 செட் × 30 வினாடி முழு வேகம்',
  'sportWorkoutBoxingConditioningPlankShoulderTapName': 'பிளாங்க் தோள் தட்டல்',
  'sportWorkoutBoxingConditioningPlankShoulderTapDetail': '3 செட் × 20',
  'sportWorkoutBoxingConditioningJumpRopeSprintName': 'கயிறு தாண்டல் ஸ்பிரிண்ட்',
  'sportWorkoutBoxingConditioningJumpRopeSprintDetail': '4 செட் × 45 வினாடி',

  // 3. muayThai
  'sportMoodMuayThaiTitle': 'முவே தாய் முறை',
  'sportMoodMuayThaiPurpose': 'முழங்கால், உதை மற்றும் கிளின்ச் வலிமை',
  'sportMoodMuayThaiFoodFocus':
      'பயிற்சிக்கு முன் கார்போஹைட்ரேட், பின் புரதம்',
  'sportWorkoutMuayThaiTeepDrillName': 'டீப் பயிற்சி',
  'sportWorkoutMuayThaiTeepDrillDetail': '3 செட் × ஒவ்வொரு காலுக்கும் 12',
  'sportWorkoutMuayThaiRoundhouseName': 'ரவுண்ட்ஹவுஸ் (ஷேடோ)',
  'sportWorkoutMuayThaiRoundhouseDetail': '4 செட் × ஒவ்வொரு பக்கமும் 10',
  'sportWorkoutMuayThaiKneeStrikesName': 'முழங்கால் தாக்குதல்',
  'sportWorkoutMuayThaiKneeStrikesDetail': '3 செட் × ஒவ்வொரு முழங்காலுக்கும் 15',
  'sportWorkoutMuayThaiSquatJumpName': 'ஸ்குவாட் ஜம்ப்',
  'sportWorkoutMuayThaiSquatJumpDetail': '3 செட் × 12',
  'sportWorkoutMuayThaiCorePlankName': 'கோர் பிளாங்க்',
  'sportWorkoutMuayThaiCorePlankDetail': '3 செட் × 45 வினாடி',

  // 4. mmaHybrid
  'sportMoodMmaHybridTitle': 'MMA கலப்பு',
  'sportMoodMmaHybridPurpose':
      'ஸ்ட்ரைக்கிங், கிராப்ளிங் மற்றும் கார்டியோ இணைந்தது',
  'sportMoodMmaHybridFoodFocus':
      'கலோரி போதுமானதாக இருக்கட்டும்; பெரிய பற்றாக்குறை வேண்டாம்',
  'sportWorkoutMmaHybridSprawlDrillName': 'ஸ்ப்ராள் பயிற்சி',
  'sportWorkoutMmaHybridSprawlDrillDetail': '4 செட் × 10',
  'sportWorkoutMmaHybridShadowStrikingName': 'ஷேடோ ஸ்ட்ரைக்கிங்',
  'sportWorkoutMmaHybridShadowStrikingDetail': '3 செட் × 3 நிமிடம்',
  'sportWorkoutMmaHybridBearCrawlName': 'கரடி நடை',
  'sportWorkoutMmaHybridBearCrawlDetail': '3 செட் × 20 மீட்டர்',
  'sportWorkoutMmaHybridHipEscapeName': 'இடுப்பு விடுவிப்பு (ஷ்ரிம்ப்)',
  'sportWorkoutMmaHybridHipEscapeDetail': '3 செட் × ஒவ்வொரு பக்கமும் 10',
  'sportWorkoutMmaHybridSquatPressName': 'ஸ்குவாட் + பிரஸ்',
  'sportWorkoutMmaHybridSquatPressDetail': '3 செட் × 12',

  // 5. selfDefence
  'sportMoodSelfDefenceTitle': 'தற்காப்பு உடற்தகுதி',
  'sportMoodSelfDefencePurpose': 'அடிப்படை உடற்தகுதி + தற்காப்பு விழிப்பு',
  'sportMoodSelfDefenceFoodFocus':
      'சமநிலையாகச் சாப்பிடுங்கள்; பயிற்சிக்கு முன் கனமான உணவைத் தவிர்க்கவும்',
  'sportWorkoutSelfDefencePalmStrikeName': 'உள்ளங்கை தாக்குதல் பயிற்சி',
  'sportWorkoutSelfDefencePalmStrikeDetail': '3 செட் × 12',
  'sportWorkoutSelfDefenceKneeElbowName': 'முழங்கால் + முழங்கை இணைவு',
  'sportWorkoutSelfDefenceKneeElbowDetail': '3 செட் × 10',
  'sportWorkoutSelfDefenceFootworkName': 'மூலையிலிருந்து வெளியேறும் கால் அசைவு',
  'sportWorkoutSelfDefenceFootworkDetail': '4 செட் × 30 வினாடி',
  'sportWorkoutSelfDefencePushUpName': 'புஷ்-அப்',
  'sportWorkoutSelfDefencePushUpDetail': '3 செட் × 10',

  // ==========================================================
  // B. ஓட்டம் & சகிப்புத்திறன்
  // ==========================================================

  // 6. easyRun
  'sportMoodEasyRunTitle': 'இலகு ஓட்டம்',
  'sportMoodEasyRunPurpose': 'நிதானமான ஓட்டம் — ஏரோபிக் அடித்தளம்',
  'sportMoodEasyRunFoodFocus': 'இலகுவான உணவு, போதுமான நீர்',
  'sportWorkoutEasyRunEasyRunName': 'இலகு ஓட்டம்',
  'sportWorkoutEasyRunEasyRunDetail': '20-30 நிமிடம், பேசிக்கொண்டே ஓடும் வேகம்',
  'sportWorkoutEasyRunStridesName': 'ஸ்ட்ரைட்ஸ்',
  'sportWorkoutEasyRunStridesDetail': '4 செட் × 20 வினாடி கட்டுப்பாட்டு வேகம்',

  // 7. speedRun
  'sportMoodSpeedRunTitle': 'வேக ஓட்டம்',
  'sportMoodSpeedRunPurpose': 'வேகத்திற்கான ஸ்பிரிண்ட் இடைவெளிகள்',
  'sportMoodSpeedRunFoodFocus':
      'பயிற்சிக்கு 1-2 மணி நேரம் முன் கார்போஹைட்ரேட்',
  'sportWorkoutSpeedRunInterval400Name': '400m இடைவெளி',
  'sportWorkoutSpeedRunInterval400Detail':
      '6 செட் × 400m வேக வேகம், 90 வினாடி ஜாகிங்',
  'sportWorkoutSpeedRunHillSprintName': 'மேடு / படிக்கட்டு ஸ்பிரிண்ட்',
  'sportWorkoutSpeedRunHillSprintDetail': '4 செட் × 20 வினாடி',

  // 8. prep5km
  'sportMoodPrep5kmTitle': '5KM தயாரிப்பு',
  'sportMoodPrep5kmPurpose': 'முதல் 5KM பந்தயம் / சிறந்த நேரத்திற்குத் தயாரிப்பு',
  'sportMoodPrep5kmFoodFocus':
      'மிதமான கார்போஹைட்ரேட், எண்ணெய் உணவைத் தவிர்க்கவும்',
  'sportWorkoutPrep5kmTempoRunName': 'டெம்போ ஓட்டம்',
  'sportWorkoutPrep5kmTempoRunDetail': '15 நிமிடம் வசதியான-வேக வேகம்',
  'sportWorkoutPrep5kmInterval1kmName': '1km இடைவெளி',
  'sportWorkoutPrep5kmInterval1kmDetail':
      '2 செட் × 1km பந்தய வேகம், ஓய்வு 2 நிமிடம்',

  // 9. prep10km
  'sportMoodPrep10kmTitle': '10KM தயாரிப்பு',
  'sportMoodPrep10kmPurpose': '10KM-க்கான சகிப்புத்திறன்',
  'sportMoodPrep10kmFoodFocus': 'போதுமான கார்போஹைட்ரேட் + எலக்ட்ரோலைட்',
  'sportWorkoutPrep10kmLongSteadyName': 'நீண்ட சீரான ஓட்டம்',
  'sportWorkoutPrep10kmLongSteadyDetail': '40-50 நிமிடம் நிலையான வேகம்',
  'sportWorkoutPrep10kmSurgeName': 'இடையில் வேகம்',
  'sportWorkoutPrep10kmSurgeDetail': 'ஓட்டத்தினுள் 5 செட் × 1 நிமிடம் வேகம்',

  // 10. trailRun
  'sportMoodTrailRunTitle': 'பாதை ஓட்டம்',
  'sportMoodTrailRunPurpose': 'பாதை ஓட்டம் — வலுவான கால், நல்ல சமநிலை',
  'sportMoodTrailRunFoodFocus': 'எளிதில் எடுத்துச் செல்லும் தின்பண்டம் + கூடுதல் நீர்',
  'sportWorkoutTrailRunTrailRunName': 'பாதை ஓட்டம்',
  'sportWorkoutTrailRunTrailRunDetail':
      '45-60 நிமிடம், இறக்கத்தில் கால் வைப்பில் கவனம்',
  'sportWorkoutTrailRunCalfRaisesName': 'கெண்டைக்கால் உயர்த்தல்',
  'sportWorkoutTrailRunCalfRaisesDetail': 'ஓட்டத்திற்குப் பின் 3 செட் × 15',

  // 11. marathonBase
  'sportMoodMarathonBaseTitle': 'மாரத்தான் அடித்தளம்',
  'sportMoodMarathonBasePurpose':
      'நீண்ட தூர அடித்தளத்தைப் பாதுகாப்பாகக் கட்டமைக்கவும்',
  'sportMoodMarathonBaseFoodFocus':
      'நீண்ட பயிற்சி நாட்களில் அதிக கார்போஹைட்ரேட்',
  'sportWorkoutMarathonBaseLongRunName': 'நீண்ட ஓட்டம்',
  'sportWorkoutMarathonBaseLongRunDetail': '60-90 நிமிடம் இலகு வேகம்',
  'sportWorkoutMarathonBaseRefuelName': 'ஓட்டத்தினுள் நிரப்புதல்',
  'sportWorkoutMarathonBaseRefuelDetail':
      'ஒவ்வொரு 20 நிமிடமும் நீர் / ஐசோடோனிக்',

  // ==========================================================
  // C. ஜிம் & உடல் இலக்கு
  // ==========================================================

  // 12. muscleGain
  'sportMoodMuscleGainTitle': 'தசை வளர்ப்பு',
  'sportMoodMuscleGainPurpose': 'ஹைபர்டிராஃபி — படிப்படியாகத் தசை வளர்ப்பு',
  'sportMoodMuscleGainFoodFocus': 'சிறிய உபரி + கிலோவுக்கு 2g புரதம்',
  'sportWorkoutMuscleGainSquatLegPressName': 'ஸ்குவாட் / லெக் பிரஸ்',
  'sportWorkoutMuscleGainSquatLegPressDetail': '4 செட் × 8-10',
  'sportWorkoutMuscleGainBenchPushUpName': 'பென்ச் / எடையுடன் புஷ்-அப்',
  'sportWorkoutMuscleGainBenchPushUpDetail': '4 செட் × 8-10',
  'sportWorkoutMuscleGainRowPulldownName': 'ரோ / லேட் புல்டவுன்',
  'sportWorkoutMuscleGainRowPulldownDetail': '4 செட் × 10',
  'sportWorkoutMuscleGainShoulderPressName': 'ஷோல்டர் பிரஸ்',
  'sportWorkoutMuscleGainShoulderPressDetail': '3 செட் × 10',
  'sportWorkoutMuscleGainArmSupersetName': 'பைசெப் + டிரைசெப் சூப்பர்செட்',
  'sportWorkoutMuscleGainArmSupersetDetail': '3 செட் × 12',

  // 13. fatLoss
  'sportMoodFatLossTitle': 'கொழுப்புக் குறைப்பு',
  'sportMoodFatLossPurpose': 'கொழுப்பை எரிக்கவும், தசையைத் தக்கவைக்கவும்',
  'sportMoodFatLossFoodFocus': 'பாதுகாப்பான பற்றாக்குறை + அதிக புரதம்',
  'sportWorkoutFatLossCircuitSquatName': 'சர்க்யூட்: ஸ்குவாட்',
  'sportWorkoutFatLossCircuitSquatDetail': '3 சுற்று × 15',
  'sportWorkoutFatLossCircuitPushUpName': 'சர்க்யூட்: புஷ்-அப்',
  'sportWorkoutFatLossCircuitPushUpDetail': '3 சுற்று × 12',
  'sportWorkoutFatLossCircuitMountainClimberName': 'சர்க்யூட்: மவுண்டன் கிளைம்பர்',
  'sportWorkoutFatLossCircuitMountainClimberDetail': '3 சுற்று × 30 வினாடி',
  'sportWorkoutFatLossCircuitRowingName': 'சர்க்யூட்: ரோயிங் / ஜம்பிங் ஜாக்',
  'sportWorkoutFatLossCircuitRowingDetail': '3 சுற்று × 45 வினாடி',
  'sportWorkoutFatLossFinisherWalkName': 'இறுதி விறுநடை',
  'sportWorkoutFatLossFinisherWalkDetail': '10 நிமிடம்',

  // 14. bodyRecomp
  'sportMoodBodyRecompTitle': 'உடல் மறுசீரமைப்பு',
  'sportMoodBodyRecompPurpose': 'கொழுப்பு குறைப்பு + தசை வளர்ப்பு ஒரே நேரத்தில்',
  'sportMoodBodyRecompFoodFocus':
      'கலோரி பராமரிப்பு அளவில், புரதம் அதிகம்',
  'sportWorkoutBodyRecompGobletSquatName': 'கோப்லெட் ஸ்குவாட்',
  'sportWorkoutBodyRecompGobletSquatDetail': '4 செட் × 10',
  'sportWorkoutBodyRecompRomanianDeadliftName': 'ருமேனியன் டெட்லிஃப்ட்',
  'sportWorkoutBodyRecompRomanianDeadliftDetail': '3 செட் × 10',
  'sportWorkoutBodyRecompPushUpBenchName': 'புஷ்-அப் / பென்ச்',
  'sportWorkoutBodyRecompPushUpBenchDetail': '4 செட் × 10',
  'sportWorkoutBodyRecompOneArmRowName': 'ஒற்றைக் கை ரோ',
  'sportWorkoutBodyRecompOneArmRowDetail': '3 செட் × ஒவ்வொரு பக்கமும் 12',
  'sportWorkoutBodyRecompFarmerCarryName': 'ஃபார்மர் கேரி',
  'sportWorkoutBodyRecompFarmerCarryDetail': '3 செட் × 30 மீட்டர்',

  // 15. strengthDay
  'sportMoodStrengthDayTitle': 'வலிமை நாள்',
  'sportMoodStrengthDayPurpose': 'அதிகபட்ச வலிமை — கன எடை, குறைந்த ரெப்',
  'sportMoodStrengthDayFoodFocus':
      'முன் கார்போஹைட்ரேட், பின் புரதம்',
  'sportWorkoutStrengthDayHeavySquatName': 'கன ஸ்குவாட்',
  'sportWorkoutStrengthDayHeavySquatDetail': '5 செட் × 5',
  'sportWorkoutStrengthDayDeadliftName': 'டெட்லிஃப்ட்',
  'sportWorkoutStrengthDayDeadliftDetail': '3 செட் × 5',
  'sportWorkoutStrengthDayOverheadPressName': 'ஓவர்ஹெட் பிரஸ்',
  'sportWorkoutStrengthDayOverheadPressDetail': '4 செட் × 6',
  'sportWorkoutStrengthDayWeightedPlankName': 'எடையுடன் பிளாங்க்',
  'sportWorkoutStrengthDayWeightedPlankDetail': '3 செட் × 30 வினாடி',

  // 16. upperBody
  'sportMoodUpperBodyTitle': 'மேல் உடல்',
  'sportMoodUpperBodyPurpose': 'மார்பு, முதுகு, தோள் மற்றும் கைகளில் கவனம்',
  'sportMoodUpperBodyFoodFocus': 'மீட்புக்கான புரதம்',
  'sportWorkoutUpperBodyPushUpBenchName': 'புஷ்-அப் / பென்ச்',
  'sportWorkoutUpperBodyPushUpBenchDetail': '4 செட் × 10',
  'sportWorkoutUpperBodyPullUpRowName': 'புல்-அப் / ரோ',
  'sportWorkoutUpperBodyPullUpRowDetail': '4 செட் × 8',
  'sportWorkoutUpperBodyLateralRaiseName': 'லேட்டரல் ரெய்ஸ்',
  'sportWorkoutUpperBodyLateralRaiseDetail': '3 செட் × 12',
  'sportWorkoutUpperBodyBicepCurlName': 'பைசெப் கர்ல்',
  'sportWorkoutUpperBodyBicepCurlDetail': '3 செட் × 12',
  'sportWorkoutUpperBodyTricepDipName': 'டிரைசெப் டிப்',
  'sportWorkoutUpperBodyTricepDipDetail': '3 செட் × 10',

  // 17. lowerBody
  'sportMoodLowerBodyTitle': 'கீழ் உடல்',
  'sportMoodLowerBodyPurpose': 'வலுவான கால்கள் மற்றும் இடுப்பு',
  'sportMoodLowerBodyFoodFocus':
      'பயிற்சிக்குப் பின் கார்போஹைட்ரேட் + புரதம்',
  'sportWorkoutLowerBodySquatName': 'ஸ்குவாட்',
  'sportWorkoutLowerBodySquatDetail': '4 செட் × 10',
  'sportWorkoutLowerBodyWalkingLungeName': 'நடை லன்ஜ்',
  'sportWorkoutLowerBodyWalkingLungeDetail': '3 செட் × ஒவ்வொரு காலுக்கும் 10',
  'sportWorkoutLowerBodyHipThrustName': 'ஹிப் த்ரஸ்ட் / குளூட் பிரிட்ஜ்',
  'sportWorkoutLowerBodyHipThrustDetail': '4 செட் × 12',
  'sportWorkoutLowerBodyCalfRaiseName': 'கெண்டைக்கால் உயர்த்தல்',
  'sportWorkoutLowerBodyCalfRaiseDetail': '3 செட் × 15',

  // 18. coreAbs
  'sportMoodCoreAbsTitle': 'கோர் & வயிற்றுத் தசை',
  'sportMoodCoreAbsPurpose': 'வலுவான கோர், நல்ல தோற்றநிலை',
  'sportMoodCoreAbsFoodFocus': 'இன்று இனிப்பு பானங்களைக் குறைக்கவும்',
  'sportWorkoutCoreAbsPlankName': 'பிளாங்க்',
  'sportWorkoutCoreAbsPlankDetail': '3 செட் × 45 வினாடி',
  'sportWorkoutCoreAbsDeadBugName': 'டெட் பக்',
  'sportWorkoutCoreAbsDeadBugDetail': '3 செட் × ஒவ்வொரு பக்கமும் 10',
  'sportWorkoutCoreAbsRussianTwistName': 'ரஷ்யன் ட்விஸ்ட்',
  'sportWorkoutCoreAbsRussianTwistDetail': '3 செட் × 20',
  'sportWorkoutCoreAbsLegRaiseName': 'கால் உயர்த்தல்',
  'sportWorkoutCoreAbsLegRaiseDetail': '3 செட் × 12',
  'sportWorkoutCoreAbsSidePlankName': 'பக்கவாட்டு பிளாங்க்',
  'sportWorkoutCoreAbsSidePlankDetail': '2 செட் × ஒவ்வொரு பக்கமும் 30 வினாடி',

  // 19. homeWorkout
  'sportMoodHomeWorkoutTitle': 'வீட்டுப் பயிற்சி',
  'sportMoodHomeWorkoutPurpose': 'கருவிகள் இல்லாமல் வீட்டில் முழு உடல் பயிற்சி',
  'sportMoodHomeWorkoutFoodFocus':
      'சமநிலையாகச் சாப்பிடுங்கள்; முடிந்தால் வீட்டிலேயே சமையுங்கள்',
  'sportWorkoutHomeWorkoutBodyweightSquatName': 'உடல் எடை ஸ்குவாட்',
  'sportWorkoutHomeWorkoutBodyweightSquatDetail': '3 செட் × 15',
  'sportWorkoutHomeWorkoutPushUpName': 'புஷ்-அப்',
  'sportWorkoutHomeWorkoutPushUpDetail': '3 செட் × 10',
  'sportWorkoutHomeWorkoutReverseLungeName': 'பின்னோக்கு லன்ஜ்',
  'sportWorkoutHomeWorkoutReverseLungeDetail': '3 செட் × ஒவ்வொரு காலுக்கும் 10',
  'sportWorkoutHomeWorkoutSupermanHoldName': 'சூப்பர்மேன் ஹோல்ட்',
  'sportWorkoutHomeWorkoutSupermanHoldDetail': '3 செட் × 20 வினாடி',
  'sportWorkoutHomeWorkoutJumpingJackName': 'ஜம்பிங் ஜாக்',
  'sportWorkoutHomeWorkoutJumpingJackDetail': '3 செட் × 45 வினாடி',

  // 20. busy20min
  'sportMoodBusy20minTitle': 'பரபரப்பான 20 நிமிடம்',
  'sportMoodBusy20minPurpose': 'பரபரப்பான நாட்களுக்கு குறுகிய, தீவிரப் பயிற்சி',
  'sportMoodBusy20minFoodFocus': 'எளிய, புரதம் நிறைந்த உணவைத் தேர்வு செய்யுங்கள்',
  'sportWorkoutBusy20minEmom20Name': 'EMOM 20 நிமிடம்',
  'sportWorkoutBusy20minEmom20Detail':
      'நிமிடம் 1: 10 ஸ்குவாட் • நிமிடம் 2: 8 புஷ்-அப் • நிமிடம் 3: 30வி '
          'பிளாங்க் • நிமிடம் 4: 10 லன்ஜ் • மீண்டும்',

  // ==========================================================
  // D. குறிப்பிட்ட விளையாட்டு
  // ==========================================================

  // 21. footballMatchday
  'sportMoodFootballMatchdayTitle': 'கால்பந்து போட்டி நாள்',
  'sportMoodFootballMatchdayPurpose': 'கால்பந்து போட்டி நாளுக்குத் தயாரிப்பு',
  'sportMoodFootballMatchdayFoodFocus':
      'போட்டிக்கு 3 மணி நேரம் முன் கார்போஹைட்ரேட், எண்ணெய் உணவைத் தவிர்க்கவும்',
  'sportWorkoutFootballMatchdayDynamicStretchName': 'இயங்கு நீட்சி',
  'sportWorkoutFootballMatchdayDynamicStretchDetail': '8 நிமிடம்',
  'sportWorkoutFootballMatchdayShortSprintName': 'குறுகிய ஸ்பிரிண்ட்',
  'sportWorkoutFootballMatchdayShortSprintDetail': '6 செட் × 20 மீட்டர்',
  'sportWorkoutFootballMatchdayPassingDrillName': 'பாஸிங் / ஜக்லிங் பயிற்சி',
  'sportWorkoutFootballMatchdayPassingDrillDetail': '15 நிமிடம்',
  'sportWorkoutFootballMatchdayAgilityLadderName': 'சுறுசுறுப்பு ஏணி / கோன்',
  'sportWorkoutFootballMatchdayAgilityLadderDetail': '4 செட்',

  // 22. badmintonAgility
  'sportMoodBadmintonAgilityTitle': 'பூப்பந்து சுறுசுறுப்பு',
  'sportMoodBadmintonAgilityPurpose':
      'கால் அசைவு, வேகம் மற்றும் கோர்ட் சகிப்புத்திறன்',
  'sportMoodBadmintonAgilityFoodFocus':
      'இலகு கார்போஹைட்ரேட் + மீட்புக்கான புரதம்',
  'sportWorkoutBadmintonAgilityFootworkDrillName': 'கால் அசைவு பயிற்சி',
  'sportWorkoutBadmintonAgilityFootworkDrillDetail': '4 செட் × 45 வினாடி',
  'sportWorkoutBadmintonAgilityShadowSwingName': 'ஷேடோ ஸ்விங்',
  'sportWorkoutBadmintonAgilityShadowSwingDetail': '3 செட் × 12',
  'sportWorkoutBadmintonAgilityLateralShuffleName': 'பக்கவாட்டு நகர்வு',
  'sportWorkoutBadmintonAgilityLateralShuffleDetail': '4 செட் × 30 வினாடி',
  'sportWorkoutBadmintonAgilityCorePlankName': 'கோர் பிளாங்க்',
  'sportWorkoutBadmintonAgilityCorePlankDetail': '3 செட் × 30 வினாடி',

  // 23. basketballEnergy
  'sportMoodBasketballEnergyTitle': 'கூடைப்பந்து ஆற்றல்',
  'sportMoodBasketballEnergyPurpose': 'தாண்டல், ஸ்பிரிண்ட் மற்றும் ஆட்ட ஆற்றல்',
  'sportMoodBasketballEnergyFoodFocus': 'போதுமான கலோரி, அதிக நீர்ச்சத்து',
  'sportWorkoutBasketballEnergySquatJumpName': 'ஸ்குவாட் ஜம்ப்',
  'sportWorkoutBasketballEnergySquatJumpDetail': '4 செட் × 10',
  'sportWorkoutBasketballEnergySuicideSprintName': 'திரும்பு ஸ்பிரிண்ட்',
  'sportWorkoutBasketballEnergySuicideSprintDetail': '4 செட்',
  'sportWorkoutBasketballEnergyDefensiveSlideName': 'தற்காப்பு நகர்வு',
  'sportWorkoutBasketballEnergyDefensiveSlideDetail': '4 செட் × 30 வினாடி',
  'sportWorkoutBasketballEnergyLayupDrillName': 'லேஅப் / ஷூட்டிங் பயிற்சி',
  'sportWorkoutBasketballEnergyLayupDrillDetail': '15 நிமிடம்',

  // 24. tennisMode
  'sportMoodTennisModeTitle': 'டென்னிஸ் முறை',
  'sportMoodTennisModePurpose': 'கோர் சுழற்சி மற்றும் பக்கவாட்டு நகர்வு',
  'sportMoodTennisModeFoodFocus': 'மிதமான கார்போஹைட்ரேட் + எலக்ட்ரோலைட்',
  'sportWorkoutTennisModeShadowStrokeName': 'ஷேடோ ஸ்ட்ரோக்',
  'sportWorkoutTennisModeShadowStrokeDetail': '4 செட் × 12',
  'sportWorkoutTennisModeSideShuffleName': 'பக்கவாட்டு நகர்வு + ஸ்பிலிட் ஸ்டெப்',
  'sportWorkoutTennisModeSideShuffleDetail': '4 செட் × 30 வினாடி',
  'sportWorkoutTennisModeMedBallRotationName': 'மெட்-பால் சுழற்சி',
  'sportWorkoutTennisModeMedBallRotationDetail': '3 செட் × ஒவ்வொரு பக்கமும் 10',
  'sportWorkoutTennisModeWallRallyName': 'சுவர் ரேலி',
  'sportWorkoutTennisModeWallRallyDetail': '10 நிமிடம்',

  // 25. cyclistEndurance
  'sportMoodCyclistEnduranceTitle': 'சைக்கிள் சகிப்புத்திறன்',
  'sportMoodCyclistEndurancePurpose':
      'மிதிவண்டி சகிப்புத்திறன் மற்றும் நிலையான கால்கள்',
  'sportMoodCyclistEnduranceFoodFocus':
      'நீண்ட அமர்வுகளுக்குத் தொடர்ச்சியான கார்போஹைட்ரேட்',
  'sportWorkoutCyclistEnduranceSteadyRideName': 'சீரான ரைடு',
  'sportWorkoutCyclistEnduranceSteadyRideDetail': '45-60 நிமிடம் வசதியான மண்டலம்',
  'sportWorkoutCyclistEnduranceCadenceDrillName': 'கேடன்ஸ் பயிற்சி',
  'sportWorkoutCyclistEnduranceCadenceDrillDetail':
      '5 செட் × 1 நிமிடம் அதிக மிதி வேகம்',

  // 26. swimmerMode
  'sportMoodSwimmerModeTitle': 'நீச்சல் முறை',
  'sportMoodSwimmerModePurpose': 'நீச்சல் நுட்பம் மற்றும் சகிப்புத்திறன்',
  'sportMoodSwimmerModeFoodFocus':
      'நீச்சலுக்கு 1 மணி நேரம் முன் இலகுவான உணவு',
  'sportWorkoutSwimmerModeWarmupLapsName': 'வார்ம்-அப் லேப்',
  'sportWorkoutSwimmerModeWarmupLapsDetail': '4 செட் × 50m இலகுவாக',
  'sportWorkoutSwimmerModeMainSetName': 'முக்கிய செட்',
  'sportWorkoutSwimmerModeMainSetDetail': '6 செட் × 100m, ஓய்வு 20 வினாடி',
  'sportWorkoutSwimmerModeKickDrillName': 'கிக் பயிற்சி',
  'sportWorkoutSwimmerModeKickDrillDetail': '4 செட் × 50m போர்டுடன்',

  // 27. hikingMode
  'sportMoodHikingModeTitle': 'மலையேற்ற முறை',
  'sportMoodHikingModePurpose': 'மலையேற்றத் தயாரிப்பு — கால்கள் & கார்டியோ',
  'sportMoodHikingModeFoodFocus':
      'ஆற்றல் தின்பண்டம் + மலையேற்றத்தின்போது 2L நீர்',
  'sportWorkoutHikingModeStepUpName': 'ஸ்டெப்-அப்',
  'sportWorkoutHikingModeStepUpDetail': '4 செட் × ஒவ்வொரு காலுக்கும் 12',
  'sportWorkoutHikingModeInclineWalkName': 'சரிவு / படிக்கட்டு நடை',
  'sportWorkoutHikingModeInclineWalkDetail': '30 நிமிடம்',
  'sportWorkoutHikingModeFarmerCarryPackName': 'ஃபார்மர் கேரி (பை)',
  'sportWorkoutHikingModeFarmerCarryPackDetail': '3 செட் × 40 மீட்டர்',

  // 28. courtGame
  'sportMoodCourtGameTitle': 'கோர்ட் ஆட்ட முறை',
  'sportMoodCourtGamePurpose': 'நண்பர்களுடன் நிதானமான கோர்ட் ஆட்டம்',
  'sportMoodCourtGameFoodFocus':
      'ஆடுவதற்கு ஒரு மணி நேரம் முன் கனமான உணவைத் தவிர்க்கவும்',
  'sportWorkoutCourtGameDynamicWarmupName': 'இயங்கு வார்ம்-அப்',
  'sportWorkoutCourtGameDynamicWarmupDetail': '10 நிமிடம்',
  'sportWorkoutCourtGameGamePlayName': 'ஆட்டம்',
  'sportWorkoutCourtGameGamePlayDetail': '45-60 நிமிடம்',
  'sportWorkoutCourtGameCoolWalkName': 'ஆறுதல் நடை',
  'sportWorkoutCourtGameCoolWalkDetail': 'முடிந்தபின் 5 நிமிடம்',

  // ==========================================================
  // E. மீட்பு
  // ==========================================================

  // 29. mobilityRecovery
  'sportMoodMobilityRecoveryTitle': 'அசைவுத்திறன் & மீட்பு',
  'sportMoodMobilityRecoveryPurpose':
      'மூட்டுகளைத் தளர்த்துங்கள், தசைகளை மீட்டெடுங்கள்',
  'sportMoodMobilityRecoveryFoodFocus': 'புரதம் + பழம், சீக்கிரம் தூங்குங்கள்',
  'sportWorkoutMobilityRecoveryCatCowName': 'கேட்-கவ்',
  'sportWorkoutMobilityRecoveryCatCowDetail': '2 செட் × 10',
  'sportWorkoutMobilityRecoveryHipOpenerName': 'இடுப்பு விரிப்பு (90/90)',
  'sportWorkoutMobilityRecoveryHipOpenerDetail':
      '2 செட் × ஒவ்வொரு பக்கமும் 45 வினாடி',
  'sportWorkoutMobilityRecoveryHamstringStretchName': 'தொடைத் தசை நீட்சி',
  'sportWorkoutMobilityRecoveryHamstringStretchDetail': '2 செட் × 45 வினாடி',
  'sportWorkoutMobilityRecoveryThoracicRotationName': 'மார்பு முதுகெலும்பு சுழற்சி',
  'sportWorkoutMobilityRecoveryThoracicRotationDetail':
      '2 செட் × ஒவ்வொரு பக்கமும் 8',
  'sportWorkoutMobilityRecoveryDeepBreathingName': 'ஆழ்ந்த மூச்சு',
  'sportWorkoutMobilityRecoveryDeepBreathingDetail': '5 நிமிடம்',

  // 30. restDayNutrition
  'sportMoodRestDayNutritionTitle': 'ஓய்வு நாள் ஊட்டச்சத்து',
  'sportMoodRestDayNutritionPurpose': 'ஓய்வு நாள் — உணவு & மீட்பில் கவனம்',
  'sportMoodRestDayNutritionFoodFocus':
      'புரதம் அதிகமாகத் தொடரட்டும், கார்போஹைட்ரேட் மிதமாக',
  'sportWorkoutRestDayNutritionEasyWalkName': 'நிதான நடை',
  'sportWorkoutRestDayNutritionEasyWalkDetail': 'உணவுக்குப் பின் 15-20 நிமிடம்',
  'sportWorkoutRestDayNutritionLightStretchName': 'இலகு நீட்சி',
  'sportWorkoutRestDayNutritionLightStretchDetail': 'தூங்குவதற்கு முன் 10 நிமிடம்',
};
