import 'dart:math';

import '../../core/models/makanmana_user_context.dart';
import '../../models/place_summary.dart';

/// Satu cadangan slot dalam Meal Plan (Prompt 11).
/// [place] null bermakna "idea meal" (tiada tempat sebenar berdekatan).
class MealPlanItem {
  const MealPlanItem({
    required this.slotKey,
    this.place,
    this.ideaKey,
    this.cuisine = '',
    this.budgetText = '',
    this.reasonKeys = const [],
    this.cautionKeys = const [],
    this.score = 0,
  });

  final String slotKey; // slotBreakfast | slotLunch | slotDinner
  final PlaceSummary? place;
  final String? ideaKey; // kunci l10n idea bila tiada tempat
  final String cuisine;
  final String budgetText;
  final List<String> reasonKeys;
  final List<String> cautionKeys;
  final int score;

  bool get isIdea => place == null;
}

/// Hasil Meal Plan.
class MealPlanResult {
  const MealPlanResult({
    required this.days,
    required this.confidence,
    required this.starter,
    required this.slotsCount,
    required this.usedBrain,
    required this.usedRecentMeals,
  });

  final List<List<MealPlanItem>> days;
  final double confidence; // 0..1
  final bool starter; // true = berdasarkan profil sahaja (data rendah)
  final int slotsCount;
  final bool usedBrain;
  final bool usedRecentMeals;

  bool get isEmpty => days.isEmpty;
}

/// Input diringkaskan dari MakanManaUserContext (MealPlanContext builder).
class MealPlanInputs {
  MealPlanInputs.fromContext(MakanManaUserContext c)
      : dietGoal = c.dietGoal,
        budgetMin = c.budgetMin,
        budgetMax = c.budgetMax,
        preferredPriceLevel = c.preferredPriceLevel,
        allergies = c.allergies,
        halalPreference = c.halalPreference,
        favoriteCuisines = _lower(c.favoriteCuisines),
        topCuisines = _lower(c.topCuisines),
        avoidedCuisines = _lower(c.avoidedCuisines),
        selectedMood = c.selectedMood,
        preferredDistanceKm = c.preferredDistanceKm,
        repeatTolerance = c.repeatTolerance,
        healthyPreference = c.healthyPreference ?? 0,
        heavyFoodFrequency = c.heavyFoodFrequency ?? 0,
        fitGoal = c.fitGoal,
        recentRejectedPlaceIds =
            _strList(c.foodMemorySummary?['recentRejectedPlaceIds']),
        recentAcceptedPlaceIds =
            _strList(c.foodMemorySummary?['recentAcceptedPlaceIds']),
        recentPlaceIds = c.recentPlaceIds,
        brainConfidence = _brainConfidence(c.foodMemorySummary),
        recentMealCount = c.recentPlaceIds.length;

  final String? dietGoal;
  final int? budgetMin;
  final int? budgetMax;
  final int? preferredPriceLevel;
  final List<String> allergies;
  final bool halalPreference;
  final List<String> favoriteCuisines;
  final List<String> topCuisines;
  final List<String> avoidedCuisines;
  final String selectedMood;
  final double preferredDistanceKm;
  final double repeatTolerance;
  final double healthyPreference;
  final double heavyFoodFrequency;
  final String? fitGoal;
  final List<String> recentRejectedPlaceIds;
  final List<String> recentAcceptedPlaceIds;
  final List<String> recentPlaceIds;
  final double brainConfidence;
  final int recentMealCount;

  bool get wantsHealthy {
    final g = dietGoal?.toLowerCase() ?? '';
    return g.contains('healthy') ||
        g.contains('sihat') ||
        g.contains('lean') ||
        g.contains('fat') ||
        healthyPreference >= 0.5;
  }

  static List<String> _lower(List<String> v) =>
      v.map((e) => e.toLowerCase()).toList();

