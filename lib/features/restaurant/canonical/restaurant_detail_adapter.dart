/// PART 1 Phase 1.10 — penyesuai (adapter) legasi -> Butiran Kedai kanonikal.
///
/// Menukar `PlaceSummary` legasi kepada `RestaurantDetailViewModel` dengan
/// peraturan JUJUR yang SAMA seperti kad Phase 1.9. TIADA skor dikira.
///
/// KOMPROMI LEGASI (didokumen — rujuk
/// docs/MAKANMANA_PART1_CANONICAL_RESTAURANT_DETAIL.md):
///  1. `rating <= 0` -> null (data hilang, bukan 0 sebenar).
///  2. `userRatingCount == 0` -> null (JANGAN reka kiraan ulasan).
///  3. `priceEstimate` kosong -> unknown; ada -> estimatedRange (Anggaran).
///  4. `isOpen == true` -> hoursUnknown (legasi tidak buktikan "buka").
///  5. `isOpen == false` -> closedNow (satu-satunya isyarat legasi tersedia;
///     selaras adapter kad Phase 1.9 yang diluluskan).
///  6. Tiada bukti halal kanonikal -> possibleNonHalal (jika isyarat negatif)
///     atau none. TIDAK memapar certified/merchant/community tanpa bukti.
///  7. `possible_allergy_conflict` -> AllergenEvidence(unknown) + amaran caution;
///     ketiadaan data alergen TIDAK PERNAH dipapar sebagai "selamat".
///  8. Tiada telefon/laman web dalam PlaceSummary -> ContactInfo.none.
///  9. `matchReasons` hanya bila `fromRecommendation == true`; tiada skor tempatan.
/// 10. `placeId` stabil DIKEKALKAN untuk semua tindakan.
library;

import '../../../core/mood/availability_label.dart';
import '../../../models/place_summary.dart';
import 'restaurant_detail_view_model.dart';

class RestaurantDetailAdapterOptions {
  const RestaurantDetailAdapterOptions({
    this.fromRecommendation = false,
    this.isFavorite = false,
    this.suggestionId,
    this.sessionId,
  });

  final bool fromRecommendation;
  final bool isFavorite;
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
  if (p.rating <= 0) return CardRatingModel.none;
  return CardRatingModel(
    rating: p.rating,
    reviewCount: p.userRatingCount > 0 ? p.userRatingCount : null,
  );
}

CardPriceModel _price(PlaceSummary p) {
  final label = p.priceEstimate.trim();
  if (label.isEmpty) return CardPriceModel.unknown;
  return CardPriceModel(state: CardPriceState.estimatedRange, amountLabel: label);
}

/// Availability for the canonical detail page.
///
/// FOUND ON A REAL DEVICE: a featured shop opened a page showing a red "Tutup"
/// pill directly above the line "Waktu operasi belum disahkan". The page
/// asserted the restaurant was CLOSED and admitted, three lines down, that it
/// had no evidence for it.
///
/// The cause was the `false` branch. `place_details` carries no opening hours
/// at all, so a place with unverified hours arrives here with `isOpen: false` —
/// which is an ABSENCE of evidence, not evidence of closure — and was reported
/// as `closedNow`.
///
/// The `true` branch is deliberately LEFT ALONE. Legacy `isOpen` comes from a
/// cached provider snapshot and is not trusted enough to claim "open now" on
/// this page; downgrading it to `hoursUnknown` is an existing, intentional
/// decision (see restaurant_detail_test.dart, "isOpen true -> hoursUnknown").
/// The bug was never that conservatism — it was that the same doubt was not
/// applied to the closed direction.
CardHoursModel _hours(PlaceSummary p) {
  // Evidence first: unverified hours can never become a claim, in either
  // direction. `availabilityDisplay` is the documented single source of truth
  // for that question, so the page and the cards cannot drift apart.
  if (availabilityDisplay(p) == AvailabilityDisplay.hoursNotVerified) {
    return const CardHoursModel(state: CardHoursState.hoursUnknown);
  }
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
  if (p.negativeSignals.contains('possible_non_halal')) {
    return HalalDisplayState.possibleNonHalal;
  }
  return HalalDisplayState.none; // tiada bukti -> tiada dakwaan
}

List<AllergenEvidence> _allergens(PlaceSummary p) {
  // Ketiadaan data TIDAK bermakna selamat. Konflik -> unknown + caution.
  if (p.negativeSignals.contains('possible_allergy_conflict') ||
      p.negativeSignals.contains('allergy_data_unknown')) {
    return const [
      AllergenEvidence(
        allergenId: 'unspecified',
        presence: AllergenPresence.unknown,
        evidence: EvidenceLevel.inferred,
      ),
    ];
  }
  return const [];
}

DetailActionConfig _actions(PlaceSummary p) {
  if (p.isSample) return DetailActionConfig.sampleOnly;
  return const DetailActionConfig(
    canOpenMaps: true,
    canSave: true,
    canShare: true,
    canLogMeal: true,
    canRate: true,
  );
}

/// Tukar `PlaceSummary` legasi -> `RestaurantDetailViewModel` kanonikal (jujur).
RestaurantDetailViewModel restaurantDetailFromSummary(
  PlaceSummary p, {
  RestaurantDetailAdapterOptions options =
      const RestaurantDetailAdapterOptions(),
}) {
  final hasPhoto = p.photoUrl != null && p.photoUrl!.isNotEmpty;
  final image = CardImageModel(
    url: hasPhoto ? p.photoUrl : null,
    isFallback: !hasPhoto,
    fallbackCategory: p.cuisine.isNotEmpty ? p.cuisine : null,
  );
  final gallery = DetailGallery(
    images: [DetailImageItem(image: image, isSample: p.isSample)],
  );

  final reasons = options.fromRecommendation
      ? p.matchReasonKeys
          .map((k) => CardReason(id: k, labelKey: k, evidence: 'reported'))
          .toList()
      : const <CardReason>[];

  final warnings = _warnings(p);

  return RestaurantDetailViewModel(
    placeId: p.placeId,
    title: p.name.isNotEmpty ? p.name : 'Tempat Makan',
    subtitle: p.cuisine.isNotEmpty ? p.cuisine : null,
    sourceMode: _sourceMode(p),
    gallery: gallery,
    businessState: CardBusinessState.active,
    hours: DetailHours(model: _hours(p)),
    rating: _rating(p),
    reviewCount: p.userRatingCount > 0 ? p.userRatingCount : null,
    price: _price(p),
    location: LocationInfo(
      address: p.address,
      distanceMeters: p.distanceKm > 0 ? p.distanceKm * 1000 : null,
    ),
    contact: ContactInfo.none, // legasi tiada telefon/laman web
    cuisineLabels: p.cuisine.isNotEmpty ? [p.cuisine] : const [],
    allergenStates: _allergens(p),
    halalState: _halal(p),
    warnings: warnings,
    freshness: FreshnessSummary(
      state: warnings.isEmpty ? FreshnessState.unknown : FreshnessState.stale,
      warnings: warnings,
    ),
    provenance: ProvenanceSummary(
      sourceMode: _sourceMode(p),
      verificationLevelKey: _sourceMode(p) == CardSourceMode.approvedCache
          ? 'cachedApprovedLabel'
          : null,
    ),
    actions: _actions(p),
    matchReasons: reasons,
    suggestionId: options.suggestionId,
    sessionId: options.sessionId,
  );
}
