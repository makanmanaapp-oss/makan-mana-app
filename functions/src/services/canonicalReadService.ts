/**
 * Phase 1.14G — perkhidmatan baca kanonikal server-mediated (I/O).
 *
 * Membaca koleksi kanonikal SERVER-ONLY (place_migration_aliases →
 * place_registry → place_publication_heads → place_publications) melalui Admin
 * SDK, kemudian menerapkan overlay TULEN. Digunakan oleh getNearbyPlaces &
 * getSuggestions UNTUK KOHORT SAHAJA. Awam tidak pernah memanggil ini.
 *
 * TIDAK PERNAH menulis. TIDAK PERNAH mendedahkan koleksi server-only kepada klien.
 */
import { db } from "../config/firebase";
import {
  CanonicalOverlayResult,
  CanonicalPlaceView,
  overlayCanonicalCandidate,
} from "../domain/places/canonical/canonicalReadResolver";
import { PlaceCandidate } from "../types/place";

const C_ALIAS = "place_migration_aliases";
const C_REGISTRY = "place_registry";
const C_HEAD = "place_publication_heads";
const C_PUB = "place_publications";
const MAX_ALIAS_HOPS = 8;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

interface ResolvedCanonical {
  aliasResolved: boolean;
  view: CanonicalPlaceView | null;
}

/** Selesaikan providerId → kanonikal + penerbitan aktif (BACA server-only). */
export async function readCanonicalForProvider(providerId: string): Promise<ResolvedCanonical> {
  if (!providerId) return { aliasResolved: false, view: null };

  // 1) alias: providerId → canonicalPlaceId (bounded hops, tolak gelung).
  let current = providerId;
  const seen = new Set<string>([current]);
  let canonicalId: string | null = null;
  for (let hop = 0; hop < MAX_ALIAS_HOPS; hop++) {
    const aliasDoc = await db.collection(C_ALIAS).doc(current).get();
    if (!aliasDoc.exists) break;
    const d = aliasDoc.data() ?? {};
    if (d.status === "blocked") return { aliasResolved: false, view: null };
    const next = str(d.canonicalPlaceId);
    if (!next) break;
    canonicalId = next;
    if (next === current) break;
    if (seen.has(next)) return { aliasResolved: false, view: null }; // gelung
    seen.add(next);
    current = next;
    // Jika next ialah ID kanonikal (bukan alias lain), berhenti.
    const nextAlias = await db.collection(C_ALIAS).doc(next).get();
    if (!nextAlias.exists) break;
  }
  if (!canonicalId) return { aliasResolved: false, view: null };

  // 2) registry + head + publication aktif.
  const [regSnap, headSnap] = await Promise.all([
    db.collection(C_REGISTRY).doc(canonicalId).get(),
    db.collection(C_HEAD).doc(canonicalId).get(),
  ]);
  if (!regSnap.exists || !headSnap.exists) return { aliasResolved: true, view: null };
  const activePubId = str(headSnap.data()?.activePublicationId);
  if (!activePubId) return { aliasResolved: true, view: null };
  const pubSnap = await db.collection(C_PUB).doc(activePubId).get();
  if (!pubSnap.exists) return { aliasResolved: true, view: null };
  const p = pubSnap.data() ?? {};
  if (p.blocked === true || p.publicationStatus !== "published") {
    return { aliasResolved: true, view: null };
  }
  const lat = num(p.lat);
  const lng = num(p.lng);
  if (lat === undefined || lng === undefined) return { aliasResolved: true, view: null };

  const view: CanonicalPlaceView = {
    canonicalPlaceId: canonicalId,
    providerPlaceId: providerId,
    title: str(p.title) ?? "",
    address: str(p.address) ?? null,
    lat,
    lng,
    ratingState: str(p.ratingState) ?? "rating_hidden",
    priceState: str(p.priceState) ?? "price_unknown",
    hoursState: str(p.hoursState) ?? "hours_unknown",
    businessState: str(p.businessState) ?? "status_unknown",
    halalState: str(p.halalState) ?? "halal_unknown",
    publicationId: activePubId,
    publicationVersion: num(p.versionNumber) ?? 1,
  };
  return { aliasResolved: true, view };
}

export interface CanonicalOverlaySummary {
  canonicalCount: number;
  legacyCount: number;
  results: CanonicalOverlayResult[];
}

/**
 * Terapkan overlay kanonikal ke atas SENARAI calon (kohort sahaja). Kekalkan
 * susunan + kiraan. Bacaan selari (bounded oleh saiz senarai kecil ≤12).
 */
export async function applyCanonicalOverlay(
  candidates: readonly PlaceCandidate[],
  opts: { cohortEligible: boolean; forceLegacy: boolean; includeDebug: boolean },
): Promise<CanonicalOverlaySummary> {
  // Bukan kohort / override → legasi tidak berubah (tiada bacaan server-only).
  if (!opts.cohortEligible || opts.forceLegacy) {
    const results = candidates.map((c) =>
      overlayCanonicalCandidate(c, null, {
        cohortEligible: opts.cohortEligible,
        forceLegacy: opts.forceLegacy,
        aliasResolved: false,
        includeDebug: opts.includeDebug,
      }),
    );
    return summarize(results);
  }

  // Toleran-ralat: kegagalan bacaan kanonikal → legasi (tidak pernah merosakkan
  // permintaan kohort). Ini menguatkuasakan "canonical failure → legacy fallback".
  const safeRead = async (providerId: string): Promise<ResolvedCanonical> => {
    try {
      return await readCanonicalForProvider(providerId);
    } catch (e) {
      console.error("canonicalRead: fallback legasi atas ralat:", e instanceof Error ? e.message : e);
      return { aliasResolved: false, view: null };
    }
  };
  const resolved = await Promise.all(candidates.map((c) => safeRead(c.placeId)));
  const results = candidates.map((c, i) =>
    overlayCanonicalCandidate(c, resolved[i].view, {
      cohortEligible: true,
      forceLegacy: false,
      aliasResolved: resolved[i].aliasResolved,
      includeDebug: opts.includeDebug,
    }),
  );
  return summarize(results);
}

function summarize(results: CanonicalOverlayResult[]): CanonicalOverlaySummary {
  let canonicalCount = 0;
  let legacyCount = 0;
  for (const r of results) {
    if (r.dataSource === "canonical") canonicalCount++;
    else legacyCount++;
  }
  return { canonicalCount, legacyCount, results };
}
