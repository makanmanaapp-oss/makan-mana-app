/// PART 1 Phase 1.9 — model paparan kad kedai KANONIKAL (immutable).
///
/// Satu sumber kebenaran paparan untuk SEMUA kad kedai. Model ini TIDAK
/// mengira skor cadangan; ia hanya memapar payload jujur. `matchScore` hanya
/// diisi bila DIBEKALKAN oleh respons cadangan (Part 2), bukan dikira di sini.
///
/// Peraturan kejujuran teras (baiki F-03/F-04/F-05 audit Phase 1.1):
/// - rating tiada  -> null (JANGAN papar 0.0)
/// - harga tidak diketahui -> unknown (JANGAN reka julat RM)
/// - waktu tidak diketahui  -> hoursUnknown (JANGAN papar "buka")
/// - halal/alahan ikut BUKTI (tiada dakwaan "selamat" tanpa bukti disahkan)
library;

import 'package:flutter/foundation.dart';

/// Keadaan paparan harga (rujuk PDF §14.1 + Phase 1.2 priceState).
enum CardPriceState {
  verifiedAverage,
  verifiedRange,
  menuFromPrice,
  providerBand,
  estimatedRange,
  unknown,
  expired,
}

/// Keadaan waktu/operasi (rujuk PDF §14.3).
enum CardHoursState {
  openNow,
  closedNow,
  hoursUnknown,
  hoursExpired,
  temporarilyClosed,
  permanentlyClosed,
  statusUnknown,
  blocked,
}

/// Keadaan perniagaan (status kedai).
enum CardBusinessState {
  active,
  temporarilyClosed,
  permanentlyClosed,
  moved,
  hidden,
  blocked,
  unknown,
}

/// Sumber data kad (untuk label jujur sample vs live).
enum CardSourceMode { live, approvedCache, community, sample }

/// Keadaan paparan halal (ikut bukti; wording di lapisan l10n).
enum HalalDisplayState {
  certified,
  merchantClaimed,
  communityReported,
  unknown,
  possibleNonHalal,
  recheckRequired,
  none,
}

@immutable
class CardImageModel {
  const CardImageModel({
    this.url,
    this.isFallback = false,
    this.fallbackCategory,
    this.semanticLabelKey = 'placePhotoSemantic',
  });

  final String? url;
  final bool isFallback;
  final String? fallbackCategory;
  final String semanticLabelKey;

  bool get hasApprovedImage => url != null && url!.isNotEmpty && !isFallback;
}

@immutable
class CardRatingModel {
  const CardRatingModel({this.rating, this.reviewCount, this.stale = false});

  /// null = tiada rating (SENGAJA — jangan papar 0.0).
  final double? rating;

  /// null = tiada bilangan ulasan (jangan reka).
  final int? reviewCount;
  final bool stale;

  /// Hanya papar bila rating wujud & sah (> 0). 0/negatif dari data hilang
  /// disembunyikan.
  bool get hasRating => rating != null && rating! > 0;
  bool get hasReviewCount => reviewCount != null && reviewCount! > 0;
  bool get lowEvidence => hasRating && (reviewCount == null || reviewCount! < 5);

  static const CardRatingModel none = CardRatingModel();
}

@immutable
class CardPriceModel {
  const CardPriceModel({required this.state, this.amountLabel});

  final CardPriceState state;

  /// Label jumlah/julat SAHAJA untuk keadaan verified/menu (cth. "RM10-RM15").
  /// Untuk band/estimate/unknown, gunakan kunci l10n — bukan label ini.
  final String? amountLabel;

  bool get isUnknown => state == CardPriceState.unknown;
  bool get isExpired => state == CardPriceState.expired;
  bool get isEstimated =>
      state == CardPriceState.estimatedRange || state == CardPriceState.providerBand;

  static const CardPriceModel unknown =
      CardPriceModel(state: CardPriceState.unknown);
}

@immutable
class CardHoursModel {
  const CardHoursModel({required this.state});

  final CardHoursState state;

