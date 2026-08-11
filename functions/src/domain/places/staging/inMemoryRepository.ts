/**
 * Phase 1.3 — implementasi repository staging DALAM-INGATAN (deterministik,
 * emulator-safe: tidak menyentuh Firestore/produksi). Menguatkuasa
 * invarian yang sama: snapshot immutable, audit append-only, peralihan status
 * dikawal mesin keadaan, pagination terbatas. TIADA tulisan place_registry,
 * TIADA publish.
 */
import { EpochMillis } from "../common";
import { PlaceImportBatch } from "./importBatch";
import { PlaceSourceSnapshot } from "./sourceSnapshot";
import { PlaceStagingRecord } from "./stagingRecord";
import { PlaceStagingAuditEntry, TrustedActor } from "./stagingAudit";
import { PlaceReviewDecision, validateReviewDecision } from "./reviewDecision";
import { PlaceValidationResult } from "./validationResult";
import { StagingAuditAction, StagingReviewStatus } from "./stagingEnums";
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

export interface StoreClock {
  now(): EpochMillis;
}

export interface IdGen {
  next(prefix: string): string;
}

function defaultIdGen(): IdGen {
  let n = 0;
  return { next: (prefix) => `${prefix}_${(++n).toString().padStart(6, "0")}` };
}