  static List<String> _strList(Object? v) {
    if (v is List) {
      return v.map((e) => e.toString()).where((s) => s.isNotEmpty).toList();
    }
    return const [];
  }

  static double _brainConfidence(Map<String, dynamic>? brain) {
    final c = brain?['confidence'];
    if (c is Map && c['overall'] is num) return (c['overall'] as num).toDouble();
    return 0;
  }
}

const _healthyCuisineHints = [
  'salad',
  'sup',
  'soup',
  'grill',
  'bakar',
  'jepun',
  'japanese',
  'korea',
  'healthy',
  'vegetarian',
  'vegan',
  'seafood',
];

/// Penjana Meal Plan deterministik (Prompt 11): skor calon ikut konteks,
/// elak ulangan & tempat baru ditolak, hasilkan sebab + amaran jujur.
/// TIDAK menyentuh skor getSuggestions. TIDAK mendakwa kalori/perubatan.
MealPlanResult buildMealPlan(
  MakanManaUserContext context,
  List<PlaceSummary> candidates, {
  int days = 3,
  int seed = 0,
}) {
  final inputs = MealPlanInputs.fromContext(context);
  final slotKeys = ['slotBreakfast', 'slotLunch', 'slotDinner'];
  final random = Random(seed);

  // Kolam calon: buka & bukan tempat yang baru ditolak.
  final pool = candidates
      .where((p) => p.isOpen)
      .where((p) => !inputs.recentRejectedPlaceIds.contains(p.placeId))
      .toList();

  final usedInPlan = <String>{};
  final planDays = <List<MealPlanItem>>[];
  var totalSlots = 0;

  for (var day = 0; day < days; day++) {
    final dayItems = <MealPlanItem>[];
    for (final slot in slotKeys) {
      // Skor setiap calon untuk slot ini.
      final scored = pool.map((p) {
        var score = _scorePlace(p, inputs, slot);
        // Penalti ulangan dalam pelan (kecuali toleransi tinggi).
        if (usedInPlan.contains(p.placeId)) {
          score -= (inputs.repeatTolerance >= 0.65) ? 8 : 40;
        }
        return MapEntry(p, score);
      }).toList()
        ..sort((a, b) => b.value.compareTo(a.value));

      MealPlanItem item;
      if (scored.isEmpty || scored.first.value <= -30) {
        // Tiada calon sesuai -> idea meal (bukan restoran palsu).
        item = _mealIdea(inputs, slot);
      } else {
        // Ambil dari 2 teratas (kocok ringan untuk regenerate).
        final topN = scored.take(min(2, scored.length)).toList();
        final chosen = topN[random.nextInt(topN.length)];
        usedInPlan.add(chosen.key.placeId);
        item = _placeItem(chosen.key, inputs, slot, chosen.value);
      }
      dayItems.add(item);
      totalSlots++;
    }
    planDays.add(dayItems);
  }

  // Keyakinan: gabung bilangan calon sebenar + brain + meal terkini.
  final candidateConf = (pool.length / 8).clamp(0.0, 1.0);
  final confidence =
      (candidateConf * 0.5 + inputs.brainConfidence * 0.5).clamp(0.0, 1.0);
  final starter = inputs.brainConfidence < 0.2 && inputs.recentMealCount == 0;

  return MealPlanResult(
    days: planDays,
    confidence: confidence,
    starter: starter,
    slotsCount: totalSlots,
    usedBrain: inputs.brainConfidence > 0,
    usedRecentMeals: inputs.recentMealCount > 0,
  );
}

/// Peta isyarat negatif backend -> kunci l10n amaran Meal Plan (2.3A lengkap).
const Map<String, String> _mpCautionKeys = {
  'possible_allergy_conflict': 'maybeAllergyConflict',
  'allergy_data_unknown': 'allergyDataUnknown',
  'possible_non_halal': 'halalStatusUnknown',
  'price_unknown': 'priceUnknown',
  'price_estimated': 'priceEstimated',
  'hours_unverified': 'hoursUnverified',
  'halal_status_unknown': 'halalStatusUnknown',
  'beyond_preferred_distance': 'beyondPreferredDistance',
  'similar_to_recent': 'similarToRecent',
  'nutrition_not_verified': 'nutritionNotVerified',
};

