# Fit / Sport Mood zh + ta localization review

**Review status for every row in this file: `Pending native review`.**

Generated for MAKANMANA ISSUE 001.2.

No native speaker has signed off on the Simplified Chinese or Tamil copy below.
This copy was authored during implementation and is *functionally* verified —
key parity across ms/en/zh/ta, placeholder parity, no English fallback for full
sentences, no replacement characters, no viewport overflow at 360/390/412dp — but
it is **not linguistically approved**. Native review is still required before this
copy should be considered final.

## Scope

| Group | Count |
| --- | --- |
| Sport Mood titles | 30 |
| Sport Mood purposes | 30 |
| Sport Mood food focus | 30 |
| Workout block name + detail (108 blocks x 2) | 216 |
| Shared warm-up / cool-down blocks (6 blocks x 2) | 12 |
| Category labels | 5 |
| Coach notes + generic fallback | 6 |
| Intensity labels | 3 |
| Workout status labels | 2 |
| **Sport strings subtotal** | **334** |
| Additional static UI literals | 5 |
| **Total new keys (per language)** | **339** |

Total localization keys after this task: **1258** per language (919 pre-existing + 339 new).

## Previously completed Fit keys (ISSUE 001.1)

The 55 keys below were translated in the earlier ISSUE 001.1 pass and remain
pending native review. They are the exact list locked by the existing regression
test in `test/typography_qa_test.dart`, which asserts zh/ta never equal English.

| Localization key | English source | Simplified Chinese | Tamil | Screen / context | Notes | Review status |
| --- | --- | --- | --- | --- | --- | --- |
| `fitSetupTitle` | Set up Fit Coach | 设置 Fit Coach | Fit Coach அமைப்பு | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitSetupBody` | Add your body basics, goal and training style so MakanMana can calculate safer targets. | 填写身体基本资料、目标和训练偏好，让 MakanMana 计算更稳妥的目标。 | உடல் அடிப்படைகள், இலக்கு மற்றும் பயிற்சி விருப்பத்தைச் சேர்க்கவும்; பாதுகாப்பான இலக்குகளை MakanMana கணக்கிடும். | Fit Coach (ISSUE 001.1) | Technical/brand term retained: MakanMana | Pending native review |
| `fitBodyBasics` | Body basics | 身体基本资料 | உடல் அடிப்படைகள் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitHeight` | Height | 身高 | உயரம் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitWeight` | Weight | 体重 | எடை | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitAge` | Age | 年龄 | வயது | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitGender` | Gender | 性别 | பாலினம் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitMale` | Male | 男性 | ஆண் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitFemale` | Female | 女性 | பெண் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitGoalTitle` | Fit goal | Fit 目标 | Fit இலக்கு | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitGoalHealthy` | Healthy lifestyle | 健康生活 | ஆரோக்கியமான வாழ்க்கைமுறை | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitGoalFatLoss` | Fat loss | 减脂 | கொழுப்பு குறைப்பு | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitGoalLean` | Lean body | 塑形 | சீரான உடல் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitGoalRecomp` | Body recomp | 体态重组 | உடல் மறுசீரமைப்பு | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitGoalMuscle` | Muscle gain | 增肌 | தசை வளர்ப்பு | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitGoalSport` | Sport performance | 运动表现 | விளையாட்டு திறன் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitLevel` | Level | 水平 | நிலை | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitLevelBeginner` | Beginner | 初学者 | தொடக்கநிலை | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitLevelIntermediate` | Intermediate | 中级 | இடைநிலை | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitLevelAdvanced` | Advanced | 高级 | மேம்பட்ட | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitLevelAthlete` | Athlete | 运动员 | விளையாட்டு வீரர் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitTrainingPref` | Training | 训练偏好 | பயிற்சி விருப்பம் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitDaysPerWeek` | Training days per week | 每周训练天数 | வாரத்திற்கான பயிற்சி நாட்கள் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitSessionDuration` | Session duration | 单次训练时长 | பயிற்சி நேரம் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitTargets` | Daily targets | 每日目标 | தினசரி இலக்குகள் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitBudgetMin` | Min budget | 最低预算 | குறைந்தபட்ச பட்ஜெட் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitBudgetMax` | Max budget | 最高预算 | அதிகபட்ச பட்ஜெட் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitStepTarget` | Step target | 步数目标 | அடிகள் இலக்கு | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitSaveProfile` | Save Fit profile | 保存 Fit 资料 | Fit சுயவிவரத்தைச் சேமி | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitStartSetup` | Start setup | 开始设置 | அமைப்பைத் தொடங்கு | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitEditProfile` | Edit Fit profile | 编辑 Fit 资料 | Fit சுயவிவரத்தைத் திருத்து | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitTodayTitle` | Fit Today | 今日 Fit | இன்றைய Fit | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitNutritionTargets` | Nutrition targets | 营养目标 | ஊட்டச்சத்து இலக்குகள் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitWater` | Water | 饮水 | நீர் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitLogWater` | Log water | 记录饮水 | நீரைப் பதிவு செய் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitLogSteps` | Log steps | 记录步数 | அடிகளைப் பதிவு செய் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitLogWeight` | Log weight | 记录体重 | எடையைப் பதிவு செய் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitWorkoutToday` | Today workout | 今日锻炼 | இன்றைய உடற்பயிற்சி | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitChangeMood` | Change mood | 更换运动模式 | பயிற்சி முறையை மாற்று | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitFinishWorkout` | Finish workout | 完成锻炼 | உடற்பயிற்சியை முடி | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitMenuSuggestions` | Menu picks for today | 今日菜单推荐 | இன்றைய மெனு பரிந்துரைகள் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitMonitorTitle` | Fit Monitor | Fit 监测 | Fit கண்காணிப்பு | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitWeeklyScore` | Weekly Fit Score | 本周 Fit 评分 | இந்த வார Fit மதிப்பெண் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitStepsTrend` | Steps trend | 步数趋势 | அடிகளின் போக்கு | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitCaloriesTrend` | Calories trend | 卡路里趋势 | கலோரி போக்கு | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitBodyTrend` | Body trend | 身体趋势 | உடல் போக்கு | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitBodyTrendEmpty` | Not enough body entries for a chart yet. | 身体记录不足，暂时无法显示图表。 | வரைபடத்திற்கு போதுமான உடல் பதிவுகள் இல்லை. | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitWeeklyReport` | Weekly report | 每周报告 | வாராந்திர அறிக்கை | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitRecentWorkouts` | Recent workouts | 最近锻炼 | சமீபத்திய உடற்பயிற்சிகள் | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitNoWorkoutYet` | No workouts recorded yet. | 尚未记录锻炼。 | இதுவரை உடற்பயிற்சிகள் பதிவு செய்யப்படவில்லை. | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitSampleReport` | This week looks consistent. Keep protein steady and add a few more steps. | 本周表现稳定。保持蛋白质摄入，并多走几步。 | இந்த வாரம் சீராக உள்ளது. புரதத்தை நிலையாக வைத்துக் கொண்டு இன்னும் சில அடிகள் நடக்கவும். | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitSampleRecProtein` | Add protein at breakfast to support recovery. | 早餐补充蛋白质，有助于恢复。 | மீட்சிக்காக காலை உணவில் புரதத்தைச் சேர்க்கவும். | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitSampleRecSteps` | Walk 10 minutes after lunch. | 午餐后步行 10 分钟。 | மதிய உணவுக்குப் பின் 10 நிமிடங்கள் நடக்கவும். | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitSportMoodTitle` | Sport Mood | 运动模式 | விளையாட்டு முறை | Fit Coach (ISSUE 001.1) | - | Pending native review |
| `fitSportMoodIntro` | Pick today training style. MakanMana will tune your workout and food focus. | 选择今天的训练模式，MakanMana 会调整锻炼和饮食重点。 | இன்றைய பயிற்சி முறையைத் தேர்ந்தெடுக்கவும். MakanMana உங்கள் உடற்பயிற்சி மற்றும் உணவு கவனத்தைச் சரிசெய்யும். | Fit Coach (ISSUE 001.1) | Technical/brand term retained: MakanMana | Pending native review |

