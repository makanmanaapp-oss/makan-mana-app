import '../../../core/services/restaurant_profile_v2_service.dart';
import 'restaurant_detail_view_model.dart';

EvidenceLevel _evidence(String value) {
  switch (value) {
    case 'verified':
      return EvidenceLevel.verified;
    case 'reported':
      return EvidenceLevel.reported;
    case 'inferred':
      return EvidenceLevel.inferred;
    default:
      return EvidenceLevel.unknown;
  }
}

FreshnessState _freshness(String value) {
  switch (value) {
    case 'fresh':
      return FreshnessState.fresh;
    case 'stale':
    case 'aging':
      return FreshnessState.stale;
    case 'expired':
      return FreshnessState.expired;
    default:
      return FreshnessState.unknown;
  }
}

CardBusinessState _business(String value) {
  switch (value) {
    case 'operating':
    case 'active':
      return CardBusinessState.active;
    case 'temporarily_closed':
      return CardBusinessState.temporarilyClosed;
    case 'permanently_closed':
      return CardBusinessState.permanentlyClosed;
    case 'moved':
      return CardBusinessState.moved;
    case 'blocked':
      return CardBusinessState.blocked;
    case 'hidden':
    case 'hidden_by_admin':
      return CardBusinessState.hidden;
    default:
      return CardBusinessState.unknown;
  }
}

CardHoursState _hours(String value) {
  switch (value) {
    case 'hours_expired':
    case 'expired':
      return CardHoursState.hoursExpired;
    case 'temporarily_closed':
      return CardHoursState.temporarilyClosed;
    case 'permanently_closed':
      return CardHoursState.permanentlyClosed;
    case 'blocked':
      return CardHoursState.blocked;
    case 'status_unknown':
      return CardHoursState.statusUnknown;
    case 'hours_known':
    case 'known':
      // The public DTO intentionally does not claim open-now without a trusted
      // timezone/current-time calculation. Known schedule remains honest but
      // the status chip stays neutral.
      return CardHoursState.hoursUnknown;
    default:
      return CardHoursState.hoursUnknown;
  }
}

HalalDisplayState _halal(String value) {
  switch (value) {
    case 'halal_certified':
    case 'certified':
      return HalalDisplayState.certified;
    case 'halal_merchant_claimed':
    case 'merchant_claimed':
      return HalalDisplayState.merchantClaimed;
    case 'halal_community_reported':
    case 'community_reported':
      return HalalDisplayState.communityReported;
    case 'halal_possible_non_halal':
    case 'possible_non_halal':
      return HalalDisplayState.possibleNonHalal;
    case 'halal_recheck_required':
      return HalalDisplayState.recheckRequired;
    case 'halal_unknown':
    case 'unknown':
      return HalalDisplayState.unknown;
    default:
      return HalalDisplayState.none;
  }
}

CardPriceModel _price(PublicRestaurantProfileV2 profile) {
  final spend = profile.averageSpend;
  final currency = profile.currency == 'MYR' || profile.currency == null
      ? 'RM'
      : profile.currency!;
  final amount = spend == null
      ? null
      : '$currency${spend == spend.roundToDouble() ? spend.toInt() : spend.toStringAsFixed(2)}';

  switch (profile.priceState) {
    case 'price_verified':
    case 'verified':
      return CardPriceModel(
        state: amount == null
            ? CardPriceState.verifiedRange
            : CardPriceState.verifiedAverage,
        amountLabel: amount,
      );
    case 'estimated_price':
    case 'estimated':
      return CardPriceModel(
        state: CardPriceState.estimatedRange,
        amountLabel: amount,
      );
    case 'price_expired':
    case 'expired':
      return const CardPriceModel(state: CardPriceState.expired);
    default:
      if (profile.priceBandId != null && profile.priceBandId!.isNotEmpty) {
        return const CardPriceModel(state: CardPriceState.providerBand);
      }
      return CardPriceModel.unknown;
  }
}

List<CardWarning> _warnings(PublicRestaurantProfileV2 profile) {
  final out = <CardWarning>[];
  for (final warning in profile.warnings) {
    switch (warning) {
      case 'hours_expired':
      case 'hours_stale':
        out.add(CardWarning(
          id: warning,
          severity: 'caution',
          labelKey: 'hoursExpired',
          relatedField: 'hours',
        ));
        break;
      case 'price_expired':
        out.add(const CardWarning(
          id: 'price_expired',
          severity: 'caution',
          labelKey: 'priceExpired',
          relatedField: 'price',
        ));
        break;
      case 'rating_stale':
        out.add(const CardWarning(
          id: 'rating_stale',
          severity: 'info',
          labelKey: 'ratingUnavailable',
          relatedField: 'rating',
        ));
        break;
      case 'halal_recheck_required':
        out.add(const CardWarning(
          id: 'halal_recheck_required',
          severity: 'important',
          labelKey: 'halalRecheckRequired',
          relatedField: 'halal',
        ));
        break;
    }
  }
  return out;
}

List<String> _tagFamily(PublicRestaurantProfileV2 profile, String family) {
  return profile.tags
      .where((tag) => tag['family']?.toString() == family)
      .map((tag) => tag['tagId']?.toString().trim() ?? '')
      .where((tag) => tag.isNotEmpty)
      .toList(growable: false);
}

String? _lastVerifiedLabel(dynamic value) {
  if (value is num) {
    final date = DateTime.fromMillisecondsSinceEpoch(value.toInt()).toLocal();
    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/${date.year}';
  }
  if (value is String && value.trim().isNotEmpty) return value.trim();
  return null;
}

