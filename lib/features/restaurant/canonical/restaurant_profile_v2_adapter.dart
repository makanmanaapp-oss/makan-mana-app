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
      // Known schedule is safe to show, but open-now is not claimed without a
      // trusted timezone/current-time calculation.
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
          labelKey: 'priceRecheck',
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
          labelKey: 'halalRecheck',
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

Map<String, dynamic> _object(dynamic value) {
  if (value is! Map) return const {};
  return value.map((key, item) => MapEntry(key.toString(), item));
}

String? _text(dynamic value) {
  if (value is! String) return null;
  final clean = value.trim();
  return clean.isEmpty ? null : clean;
}

List<DetailMenuItem> _menuItems(PublicRestaurantProfileV2 profile) {
  final out = <DetailMenuItem>[];
  for (var index = 0; index < profile.menuItems.length && out.length < 200; index++) {
    final item = profile.menuItems[index];
    final section = _text(item['section']);
    final name = _text(item['name']);
    if ((section != 'makanan' && section != 'minuman') || name == null) continue;
    final rawPrice = item['price'];
    final price = rawPrice is num && rawPrice >= 0 ? rawPrice.toDouble() : null;
    final rawSort = item['sortOrder'];
    final sortOrder = rawSort is num ? rawSort.toInt() : index * 10;
    final imageUrl = _text(item['imageUrl']);
    out.add(DetailMenuItem(
      id: _text(item['id']) ?? 'menu-$section-${index + 1}',
      section: section!,
      category: _text(item['category']),
      name: name,
      description: _text(item['description']),
      price: price,
      currency: _text(item['currency']) ?? 'MYR',
      available: item['available'] != false,
      imageUrl: imageUrl != null &&
              (imageUrl.startsWith('https://') || imageUrl.startsWith('http://'))
          ? imageUrl
          : null,
      sortOrder: sortOrder,
    ));
  }
  out.sort((left, right) {
    final sectionOrder = left.section.compareTo(right.section);
    if (sectionOrder != 0) return sectionOrder;
    final sort = left.sortOrder.compareTo(right.sortOrder);
    return sort != 0 ? sort : left.name.compareTo(right.name);
  });
  return out;
}

const _dayKeys = <(String, String)>[
  ('monday', 'dayMonday'),
  ('tuesday', 'dayTuesday'),
  ('wednesday', 'dayWednesday'),
  ('thursday', 'dayThursday'),
  ('friday', 'dayFriday'),
  ('saturday', 'daySaturday'),
  ('sunday', 'daySunday'),
];

String? _clock(dynamic value) {
  final clean = _text(value);
  if (clean == null ||
      !RegExp(r'^(?:[01]\d|2[0-3]):[0-5]\d$').hasMatch(clean)) {
    return null;
  }
  return clean;
}

List<DetailDayHours> _weeklyHours(PublicRestaurantProfileV2 profile) {
  final hours = profile.openingHours;
  if (hours.isEmpty) return const [];
  final result = <DetailDayHours>[];

  for (final (day, labelKey) in _dayKeys) {
    final entry = _object(hours[day]);
    if (entry.isEmpty) continue;
    if (entry['closed'] == true) {
      result.add(DetailDayHours(dayLabelKey: labelKey, hoursLabel: '__closed__'));
      continue;
    }
    if (entry['all_day'] == true || entry['allDay'] == true) {
      result.add(DetailDayHours(dayLabelKey: labelKey, hoursLabel: '__24h__'));
      continue;
    }
    final rawSessions = entry['sessions'];
    if (rawSessions is! List) continue;
    final labels = <String>[];
    for (final raw in rawSessions.take(2)) {
      final session = _object(raw);
      final open = _clock(session['open']);
      final close = _clock(session['close']);
      if (open != null && close != null) labels.add('$open – $close');
    }
    if (labels.isNotEmpty) {
      // `||` is a presentation-neutral marker. The UI inserts the localized
      // "Rehat / Break" label between two sessions.
      result.add(DetailDayHours(
        dayLabelKey: labelKey,
        hoursLabel: labels.join('||'),
      ));
    }
  }
  return result;
}

MenuSummary _menuSummary(List<DetailMenuItem> items) {
  if (items.isEmpty) return MenuSummary.none;
  final prices = items
      .where((item) => item.available && item.price != null)
      .map((item) => item.price!)
      .toList(growable: false);
  final from = prices.isEmpty
      ? null
      : 'RM ${prices.reduce((left, right) => left < right ? left : right).toStringAsFixed(2)}';
  return MenuSummary(
    itemCount: items.length,
    fromPriceLabel: from,
    available: items.any((item) => item.available),
  );
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
  final menuItems = _menuItems(profile);

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
      weeklySchedule: _weeklyHours(profile),
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
              evidence: EvidenceLevel.reported,
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
    menuItems: menuItems,
    menuSummary: _menuSummary(menuItems),
    verificationBadges: const [],
    warnings: warnings,
    freshness: FreshnessSummary(
      state: freshness,
      warnings: warnings,
    ),
    provenance: ProvenanceSummary(
      sourceMode: CardSourceMode.approvedCache,
      lastUpdatedLabel: lastVerified,
      lastVerifiedLabel: lastVerified,
      verificationLevelKey: null,
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
