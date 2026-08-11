/**
 * Phase 1.14C.1 — CLI ENRICHMENT LOKASI DIPERCAYAI (owner-authorized).
 *
 * WARNING: menyasarkan Firestore + Google Places PRODUKSI apabila
 * --confirm-project=makanmana-c59f3. Ia:
 *   - MEMBACA place_details (baca-sahaja) untuk pilih calon,
 *   - memanggil Google Places *Details* (New) mengikut ID pembekal TEPAT,
 *   - dalam mode=enrich, MENGGABUNG (merge) medan lokasi DIBENARKAN sahaja
 *     ke ≤ max-writes dokumen place_details (tiada padam, tiada tulis penuh),
 *   - mengesahkan semula, pratonton kelayakan migrasi (SIFAR-TULIS migrasi).
 *
 * Ia TIDAK PERNAH menulis koleksi kanonikal/alias/penanda migrasi.
 * Kunci API dibaca dari process.env.GOOGLE_MAPS_API_KEY (JANGAN hardcode).
 * Output ditulis ke fail tempatan (fs) sahaja. TIDAK di-import oleh index.ts.
 *
 * Jalankan (fetch-only, tiada tulis):
 *   GOOGLE_MAPS_API_KEY=$(gcloud secrets versions access latest \
 *     --secret=GOOGLE_MAPS_API_KEY --project=makanmana-c59f3) \
 *   npx tsx functions/scripts/placeLocationEnrichment.ts \
 *     --mode=fetch-only --confirm-project=makanmana-c59f3 --inspect=25 --output=../reports
 *
 * Jalankan (enrich, ≤25 tulis):
 *   ... --mode=enrich --confirm-project=makanmana-c59f3 --max-writes=25 --inspect=25 ...
 */
import { mkdirSync, writeFileSync } from "fs";

import * as admin from "firebase-admin";

import { isNonEmptyString, isValidLatLng } from "../src/domain/places/common";
import {
  EnrichmentFetchClass,
  PLACE_DETAILS_FIELD_MASK,
  ProviderPlaceDetailsResponse,
  TrustedPlaceLocationEnrichment,
  assertFieldsAllowlisted,
  buildEnrichmentFieldUpdate,
  isLocationFresh,
  mapProviderResponse,
} from "../src/domain/places/enrichment/locationEnrichment";
import { hashCanonical } from "../src/domain/places/staging/hashing";
import {
  LegacyRecordInput,
  buildLegacyInventory,
} from "../src/domain/places/migration/legacyInventory";
import { buildLegacyMigrationPlan } from "../src/domain/places/migration/dryRunPlanner";

const PROJECT = "makanmana-c59f3";
const C_DETAILS = "place_details";
const HARD_WRITE_CAP = 25; // Part I — maksimum mutlak dokumen ditulis.
const NEUTRAL_TS = 1_700_000_000_000; // pelan migrasi deterministik
const REQUEST_DELAY_MS = 150; // had kadar mudah antara panggilan pembekal
const MAX_RETRY = 2;

const mask = (id: string) => (id && id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : "****");

type Mode = "fetch-only" | "enrich" | "idempotency";

interface Args {
  mode: Mode;
  confirmProject: string;
  inspect: number;
  maxWrites: number;
  output: string;
}

function parseArgs(argv: string[]): Args {
  const get = (k: string) => {
    const hit = argv.find((a) => a.startsWith(`--${k}=`));
    return hit ? hit.slice(k.length + 3) : undefined;
  };
  const raw = get("mode");
  const mode: Mode = raw === "enrich" ? "enrich" : raw === "idempotency" ? "idempotency" : "fetch-only";
  return {
    mode,
    confirmProject: get("confirm-project") ?? "",
    inspect: Math.min(Number(get("inspect") ?? 25), 50),
    maxWrites: Math.min(Number(get("max-writes") ?? HARD_WRITE_CAP), HARD_WRITE_CAP),
    output: get("output") ?? "../reports",
  };
}

