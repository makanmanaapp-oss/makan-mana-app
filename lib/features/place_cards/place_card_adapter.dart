/// PART 1 Phase 1.9 — penyesuai (adapter) legasi -> kad kanonikal.
///
/// Menukar `PlaceSummary` sedia ada kepada `PlaceCardViewModel` dengan
/// peraturan JUJUR. TIADA pengiraan skor baharu.
///
/// KOMPROMI LEGASI (didokumen — rujuk docs/MAKANMANA_PART1_CANONICAL_CARDS.md):
/// 1. `PlaceSummary.rating` = 0 apabila data tiada (Google absent). Kami TIDAK
///    dapat bezakan "0 sebenar" dari "hilang", jadi rating <= 0 -> null (sembunyi).
/// 2. `PlaceSummary.priceEstimate` ialah julat RM yang DISIMPULKAN (F-05). Kami
///    TIDAK dakwa verified — dipetakan ke `estimatedRange` (berlabel Anggaran);
///    kosong -> unknown.
/// 3. `PlaceSummary.isOpen` default `true` walau waktu tidak diketahui (F-04).
///    Kami TIDAK dapat buktikan "buka" dari legasi: isOpen==false -> closedNow;
///    isOpen==true -> hoursUnknown (berhati-hati, bukan openNow).
/// 4. `matchScore` hanya dipetakan bila `fromRecommendation == true`.
library;

import '../../models/place_summary.dart';
import 'place_card_view_model.dart';

/// Konteks kad (menentukan tindakan yang tersedia).
enum PlaceCardContext { nearby, aiPick, suggestion, explore, map, saved, history }

class PlaceCardAdapterOptions {
  const PlaceCardAdapterOptions({
    this.context = PlaceCardContext.nearby,
    this.fromRecommendation = false,
    this.suggestionId,
    this.sessionId,
  });

  final PlaceCardContext context;

  /// true bila matchScore/reasons datang daripada respons cadangan (Part 2).
  final bool fromRecommendation;
  final String? suggestionId;
  final String? sessionId;
}

CardSourceMode _sourceMode(PlaceSummary p) {
  if (p.isSample) return CardSourceMode.sample;
  switch (p.source) {
    case 'firestore_cache':
      return CardSourceMode.approvedCache;
    case 'community':
      return CardSourceMode.community;
    default:
      return CardSourceMode.live;
  }
}

CardRatingModel _rating(PlaceSummary p) {
  if (p.rating <= 0) return CardRatingModel.none; // 0 dari data hilang -> sembunyi
  return CardRatingModel(
    rating: p.rating,
    reviewCount: p.userRatingCount > 0 ? p.userRatingCount : null,
  );
}

CardPriceModel _price(PlaceSummary p) {
  final label = p.priceEstimate.trim();
  if (label.isEmpty) return CardPriceModel.unknown;
  // Legasi tidak boleh membuktikan verified -> Anggaran.
  return CardPriceModel(state: CardPriceState.estimatedRange, amountLabel: label);
}

CardHoursModel _hours(PlaceSummary p) {
  // isOpen==true tidak boleh dipercayai (default true bila waktu unknown).
  return CardHoursModel(
    state: p.isOpen ? CardHoursState.hoursUnknown : CardHoursState.closedNow,
  );
}

List<CardWarning> _warnings(PlaceSummary p) {
  final out = <CardWarning>[];
  for (final s in p.negativeSignals) {
    switch (s) {
      case 'possible_allergy_conflict':
        out.add(const CardWarning(
          id: 'possible_allergy_conflict',
          severity: 'important',
          labelKey: 'warnAllergyConflict',
          relatedField: 'allergy',
        ));
        break;
      case 'allergy_data_unknown':
        out.add(const CardWarning(
          id: 'allergy_data_unknown',
          severity: 'caution',
          labelKey: 'warnAllergyUnknown',
          relatedField: 'allergy',
        ));
        break;
      case 'possible_non_halal':
        out.add(const CardWarning(
          id: 'possible_non_halal',
          severity: 'important',
          labelKey: 'warnPossibleNonHalal',
          relatedField: 'halal',
        ));
        break;
      case 'price_unknown':
        out.add(const CardWarning(
          id: 'price_unknown',
          severity: 'info',
          labelKey: 'warnPriceUnknown',
          relatedField: 'price',
        ));
        break;
    }
  }
  return out;
}

HalalDisplayState _halal(PlaceSummary p) {
  // Legasi tiada bukti halal kanonikal. Hanya isyarat negatif jujur.
  if (p.negativeSignals.contains('possible_non_halal')) {
    return HalalDisplayState.possibleNonHalal;
  }
  return HalalDisplayState.none;
}

CardActionConfig _actions(PlaceSummary p, PlaceCardContext ctx) {
  if (p.isSample) return CardActionConfig.sampleOnly;
  switch (ctx) {
    case PlaceCardContext.suggestion:
    case PlaceCardContext.aiPick:
      return const CardActionConfig(
        canViewDetails: true,
        canOpenMaps: true,
        canSave: true,
        canShare: true,
        canAccept: true,
        canReject: true,
        canNext: true,
      );
    case PlaceCardContext.saved:
    case PlaceCardContext.history:
      return const CardActionConfig(
        canViewDetails: true,
        canOpenMaps: true,
        canLogMeal: true,
      );
    case PlaceCardContext.nearby:
    case PlaceCardContext.explore:
    case PlaceCardContext.map:
      return const CardActionConfig(canViewDetails: true, canOpenMaps: true);
  }
}

/// Tukar `PlaceSummary` legasi -> `PlaceCardViewModel` kanonikal (jujur).
PlaceCardViewModel placeCardFromSummary(
  PlaceSummary p, {
  PlaceCardAdapterOptions options = const PlaceCardAdapterOptions(),
}) {
  final hasPhoto = p.photoUrl != null && p.photoUrl!.isNotEmpty;
  final matchScore =
      options.fromRecommendation && p.matchScore > 0 ? p.matchScore : null;
  final reasons = options.fromRecommendation
      ? p.matchReasonKeys
          .map((k) => CardReason(id: k, labelKey: k, evidence: 'reported'))
          .toList()
      : const <CardReason>[];

  return PlaceCardViewModel(
    placeId: p.placeId,
    title: p.name.isNotEmpty ? p.name : 'Tempat Makan',
    subtitle: p.address.isNotEmpty ? p.address : null,
    image: CardImageModel(
      url: hasPhoto ? p.photoUrl : null,
      isFallback: !hasPhoto,
      fallbackCategory: p.cuisine.isNotEmpty ? p.cuisine : null,
    ),
    distanceMeters: p.distanceKm > 0 ? p.distanceKm * 1000 : null,
    rating: _rating(p),
    price: _price(p),
    hours: _hours(p),
    cuisineLabels: p.cuisine.isNotEmpty ? [p.cuisine] : const [],
    matchScore: matchScore,
    matchReasons: reasons,
    warnings: _warnings(p),
    halal: _halal(p),
    sourceMode: _sourceMode(p),
    actions: _actions(p, options.context),
    suggestionId: options.suggestionId,
    sessionId: options.sessionId,
  );
}
