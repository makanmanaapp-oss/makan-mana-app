/**
 * Phase 1.14E — CLI EXECUTOR MIGRASI KANONIKAL PRODUKSI (owner-authorized).
 *
 * Menulis rekod kanonikal PRODUKSI sebenar untuk manifest 25-SAFE yang diluluskan
 * SAHAJA. Setiap tulisan melalui penjaga senarai-putih + pembilang. Idempoten
 * (rekod sedia ada dilangkau). TIDAK PERNAH menulis place_details/places_cache/
 * koleksi pengguna. TIADA padam. TIADA batch seterusnya automatik.
 *
 * Mod:
 *   --mode=dry-run     : sahkan + kira tulisan dirancang, SIFAR tulisan.
 *   --mode=execute     : tulis 25 rekod kanonikal produksi (allowlist sahaja).
 *   --mode=idempotency : sahkan 25 sudah wujud, 0 tulisan baharu.
 *
 * Guard wajib: --confirm-project=makanmana-c59f3 --manifest=<path>
 *   --manifest-checksum=925c3b83... --max-records=25 --owner-authorized
 *   (execute juga: --backup-reference=<gs://...>).
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";

import * as admin from "firebase-admin";

import { isNonEmptyString } from "../src/domain/places/common";
import { hashCanonical } from "../src/domain/places/staging/hashing";
import {
  LegacyRecordInput,
  buildLegacyInventory,
} from "../src/domain/places/migration/legacyInventory";
import { buildLegacyMigrationPlan } from "../src/domain/places/migration/dryRunPlanner";
import {
  PRODUCTION_WRITE_ALLOWLIST,
  ProductionWriteCollection,
  buildProductionCanonicalWrite,
  productionBatchId,
} from "../src/domain/places/migration/productionCanonical";

const PROJECT = "makanmana-c59f3";
const C_DETAILS = "place_details";
const NEUTRAL_TS = 1_700_000_000_000;
const HARD_CAP = 25;
const mask = (id: string) => (id && id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : "****");

function arg(k: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : undefined;
}
function flag(k: string): boolean {
  return process.argv.slice(2).includes(`--${k}`);
}
function toStr(v: unknown): string | undefined { return typeof v === "string" && v.trim() ? v : undefined; }
function toNum(v: unknown): number | undefined { return typeof v === "number" && Number.isFinite(v) ? v : undefined; }

/** Penulis berpenjaga: hanya koleksi senarai-putih; kira setiap tulisan. */
class GuardedWriter {
  writes = 0;
  byCollection: Record<string, number> = {};
  private allow = new Set<string>(PRODUCTION_WRITE_ALLOWLIST);
  constructor(private db: admin.firestore.Firestore) {}
  private guard(coll: string) {
    if (!this.allow.has(coll)) throw new Error(`FORBIDDEN write target outside allowlist: ${coll}`);
  }
  private tick(coll: string) { this.writes++; this.byCollection[coll] = (this.byCollection[coll] ?? 0) + 1; }
  async create(coll: ProductionWriteCollection, id: string, data: Record<string, unknown>): Promise<"created" | "exists"> {
    this.guard(coll);
    try {
      await this.db.collection(coll).doc(id).create(data);
      this.tick(coll);
      return "created";
    } catch (e) {
      if ((e as { code?: number }).code === 6 || /ALREADY_EXISTS|already exists/i.test(String(e))) return "exists";
      throw e;
    }
  }
  async set(coll: ProductionWriteCollection, id: string, data: Record<string, unknown>): Promise<void> {
    this.guard(coll);
    await this.db.collection(coll).doc(id).set(data);
    this.tick(coll);
  }
}

async function countCollection(db: admin.firestore.Firestore, name: string): Promise<number> {
  try { return (await db.collection(name).count().get()).data().count; } catch { return -1; }
}

function recordFromDoc(id: string, d: Record<string, unknown>): LegacyRecordInput {
  const loc = d.location as { latitude?: unknown; longitude?: unknown } | undefined;
  return {
    legacyCollection: "place_details", legacyDocumentPath: `place_details/${id}`,
    legacyPlaceId: id, providerPlaceId: id,
    displayName: toStr(d.displayName), address: toStr(d.formattedAddress),
    lat: toNum(loc?.latitude), lng: toNum(loc?.longitude),
    rating: toNum(d.rating), reviewCount: toNum(d.userRatingCount),
    source: "google_places", referencedBy: [],
  };
}

