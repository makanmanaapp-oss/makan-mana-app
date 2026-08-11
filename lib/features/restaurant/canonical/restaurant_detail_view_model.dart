/// PART 1 Phase 1.10 — model paparan Butiran Kedai KANONIKAL (immutable).
///
/// Satu sumber kebenaran paparan untuk skrin Butiran Kedai. Menggunakan SEMULA
/// model paparan kad Phase 1.9 (rating/harga/waktu/imej/amaran/sebab/badge)
/// supaya peraturan kejujuran sama dikuatkuasa. TIADA pengiraan skor di sini.
///
/// Peraturan kejujuran teras (sama seperti kad Phase 1.9):
/// - rating tiada  -> null (JANGAN 0.0)
/// - harga unknown -> unavailable (JANGAN reka RM)
/// - waktu unknown  -> hoursUnknown (JANGAN "Buka")
/// - halal/diet/alahan ikut BUKTI (tiada dakwaan "selamat"/"halal" tanpa bukti)
library;

import 'package:flutter/foundation.dart';

import '../../place_cards/place_card_view_model.dart';

export '../../place_cards/place_card_view_model.dart'
    show
        CardImageModel,
        CardRatingModel,
        CardPriceModel,
        CardHoursModel,
        CardBusinessState,
        CardSourceMode,
        CardHoursState,
        CardPriceState,
        HalalDisplayState,
        CardWarning,
        CardReason,
        CardBadge;

/// Tahap bukti untuk sifat berasaskan bukti (diet, alahan, dish).
enum EvidenceLevel { verified, reported, inferred, unknown }

/// Keadaan kesegaran data untuk paparan transparansi.
enum FreshnessState { fresh, stale, expired, unknown }

/// Kehadiran alergen. `absent` HANYA bermakna selamat bila evidence == verified.
enum AllergenPresence { present, absent, unknown }

@immutable
class DetailImageItem {
  const DetailImageItem({
    required this.image,
    this.attributionKey,
    this.isSample = false,
  });

  final CardImageModel image;

  /// Kunci l10n atribusi sumber (disimpan dalaman; tidak semestinya dipapar).
  final String? attributionKey;
  final bool isSample;
}

@immutable
class DetailGallery {
  const DetailGallery({this.images = const [], this.heroIndex = 0});

  final List<DetailImageItem> images;
  final int heroIndex;

  bool get hasImages => images.isNotEmpty;
  int get count => images.length;
  DetailImageItem? get hero =>
      images.isEmpty ? null : images[heroIndex.clamp(0, images.length - 1)];

  static const DetailGallery empty = DetailGallery();
}

/// Suku hari operasi hari ini + jadual mingguan (jika ada).
@immutable
class DetailHours {
  const DetailHours({
    required this.model,
    this.todayLabel,
    this.weeklySchedule = const [],
    this.timezone,
    this.lastVerifiedLabel,
  });

  final CardHoursModel model;

  /// Label waktu hari ini (cth. "9:00 AM - 10:00 PM"), null jika tidak diketahui.
  final String? todayLabel;

  /// Jadual mingguan: setiap entri (labelKey hari, label waktu). Kosong = tiada.
  final List<DetailDayHours> weeklySchedule;
  final String? timezone;
  final String? lastVerifiedLabel;

  bool get hasWeekly => weeklySchedule.isNotEmpty;

  static const DetailHours unknown =
      DetailHours(model: CardHoursModel.unknown);
}

@immutable
class DetailDayHours {
  const DetailDayHours({required this.dayLabelKey, required this.hoursLabel});
  final String dayLabelKey;
  final String hoursLabel;
}

@immutable
class DietarySuitability {
  const DietarySuitability({required this.tagId, required this.evidence});
  final String tagId;
  final EvidenceLevel evidence;

  /// Hanya "sesuai" boleh dipromosi bila verified/reported; inferred kekal
  /// berlabel "disimpulkan" (tidak dinaik taraf ke pengesahan).
  bool get isPromotable =>
      evidence == EvidenceLevel.verified || evidence == EvidenceLevel.reported;
}

@immutable
class AllergenEvidence {
  const AllergenEvidence({
    required this.allergenId,
    required this.presence,
    required this.evidence,
  });
  final String allergenId;
  final AllergenPresence presence;
  final EvidenceLevel evidence;

  /// "Selamat" (tiada alergen) HANYA bila absent + verified. Jika tidak → caution.
  bool get provesAbsent =>
      presence == AllergenPresence.absent && evidence == EvidenceLevel.verified;
  bool get isKnownPresent => presence == AllergenPresence.present;
}

@immutable
class DishHighlight {
  const DishHighlight({required this.name, this.tagId, this.noteKey});
  final String name;
  final String? tagId;
  final String? noteKey;
}

@immutable
class MenuSummary {
  const MenuSummary({this.itemCount, this.fromPriceLabel, this.available = false});
  final int? itemCount;
  final String? fromPriceLabel;
  final bool available;

  static const MenuSummary none = MenuSummary();
}

@immutable
class LocationInfo {
  const LocationInfo({
    required this.address,
    this.locality,
    this.postalCode,
    this.latitude,
    this.longitude,
    this.distanceMeters,
    this.movedWarningKey,
  });

  final String address;
  final String? locality;
  final String? postalCode;
  final double? latitude;
  final double? longitude;
  final double? distanceMeters;
  final String? movedWarningKey;

  bool get hasCoordinates => latitude != null && longitude != null;
  double? get distanceKm =>
      distanceMeters == null ? null : distanceMeters! / 1000;
}

@immutable
class ContactInfo {
  const ContactInfo({this.phone, this.website, this.mapsUrl});
  final String? phone;
  final String? website;
  final String? mapsUrl;

