import 'package:cloud_functions/cloud_functions.dart';

import '../constants/app_constants.dart';

class RestaurantProfileV2Service {
  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  Map<String, dynamic> _map(dynamic value) {
    if (value is Map) {
      return value.map((key, item) => MapEntry(key.toString(), item));
    }
    return <String, dynamic>{};
  }

  Future<PublicRestaurantProfileV2?> getPublishedProfile(String placeId) async {
    final clean = placeId.trim();
    if (clean.isEmpty) return null;

    try {
      final result = await _functions
          .httpsCallable('getRestaurantProfileV2')
          .call<Map<dynamic, dynamic>>({'placeId': clean});
      final root = _map(result.data);
      final rawProfile = root['profile'];
      if (rawProfile is! Map) return null;
      return PublicRestaurantProfileV2.fromMap(_map(rawProfile));
    } on FirebaseFunctionsException {
      return null;
    } catch (_) {
      return null;
    }
  }
}

class PublicRestaurantProfileV2 {
  const PublicRestaurantProfileV2({
    required this.canonicalPlaceId,
    required this.publicationVersion,
    required this.name,
    required this.cuisineTags,
    required this.foodTags,
    required this.signatureDishes,
    required this.serviceModes,
    required this.amenities,
    required this.tags,
    required this.priceState,
    required this.businessState,
    required this.hoursState,
    required this.ratingState,
    required this.halalState,
    required this.halalEvidenceLevel,
    required this.dietaryReported,
    required this.allergenReported,
    required this.allergenEvidenceLevel,
    required this.media,
    required this.verificationStatus,
    required this.freshnessState,
    required this.warnings,
    this.menuItems = const [],
    this.openingHours = const {},
    this.openingPeriods = const [],
    this.specialHours = const [],
    this.officialName,
    this.branchName,
    this.description,
    this.editorialDescription,
    this.address,
    this.locality,
    this.state,
    this.postalCode,
    this.latitude,
    this.longitude,
    this.phone,
    this.whatsapp,
    this.website,
    this.instagram,
    this.facebook,
    this.tiktok,
    this.primaryCategory,
    this.priceBandId,
    this.averageSpend,
    this.currency,
    this.rating,
    this.reviewCount,
    this.temporaryClosedFrom,
    this.temporaryClosedUntil,
    this.lastVerifiedAt,
  });

  factory PublicRestaurantProfileV2.fromMap(Map<String, dynamic> map) {
    String? text(String key) {
      final value = map[key];
      if (value is! String) return null;
      final clean = value.trim();
      return clean.isEmpty ? null : clean;
    }

    double? number(String key) {
      final value = map[key];
      return value is num ? value.toDouble() : null;
    }

    int? integer(String key) {
      final value = map[key];
      return value is num ? value.toInt() : null;
    }

    List<String> strings(String key) {
      final value = map[key];
      if (value is! List) return const [];
      return value
          .whereType<String>()
          .map((item) => item.trim())
          .where((item) => item.isNotEmpty)
          .toList(growable: false);
    }

    List<Map<String, dynamic>> objects(String key) {
      final value = map[key];
      if (value is! List) return const [];
      return value
          .whereType<Map>()
          .map((item) => item.map(
                (key, value) => MapEntry(key.toString(), value),
              ))
          .toList(growable: false);
    }

    Map<String, dynamic> object(String key) {
      final value = map[key];
      if (value is! Map) return const {};
      return value.map((key, value) => MapEntry(key.toString(), value));
    }

    List<dynamic> values(String key) {
      final value = map[key];
      return value is List ? List<dynamic>.unmodifiable(value) : const [];
    }

    final canonicalPlaceId = text('canonicalPlaceId') ?? '';
    final name = text('name') ?? '';
    if (canonicalPlaceId.isEmpty || name.isEmpty) {
      throw const FormatException('restaurant_profile_v2_invalid');
    }

    return PublicRestaurantProfileV2(
      canonicalPlaceId: canonicalPlaceId,
      publicationVersion: integer('publicationVersion') ?? 1,
      name: name,
      officialName: text('officialName'),
      branchName: text('branchName'),
      description: text('description'),
      editorialDescription: text('editorialDescription'),
      address: text('address'),
      locality: text('locality'),
      state: text('state'),
      postalCode: text('postalCode'),
      latitude: number('latitude'),
      longitude: number('longitude'),
      phone: text('phone'),
      whatsapp: text('whatsapp'),
      website: text('website'),
      instagram: text('instagram'),
      facebook: text('facebook'),
      tiktok: text('tiktok'),
      primaryCategory: text('primaryCategory'),
      cuisineTags: strings('cuisineTags'),
      foodTags: strings('foodTags'),
      signatureDishes: strings('signatureDishes'),
      menuItems: objects('menuItems'),
      serviceModes: strings('serviceModes'),
      amenities: strings('amenities'),
      tags: objects('tags'),
      priceState: text('priceState') ?? 'price_unknown',
      priceBandId: text('priceBandId'),
      averageSpend: number('averageSpend'),
      currency: text('currency'),
      businessState: text('businessState') ?? 'status_unknown',
      hoursState: text('hoursState') ?? 'hours_unknown',
      openingHours: object('openingHours'),
      openingPeriods: objects('openingPeriods'),
      specialHours: values('specialHours'),
      temporaryClosedFrom: text('temporaryClosedFrom'),
      temporaryClosedUntil: text('temporaryClosedUntil'),
      ratingState: text('ratingState') ?? 'rating_hidden',
      rating: number('rating'),
      reviewCount: integer('reviewCount'),
      halalState: text('halalState') ?? 'halal_unknown',
      halalEvidenceLevel: text('halalEvidenceLevel') ?? 'unknown',
      dietaryReported: strings('dietaryReported'),
      allergenReported: strings('allergenReported'),
      allergenEvidenceLevel: text('allergenEvidenceLevel') ?? 'unknown',
      media: objects('media'),
      verificationStatus: text('verificationStatus') ?? 'unverified',
      freshnessState: text('freshnessState') ?? 'unknown',
      warnings: strings('warnings'),
      lastVerifiedAt: map['lastVerifiedAt'],
    );
  }

  final String canonicalPlaceId;
  final int publicationVersion;
  final String name;
  final String? officialName;
  final String? branchName;
  final String? description;
  final String? editorialDescription;
  final String? address;
  final String? locality;
  final String? state;
  final String? postalCode;
  final double? latitude;
  final double? longitude;
  final String? phone;
  final String? whatsapp;
  final String? website;
  final String? instagram;
  final String? facebook;
  final String? tiktok;
  final String? primaryCategory;
  final List<String> cuisineTags;
  final List<String> foodTags;
  final List<String> signatureDishes;
  final List<Map<String, dynamic>> menuItems;
  final List<String> serviceModes;
  final List<String> amenities;
  final List<Map<String, dynamic>> tags;
  final String priceState;
  final String? priceBandId;
  final double? averageSpend;
  final String? currency;
  final String businessState;
  final String hoursState;
  final Map<String, dynamic> openingHours;
  final List<Map<String, dynamic>> openingPeriods;
  final List<dynamic> specialHours;
  final String? temporaryClosedFrom;
  final String? temporaryClosedUntil;
  final String ratingState;
  final double? rating;
  final int? reviewCount;
  final String halalState;
  final String halalEvidenceLevel;
  final List<String> dietaryReported;
  final List<String> allergenReported;
  final String allergenEvidenceLevel;
  final List<Map<String, dynamic>> media;
  final String verificationStatus;
  final String freshnessState;
  final List<String> warnings;
  final dynamic lastVerifiedAt;
}