async function main(): Promise<void> {
  const mode = arg("mode");
  if (mode !== "dry-run" && mode !== "execute" && mode !== "idempotency") {
    throw new Error("refuse: --mode must be dry-run|execute|idempotency");
  }
  if (arg("confirm-project") !== PROJECT) throw new Error(`refuse: --confirm-project must equal ${PROJECT}`);
  if (!flag("owner-authorized")) throw new Error("refuse: --owner-authorized required");
  const maxRecords = Number(arg("max-records") ?? HARD_CAP);
  if (!(maxRecords > 0 && maxRecords <= HARD_CAP)) throw new Error(`refuse: --max-records must be 1..${HARD_CAP}`);
  const manifestPath = arg("manifest");
  const manifestChecksumArg = arg("manifest-checksum");
  if (!manifestPath || !manifestChecksumArg) throw new Error("refuse: --manifest and --manifest-checksum required");
  const backupRef = arg("backup-reference") ?? "";
  if (mode === "execute" && !isNonEmptyString(backupRef)) throw new Error("refuse: --backup-reference required for execute");
  if (flag("no-delete") === false || flag("preserve-legacy") === false) {
    // Bendera ini WAJIB hadir sebagai pengesahan niat (tiada padam / legasi kekal).
    throw new Error("refuse: --no-delete and --preserve-legacy are required");
  }
  const outDir = arg("output") ?? "../reports";
  mkdirSync(outDir, { recursive: true });
  const write = (name: string, obj: unknown) => {
    const json = JSON.stringify(obj, null, 2);
    writeFileSync(`${outDir}/${name}`, json, "utf8");
    return hashCanonical(json).slice(0, 16);
  };

  // Sahkan manifest fail + checksum arg sepadan.
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { batchSize: number; manifestChecksum: string };
  if (manifest.manifestChecksum !== manifestChecksumArg) {
    throw new Error(`refuse: --manifest-checksum does not match manifest file (${mask(manifest.manifestChecksum)} vs ${mask(manifestChecksumArg)})`);
  }

  if (admin.apps.length === 0) admin.initializeApp({ projectId: PROJECT });
  const db = admin.firestore();

  // eslint-disable-next-line no-console
  console.log(`[1.14E] project=${PROJECT} mode=${mode} maxRecords=${maxRecords} manifestChecksum=${mask(manifestChecksumArg)}`);

  // --- Re-derive 25 SAFE dari produksi (baca-sahaja) + guard checksum -------
  const snap = await db.collection(C_DETAILS).limit(5000).get();
  const all = snap.docs.map((doc) => ({ id: doc.id, data: (doc.data() ?? {}) as Record<string, unknown> }));
  const fullInv = buildLegacyInventory(all.map((x) => recordFromDoc(x.id, x.data)), NEUTRAL_TS);
  const fullPlan = buildLegacyMigrationPlan({ batchId: "e_full", records: fullInv, createdBy: "e" }, NEUTRAL_TS);
  const readyIds = new Set<string>();
  for (const c of fullPlan.candidates) if (c.migrationDecision === "ready") for (const pid of c.legacyPlaceIds) readyIds.add(pid);
  const batchDocs = all.filter((x) => readyIds.has(x.id)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, maxRecords);
  const batchInv = buildLegacyInventory(batchDocs.map((x) => recordFromDoc(x.id, x.data)), NEUTRAL_TS);
  const built = buildLegacyMigrationPlan({ batchId: "e_batch", records: batchInv, createdBy: "e" }, NEUTRAL_TS);
  const candidates = built.candidates.filter((c) => c.migrationDecision === "ready");

  const derivedChecksum = hashCanonical({
    candidateIds: candidates.map((c) => c.candidateId).sort(),
    canonicalIds: candidates.map((c) => c.proposedCanonicalPlaceId).sort(),
    sources: candidates.flatMap((c) => c.legacyPlaceIds).sort(),
  });
  if (candidates.length !== manifest.batchSize) {
    throw new Error(`refuse: derived batch size ${candidates.length} != manifest ${manifest.batchSize}`);
  }
  if (derivedChecksum !== manifestChecksumArg) {
    throw new Error(`refuse: derived manifest checksum ${mask(derivedChecksum)} != approved ${mask(manifestChecksumArg)}`);
  }
  if (candidates.length > HARD_CAP) throw new Error("refuse: exceeds hard cap 25");

  const batchId = productionBatchId(manifestChecksumArg);
  const CANON = ["place_registry", "place_publications", "place_publication_heads", "place_migration_aliases", "place_migration_batches", "place_migration_audit"];
  const before: Record<string, number> = {};
  for (const c of [...CANON, "place_details"]) before[c] = await countCollection(db, c);

  // --- DRY-RUN: sahkan + kira tulisan dirancang, SIFAR tulisan --------------
  if (mode === "dry-run") {
    let plannedWrites = 0;
    for (const c of candidates) {
      const w = buildProductionCanonicalWrite(c, batchId, backupRef || "dry-run", NEUTRAL_TS);
      plannedWrites += 2 + 1 + w.aliases.length + 1; // registry+publication+head+aliases+audit
    }
    const after: Record<string, number> = {};
    for (const c of [...CANON, "place_details"]) after[c] = await countCollection(db, c);
    const unchanged = [...CANON, "place_details"].every((c) => before[c] === after[c]);
    write("phase_1_14e_final_dry_run.json", {
      mode: "dry-run", batchSize: candidates.length, derivedChecksum, manifestChecksumMatched: true,
      plannedWrites, zeroWriteBefore: before, zeroWriteAfter: after, productionUnchanged: unchanged,
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ mode, batchSize: candidates.length, derivedChecksum: mask(derivedChecksum), plannedWrites, productionUnchanged: unchanged }, null, 2));
    if (!unchanged) throw new Error("SAFETY VIOLATION: dry-run changed production counts");
    process.exit(0);
  }

  // --- EXECUTE / IDEMPOTENCY ------------------------------------------------
  const writer = new GuardedWriter(db);
  let migrated = 0, alreadyMigrated = 0, failed = 0;
  const auditRows: Record<string, unknown>[] = [];
  const perRecord: Record<string, unknown>[] = [];

  for (const c of candidates) {
    try {
      const w = buildProductionCanonicalWrite(c, batchId, backupRef || "idempotency", NEUTRAL_TS);
      const exists = (await db.collection("place_registry").doc(w.registry.canonicalPlaceId).get()).exists;
      if (exists) {
        alreadyMigrated++;
        perRecord.push({ canonicalMasked: mask(w.registry.canonicalPlaceId), state: "already_migrated" });
        continue;
      }
      if (mode === "idempotency") {
        // Idempotency mode NEVER writes; a missing record is reported, not created.
        perRecord.push({ canonicalMasked: mask(w.registry.canonicalPlaceId), state: "missing_would_write" });
        continue;
      }
      // execute: create registry, publication, head, aliases, audit (allowlist-guarded).
      await writer.create("place_registry", w.registry.canonicalPlaceId, { ...w.registry });
      await writer.create("place_publications", w.publication.publicationId, { ...w.publication });
      await writer.set("place_publication_heads", w.head.placeId, { ...w.head });
      for (const a of w.aliases) await writer.create("place_migration_aliases", a.aliasDocId, { ...a });
      const auditId = `MAU-${hashCanonical({ b: batchId, c: w.registry.canonicalPlaceId }).slice(0, 24)}`;
      await writer.create("place_migration_audit", auditId, {
        auditId, action: "production_canonical_created", batchId,
        canonicalPlaceId: w.registry.canonicalPlaceId, providerPlaceId: w.registry.providerPlaceId,
        actorType: "owner", at: NEUTRAL_TS,
      });
      migrated++;
      auditRows.push({ auditIdMasked: mask(auditId), canonicalMasked: mask(w.registry.canonicalPlaceId) });
      perRecord.push({ canonicalMasked: mask(w.registry.canonicalPlaceId), sourceMasked: mask(w.registry.providerPlaceId), state: "migrated", aliases: w.aliases.length });
    } catch (e) {
      failed++;
      perRecord.push({ canonicalMasked: mask(c.proposedCanonicalPlaceId), state: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }

  const after: Record<string, number> = {};
  for (const c of [...CANON, "place_details"]) after[c] = await countCollection(db, c);
  const legacyUnchanged = before["place_details"] === after["place_details"];

  // Batch checkpoint (Part O) — hanya pada execute.
  if (mode === "execute" && failed === 0) {
    const checkpoint = {
      batchId, manifestChecksum: manifestChecksumArg, candidateChecksum: "f8906c6c",
      sourceCount: candidates.length, migratedCount: migrated + alreadyMigrated,
      operationId: batchId, startedAt: NEUTRAL_TS, completedAt: NEUTRAL_TS,
      operator: "owner:makanmana.app", backupReference: backupRef,
      migrationVersion: "1.14E.1", verificationResult: "pending_post_write",
      rollbackStatus: "available", globalCompletion: false,
    };
    await writer.create("place_migration_batches", batchId, checkpoint);
    write("phase_1_14e_batch_checkpoint.json", { ...checkpoint, batchIdMasked: mask(batchId) });
  }

  const report = {
    mode, batchId: mask(batchId), manifestChecksumMatched: true,
    attempted: candidates.length, migrated, alreadyMigrated, failed,
    writes: writer.writes, writesByCollection: writer.byCollection,
    legacyPlaceDetailsUnchanged: legacyUnchanged,
    canonicalBefore: before, canonicalAfter: after,
    perRecord,
  };
  if (mode === "execute") write("phase_1_14e_production_migration.json", report);
  if (mode === "idempotency") write("phase_1_14e_idempotency.json", { ...report, note: "Idempotency check: no writes performed; existing records recognized." });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    mode, attempted: candidates.length, migrated, alreadyMigrated, failed,
    writes: writer.writes, writesByCollection: writer.byCollection, legacyUnchanged,
  }, null, 2));
  if (!legacyUnchanged) throw new Error("SAFETY VIOLATION: place_details count changed");
  if (mode === "idempotency" && writer.writes !== 0) throw new Error("SAFETY VIOLATION: idempotency mode wrote data");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("production migration refused/failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
