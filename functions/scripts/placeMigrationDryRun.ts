/**
 * Phase 1.14A→1.14C — CLI dry-run migrasi (SIFAR-TULIS). UNTUK PEMILIK/OWNER-AUTH.
 *
 * WARNING: menyasarkan Firestore PRODUKSI apabila --confirm-project=makanmana-c59f3.
 * Ia HANYA MEMBACA (`.get()` / `.count()`). Ia TIDAK PERNAH menulis Firestore.
 * Output ditulis ke fail tempatan (fs) sahaja. TIDAK di-import oleh index.ts.
 *
 * Jalankan:
 *   npx tsx functions/scripts/placeMigrationDryRun.ts \
 *     --mode=dry-run --read-only --confirm-project=makanmana-c59f3 \
 *     --max-records=5000 --output=../reports
 *
 * Ejen automasi menjalankan ini HANYA di bawah kebenaran pemilik eksplisit.
 */
import {createHash} from "crypto";
import {mkdirSync, writeFileSync} from "fs";

import * as admin from "firebase-admin";

import {buildLegacyMigrationPlan} from "../src/domain/places/migration/dryRunPlanner";
import {
  LegacyPlaceInventoryRecord,
  LegacyRecordInput,
  buildLegacyInventory,
} from "../src/domain/places/migration/legacyInventory";
import {LegacyPlaceMigrationCandidate} from "../src/domain/places/migration/migrationCandidate";
import {
  DryRunOptions,
  assertSafeInvocation,
  banner,
  parseDryRunArgs,
  summarizeDryRun,
} from "../src/domain/places/migration/dryRunTool";

const C_DETAILS = "place_details";
const NEUTRAL_TS = 1_700_000_000_000; // masa TETAP → dry-run deterministik/idempoten
const mask = (id: string) => (id && id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : "****");
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

function toStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}
function toNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Baca place_details produksi (BACA-SAHAJA) → inventori. doc.id = provider id. */
async function readPlaceDetailsInventory(
  db: admin.firestore.Firestore,
  cap: number,
): Promise<LegacyPlaceInventoryRecord[]> {
  const snap = await db.collection(C_DETAILS).limit(cap).get();
  const inputs: LegacyRecordInput[] = snap.docs.map((doc) => {
    const d = doc.data() ?? {};
    const lastFetched = d.lastFetchedAt as {toMillis?: () => number} | undefined;
    // Phase 1.14C.1 — jika enrichment lokasi telah menulis koordinat/alamat,
    // baca ia supaya rekod boleh lulus pengesahan kanonikal (SAFE).
    const loc = d.location as {latitude?: unknown; longitude?: unknown} | undefined;
    return {
      legacyCollection: "place_details",
      legacyDocumentPath: `place_details/${doc.id}`,
      legacyPlaceId: doc.id, // provider (Google) place id = identiti stabil
      providerPlaceId: doc.id,
      displayName: toStr(d.displayName),
      address: toStr(d.formattedAddress),
      lat: toNum(loc?.latitude),
      lng: toNum(loc?.longitude),
      rating: toNum(d.rating),
      reviewCount: toNum(d.userRatingCount),
      source: "google_places",
      lastSeenAt: typeof lastFetched?.toMillis === "function" ? lastFetched.toMillis() : undefined,
      referencedBy: [], // penyelesaian rujukan per-tempat ditangguh (agregat sahaja)
    };
  });
  return buildLegacyInventory(inputs, NEUTRAL_TS);
}

async function countCollection(db: admin.firestore.Firestore, name: string): Promise<number> {
  try {
    const agg = await db.collection(name).count().get();
    return agg.data().count;
  } catch {
    return -1; // tidak wujud / tiada akaun — tandakan -1
  }
}

const DECISION_TO_CLASS: Record<string, string> = {
  ready: "SAFE",
  already_mapped: "ALREADY_CANONICAL",
  review_required: "HELD",
  ambiguous: "HELD",
  branch_conflict: "CONFLICT",
  insufficient_identity: "INSUFFICIENT_SOURCE",
  blocked: "INVALID",
  skip: "OUT_OF_SCOPE",
};

function classify(c: LegacyPlaceMigrationCandidate): string {
  if (c.duplicateSignals && c.migrationDecision === "ambiguous") return "DUPLICATE_CANDIDATE";
  return DECISION_TO_CLASS[c.migrationDecision] ?? "HELD";
}
function confidenceBand(c: LegacyPlaceMigrationCandidate): string {
  if (c.migrationDecision === "ready" || c.migrationDecision === "already_mapped") return "high";
  if (c.migrationDecision === "review_required") return "medium";
  return "low";
}
const NON_EXEC = ["review_required", "ambiguous", "branch_conflict", "insufficient_identity", "blocked", "skip"];

function candidateRow(c: LegacyPlaceMigrationCandidate) {
  return {
    sourceIdMasked: c.legacyPlaceIds.map(mask).join(","),
    classification: classify(c),
    reasonCode: c.holdReasons[0] ?? c.migrationDecision,
    trustedSourceUsed: "place_details",
    proposedCanonicalIdMasked: mask(c.proposedCanonicalPlaceId),
    confidenceBand: confidenceBand(c),
    aliasImpact:
      c.proposedAliases.legacyDocumentIds.length +
      c.proposedAliases.googlePlaceIds.length +
      c.proposedAliases.providerPlaceIds.length,
    referenceImpact: (c.referenceImpact as unknown as {totalReferences?: number}).totalReferences ?? 0,
    manualReviewRequired: NON_EXEC.includes(c.migrationDecision),
    conflicts: c.conflicts.length,
  };
}

