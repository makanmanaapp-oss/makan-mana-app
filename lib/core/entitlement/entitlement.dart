import 'plan_tier.dart';

/// Tahap akses ciri (Prompt 10).
enum AccessLevel { full, preview, locked, hidden }

/// ID ciri stabil untuk gating berpusat.
class FeatureId {
  FeatureId._();

  // Free
  static const coreSpin = 'core_spin';
  static const homeAiPickPreview = 'home_ai_pick_preview';
  static const moodBasic = 'mood_basic';
  static const suggestionCard = 'suggestion_card';
  static const acceptReject = 'accept_reject';
  static const historyBasic = 'history_basic';
  static const profileMakanan = 'profile_makanan';
  static const radiusBasic = 'radius_basic';
  static const foodMemoryBasic = 'food_memory_basic';

  // Plus
  static const unlimitedSpin = 'unlimited_spin';
  static const moodLifestyle = 'mood_lifestyle';
  static const allSpinThemes = 'all_spin_themes';
  static const advancedFilter = 'advanced_filter';
  static const favoritesFull = 'favorites_full';
  static const historyFull = 'history_full';

  // Pro
  static const moodHealthy = 'mood_healthy';
  static const moodDietGoal = 'mood_diet_goal';
  static const aiFoodCoach = 'ai_food_coach';
  static const calorieScan = 'calorie_scan';
  static const weeklyFoodReport = 'weekly_food_report';
  static const mealPlan = 'meal_plan';
  static const fitCoach = 'fit_coach';
  static const sportMood = 'sport_mood';
  static const groupDecisionFull = 'group_decision_full';
  static const foodMemoryAdvanced = 'food_memory_advanced';
}

/// Peta ciri -> pelan minimum diperlukan. Ciri tidak tersenarai = free.
const Map<String, PlanTier> _featureRequired = {
  FeatureId.unlimitedSpin: PlanTier.plus,
  FeatureId.moodLifestyle: PlanTier.plus,
  FeatureId.allSpinThemes: PlanTier.plus,
  FeatureId.advancedFilter: PlanTier.plus,
  FeatureId.favoritesFull: PlanTier.plus,
  FeatureId.historyFull: PlanTier.plus,
  FeatureId.moodHealthy: PlanTier.pro,
  FeatureId.moodDietGoal: PlanTier.pro,
  FeatureId.aiFoodCoach: PlanTier.pro,
  FeatureId.calorieScan: PlanTier.pro,
  FeatureId.weeklyFoodReport: PlanTier.pro,
  FeatureId.mealPlan: PlanTier.pro,
  FeatureId.fitCoach: PlanTier.pro,
  FeatureId.sportMood: PlanTier.pro,
  FeatureId.groupDecisionFull: PlanTier.pro,
  FeatureId.foodMemoryAdvanced: PlanTier.pro,
};

/// Ciri yang boleh dipratonton (teaser) bila terkunci.
const Set<String> _previewable = {
  FeatureId.moodLifestyle,
  FeatureId.moodHealthy,
  FeatureId.moodDietGoal,
  FeatureId.aiFoodCoach,
  FeatureId.mealPlan,
  FeatureId.weeklyFoodReport,
  FeatureId.fitCoach,
  FeatureId.sportMood,
  FeatureId.calorieScan,
  FeatureId.advancedFilter,
  FeatureId.allSpinThemes,
  FeatureId.groupDecisionFull,
  FeatureId.foodMemoryAdvanced,
};

/// Set mood ikut peringkat (selaras dengan chip mood Home).
const Set<String> _moodPlus = {
  'moodCafe',
  'moodHujan',
  'moodSupper',
  'moodHighRating',
  'moodNearby',
};
const Set<String> _moodPro = {
  'moodHealthy',
  'moodDietGoal',
};

/// Perkhidmatan kelayakan berpusat (Prompt 10). Semua semakan pelan UI
/// patut melalui objek ini, bukan `plan == 'plus'` bertaburan.
class Entitlement {
  const Entitlement(this.plan);

  final PlanTier plan;

  bool get isFree => plan == PlanTier.free;
  bool get isPlusOrAbove => plan.atLeast(PlanTier.plus);
  bool get isPro => plan == PlanTier.pro;

  bool hasPlan(PlanTier required) => plan.atLeast(required);

  int comparePlan(PlanTier required) => plan.rank - required.rank;

  // ---- Ciri ----

  PlanTier requiredPlanForFeature(String featureId) =>
      _featureRequired[featureId] ?? PlanTier.free;

  bool canUseFeature(String featureId) =>
      plan.atLeast(requiredPlanForFeature(featureId));

  bool canPreviewFeature(String featureId) =>
      !canUseFeature(featureId) && _previewable.contains(featureId);

  AccessLevel accessLevelForFeature(String featureId) {
    if (canUseFeature(featureId)) return AccessLevel.full;
    if (_previewable.contains(featureId)) return AccessLevel.preview;
    return AccessLevel.locked;
  }

  // ---- Mood ----

  PlanTier requiredPlanForMood(String moodId) {
    if (_moodPro.contains(moodId)) return PlanTier.pro;
    if (_moodPlus.contains(moodId)) return PlanTier.plus;
    return PlanTier.free;
  }

  bool canUseMood(String moodId) =>
      plan.atLeast(requiredPlanForMood(moodId));

  /// Argumen untuk skrin paywall (highlight pelan diperlukan + konteks event).
  PaywallArgs buildPaywallArgs({
    required String featureId,
    required String sourceScreen,
    PlanTier? requiredPlan,
    String? moodId,
  }) =>
      PaywallArgs(
        featureId: featureId,
        requiredPlan: requiredPlan ?? requiredPlanForFeature(featureId),
        sourceScreen: sourceScreen,
        userPlan: plan,
        moodId: moodId,
      );
}

/// Data dihantar ke skrin paywall melalui route `extra` (Prompt 10).
class PaywallArgs {
  const PaywallArgs({
    this.featureId,
    this.requiredPlan = PlanTier.plus,
    this.sourceScreen = 'unknown',
    this.userPlan = PlanTier.free,
    this.moodId,
    this.trigger = 'feature_locked',
  });

  final String? featureId;
  final PlanTier requiredPlan;
  final String sourceScreen;
  final PlanTier userPlan;
  final String? moodId;
  final String trigger; // feature_locked | spin_limit | preview

  Map<String, dynamic> toMetadata() => {
        if (featureId != null) 'featureId': featureId,
        'requiredPlan': requiredPlan.id,
        'userPlan': userPlan.id,
        'sourceScreen': sourceScreen,
        'trigger': trigger,
        if (moodId != null) 'moodId': moodId,
      };
}