  bool get hasPhone => phone != null && phone!.trim().isNotEmpty;
  bool get hasWebsite => website != null && website!.trim().isNotEmpty;

  static const ContactInfo none = ContactInfo();
}

/// Ringkasan provenans SELAMAT-PENGGUNA. TIDAK mendedah UID aktor, audit
/// peribadi, payload import mentah atau nota admin.
@immutable
class ProvenanceSummary {
  const ProvenanceSummary({
    required this.sourceMode,
    this.lastUpdatedLabel,
    this.lastVerifiedLabel,
    this.verificationLevelKey,
  });

  final CardSourceMode sourceMode;
  final String? lastUpdatedLabel;
  final String? lastVerifiedLabel;

  /// Kunci l10n tahap pengesahan yang selamat dipapar (cth. "approvedCache").
  final String? verificationLevelKey;

  static const ProvenanceSummary live =
      ProvenanceSummary(sourceMode: CardSourceMode.live);
}

@immutable
class FreshnessSummary {
  const FreshnessSummary({
    this.state = FreshnessState.unknown,
    this.warnings = const [],
  });
  final FreshnessState state;
  final List<CardWarning> warnings;

  bool get needsRecheck =>
      state == FreshnessState.expired || state == FreshnessState.stale;

  static const FreshnessSummary unknown = FreshnessSummary();
}

/// Tindakan yang tersedia pada skrin butiran (dipelihara dari legasi).
@immutable
class DetailActionConfig {
  const DetailActionConfig({
    this.canOpenMaps = true,
    this.canSave = false,
    this.canShare = true,
    this.canCall = false,
    this.canOpenWebsite = false,
    this.canLogMeal = false,
    this.canRate = false,
    this.canAccept = false,
    this.canReject = false,
  });

  final bool canOpenMaps;
  final bool canSave;
  final bool canShare;
  final bool canCall;
  final bool canOpenWebsite;
  final bool canLogMeal;
  final bool canRate;
  final bool canAccept;
  final bool canReject;

  /// Rekod sample: TIADA tindakan live (maps/call/website/log).
  static const DetailActionConfig sampleOnly = DetailActionConfig(
    canOpenMaps: false,
    canShare: true,
    canCall: false,
    canOpenWebsite: false,
    canLogMeal: false,
    canRate: false,
  );
}

/// Model paparan Butiran Kedai kanonikal.
@immutable
class RestaurantDetailViewModel {
  const RestaurantDetailViewModel({
    required this.placeId,
    required this.title,
    required this.sourceMode,
    required this.gallery,
    required this.businessState,
    required this.hours,
    required this.rating,
    required this.price,
    required this.location,
    this.publicationVersion,
    this.subtitle,
    this.description,
    this.reviewCount,
    this.contact = ContactInfo.none,
    this.cuisineTagIds = const [],
    this.placeTypeTagIds = const [],
    this.serviceTagIds = const [],
    this.ambienceTagIds = const [],
    this.mealSlotTagIds = const [],
    this.healthTagIds = const [],
    this.spiceTagIds = const [],
    this.portionTagIds = const [],
    this.speedTagIds = const [],
    this.cuisineLabels = const [],
    this.placeTypeLabels = const [],
    this.serviceLabels = const [],
    this.ambienceLabels = const [],
    this.dietaryStates = const [],
    this.allergenStates = const [],
    this.halalState = HalalDisplayState.none,
    this.dishHighlights = const [],
    this.menuSummary = MenuSummary.none,
    this.verificationBadges = const [],
    this.warnings = const [],
    this.freshness = FreshnessSummary.unknown,
    this.provenance = ProvenanceSummary.live,
    this.actions = const DetailActionConfig(),
    this.matchReasons = const [],
    this.isBlocked = false,
    this.suggestionId,
    this.sessionId,
  });

  final String placeId;
  final int? publicationVersion;
  final String title;
  final String? subtitle;
  final String? description;
  final CardSourceMode sourceMode;

  final DetailGallery gallery;
  final CardBusinessState businessState;
  final DetailHours hours;
  final CardRatingModel rating;
  final int? reviewCount;
  final CardPriceModel price;

  final LocationInfo location;
  final ContactInfo contact;

  final List<String> cuisineTagIds;
  final List<String> placeTypeTagIds;
  final List<String> serviceTagIds;
  final List<String> ambienceTagIds;
  final List<String> mealSlotTagIds;
  final List<String> healthTagIds;
  final List<String> spiceTagIds;
  final List<String> portionTagIds;
  final List<String> speedTagIds;

  // Label paparan (legasi tiada ID canonical — guna label).
  final List<String> cuisineLabels;
  final List<String> placeTypeLabels;
  final List<String> serviceLabels;
  final List<String> ambienceLabels;

  final List<DietarySuitability> dietaryStates;
  final List<AllergenEvidence> allergenStates;
  final HalalDisplayState halalState;

  final List<DishHighlight> dishHighlights;
  final MenuSummary menuSummary;

  final List<CardBadge> verificationBadges;
  final List<CardWarning> warnings;
  final FreshnessSummary freshness;
  final ProvenanceSummary provenance;
  final DetailActionConfig actions;
  final List<CardReason> matchReasons;

  final bool isBlocked;
  final String? suggestionId;
  final String? sessionId;

  bool get isSample => sourceMode == CardSourceMode.sample;
  bool get hasRating => rating.hasRating;
  bool get hasReviewCount => reviewCount != null && reviewCount! > 0;

  /// Venue yang tutup kekal/tersembunyi/blocked TIDAK boleh nampak aktif normal.
  bool get isInactive =>
      isBlocked ||
      businessState == CardBusinessState.permanentlyClosed ||
      businessState == CardBusinessState.hidden ||
      businessState == CardBusinessState.blocked;
}
