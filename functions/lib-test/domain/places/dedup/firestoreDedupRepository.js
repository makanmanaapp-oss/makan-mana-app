"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreDedupStore = void 0;
/**
 * Phase 1.4 — repository dedup Firestore (firebase-admin) untuk UJIAN EMULATOR
 * SAHAJA. Tidak diimport oleh functions/src/index.ts. Koleksi:
 * place_merge_queue, place_aliases, place_merge_plans (+audit subkoleksi).
 * TIADA hard delete, TIADA publish, TIADA place_registry.
 */
const firestore_1 = require("firebase-admin/firestore");
const aliasResolver_1 = require("./aliasResolver");
const duplicateCandidate_1 = require("./duplicateCandidate");
const mergePlan_1 = require("./mergePlan");
const dedupRepository_1 = require("./dedupRepository");
const C_QUEUE = "place_merge_queue";
const C_ALIAS = "place_aliases";
const C_PLAN = "place_merge_plans";
function toPlain(v) {
    return JSON.parse(JSON.stringify(v));
}
class FirestoreDedupStore {
    db;
    clock;
    constructor(db, clock = { now: () => Date.now() }) {
        this.db = db;
        this.clock = clock;
    }
    async createDuplicateCandidate(candidate, _actor) {
        const ref = this.db.collection(C_QUEUE).doc(candidate.duplicateCandidateId);
        const existing = await ref.get();
        if (existing.exists)
            return existing.data(); // idempoten
        await ref.create(toPlain(candidate));
        return candidate;
    }
    async getDuplicateCandidate(id) {
        const s = await this.db.collection(C_QUEUE).doc(id).get();
        return s.exists ? s.data() : null;
    }
    async listDuplicateCandidates(filter, page) {
        const limit = Math.max(1, Math.min(page.limit, dedupRepository_1.MAX_DEDUP_PAGE_LIMIT));
        let q = this.db.collection(C_QUEUE).orderBy(firestore_1.FieldPath.documentId());
        if (filter.reviewStatus)
            q = q.where("reviewStatus", "==", filter.reviewStatus);
        if (filter.decision)
            q = q.where("decision", "==", filter.decision);
        if (filter.stagingRecordId)
            q = q.where("stagingRecordId", "==", filter.stagingRecordId);
        if (page.cursor)
            q = q.startAfter(page.cursor);
        const snap = await q.limit(limit + 1).get();
        const docs = snap.docs.slice(0, limit);
        return {
            items: docs.map((d) => d.data()),
            nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : undefined,
        };
    }
    async updateDuplicateReviewStatus(id, to, actor, resolution) {
        const ref = this.db.collection(C_QUEUE).doc(id);
        return this.db.runTransaction(async (tx) => {
            const s = await tx.get(ref);
            if (!s.exists)
                throw new Error(`duplicate candidate not found: ${id}`);
            const c = s.data();
            (0, duplicateCandidate_1.assertValidDuplicateTransition)(c.reviewStatus, to);
            const patch = {
                reviewStatus: to,
                resolvedBy: actor.actorUid,
                resolvedAt: this.clock.now(),
            };
            if (resolution)
                patch.resolution = resolution;
            tx.set(ref, toPlain(patch), { merge: true });
            return { ...c, ...patch };
        });
    }
    async createMergePlan(plan, _actor) {
        await this.db.collection(C_PLAN).doc(plan.mergePlanId).create(toPlain(plan));
        return plan;
    }
    async getMergePlan(id) {
        const s = await this.db.collection(C_PLAN).doc(id).get();
        return s.exists ? s.data() : null;
    }
    async transitionMergePlan(id, to, actor) {
        const ref = this.db.collection(C_PLAN).doc(id);
        return this.db.runTransaction(async (tx) => {
            const s = await tx.get(ref);
            if (!s.exists)
                throw new Error(`merge plan not found: ${id}`);
            const p = s.data();
            (0, mergePlan_1.assertValidMergePlanTransition)(p.status, to);
            const patch = { status: to };
            if (to === "approved") {
                patch.approvedBy = actor.actorUid;
                patch.approvedAt = this.clock.now();
            }
            tx.set(ref, toPlain(patch), { merge: true });
            return { ...p, ...patch };
        });
    }
    async cancelMergePlan(id, actor) {
        return this.transitionMergePlan(id, "cancelled", actor);
    }
    async appendMergeAudit(planId, entry) {
        await this.db
            .collection(C_PLAN)
            .doc(planId)
            .collection("audit")
            .doc(entry.auditId)
            .create(toPlain(entry));
        return entry;
    }
    async listMergeAudit(planId) {
        const snap = await this.db
            .collection(C_PLAN)
            .doc(planId)
            .collection("audit")
            .orderBy("createdAt")
            .get();
        return snap.docs.map((d) => d.data());
    }
    async putAlias(alias, _actor) {
        await this.db.collection(C_ALIAS).doc(alias.aliasId).set(toPlain(alias), { merge: true });
        return alias;
    }
    async getAlias(aliasId) {
        const s = await this.db.collection(C_ALIAS).doc(aliasId).get();
        return s.exists ? s.data() : null;
    }
    async buildAliasMap() {
        const snap = await this.db.collection(C_ALIAS).get();
        const map = new Map();
        for (const d of snap.docs) {
            const a = d.data();
            map.set(a.aliasId, a.canonicalPlaceId);
        }
        return map;
    }
    async resolve(aliasId) {
        return (0, aliasResolver_1.resolveCanonicalPlaceId)(aliasId, await this.buildAliasMap());
    }
}
exports.FirestoreDedupStore = FirestoreDedupStore;
