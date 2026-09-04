export type JsonObject = Record<string, unknown>;

export interface PublicRestaurantMedia {
  url: string;
  attribution?: string;
  isFallback: boolean;
}

export interface PublicRestaurantTag {
  tagId: string;
  family: string;
  evidenceLevel: string;
}

export interface PublicRestaurantProfileV2 {
  canonicalPlaceId: string;
  publicationVersion: number;
  name: string;
  officialName?: string;
  branchName?: string;
  description?: string;
  editorialDescription?: string;
  address?: string;
  locality?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  whatsapp?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  primaryCategory?: string;
  cuisineTags: string[];
  foodTags: string[];
  signatureDishes: string[];
  serviceModes: string[];
  amenities: string[];
  tags: PublicRestaurantTag[];
  priceState: string;
  priceBandId?: string;
  averageSpend?: number;
  currency?: string;
  businessState: string;
  hoursState: string;
  openingPeriods: Array<{openMinuteOfWeek: number; closeMinuteOfWeek: number}>;
  openingHours?: JsonObject;
  specialHours: unknown[];
  temporaryClosedFrom?: string;
  temporaryClosedUntil?: string;
  ratingState: string;
  rating?: number;
  reviewCount?: number;
  halalState: string;
  halalEvidenceLevel: string;
  dietaryReported: string[];
  allergenReported: string[];
  allergenEvidenceLevel: string;
  media: PublicRestaurantMedia[];
  verificationStatus: string;
  freshnessState: string;
  warnings: string[];
  lastVerifiedAt?: number | string;
  sourceMode: "canonical_publication";
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean || undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(text)
    .filter((item): item is string => item !== undefined);
}

function unknownList(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, 64) : [];
}

function contactText(contact: JsonObject, key: string): string | undefined {
  return text(contact[key]);
}

function modernMedia(place: JsonObject): PublicRestaurantMedia[] {
  const mediaSet = object(place.media);
  if (!Array.isArray(mediaSet.items)) return [];
  const out: PublicRestaurantMedia[] = [];
  for (const raw of mediaSet.items) {
    const item = object(raw);
    const status = text(item.status);
    const url = text(item.url);
    if (!url || (status !== "approved" && status !== "fallback")) continue;
    out.push({
      url,
      ...(text(item.attribution) ? {attribution: text(item.attribution)} : {}),
      isFallback: item.isFallback === true || status === "fallback",
    });
    if (out.length >= 24) break;
  }
  return out;
}

function flatMedia(publication: JsonObject): PublicRestaurantMedia[] {
  const gallery = Array.isArray(publication.mediaGallery)
    ? publication.mediaGallery
    : [];
  const out: PublicRestaurantMedia[] = [];
  for (const raw of gallery) {
    const item = object(raw);
    const url = text(item.url) ?? text(item.publicUrl);
    if (!url) continue;
    out.push({
      url,
      ...(text(item.caption) ? {attribution: text(item.caption)} : {}),
      isFallback: item.isFallback === true,
    });
    if (out.length >= 24) break;
  }
  const cover = text(publication.coverImageUrl);
  if (cover && !out.some((item) => item.url === cover)) {
    out.unshift({url: cover, isFallback: false});
  }
  return out;
}

function publicTags(place: JsonObject): PublicRestaurantTag[] {
  const set = object(place.tagSet);
  if (!Array.isArray(set.tags)) return [];
  const out: PublicRestaurantTag[] = [];
  for (const raw of set.tags) {
    const tag = object(raw);
    const tagId = text(tag.tagId);
    const family = text(tag.family);
    const evidenceLevel = text(tag.evidenceLevel) ?? "unknown";
    if (!tagId || !family) continue;
    out.push({tagId, family, evidenceLevel});
    if (out.length >= 80) break;
  }
  return out;
}

function openingPeriods(hours: JsonObject): Array<{openMinuteOfWeek: number; closeMinuteOfWeek: number}> {
  if (!Array.isArray(hours.periods)) return [];
  const out: Array<{openMinuteOfWeek: number; closeMinuteOfWeek: number}> = [];
  for (const raw of hours.periods) {
    const item = object(raw);
    const open = numberValue(item.openMinuteOfWeek);
    const close = numberValue(item.closeMinuteOfWeek);
    if (open === undefined || close === undefined) continue;
    out.push({openMinuteOfWeek: open, closeMinuteOfWeek: close});
    if (out.length >= 32) break;
  }
  return out;
}