/// Part B (2.3A) — RANKING AUTHORITATIF = matchScore backend (unified scoring
/// algo2_scoring_v1). Meal Plan TIDAK kira semula bajet/cuisine/diet/jarak
/// (elak markah bercanggah); hanya nudge slot ringan (persembahan) + guard
/// cuisine-dielak. Penalti ulang-dalam-pelan dikendali dalam buildMealPlan.
int _scorePlace(PlaceSummary p, MealPlanInputs i, String slot) {
  var score = p.matchScore; // authoritative (backend unified; tidak diubah)
  final cuisine = p.cuisine.toLowerCase();
  // Guard: cuisine yang pengguna elak jangan menduduki pelan (backend juga tolak).
  if (i.avoidedCuisines.any(cuisine.contains)) score -= 25;
  // Nudge slot ringan: sarapan utamakan murah/dekat (bukan skor autoritatif).
  if (slot == 'slotBreakfast' && p.priceLevel <= 2) score += 3;
  return score;
}

MealPlanItem _placeItem(
    PlaceSummary p, MealPlanInputs i, String slot, int score) {
  final cuisine = p.cuisine.toLowerCase();
  // Part B — sebab dari backend unified (matchReasonKeys) DAHULU; fallback slot.
  final reasons = <String>[...p.matchReasonKeys];
  if (reasons.isEmpty) {
    if (i.favoriteCuisines.any(cuisine.contains) ||
        i.topCuisines.any(cuisine.contains)) {
      reasons.add('mpReasonLikedCuisine');
    } else if (i.wantsHealthy && _healthyCuisineHints.any(cuisine.contains)) {
      reasons.add('mpReasonHealthy');
    } else {
      reasons.add('mpReasonProfile');
    }
  }

  // Amaran jujur dari isyarat negatif backend (peta lengkap 2.3A).
  final cautions = <String>[];
  for (final s in p.negativeSignals) {
    final k = _mpCautionKeys[s];
    if (k != null && !cautions.contains(k)) cautions.add(k);
  }
  if (i.allergies.isNotEmpty && !cautions.contains('allergyDataUnknown')) {
    cautions.add('allergyDataUnknown');
  }
  if (i.halalPreference && !cautions.contains('halalStatusUnknown')) {
    cautions.add('halalStatusUnknown');
  }

  return MealPlanItem(
    slotKey: slot,
    place: p,
    cuisine: p.cuisine,
    budgetText: p.priceEstimate,
    reasonKeys: reasons.take(2).toList(),
    cautionKeys: cautions.take(2).toList(),
    score: score,
  );
}

/// Idea meal bila tiada tempat sesuai (bukan restoran palsu).
MealPlanItem _mealIdea(MealPlanInputs i, String slot) {
  String ideaKey;
  final cuisine = i.favoriteCuisines.isNotEmpty
      ? i.favoriteCuisines.first
      : (i.topCuisines.isNotEmpty ? i.topCuisines.first : '');
  if (i.wantsHealthy) {
    ideaKey = 'mpIdeaHealthy';
  } else if (i.budgetMax != null && i.budgetMax! < 15) {
    ideaKey = 'mpIdeaBudget';
  } else {
    ideaKey = 'mpIdeaGeneric';
  }
  final cautions = <String>[];
  if (i.allergies.isNotEmpty) cautions.add('allergyDataUnknown');
  if (i.halalPreference) cautions.add('halalStatusUnknown');
  return MealPlanItem(
    slotKey: slot,
    ideaKey: ideaKey,
    cuisine: cuisine,
    reasonKeys: const ['mpReasonProfile'],
    cautionKeys: cautions,
  );
}
