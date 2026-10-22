import {FieldPath, type DocumentSnapshot} from "firebase-admin/firestore";
import {db} from "../config/firebase";
import {PlaceCandidate} from "../types/place";
import {buildMasterRegistryCandidate, isOpenAtMalaysia} from "../domain/places/canonical/masterRegistryCandidate";
import {haversineMeters} from "../domain/places/dedup/geo";
import {isFictionalPlaceId, isQaSyntheticPlaceId} from "../domain/places/realPlaceIdentity";
import {decideSyntheticPlaces} from "../domain/security/qaSurfaces";

export interface RecommendationLocation {lat: number; lng: number; radiusMeters: number}
export interface RecommendationSource {
  candidates: PlaceCandidate[];
  aliases: Record<string, string[]>;
  versionChecks?: Array<{path: string; version: string | null}>;
}
const text = (v: unknown): string | undefined => typeof v === "string" && v.trim() ? v.trim() : undefined;
const number = (v: unknown): number | undefined => typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** The existing approved Supabase -> Master Registry publisher is the boundary.
 * Read its immutable publications afresh, never private registration payloads.
 * Missing/withdrawn publications remove BOTH canonical and provider aliases. */
export async function prepareRecommendationSource(
  existing: readonly PlaceCandidate[], location: RecommendationLocation, now: number,
  includePublished = true,
): Promise<RecommendationSource> {
  const checks = new Map<string, string | null>();
  const remember = (snapshot: DocumentSnapshot) => checks.set(snapshot.ref.path, snapshot.updateTime?.valueOf() ?? null);
  const registry = new Map<string, Record<string, unknown>>();
  if (includePublished) {
    let cursor: DocumentSnapshot | undefined;
    for (let page = 0; ; page++) {
      let query = db.collection("place_registry").where("provenanceSource", "==", "makanmana_master_registry")
        .orderBy(FieldPath.documentId()).limit(200);
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.get();
      for (const doc of snapshot.docs) { registry.set(doc.id, doc.data()); remember(doc); }
      if (snapshot.size < 200) break;
      if (page >= 19) throw new Error("recommendation_registry_truncated");
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
  }
  const mapping = new Map<string, string>();
  const ids = [...new Set(existing.map((p) => p.placeId))];
  // Resolve all provider aliases in bounded batches, including chains.
  let unresolved = ids;
  for (let hop = 0; unresolved.length > 0; hop++) {
    if (hop === 8) throw new Error("recommendation_alias_cycle_or_depth");
    const next: string[] = [];
    for (let start = 0; start < unresolved.length; start += 100) {
      const snaps = await db.getAll(...unresolved.slice(start, start + 100)
        .map((id) => db.collection("place_migration_aliases").doc(id)));
      for (const snap of snaps) {
        remember(snap);
        const data = snap.data();
        const canonical = text(data?.canonicalPlaceId);
        if (!canonical) continue;
        if (data?.status === "blocked" || data?.active === false) {
          mapping.set(snap.id, ""); continue;
        }
        mapping.set(snap.id, canonical);
        if (canonical !== snap.id && !mapping.has(canonical)) next.push(canonical);
      }
    }
    unresolved = [...new Set(next)];
  }
  const resolve = (id: string): string => {
    const seen = new Set<string>();
    let key = id;
    while (mapping.has(key) && mapping.get(key) !== key) {
      if (seen.has(key)) throw new Error("recommendation_alias_cycle");
      seen.add(key); key = mapping.get(key)!;
      if (!key) return "";
    }
    return key;
  };
  for (const candidate of existing) {
    if (candidate.canonicalPlaceId && !mapping.has(candidate.placeId)) mapping.set(candidate.placeId, candidate.canonicalPlaceId);
  }
  for (const [id, row] of registry) {
    const provider = text(row.firebaseId);
    if (provider) mapping.set(provider, id);
  }
  const canonicalIds = [...new Set([...registry.keys(), ...existing.map((p) => resolve(p.placeId))
    .filter((id, index) => id && (id !== existing[index].placeId || !!existing[index].canonicalPlaceId || id.startsWith("PLC-")))])];
  const missingRegistryIds = canonicalIds.filter((id) => !registry.has(id));
  for (let i = 0; i < missingRegistryIds.length; i += 100) {
    const rows = await db.getAll(...missingRegistryIds.slice(i, i + 100).map((id) => db.collection("place_registry").doc(id)));
    for (const row of rows) { remember(row); if (row.exists) registry.set(row.id, row.data()!); }
  }
  for (const [id, row] of registry) {
    const provider = text(row.firebaseId);
    if (provider) mapping.set(provider, id);
  }
  // Reverse aliases keep pre-registration provider history when an outlet gets
  // a canonical identity later. No name-only identity guesses.
  for (let i = 0; i < canonicalIds.length; i += 30) {
    const aliases = await db.collection("place_migration_aliases")
      .where("canonicalPlaceId", "in", canonicalIds.slice(i, i + 30)).limit(2001).get();
    if (aliases.size > 2000) throw new Error("recommendation_aliases_truncated");
    for (const doc of aliases.docs) {
      remember(doc);
      if (doc.data().status === "blocked" || doc.data().active === false) continue;
      const target = text(doc.data().canonicalPlaceId);
      if (target) mapping.set(doc.id, target);
    }
  }
  const publications = new Map<string, Record<string, unknown> | null>();
  for (let i = 0; i < canonicalIds.length; i += 100) {
    const chunk = canonicalIds.slice(i, i + 100);
    const heads = await db.getAll(...chunk.map((id) => db.collection("place_publication_heads").doc(id)));
    const publicationIds = heads.map((head) => text(head.data()?.activePublicationId));
    const refs = publicationIds.filter((id): id is string => !!id).map((id) => db.collection("place_publications").doc(id));
    const snapshots = refs.length ? await db.getAll(...refs) : [];
    heads.forEach(remember); snapshots.forEach(remember);
    const byId = new Map(snapshots.map((s) => [s.id, s.data()]));
    for (let j = 0; j < chunk.length; j++) {
      const id = chunk[j];
      const p = byId.get(publicationIds[j] ?? "");
      const lifecycle = registry.get(id)?.lifecycleStatus;
      publications.set(id, registry.has(id) && p && p.publicationStatus === "published" && p.blocked !== true &&
        !["blocked", "suspended", "inactive", "deleted"].includes(String(lifecycle)) ? p : null);
    }
  }
  const canonical = new Map<string, PlaceCandidate>();
  for (const [id, p] of publications) {
    if (!p) continue;
    const lat = number(p.lat) ?? number(p.latitude);
    const lng = number(p.lng) ?? number(p.longitude);
    const name = text(p.title) ?? text(p.name);
    if (lat == null || lng == null || !name) continue;
    const candidate = buildMasterRegistryCandidate({canonicalPlaceId: id, name,
      latitude: lat, longitude: lng, address: text(p.address), primaryCategory: p.primaryCategory,
      cuisineTags: p.cuisineTags, priceRange: p.priceRange, businessStatus: p.businessStatus ?? p.businessState,
      openingHours: p.openingHours, coverImageUrl: p.coverImageUrl, nowMs: now});
    candidate.distanceKm = haversineMeters(location.lat, location.lng, lat, lng) / 1000;
    // Narrow evidence fields only. No owner/SSM/review payload enters the pool.
    const halalStatus = text(p.halalStatus) ?? text(p.halalState);
    if (halalStatus) candidate.halalStatus = halalStatus;
    candidate.dietaryReported = Array.isArray(p.dietaryReported) ? p.dietaryReported.filter((v): v is string => typeof v === "string") : [];
    candidate.allergenReported = Array.isArray(p.allergenReported) ? p.allergenReported.filter((v): v is string => typeof v === "string") : [];
    candidate.menuItems = Array.isArray(p.menuItems) ? p.menuItems.slice(0, 200).flatMap((v) => {
      if (!v || typeof v !== "object") return [];
      const item = v as Record<string, unknown>;
      const price = number(item.price);
      return typeof item.name === "string" && price != null && price >= 0 && item.available !== false &&
        (item.section === "makanan" || item.section === "minuman")
        ? [{name: item.name.slice(0, 120), price, available: true, section: item.section as "makanan" | "minuman"}] : [];
    }) : [];
    canonical.set(id, candidate);
  }
  const out = new Map<string, PlaceCandidate>();
  const allowSynthetic = decideSyntheticPlaces({env: process.env}).active;
  for (const original of existing) {
    const id = resolve(original.placeId);
    if (!id || isFictionalPlaceId(id)) continue;
    if (isQaSyntheticPlaceId(id) && !allowSynthetic) continue;
    if (publications.has(id) && !publications.get(id)) continue;
    const fresh = canonical.get(id);
    const candidate = fresh ? {...fresh,
      rating: original.rating, userRatingCount: original.userRatingCount,
      photoUrl: fresh.photoUrl ?? original.photoUrl ?? null,
    } : {...original, ...(id !== original.placeId ? {canonicalPlaceId: id} : {})};
    if (!fresh && candidate.openingPeriods != null) candidate.isOpen = isOpenAtMalaysia(candidate.openingPeriods, now);
    if (candidate.lat != null && candidate.lng != null) candidate.distanceKm = haversineMeters(location.lat, location.lng, candidate.lat, candidate.lng) / 1000;
    if (candidate.distanceKm * 1000 <= location.radiusMeters) out.set(id, candidate);
  }
  for (const [id, candidate] of canonical) {
    if (includePublished && candidate.distanceKm * 1000 <= location.radiusMeters && !out.has(id)) out.set(id, candidate);
  }
  const aliases: Record<string, string[]> = {};
  for (const [id, candidate] of out) aliases[id] = [...new Set([id, candidate.placeId])];
  for (const provider of mapping.keys()) {
    const id = resolve(provider);
    if (aliases[id]) aliases[id].push(provider);
  }
  if (out.size > 300) throw new Error("recommendation_pool_requires_pagination");
  const publicCandidates = [...out.values()].map((candidate) => {
    const allowed: Array<keyof PlaceCandidate> = ["placeId", "name", "cuisine", "emoji", "rating", "userRatingCount",
      "priceLevel", "distanceKm", "isOpen", "address", "matchScore", "matchReasonKeys", "negativeSignals", "priceEstimate",
      "photoUrl", "openingPeriods", "dataSource", "canonicalPlaceId", "lat", "lng", "halalStatus", "dietaryReported", "allergenReported", "menuItems"];
    return Object.fromEntries(allowed.filter((field) => candidate[field] !== undefined).map((field) => [field, candidate[field]])) as unknown as PlaceCandidate;
  });
  return {candidates: publicCandidates, aliases,
    versionChecks: [...checks].map(([path, version]) => ({path, version}))};
}
