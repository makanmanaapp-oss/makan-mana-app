/**
 * Phase 1.7 — fixtures ujian deterministik untuk Shared Place Database.
 * Data rekaan. Masa = pemalar T. Tiada Date.now().
 */
import { CanonicalPlace } from "../../canonicalPlace";
import { TrustedActor } from "../../staging/stagingAudit";
import { buildPublicationVersion } from "../../publication/publicationBuilder";
import { PlacePublicationVersion } from "../../publication/publicationVersion";
import {
  eligiblePlace,
  freshInputsAt,
  SOURCE_VERSION,
  T,
  DAY,
} from "../../publication/__tests__/fixtures";

export { T, DAY, SOURCE_VERSION, freshInputsAt };

export const ADMIN: TrustedActor = { actorUid: "server_admin", actorRole: "admin" };

/** Pusat rujukan: Petaling Jaya (SS2). */
export const CENTER = { lat: 3.1189, lng: 101.6252 };

/**
 * Alihkan koordinat sejauh (utara, timur) meter. Deterministik.
 * 1 darjah lat ≈ 111_320 m; longitud diskalakan dengan cos(lat).
 */
export function offsetMeters(
  base: { lat: number; lng: number },
  northM: number,
  eastM: number,
): { lat: number; lng: number } {
  const dLat = northM / 111_320;
  const dLng = eastM / (111_320 * Math.cos((base.lat * Math.PI) / 180));
  return { lat: base.lat + dLat, lng: base.lng + dLng };
}

export interface PlaceSpec {
  placeId: string;
  location: { lat: number; lng: number };
  placeTypes?: string[];
  cuisines?: string[];
  status?: CanonicalPlace["status"];
  publicationStatus?: CanonicalPlace["publicationStatus"];
  rating?: number;
  reviewCount?: number;
  ratingConfidence?: number;
  completeness?: number;
  priceUnknown?: boolean;
  hoursUnknown?: boolean;
  merged?: boolean;
  noImage?: boolean;
}

/** Bina kedai canonical yang LAYAK dengan pelarasan mengikut spec. */
export function makePlace(spec: PlaceSpec): CanonicalPlace {
  const p = eligiblePlace();
  p.placeId = spec.placeId;
  p.location = { ...p.location, lat: spec.location.lat, lng: spec.location.lng };
  if (spec.status) p.status = spec.status;
  if (spec.publicationStatus) p.publicationStatus = spec.publicationStatus;

  p.tagSet = {
    tags: [
      ...(spec.placeTypes ?? ["restaurant"]).map((tagId) => ({
        tagId,
        family: "place_type" as const,
        evidenceLevel: "verified" as const,
        confidence: 0.95,
        sourceType: "makanmana" as const,
      })),
      ...(spec.cuisines ?? []).map((tagId) => ({
        tagId,
        family: "cuisine" as const,
        evidenceLevel: "verified" as const,
        confidence: 0.9,
        sourceType: "makanmana" as const,
      })),
    ],
  };

  p.quality = {
    rating: spec.rating ?? 4.4,
    reviewCount: spec.reviewCount ?? 250,
    ratingSource: "provider",
  };
  if (spec.ratingConfidence !== undefined) {
    p.provenance = {
      ...p.provenance,
      rating: {
        value: p.quality.rating,
        sourceType: "provider",
        evidenceLevel: "reported",
        confidence: spec.ratingConfidence,
        fetchedAt: T,
      },
    };
  }
  if (spec.completeness !== undefined) {
    p.completeness = { ...p.completeness, overallScore: spec.completeness };
  }
  if (spec.priceUnknown) p.commercial = { priceState: "unknown" };
  if (spec.hoursUnknown) p.hours = { hoursState: "unknown" };
  if (spec.merged) {
    p.mergeState = {
      mergeStatus: "merged",
      duplicateOf: "mm_canonical_target",
      preservedSourceRefs: [],
    };
  }
  if (spec.noImage) p.media = { items: [] };
  return p;
}

/**
 * Bina versi penerbitan bagi kedai. Kedai yang TIDAK layak (mis. tutup kekal)
 * tidak boleh melalui `buildPublicationVersion`, jadi kami bina versi secara
 * langsung untuk ujian pengecualian.
 */
export function makePublication(
  place: CanonicalPlace,
  versionNumber = 1,
  now: number = T,
): PlacePublicationVersion {
  return buildPublicationVersion({
    place,
    actor: ADMIN,
    now,
    versionNumber,
    sourceCanonicalVersion: SOURCE_VERSION,
    eligibilityContext: { freshnessInputs: freshInputsAt(T) },
  }).version;
}

/**
 * Versi penerbitan MENTAH untuk ujian pengecualian — memintas pengesahan
 * kelayakan supaya kami boleh membuktikan bahawa lapisan LIPUTAN menolaknya.
 */
export function makeRawPublication(
  place: CanonicalPlace,
  overrides: Partial<PlacePublicationVersion> = {},
): PlacePublicationVersion {
  const base = makePublication(makePlace({ placeId: place.placeId, location: { lat: place.location.lat, lng: place.location.lng } }));
  return {
    ...base,
    placeId: place.placeId,
    snapshot: { ...base.snapshot, place },
    ...overrides,
  };
}

export function head(placeId: string, activePublicationId: string) {
  return { placeId, activePublicationId };
}