function worstFreshness(place: JsonObject, publication: JsonObject): string {
  const eligibility = object(publication.eligibilitySnapshot);
  const overall = text(eligibility.overallFreshnessState);
  if (overall) return overall;

  const rank: Record<string, number> = {
    unknown: 0,
    fresh: 1,
    aging: 2,
    stale: 3,
    expired: 4,
  };
  let worst = "unknown";
  const freshness = object(place.freshness);
  for (const value of Object.values(freshness)) {
    const state = text(object(value).state);
    if (state && (rank[state] ?? 0) > (rank[worst] ?? 0)) worst = state;
  }
  return worst;
}

function flatStringList(publication: JsonObject, key: string): string[] {
  return stringList(publication[key]);
}

/**
 * Convert one ACTIVE immutable canonical publication into the narrow public
 * Restaurant Profile V2 DTO. Raw provenance, actor/admin IDs, provider
 * snapshots, audit fields and publication-control metadata are never returned.
 *
 * Modern immutable `snapshot.place` is preferred. A bounded flattened shape is
 * accepted only for compatibility with older master-publication records.
 */
export function projectPublicRestaurantProfileV2(
  publicationValue: unknown,
  canonicalPlaceId: string,
): PublicRestaurantProfileV2 | null {
  const publication = object(publicationValue);
  if (publication.blocked === true || text(publication.publicationStatus) !== "published") {
    return null;
  }

  const snapshot = object(publication.snapshot);
  const place = object(snapshot.place);
  const displayState = object(snapshot.displayState);
  const identity = object(place.identity);
  const displaySnapshot = object(place.displaySnapshot);
  const location = object(place.location);
  const contacts = object(place.contacts);
  const commercial = object(place.commercial);
  const hours = object(place.hours);
  const quality = object(place.quality);
  const safety = object(place.safetyEvidence);
  const halal = object(safety.halal);

  const flatContact = object(publication.contact);
  const flatAddress = object(publication.addressFields);
  const modern = Object.keys(place).length > 0;

  const name = text(identity.canonicalName)
    ?? text(displaySnapshot.name)
    ?? text(publication.title)
    ?? text(publication.name);
  if (!name) return null;

  const lat = numberValue(location.lat)
    ?? numberValue(publication.lat)
    ?? numberValue(publication.latitude);
  const lng = numberValue(location.lng)
    ?? numberValue(publication.lng)
    ?? numberValue(publication.longitude);

  const modernPhones = stringList(contacts.phones);
  const modernTags = publicTags(place);
  const displayHours = object(displayState.hours);
  const displayPrice = object(displayState.price);
  const displayRating = object(displayState.rating);
  const displayBusiness = object(displayState.business);
  const displaySafety = object(displayState.safety);

  const warnings = Array.from(new Set([
    ...stringList(publication.warnings),
    ...stringList(displaySafety.warningCodes),
    ...[text(displayHours.warningCode), text(displayPrice.warningCode), text(displayRating.warningCode), text(displayBusiness.warningCode)]
      .filter((item): item is string => item !== undefined),
  ])).slice(0, 40);

  const flatHalal = text(publication.halalState) ?? text(publication.halalStatus);
  const media = modernMedia(place);
  if (media.length === 0) media.push(...flatMedia(publication));

  const version = numberValue(publication.versionNumber)
    ?? numberValue(publication.publicationVersion)
    ?? 1;

  return {
    canonicalPlaceId,
    publicationVersion: Math.max(1, Math.trunc(version)),
    name,
    ...(text(publication.officialName) ? {officialName: text(publication.officialName)} : {}),
    ...(text(identity.branchName) ?? text(publication.branchName)
      ? {branchName: text(identity.branchName) ?? text(publication.branchName)}
      : {}),
    ...(text(publication.shortDescription) ? {description: text(publication.shortDescription)} : {}),
    ...(text(publication.editorialDescription) ? {editorialDescription: text(publication.editorialDescription)} : {}),
    ...(text(location.address) ?? text(displaySnapshot.address) ?? text(publication.address)
      ? {address: text(location.address) ?? text(displaySnapshot.address) ?? text(publication.address)}
      : {}),
    ...(text(location.locality) ?? text(flatAddress.locality) ?? text(flatAddress.city)
      ? {locality: text(location.locality) ?? text(flatAddress.locality) ?? text(flatAddress.city)}
      : {}),
    ...(text(location.state) ?? text(flatAddress.state)
      ? {state: text(location.state) ?? text(flatAddress.state)}
      : {}),
    ...(text(location.postalCode) ?? text(flatAddress.postcode)
      ? {postalCode: text(location.postalCode) ?? text(flatAddress.postcode)}
      : {}),
    ...(lat !== undefined ? {latitude: lat} : {}),
    ...(lng !== undefined ? {longitude: lng} : {}),
    ...(modernPhones[0] ?? contactText(flatContact, "phone")
      ? {phone: modernPhones[0] ?? contactText(flatContact, "phone")} : {}),
    ...(contactText(flatContact, "whatsapp") ? {whatsapp: contactText(flatContact, "whatsapp")} : {}),
    ...(text(contacts.website) ?? contactText(flatContact, "website")
      ? {website: text(contacts.website) ?? contactText(flatContact, "website")} : {}),
    ...(contactText(flatContact, "instagram") ? {instagram: contactText(flatContact, "instagram")} : {}),
    ...(contactText(flatContact, "facebook") ? {facebook: contactText(flatContact, "facebook")} : {}),
    ...(contactText(flatContact, "tiktok") ? {tiktok: contactText(flatContact, "tiktok")} : {}),
    ...(text(publication.primaryCategory) ? {primaryCategory: text(publication.primaryCategory)} : {}),
    cuisineTags: modernTags.filter((tag) => tag.family === "cuisine").map((tag) => tag.tagId).length > 0
      ? modernTags.filter((tag) => tag.family === "cuisine").map((tag) => tag.tagId)
      : flatStringList(publication, "cuisineTags"),
    foodTags: flatStringList(publication, "foodTags"),
    signatureDishes: flatStringList(publication, "signatureDishes"),
    serviceModes: modernTags.filter((tag) => tag.family === "service").map((tag) => tag.tagId).length > 0
      ? modernTags.filter((tag) => tag.family === "service").map((tag) => tag.tagId)
      : flatStringList(publication, "serviceModes"),
    amenities: flatStringList(publication, "amenities"),
    tags: modernTags,
    priceState: text(displayPrice.state) ?? text(publication.priceState) ?? text(commercial.priceState) ?? "price_unknown",
    ...(text(displayPrice.priceBandId) ?? text(commercial.priceBandId) ?? text(publication.priceRange)
      ? {priceBandId: text(displayPrice.priceBandId) ?? text(commercial.priceBandId) ?? text(publication.priceRange)} : {}),
    ...(numberValue(displayPrice.averageSpend) ?? numberValue(commercial.averageSpend)
      ? {averageSpend: numberValue(displayPrice.averageSpend) ?? numberValue(commercial.averageSpend)} : {}),
    ...(text(commercial.currency) ? {currency: text(commercial.currency)} : {}),
    businessState: text(displayBusiness.state) ?? text(publication.businessState) ?? text(publication.businessStatus) ?? text(place.status) ?? "status_unknown",
    hoursState: text(displayHours.state) ?? text(publication.hoursState) ?? text(hours.hoursState) ?? "hours_unknown",
    openingPeriods: openingPeriods(hours),
    ...(Object.keys(object(publication.openingHours)).length > 0 ? {openingHours: object(publication.openingHours)} : {}),
    specialHours: unknownList(publication.specialHours),
    ...(text(publication.temporaryClosedFrom) ? {temporaryClosedFrom: text(publication.temporaryClosedFrom)} : {}),
    ...(text(publication.temporaryClosedUntil) ? {temporaryClosedUntil: text(publication.temporaryClosedUntil)} : {}),
    ratingState: text(displayRating.state) ?? text(publication.ratingState) ?? (numberValue(quality.rating) !== undefined ? "rating_shown" : "rating_hidden"),
    ...(numberValue(displayRating.rating) ?? numberValue(quality.rating) ?? numberValue(publication.rating)
      ? {rating: numberValue(displayRating.rating) ?? numberValue(quality.rating) ?? numberValue(publication.rating)} : {}),
    ...(numberValue(displayRating.reviewCount) ?? numberValue(quality.reviewCount) ?? numberValue(publication.reviewCount)
      ? {reviewCount: numberValue(displayRating.reviewCount) ?? numberValue(quality.reviewCount) ?? numberValue(publication.reviewCount)} : {}),
    halalState: text(displaySafety.halal) ?? flatHalal ?? text(halal.state) ?? "halal_unknown",
    halalEvidenceLevel: text(halal.evidenceLevel) ?? "unknown",
    dietaryReported: stringList(safety.dietaryReported),
    allergenReported: stringList(safety.allergenReported),
    allergenEvidenceLevel: text(safety.allergenEvidenceLevel) ?? "unknown",
    media,
    verificationStatus: text(place.verificationStatus) ?? text(publication.verificationStatus) ?? "unverified",
    freshnessState: worstFreshness(place, publication),
    warnings,
    ...(place.updatedAt !== undefined ? {lastVerifiedAt: place.updatedAt as number | string} : {}),
    sourceMode: "canonical_publication",
  };
}
