"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreStagingStore = void 0;
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
const firestore_1 = require("firebase-admin/firestore");
const reviewDecision_1 = require("./reviewDecision");
const stagingStateMachine_1 = require("./stagingStateMachine");
const repository_1 = require("./repository");
const C_BATCH = "place_import_batches";
const C_SNAPSHOT = "place_source_snapshots";
const C_STAGING = "place_staging";
/** Buang undefined + jadikan JSON tulen selamat-Firestore (domain guna epoch ms). */
function toPlain(v) {
    return JSON.parse(JSON.stringify(v));
}
class FirestoreStagingStore {
    db;
    clock;
    ids;
    constructor(db, clock = { now: () => Date.now() }, ids = {
        next: (p) => `${p}_${Math.floor(Math.random() * 1e9).toString(36)}`,
    }) {
        this.db = db;
        this.clock = clock;
        this.ids = ids;
    }
    async createBatch(batch) {
        await this.db.collection(C_BATCH).doc(batch.importBatchId).create(toPlain(batch));
        return batch;
    }
    async getBatch(id) {
        const s = await this.db.collection(C_BATCH).doc(id).get();
        return s.exists ? s.data() : null;
    }
    async updateBatchStatus(id, status, patch) {
        await this.db
            .collection(C_BATCH)
            .doc(id)
            .set(toPlain({ ...patch, processingStatus: status, updatedAt: this.clock.now() }), {
            merge: true,
        });
    }
    async createSnapshot(snapshot) {
        // .create() gagal jika sudah wujud -> immutable.
        await this.db.collection(C_SNAPSHOT).doc(snapshot.snapshotId).create(toPlain(snapshot));
        return snapshot;
    }
    async getSnapshot(id) {
        const s = await this.db.collection(C_SNAPSHOT).doc(id).get();
        return s.exists ? s.data() : null;
    }
    async correctMetadata(id, patch) {
        // Hanya medan metadata dibenarkan.
        await this.db.collection(C_SNAPSHOT).doc(id).set(toPlain(patch), { merge: true });
    }
    async createStagingRecord(record, actor) {
        const stored = { ...record, auditTrail: [] };
        await this.db.collection(C_STAGING).doc(record.stagingRecordId).create(toPlain(stored));
        await this.appendAuditInternal(record.stagingRecordId, "imported", actor, {
            nextState: record.reviewStatus,
        });
        return stored;
    }
    async getStagingRecord(id) {
        const s = await this.db.collection(C_STAGING).doc(id).get();
        return s.exists ? s.data() : null;
    }
    async listStagingRecords(filter, page) {
        const limit = Math.max(1, Math.min(page.limit, repository_1.MAX_PAGE_LIMIT));
        let q = this.db.collection(C_STAGING).orderBy(firestore_1.FieldPath.documentId());
        if (filter.reviewStatus)
            q = q.where("reviewStatus", "==", filter.reviewStatus);
        if (filter.importBatchId)
            q = q.where("importBatchId", "==", filter.importBatchId);
        if (filter.assignedReviewer) {
            q = q.where("assignedReviewer", "==", filter.assignedReviewer);
        }
        if (page.cursor)
            q = q.startAfter(page.cursor);
        const snap = await q.limit(limit + 1).get();
        const docs = snap.docs.slice(0, limit);
        const items = docs.map((d) => d.data());
        const nextCursor = snap.docs.length > limit ? docs[docs.length - 1].id : undefined;
        return { items, nextCursor };
    }
    async transitionReviewStatus(id, to, actor, reasonCode) {
        const ref = this.db.collection(C_STAGING).doc(id);
        const updated = await this.db.runTransaction(async (tx) => {
            const s = await tx.get(ref);
            if (!s.exists)
                throw new Error(`staging record not found: ${id}`);
            const r = s.data();
            (0, stagingStateMachine_1.assertValidStagingTransition)(r.reviewStatus, to);
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
    async assignReviewer(id, reviewerUid, actor) {
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
    async recordReviewDecision(id, decision, actor) {
        const v = (0, reviewDecision_1.validateReviewDecision)(decision);
        if (!v.ok) {
            throw new Error(`invalid decision: ${v.issues.map((i) => i.code).join(",")}`);
        }
        const ref = this.db.collection(C_STAGING).doc(id);
        const updated = await this.db.runTransaction(async (tx) => {
            const s = await tx.get(ref);
            if (!s.exists)
                throw new Error(`staging record not found: ${id}`);
            const r = s.data();
            (0, stagingStateMachine_1.assertValidStagingTransition)(r.reviewStatus, decision.nextReviewStatus);
            const patch = {
                reviewStatus: decision.nextReviewStatus,
                approvalDecision: decision.decision,
                reviewedBy: actor.actorUid, // pelaku dipercayai, bukan klien
                reviewedAt: this.clock.now(),
                updatedAt: this.clock.now(),
            };
            if (decision.decision === "reject")
                patch.rejectionReason = decision.reasonCode;
            if (decision.decision === "merge_into_existing") {
                patch.mergeTargetPlaceId = decision.targetCanonicalPlaceId;
            }
            tx.set(ref, toPlain(patch), { merge: true });
            return { ...r, ...patch };
        });
        await this.appendAuditInternal(id, "edited", actor, {
            previousState: undefined,
            nextState: decision.nextReviewStatus,
            reasonCode: decision.reasonCode,
        });
        return updated;
    }
    async setValidationResult(id, result, actor) {
        await this.db
            .collection(C_STAGING)
            .doc(id)
            .set(toPlain({ validationResult: result, updatedAt: this.clock.now() }), {
            merge: true,
        });
        await this.appendAuditInternal(id, result.valid ? "validation_passed" : "validation_failed", actor, { changedFields: ["validationResult"] });
    }
    async appendAudit(entry) {
        await this.db
            .collection(C_STAGING)
            .doc(entry.stagingRecordId)
            .collection("audit")
            .doc(entry.auditId)
            .create(toPlain(entry));
        return entry;
    }
    async listAudit(stagingRecordId) {
        const snap = await this.db
            .collection(C_STAGING)
            .doc(stagingRecordId)
            .collection("audit")
            .orderBy("createdAt")
            .get();
        return snap.docs.map((d) => d.data());
    }
    async appendAuditInternal(stagingRecordId, action, actor, extra = {}) {
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
exports.FirestoreStagingStore = FirestoreStagingStore;
