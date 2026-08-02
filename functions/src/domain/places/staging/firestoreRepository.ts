/**
 * Phase 1.3 — implementasi repository staging berasaskan Firestore
 * (firebase-admin). DIGUNAKAN OLEH UJIAN EMULATOR SAHAJA dalam fasa ini;
 * tidak diimport oleh functions/src/index.ts (tiada fungsi produksi).
 *
 * Koleksi: place_import_batches, place_source_snapshots, place_staging,
 * place_staging/{id}/audit. TIADA tulisan place_registry, TIADA publish.
 * Snapshot dicipta guna .create() (immutable). Audit = subkoleksi add()
 * (append-only). Peralihan status dikawal mesin keadaan dalam transaksi.
 */
import { FieldPath, Firestore } from "firebase-admin/firestore";
import { PlaceImportBatch } from "./importBatch";
import { PlaceSourceSnapshot } from "./sourceSnapshot";
import { PlaceStagingRecord } from "./stagingRecord";
import { PlaceStagingAuditEntry, TrustedActor } from "./stagingAudit";
import { PlaceReviewDecision, validateReviewDecision } from "./reviewDecision";
import { PlaceValidationResult } from "./validationResult";
import { StagingReviewStatus } from "./stagingEnums";
import { assertValidStagingTransition } from "./stagingStateMachine";
import {
  MAX_PAGE_LIMIT,
  Page,
  Pagination,
  PlaceImportBatchRepository,
  PlaceSourceSnapshotRepository,
  PlaceStagingAuditRepository,
  PlaceStagingRepository,
  SnapshotMetadataCorrection,
  StagingListFilter,
} from "./repository";

const C_BATCH = "place_import_batches";
const C_SNAPSHOT = "place_source_snapshots";
const C_STAGING = "place_staging";

/** Buang undefined + jadikan JSON tulen selamat-Firestore (domain guna epoch ms). */
function toPlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export interface FirestoreClock {
  now(): number;
}
export interface FirestoreIdGen {
  next(prefix: string): string;
}