  /// "Buka sekarang" HANYA daripada waktu boleh dipercayai — tidak pernah
  /// daripada unknown/expired.
  bool get isOpenNow => state == CardHoursState.openNow;
  bool get isUnknown =>
      state == CardHoursState.hoursUnknown || state == CardHoursState.statusUnknown;

  static const CardHoursModel unknown =
      CardHoursModel(state: CardHoursState.hoursUnknown);
}

@immutable
class CardReason {
  const CardReason({
    required this.id,
    required this.labelKey,
    this.strength,
    this.evidence,
  });
  final String id;
  final String labelKey;
  final String? strength; // primary | secondary
  final String? evidence; // verified | reported | inferred
}

@immutable
class CardWarning {
  const CardWarning({
    required this.id,
    required this.severity,
    required this.labelKey,
    this.relatedField,
  });
  final String id;
  final String severity; // info | caution | important
  final String labelKey;
  final String? relatedField;
}

@immutable
class CardBadge {
  const CardBadge({required this.id, required this.labelKey});
  final String id;
  final String labelKey;
}

@immutable
class CardActionConfig {
  const CardActionConfig({
    this.canViewDetails = true,
    this.canOpenMaps = true,
    this.canSave = false,
    this.canShare = false,
    this.canAccept = false,
    this.canReject = false,
    this.canNext = false,
    this.canLogMeal = false,
  });

  final bool canViewDetails;
  final bool canOpenMaps;
  final bool canSave;
  final bool canShare;
  final bool canAccept;
  final bool canReject;
  final bool canNext;
  final bool canLogMeal;

  /// Kad sample: tiada tindakan live sebenar.
  static const CardActionConfig sampleOnly = CardActionConfig(
    canViewDetails: false,
    canOpenMaps: false,
  );
}

/// Model paparan kad kedai kanonikal.
@immutable
class PlaceCardViewModel {
  const PlaceCardViewModel({
    required this.placeId,
    required this.title,
    required this.image,
    required this.rating,
    required this.price,
    required this.hours,
    required this.sourceMode,
    this.subtitle,
    this.distanceMeters,
    this.businessState = CardBusinessState.active,
    this.cuisineLabels = const [],
    this.placeTypeLabels = const [],
    this.cuisineTagIds = const [],
    this.placeTypeTagIds = const [],
    this.matchScore,
    this.matchBand,
    this.matchReasons = const [],
    this.warnings = const [],
    this.verificationBadges = const [],
    this.halal = HalalDisplayState.none,
    this.publicationVersion,
    this.actions = const CardActionConfig(),
    this.suggestionId,
    this.sessionId,
  });

  final String placeId;
  final String title;
  final String? subtitle;
  final CardImageModel image;
  final double? distanceMeters;
  final CardRatingModel rating;
  final CardPriceModel price;
  final CardHoursModel hours;
  final CardBusinessState businessState;

  /// Label paparan cuisine (legasi tidak ada ID tag canonical — guna label).
  final List<String> cuisineLabels;
  final List<String> placeTypeLabels;

  /// ID tag canonical (kosong dari legasi; diisi bila dari registri Phase 1.5).
  final List<String> cuisineTagIds;
  final List<String> placeTypeTagIds;

  /// HANYA daripada respons cadangan (Part 2). null = jangan papar match.
  final int? matchScore;
  final String? matchBand;
  final List<CardReason> matchReasons;
  final List<CardWarning> warnings;
  final List<CardBadge> verificationBadges;
  final HalalDisplayState halal;
  final CardSourceMode sourceMode;
  final int? publicationVersion;
  final CardActionConfig actions;

  final String? suggestionId;
  final String? sessionId;

  bool get isSample => sourceMode == CardSourceMode.sample;
  bool get hasMatchScore => matchScore != null;

  /// Jarak dalam km bulat (untuk paparan) — null jika lokasi tiada.
  double? get distanceKm =>
      distanceMeters == null ? null : distanceMeters! / 1000;
}