function candidatesChecksum(candidates: readonly LegacyPlaceMigrationCandidate[]): string {
  const stable = [...candidates]
    .map((c) => ({
      id: c.candidateId,
      d: c.migrationDecision,
      canon: c.proposedCanonicalPlaceId,
      hold: [...c.holdReasons].sort(),
      conf: [...c.conflicts].sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return sha(JSON.stringify(stable));
}

function tally(rows: ReturnType<typeof candidateRow>[]) {
  const t: Record<string, number> = {};
  for (const r of rows) t[r.classification] = (t[r.classification] ?? 0) + 1;
  return t;
}

async function main(): Promise<void> {
  const args = parseDryRunArgs(process.argv.slice(2));
  const projectId = args.confirmProject ?? "";
  assertSafeInvocation(args); // mode=dry-run + read-only + confirm-project + caps

  // eslint-disable-next-line no-console
  console.log(banner(projectId));
  const cap = Math.min(args.limit ?? 5000, 5000);
  // eslint-disable-next-line no-console
  console.log(`account/project: ${projectId} | mode: ${args.mode} | read-only: ${args.readOnly} | max-records: ${cap}`);

  if (admin.apps.length === 0) admin.initializeApp({projectId});
  const db = admin.firestore();

  const COUNT_COLLECTIONS = [
    "place_details", "place_migration_inventory", "place_migration_candidates",
    "place_migration_plans", "place_migration_aliases", "place_migration_checkpoints",
    "place_publications", "place_correction_submissions",
  ];
  // --- BEFORE counts (zero-write proof) ---
  const before: Record<string, number> = {};
  for (const c of COUNT_COLLECTIONS) before[c] = await countCollection(db, c);

  // --- Read inventory (READ-ONLY) + plan twice (idempotency) ---
  const records = await readPlaceDetailsInventory(db, cap);
  const opts: DryRunOptions = {batchId: `dryrun_${projectId}_prod`, includeReferenceScan: false, redactUserIdentifiers: true};
  const run1 = buildLegacyMigrationPlan({batchId: opts.batchId, records, createdBy: "dry_run_tool"}, NEUTRAL_TS);
  const run2 = buildLegacyMigrationPlan({batchId: opts.batchId, records, createdBy: "dry_run_tool"}, NEUTRAL_TS);
  const checksum1 = candidatesChecksum(run1.candidates);
  const checksum2 = candidatesChecksum(run2.candidates);

  const summary = summarizeDryRun(records, run1.candidates, opts);
  const rows = run1.candidates.map(candidateRow);
  const classes = tally(rows);

  // --- AFTER counts ---
  const after: Record<string, number> = {};
  for (const c of COUNT_COLLECTIONS) after[c] = await countCollection(db, c);
  const unchanged = COUNT_COLLECTIONS.every((c) => before[c] === after[c]);

  // Reference surface (aggregate only; per-place resolution deferred → aliases preserve).
  const refSurface: Record<string, number> = {};
  for (const c of ["favorites", "meals", "meal_wallet", "reviews", "suggestions", "suggestion_sessions"]) {
    refSurface[c] = await countCollection(db, c);
  }

  // --- First safe batch (≤25 ready, no conflicts, no branch assessment) ---
  const firstBatch = run1.candidates
    .filter((c) => c.migrationDecision === "ready" && c.conflicts.length === 0 && c.branchAssessment == null)
    .slice(0, 25)
    .map((c) => ({candidateIdMasked: mask(c.candidateId), sourceIdMasked: c.legacyPlaceIds.map(mask).join(","), proposedCanonicalIdMasked: mask(c.proposedCanonicalPlaceId)}));

  // --- Write reports (local only, masked) ---
  const outDir = args.output ?? "../reports";
  mkdirSync(outDir, {recursive: true});
  const write = (name: string, obj: unknown) => {
    const json = JSON.stringify(obj, null, 2);
    writeFileSync(`${outDir}/${name}`, json, "utf8");
    return sha(json);
  };

  write("phase_1_14c_dry_run_summary.json", {...summary, checksum1, checksum2, idempotent: checksum1 === checksum2, classes});
  write("phase_1_14c_record_classification.json", {total: rows.length, classes, records: rows});
  write("phase_1_14c_conflicts.json", {conflicts: rows.filter((r) => r.classification === "CONFLICT" || r.conflicts > 0)});
  write("phase_1_14c_reference_impact.json", {perPlaceReferenceImpact: "deferred_aggregate", referenceSurfaceCounts: refSurface, note: "Aliases preserve legacy IDs so references resolve; per-place scan deferred."});
  write("phase_1_14c_first_batch_plan.json", {recommendedBatchSize: firstBatch.length, selection: "decision=ready, no conflicts, no branch ambiguity", candidates: firstBatch});
  write("phase_1_14c_zero_write_proof.json", {beforeCounts: before, afterCounts: after, unchanged, note: "Firestore document counts before/after the dry-run — must be identical."});

  // eslint-disable-next-line no-console
  console.log(`records=${records.length} idempotent=${checksum1 === checksum2} zeroWriteUnchanged=${unchanged} classes=${JSON.stringify(classes)}`);
  // eslint-disable-next-line no-console
  console.log(`reports written to ${outDir}; exitCode=${summary.exitCode}`);
  if (!unchanged) throw new Error("ZERO-WRITE VIOLATION: collection counts changed");
  process.exit(summary.exitCode);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("dry-run refused/failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