export class FirestoreStagingStore
  implements
    PlaceImportBatchRepository,
    PlaceSourceSnapshotRepository,
    PlaceStagingRepository,
    PlaceStagingAuditRepository
{
  constructor(
    private db: Firestore,
    private clock: FirestoreClock = { now: () => Date.now() },
    private ids: FirestoreIdGen = {
      next: (p) => `${p}_${Math.floor(Math.random() * 1e9).toString(36)}`,
    },
  ) {}

  async createBatch(batch: PlaceImportBatch): Promise<PlaceImportBatch> {
    await this.db.collection(C_BATCH).doc(batch.importBatchId).create(toPlain(batch));
    return batch;
  }

  async getBatch(id: string): Promise<PlaceImportBatch | null> {
    const s = await this.db.collection(C_BATCH).doc(id).get();
    return s.exists ? (s.data() as PlaceImportBatch) : null;
  }

  async updateBatchStatus(
    id: string,
    status: PlaceImportBatch["processingStatus"],
    patch?: Partial<PlaceImportBatch>,
  ): Promise<void> {
    await this.db
      .collection(C_BATCH)
      .doc(id)
      .set(toPlain({ ...patch, processingStatus: status, updatedAt: this.clock.now() }), {
        merge: true,
      });
  }

  async createSnapshot(snapshot: PlaceSourceSnapshot): Promise<PlaceSourceSnapshot> {
    // .create() gagal jika sudah wujud -> immutable.
    await this.db.collection(C_SNAPSHOT).doc(snapshot.snapshotId).create(toPlain(snapshot));
    return snapshot;
  }

  async getSnapshot(id: string): Promise<PlaceSourceSnapshot | null> {
    const s = await this.db.collection(C_SNAPSHOT).doc(id).get();
    return s.exists ? (s.data() as PlaceSourceSnapshot) : null;
  }

  async correctMetadata(id: string, patch: SnapshotMetadataCorrection): Promise<void> {
    // Hanya medan metadata dibenarkan.
    await this.db.collection(C_SNAPSHOT).doc(id).set(toPlain(patch), { merge: true });
  }

  async createStagingRecord(
    record: PlaceStagingRecord,
    actor: TrustedActor,
  ): Promise<PlaceStagingRecord> {
    const stored = { ...record, auditTrail: [] as PlaceStagingAuditEntry[] };
    await this.db.collection(C_STAGING).doc(record.stagingRecordId).create(toPlain(stored));
    await this.appendAuditInternal(record.stagingRecordId, "imported", actor, {
      nextState: record.reviewStatus,
    });
    return stored;
  }

  async getStagingRecord(id: string): Promise<PlaceStagingRecord | null> {
    const s = await this.db.collection(C_STAGING).doc(id).get();
    return s.exists ? (s.data() as PlaceStagingRecord) : null;
  }

  async listStagingRecords(
    filter: StagingListFilter,
    page: Pagination,
  ): Promise<Page<PlaceStagingRecord>> {
    const limit = Math.max(1, Math.min(page.limit, MAX_PAGE_LIMIT));
    let q = this.db.collection(C_STAGING).orderBy(FieldPath.documentId());
    if (filter.reviewStatus) q = q.where("reviewStatus", "==", filter.reviewStatus);
    if (filter.importBatchId) q = q.where("importBatchId", "==", filter.importBatchId);
    if (filter.assignedReviewer) {
      q = q.where("assignedReviewer", "==", filter.assignedReviewer);
    }
    if (page.cursor) q = q.startAfter(page.cursor);
    const snap = await q.limit(limit + 1).get();
    const docs = snap.docs.slice(0, limit);
    const items = docs.map((d) => d.data() as PlaceStagingRecord);
    const nextCursor = snap.docs.length > limit ? docs[docs.length - 1].id : undefined;
    return { items, nextCursor };
  }

  async transitionReviewStatus(
    id: string,
    to: StagingReviewStatus,
    actor: TrustedActor,
    reasonCode?: string,
  ): Promise<PlaceStagingRecord> {
    const ref = this.db.collection(C_STAGING).doc(id);
    const updated = await this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw new Error(`staging record not found: ${id}`);
      const r = s.data() as PlaceStagingRecord;
      assertValidStagingTransition(r.reviewStatus, to);
      tx.set(ref, toPlain({ reviewStatus: to, updatedAt: this.clock.now() }), { merge: true });
      return { ...r, reviewStatus: to };
    });
    await this.appendAuditInternal(id, "edited", actor, {
      previousState: updated.reviewStatus,
      nextState: to,
      reasonCode,
    });
    return updated;
  }

  async assignReviewer(
    id: string,
    reviewerUid: string,
    actor: TrustedActor,
  ): Promise<void> {
    await this.db
      .collection(C_STAGING)
      .doc(id)
      .set(toPlain({ assignedReviewer: reviewerUid, updatedAt: this.clock.now() }), {
        merge: true,
      });
    await this.appendAuditInternal(id, "assigned", actor, {
      changedFields: ["assignedReviewer"],
    });
  }

  async recordReviewDecision(
    id: string,
    decision: PlaceReviewDecision,
    actor: TrustedActor,
  ): Promise<PlaceStagingRecord> {
    const v = validateReviewDecision(decision);
    if (!v.ok) {
      throw new Error(`invalid decision: ${v.issues.map((i) => i.code).join(",")}`);
    }
    const ref = this.db.collection(C_STAGING).doc(id);
    const updated = await this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw new Error(`staging record not found: ${id}`);
      const r = s.data() as PlaceStagingRecord;
      assertValidStagingTransition(r.reviewStatus, decision.nextReviewStatus);
      const patch: Partial<PlaceStagingRecord> = {
        reviewStatus: decision.nextReviewStatus,
        approvalDecision: decision.decision,
        reviewedBy: actor.actorUid, // pelaku dipercayai, bukan klien
        reviewedAt: this.clock.now(),
        updatedAt: this.clock.now(),
      };
      if (decision.decision === "reject") patch.rejectionReason = decision.reasonCode;
      if (decision.decision === "merge_into_existing") {
        patch.mergeTargetPlaceId = decision.targetCanonicalPlaceId;
      }
      tx.set(ref, toPlain(patch), { merge: true });
      return { ...r, ...patch } as PlaceStagingRecord;
    });
    await this.appendAuditInternal(id, "edited", actor, {
      previousState: undefined,
      nextState: decision.nextReviewStatus,
      reasonCode: decision.reasonCode,
    });
    return updated;
  }

  async setValidationResult(
    id: string,
    result: PlaceValidationResult,
    actor: TrustedActor,
  ): Promise<void> {
    await this.db
      .collection(C_STAGING)
      .doc(id)
      .set(toPlain({ validationResult: result, updatedAt: this.clock.now() }), {
        merge: true,
      });
    await this.appendAuditInternal(
      id,
      result.valid ? "validation_passed" : "validation_failed",
      actor,
      { changedFields: ["validationResult"] },
    );
  }

  async appendAudit(entry: PlaceStagingAuditEntry): Promise<PlaceStagingAuditEntry> {
    await this.db
      .collection(C_STAGING)
      .doc(entry.stagingRecordId)
      .collection("audit")
      .doc(entry.auditId)
      .create(toPlain(entry));
    return entry;
  }

  async listAudit(stagingRecordId: string): Promise<PlaceStagingAuditEntry[]> {
    const snap = await this.db
      .collection(C_STAGING)
      .doc(stagingRecordId)
      .collection("audit")
      .orderBy("createdAt")
      .get();
    return snap.docs.map((d) => d.data() as PlaceStagingAuditEntry);
  }

  private async appendAuditInternal(
    stagingRecordId: string,
    action: PlaceStagingAuditEntry["action"],
    actor: TrustedActor,
    extra: Partial<PlaceStagingAuditEntry> = {},
  ): Promise<void> {
    await this.appendAudit({
      auditId: this.ids.next("audit"),
      stagingRecordId,
      action,
      actorUid: actor.actorUid,
      actorRole: actor.actorRole,
      changedFields: extra.changedFields ?? [],
      previousState: extra.previousState,
      nextState: extra.nextState,
      reasonCode: extra.reasonCode,
      createdAt: this.clock.now(),
    });
  }
}