## Additional static UI literals (new in ISSUE 001.2)

| Localization key | English source | Simplified Chinese | Tamil | Screen / context | Notes | Review status |
| --- | --- | --- | --- | --- | --- | --- |
| `advancedPrefsTitle` | Advanced preferences | 高级偏好 | மேம்பட்ட விருப்பங்கள் | Profile > advanced preferences heading | - | Pending native review |
| `copiedToClipboard` | Copied! Paste to share. | 已复制！粘贴即可分享。 | நகலெடுக்கப்பட்டது! பகிர ஒட்டவும். | Restaurant detail > share fallback snackbar | - | Pending native review |
| `logSpendToWallet` | Log spend to Meal Wallet | 记录消费到 Meal Wallet | Meal Wallet-இல் செலவைப் பதிவு செய் | Restaurant detail > Meal Wallet action | Technical/brand term retained: Meal Wallet | Pending native review |
| `budgetCoachTitle` | Budget Coach | 预算教练 | பட்ஜெட் பயிற்சியாளர் | Wallet > Budget Coach screen title | - | Pending native review |
| `privacyHeading` | MakanMana Privacy | MakanMana 隐私 | MakanMana தனியுரிமை | Privacy screen heading | Technical/brand term retained: MakanMana | Pending native review |

## Sport Mood + workout block keys (new in ISSUE 001.2)

