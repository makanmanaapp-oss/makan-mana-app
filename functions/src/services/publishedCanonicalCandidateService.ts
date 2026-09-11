import type {DocumentReference, DocumentSnapshot} from "firebase-admin/firestore";

import {db} from "../config/firebase";
import {projectPublicRestaurantProfileV2} from "../domain/merchant/publicRestaurantProfile";
import {
  AliasToCanonical,
  canonicalCandidateFromProfile,
  mergeCanonicalPreferred,
  rankCanonicalSearch,
} from "../domain/places/canonical/publishedCanonicalCandidates";
import {PlaceCandidate} from "../types/place";

const C_REGISTRY = "place_registry";
const C_HEAD = "place_publication_heads";
const C_PUBLICATION = "place_publications";
const C_ALIAS = "place_migration_aliases";
const MASTER_PROVENANCE = "makanmana_master_registry";
const MAX_MASTER_PLACES = 250;
const GET_ALL_CHUNK = 100;
const ALIAS_IN_CHUNK = 30;

type Plain = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function getDocsByRefs(refs: DocumentReference[]): Promise<DocumentSnapshot[]> {
  const out: DocumentSnapshot[] = [];
  for (let i = 0; i < refs.length; i += GET_ALL_CHUNK) {
    out.push(...await db.getAll(...refs.slice(i, i + GET_ALL_CHUNK)));
  }
  return out;
}

export interface PublishedCanonicalCandidateSource {
  candidates: PlaceCandidate[];
  aliasToCanonical: AliasToCanonical;
  registryCount: number;
  publishedCount: number;
}

/**
 * Read the bounded first-party MakanMana Master Place Registry and project only
 * ACTIVE immutable publications into the same PlaceCandidate contract used by
 * Google/area candidates. Canonical collections stay server-only.
 */
export async function readPublishedMakanManaCandidateSource(opts: {
  centerLat?: number;
  centerLng?: number;
  radiusMeters?: number;
  nowMs?: number;
} = {}): Promise<PublishedCanonicalCandidateSource> {
  const registry = await db.collection(C_REGISTRY)
    .where("provenanceSource", "==", MASTER_PROVENANCE)
    .limit(MAX_MASTER_PLACES)
    .get();

  if (registry.empty) {
    return {candidates: [], aliasToCanonical: {}, registryCount: 0, publishedCount: 0};
  }

  const canonicalIds = registry.docs.map((doc) => doc.id);
  const headRefs = canonicalIds.map((id) => db.collection(C_HEAD).doc(id));
  const headSnaps = await getDocsByRefs(headRefs);
  const publicationByCanonical = new Map<string, string>();
  for (let i = 0; i < headSnaps.length; i++) {
    const activePublicationId = text(headSnaps[i].data()?.activePublicationId);
    if (headSnaps[i].exists && activePublicationId) {
      publicationByCanonical.set(canonicalIds[i], activePublicationId);
    }
  }

  const publicationEntries = [...publicationByCanonical.entries()];
  const publicationRefs = publicationEntries.map(([, publicationId]) =>
    db.collection(C_PUBLICATION).doc(publicationId));
  const publicationSnaps = await getDocsByRefs(publicationRefs);

  const candidates: PlaceCandidate[] = [];
  const nowMs = opts.nowMs ?? Date.now();
  const hasRadius = typeof opts.radiusMeters === "number" && Number.isFinite(opts.radiusMeters) && opts.radiusMeters >= 0;
  for (let i = 0; i < publicationSnaps.length; i++) {
    const snapshot = publicationSnaps[i];
    if (!snapshot.exists) continue;
    const canonicalPlaceId = publicationEntries[i][0];
    const profile = projectPublicRestaurantProfileV2(snapshot.data(), canonicalPlaceId);
    if (!profile) continue;
    const candidate = canonicalCandidateFromProfile(profile, {
      centerLat: opts.centerLat,
      centerLng: opts.centerLng,
      nowMs,
    });
    if (!candidate) continue;
    if (hasRadius && candidate.distanceKm * 1000 > opts.radiusMeters!) continue;
    candidates.push(candidate);
  }

  // Aliases are read by canonical target in bounded `in` batches. This avoids
  // one read per provider candidate and makes provider/canonical dedupe stable.
  const aliasToCanonical: Record<string, string> = {};
  for (let i = 0; i < canonicalIds.length; i += ALIAS_IN_CHUNK) {
    const chunk = canonicalIds.slice(i, i + ALIAS_IN_CHUNK);
    const aliases = await db.collection(C_ALIAS).where("canonicalPlaceId", "in", chunk).get();
    for (const doc of aliases.docs) {
      const data = (doc.data() ?? {}) as Plain;
      if (data.status === "blocked") continue;
      const target = text(data.canonicalPlaceId);
      if (target) aliasToCanonical[doc.id] = target;
    }
  }
  // The Master bridge also stores a direct firebase/provider id on registry.
  for (const doc of registry.docs) {
    const firebaseId = text(doc.data()?.firebaseId);
    if (firebaseId) aliasToCanonical[firebaseId] = doc.id;
  }

  return {
    candidates,
    aliasToCanonical,
    registryCount: registry.size,
    publishedCount: candidates.length,
  };
}

/** Merge first-party published places into a provider/area pool before ranking. */
export async function mergePublishedMakanManaCandidates(
  existing: readonly PlaceCandidate[],
  opts: {centerLat: number; centerLng: number; radiusMeters: number; nowMs?: number},
): Promise<{candidates: PlaceCandidate[]; canonicalCount: number}> {
  const source = await readPublishedMakanManaCandidateSource({
    centerLat: opts.centerLat,
    centerLng: opts.centerLng,
    radiusMeters: opts.radiusMeters,
    nowMs: opts.nowMs,
  });
  return {
    candidates: mergeCanonicalPreferred(existing, source.candidates, source.aliasToCanonical),
    canonicalCount: source.candidates.length,
  };
}

/** Bounded server-side exact/prefix/contains search over active first-party places. */
export async function searchPublishedMakanManaPlaces(opts: {
  query: string;
  limit?: number;
  centerLat?: number;
  centerLng?: number;
  nowMs?: number;
}): Promise<PlaceCandidate[]> {
  const source = await readPublishedMakanManaCandidateSource({
    centerLat: opts.centerLat,
    centerLng: opts.centerLng,
    nowMs: opts.nowMs,
  });
  return rankCanonicalSearch(source.candidates, opts.query, opts.limit ?? 20);
}
