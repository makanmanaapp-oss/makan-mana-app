/**
 * SCALABLE AREA CACHE — pure storage contract.
 *
 * The old shape stored every candidate for a cell inside ONE Firestore document
 * as `candidates: [...]`, capped at 400 and written with `set`. Because that is a
 * single array field, the cap was destructive: candidate #401 was not "hidden
 * until later", it was written out of the cell. A Firestore document-size limit
 * had quietly become a statement about how many restaurants MakanMana may have.
 *
 * The new shape is one document per candidate:
 *
 *     area_place_cache/{cellId}                       // lightweight metadata
 *     area_place_cache/{cellId}/candidates/{identity} // one restaurant each
 *
 * Nothing here talks to Firestore. Keeping the identity scheme, the merge and
 * the cursor arithmetic pure is what lets 401 and 1000 candidates be tested
 * deterministically, without the emulator and without touching Google Places.
 */
import {PlaceCandidate} from "../../../types/place";
import {
  canonicalCandidateKey,
  dedupeCanonicalCandidates,
} from "../canonical/canonicalCandidatePool";

/** Schema marker written on a cell once its candidates live in the subcollection. */
export const AREA_CACHE_SCHEMA_VERSION = 2;

/**
 * How many candidate documents one read page asks for.
 *
 * A page size, not a ceiling: `readAll` style callers keep paging until the
 * cursor is exhausted. Firestore caps a single query at far more than this;
 * the smaller number simply keeps one round trip cheap.
 */
export const CANDIDATE_READ_PAGE_SIZE = 500;

/**
 * Safety ceiling for how many candidates ONE request will pull into memory for
 * a single cell.
 *
 * This is a request-shaping limit, never a storage limit — every candidate
 * remains stored and retrievable by paging. When it bites, the reader reports
 * `truncated: true` rather than pretending it saw everything, because a silent
 * truncation reads exactly like "that is all the restaurants there are".
 */
export const MAX_CANDIDATES_READ_PER_CELL = 5000;

/** Firestore rejects these as document ids. */
const RESERVED_DOC_IDS = new Set([".", ".."]);

/**
 * Deterministic, stable document id for a candidate.
 *
 * Reuses `canonicalCandidateKey` — canonical id when the server has proven one,
 * otherwise the provider id — so the document id IS the dedupe key. Two writers
 * racing on the same restaurant converge on one document instead of appending
 * twice, which is the property the old array could never have.
 *
 * Returns null when there is no usable identity; the caller must skip rather
 * than invent one.
 */
export function candidateDocId(candidate: PlaceCandidate): string | null {
  const raw = canonicalCandidateKey(candidate)?.trim();
  if (!raw) return null;
  // Firestore ids may not contain "/", may not be "."/"..", may not look like
  // __internal__, and are limited to 1500 bytes. Place ids are already safe
  // alphanumerics; this is defensive, not transformative.
  const safe = raw.replace(/\//g, "_");
  if (!safe || RESERVED_DOC_IDS.has(safe)) return null;
  if (/^__.*__$/.test(safe)) return null;
  if (Buffer.byteLength(safe, "utf8") > 1500) return null;
  return safe;
}

/**
 * An opaque continuation cursor for one cell's candidate subcollection.
 *
 * The anchor is the last document id returned. Firestore orders by `__name__`
 * lexicographically by UTF-8 byte order, which is total and stable: two
 * documents can never compare equal (ids are unique), so there is no tie to
 * break and no second sort key is needed. That matters twice over:
 *
 *  - it is deterministic under concurrent writes — a document inserted while
 *    paging either sorts before the anchor (already passed, so it is missed
 *    this pass but present on the next read) or after it (seen normally). It
 *    can never cause an already-returned document to repeat.
 *  - `__name__` ordering needs no composite index, so this design requires no
 *    index deployment at all.
 */
export interface CandidateCursor {
  cellId: string;
  /** Document id of the last candidate returned, or null to start. */
  after: string | null;
}

export function startCursor(cellId: string): CandidateCursor {
  return {cellId, after: null};
}

export function nextCursor(
  cellId: string,
  page: readonly {id: string}[],
): CandidateCursor | null {
  if (page.length === 0) return null;
  return {cellId, after: page[page.length - 1].id};
}

export interface CellReadResult {
  candidates: PlaceCandidate[];
  /** True when the per-request ceiling stopped the read before exhaustion. */
  truncated: boolean;
  /** How many documents were actually read, for honest diagnostics. */
  readCount: number;
}

/**
 * Merge what the two storage generations know about one cell.
 *
 * During migration a cell may hold candidates in the legacy array, in the
 * subcollection, or in both. The subcollection is authoritative: it is where
 * new writes land, so its copy is the fresher one. Legacy entries fill the gaps
 * for cells not yet backfilled.
 *
 * After the union, `dedupeCanonicalCandidates` runs exactly as it always has —
 * so a restaurant that exists as a provider row in the legacy array and as a
 * canonical row in the subcollection collapses to the canonical one, and the
 * near-duplicate rule (exact normalized name, <=35 m, one side direct
 * canonical) is unchanged. Dedupe is not reimplemented here.
 */
export function mergeCellCandidates(
  legacy: readonly PlaceCandidate[],
  scalable: readonly PlaceCandidate[],
): PlaceCandidate[] {
  const byId = new Map<string, PlaceCandidate>();

  // Subcollection first so it wins the identity slot on collision.
  for (const candidate of scalable) {
    const id = candidateDocId(candidate);
    if (id) byId.set(id, candidate);
  }
  for (const candidate of legacy) {
    const id = candidateDocId(candidate);
    if (id && !byId.has(id)) byId.set(id, candidate);
  }

  // Identity-slot merging above only catches EXACT id matches. The canonical
  // dedupe below is what collapses a provider alias against its canonical
  // restaurant, across both storage generations.
  return dedupeCanonicalCandidates([...byId.values()]);
}

/**
 * Split a list of writes into Firestore-batch-sized chunks.
 *
 * A Firestore batch accepts at most 500 operations. Chunking is what lets a
 * 1000-candidate cell be written at all — the old code could not have, because
 * it was one document.
 */
export function chunkForBatch<T>(items: readonly T[], size = 450): T[][] {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Candidates that carry a usable identity, keyed for writing.
 *
 * Anything without an identity is dropped here deliberately and visibly: it
 * could never have been deduped or retrieved reliably anyway.
 */
export function keyedForWrite(
  candidates: readonly PlaceCandidate[],
): {id: string; candidate: PlaceCandidate}[] {
  const out: {id: string; candidate: PlaceCandidate}[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const id = candidateDocId(candidate);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({id, candidate});
  }
  return out;
}
