import 'dart:math' as math;

import '../../models/place_summary.dart';

/// Sistem Formula Mood (Prompt 5).
///
/// Mood BUKAN sekadar label — setiap mood mewakili niat pengguna yang
/// mempengaruhi susunan (ranking) & sebab padanan (match reasons).
///
/// Nota seni bina:
/// - Ini config STATIK tempatan (belum Firestore). Selamat & pantas.
/// - Aplikasi mood dilakukan di CLIENT ke atas senarai PlaceSummary yang
///   sedia ada (tidak menggantikan enjin backend / scoringService.ts).
/// - Hanya guna medan PlaceSummary yang wujud (cuisine, rating,
///   userRatingCount, distanceKm, priceLevel, isOpen). Tiada dakwaan
///   kalori/halal/alahan (itu Prompt 6).

enum MoodCategory {
  proximity,
  quality,
  budget,
  vibe,
  health,
  variety,
  timing,
  spicy,
  hunger,
}

/// Pemberat ringkas untuk skor mood client-side.
class MoodWeights {
  const MoodWeights({
    this.distance = 1,
    this.budget = 0.4,
    this.rating = 0.6,
    this.cuisine = 0.4,
    this.variety = 0.5,
    this.health = 0,
  });

  final double distance;
  final double budget;
  final double rating;
  final double cuisine;
  final double variety;
  final double health;
}

class MoodFormula {
  const MoodFormula({
    required this.moodId,
    required this.labelKey,
    required this.category,
    required this.planAccess, // free | plus | pro
    required this.weights,
    this.descKey,
    this.isActive = true,
    this.boostTags = const [],
    this.penaltyTags = const [],
    this.excludeTags = const [],
    this.maxRadiusKm,
    this.priceLevelMax,
    this.openNowPreferred = false,
    this.allowLightRandomization = false,
    this.reasonKeys = const [],
  });

  final String moodId;
  final String labelKey;
  final String? descKey;
  final MoodCategory category;
  final String planAccess;
  final bool isActive;
  final MoodWeights weights;
  final List<String> boostTags;
  final List<String> penaltyTags;
  final List<String> excludeTags;
  final double? maxRadiusKm;
  final int? priceLevelMax;
  final bool openNowPreferred;
  final bool allowLightRandomization;

  /// Kunci l10n sebab padanan asas (fallback bila tiada bukti kuat).
  final List<String> reasonKeys;
}

/// Tag masakan yang dikira "sihat" untuk mood healthy (padanan substring).
const _kHealthyTags = [
  'healthy',
  'salad',
  'vegan',
  'vegetarian',
  'juice',
  'poke',
  'grill',
  'sihat',
];

