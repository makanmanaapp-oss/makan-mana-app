"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestorePublicationStore = void 0;
/**
 * Phase 1.6 Part L — repository penerbitan Firestore — UJIAN EMULATOR SAHAJA.
 *
 * TIDAK diimport oleh functions/src/index.ts. Koleksi:
 *   place_publications/{publicationId}
 *   place_publication_heads/{placeId}
 *   place_publication_rollbacks/{rollbackId}
 *   place_status_audit/{auditId}
 *   place_cache_invalidations/{eventId}
 *
 * TIADA bacaan mobile, TIADA place_registry, TIADA hard delete, TIADA
 * invalidasi cache langsung.
 */
const firestore_1 = require("firebase-admin/firestore");
const cacheInvalidation_1 = require("./cacheInvalidation");
const publicationAudit_1 = require("./publicationAudit");
const publicationRepository_1 = require("./publicationRepository");
const publicationVersion_1 = require("./publicationVersion");
const publicationRollback_1 = require("./publicationRollback");
const eligibilityConfig_1 = require("./eligibilityConfig");
const C_PUB = "place_publications";
const C_HEAD = "place_publication_heads";
const C_RBK = "place_publication_rollbacks";
const C_AUDIT = "place_status_audit";
const C_INV = "place_cache_invalidations";
function toPlain(v) {
    return JSON.parse(JSON.stringify(v));
}
class FirestorePublicationStore {
    db;
    clock;
    constructor(db, clock = { now: () => Date.now() }) {
        this.db = db;
        this.clock = clock;
    }
    // ---------------------------------------------------------------------
    // Versi penerbitan (IMMUTABLE + idempoten)
    // ---------------------------------------------------------------------
    async createPublicationVersion(version, actor) {
        const ref = this.db.collection(C_PUB).doc(version.publicationId);
        const existing = await ref.get();
        if (existing.exists)
            return existing.data();
        // Idempotency merentas ID: kandungan sama untuk kedai sama.
        const sameContent = await this.db
            .collection(C_PUB)
            .where("placeId", "==", version.placeId)
            .where("contentHash", "==", version.contentHash)
            .limit(1)
            .get();
        if (!sameContent.empty) {
            return sameContent.docs[0].data();
        }
        const issues = (0, publicationVersion_1.validatePublicationVersion)(version);
        if (issues.length > 0) {
            throw new Error(`invalid publication version: ${issues.join(",")}`);
        }
        // `create` gagal jika dokumen sudah wujud → kekal immutable.
        await ref.create(toPlain(version));
        await this.appendStatusAudit({
            auditId: (0, publicationAudit_1.statusAuditId)(version.placeId, "publication_created", version.createdAt, version.publicationId),
            placeId: version.placeId,
            action: "publication_created",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            nextState: version.publicationStatus,
            reasonCode: "publication_created",
            publicationId: version.publicationId,
            createdAt: version.createdAt,
        });
        await this.appendInvalidationEvent((0, cacheInvalidation_1.buildCacheInvalidationEvent)({
            placeId: version.placeId,
            reason: "publication_created",
            createdAt: version.createdAt,
            algorithmVersion: version.algorithmVersion,
            publicationVersion: version.versionNumber,
        }));
        return version;
    }
    async getPublicationVersion(publicationId) {
        const s = await this.db.collection(C_PUB).doc(publicationId).get();
        return s.exists ? s.data() : null;
    }
    async listVersionsByPlace(placeId, page) {
        const limit = Math.max(1, Math.min(page.limit, publicationRepository_1.MAX_PUBLICATION_PAGE_LIMIT));
        let q = this.db
            .collection(C_PUB)
            .where("placeId", "==", placeId)
            .orderBy("versionNumber", "desc");
        if (page.cursor) {
            const cur = await this.db.collection(C_PUB).doc(page.cursor).get();
            if (cur.exists)
                q = q.startAfter(cur);
        }
        const snap = await q.limit(limit + 1).get();
        const docs = snap.docs.slice(0, limit);
        return {
            items: docs.map((d) => d.data()),
            nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : undefined,
        };
    }
    async nextVersionNumber(placeId) {
        const snap = await this.db
            .collection(C_PUB)
            .where("placeId", "==", placeId)
            .orderBy("versionNumber", "desc")
            .limit(1)
            .get();
        if (snap.empty)
            return 1;
        return (snap.docs[0].data().versionNumber ?? 0) + 1;
    }
    async getActiveHead(placeId) {
        const s = await this.db.collection(C_HEAD).doc(placeId).get();
        return s.exists ? s.data() : null;
    }
    async setEmulatorActivePublication(placeId, publicationId, actor, reasonCode) {
        const pub = await this.getPublicationVersion(publicationId);
        if (!pub)
            throw new Error(`publication not found: ${publicationId}`);
        if (pub.placeId !== placeId) {
            throw new Error(`publication ${publicationId} does not belong to ${placeId}`);
        }
        const now = this.clock.now();
        const previous = await this.getActiveHead(placeId);
        const head = {
            placeId,
            activePublicationId: publicationId,
            activeVersionNumber: pub.versionNumber,
            updatedAt: now,
            updatedBy: actor.actorUid,
            reasonCode,
        };
        await this.db.collection(C_HEAD).doc(placeId).set(toPlain(head));
        await this.appendStatusAudit({
            auditId: (0, publicationAudit_1.statusAuditId)(placeId, "publication_head_moved", now, publicationId),
            placeId,
            action: "publication_head_moved",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            previousState: previous?.activePublicationId,
            nextState: publicationId,
            reasonCode,
            publicationId,
            createdAt: now,
        });
        return head;
    }
    // ---------------------------------------------------------------------
    // Rollback
    // ---------------------------------------------------------------------
    async requestRollback(params) {
        const { placeId, fromPublicationId, targetPublicationId, actor } = params;
        const target = await this.getPublicationVersion(targetPublicationId);
        if (!target)
            throw new Error(`target publication not found: ${targetPublicationId}`);
        if (target.placeId !== placeId) {
            throw new Error(`target publication does not belong to ${placeId}`);
        }
        if (!(await this.getPublicationVersion(fromPublicationId))) {
            throw new Error(`source publication not found: ${fromPublicationId}`);
        }
        const now = this.clock.now();
        const id = `rbk_${(0, publicationVersion_1.computePublicationContentHash)({
            placeId,
            snapshot: { place: target.snapshot.place },
            sourceCanonicalVersion: `${fromPublicationId}->${targetPublicationId}`,
            algorithmVersion: eligibilityConfig_1.PUBLICATION_ALGORITHM_VERSION,
            configVersion: target.configVersion,
        }).slice(0, 32)}`;
        const ref = this.db.collection(C_RBK).doc(id);
        const existing = await ref.get();
        if (existing.exists)
            return existing.data();
        const rollback = {
            rollbackId: id,
            placeId,
            fromPublicationId,
            targetPublicationId,
            requestedBy: actor.actorUid,
            reasonCode: params.reasonCode,
            notes: params.notes,
            requestedAt: now,
            status: "requested",
            auditEntries: [
                {
                    auditId: `${id}_a0`,
                    rollbackId: id,
                    action: "rollback_requested",
                    actorUid: actor.actorUid,
                    actorRole: actor.actorRole,
                    nextStatus: "requested",
                    notes: params.notes,
                    createdAt: now,
                },
            ],
        };
        await ref.create(toPlain(rollback));
        await this.appendStatusAudit({
            auditId: (0, publicationAudit_1.statusAuditId)(placeId, "rollback_requested", now, id),
            placeId,
            action: "rollback_requested",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            nextState: "requested",
            reasonCode: params.reasonCode,
            publicationId: targetPublicationId,
            createdAt: now,
        });
        return rollback;
    }
    async getRollback(rollbackId) {
        const s = await this.db.collection(C_RBK).doc(rollbackId).get();
        return s.exists ? s.data() : null;
    }
    async approveRollback(rollbackId, actor) {
        const r = await this.getRollback(rollbackId);
        if (!r)
            throw new Error(`rollback not found: ${rollbackId}`);
        if (r.status === "approved")
            return r; // idempoten
        (0, publicationRollback_1.assertValidRollbackTransition)(r.status, "approved");
        const now = this.clock.now();
        r.approvedBy = actor.actorUid;
        r.status = "approved";
        r.auditEntries.push({
            auditId: `${rollbackId}_a${r.auditEntries.length}`,
            rollbackId,
            action: "rollback_approved",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            previousStatus: "requested",
            nextStatus: "approved",
            createdAt: now,
        });
        await this.db.collection(C_RBK).doc(rollbackId).set(toPlain(r));
        await this.appendStatusAudit({
            auditId: (0, publicationAudit_1.statusAuditId)(r.placeId, "rollback_approved", now, rollbackId),
            placeId: r.placeId,
            action: "rollback_approved",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            previousState: "requested",
            nextState: "approved",
            reasonCode: r.reasonCode,
            createdAt: now,
        });
        return r;
    }
    async executeRollbackInEmulator(rollbackId, actor) {
        const r = await this.getRollback(rollbackId);
        if (!r)
            throw new Error(`rollback not found: ${rollbackId}`);
        if (r.status === "executed_in_emulator")
            return r; // idempoten
        (0, publicationRollback_1.assertValidRollbackTransition)(r.status, "executed_in_emulator");
        const target = await this.getPublicationVersion(r.targetPublicationId);
        if (!target)
            throw new Error(`target publication missing: ${r.targetPublicationId}`);
        const now = this.clock.now();
        const versionNumber = await this.nextVersionNumber(r.placeId);
        const snapshot = toPlain(target.snapshot);
        const contentInput = {
            placeId: r.placeId,
            snapshot,
            sourceCanonicalVersion: `rollback:${r.rollbackId}:${target.sourceCanonicalVersion}`,
            algorithmVersion: target.algorithmVersion,
            configVersion: target.configVersion,
        };
        const restored = {
            publicationId: (0, publicationVersion_1.publicationIdFromContent)(contentInput),
            placeId: r.placeId,
            versionNumber,
            sourceCanonicalVersion: contentInput.sourceCanonicalVersion,
            snapshot,
            publicationStatus: "published",
            publishedBy: actor.actorUid,
            publishedAt: now,
            effectiveFrom: now,
            supersedesPublicationId: r.fromPublicationId,
            rollbackOfPublicationId: r.targetPublicationId,
            eligibilitySnapshot: toPlain(target.eligibilitySnapshot),
            warnings: [...target.warnings],
            changeSummary: ["rollback_restore"],
            contentHash: (0, publicationVersion_1.computePublicationContentHash)(contentInput),
            algorithmVersion: target.algorithmVersion,
            configVersion: target.configVersion,
            createdAt: now,
        };
        await this.createPublicationVersion(restored, actor);
        // Versi terdahulu ditanda superseded — TIDAK dipadam (sejarah kekal).
        await this.db
            .collection(C_PUB)
            .doc(r.fromPublicationId)
            .set({ publicationStatus: "superseded", effectiveUntil: now }, { merge: true });
        await this.setEmulatorActivePublication(r.placeId, restored.publicationId, actor, "rollback_executed");
        r.status = "executed_in_emulator";
        r.executedAt = now;
        r.resultingPublicationId = restored.publicationId;
        r.auditEntries.push({
            auditId: `${rollbackId}_a${r.auditEntries.length}`,
            rollbackId,
            action: "rollback_executed",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            previousStatus: "approved",
            nextStatus: "executed_in_emulator",
            createdAt: now,
        });
        await this.db.collection(C_RBK).doc(rollbackId).set(toPlain(r));
        await this.appendStatusAudit({
            auditId: (0, publicationAudit_1.statusAuditId)(r.placeId, "rollback_executed", now, rollbackId),
            placeId: r.placeId,
            action: "rollback_executed",
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            previousState: r.fromPublicationId,
            nextState: restored.publicationId,
            reasonCode: r.reasonCode,
            publicationId: restored.publicationId,
            createdAt: now,
        });
        await this.appendInvalidationEvent((0, cacheInvalidation_1.buildCacheInvalidationEvent)({
            placeId: r.placeId,
            reason: "rollback_executed",
            createdAt: now,
            algorithmVersion: restored.algorithmVersion,
            publicationVersion: restored.versionNumber,
        }));
        return r;
    }
    async listRollbacksByPlace(placeId, page) {
        const limit = Math.max(1, Math.min(page.limit, publicationRepository_1.MAX_PUBLICATION_PAGE_LIMIT));
        let q = this.db
            .collection(C_RBK)
            .where("placeId", "==", placeId)
            .orderBy(firestore_1.FieldPath.documentId());
        if (page.cursor)
            q = q.startAfter(page.cursor);
        const snap = await q.limit(limit + 1).get();
        const docs = snap.docs.slice(0, limit);
        return {
            items: docs.map((d) => d.data()),
            nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : undefined,
        };
    }
    // ---------------------------------------------------------------------
    // Audit & invalidasi — append-only (guna `create`, bukan `set`)
    // ---------------------------------------------------------------------
    async appendStatusAudit(entry) {
        const ref = this.db.collection(C_AUDIT).doc(entry.auditId);
        const existing = await ref.get();
        if (existing.exists)
            return existing.data();
        await ref.create(toPlain(entry));
        return entry;
    }
    async listStatusAudit(placeId, page) {
        const limit = Math.max(1, Math.min(page.limit, publicationRepository_1.MAX_PUBLICATION_PAGE_LIMIT));
        let q = this.db
            .collection(C_AUDIT)
            .where("placeId", "==", placeId)
            .orderBy(firestore_1.FieldPath.documentId());
        if (page.cursor)
            q = q.startAfter(page.cursor);
        const snap = await q.limit(limit + 1).get();
        const docs = snap.docs.slice(0, limit);
        return {
            items: docs.map((d) => d.data()),
            nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : undefined,
        };
    }
    async appendInvalidationEvent(event) {
        const ref = this.db.collection(C_INV).doc(event.eventId);
        const existing = await ref.get();
        if (existing.exists)
            return existing.data();
        await ref.create(toPlain(event));
        return event;
    }
    async listInvalidationEvents(placeId, page) {
        const limit = Math.max(1, Math.min(page.limit, publicationRepository_1.MAX_PUBLICATION_PAGE_LIMIT));
        let q = this.db
            .collection(C_INV)
            .where("placeId", "==", placeId)
            .orderBy(firestore_1.FieldPath.documentId());
        if (page.cursor)
            q = q.startAfter(page.cursor);
        const snap = await q.limit(limit + 1).get();
        const docs = snap.docs.slice(0, limit);
        return {
            items: docs.map((d) => d.data()),
            nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : undefined,
        };
    }
}
exports.FirestorePublicationStore = FirestorePublicationStore;