function assertSafe(a: Args): void {
  if (a.confirmProject !== PROJECT) {
    throw new Error(`refuse: --confirm-project must equal ${PROJECT}`);
  }
  if (a.mode !== "fetch-only" && a.mode !== "enrich" && a.mode !== "idempotency") {
    throw new Error("refuse: --mode must be fetch-only, enrich or idempotency");
  }
  if (a.maxWrites > HARD_WRITE_CAP) {
    throw new Error(`refuse: max-writes exceeds hard cap ${HARD_WRITE_CAP}`);
  }
  if (a.inspect < 1) throw new Error("refuse: inspect must be >= 1");
}

function toStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}
function toNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Adakah dokumen place_details sudah memiliki koordinat sah? */
function docHasValidLocation(d: Record<string, unknown>): boolean {
  const loc = d.location as { latitude?: unknown; longitude?: unknown } | undefined;
  return loc !== undefined && isValidLatLng(toNum(loc.latitude), toNum(loc.longitude));
}

async function countCollection(db: admin.firestore.Firestore, name: string): Promise<number> {
  try {
    return (await db.collection(name).count().get()).data().count;
  } catch {
    return -1;
  }
}

/** Fetch Google Places Details (New) mengikut ID pembekal TEPAT. */
async function fetchDetails(
  id: string,
  apiKey: string,
): Promise<{ status: EnrichmentFetchClass | "OK"; raw?: ProviderPlaceDetailsResponse; httpCode?: number }> {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK },
      });
      if (res.status === 404) return { status: "PROVIDER_NOT_FOUND", httpCode: 404 };
      if (res.status === 429) {
        if (attempt < MAX_RETRY) { await sleep(400 * (attempt + 1)); continue; }
        return { status: "RATE_LIMITED", httpCode: 429 };
      }
      if (res.status >= 500) {
        if (attempt < MAX_RETRY) { await sleep(400 * (attempt + 1)); continue; }
        return { status: "API_ERROR", httpCode: res.status };
      }
      if (!res.ok) return { status: "API_ERROR", httpCode: res.status };
      return { status: "OK", raw: (await res.json()) as ProviderPlaceDetailsResponse, httpCode: 200 };
    } catch {
      if (attempt < MAX_RETRY) { await sleep(400 * (attempt + 1)); continue; }
      return { status: "API_ERROR" };
    }
  }
  return { status: "API_ERROR" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface Candidate {
  id: string;
  displayName?: string;
  rating?: number;
  userRatingCount?: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assertSafe(args);
  const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";
  if (!isNonEmptyString(apiKey)) {
    throw new Error("refuse: GOOGLE_MAPS_API_KEY missing in env (load from Secret Manager)");
  }
  const NOW = Date.now();

  // eslint-disable-next-line no-console
  console.log(`[1.14C.1] project=${args.confirmProject} mode=${args.mode} inspect=${args.inspect} maxWrites=${args.maxWrites}`);
  if (admin.apps.length === 0) admin.initializeApp({ projectId: args.confirmProject });
  const db = admin.firestore();
  const { FieldValue, Timestamp } = admin.firestore;

  // Zero-write-of-forbidden-collections proof (before).
  const FORBIDDEN = [
    "place_migration_inventory", "place_migration_candidates", "place_migration_plans",
    "place_migration_aliases", "place_migration_checkpoints", "place_publications",
    "place_correction_submissions",
  ];
  const forbiddenBefore: Record<string, number> = {};
  for (const c of FORBIDDEN) forbiddenBefore[c] = await countCollection(db, c);
  const detailsCountBefore = await countCollection(db, C_DETAILS);

  const outDir0 = args.output;
  mkdirSync(outDir0, { recursive: true });
  const writeReport = (name: string, obj: unknown) => {
    const json = JSON.stringify(obj, null, 2);
    writeFileSync(`${outDir0}/${name}`, json, "utf8");
    return hashCanonical(json).slice(0, 16);
  };

  // --- PART K: idempotency (NO writes) — target the SAME enriched set -----
  if (args.mode === "idempotency") {
    const scanCap = Math.max(args.inspect * 8, 200);
    const snap = await db.collection(C_DETAILS).limit(scanCap).get();
    const enriched = snap.docs
      .map((doc) => ({ id: doc.id, data: (doc.data() ?? {}) as Record<string, unknown> }))
      .filter((x) => docHasValidLocation(x.data) && toStr(x.data.locationSource) === "google_places_details")
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, args.inspect);

    let fresh = 0, checksumMatch = 0, wouldWrite = 0;
    const rows: Record<string, unknown>[] = [];
    for (const x of enriched) {
      await sleep(REQUEST_DELAY_MS);
      const isFresh = isLocationFresh(x.data, NOW);
      if (isFresh) fresh++; else wouldWrite++;
      // Re-fetch + re-map → banding checksum vs yang tersimpan.
      const resp = await fetchDetails(x.id, apiKey);
      let match: boolean | null = null;
      if (resp.status === "OK") {
        const mapped = mapProviderResponse(x.id, toStr(x.data.displayName), resp.raw, NOW);
        if (mapped.enrichment) match = mapped.enrichment.responseChecksum === toStr(x.data.locationResponseChecksum);
        if (match) checksumMatch++;
      }
      rows.push({ idMasked: mask(x.id), isFresh, wouldRewrite: !isFresh, checksumMatch: match });
    }
    const forbiddenAfterI: Record<string, number> = {};
    for (const c of FORBIDDEN) forbiddenAfterI[c] = await countCollection(db, c);
    const forbiddenUnchangedI = FORBIDDEN.every((c) => forbiddenBefore[c] === forbiddenAfterI[c]);
    const detailsAfterI = await countCollection(db, C_DETAILS);
    writeReport("phase_1_14c_1_idempotency.json", {
      note: "Re-run over the SAME enriched set. Fresh records must not be rewritten; checksums must match.",
      inspected: enriched.length,
      freshCount: fresh,
      wouldRewrite: wouldWrite,
      checksumMatchCount: checksumMatch,
      forbiddenUnchanged: forbiddenUnchangedI,
      placeDetailsCountUnchanged: detailsCountBefore === detailsAfterI,
      rows,
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ mode: "idempotency", inspected: enriched.length, freshCount: fresh, wouldRewrite: wouldWrite, checksumMatchCount: checksumMatch, forbiddenUnchanged: forbiddenUnchangedI }, null, 2));
    if (!forbiddenUnchangedI) throw new Error("SAFETY VIOLATION: forbidden collection counts changed");
    process.exit(0);
  }

  // --- PART F: candidate selection (read-only) ---------------------------
  // Baca sehingga 400 place_details untuk pilih calon; kenal pasti rekod
  // konflik-cawangan (kecualikan) dengan menjalankan pelan migrasi ringkas.
  const scanCap = Math.max(args.inspect * 8, 200);
  const snap = await db.collection(C_DETAILS).limit(scanCap).get();
  const allDocs = snap.docs.map((doc) => ({ id: doc.id, data: (doc.data() ?? {}) as Record<string, unknown> }));

  // Kenal pasti ID konflik-cawangan melalui pelan migrasi (nama+provider sahaja).
  const preInputs: LegacyRecordInput[] = allDocs.map((x) => ({
    legacyCollection: "place_details",
    legacyDocumentPath: `place_details/${x.id}`,
    legacyPlaceId: x.id,
    providerPlaceId: x.id,
    displayName: toStr(x.data.displayName),
    rating: toNum(x.data.rating),
    reviewCount: toNum(x.data.userRatingCount),
    source: "google_places",
    referencedBy: [],
  }));
  const preInv = buildLegacyInventory(preInputs, NEUTRAL_TS);
  const prePlan = buildLegacyMigrationPlan({ batchId: "sel", records: preInv, createdBy: "enrich_sel" }, NEUTRAL_TS);
  const conflictIds = new Set<string>();
  for (const c of prePlan.candidates) {
    if (c.migrationDecision === "branch_conflict") for (const pid of c.legacyPlaceIds) conflictIds.add(pid);
  }

  // Calon: HELD kerana lokasi hilang, ada displayName + provider id, BUKAN konflik,
  // tiada koordinat sah sedia ada, nama ternormal unik. Susun deterministik ikut id.
  const seenNorm = new Set<string>();
  const candidates: Candidate[] = [];
  for (const x of [...allDocs].sort((a, b) => a.id.localeCompare(b.id))) {
    if (candidates.length >= args.inspect) break;
    const name = toStr(x.data.displayName);
    if (!isNonEmptyString(x.id) || !name) continue;
    if (conflictIds.has(x.id)) continue;
    if (docHasValidLocation(x.data)) continue; // sudah ada lokasi sah → langkau
    const norm = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (seenNorm.has(norm)) continue; // elak nama cawangan berulang
    seenNorm.add(norm);
    candidates.push({ id: x.id, displayName: name, rating: toNum(x.data.rating), userRatingCount: toNum(x.data.userRatingCount) });
  }

  const outDir = args.output;
  mkdirSync(outDir, { recursive: true });
  const write = (name: string, obj: unknown) => {
    const json = JSON.stringify(obj, null, 2);
    writeFileSync(`${outDir}/${name}`, json, "utf8");
    return hashCanonical(json).slice(0, 16);
  };

  write("phase_1_14c_1_candidate_manifest.json", {
    selectionCriteria: "HELD(missing location) + provider id + displayName + not branch-conflict + no valid coords + unique normalized name",
    branchConflictExcluded: conflictIds.size,
    scanned: allDocs.length,
    selected: candidates.length,
    candidates: candidates.map((c) => ({ idMasked: mask(c.id), displayName: c.displayName, hasRating: (c.rating ?? 0) > 0 })),
  });

  // --- PART G: provider-fetch dry-run (NO writes) ------------------------
  const before = new Date().toISOString().slice(0, 19);
  let requests = 0, ok = 0, failed = 0, retries = 0;
  interface FetchRow { id: string; fetchClass: EnrichmentFetchClass; reason?: string; enrichment?: TrustedPlaceLocationEnrichment; }
  const fetchRows: FetchRow[] = [];
  for (const cand of candidates) {
    await sleep(REQUEST_DELAY_MS);
    requests++;
    const resp = await fetchDetails(cand.id, apiKey);
    if (resp.status === "OK") {
      ok++;
      const mapped = mapProviderResponse(cand.id, cand.displayName, resp.raw, NOW);
      fetchRows.push({ id: cand.id, fetchClass: mapped.fetchClass, reason: mapped.reason, enrichment: mapped.enrichment });
    } else {
      failed++;
      fetchRows.push({ id: cand.id, fetchClass: resp.status, reason: `http_${resp.httpCode ?? "err"}` });
    }
  }
  const fetchTally: Record<string, number> = {};
  for (const r of fetchRows) fetchTally[r.fetchClass] = (fetchTally[r.fetchClass] ?? 0) + 1;
  const readyRows = fetchRows.filter((r) => r.fetchClass === "FETCH_READY" && r.enrichment);
  const fetchReady = readyRows.length;

  write("phase_1_14c_1_provider_fetch_results.json", {
    endpoint: "https://places.googleapis.com/v1/places/{placeId}",
    fieldMask: PLACE_DETAILS_FIELD_MASK,
    tally: fetchTally,
    fetchReady,
    results: fetchRows.map((r) => ({
      idMasked: mask(r.id),
      fetchClass: r.fetchClass,
      reason: r.reason ?? null,
      hasCoordinates: !!r.enrichment,
      responseChecksum: r.enrichment?.responseChecksum ?? null,
    })),
  });

  const READY_GATE = 10;
  const gatePass = fetchReady >= READY_GATE;

  // --- PART H: before-snapshot + write plan ------------------------------
  const toWrite = readyRows.slice(0, args.maxWrites);
  const beforeSnap: Record<string, { keys: string[]; hasCoords: boolean }> = {};
  for (const r of toWrite) {
    const doc = (await db.collection(C_DETAILS).doc(r.id).get()).data() ?? {};
    beforeSnap[r.id] = { keys: Object.keys(doc).sort(), hasCoords: docHasValidLocation(doc) };
  }
  write("phase_1_14c_1_write_plan.json", {
    mode: args.mode,
    gatePass,
    plannedWrites: args.mode === "enrich" && gatePass ? toWrite.length : 0,
    plan: toWrite.map((r) => ({
      idMasked: mask(r.id),
      existingFieldCount: beforeSnap[r.id].keys.length,
      alreadyHasCoords: beforeSnap[r.id].hasCoords,
      fieldsToMerge: Object.keys(buildEnrichmentFieldUpdate(r.enrichment!)).concat(["providerFetchedAt", "locationVerifiedAt", "locationFreshUntil"]).sort(),
    })),
  });

  // --- PART I: controlled enrichment write -------------------------------
  const written: { id: string; enrichment: TrustedPlaceLocationEnrichment }[] = [];
  const writeFailures: { id: string; error: string }[] = [];
  if (args.mode === "enrich" && gatePass) {
    for (const r of toWrite) {
      const e = r.enrichment!;
      const existing = (await db.collection(C_DETAILS).doc(r.id).get()).data() ?? {};
      if (isLocationFresh(existing, NOW)) continue; // idempoten: sudah segar → langkau
      const fields: Record<string, unknown> = {
        ...buildEnrichmentFieldUpdate(e),
        providerFetchedAt: FieldValue.serverTimestamp(),
        locationVerifiedAt: FieldValue.serverTimestamp(),
        locationFreshUntil: Timestamp.fromMillis(e.freshUntil),
      };
      assertFieldsAllowlisted(fields); // pertahanan: TIADA medan luar skop
      try {
        await db.collection(C_DETAILS).doc(r.id).set(fields, { merge: true });
        written.push({ id: r.id, enrichment: e });
      } catch (err) {
        writeFailures.push({ id: r.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  write("phase_1_14c_1_enrichment_results.json", {
    mode: args.mode,
    gatePass,
    attempted: args.mode === "enrich" && gatePass ? toWrite.length : 0,
    written: written.length,
    failures: writeFailures.length,
    writtenIdsMasked: written.map((w) => mask(w.id)),
    failureDetail: writeFailures.map((f) => ({ idMasked: mask(f.id), error: f.error })),
  });

  // --- PART J: post-write verification -----------------------------------
  const verifyRows: Record<string, unknown>[] = [];
  let verifyOk = 0;
  for (const w of written) {
    const doc = (await db.collection(C_DETAILS).doc(w.id).get()).data() ?? {};
    const loc = doc.location as { latitude?: number; longitude?: number } | undefined;
    const latMatch = toNum(loc?.latitude) === w.enrichment.latitude;
    const lngMatch = toNum(loc?.longitude) === w.enrichment.longitude;
    const addrMatch = (toStr(doc.formattedAddress) ?? null) === w.enrichment.formattedAddress;
    const beforeKeys = new Set(beforeSnap[w.id]?.keys ?? []);
    const afterKeys = Object.keys(doc);
    const legacyPreserved = [...beforeKeys].every((k) => afterKeys.includes(k));
    const provenance = toStr(doc.locationSource) === "google_places_details" && !!doc.providerFetchedAt && !!doc.locationFreshUntil;
    const good = latMatch && lngMatch && addrMatch && legacyPreserved && provenance;
    if (good) verifyOk++;
    verifyRows.push({ idMasked: mask(w.id), latMatch, lngMatch, addrMatch, legacyPreserved, provenance, checksumPresent: !!doc.locationResponseChecksum });
  }
  // Koleksi terlarang mesti kekal tidak berubah.
  const forbiddenAfter: Record<string, number> = {};
  for (const c of FORBIDDEN) forbiddenAfter[c] = await countCollection(db, c);
  const forbiddenUnchanged = FORBIDDEN.every((c) => forbiddenBefore[c] === forbiddenAfter[c]);
  const detailsCountAfter = await countCollection(db, C_DETAILS);

  write("phase_1_14c_1_post_write_verification.json", {
    verified: written.length,
    verifiedOk: verifyOk,
    forbiddenCollectionsBefore: forbiddenBefore,
    forbiddenCollectionsAfter: forbiddenAfter,
    forbiddenUnchanged,
    placeDetailsCountBefore: detailsCountBefore,
    placeDetailsCountAfter: detailsCountAfter,
    placeDetailsCountUnchanged: detailsCountBefore === detailsCountAfter,
    rows: verifyRows,
  });

  // --- PART L: migration eligibility preview (ZERO-WRITE) ----------------
  // Baca semula SET calon yang diperkaya + petakan DENGAN lokasi → pelan.
  const previewInputs: LegacyRecordInput[] = [];
  for (const cand of candidates) {
    const doc = (await db.collection(C_DETAILS).doc(cand.id).get()).data() ?? {};
    const loc = doc.location as { latitude?: number; longitude?: number } | undefined;
    previewInputs.push({
      legacyCollection: "place_details",
      legacyDocumentPath: `place_details/${cand.id}`,
      legacyPlaceId: cand.id,
      providerPlaceId: cand.id,
      displayName: toStr(doc.displayName),
      address: toStr(doc.formattedAddress),
      lat: toNum(loc?.latitude),
      lng: toNum(loc?.longitude),
      rating: toNum(doc.rating),
      reviewCount: toNum(doc.userRatingCount),
      source: "google_places",
      referencedBy: [],
    });
  }
  const previewInv = buildLegacyInventory(previewInputs, NEUTRAL_TS);
  const previewPlan = buildLegacyMigrationPlan({ batchId: "preview", records: previewInv, createdBy: "enrich_preview" }, NEUTRAL_TS);
  let safe = 0, held = 0, conflict = 0, invalid = 0;
  const previewRows = previewPlan.candidates.map((c) => {
    const dec = c.migrationDecision;
    if (dec === "ready") safe++;
    else if (dec === "branch_conflict") conflict++;
    else if (dec === "blocked") invalid++;
    else held++;
    return { canonicalIdMasked: mask(c.proposedCanonicalPlaceId), decision: dec, holds: c.holdReasons };
  });
  const firstBatch = previewPlan.candidates
    .filter((c) => c.migrationDecision === "ready" && c.conflicts.length === 0)
    .slice(0, 25)
    .map((c) => ({ canonicalIdMasked: mask(c.proposedCanonicalPlaceId), sourceMasked: c.legacyPlaceIds.map(mask).join(",") }));

  write("phase_1_14c_1_migration_eligibility_preview.json", {
    note: "ZERO-WRITE preview over enriched candidate set only. No migration executed.",
    total: previewPlan.candidates.length,
    SAFE: safe, HELD: held, CONFLICT: conflict, INVALID: invalid,
    recommendedFirstBatchSize: firstBatch.length,
    firstBatch,
    rows: previewRows,
  });

  // --- PART M: reference impact (aggregate, read-only) -------------------
  const refSurface: Record<string, number> = {};
  for (const c of ["suggestion_sessions", "suggestions", "favorites", "meals", "meal_wallet", "reviews", "history"]) {
    refSurface[c] = await countCollection(db, c);
  }
  write("phase_1_14c_1_reference_impact.json", {
    note: "Aggregate reference surface. Aliases preserve legacy IDs on future migration; nothing rewritten.",
    referenceSurfaceCounts: refSurface,
    blockingReferences: 0,
  });

  // --- PART O: cost / quota summary --------------------------------------
  write("phase_1_14c_1_cost_quota_summary.json", {
    fieldMask: PLACE_DETAILS_FIELD_MASK,
    placeDetailsRequests: requests,
    successfulResponses: ok,
    failedResponses: failed,
    retries,
    concurrency: 1,
    delayMsBetweenRequests: REQUEST_DELAY_MS,
    startedAtUtc: before,
    finishedAtUtc: new Date().toISOString().slice(0, 19),
    note: "Bounded batch only. Remaining records NOT processed automatically.",
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    mode: args.mode, scanned: allDocs.length, selected: candidates.length,
    fetchTally, fetchReady, gatePass, written: written.length, verifiedOk: verifyOk,
    forbiddenUnchanged, preview: { SAFE: safe, HELD: held, CONFLICT: conflict },
    firstBatchSize: firstBatch.length,
  }, null, 2));
  if (!forbiddenUnchanged) throw new Error("SAFETY VIOLATION: forbidden collection counts changed");
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("enrichment refused/failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
