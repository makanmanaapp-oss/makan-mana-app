import {PlaceCandidate} from "../../../types/place";

export interface RuntimeAreaCacheDoc {
  candidates?: PlaceCandidate[];
  lastDiscoveryAt?: number;
  updatedAt?: number;
}

export interface ControlCenterPlaceReference extends Record<string, unknown> {
  reference_key: string;
  canonical_place_id?: string;
  name: string;
  normalized_name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  cuisine_tags: string[];
  internal_tags: string[];
  lifecycle_status: "ACTIVE";
  source_type: "area_place_cache";
  source_reference: string;
  source_record_id: string;
  verification_status: "UNVERIFIED";
  provenance: Record<string, unknown>;
  last_seen_at?: string;
  source_updated_at?: string;
}

function iso(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return new Date(value).toISOString();
}

function normalizedName(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-MY")
    .replace(/\s+/g, " ");
}

function cuisineTags(candidate: PlaceCandidate): string[] {
  const cuisine = candidate.cuisine?.trim();
  return cuisine ? [cuisine] : [];
}

export function sanitizeRuntimePlaceReference(
  candidate: PlaceCandidate,
  areaCacheKey: string,
  cache: RuntimeAreaCacheDoc,
): ControlCenterPlaceReference | null {
  if (!candidate || typeof candidate.placeId !== "string" || !candidate.placeId.trim()) return null;
  if (typeof candidate.name !== "string" || !candidate.name.trim()) return null;

  const placeId = candidate.placeId.trim();
  const updated = iso(cache.updatedAt ?? cache.lastDiscoveryAt);
  const record: ControlCenterPlaceReference = {
    reference_key: `area_place_cache:${placeId}`,
    name: candidate.name.trim(),
    normalized_name: normalizedName(candidate.name),
    cuisine_tags: cuisineTags(candidate),
    internal_tags: [],
    lifecycle_status: "ACTIVE",
    source_type: "area_place_cache",
    source_reference: `cell:${areaCacheKey}`,
    source_record_id: placeId,
    verification_status: "UNVERIFIED",
    provenance: {
      runtimeSource: "area_place_cache",
      dataSource: candidate.dataSource ?? "legacy",
      canonicalOverlay: typeof candidate.canonicalPlaceId === "string" && candidate.canonicalPlaceId.length > 0,
    },
  };

  if (typeof candidate.canonicalPlaceId === "string" && candidate.canonicalPlaceId.trim()) {
    record.canonical_place_id = candidate.canonicalPlaceId.trim();
  }
  if (typeof candidate.address === "string" && candidate.address.trim()) record.address = candidate.address.trim();
  if (typeof candidate.lat === "number" && Number.isFinite(candidate.lat)) record.latitude = candidate.lat;
  if (typeof candidate.lng === "number" && Number.isFinite(candidate.lng)) record.longitude = candidate.lng;
  if (updated) {
    record.last_seen_at = updated;
    record.source_updated_at = updated;
  }
  return record;
}

/** Dedup within one sync page. Cross-page/cell duplicates remain idempotent at
 * Control Center because reference_key is unique by provider placeId. */
export function referencesFromAreaCachePage(
  docs: Array<{id: string; data: RuntimeAreaCacheDoc}>,
): ControlCenterPlaceReference[] {
  const byKey = new Map<string, ControlCenterPlaceReference>();
  for (const doc of docs) {
    const candidates = Array.isArray(doc.data.candidates) ? doc.data.candidates : [];
    for (const candidate of candidates) {
      const record = sanitizeRuntimePlaceReference(candidate, doc.id, doc.data);
      if (!record) continue;
      const previous = byKey.get(record.reference_key);
      const prevTime = previous?.source_updated_at ? Date.parse(String(previous.source_updated_at)) : 0;
      const nextTime = record.source_updated_at ? Date.parse(String(record.source_updated_at)) : 0;
      if (!previous || nextTime >= prevTime) byKey.set(record.reference_key, record);
    }
  }
  return [...byKey.values()];
}
