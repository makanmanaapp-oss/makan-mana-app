"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreCorrectionStore = void 0;
/**
 * Phase 1.11 Part P — repository pembetulan Firestore — UJIAN EMULATOR SAHAJA.
 *
 * TIDAK diimport oleh functions/src/index.ts. Koleksi:
 *   place_correction_submissions/{submissionId}
 *   place_correction_submissions/{submissionId}/evidence/{evidenceId}
 *   place_correction_submissions/{submissionId}/audit/{auditId}
 *   place_correction_decisions/{decisionId}
 *   place_correction_rate_limits/{key}
 *
 * TIADA kemas kini canonical, TIADA penerbitan, TIADA hard delete.
 */
const firestore_1 = require("firebase-admin/firestore");
const correctionDedup_1 = require("./correctionDedup");
const correctionPrivacy_1 = require("./correctionPrivacy");
const correctionRepository_1 = require("./correctionRepository");
const C_SUB = "place_correction_submissions";
const C_DEC = "place_correction_decisions";
const C_RL = "place_correction_rate_limits";
function toPlain(v) {
    return JSON.parse(JSON.stringify(v));
}
class FirestoreCorrectionStore {
    db;
    clock;
    constructor(db, clock = { now: () => Date.now() }) {
        this.db = db;
        this.clock = clock;
    }
    /** Cipta penghantaran IMMUTABLE (guna `create` supaya tidak ditulis ganti). */
    async createSubmission(submission) {
        const ref = this.db.collection(C_SUB).doc(submission.submissionId);
        const existing = await ref.get();
        if (existing.exists)
            return existing.data();
        await ref.create(toPlain(submission));
        for (const evidence of submission.evidence) {
            await ref.collection("evidence").doc(evidence.evidenceId).create(toPlain(evidence));
        }
        return submission;
    }
    async getSubmissionRaw(submissionId) {
        const s = await this.db.collection(C_SUB).doc(submissionId).get();
        return s.exists ? s.data() : null;
    }
    /** Pelapor membaca miliknya sendiri — MELEMPAR untuk pengguna lain. */
    async getOwnSubmission(submissionId, reporterUid) {
        const raw = await this.getSubmissionRaw(submissionId);
        if (!raw)
            return null;
        return (0, correctionPrivacy_1.toReporterVisibleSubmission)(raw, reporterUid);
    }
    async listOwnSubmissions(reporterUid, page) {
        const limit = Math.max(1, Math.min(page.limit, correctionRepository_1.MAX_CORRECTION_PAGE_LIMIT));
        let q = this.db
            .collection(C_SUB)
            .where("submittedBy", "==", reporterUid)
            .orderBy(firestore_1.FieldPath.documentId());
        if (page.cursor)
            q = q.startAfter(page.cursor);
        const snap = await q.limit(limit + 1).get();
        const docs = snap.docs.slice(0, limit);
        return {
            items: docs.map((d) => (0, correctionPrivacy_1.toReporterVisibleSubmission)(d.data(), reporterUid)),
            nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : undefined,
        };
    }
    /** Tambah bukti — snapshot asal TIDAK disentuh. */
    async appendEvidence(submissionId, evidence, reporterUid) {
        const raw = await this.getSubmissionRaw(submissionId);
        if (!raw)
            throw new Error(`submission not found: ${submissionId}`);
        if (raw.submittedBy !== reporterUid)
            throw new Error("forbidden: not your submission");
        const ref = this.db.collection(C_SUB).doc(submissionId).collection("evidence").doc(evidence.evidenceId);
        const existing = await ref.get();
        if (existing.exists)
            return existing.data();
        await ref.create(toPlain(evidence));
        // Hanya senarai bukti dikemas kini — `originalSnapshot` tidak pernah ditulis.
        await this.db.collection(C_SUB).doc(submissionId).update({
            evidence: [...raw.evidence, toPlain(evidence)],
        });
        return evidence;
    }
    async listEvidence(submissionId) {
        const snap = await this.db
            .collection(C_SUB)
            .doc(submissionId)
            .collection("evidence")
            .orderBy(firestore_1.FieldPath.documentId())
            .limit(correctionRepository_1.MAX_CORRECTION_PAGE_LIMIT)
            .get();
        return snap.docs.map((d) => d.data());
    }
    async getForReview(submissionId, _actor) {
        const raw = await this.getSubmissionRaw(submissionId);
        return raw ? (0, correctionPrivacy_1.toReviewerVisibleSubmission)(raw) : null;
    }
    async setStatus(submissionId, status, actor) {
        await this.db.collection(C_SUB).doc(submissionId).update({
            status,
            reviewedBy: actor.actorUid,
            reviewedAt: this.clock.now(),
        });
    }
    /** Audit append-only — `create` menolak penulisan ganti. */
    async appendAudit(entry) {
        const ref = this.db
            .collection(C_SUB)
            .doc(entry.submissionId)
            .collection("audit")
            .doc(entry.auditId);
        const existing = await ref.get();
        if (existing.exists)
            return existing.data();
        await ref.create(toPlain(entry));
        return entry;
    }
    async listAudit(submissionId, page) {
        const limit = Math.max(1, Math.min(page.limit, correctionRepository_1.MAX_CORRECTION_PAGE_LIMIT));
        let q = this.db
            .collection(C_SUB)
            .doc(submissionId)
            .collection("audit")
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
    async recordDecision(decision) {
        const ref = this.db.collection(C_DEC).doc(decision.decisionId);
        const existing = await ref.get();
        if (existing.exists)
            return existing.data();
        await ref.create(toPlain(decision));
        return decision;
    }
    async listDecisions(submissionId) {
        const snap = await this.db
            .collection(C_DEC)
            .where("submissionId", "==", submissionId)
            .limit(correctionRepository_1.MAX_CORRECTION_PAGE_LIMIT)
            .get();
        return snap.docs.map((d) => d.data());
    }
    async touchRateLimit(reporterUid, placeId, now) {
        const key = (0, correctionDedup_1.rateLimitKey)(reporterUid, placeId);
        await this.db.collection(C_RL).doc(key).set({ key, lastSubmittedAt: now }, { merge: true });
    }
    async getRateLimit(reporterUid, placeId) {
        const key = (0, correctionDedup_1.rateLimitKey)(reporterUid, placeId);
        const s = await this.db.collection(C_RL).doc(key).get();
        return s.exists ? s.data() : null;
    }
}
exports.FirestoreCorrectionStore = FirestoreCorrectionStore;
