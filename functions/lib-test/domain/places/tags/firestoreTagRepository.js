"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreTagStore = void 0;
/**
 * Phase 1.5 — repository tag Firestore (firebase-admin) — UJIAN EMULATOR SAHAJA.
 * Tidak diimport oleh functions/src/index.ts. Koleksi: place_tag_definitions,
 * place_tag_sets/{placeId}/evidence, place_tag_sets/{placeId}/audit.
 * TIADA bacaan mobile, publication, tulisan klien, place_registry.
 */
const firestore_1 = require("firebase-admin/firestore");
const tagEvidence_1 = require("./tagEvidence");
const tagRepository_1 = require("./tagRepository");
const C_DEF = "place_tag_definitions";
const C_SET = "place_tag_sets";
function toPlain(v) {
    return JSON.parse(JSON.stringify(v));
}
function statusToAction(to) {
    switch (to) {
        case "approved":
            return "tag_approved";
        case "rejected":
            return "tag_rejected";
        case "expired":
            return "tag_expired";
        case "superseded":
            return "tag_superseded";
        default:
            return "tag_normalized";
    }
}
class FirestoreTagStore {
    db;
    clock;
    constructor(db, clock = { now: () => Date.now() }) {
        this.db = db;
        this.clock = clock;
    }
    async seedDefinition(def) {
        await this.db.collection(C_DEF).doc(def.tagId).set(toPlain(def), { merge: true });
        return def;
    }
    async getDefinition(tagId) {
        const s = await this.db.collection(C_DEF).doc(tagId).get();
        return s.exists ? s.data() : null;
    }
    async listByFamily(familyId, page) {
        const limit = Math.max(1, Math.min(page.limit, tagRepository_1.MAX_TAG_PAGE_LIMIT));
        let q = this.db
            .collection(C_DEF)
            .where("familyId", "==", familyId)
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
    async resolveAlias(tagId) {
        let cur = tagId;
        const seen = new Set();
        let hops = 0;
        while (hops <= 8) {
            if (seen.has(cur))
                return null;
            seen.add(cur);
            const doc = await this.db.collection(C_DEF).doc(cur).get();
            if (doc.exists) {
                const d = doc.data();
                if (d.status !== "deprecated")
                    return cur;
                if (d.replacedByTagId) {
                    cur = d.replacedByTagId;
                    hops++;
                    continue;
                }
                return null;
            }
            const q = await this.db.collection(C_DEF).where("aliases", "array-contains", cur).limit(1).get();
            if (q.empty)
                return null;
            cur = q.docs[0].id;
            hops++;
        }
        return null;
    }
    async createProposedEvidence(placeId, ev, actor) {
        const stored = { ...ev, status: "proposed" };
        await this.db.collection(C_SET).doc(placeId).collection("evidence").doc(ev.tagId).set(toPlain(stored));
        await this.appendAuditInternal(placeId, "tag_proposed", actor, {
            tagId: ev.tagId,
            familyId: ev.familyId,
            nextState: "proposed",
            evidenceLevel: ev.evidenceLevel,
            confidence: ev.confidence,
        });
        return stored;
    }
    async storeNormalizedTagSet(placeId, tags, actor) {
        const batch = this.db.batch();
        const col = this.db.collection(C_SET).doc(placeId).collection("evidence");
        for (const t of tags)
            batch.set(col.doc(t.tagId), toPlain(t));
        await batch.commit();
        await this.appendAuditInternal(placeId, "tag_normalized", actor, { nextState: "normalized" });
    }
    async getTagSet(placeId) {
        const snap = await this.db.collection(C_SET).doc(placeId).collection("evidence").get();
        return snap.docs.map((d) => d.data());
    }
    async transitionEvidenceStatus(placeId, tagId, to, actor, reasonCode) {
        const ref = this.db.collection(C_SET).doc(placeId).collection("evidence").doc(tagId);
        const updated = await this.db.runTransaction(async (tx) => {
            const s = await tx.get(ref);
            if (!s.exists)
                throw new Error(`tag evidence not found: ${placeId}/${tagId}`);
            const ev = s.data();
            (0, tagEvidence_1.assertValidTagEvidenceTransition)(ev.status, to);
            const patch = { status: to };
            if (to === "approved") {
                patch.approvedBy = actor.actorUid;
                patch.approvedAt = this.clock.now();
            }
            if (to === "rejected" && reasonCode)
                patch.rejectionReason = reasonCode;
            tx.set(ref, toPlain(patch), { merge: true });
            return { ...ev, ...patch };
        });
        await this.appendAuditInternal(placeId, statusToAction(to), actor, {
            tagId,
            previousState: undefined,
            nextState: to,
            reasonCode,
        });
        return updated;
    }
    async appendAudit(entry) {
        await this.db
            .collection(C_SET)
            .doc(entry.placeId)
            .collection("audit")
            .doc(entry.auditId)
            .create(toPlain(entry));
        return entry;
    }
    async listAudit(placeId) {
        const snap = await this.db.collection(C_SET).doc(placeId).collection("audit").orderBy("createdAt").get();
        return snap.docs.map((d) => d.data());
    }
    async appendAuditInternal(placeId, action, actor, extra = {}) {
        await this.appendAudit({
            auditId: `tagaud_${Math.floor(Math.random() * 1e9).toString(36)}`,
            placeId,
            action,
            actorUid: actor.actorUid,
            actorRole: actor.actorRole,
            createdAt: this.clock.now(),
            ...extra,
        });
    }
}
exports.FirestoreTagStore = FirestoreTagStore;