/// Definisi formula bagi setiap mood. ID selaras dgn chip Home sedia ada.
const Map<String, MoodFormula> kMoodFormulas = {
  // ---- FREE ----
  'moodLapar': MoodFormula(
    moodId: 'moodLapar',
    labelKey: 'moodLapar',
    category: MoodCategory.hunger,
    planAccess: 'free',
    weights: MoodWeights(
        distance: 1.2, cuisine: 1.5, budget: 0.6, rating: 0.5, variety: 0.4),
    boostTags: ['mamak', 'nasi', 'fast', 'burger', 'rice', 'street'],
    openNowPreferred: true,
    reasonKeys: ['reasonFilling'],
  ),
  'moodJimat': MoodFormula(
    moodId: 'moodJimat',
    labelKey: 'moodJimat',
    category: MoodCategory.budget,
    planAccess: 'free',
    weights: MoodWeights(budget: 3, distance: 1, rating: 0.5, variety: 0.5),
    priceLevelMax: 2,
    reasonKeys: ['withinBudget'],
  ),
  'moodPedas': MoodFormula(
    moodId: 'moodPedas',
    labelKey: 'moodPedas',
    category: MoodCategory.spicy,
    planAccess: 'free',
    weights: MoodWeights(cuisine: 3, rating: 0.6, distance: 0.6, variety: 0.4),
    boostTags: [
      'thai',
      'melayu',
      'malay',
      'mamak',
      'indonesia',
      'india',
      'korean',
      'sichuan',
      'ayam',
      'gepuk',
      'sambal',
    ],
    reasonKeys: ['reasonSpicy'],
  ),
  'moodSurprise': MoodFormula(
    moodId: 'moodSurprise',
    labelKey: 'moodSurprise',
    category: MoodCategory.variety,
    planAccess: 'free',
    weights: MoodWeights(variety: 3, rating: 0.8, distance: 0.5),
    allowLightRandomization: true,
    reasonKeys: ['reasonSurprise'],
  ),
  // ---- PLUS ----
  'moodCafe': MoodFormula(
    moodId: 'moodCafe',
    labelKey: 'moodCafe',
    category: MoodCategory.vibe,
    planAccess: 'plus',
    weights: MoodWeights(cuisine: 3, rating: 1, distance: 0.8, variety: 0.5),
    boostTags: ['cafe', 'kafe', 'coffee', 'kopi', 'dessert', 'brunch'],
    reasonKeys: ['reasonCafeVibe'],
  ),
  'moodHujan': MoodFormula(
    moodId: 'moodHujan',
    labelKey: 'moodHujan',
    category: MoodCategory.vibe,
    planAccess: 'plus',
    weights: MoodWeights(cuisine: 2, distance: 0.8, rating: 0.6, variety: 0.4),
    boostTags: ['soup', 'noodle', 'ramen', 'mamak', 'thai', 'tomyam', 'sup'],
    openNowPreferred: true,
    reasonKeys: ['reasonMoodMatch'],
  ),
  'moodSupper': MoodFormula(
    moodId: 'moodSupper',
    labelKey: 'moodSupper',
    category: MoodCategory.timing,
    planAccess: 'plus',
    weights: MoodWeights(cuisine: 2, distance: 1, rating: 0.4, variety: 0.4),
    boostTags: ['mamak', 'fast', 'burger', 'street', 'roti'],
    openNowPreferred: true,
    reasonKeys: ['reasonSupper'],
  ),
  'moodHighRating': MoodFormula(
    moodId: 'moodHighRating',
    labelKey: 'moodHighRating',
    category: MoodCategory.quality,
    planAccess: 'plus',
    weights: MoodWeights(rating: 3, distance: 0.5, budget: 0.3, variety: 0.5),
    reasonKeys: ['highRating'],
  ),
  'moodNearby': MoodFormula(
    moodId: 'moodNearby',
    labelKey: 'moodNearby',
    category: MoodCategory.proximity,
    planAccess: 'plus',
    weights: MoodWeights(distance: 3, rating: 0.5, budget: 0.3, variety: 0.5),
    reasonKeys: ['nearLocation'],
  ),
  // ---- PRO ----
  'moodHealthy': MoodFormula(
    moodId: 'moodHealthy',
    labelKey: 'moodHealthy',
    category: MoodCategory.health,
    planAccess: 'pro',
    weights: MoodWeights(health: 3, cuisine: 1, rating: 0.8, distance: 0.5),
    boostTags: _kHealthyTags,
    reasonKeys: ['reasonHealthier'],
  ),
  // Mood diet goal (Pro) — bukan chip Home; disediakan utk masa depan.
  'moodDietGoal': MoodFormula(
    moodId: 'moodDietGoal',
    labelKey: 'moodHealthy',
    category: MoodCategory.health,
    planAccess: 'pro',
    isActive: false,
    weights: MoodWeights(health: 3, cuisine: 1, rating: 0.6),
    boostTags: _kHealthyTags,
    reasonKeys: ['reasonHealthier'],
  ),
};

/// Formula neutral (fallback) — tiada berat berat sebelah.
const _kNeutralFormula = MoodFormula(
  moodId: 'moodSurprise',
  labelKey: 'moodSurprise',
  category: MoodCategory.variety,
  planAccess: 'free',
  weights: MoodWeights(),
  reasonKeys: ['reasonMoodMatch'],
);

/// Petakan ID/label lama ke ID kanonik dengan selamat.
String canonicalMoodId(String? raw) {
  if (raw == null || raw.isEmpty) return 'moodSurprise';
  if (kMoodFormulas.containsKey(raw)) return raw;
  final lower = raw.toLowerCase().trim();
  const aliases = {
    'lapar': 'moodLapar',
    'lapar gila': 'moodLapar',
    'jimat': 'moodJimat',
    'budget': 'moodJimat',
    'pedas': 'moodPedas',
    'spicy': 'moodPedas',
    'surprise': 'moodSurprise',
    'surprise me': 'moodSurprise',
    'cafe': 'moodCafe',
    'cafe chill': 'moodCafe',
    'kafe': 'moodCafe',
    'hujan': 'moodHujan',
    'supper': 'moodSupper',
    'high rating': 'moodHighRating',
    'nearby': 'moodNearby',
    'nearby only': 'moodNearby',
    'healthy': 'moodHealthy',
    'healthy mode': 'moodHealthy',
  };
  return aliases[lower] ?? 'moodSurprise';
}

MoodFormula moodFormulaFor(String? moodId) =>
    kMoodFormulas[canonicalMoodId(moodId)] ?? _kNeutralFormula;

