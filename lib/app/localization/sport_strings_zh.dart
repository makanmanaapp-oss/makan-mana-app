/// Sport Mood + workout block copy (Simplified Chinese).
///
/// Status: pending native review (see docs/localization/fit_zh_ta_review.md).
/// Key set must stay identical to kSportStringsMs / En / Ta.
library;

const Map<String, String> kSportStringsZh = {
  // ---------- 类别标签 ----------
  'sportMoodCategoryCombat': '格斗与搏击',
  'sportMoodCategoryRunning': '跑步与耐力',
  'sportMoodCategoryGym': '健身与体态目标',
  'sportMoodCategorySport': '专项运动',
  'sportMoodCategoryRecovery': '恢复',

  // ---------- 每日计划教练提示 ----------
  'fitCoachNoteFatLoss': '坚持比完美更重要。完成这次训练，晚餐再选高蛋白的。',
  'fitCoachNoteMuscleGain': '专注动作质量，重量一点一点加。今天要吃够。',
  'fitCoachNoteDefault': '今天动一动，哪怕只是一会儿。身体明天会感谢你。',
  'fitCoachNoteInjury': '记录显示您有伤患，强度已下调。如有疼痛请立即停止；若持续不适，请咨询专业人士。',
  'fitCoachNoteRestDay': '休息日同样重要。蛋白质保持充足、睡眠充足——身体是在休息时重建的。',
  'fitWorkoutFallback': '训练课',
  'fitIntensityLow': '低强度',
  'fitIntensityMedium': '中强度',
  'fitIntensityHigh': '高强度',
  'fitStatusCompleted': '已完成',
  'fitStatusSkipped': '已跳过',

  // ---------- 共用热身动作 ----------
  'sportWarmupBriskWalkName': '快走 / 慢跑',
  'sportWarmupBriskWalkDetail': '5 分钟',
  'sportWarmupJointMobilityName': '关节活动度',
  'sportWarmupJointMobilityDetail': '脚踝、髋部、肩部 — 3 分钟',
  'sportWarmupDynamicStretchName': '动态拉伸',
  'sportWarmupDynamicStretchDetail': '摆腿、绕臂 — 2 分钟',

  // ---------- 共用放松动作 ----------
  'sportCooldownHamstringName': '腘绳肌拉伸',
  'sportCooldownHamstringDetail': '2 组 × 30 秒',
  'sportCooldownQuadCalfName': '股四头肌 + 小腿拉伸',
  'sportCooldownQuadCalfDetail': '2 组 × 30 秒',
  'sportCooldownBreathingName': '缓慢呼吸',
  'sportCooldownBreathingDetail': '2 分钟',

  // ==========================================================
  // A. 格斗与搏击
  // ==========================================================

  // 1. fighterCamp
  'sportMoodFighterCampTitle': '格斗训练营',
  'sportMoodFighterCampPurpose': '打造格斗者的体能、爆发力与意志',
  'sportMoodFighterCampFoodFocus': '适量碳水 + 高蛋白',
  'sportWorkoutFighterCampSkippingName': '跳绳',
  'sportWorkoutFighterCampSkippingDetail': '4 组 × 2 分钟，休息 45 秒',
  'sportWorkoutFighterCampShadowBoxingName': '空击',
  'sportWorkoutFighterCampShadowBoxingDetail': '3 组 × 3 分钟，动作干净',
  'sportWorkoutFighterCampBurpeesName': '波比跳',
  'sportWorkoutFighterCampBurpeesDetail': '4 组 × 10 次',
  'sportWorkoutFighterCampPushUpName': '俯卧撑',
  'sportWorkoutFighterCampPushUpDetail': '4 组 × 12 次',
  'sportWorkoutFighterCampSitUpTwistName': '仰卧起坐 + 转体',
  'sportWorkoutFighterCampSitUpTwistDetail': '3 组 × 20 次',

  // 2. boxingConditioning
  'sportMoodBoxingConditioningTitle': '拳击体能',
  'sportMoodBoxingConditioningPurpose': '提升出拳速度与肩部耐力',
  'sportMoodBoxingConditioningFoodFocus': '恢复用蛋白 + 补足水分',
  'sportWorkoutBoxingConditioningJabCrossName': '刺拳 - 直拳组合',
  'sportWorkoutBoxingConditioningJabCrossDetail': '5 组 × 2 分钟',
  'sportWorkoutBoxingConditioningSpeedPunchesName': '快速出拳',
  'sportWorkoutBoxingConditioningSpeedPunchesDetail': '4 组 × 30 秒全力',
  'sportWorkoutBoxingConditioningPlankShoulderTapName': '平板支撑拍肩',
  'sportWorkoutBoxingConditioningPlankShoulderTapDetail': '3 组 × 20 次',
  'sportWorkoutBoxingConditioningJumpRopeSprintName': '跳绳冲刺',
  'sportWorkoutBoxingConditioningJumpRopeSprintDetail': '4 组 × 45 秒',

  // 3. muayThai
  'sportMoodMuayThaiTitle': '泰拳模式',
  'sportMoodMuayThaiPurpose': '强化膝击、扫踢与内围缠斗',
  'sportMoodMuayThaiFoodFocus': '训练前补碳水，训练后补蛋白',
  'sportWorkoutMuayThaiTeepDrillName': '前踢练习',
  'sportWorkoutMuayThaiTeepDrillDetail': '3 组 × 每腿 12 次',
  'sportWorkoutMuayThaiRoundhouseName': '扫踢（空击）',
  'sportWorkoutMuayThaiRoundhouseDetail': '4 组 × 每侧 10 次',
  'sportWorkoutMuayThaiKneeStrikesName': '膝击',
  'sportWorkoutMuayThaiKneeStrikesDetail': '3 组 × 每膝 15 次',
  'sportWorkoutMuayThaiSquatJumpName': '深蹲跳',
  'sportWorkoutMuayThaiSquatJumpDetail': '3 组 × 12 次',
  'sportWorkoutMuayThaiCorePlankName': '核心平板支撑',
  'sportWorkoutMuayThaiCorePlankDetail': '3 组 × 45 秒',

  // 4. mmaHybrid
  'sportMoodMmaHybridTitle': 'MMA 综合',
  'sportMoodMmaHybridPurpose': '站立打击、地面缠斗与心肺引擎的结合',
  'sportMoodMmaHybridFoodFocus': '热量要够，别大幅节食',
  'sportWorkoutMmaHybridSprawlDrillName': '防摔练习',
  'sportWorkoutMmaHybridSprawlDrillDetail': '4 组 × 10 次',
  'sportWorkoutMmaHybridShadowStrikingName': '空击打击',
  'sportWorkoutMmaHybridShadowStrikingDetail': '3 组 × 3 分钟',
  'sportWorkoutMmaHybridBearCrawlName': '熊爬',
  'sportWorkoutMmaHybridBearCrawlDetail': '3 组 × 20 米',
  'sportWorkoutMmaHybridHipEscapeName': '髋部逃脱（虾行）',
  'sportWorkoutMmaHybridHipEscapeDetail': '3 组 × 每侧 10 次',
  'sportWorkoutMmaHybridSquatPressName': '深蹲 + 推举',
  'sportWorkoutMmaHybridSquatPressDetail': '3 组 × 12 次',

  // 5. selfDefence
  'sportMoodSelfDefenceTitle': '防身体能',
  'sportMoodSelfDefencePurpose': '基础体能 + 防身反应',
  'sportMoodSelfDefenceFoodFocus': '饮食均衡，训练前别吃太饱',
  'sportWorkoutSelfDefencePalmStrikeName': '掌击练习',
  'sportWorkoutSelfDefencePalmStrikeDetail': '3 组 × 12 次',
  'sportWorkoutSelfDefenceKneeElbowName': '膝击 + 肘击组合',
  'sportWorkoutSelfDefenceKneeElbowDetail': '3 组 × 10 次',
  'sportWorkoutSelfDefenceFootworkName': '脱离角落步法',
  'sportWorkoutSelfDefenceFootworkDetail': '4 组 × 30 秒',
  'sportWorkoutSelfDefencePushUpName': '俯卧撑',
  'sportWorkoutSelfDefencePushUpDetail': '3 组 × 10 次',

  // ==========================================================
  // B. 跑步与耐力
  // ==========================================================

  // 6. easyRun
  'sportMoodEasyRunTitle': '轻松跑',
  'sportMoodEasyRunPurpose': '轻松慢跑，打好有氧基础',
  'sportMoodEasyRunFoodFocus': '吃得清淡，补足水分',
  'sportWorkoutEasyRunEasyRunName': '轻松跑',
  'sportWorkoutEasyRunEasyRunDetail': '20-30 分钟，能边跑边聊天',
  'sportWorkoutEasyRunStridesName': '快步跑',
  'sportWorkoutEasyRunStridesDetail': '4 组 × 20 秒可控加速',

  // 7. speedRun
  'sportMoodSpeedRunTitle': '速度跑',
  'sportMoodSpeedRunPurpose': '冲刺间歇，提升速度',
  'sportMoodSpeedRunFoodFocus': '训练前 1-2 小时补碳水',
  'sportWorkoutSpeedRunInterval400Name': '400m 间歇',
  'sportWorkoutSpeedRunInterval400Detail': '6 组 × 400m 快配速，慢跑 90 秒',
  'sportWorkoutSpeedRunHillSprintName': '坡道 / 阶梯冲刺',
  'sportWorkoutSpeedRunHillSprintDetail': '4 组 × 20 秒',

  // 8. prep5km
  'sportMoodPrep5kmTitle': '5KM 备战',
  'sportMoodPrep5kmPurpose': '备战首个 5KM 比赛或刷新个人纪录',
  'sportMoodPrep5kmFoodFocus': '适量碳水，避开油腻食物',
  'sportWorkoutPrep5kmTempoRunName': '节奏跑',
  'sportWorkoutPrep5kmTempoRunDetail': '15 分钟舒适偏快配速',
  'sportWorkoutPrep5kmInterval1kmName': '1km 间歇',
  'sportWorkoutPrep5kmInterval1kmDetail': '2 组 × 1km 比赛配速，休息 2 分钟',

  // 9. prep10km
  'sportMoodPrep10kmTitle': '10KM 备战',
  'sportMoodPrep10kmPurpose': '为 10KM 打造耐力',
  'sportMoodPrep10kmFoodFocus': '碳水充足 + 电解质',
  'sportWorkoutPrep10kmLongSteadyName': '长距离匀速跑',
  'sportWorkoutPrep10kmLongSteadyDetail': '40-50 分钟稳定配速',
  'sportWorkoutPrep10kmSurgeName': '途中加速',
  'sportWorkoutPrep10kmSurgeDetail': '跑动中 5 组 × 1 分钟加速',

  // 10. trailRun
  'sportMoodTrailRunTitle': '越野跑',
  'sportMoodTrailRunPurpose': '越野跑——腿部有力，平衡更好',
  'sportMoodTrailRunFoodFocus': '好携带的零食 + 多带水',
  'sportWorkoutTrailRunTrailRunName': '越野跑',
  'sportWorkoutTrailRunTrailRunDetail': '45-60 分钟，下坡注意落脚',
  'sportWorkoutTrailRunCalfRaisesName': '提踵',
  'sportWorkoutTrailRunCalfRaisesDetail': '跑后 3 组 × 15 次',

  // 11. marathonBase
  'sportMoodMarathonBaseTitle': '马拉松基础',
  'sportMoodMarathonBasePurpose': '安全地打好长距离基础',
  'sportMoodMarathonBaseFoodFocus': '长训日碳水要高',
  'sportWorkoutMarathonBaseLongRunName': '长距离跑',
  'sportWorkoutMarathonBaseLongRunDetail': '60-90 分钟轻松配速',
  'sportWorkoutMarathonBaseRefuelName': '途中补给',
  'sportWorkoutMarathonBaseRefuelDetail': '每 20 分钟补水 / 等渗饮料',

  // ==========================================================
  // C. 健身与体态目标
  // ==========================================================

  // 12. muscleGain
  'sportMoodMuscleGainTitle': '增肌',
  'sportMoodMuscleGainPurpose': '肌肥大——循序渐进地增肌',
  'sportMoodMuscleGainFoodFocus': '小幅热量盈余 + 每公斤 2g 蛋白',
  'sportWorkoutMuscleGainSquatLegPressName': '深蹲 / 腿举',
  'sportWorkoutMuscleGainSquatLegPressDetail': '4 组 × 8-10 次',
  'sportWorkoutMuscleGainBenchPushUpName': '卧推 / 负重俯卧撑',
  'sportWorkoutMuscleGainBenchPushUpDetail': '4 组 × 8-10 次',
  'sportWorkoutMuscleGainRowPulldownName': '划船 / 高位下拉',
  'sportWorkoutMuscleGainRowPulldownDetail': '4 组 × 10 次',
  'sportWorkoutMuscleGainShoulderPressName': '肩推',
  'sportWorkoutMuscleGainShoulderPressDetail': '3 组 × 10 次',
  'sportWorkoutMuscleGainArmSupersetName': '二头 + 三头超级组',
  'sportWorkoutMuscleGainArmSupersetDetail': '3 组 × 12 次',

  // 13. fatLoss
  'sportMoodFatLossTitle': '减脂',
  'sportMoodFatLossPurpose': '燃烧脂肪，保住肌肉',
  'sportMoodFatLossFoodFocus': '安全热量缺口 + 高蛋白',
  'sportWorkoutFatLossCircuitSquatName': '循环：深蹲',
  'sportWorkoutFatLossCircuitSquatDetail': '3 轮 × 15 次',
  'sportWorkoutFatLossCircuitPushUpName': '循环：俯卧撑',
  'sportWorkoutFatLossCircuitPushUpDetail': '3 轮 × 12 次',
  'sportWorkoutFatLossCircuitMountainClimberName': '循环：登山跑',
  'sportWorkoutFatLossCircuitMountainClimberDetail': '3 轮 × 30 秒',
  'sportWorkoutFatLossCircuitRowingName': '循环：划船机 / 开合跳',
  'sportWorkoutFatLossCircuitRowingDetail': '3 轮 × 45 秒',
  'sportWorkoutFatLossFinisherWalkName': '收尾快走',
  'sportWorkoutFatLossFinisherWalkDetail': '10 分钟',

  // 14. bodyRecomp
  'sportMoodBodyRecompTitle': '体态重塑',
  'sportMoodBodyRecompPurpose': '同时减脂与增肌',
  'sportMoodBodyRecompFoodFocus': '热量接近维持水平，蛋白质要高',
  'sportWorkoutBodyRecompGobletSquatName': '高脚杯深蹲',
  'sportWorkoutBodyRecompGobletSquatDetail': '4 组 × 10 次',
  'sportWorkoutBodyRecompRomanianDeadliftName': '罗马尼亚硬拉',
  'sportWorkoutBodyRecompRomanianDeadliftDetail': '3 组 × 10 次',
  'sportWorkoutBodyRecompPushUpBenchName': '俯卧撑 / 卧推',
  'sportWorkoutBodyRecompPushUpBenchDetail': '4 组 × 10 次',
  'sportWorkoutBodyRecompOneArmRowName': '单臂划船',
  'sportWorkoutBodyRecompOneArmRowDetail': '3 组 × 每侧 12 次',
  'sportWorkoutBodyRecompFarmerCarryName': '农夫行走',
  'sportWorkoutBodyRecompFarmerCarryDetail': '3 组 × 30 米',

  // 15. strengthDay
  'sportMoodStrengthDayTitle': '力量日',
  'sportMoodStrengthDayPurpose': '最大力量——大重量、低次数',
  'sportMoodStrengthDayFoodFocus': '练前补碳水，练后补蛋白',
  'sportWorkoutStrengthDayHeavySquatName': '大重量深蹲',
  'sportWorkoutStrengthDayHeavySquatDetail': '5 组 × 5 次',
  'sportWorkoutStrengthDayDeadliftName': '硬拉',
  'sportWorkoutStrengthDayDeadliftDetail': '3 组 × 5 次',
  'sportWorkoutStrengthDayOverheadPressName': '过头推举',
  'sportWorkoutStrengthDayOverheadPressDetail': '4 组 × 6 次',
  'sportWorkoutStrengthDayWeightedPlankName': '负重平板支撑',
  'sportWorkoutStrengthDayWeightedPlankDetail': '3 组 × 30 秒',

  // 16. upperBody
  'sportMoodUpperBodyTitle': '上肢训练',
  'sportMoodUpperBodyPurpose': '专注胸、背、肩与手臂',
  'sportMoodUpperBodyFoodFocus': '恢复用蛋白',
  'sportWorkoutUpperBodyPushUpBenchName': '俯卧撑 / 卧推',
  'sportWorkoutUpperBodyPushUpBenchDetail': '4 组 × 10 次',
  'sportWorkoutUpperBodyPullUpRowName': '引体向上 / 划船',
  'sportWorkoutUpperBodyPullUpRowDetail': '4 组 × 8 次',
  'sportWorkoutUpperBodyLateralRaiseName': '侧平举',
  'sportWorkoutUpperBodyLateralRaiseDetail': '3 组 × 12 次',
  'sportWorkoutUpperBodyBicepCurlName': '二头弯举',
  'sportWorkoutUpperBodyBicepCurlDetail': '3 组 × 12 次',
  'sportWorkoutUpperBodyTricepDipName': '三头臂屈伸',
  'sportWorkoutUpperBodyTricepDipDetail': '3 组 × 10 次',

  // 17. lowerBody
  'sportMoodLowerBodyTitle': '下肢训练',
  'sportMoodLowerBodyPurpose': '练出有力的腿与臀',
  'sportMoodLowerBodyFoodFocus': '训练后补碳水 + 蛋白',
  'sportWorkoutLowerBodySquatName': '深蹲',
  'sportWorkoutLowerBodySquatDetail': '4 组 × 10 次',
  'sportWorkoutLowerBodyWalkingLungeName': '行进弓步',
  'sportWorkoutLowerBodyWalkingLungeDetail': '3 组 × 每腿 10 次',
  'sportWorkoutLowerBodyHipThrustName': '臀推 / 臀桥',
  'sportWorkoutLowerBodyHipThrustDetail': '4 组 × 12 次',
  'sportWorkoutLowerBodyCalfRaiseName': '提踵',
  'sportWorkoutLowerBodyCalfRaiseDetail': '3 组 × 15 次',

  // 18. coreAbs
  'sportMoodCoreAbsTitle': '核心与腹肌',
  'sportMoodCoreAbsPurpose': '核心稳固，体态更好',
  'sportMoodCoreAbsFoodFocus': '今天少喝含糖饮料',
  'sportWorkoutCoreAbsPlankName': '平板支撑',
  'sportWorkoutCoreAbsPlankDetail': '3 组 × 45 秒',
  'sportWorkoutCoreAbsDeadBugName': '死虫式',
  'sportWorkoutCoreAbsDeadBugDetail': '3 组 × 每侧 10 次',
  'sportWorkoutCoreAbsRussianTwistName': '俄罗斯转体',
  'sportWorkoutCoreAbsRussianTwistDetail': '3 组 × 20 次',
  'sportWorkoutCoreAbsLegRaiseName': '举腿',
  'sportWorkoutCoreAbsLegRaiseDetail': '3 组 × 12 次',
  'sportWorkoutCoreAbsSidePlankName': '侧平板支撑',
  'sportWorkoutCoreAbsSidePlankDetail': '2 组 × 每侧 30 秒',

  // 19. homeWorkout
  'sportMoodHomeWorkoutTitle': '居家训练',
  'sportMoodHomeWorkoutPurpose': '在家徒手练全身',
  'sportMoodHomeWorkoutFoodFocus': '饮食均衡，尽量自己下厨',
  'sportWorkoutHomeWorkoutBodyweightSquatName': '徒手深蹲',
  'sportWorkoutHomeWorkoutBodyweightSquatDetail': '3 组 × 15 次',
  'sportWorkoutHomeWorkoutPushUpName': '俯卧撑',
  'sportWorkoutHomeWorkoutPushUpDetail': '3 组 × 10 次',
  'sportWorkoutHomeWorkoutReverseLungeName': '后撤弓步',
  'sportWorkoutHomeWorkoutReverseLungeDetail': '3 组 × 每腿 10 次',
  'sportWorkoutHomeWorkoutSupermanHoldName': '超人式静态保持',
  'sportWorkoutHomeWorkoutSupermanHoldDetail': '3 组 × 20 秒',
  'sportWorkoutHomeWorkoutJumpingJackName': '开合跳',
  'sportWorkoutHomeWorkoutJumpingJackDetail': '3 组 × 45 秒',

  // 20. busy20min
  'sportMoodBusy20minTitle': '忙碌 20 分钟',
  'sportMoodBusy20minPurpose': '为忙碌的一天准备的高效短练',
  'sportMoodBusy20minFoodFocus': '选一份简单的高蛋白餐',
  'sportWorkoutBusy20minEmom20Name': 'EMOM 20 分钟',
  'sportWorkoutBusy20minEmom20Detail':
      '第 1 分钟：10 次深蹲 • 第 2 分钟：8 次俯卧撑 • 第 3 分钟：30 秒平板支撑 • '
          '第 4 分钟：10 次弓步 • 循环',

  // ==========================================================
  // D. 专项运动
  // ==========================================================

  // 21. footballMatchday
  'sportMoodFootballMatchdayTitle': '足球比赛日',
  'sportMoodFootballMatchdayPurpose': '为足球比赛日做准备',
  'sportMoodFootballMatchdayFoodFocus': '赛前 3 小时补碳水，避开油腻食物',
  'sportWorkoutFootballMatchdayDynamicStretchName': '动态拉伸',
  'sportWorkoutFootballMatchdayDynamicStretchDetail': '8 分钟',
  'sportWorkoutFootballMatchdayShortSprintName': '短距冲刺',
  'sportWorkoutFootballMatchdayShortSprintDetail': '6 组 × 20 米',
  'sportWorkoutFootballMatchdayPassingDrillName': '传球 / 颠球练习',
  'sportWorkoutFootballMatchdayPassingDrillDetail': '15 分钟',
  'sportWorkoutFootballMatchdayAgilityLadderName': '敏捷梯 / 标志碟',
  'sportWorkoutFootballMatchdayAgilityLadderDetail': '4 组',

  // 22. badmintonAgility
  'sportMoodBadmintonAgilityTitle': '羽毛球敏捷',
  'sportMoodBadmintonAgilityPurpose': '步法、速度与场上耐力',
  'sportMoodBadmintonAgilityFoodFocus': '少量碳水 + 恢复用蛋白',
  'sportWorkoutBadmintonAgilityFootworkDrillName': '步法练习',
  'sportWorkoutBadmintonAgilityFootworkDrillDetail': '4 组 × 45 秒',
  'sportWorkoutBadmintonAgilityShadowSwingName': '空挥拍',
  'sportWorkoutBadmintonAgilityShadowSwingDetail': '3 组 × 12 次',
  'sportWorkoutBadmintonAgilityLateralShuffleName': '侧向滑步',
  'sportWorkoutBadmintonAgilityLateralShuffleDetail': '4 组 × 30 秒',
  'sportWorkoutBadmintonAgilityCorePlankName': '核心平板支撑',
  'sportWorkoutBadmintonAgilityCorePlankDetail': '3 组 × 30 秒',

  // 23. basketballEnergy
  'sportMoodBasketballEnergyTitle': '篮球能量',
  'sportMoodBasketballEnergyPurpose': '弹跳、冲刺与比赛体能',
  'sportMoodBasketballEnergyFoodFocus': '热量要够，多补水',
  'sportWorkoutBasketballEnergySquatJumpName': '深蹲跳',
  'sportWorkoutBasketballEnergySquatJumpDetail': '4 组 × 10 次',
  'sportWorkoutBasketballEnergySuicideSprintName': '折返冲刺',
  'sportWorkoutBasketballEnergySuicideSprintDetail': '4 组',
  'sportWorkoutBasketballEnergyDefensiveSlideName': '防守滑步',
  'sportWorkoutBasketballEnergyDefensiveSlideDetail': '4 组 × 30 秒',
  'sportWorkoutBasketballEnergyLayupDrillName': '上篮 / 投篮练习',
  'sportWorkoutBasketballEnergyLayupDrillDetail': '15 分钟',

  // 24. tennisMode
  'sportMoodTennisModeTitle': '网球模式',
  'sportMoodTennisModePurpose': '核心转体与横向移动',
  'sportMoodTennisModeFoodFocus': '适量碳水 + 电解质',
  'sportWorkoutTennisModeShadowStrokeName': '空挥击球',
  'sportWorkoutTennisModeShadowStrokeDetail': '4 组 × 12 次',
  'sportWorkoutTennisModeSideShuffleName': '侧向滑步 + 分腿垫步',
  'sportWorkoutTennisModeSideShuffleDetail': '4 组 × 30 秒',
  'sportWorkoutTennisModeMedBallRotationName': '药球转体',
  'sportWorkoutTennisModeMedBallRotationDetail': '3 组 × 每侧 10 次',
  'sportWorkoutTennisModeWallRallyName': '对墙击球',
  'sportWorkoutTennisModeWallRallyDetail': '10 分钟',

  // 25. cyclistEndurance
  'sportMoodCyclistEnduranceTitle': '骑行耐力',
  'sportMoodCyclistEndurancePurpose': '骑行耐力与稳定的腿部力量',
  'sportMoodCyclistEnduranceFoodFocus': '长时间骑行要持续补碳水',
  'sportWorkoutCyclistEnduranceSteadyRideName': '匀速骑行',
  'sportWorkoutCyclistEnduranceSteadyRideDetail': '45-60 分钟舒适区',
  'sportWorkoutCyclistEnduranceCadenceDrillName': '踏频练习',
  'sportWorkoutCyclistEnduranceCadenceDrillDetail': '5 组 × 1 分钟高踏频',

  // 26. swimmerMode
  'sportMoodSwimmerModeTitle': '游泳模式',
  'sportMoodSwimmerModePurpose': '游泳技术与耐力',
  'sportMoodSwimmerModeFoodFocus': '下水前 1 小时吃点清淡的',
  'sportWorkoutSwimmerModeWarmupLapsName': '热身泳圈',
  'sportWorkoutSwimmerModeWarmupLapsDetail': '4 组 × 50m 轻松游',
  'sportWorkoutSwimmerModeMainSetName': '主课',
  'sportWorkoutSwimmerModeMainSetDetail': '6 组 × 100m，休息 20 秒',
  'sportWorkoutSwimmerModeKickDrillName': '打腿练习',
  'sportWorkoutSwimmerModeKickDrillDetail': '4 组 × 50m，使用浮板',

  // 27. hikingMode
  'sportMoodHikingModeTitle': '登山模式',
  'sportMoodHikingModePurpose': '登山准备——腿部与心肺',
  'sportMoodHikingModeFoodFocus': '能量零食 + 登山途中 2L 水',
  'sportWorkoutHikingModeStepUpName': '登阶',
  'sportWorkoutHikingModeStepUpDetail': '4 组 × 每腿 12 次',
  'sportWorkoutHikingModeInclineWalkName': '斜坡 / 阶梯行走',
  'sportWorkoutHikingModeInclineWalkDetail': '30 分钟',
  'sportWorkoutHikingModeFarmerCarryPackName': '农夫行走（背包）',
  'sportWorkoutHikingModeFarmerCarryPackDetail': '3 组 × 40 米',

  // 28. courtGame
  'sportMoodCourtGameTitle': '球场休闲模式',
  'sportMoodCourtGamePurpose': '和朋友轻松打球',
  'sportMoodCourtGameFoodFocus': '打球前一小时别吃太饱',
  'sportWorkoutCourtGameDynamicWarmupName': '动态热身',
  'sportWorkoutCourtGameDynamicWarmupDetail': '10 分钟',
  'sportWorkoutCourtGameGamePlayName': '实战对打',
  'sportWorkoutCourtGameGamePlayDetail': '45-60 分钟',
  'sportWorkoutCourtGameCoolWalkName': '放松走',
  'sportWorkoutCourtGameCoolWalkDetail': '结束后 5 分钟',

  // ==========================================================
  // E. 恢复
  // ==========================================================

  // 29. mobilityRecovery
  'sportMoodMobilityRecoveryTitle': '活动度与恢复',
  'sportMoodMobilityRecoveryPurpose': '放松关节，恢复肌肉',
  'sportMoodMobilityRecoveryFoodFocus': '蛋白 + 水果，早点睡',
  'sportWorkoutMobilityRecoveryCatCowName': '猫牛式',
  'sportWorkoutMobilityRecoveryCatCowDetail': '2 组 × 10 次',
  'sportWorkoutMobilityRecoveryHipOpenerName': '开髋（90/90）',
  'sportWorkoutMobilityRecoveryHipOpenerDetail': '2 组 × 每侧 45 秒',
  'sportWorkoutMobilityRecoveryHamstringStretchName': '腘绳肌拉伸',
  'sportWorkoutMobilityRecoveryHamstringStretchDetail': '2 组 × 45 秒',
  'sportWorkoutMobilityRecoveryThoracicRotationName': '胸椎旋转',
  'sportWorkoutMobilityRecoveryThoracicRotationDetail': '2 组 × 每侧 8 次',
  'sportWorkoutMobilityRecoveryDeepBreathingName': '深呼吸',
  'sportWorkoutMobilityRecoveryDeepBreathingDetail': '5 分钟',

  // 30. restDayNutrition
  'sportMoodRestDayNutritionTitle': '休息日营养',
  'sportMoodRestDayNutritionPurpose': '休息日——专注饮食与恢复',
  'sportMoodRestDayNutritionFoodFocus': '蛋白保持充足，碳水适量',
  'sportWorkoutRestDayNutritionEasyWalkName': '轻松散步',
  'sportWorkoutRestDayNutritionEasyWalkDetail': '饭后 15-20 分钟',
  'sportWorkoutRestDayNutritionLightStretchName': '轻度拉伸',
  'sportWorkoutRestDayNutritionLightStretchDetail': '睡前 10 分钟',
};