| Localization key | English source | Simplified Chinese | Tamil | Screen / context | Notes | Review status |
| --- | --- | --- | --- | --- | --- | --- |
| `fitCoachNoteDefault` | Move today, even briefly. Your body will thank you tomorrow. | 今天动一动，哪怕只是一会儿。身体明天会感谢你。 | இன்று சிறிது நேரமாவது உடலை அசையுங்கள். நாளை உங்கள் உடல் நன்றி சொல்லும். | Fit Today > generated plan coach note | - | Pending native review |
| `fitCoachNoteFatLoss` | Consistency beats perfection. Finish this session, then pick a protein-rich dinner. | 坚持比完美更重要。完成这次训练，晚餐再选高蛋白的。 | சரியாகச் செய்வதைவிட தொடர்ந்து செய்வது முக்கியம். இந்தப் பயிற்சியை முடித்துவிட்டு, புரதம் நிறைந்த இரவு உணவைத் தேர்வு செய்யுங்கள். | Fit Today > generated plan coach note | - | Pending native review |
| `fitCoachNoteInjury` | Injury on record - intensity has been lowered. Stop immediately if it hurts, and see a qualified professional if it persists. | 记录显示您有伤患，强度已下调。如有疼痛请立即停止；若持续不适，请咨询专业人士。 | காயப் பதிவு உள்ளது — தீவிரம் குறைக்கப்பட்டுள்ளது. வலி ஏற்பட்டால் உடனே நிறுத்துங்கள்; நீடித்தால் தகுதியான நிபுணரை அணுகுங்கள். | Fit Today > generated plan coach note | - | Pending native review |
| `fitCoachNoteMuscleGain` | Focus on technique and add load gradually. Eat enough today. | 专注动作质量，重量一点一点加。今天要吃够。 | நுட்பத்தில் கவனம் வையுங்கள்; எடையை சிறிது சிறிதாக அதிகரியுங்கள். இன்று போதுமான அளவு சாப்பிடுங்கள். | Fit Today > generated plan coach note | - | Pending native review |
| `fitCoachNoteRestDay` | Rest days matter too. Keep protein up and sleep well - your body rebuilds while you rest. | 休息日同样重要。蛋白质保持充足、睡眠充足——身体是在休息时重建的。 | ஓய்வு நாளும் முக்கியம். புரதத்தைத் தொடருங்கள், நன்றாகத் தூங்குங்கள் — ஓய்வின்போதே உடல் கட்டமைக்கிறது. | Fit Today > generated plan coach note | - | Pending native review |
| `fitIntensityHigh` | high | 高强度 | அதிகம் | Sport Mood picker / Fit Today > intensity label | - | Pending native review |
| `fitIntensityLow` | low | 低强度 | குறைவு | Sport Mood picker / Fit Today > intensity label | - | Pending native review |
| `fitIntensityMedium` | medium | 中强度 | நடுத்தரம் | Sport Mood picker / Fit Today > intensity label | - | Pending native review |
| `fitStatusCompleted` | Completed | 已完成 | முடிந்தது | Fit Monitor > recent workouts status | - | Pending native review |
| `fitStatusSkipped` | Skipped | 已跳过 | தவிர்க்கப்பட்டது | Fit Monitor > recent workouts status | - | Pending native review |
| `fitWorkoutFallback` | Workout session | 训练课 | பயிற்சி அமர்வு | Legacy resolver > generic fallback | - | Pending native review |
| `sportCooldownBreathingDetail` | 2 min | 2 分钟 | 2 நிமிடம் | Fit Today > generated plan cool-down block | - | Pending native review |
| `sportCooldownBreathingName` | Slow breathing | 缓慢呼吸 | மெதுவான மூச்சு | Fit Today > generated plan cool-down block | - | Pending native review |
| `sportCooldownHamstringDetail` | 2 x 30 sec | 2 组 × 30 秒 | 2 செட் × 30 வினாடி | Fit Today > generated plan cool-down block | - | Pending native review |
| `sportCooldownHamstringName` | Hamstring stretch | 腘绳肌拉伸 | தொடைத் தசை நீட்சி | Fit Today > generated plan cool-down block | - | Pending native review |
| `sportCooldownQuadCalfDetail` | 2 x 30 sec | 2 组 × 30 秒 | 2 செட் × 30 வினாடி | Fit Today > generated plan cool-down block | - | Pending native review |
| `sportCooldownQuadCalfName` | Quad + calf stretch | 股四头肌 + 小腿拉伸 | முன்தொடை + கெண்டைக்கால் நீட்சி | Fit Today > generated plan cool-down block | - | Pending native review |
| `sportMoodBadmintonAgilityFoodFocus` | Light carbs + recovery protein | 少量碳水 + 恢复用蛋白 | இலகு கார்போஹைட்ரேட் + மீட்புக்கான புரதம் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodBadmintonAgilityPurpose` | Footwork, speed and court stamina | 步法、速度与场上耐力 | கால் அசைவு, வேகம் மற்றும் கோர்ட் சகிப்புத்திறன் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodBadmintonAgilityTitle` | Badminton Agility | 羽毛球敏捷 | பூப்பந்து சுறுசுறுப்பு | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodBasketballEnergyFoodFocus` | Enough calories, high hydration | 热量要够，多补水 | போதுமான கலோரி, அதிக நீர்ச்சத்து | Fit Today > generated food focus | - | Pending native review |
| `sportMoodBasketballEnergyPurpose` | Jumping, sprinting and game engine | 弹跳、冲刺与比赛体能 | தாண்டல், ஸ்பிரிண்ட் மற்றும் ஆட்ட ஆற்றல் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodBasketballEnergyTitle` | Basketball Energy | 篮球能量 | கூடைப்பந்து ஆற்றல் | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodBodyRecompFoodFocus` | Calories near maintenance, high protein | 热量接近维持水平，蛋白质要高 | கலோரி பராமரிப்பு அளவில், புரதம் அதிகம் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodBodyRecompPurpose` | Lose fat + gain muscle at the same time | 同时减脂与增肌 | கொழுப்பு குறைப்பு + தசை வளர்ப்பு ஒரே நேரத்தில் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodBodyRecompTitle` | Body Recomp | 体态重塑 | உடல் மறுசீரமைப்பு | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodBoxingConditioningFoodFocus` | Recovery protein + enough water | 恢复用蛋白 + 补足水分 | மீட்புக்கான புரதம் + போதுமான தண்ணீர் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodBoxingConditioningPurpose` | Hand speed and shoulder endurance | 提升出拳速度与肩部耐力 | கை வேகம் மற்றும் தோள் சகிப்புத்திறன் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodBoxingConditioningTitle` | Boxing Conditioning | 拳击体能 | பாக்ஸிங் உடற்தகுதி | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodBusy20minFoodFocus` | Pick a simple protein-rich meal | 选一份简单的高蛋白餐 | எளிய, புரதம் நிறைந்த உணவைத் தேர்வு செய்யுங்கள் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodBusy20minPurpose` | Short & sharp for busy days | 为忙碌的一天准备的高效短练 | பரபரப்பான நாட்களுக்கு குறுகிய, தீவிரப் பயிற்சி | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodBusy20minTitle` | Busy 20-Min Fit | 忙碌 20 分钟 | பரபரப்பான 20 நிமிடம் | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodCategoryCombat` | Combat & Fighter | 格斗与搏击 | சண்டை & ஃபைட்டர் | Sport Mood picker > category header | - | Pending native review |
| `sportMoodCategoryGym` | Gym & Body Goal | 健身与体态目标 | ஜிம் & உடல் இலக்கு | Sport Mood picker > category header | - | Pending native review |
| `sportMoodCategoryRecovery` | Recovery | 恢复 | மீட்பு | Sport Mood picker > category header | - | Pending native review |
| `sportMoodCategoryRunning` | Running & Endurance | 跑步与耐力 | ஓட்டம் & சகிப்புத்திறன் | Sport Mood picker > category header | - | Pending native review |
| `sportMoodCategorySport` | Sport Specific | 专项运动 | குறிப்பிட்ட விளையாட்டு | Sport Mood picker > category header | - | Pending native review |
| `sportMoodCoreAbsFoodFocus` | Cut back on sugary drinks today | 今天少喝含糖饮料 | இன்று இனிப்பு பானங்களைக் குறைக்கவும் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodCoreAbsPurpose` | Strong core, better posture | 核心稳固，体态更好 | வலுவான கோர், நல்ல தோற்றநிலை | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodCoreAbsTitle` | Core & Abs | 核心与腹肌 | கோர் & வயிற்றுத் தசை | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodCourtGameFoodFocus` | Avoid heavy meals an hour before playing | 打球前一小时别吃太饱 | ஆடுவதற்கு ஒரு மணி நேரம் முன் கனமான உணவைத் தவிர்க்கவும் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodCourtGamePurpose` | Casual court games with friends | 和朋友轻松打球 | நண்பர்களுடன் நிதானமான கோர்ட் ஆட்டம் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodCourtGameTitle` | Court Game Mode | 球场休闲模式 | கோர்ட் ஆட்ட முறை | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodCyclistEnduranceFoodFocus` | Steady carbs for long sessions | 长时间骑行要持续补碳水 | நீண்ட அமர்வுகளுக்குத் தொடர்ச்சியான கார்போஹைட்ரேட் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodCyclistEndurancePurpose` | Riding endurance and stable legs | 骑行耐力与稳定的腿部力量 | மிதிவண்டி சகிப்புத்திறன் மற்றும் நிலையான கால்கள் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodCyclistEnduranceTitle` | Cyclist Endurance | 骑行耐力 | சைக்கிள் சகிப்புத்திறன் | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodEasyRunFoodFocus` | Light food, stay hydrated | 吃得清淡，补足水分 | இலகுவான உணவு, போதுமான நீர் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodEasyRunPurpose` | Relaxed run to build an aerobic base | 轻松慢跑，打好有氧基础 | நிதானமான ஓட்டம் — ஏரோபிக் அடித்தளம் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodEasyRunTitle` | Easy Run | 轻松跑 | இலகு ஓட்டம் | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodFatLossFoodFocus` | Safe deficit + high protein | 安全热量缺口 + 高蛋白 | பாதுகாப்பான பற்றாக்குறை + அதிக புரதம் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodFatLossPurpose` | Burn fat, keep muscle | 燃烧脂肪，保住肌肉 | கொழுப்பை எரிக்கவும், தசையைத் தக்கவைக்கவும் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodFatLossTitle` | Fat Loss | 减脂 | கொழுப்புக் குறைப்பு | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodFighterCampFoodFocus` | Moderate carbs + high protein | 适量碳水 + 高蛋白 | மிதமான கார்போஹைட்ரேட் + அதிக புரதம் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodFighterCampPurpose` | A fighter's stamina, power and mindset | 打造格斗者的体能、爆发力与意志 | ஒரு ஃபைட்டரின் சகிப்புத்திறன், வலிமை மற்றும் மன உறுதி | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodFighterCampTitle` | Fighter Camp | 格斗训练营 | ஃபைட்டர் கேம்ப் | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodFootballMatchdayFoodFocus` | Carbs 3 hours before, avoid oily food | 赛前 3 小时补碳水，避开油腻食物 | போட்டிக்கு 3 மணி நேரம் முன் கார்போஹைட்ரேட், எண்ணெய் உணவைத் தவிர்க்கவும் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodFootballMatchdayPurpose` | Prep for football match day | 为足球比赛日做准备 | கால்பந்து போட்டி நாளுக்குத் தயாரிப்பு | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodFootballMatchdayTitle` | Football Matchday | 足球比赛日 | கால்பந்து போட்டி நாள் | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodHikingModeFoodFocus` | Energy snacks + 2L water on the hike | 能量零食 + 登山途中 2L 水 | ஆற்றல் தின்பண்டம் + மலையேற்றத்தின்போது 2L நீர் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodHikingModePurpose` | Hiking prep - legs & cardio | 登山准备——腿部与心肺 | மலையேற்றத் தயாரிப்பு — கால்கள் & கார்டியோ | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodHikingModeTitle` | Hiking Mode | 登山模式 | மலையேற்ற முறை | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodHomeWorkoutFoodFocus` | Eat balanced, cook at home if you can | 饮食均衡，尽量自己下厨 | சமநிலையாகச் சாப்பிடுங்கள்; முடிந்தால் வீட்டிலேயே சமையுங்கள் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodHomeWorkoutPurpose` | Full body at home with no equipment | 在家徒手练全身 | கருவிகள் இல்லாமல் வீட்டில் முழு உடல் பயிற்சி | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodHomeWorkoutTitle` | Home Workout | 居家训练 | வீட்டுப் பயிற்சி | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodLowerBodyFoodFocus` | Carbs + protein after the session | 训练后补碳水 + 蛋白 | பயிற்சிக்குப் பின் கார்போஹைட்ரேட் + புரதம் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodLowerBodyPurpose` | Strong legs and glutes | 练出有力的腿与臀 | வலுவான கால்கள் மற்றும் இடுப்பு | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodLowerBodyTitle` | Lower Body | 下肢训练 | கீழ் உடல் | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodMarathonBaseFoodFocus` | High carbs on long training days | 长训日碳水要高 | நீண்ட பயிற்சி நாட்களில் அதிக கார்போஹைட்ரேட் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodMarathonBasePurpose` | Build long-distance base safely | 安全地打好长距离基础 | நீண்ட தூர அடித்தளத்தைப் பாதுகாப்பாகக் கட்டமைக்கவும் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodMarathonBaseTitle` | Marathon Base | 马拉松基础 | மாரத்தான் அடித்தளம் | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodMmaHybridFoodFocus` | Enough calories, avoid a big deficit | 热量要够，别大幅节食 | கலோரி போதுமானதாக இருக்கட்டும்; பெரிய பற்றாக்குறை வேண்டாம் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodMmaHybridPurpose` | Striking, grappling and cardio engine combined | 站立打击、地面缠斗与心肺引擎的结合 | ஸ்ட்ரைக்கிங், கிராப்ளிங் மற்றும் கார்டியோ இணைந்தது | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodMmaHybridTitle` | MMA Hybrid | MMA 综合 | MMA கலப்பு | Sport Mood picker / Fit onboarding / Fit Today title | Technical/brand term retained: MMA | Pending native review |
| `sportMoodMobilityRecoveryFoodFocus` | Protein + fruit, sleep early | 蛋白 + 水果，早点睡 | புரதம் + பழம், சீக்கிரம் தூங்குங்கள் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodMobilityRecoveryPurpose` | Loosen joints, recover muscles | 放松关节，恢复肌肉 | மூட்டுகளைத் தளர்த்துங்கள், தசைகளை மீட்டெடுங்கள் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodMobilityRecoveryTitle` | Mobility & Recovery | 活动度与恢复 | அசைவுத்திறன் & மீட்பு | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodMuayThaiFoodFocus` | Carbs before the session, protein after | 训练前补碳水，训练后补蛋白 | பயிற்சிக்கு முன் கார்போஹைட்ரேட், பின் புரதம் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodMuayThaiPurpose` | Knee, kick and clinch strength | 强化膝击、扫踢与内围缠斗 | முழங்கால், உதை மற்றும் கிளின்ச் வலிமை | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodMuayThaiTitle` | Muay Thai Mode | 泰拳模式 | முவே தாய் முறை | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodMuscleGainFoodFocus` | Small surplus + 2g/kg protein | 小幅热量盈余 + 每公斤 2g 蛋白 | சிறிய உபரி + கிலோவுக்கு 2g புரதம் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodMuscleGainPurpose` | Hypertrophy - build muscle progressively | 肌肥大——循序渐进地增肌 | ஹைபர்டிராஃபி — படிப்படியாகத் தசை வளர்ப்பு | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodMuscleGainTitle` | Muscle Gain | 增肌 | தசை வளர்ப்பு | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodPrep10kmFoodFocus` | Enough carbs + electrolytes | 碳水充足 + 电解质 | போதுமான கார்போஹைட்ரேட் + எலக்ட்ரோலைட் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodPrep10kmPurpose` | Endurance for 10KM | 为 10KM 打造耐力 | 10KM-க்கான சகிப்புத்திறன் | Sport Mood picker / Fit onboarding subtitle | Technical/brand term retained: 10KM | Pending native review |
| `sportMoodPrep10kmTitle` | 10KM Prep | 10KM 备战 | 10KM தயாரிப்பு | Sport Mood picker / Fit onboarding / Fit Today title | Technical/brand term retained: 10KM | Pending native review |
| `sportMoodPrep5kmFoodFocus` | Moderate carbs, avoid oily food | 适量碳水，避开油腻食物 | மிதமான கார்போஹைட்ரேட், எண்ணெய் உணவைத் தவிர்க்கவும் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodPrep5kmPurpose` | Prep for a first 5KM race / PB | 备战首个 5KM 比赛或刷新个人纪录 | முதல் 5KM பந்தயம் / சிறந்த நேரத்திற்குத் தயாரிப்பு | Sport Mood picker / Fit onboarding subtitle | Technical/brand term retained: 5KM | Pending native review |
| `sportMoodPrep5kmTitle` | 5KM Prep | 5KM 备战 | 5KM தயாரிப்பு | Sport Mood picker / Fit onboarding / Fit Today title | Technical/brand term retained: 5KM | Pending native review |
| `sportMoodRestDayNutritionFoodFocus` | Keep protein high, moderate carbs | 蛋白保持充足，碳水适量 | புரதம் அதிகமாகத் தொடரட்டும், கார்போஹைட்ரேட் மிதமாக | Fit Today > generated food focus | - | Pending native review |
| `sportMoodRestDayNutritionPurpose` | Rest day - focus on food & recovery | 休息日——专注饮食与恢复 | ஓய்வு நாள் — உணவு & மீட்பில் கவனம் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodRestDayNutritionTitle` | Rest Day Nutrition | 休息日营养 | ஓய்வு நாள் ஊட்டச்சத்து | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodSelfDefenceFoodFocus` | Eat balanced, avoid heavy meals before the session | 饮食均衡，训练前别吃太饱 | சமநிலையாகச் சாப்பிடுங்கள்; பயிற்சிக்கு முன் கனமான உணவைத் தவிர்க்கவும் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodSelfDefencePurpose` | Base fitness + self-defence reflexes | 基础体能 + 防身反应 | அடிப்படை உடற்தகுதி + தற்காப்பு விழிப்பு | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodSelfDefenceTitle` | Self Defence Fit | 防身体能 | தற்காப்பு உடற்தகுதி | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodSpeedRunFoodFocus` | Carbs 1-2 hours before the session | 训练前 1-2 小时补碳水 | பயிற்சிக்கு 1-2 மணி நேரம் முன் கார்போஹைட்ரேட் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodSpeedRunPurpose` | Sprint intervals for speed | 冲刺间歇，提升速度 | வேகத்திற்கான ஸ்பிரிண்ட் இடைவெளிகள் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodSpeedRunTitle` | Speed Run | 速度跑 | வேக ஓட்டம் | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodStrengthDayFoodFocus` | Carbs before, protein after | 练前补碳水，练后补蛋白 | முன் கார்போஹைட்ரேட், பின் புரதம் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodStrengthDayPurpose` | Max strength - heavy load, low reps | 最大力量——大重量、低次数 | அதிகபட்ச வலிமை — கன எடை, குறைந்த ரெப் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodStrengthDayTitle` | Strength Day | 力量日 | வலிமை நாள் | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodSwimmerModeFoodFocus` | Light meal 1 hour before swimming | 下水前 1 小时吃点清淡的 | நீச்சலுக்கு 1 மணி நேரம் முன் இலகுவான உணவு | Fit Today > generated food focus | - | Pending native review |
| `sportMoodSwimmerModePurpose` | Swimming technique and stamina | 游泳技术与耐力 | நீச்சல் நுட்பம் மற்றும் சகிப்புத்திறன் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodSwimmerModeTitle` | Swimmer Mode | 游泳模式 | நீச்சல் முறை | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodTennisModeFoodFocus` | Moderate carbs + electrolytes | 适量碳水 + 电解质 | மிதமான கார்போஹைட்ரேட் + எலக்ட்ரோலைட் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodTennisModePurpose` | Core rotation and lateral movement | 核心转体与横向移动 | கோர் சுழற்சி மற்றும் பக்கவாட்டு நகர்வு | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodTennisModeTitle` | Tennis Mode | 网球模式 | டென்னிஸ் முறை | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodTrailRunFoodFocus` | Easy-to-carry snacks + extra water | 好携带的零食 + 多带水 | எளிதில் எடுத்துச் செல்லும் தின்பண்டம் + கூடுதல் நீர் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodTrailRunPurpose` | Trail running - strong legs, good balance | 越野跑——腿部有力，平衡更好 | பாதை ஓட்டம் — வலுவான கால், நல்ல சமநிலை | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodTrailRunTitle` | Trail Run | 越野跑 | பாதை ஓட்டம் | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportMoodUpperBodyFoodFocus` | Recovery protein | 恢复用蛋白 | மீட்புக்கான புரதம் | Fit Today > generated food focus | - | Pending native review |
| `sportMoodUpperBodyPurpose` | Focus on chest, back, shoulders and arms | 专注胸、背、肩与手臂 | மார்பு, முதுகு, தோள் மற்றும் கைகளில் கவனம் | Sport Mood picker / Fit onboarding subtitle | - | Pending native review |
| `sportMoodUpperBodyTitle` | Upper Body | 上肢训练 | மேல் உடல் | Sport Mood picker / Fit onboarding / Fit Today title | - | Pending native review |
| `sportWarmupBriskWalkDetail` | 5 min | 5 分钟 | 5 நிமிடம் | Fit Today > generated plan warm-up block | - | Pending native review |
| `sportWarmupBriskWalkName` | Brisk walk / light jog | 快走 / 慢跑 | விறுநடை / மெதுவான ஜாகிங் | Fit Today > generated plan warm-up block | - | Pending native review |
| `sportWarmupDynamicStretchDetail` | Leg swings, arm circles - 2 min | 摆腿、绕臂 — 2 分钟 | கால் ஆட்டம், கை சுழற்சி — 2 நிமிடம் | Fit Today > generated plan warm-up block | - | Pending native review |
| `sportWarmupDynamicStretchName` | Dynamic stretch | 动态拉伸 | இயங்கு நீட்சி | Fit Today > generated plan warm-up block | - | Pending native review |
| `sportWarmupJointMobilityDetail` | Ankles, hips, shoulders - 3 min | 脚踝、髋部、肩部 — 3 分钟 | கணுக்கால், இடுப்பு, தோள் — 3 நிமிடம் | Fit Today > generated plan warm-up block | - | Pending native review |
| `sportWarmupJointMobilityName` | Joint mobility | 关节活动度 | மூட்டு அசைவுத்திறன் | Fit Today > generated plan warm-up block | - | Pending native review |
| `sportWorkoutBadmintonAgilityCorePlankDetail` | 3 x 30 sec | 3 组 × 30 秒 | 3 செட் × 30 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBadmintonAgilityCorePlankName` | Core plank | 核心平板支撑 | கோர் பிளாங்க் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBadmintonAgilityFootworkDrillDetail` | 4 x 45 sec | 4 组 × 45 秒 | 4 செட் × 45 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBadmintonAgilityFootworkDrillName` | Footwork drill | 步法练习 | கால் அசைவு பயிற்சி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBadmintonAgilityLateralShuffleDetail` | 4 x 30 sec | 4 组 × 30 秒 | 4 செட் × 30 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBadmintonAgilityLateralShuffleName` | Lateral shuffle | 侧向滑步 | பக்கவாட்டு நகர்வு | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBadmintonAgilityShadowSwingDetail` | 3 x 12 | 3 组 × 12 次 | 3 செட் × 12 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutBadmintonAgilityShadowSwingName` | Shadow swing | 空挥拍 | ஷேடோ ஸ்விங் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBasketballEnergyDefensiveSlideDetail` | 4 x 30 sec | 4 组 × 30 秒 | 4 செட் × 30 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBasketballEnergyDefensiveSlideName` | Defensive slide | 防守滑步 | தற்காப்பு நகர்வு | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBasketballEnergyLayupDrillDetail` | 15 min | 15 分钟 | 15 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBasketballEnergyLayupDrillName` | Layup / shooting drill | 上篮 / 投篮练习 | லேஅப் / ஷூட்டிங் பயிற்சி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBasketballEnergySquatJumpDetail` | 4 x 10 | 4 组 × 10 次 | 4 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutBasketballEnergySquatJumpName` | Squat jump | 深蹲跳 | ஸ்குவாட் ஜம்ப் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBasketballEnergySuicideSprintDetail` | 4 sets | 4 组 | 4 செட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBasketballEnergySuicideSprintName` | Suicide sprint | 折返冲刺 | திரும்பு ஸ்பிரிண்ட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBodyRecompFarmerCarryDetail` | 3 x 30 metres | 3 组 × 30 米 | 3 செட் × 30 மீட்டர் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBodyRecompFarmerCarryName` | Farmer carry | 农夫行走 | ஃபார்மர் கேரி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBodyRecompGobletSquatDetail` | 4 x 10 | 4 组 × 10 次 | 4 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutBodyRecompGobletSquatName` | Goblet squat | 高脚杯深蹲 | கோப்லெட் ஸ்குவாட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBodyRecompOneArmRowDetail` | 3 x 12 each side | 3 组 × 每侧 12 次 | 3 செட் × ஒவ்வொரு பக்கமும் 12 | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBodyRecompOneArmRowName` | One-arm row | 单臂划船 | ஒற்றைக் கை ரோ | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBodyRecompPushUpBenchDetail` | 4 x 10 | 4 组 × 10 次 | 4 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutBodyRecompPushUpBenchName` | Push-up / bench | 俯卧撑 / 卧推 | புஷ்-அப் / பென்ச் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBodyRecompRomanianDeadliftDetail` | 3 x 10 | 3 组 × 10 次 | 3 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutBodyRecompRomanianDeadliftName` | Romanian deadlift | 罗马尼亚硬拉 | ருமேனியன் டெட்லிஃப்ட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBoxingConditioningJabCrossDetail` | 5 x 2 min | 5 组 × 2 分钟 | 5 செட் × 2 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBoxingConditioningJabCrossName` | Jab-cross drill | 刺拳 - 直拳组合 | ஜாப்-கிராஸ் பயிற்சி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBoxingConditioningJumpRopeSprintDetail` | 4 x 45 sec | 4 组 × 45 秒 | 4 செட் × 45 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBoxingConditioningJumpRopeSprintName` | Jump rope sprint | 跳绳冲刺 | கயிறு தாண்டல் ஸ்பிரிண்ட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBoxingConditioningPlankShoulderTapDetail` | 3 x 20 | 3 组 × 20 次 | 3 செட் × 20 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutBoxingConditioningPlankShoulderTapName` | Plank shoulder tap | 平板支撑拍肩 | பிளாங்க் தோள் தட்டல் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBoxingConditioningSpeedPunchesDetail` | 4 x 30 sec all-out | 4 组 × 30 秒全力 | 4 செட் × 30 வினாடி முழு வேகம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBoxingConditioningSpeedPunchesName` | Speed punches | 快速出拳 | வேக குத்துகள் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBusy20minEmom20Detail` | Minute 1: 10 squats • Minute 2: 8 push-ups • Minute 3: 30s plank • Minute 4: 10 lunges • repeat | 第 1 分钟：10 次深蹲 • 第 2 分钟：8 次俯卧撑 • 第 3 分钟：30 秒平板支撑 • 第 4 分钟：10 次弓步 • 循环 | நிமிடம் 1: 10 ஸ்குவாட் • நிமிடம் 2: 8 புஷ்-அப் • நிமிடம் 3: 30வி பிளாங்க் • நிமிடம் 4: 10 லன்ஜ் • மீண்டும் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutBusy20minEmom20Name` | EMOM 20 min | EMOM 20 分钟 | EMOM 20 நிமிடம் | Fit Today > generated workout plan block | Technical/brand term retained: EMOM | Pending native review |
| `sportWorkoutCoreAbsDeadBugDetail` | 3 x 10 each side | 3 组 × 每侧 10 次 | 3 செட் × ஒவ்வொரு பக்கமும் 10 | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCoreAbsDeadBugName` | Dead bug | 死虫式 | டெட் பக் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCoreAbsLegRaiseDetail` | 3 x 12 | 3 组 × 12 次 | 3 செட் × 12 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutCoreAbsLegRaiseName` | Leg raise | 举腿 | கால் உயர்த்தல் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCoreAbsPlankDetail` | 3 x 45 sec | 3 组 × 45 秒 | 3 செட் × 45 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCoreAbsPlankName` | Plank | 平板支撑 | பிளாங்க் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCoreAbsRussianTwistDetail` | 3 x 20 | 3 组 × 20 次 | 3 செட் × 20 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutCoreAbsRussianTwistName` | Russian twist | 俄罗斯转体 | ரஷ்யன் ட்விஸ்ட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCoreAbsSidePlankDetail` | 2 x 30 sec each side | 2 组 × 每侧 30 秒 | 2 செட் × ஒவ்வொரு பக்கமும் 30 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCoreAbsSidePlankName` | Side plank | 侧平板支撑 | பக்கவாட்டு பிளாங்க் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCourtGameCoolWalkDetail` | 5 min after finishing | 结束后 5 分钟 | முடிந்தபின் 5 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCourtGameCoolWalkName` | Cool walk | 放松走 | ஆறுதல் நடை | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCourtGameDynamicWarmupDetail` | 10 min | 10 分钟 | 10 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCourtGameDynamicWarmupName` | Dynamic warm-up | 动态热身 | இயங்கு வார்ம்-அப் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCourtGameGamePlayDetail` | 45-60 min | 45-60 分钟 | 45-60 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCourtGameGamePlayName` | Game play | 实战对打 | ஆட்டம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCyclistEnduranceCadenceDrillDetail` | 5 x 1 min high cadence | 5 组 × 1 分钟高踏频 | 5 செட் × 1 நிமிடம் அதிக மிதி வேகம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCyclistEnduranceCadenceDrillName` | Cadence drill | 踏频练习 | கேடன்ஸ் பயிற்சி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCyclistEnduranceSteadyRideDetail` | 45-60 min comfort zone | 45-60 分钟舒适区 | 45-60 நிமிடம் வசதியான மண்டலம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutCyclistEnduranceSteadyRideName` | Steady ride | 匀速骑行 | சீரான ரைடு | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutEasyRunEasyRunDetail` | 20-30 min, able to hold a conversation | 20-30 分钟，能边跑边聊天 | 20-30 நிமிடம், பேசிக்கொண்டே ஓடும் வேகம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutEasyRunEasyRunName` | Easy run | 轻松跑 | இலகு ஓட்டம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutEasyRunStridesDetail` | 4 x 20 sec controlled speed | 4 组 × 20 秒可控加速 | 4 செட் × 20 வினாடி கட்டுப்பாட்டு வேகம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutEasyRunStridesName` | Strides | 快步跑 | ஸ்ட்ரைட்ஸ் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFatLossCircuitMountainClimberDetail` | 3 rounds x 30 sec | 3 轮 × 30 秒 | 3 சுற்று × 30 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFatLossCircuitMountainClimberName` | Circuit: mountain climber | 循环：登山跑 | சர்க்யூட்: மவுண்டன் கிளைம்பர் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFatLossCircuitPushUpDetail` | 3 rounds x 12 | 3 轮 × 12 次 | 3 சுற்று × 12 | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFatLossCircuitPushUpName` | Circuit: push-up | 循环：俯卧撑 | சர்க்யூட்: புஷ்-அப் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFatLossCircuitRowingDetail` | 3 rounds x 45 sec | 3 轮 × 45 秒 | 3 சுற்று × 45 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFatLossCircuitRowingName` | Circuit: rowing / jumping jack | 循环：划船机 / 开合跳 | சர்க்யூட்: ரோயிங் / ஜம்பிங் ஜாக் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFatLossCircuitSquatDetail` | 3 rounds x 15 | 3 轮 × 15 次 | 3 சுற்று × 15 | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFatLossCircuitSquatName` | Circuit: squat | 循环：深蹲 | சர்க்யூட்: ஸ்குவாட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFatLossFinisherWalkDetail` | 10 min | 10 分钟 | 10 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFatLossFinisherWalkName` | Brisk walk finisher | 收尾快走 | இறுதி விறுநடை | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFighterCampBurpeesDetail` | 4 x 10 | 4 组 × 10 次 | 4 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutFighterCampBurpeesName` | Burpees | 波比跳 | பர்பீஸ் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFighterCampPushUpDetail` | 4 x 12 | 4 组 × 12 次 | 4 செட் × 12 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutFighterCampPushUpName` | Push-up | 俯卧撑 | புஷ்-அப் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFighterCampShadowBoxingDetail` | 3 x 3 min, clean technique | 3 组 × 3 分钟，动作干净 | 3 செட் × 3 நிமிடம், நுட்பம் சுத்தமாக | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFighterCampShadowBoxingName` | Shadow boxing | 空击 | ஷேடோ பாக்ஸிங் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFighterCampSitUpTwistDetail` | 3 x 20 | 3 组 × 20 次 | 3 செட் × 20 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutFighterCampSitUpTwistName` | Sit-up + twist | 仰卧起坐 + 转体 | சிட்-அப் + திருப்பம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFighterCampSkippingDetail` | 4 x 2 min, rest 45 sec | 4 组 × 2 分钟，休息 45 秒 | 4 செட் × 2 நிமிடம், ஓய்வு 45 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFighterCampSkippingName` | Skipping | 跳绳 | கயிறு தாண்டல் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFootballMatchdayAgilityLadderDetail` | 4 sets | 4 组 | 4 செட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFootballMatchdayAgilityLadderName` | Agility ladder / cone | 敏捷梯 / 标志碟 | சுறுசுறுப்பு ஏணி / கோன் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFootballMatchdayDynamicStretchDetail` | 8 min | 8 分钟 | 8 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFootballMatchdayDynamicStretchName` | Dynamic stretch | 动态拉伸 | இயங்கு நீட்சி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFootballMatchdayPassingDrillDetail` | 15 min | 15 分钟 | 15 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFootballMatchdayPassingDrillName` | Passing / juggling drill | 传球 / 颠球练习 | பாஸிங் / ஜக்லிங் பயிற்சி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFootballMatchdayShortSprintDetail` | 6 x 20 metres | 6 组 × 20 米 | 6 செட் × 20 மீட்டர் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutFootballMatchdayShortSprintName` | Short sprints | 短距冲刺 | குறுகிய ஸ்பிரிண்ட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutHikingModeFarmerCarryPackDetail` | 3 x 40 metres | 3 组 × 40 米 | 3 செட் × 40 மீட்டர் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutHikingModeFarmerCarryPackName` | Farmer carry (pack) | 农夫行走（背包） | ஃபார்மர் கேரி (பை) | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutHikingModeInclineWalkDetail` | 30 min | 30 分钟 | 30 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutHikingModeInclineWalkName` | Incline / stair walk | 斜坡 / 阶梯行走 | சரிவு / படிக்கட்டு நடை | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutHikingModeStepUpDetail` | 4 x 12 each leg | 4 组 × 每腿 12 次 | 4 செட் × ஒவ்வொரு காலுக்கும் 12 | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutHikingModeStepUpName` | Step-up | 登阶 | ஸ்டெப்-அப் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutHomeWorkoutBodyweightSquatDetail` | 3 x 15 | 3 组 × 15 次 | 3 செட் × 15 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutHomeWorkoutBodyweightSquatName` | Bodyweight squat | 徒手深蹲 | உடல் எடை ஸ்குவாட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutHomeWorkoutJumpingJackDetail` | 3 x 45 sec | 3 组 × 45 秒 | 3 செட் × 45 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutHomeWorkoutJumpingJackName` | Jumping jack | 开合跳 | ஜம்பிங் ஜாக் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutHomeWorkoutPushUpDetail` | 3 x 10 | 3 组 × 10 次 | 3 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutHomeWorkoutPushUpName` | Push-up | 俯卧撑 | புஷ்-அப் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutHomeWorkoutReverseLungeDetail` | 3 x 10 each leg | 3 组 × 每腿 10 次 | 3 செட் × ஒவ்வொரு காலுக்கும் 10 | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutHomeWorkoutReverseLungeName` | Reverse lunge | 后撤弓步 | பின்னோக்கு லன்ஜ் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutHomeWorkoutSupermanHoldDetail` | 3 x 20 sec | 3 组 × 20 秒 | 3 செட் × 20 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutHomeWorkoutSupermanHoldName` | Superman hold | 超人式静态保持 | சூப்பர்மேன் ஹோல்ட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutLowerBodyCalfRaiseDetail` | 3 x 15 | 3 组 × 15 次 | 3 செட் × 15 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutLowerBodyCalfRaiseName` | Calf raise | 提踵 | கெண்டைக்கால் உயர்த்தல் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutLowerBodyHipThrustDetail` | 4 x 12 | 4 组 × 12 次 | 4 செட் × 12 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutLowerBodyHipThrustName` | Hip thrust / glute bridge | 臀推 / 臀桥 | ஹிப் த்ரஸ்ட் / குளூட் பிரிட்ஜ் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutLowerBodySquatDetail` | 4 x 10 | 4 组 × 10 次 | 4 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutLowerBodySquatName` | Squat | 深蹲 | ஸ்குவாட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutLowerBodyWalkingLungeDetail` | 3 x 10 each leg | 3 组 × 每腿 10 次 | 3 செட் × ஒவ்வொரு காலுக்கும் 10 | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutLowerBodyWalkingLungeName` | Walking lunge | 行进弓步 | நடை லன்ஜ் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMarathonBaseLongRunDetail` | 60-90 min easy pace | 60-90 分钟轻松配速 | 60-90 நிமிடம் இலகு வேகம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMarathonBaseLongRunName` | Long run | 长距离跑 | நீண்ட ஓட்டம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMarathonBaseRefuelDetail` | Water/isotonic every 20 min | 每 20 分钟补水 / 等渗饮料 | ஒவ்வொரு 20 நிமிடமும் நீர் / ஐசோடோனிக் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMarathonBaseRefuelName` | In-session refuel | 途中补给 | ஓட்டத்தினுள் நிரப்புதல் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMmaHybridBearCrawlDetail` | 3 x 20 metres | 3 组 × 20 米 | 3 செட் × 20 மீட்டர் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMmaHybridBearCrawlName` | Bear crawl | 熊爬 | கரடி நடை | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMmaHybridHipEscapeDetail` | 3 x 10 each side | 3 组 × 每侧 10 次 | 3 செட் × ஒவ்வொரு பக்கமும் 10 | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMmaHybridHipEscapeName` | Hip escape (shrimp) | 髋部逃脱（虾行） | இடுப்பு விடுவிப்பு (ஷ்ரிம்ப்) | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMmaHybridShadowStrikingDetail` | 3 x 3 min | 3 组 × 3 分钟 | 3 செட் × 3 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMmaHybridShadowStrikingName` | Shadow striking | 空击打击 | ஷேடோ ஸ்ட்ரைக்கிங் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMmaHybridSprawlDrillDetail` | 4 x 10 | 4 组 × 10 次 | 4 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutMmaHybridSprawlDrillName` | Sprawl drill | 防摔练习 | ஸ்ப்ராள் பயிற்சி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMmaHybridSquatPressDetail` | 3 x 12 | 3 组 × 12 次 | 3 செட் × 12 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutMmaHybridSquatPressName` | Squat + press | 深蹲 + 推举 | ஸ்குவாட் + பிரஸ் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMobilityRecoveryCatCowDetail` | 2 x 10 | 2 组 × 10 次 | 2 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutMobilityRecoveryCatCowName` | Cat-cow | 猫牛式 | கேட்-கவ் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMobilityRecoveryDeepBreathingDetail` | 5 min | 5 分钟 | 5 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMobilityRecoveryDeepBreathingName` | Deep breathing | 深呼吸 | ஆழ்ந்த மூச்சு | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMobilityRecoveryHamstringStretchDetail` | 2 x 45 sec | 2 组 × 45 秒 | 2 செட் × 45 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMobilityRecoveryHamstringStretchName` | Hamstring stretch | 腘绳肌拉伸 | தொடைத் தசை நீட்சி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMobilityRecoveryHipOpenerDetail` | 2 x 45 sec each side | 2 组 × 每侧 45 秒 | 2 செட் × ஒவ்வொரு பக்கமும் 45 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMobilityRecoveryHipOpenerName` | Hip opener (90/90) | 开髋（90/90） | இடுப்பு விரிப்பு (90/90) | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMobilityRecoveryThoracicRotationDetail` | 2 x 8 each side | 2 组 × 每侧 8 次 | 2 செட் × ஒவ்வொரு பக்கமும் 8 | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMobilityRecoveryThoracicRotationName` | Thoracic rotation | 胸椎旋转 | மார்பு முதுகெலும்பு சுழற்சி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMuayThaiCorePlankDetail` | 3 x 45 sec | 3 组 × 45 秒 | 3 செட் × 45 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMuayThaiCorePlankName` | Core plank | 核心平板支撑 | கோர் பிளாங்க் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMuayThaiKneeStrikesDetail` | 3 x 15 each knee | 3 组 × 每膝 15 次 | 3 செட் × ஒவ்வொரு முழங்காலுக்கும் 15 | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMuayThaiKneeStrikesName` | Knee strikes | 膝击 | முழங்கால் தாக்குதல் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMuayThaiRoundhouseDetail` | 4 x 10 each side | 4 组 × 每侧 10 次 | 4 செட் × ஒவ்வொரு பக்கமும் 10 | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMuayThaiRoundhouseName` | Roundhouse (shadow) | 扫踢（空击） | ரவுண்ட்ஹவுஸ் (ஷேடோ) | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMuayThaiSquatJumpDetail` | 3 x 12 | 3 组 × 12 次 | 3 செட் × 12 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutMuayThaiSquatJumpName` | Squat jump | 深蹲跳 | ஸ்குவாட் ஜம்ப் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMuayThaiTeepDrillDetail` | 3 x 12 each leg | 3 组 × 每腿 12 次 | 3 செட் × ஒவ்வொரு காலுக்கும் 12 | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMuayThaiTeepDrillName` | Teep drill | 前踢练习 | டீப் பயிற்சி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMuscleGainArmSupersetDetail` | 3 x 12 | 3 组 × 12 次 | 3 செட் × 12 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutMuscleGainArmSupersetName` | Bicep + tricep superset | 二头 + 三头超级组 | பைசெப் + டிரைசெப் சூப்பர்செட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMuscleGainBenchPushUpDetail` | 4 x 8-10 | 4 组 × 8-10 次 | 4 செட் × 8-10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutMuscleGainBenchPushUpName` | Bench / Weighted push-up | 卧推 / 负重俯卧撑 | பென்ச் / எடையுடன் புஷ்-அப் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMuscleGainRowPulldownDetail` | 4 x 10 | 4 组 × 10 次 | 4 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutMuscleGainRowPulldownName` | Row / Lat pulldown | 划船 / 高位下拉 | ரோ / லேட் புல்டவுன் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMuscleGainShoulderPressDetail` | 3 x 10 | 3 组 × 10 次 | 3 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutMuscleGainShoulderPressName` | Shoulder press | 肩推 | ஷோல்டர் பிரஸ் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutMuscleGainSquatLegPressDetail` | 4 x 8-10 | 4 组 × 8-10 次 | 4 செட் × 8-10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutMuscleGainSquatLegPressName` | Squat / Leg press | 深蹲 / 腿举 | ஸ்குவாட் / லெக் பிரஸ் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutPrep10kmLongSteadyDetail` | 40-50 min steady pace | 40-50 分钟稳定配速 | 40-50 நிமிடம் நிலையான வேகம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutPrep10kmLongSteadyName` | Long steady run | 长距离匀速跑 | நீண்ட சீரான ஓட்டம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutPrep10kmSurgeDetail` | 5 x 1 min fast within the run | 跑动中 5 组 × 1 分钟加速 | ஓட்டத்தினுள் 5 செட் × 1 நிமிடம் வேகம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutPrep10kmSurgeName` | Surge | 途中加速 | இடையில் வேகம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutPrep5kmInterval1kmDetail` | 2 x 1km race pace, rest 2 min | 2 组 × 1km 比赛配速，休息 2 分钟 | 2 செட் × 1km பந்தய வேகம், ஓய்வு 2 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutPrep5kmInterval1kmName` | Interval 1km | 1km 间歇 | 1km இடைவெளி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutPrep5kmTempoRunDetail` | 15 min comfortably hard pace | 15 分钟舒适偏快配速 | 15 நிமிடம் வசதியான-வேக வேகம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutPrep5kmTempoRunName` | Tempo run | 节奏跑 | டெம்போ ஓட்டம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutRestDayNutritionEasyWalkDetail` | 15-20 min after a meal | 饭后 15-20 分钟 | உணவுக்குப் பின் 15-20 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutRestDayNutritionEasyWalkName` | Easy walk | 轻松散步 | நிதான நடை | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutRestDayNutritionLightStretchDetail` | 10 min before bed | 睡前 10 分钟 | தூங்குவதற்கு முன் 10 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutRestDayNutritionLightStretchName` | Light stretching | 轻度拉伸 | இலகு நீட்சி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSelfDefenceFootworkDetail` | 4 x 30 sec | 4 组 × 30 秒 | 4 செட் × 30 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSelfDefenceFootworkName` | Footwork out of corners | 脱离角落步法 | மூலையிலிருந்து வெளியேறும் கால் அசைவு | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSelfDefenceKneeElbowDetail` | 3 x 10 | 3 组 × 10 次 | 3 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutSelfDefenceKneeElbowName` | Knee + elbow combo | 膝击 + 肘击组合 | முழங்கால் + முழங்கை இணைவு | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSelfDefencePalmStrikeDetail` | 3 x 12 | 3 组 × 12 次 | 3 செட் × 12 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutSelfDefencePalmStrikeName` | Palm strike drill | 掌击练习 | உள்ளங்கை தாக்குதல் பயிற்சி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSelfDefencePushUpDetail` | 3 x 10 | 3 组 × 10 次 | 3 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutSelfDefencePushUpName` | Push-up | 俯卧撑 | புஷ்-அப் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSpeedRunHillSprintDetail` | 4 x 20 sec | 4 组 × 20 秒 | 4 செட் × 20 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSpeedRunHillSprintName` | Hill / stair sprint | 坡道 / 阶梯冲刺 | மேடு / படிக்கட்டு ஸ்பிரிண்ட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSpeedRunInterval400Detail` | 6 x 400m fast pace, jog 90 sec | 6 组 × 400m 快配速，慢跑 90 秒 | 6 செட் × 400m வேக வேகம், 90 வினாடி ஜாகிங் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSpeedRunInterval400Name` | Interval 400m | 400m 间歇 | 400m இடைவெளி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutStrengthDayDeadliftDetail` | 3 x 5 | 3 组 × 5 次 | 3 செட் × 5 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutStrengthDayDeadliftName` | Deadlift | 硬拉 | டெட்லிஃப்ட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutStrengthDayHeavySquatDetail` | 5 x 5 | 5 组 × 5 次 | 5 செட் × 5 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutStrengthDayHeavySquatName` | Heavy squat | 大重量深蹲 | கன ஸ்குவாட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutStrengthDayOverheadPressDetail` | 4 x 6 | 4 组 × 6 次 | 4 செட் × 6 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutStrengthDayOverheadPressName` | Overhead press | 过头推举 | ஓவர்ஹெட் பிரஸ் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutStrengthDayWeightedPlankDetail` | 3 x 30 sec | 3 组 × 30 秒 | 3 செட் × 30 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutStrengthDayWeightedPlankName` | Weighted plank | 负重平板支撑 | எடையுடன் பிளாங்க் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSwimmerModeKickDrillDetail` | 4 x 50m with a board | 4 组 × 50m，使用浮板 | 4 செட் × 50m போர்டுடன் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSwimmerModeKickDrillName` | Kick drill | 打腿练习 | கிக் பயிற்சி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSwimmerModeMainSetDetail` | 6 x 100m, rest 20 sec | 6 组 × 100m，休息 20 秒 | 6 செட் × 100m, ஓய்வு 20 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSwimmerModeMainSetName` | Main set | 主课 | முக்கிய செட் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSwimmerModeWarmupLapsDetail` | 4 x 50m easy | 4 组 × 50m 轻松游 | 4 செட் × 50m இலகுவாக | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutSwimmerModeWarmupLapsName` | Warm-up laps | 热身泳圈 | வார்ம்-அப் லேப் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutTennisModeMedBallRotationDetail` | 3 x 10 each side | 3 组 × 每侧 10 次 | 3 செட் × ஒவ்வொரு பக்கமும் 10 | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutTennisModeMedBallRotationName` | Med-ball rotation / twist | 药球转体 | மெட்-பால் சுழற்சி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutTennisModeShadowStrokeDetail` | 4 x 12 | 4 组 × 12 次 | 4 செட் × 12 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutTennisModeShadowStrokeName` | Shadow stroke | 空挥击球 | ஷேடோ ஸ்ட்ரோக் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutTennisModeSideShuffleDetail` | 4 x 30 sec | 4 组 × 30 秒 | 4 செட் × 30 வினாடி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutTennisModeSideShuffleName` | Side shuffle + split step | 侧向滑步 + 分腿垫步 | பக்கவாட்டு நகர்வு + ஸ்பிலிட் ஸ்டெப் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutTennisModeWallRallyDetail` | 10 min | 10 分钟 | 10 நிமிடம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutTennisModeWallRallyName` | Wall rally | 对墙击球 | சுவர் ரேலி | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutTrailRunCalfRaisesDetail` | 3 x 15 after the run | 跑后 3 组 × 15 次 | ஓட்டத்திற்குப் பின் 3 செட் × 15 | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutTrailRunCalfRaisesName` | Calf raises | 提踵 | கெண்டைக்கால் உயர்த்தல் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutTrailRunTrailRunDetail` | 45-60 min, watch your footing on descents | 45-60 分钟，下坡注意落脚 | 45-60 நிமிடம், இறக்கத்தில் கால் வைப்பில் கவனம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutTrailRunTrailRunName` | Trail run | 越野跑 | பாதை ஓட்டம் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutUpperBodyBicepCurlDetail` | 3 x 12 | 3 组 × 12 次 | 3 செட் × 12 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutUpperBodyBicepCurlName` | Bicep curl | 二头弯举 | பைசெப் கர்ல் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutUpperBodyLateralRaiseDetail` | 3 x 12 | 3 组 × 12 次 | 3 செட் × 12 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutUpperBodyLateralRaiseName` | Lateral raise | 侧平举 | லேட்டரல் ரெய்ஸ் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutUpperBodyPullUpRowDetail` | 4 x 8 | 4 组 × 8 次 | 4 செட் × 8 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutUpperBodyPullUpRowName` | Pull-up / row | 引体向上 / 划船 | புல்-அப் / ரோ | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutUpperBodyPushUpBenchDetail` | 4 x 10 | 4 组 × 10 次 | 4 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutUpperBodyPushUpBenchName` | Push-up / bench | 俯卧撑 / 卧推 | புஷ்-அப் / பென்ச் | Fit Today > generated workout plan block | - | Pending native review |
| `sportWorkoutUpperBodyTricepDipDetail` | 3 x 10 | 3 组 × 10 次 | 3 செட் × 10 | Fit Today > generated workout plan block | Numeric/units only | Pending native review |
| `sportWorkoutUpperBodyTricepDipName` | Tricep dip | 三头臂屈伸 | டிரைசெப் டிப் | Fit Today > generated workout plan block | - | Pending native review |