/// Skor mood client-side untuk satu tempat (guna medan sedia ada sahaja).
double _scorePlace(
  PlaceSummary p,
  MoodFormula f, {
  required double radiusKm,
  required Set<String> recentPlaceIds,
}) {
  final cuisine = p.cuisine.toLowerCase();
  final w = f.weights;
  var s = 0.0;

  // Jarak: lebih dekat lebih baik (relatif kepada radius).
  final dist = (1 - (p.distanceKm / (radiusKm > 0 ? radiusKm : 5)))
      .clamp(0.0, 1.0);
  s += dist * w.distance;

  // Rating berpemberat keyakinan review.
  final conf = (math.log(p.userRatingCount + 1) / 3).clamp(0.0, 1.0);
  s += (p.rating / 5) * conf * w.rating;

  // Bajet: priceLevel rendah lebih baik (relatif priceLevelMax).
  final maxPl = f.priceLevelMax ?? 4;
  final budget = p.priceLevel <= maxPl
      ? 1.0
      : math.max(0.0, 1 - 0.4 * (p.priceLevel - maxPl));
  s += budget * w.budget;

  // Padanan tag masakan (boost).
  final boost = f.boostTags.isEmpty
      ? 0.5
      : (f.boostTags.any((t) => cuisine.contains(t)) ? 1.0 : 0.35);
  s += boost * w.cuisine;

  // Sihat (untuk mood healthy).
  if (w.health > 0) {
    final healthy =
        _kHealthyTags.any((t) => cuisine.contains(t)) ? 1.0 : 0.3;
    s += healthy * w.health;
  }

  // Kepelbagaian: penalti tempat baru dimakan.
  final variety = recentPlaceIds.contains(p.placeId) ? 0.2 : 1.0;
  s += variety * w.variety;

  // Buka sekarang (untuk lapar/supper/hujan).
  if (f.openNowPreferred && !p.isOpen) s -= 0.4;

  // Penalti tag / radius maksimum.
  if (f.penaltyTags.any((t) => cuisine.contains(t))) s -= 0.3;
  if (f.maxRadiusKm != null && p.distanceKm > f.maxRadiusKm!) s -= 0.5;

  return s;
}

/// Susun semula senarai tempat ikut niat mood (client-side).
/// Tidak menukar skor backend; hanya susunan paparan + surprise shuffle.
List<PlaceSummary> applyMoodRanking(
  List<PlaceSummary> places, {
  required String moodId,
  required int radiusKm,
  List<String> recentPlaceIds = const [],
}) {
  if (places.length < 2) return places;
  final f = moodFormulaFor(moodId);
  final recent = recentPlaceIds.toSet();
  final r = radiusKm > 0 ? radiusKm.toDouble() : 5.0;

  final scored = places
      .map((p) => (
            p,
            _scorePlace(p, f, radiusKm: r, recentPlaceIds: recent),
          ))
      .toList()
    ..sort((a, b) => b.$2.compareTo(a.$2));

  var result = scored.map((e) => e.$1).toList();

  // Surprise: kocok ringan antara 5 teratas supaya tak asyik sama,
  // tapi cukup stabil.
  if (f.allowLightRandomization && result.length > 3) {
    final take = math.min(5, result.length);
    final top = result.take(take).toList()..shuffle();
    result = [...top, ...result.skip(take)];
  }
  return result;
}

/// Kunci l10n sebab padanan mood (2-3 sebab mesra, tiada dakwaan palsu).
List<String> moodReasonKeys(
  String? moodId,
  PlaceSummary place, {
  int radiusKm = 5,
}) {
  final f = moodFormulaFor(moodId);
  final cuisine = place.cuisine.toLowerCase();
  final reasons = <String>[];

  switch (f.category) {
    case MoodCategory.proximity:
      reasons.add(place.distanceKm <= radiusKm * 0.5
          ? 'nearLocation'
          : 'reasonMoodMatch');
      break;
    case MoodCategory.quality:
      reasons.add(place.rating >= 4.3 ? 'highRating' : 'reasonMoodMatch');
      break;
    case MoodCategory.budget:
      reasons.add(place.priceLevel <= 2 ? 'withinBudget' : 'reasonMoodMatch');
      break;
    case MoodCategory.vibe:
      reasons.add(f.boostTags.any((t) => cuisine.contains(t))
          ? 'reasonCafeVibe'
          : 'reasonMoodMatch');
      break;
    case MoodCategory.health:
      reasons.add(_kHealthyTags.any((t) => cuisine.contains(t))
          ? 'reasonHealthier'
          : 'reasonMoodMatch');
      break;
    case MoodCategory.spicy:
      reasons.add(f.boostTags.any((t) => cuisine.contains(t))
          ? 'reasonSpicy'
          : 'reasonMoodMatch');
      break;
    case MoodCategory.hunger:
      reasons.add(place.isOpen ? 'reasonFilling' : 'reasonMoodMatch');
      break;
    case MoodCategory.timing:
      // Phase 2.3C — "Perfect for supper" (kuat) HANYA dengan bukti: cuisine/tag
      // serasi-supper + waktu operasi disahkan + buka. Jika tidak → berpada
      // "Matches your Supper mood" (elak dakwaan terlalu pasti pada masa bukan-supper).
      final hoursVerified = !place.negativeSignals.contains('hours_unverified');
      final supperEvidence = f.boostTags.any((t) => cuisine.contains(t));
      reasons.add((place.isOpen && hoursVerified && supperEvidence)
          ? 'reasonSupper'
          : 'reasonSupperBounded');
      break;
    case MoodCategory.variety:
      reasons.add('reasonSurprise');
      break;
  }

  // Sebab kedua ringan (jarak dekat) jika berkaitan & belum ada.
  if (place.distanceKm <= radiusKm * 0.4 &&
      !reasons.contains('nearLocation')) {
    reasons.add('nearLocation');
  }
  return reasons.take(2).toList();
}