RestaurantDetailViewModel restaurantDetailFromPublicProfile(
  PublicRestaurantProfileV2 profile,
) {
  final media = profile.media.map((item) {
    final url = item['url']?.toString().trim();
    final fallback = item['isFallback'] == true;
    return DetailImageItem(
      image: CardImageModel(
        url: url?.isNotEmpty == true ? url : null,
        isFallback: fallback || url?.isNotEmpty != true,
        fallbackCategory: profile.primaryCategory,
      ),
    );
  }).toList(growable: false);

  final gallery = media.isEmpty
      ? DetailGallery(images: [
          DetailImageItem(
            image: CardImageModel(
              isFallback: true,
              fallbackCategory: profile.primaryCategory,
            ),
          ),
        ])
      : DetailGallery(images: media);

  final ratingVisible = profile.ratingState == 'rating_shown' &&
      profile.rating != null &&
      profile.rating! > 0;
  final rating = ratingVisible
      ? CardRatingModel(
          rating: profile.rating,
          reviewCount:
              profile.reviewCount != null && profile.reviewCount! > 0
                  ? profile.reviewCount
                  : null,
          stale: profile.ratingState == 'rating_stale',
        )
      : CardRatingModel.none;

  final cuisine = profile.cuisineTags.isNotEmpty
      ? profile.cuisineTags
      : _tagFamily(profile, 'cuisine');
  final service = profile.serviceModes.isNotEmpty
      ? profile.serviceModes
      : _tagFamily(profile, 'service');
  final placeTypes = _tagFamily(profile, 'place_type');
  final ambience = _tagFamily(profile, 'ambience');
  final mealSlots = _tagFamily(profile, 'meal_slot');
  final health = _tagFamily(profile, 'health');
  final spice = _tagFamily(profile, 'spice');
  final portion = _tagFamily(profile, 'portion');
  final speed = _tagFamily(profile, 'speed');

  final warnings = _warnings(profile);
  final freshness = _freshness(profile.freshnessState);
  final lastVerified = _lastVerifiedLabel(profile.lastVerifiedAt);

  return RestaurantDetailViewModel(
    placeId: profile.canonicalPlaceId,
    publicationVersion: profile.publicationVersion,
    title: profile.name,
    subtitle: profile.branchName ?? profile.primaryCategory,
    description: profile.editorialDescription ?? profile.description,
    sourceMode: CardSourceMode.approvedCache,
    gallery: gallery,
    businessState: _business(profile.businessState),
    hours: DetailHours(
      model: CardHoursModel(state: _hours(profile.hoursState)),
      lastVerifiedLabel: lastVerified,
    ),
    rating: rating,
    reviewCount: rating.reviewCount,
    price: _price(profile),
    location: LocationInfo(
      address: profile.address ?? '',
      locality: profile.locality,
      postalCode: profile.postalCode,
      latitude: profile.latitude,
      longitude: profile.longitude,
    ),
    contact: ContactInfo(
      phone: profile.phone,
      website: profile.website,
    ),
    cuisineTagIds: cuisine,
    placeTypeTagIds: placeTypes,
    serviceTagIds: service,
    ambienceTagIds: ambience,
    mealSlotTagIds: mealSlots,
    healthTagIds: health,
    spiceTagIds: spice,
    portionTagIds: portion,
    speedTagIds: speed,
    cuisineLabels: cuisine,
    placeTypeLabels: placeTypes,
    serviceLabels: service,
    ambienceLabels: ambience,
    dietaryStates: profile.dietaryReported
        .map((tag) => DietarySuitability(
              tagId: tag,
              evidence: _evidence(profile.halalEvidenceLevel == 'unknown'
                  ? 'reported'
                  : profile.halalEvidenceLevel),
            ))
        .toList(growable: false),
    allergenStates: profile.allergenReported
        .map((tag) => AllergenEvidence(
              allergenId: tag,
              presence: AllergenPresence.present,
              evidence: _evidence(profile.allergenEvidenceLevel),
            ))
        .toList(growable: false),
    halalState: _halal(profile.halalState),
    dishHighlights: profile.signatureDishes
        .map((dish) => DishHighlight(name: dish))
        .toList(growable: false),
    verificationBadges: profile.verificationStatus == 'merchant_verified' ||
            profile.verificationStatus == 'admin_verified'
        ? [
            CardBadge(
              id: profile.verificationStatus,
              labelKey: profile.verificationStatus == 'admin_verified'
                  ? 'adminVerifiedLabel'
                  : 'merchantVerifiedLabel',
            ),
          ]
        : const [],
    warnings: warnings,
    freshness: FreshnessSummary(
      state: freshness,
      warnings: warnings,
    ),
    provenance: ProvenanceSummary(
      sourceMode: CardSourceMode.approvedCache,
      lastUpdatedLabel: lastVerified,
      lastVerifiedLabel: lastVerified,
      verificationLevelKey: profile.verificationStatus,
    ),
    actions: DetailActionConfig(
      canOpenMaps: profile.latitude != null && profile.longitude != null,
      canSave: true,
      canShare: true,
      canCall: profile.phone?.trim().isNotEmpty == true,
      canOpenWebsite: profile.website?.trim().isNotEmpty == true,
      canLogMeal: true,
      canRate: true,
    ),
    isBlocked: _business(profile.businessState) == CardBusinessState.blocked,
  );
}