/** Kedai staging dalam-ingatan yang melaksanakan keempat-empat repository. */
export class InMemoryStagingStore
  implements
    PlaceImportBatchRepository,
    PlaceSourceSnapshotRepository,
    PlaceStagingRepository,
    PlaceStagingAuditRepository
{
  private batches = new Map<string, PlaceImportBatch>();
  private snapshots = new Map<string, PlaceSourceSnapshot>();
  private records = new Map<string, PlaceStagingRecord>();
  private auditByRecord = new Map<string, PlaceStagingAuditEntry[]>();
  private insertionOrder: string[] = [];

  constructor(
    private clock: StoreClock = { now: () => Date.now() },
    private ids: IdGen = defaultIdGen(),
  ) {}

  // ---- Import batch ----
  async createBatch(batch: PlaceImportBatch): Promise<PlaceImportBatch> {
    if (this.batches.has(batch.importBatchId)) {
      throw new Error(`batch exists: ${batch.importBatchId}`);
    }
    this.batches.set(batch.importBatchId, { ...batch });
    return { ...batch };
  }

  async getBatch(id: string): Promise<PlaceImportBatch | null> {
    const b = this.batches.get(id);
    return b ? { ...b } : null;
  }

  async updateBatchStatus(
    id: string,
    status: PlaceImportBatch["processingStatus"],
    patch?: Partial<PlaceImportBatch>,
  ): Promise<void> {
    const b = this.batches.get(id);
    if (!b) throw new Error(`batch not found: ${id}`);
    this.batches.set(id, {
      ...b,
      ...patch,
      processingStatus: status,
      updatedAt: this.clock.now(),
    });
  }

  // ---- Source snapshot (immutable) ----
  async createSnapshot(
    snapshot: PlaceSourceSnapshot,
  ): Promise<PlaceSourceSnapshot> {
    if (this.snapshots.has(snapshot.snapshotId)) {
      throw new Error(`snapshot immutable — already exists: ${snapshot.snapshotId}`);
    }
    this.snapshots.set(snapshot.snapshotId, { ...snapshot });
    return { ...snapshot };
  }

  async getSnapshot(id: string): Promise<PlaceSourceSnapshot | null> {
    const s = this.snapshots.get(id);
    return s ? { ...s } : null;
  }

  async correctMetadata(
    id: string,
    patch: SnapshotMetadataCorrection,
  ): Promise<void> {
    const s = this.snapshots.get(id);
    if (!s) throw new Error(`snapshot not found: ${id}`);
    // HANYA medan metadata dibenarkan — tiada penulisan semula payload/identiti.
    this.snapshots.set(id, {
      ...s,
      ...(patch.attribution !== undefined ? { attribution: patch.attribution } : {}),
      ...(patch.licenseId !== undefined ? { licenseId: patch.licenseId } : {}),
      ...(patch.termsMetadata !== undefined ? { termsMetadata: patch.termsMetadata } : {}),
      ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
      ...(patch.normalizedPayloadHash !== undefined
        ? { normalizedPayloadHash: patch.normalizedPayloadHash }
        : {}),
    });
  }

  // ---- Staging record ----
  async createStagingRecord(
    record: PlaceStagingRecord,
    actor: TrustedActor,
  ): Promise<PlaceStagingRecord> {
    if (this.records.has(record.stagingRecordId)) {
      throw new Error(`staging record exists: ${record.stagingRecordId}`);
    }
    const stored: PlaceStagingRecord = { ...record, auditTrail: [] };
    this.records.set(record.stagingRecordId, stored);
    this.insertionOrder.push(record.stagingRecordId);
    await this.appendAuditInternal(record.stagingRecordId, "imported", actor, {
      nextState: record.reviewStatus,
    });
    return this.clone(record.stagingRecordId);
  }

  async getStagingRecord(id: string): Promise<PlaceStagingRecord | null> {
    const r = this.records.get(id);
    return r ? this.clone(id) : null;
  }

  async listStagingRecords(
    filter: StagingListFilter,
    page: Pagination,
  ): Promise<Page<PlaceStagingRecord>> {
    const limit = Math.max(1, Math.min(page.limit, MAX_PAGE_LIMIT));
    let ids = this.insertionOrder.filter((id) => {
      const r = this.records.get(id)!;
      if (filter.reviewStatus && r.reviewStatus !== filter.reviewStatus) return false;
      if (filter.importBatchId && r.importBatchId !== filter.importBatchId) return false;
      if (filter.assignedReviewer && r.assignedReviewer !== filter.assignedReviewer) return false;
      if (filter.sourceType) {
        // sourceType difilter melalui snapshot yang dirujuk calon.
        const snap = this.snapshots.get(r.sourceSnapshotId);
        if (!snap || snap.sourceType !== filter.sourceType) return false;
      }
      return true;
    });
    if (page.cursor) {
      const idx = ids.indexOf(page.cursor);
      ids = idx >= 0 ? ids.slice(idx + 1) : ids;
    }
    const slice = ids.slice(0, limit);
    const items = slice.map((id) => this.clone(id));
    const nextCursor = ids.length > limit ? slice[slice.length - 1] : undefined;
    return { items, nextCursor };
  }

  async transitionReviewStatus(
    id: string,
    to: StagingReviewStatus,
    actor: TrustedActor,
    reasonCode?: string,
  ): Promise<PlaceStagingRecord> {
    const r = this.records.get(id);
    if (!r) throw new Error(`staging record not found: ${id}`);
    assertValidStagingTransition(r.reviewStatus, to);
    const from = r.reviewStatus;
    r.reviewStatus = to;
    r.updatedAt = this.clock.now();
    await this.appendAuditInternal(id, this.actionForStatus(to), actor, {
      previousState: from,
      nextState: to,
      reasonCode,
    });
    return this.clone(id);
  }

  async assignReviewer(
    id: string,
    reviewerUid: string,
    actor: TrustedActor,
  ): Promise<void> {
    const r = this.records.get(id);
    if (!r) throw new Error(`staging record not found: ${id}`);
    r.assignedReviewer = reviewerUid;
    r.updatedAt = this.clock.now();
    await this.appendAuditInternal(id, "assigned", actor, {
      changedFields: ["assignedReviewer"],
    });
  }

  async recordReviewDecision(
    id: string,
    decision: PlaceReviewDecision,
    actor: TrustedActor,
  ): Promise<PlaceStagingRecord> {
    const r = this.records.get(id);
    if (!r) throw new Error(`staging record not found: ${id}`);
    const v = validateReviewDecision(decision);
    if (!v.ok) {
      throw new Error(`invalid decision: ${v.issues.map((i) => i.code).join(",")}`);
    }
    assertValidStagingTransition(r.reviewStatus, decision.nextReviewStatus);
    const from = r.reviewStatus;
    r.reviewStatus = decision.nextReviewStatus;
    r.approvalDecision = decision.decision;
    // reviewedBy diambil daripada pelaku DIPERCAYAI (pelayan) — bukan klien.
    r.reviewedBy = actor.actorUid;
    r.reviewedAt = this.clock.now();
    r.updatedAt = this.clock.now();
    if (decision.decision === "reject") r.rejectionReason = decision.reasonCode;
    if (decision.decision === "merge_into_existing") {
      r.mergeTargetPlaceId = decision.targetCanonicalPlaceId;
    }
    await this.appendAuditInternal(id, this.actionForStatus(decision.nextReviewStatus), actor, {
      previousState: from,
      nextState: decision.nextReviewStatus,
      reasonCode: decision.reasonCode,
    });
    return this.clone(id);
  }

  async setValidationResult(
    id: string,
    result: PlaceValidationResult,
    actor: TrustedActor,
  ): Promise<void> {
    const r = this.records.get(id);
    if (!r) throw new Error(`staging record not found: ${id}`);
    r.validationResult = result;
    r.updatedAt = this.clock.now();
    await this.appendAuditInternal(
      id,
      result.valid ? "validation_passed" : "validation_failed",
      actor,
      { changedFields: ["validationResult"] },
    );
  }

  // ---- Audit (append-only) ----
  async appendAudit(
    entry: PlaceStagingAuditEntry,
  ): Promise<PlaceStagingAuditEntry> {
    const list = this.auditByRecord.get(entry.stagingRecordId) ?? [];
    list.push({ ...entry });
    this.auditByRecord.set(entry.stagingRecordId, list);
    const rec = this.records.get(entry.stagingRecordId);
    if (rec) rec.auditTrail = [...list];
    return { ...entry };
  }

  async listAudit(stagingRecordId: string): Promise<PlaceStagingAuditEntry[]> {
    return (this.auditByRecord.get(stagingRecordId) ?? []).map((e) => ({ ...e }));
  }

  // ---- Dalaman ----
  private async appendAuditInternal(
    stagingRecordId: string,
    action: StagingAuditAction,
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
      metadata: extra.metadata,
      createdAt: this.clock.now(),
    });
  }

  private actionForStatus(status: StagingReviewStatus): StagingAuditAction {
    switch (status) {
      case "approved":
        return "approved";
      case "rejected":
        return "rejected";
      case "duplicate_candidate":
        return "marked_duplicate";
      case "merged":
        return "merged";
      case "needs_review":
        return "reopened";
      case "cancelled":
        return "cancelled";
      case "validation_failed":
        return "validation_failed";
      default:
        return "edited";
    }
  }

  private clone(id: string): PlaceStagingRecord {
    const r = this.records.get(id)!;
    return {
      ...r,
      duplicateCandidates: [...r.duplicateCandidates],
      auditTrail: [...r.auditTrail],
    };
  }
}
