/// PART 1 Phase 1.11 — penangkap snapshot "apa yang pengguna lihat".
///
/// Snapshot ditangkap SEKALI pada saat pengguna membuka borang laporan dan
/// TIDAK PERNAH diubah selepas itu. Penyemak melihat paparan asal yang sama,
/// walaupun data kedai berubah kemudian.
///
/// Keadaan tidak diketahui kekal tidak diketahui — tiada nilai direka di sini.
library;

import '../restaurant/canonical/restaurant_detail_view_model.dart';
import 'correction_models.dart';

String _hoursState(CardHoursState s) {
  switch (s) {
    case CardHoursState.openNow:
      return 'open_now';
    case CardHoursState.closedNow:
      return 'closed_now';
    case CardHoursState.hoursExpired:
      return 'hours_expired';
    case CardHoursState.temporarilyClosed:
      return 'temporarily_closed';
    case CardHoursState.permanentlyClosed:
      return 'permanently_closed';
    case CardHoursState.blocked:
      return 'blocked';
    case CardHoursState.hoursUnknown:
    case CardHoursState.statusUnknown:
      return 'hours_unknown';
  }
}

String _priceState(CardPriceState s) {
  switch (s) {
    case CardPriceState.verifiedAverage:
      return 'price_verified_average';
    case CardPriceState.verifiedRange:
      return 'price_verified_range';
    case CardPriceState.menuFromPrice:
      return 'price_menu_from';
    case CardPriceState.providerBand:
      return 'price_provider_band';
    case CardPriceState.estimatedRange:
      return 'price_estimated_range';
    case CardPriceState.expired:
      return 'price_expired';
    case CardPriceState.unknown:
      return 'price_unknown';
  }
}

String _businessState(CardBusinessState s) {
  switch (s) {
    case CardBusinessState.active:
      return 'status_active';
    case CardBusinessState.temporarilyClosed:
      return 'status_temporarily_closed';
    case CardBusinessState.permanentlyClosed:
      return 'status_permanently_closed';
    case CardBusinessState.moved:
      return 'status_moved';
    case CardBusinessState.hidden:
      return 'status_hidden';
    case CardBusinessState.blocked:
      return 'status_blocked';
    case CardBusinessState.unknown:
      return 'status_unknown';
  }
}

String _halalState(HalalDisplayState s) {
  switch (s) {
    case HalalDisplayState.certified:
      return 'halal_certified';
    case HalalDisplayState.merchantClaimed:
      return 'halal_merchant_claimed';
    case HalalDisplayState.communityReported:
      return 'halal_community_reported';
    case HalalDisplayState.possibleNonHalal:
      return 'halal_possible_non_halal';
    case HalalDisplayState.recheckRequired:
      return 'halal_recheck_required';
    case HalalDisplayState.unknown:
    case HalalDisplayState.none:
      return 'halal_unknown';
  }
}

String _sourceMode(CardSourceMode s) {
  switch (s) {
    case CardSourceMode.live:
      return 'live';
    case CardSourceMode.approvedCache:
      return 'approved_cache';
    case CardSourceMode.community:
      return 'community';
    case CardSourceMode.sample:
      return 'sample';
  }
}

/// Keadaan pemakanan terkuat yang dipapar (bukti tertinggi menang).
String _dietaryState(List<DietarySuitability> states) {
  if (states.isEmpty) return 'dietary_unknown';
  if (states.any((d) => d.evidence == EvidenceLevel.verified)) {
    return 'dietary_verified';
  }
  if (states.any((d) => d.evidence == EvidenceLevel.reported)) {
    return 'dietary_reported';
  }
  if (states.any((d) => d.evidence == EvidenceLevel.inferred)) {
    return 'dietary_inferred';
  }
  return 'dietary_unknown';
}

/// Keadaan alergen yang dipapar. "Selamat" HANYA bila absent + verified.
String _allergenState(List<AllergenEvidence> states) {
  if (states.isEmpty) return 'allergen_unknown';
  if (states.any((a) => a.isKnownPresent)) return 'allergen_present';
  if (states.every((a) => a.provesAbsent)) return 'allergen_verified_absent';
  return 'allergen_unknown';
}

/// Cincang kandungan mudah alih (FNV-1a 32-bit) bagi teks snapshot kanonikal.
///
/// Digunakan untuk mengesan snapshot yang diusik dan untuk dedup tempatan.
/// Bukan cincang kriptografi — backend mengira semula cincangnya sendiri.
String snapshotContentHash(List<String> parts) {
  const int prime = 0x01000193;
  int hash = 0x811c9dc5;
  final text = parts.join('|');
  for (final unit in text.codeUnits) {
    hash ^= unit & 0xff;
    hash = (hash * prime) & 0xffffffff;
    hash ^= (unit >> 8) & 0xff;
    hash = (hash * prime) & 0xffffffff;
  }
  return hash.toRadixString(16).padLeft(8, '0');
}

/// Tangkap snapshot daripada model paparan butiran kanonikal.
ReportOriginalSnapshot captureSnapshot(
  RestaurantDetailViewModel vm, {
  required DateTime capturedAt,
}) {
  final hours = _hoursState(vm.hours.model.state);
  final price = _priceState(vm.price.state);
  final rating = vm.rating.rating == null ? 'rating_hidden' : 'rating_shown';
  final business = _businessState(vm.businessState);
  final halal = _halalState(vm.halalState);
  final dietary = _dietaryState(vm.dietaryStates);
  final allergen = _allergenState(vm.allergenStates);
  final source = _sourceMode(vm.sourceMode);
  final tagIds = <String>[
    ...vm.cuisineTagIds,
    ...vm.placeTypeTagIds,
    ...vm.healthTagIds,
  ];
  final imageRefs = <String>[
    for (var i = 0; i < vm.gallery.images.length; i++) 'image_$i',
  ];
  final warnings = <String>[for (final w in vm.warnings) w.id];

  return ReportOriginalSnapshot(
    placeId: vm.placeId,
    title: vm.title,
    capturedAt: capturedAt,
    contentHash: snapshotContentHash(<String>[
      vm.placeId,
      vm.title,
      vm.location.address,
      vm.contact.phone ?? '',
      vm.contact.website ?? '',
      hours,
      price,
      rating,
      business,
      halal,
      dietary,
      allergen,
      source,
      tagIds.join(','),
      imageRefs.join(','),
      warnings.join(','),
      '${vm.publicationVersion ?? -1}',
    ]),
    publicationVersion: vm.publicationVersion,
    address: vm.location.address.trim().isEmpty ? null : vm.location.address,
    phone: vm.contact.hasPhone ? vm.contact.phone : null,
    website: vm.contact.hasWebsite ? vm.contact.website : null,
    hoursState: hours,
    priceState: price,
    ratingState: rating,
    businessState: business,
    halalState: halal,
    dietaryState: dietary,
    allergenState: allergen,
    sourceMode: source,
    imageReferences: imageRefs,
    tagIds: tagIds,
    warnings: warnings,
  );
}
