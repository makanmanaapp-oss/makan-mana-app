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
import { FieldPath, Firestore } from "firebase-admin/firestore";
import { EpochMillis } from "../common";
import { TrustedActor } from "../staging/stagingAudit";
import { rateLimitKey } from "./correctionDedup";
import {
  ReporterVisibleSubmission,
  ReviewerVisibleSubmission,
  toReporterVisibleSubmission,
  toReviewerVisibleSubmission,
} from "./correctionPrivacy";
import {
  CorrectionPage,
  CorrectionPagination,
  MAX_CORRECTION_PAGE_LIMIT,
} from "./correctionRepository";
import { PlaceReportReviewDecision } from "./correctionStateMachine";
import {
  PlaceCorrectionAuditEntry,
  PlaceCorrectionSubmission,
  PlaceReportEvidence,
} from "./correctionTypes";

const C_SUB = "place_correction_submissions";
const C_DEC = "place_correction_decisions";
const C_RL = "place_correction_rate_limits";

function toPlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export interface CorrectionFirestoreClock {
  now(): EpochMillis;
}

export class FirestoreCorrectionStore {
  constructor(
    private db: Firestore,
    private clock: CorrectionFirestoreClock = { now: () => Date.now() },
  ) {}

  /** Cipta penghantaran IMMUTABLE (guna `create` supaya tidak ditulis ganti). */
  async createSubmission(
    submission: PlaceCorrectionSubmission,
  ): Promise<PlaceCorrectionSubmission> {
    const ref = this.db.collection(C_SUB).doc(submission.submissionId);
    const existing = await ref.get();
    if (existing.exists) return existing.data() as PlaceCorrectionSubmission;
    await ref.create(toPlain(submission));
    for (const evidence of submission.evidence) {
      await ref.collection("evidence").doc(evidence.evidenceId).create(toPlain(evidence));
    }
    return submission;
  }

  async getSubmissionRaw(submissionId: string): Promise<PlaceCorrectionSubmission | null> {
    const s = await this.db.collection(C_SUB).doc(submissionId).get();
    return s.exists ? (s.data() as PlaceCorrectionSubmission) : null;
  }

  /** Pelapor membaca miliknya sendiri — MELEMPAR untuk pengguna lain. */
  async getOwnSubmission(
    submissionId: string,
    reporterUid: string,
  ): Promise<ReporterVisibleSubmission | null> {
    const raw = await this.getSubmissionRaw(submissionId);
    if (!raw) return null;
    return toReporterVisibleSubmission(raw, reporterUid);
  }

  async listOwnSubmissions(
    reporterUid: string,
    page: CorrectionPagination,
  ): Promise<CorrectionPage<ReporterVisibleSubmission>> {
    const limit = Math.max(1, Math.min(page.limit, MAX_CORRECTION_PAGE_LIMIT));
    let q = this.db
      .collection(C_SUB)
      .where("submittedBy", "==", reporterUid)
      .orderBy(FieldPath.documentId());
    if (page.cursor) q = q.startAfter(page.cursor);
    const snap = await q.limit(limit + 1).get();
    const docs = snap.docs.slice(0, limit);
    return {
      items: docs.map((d) =>
        toReporterVisibleSubmission(d.data() as PlaceCorrectionSubmission, reporterUid),
      ),
      nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : undefined,
    };
  }

  /** Tambah bukti — snapshot asal TIDAK disentuh. */
  async appendEvidence(
    submissionId: string,
    evidence: PlaceReportEvidence,
    reporterUid: string,
  ): Promise<PlaceReportEvidence> {
    const raw = await this.getSubmissionRaw(submissionId);
    if (!raw) throw new Error(`submission not found: ${submissionId}`);
    if (raw.submittedBy !== reporterUid) throw new Error("forbidden: not your submission");
    const ref = this.db.collection(C_SUB).doc(submissionId).collection("evidence").doc(evidence.evidenceId);
    const existing = await ref.get();
    if (existing.exists) return existing.data() as PlaceReportEvidence;
    await ref.create(toPlain(evidence));
    // Hanya senarai bukti dikemas kini — `originalSnapshot` tidak pernah ditulis.
    await this.db.collection(C_SUB).doc(submissionId).update({
      evidence: [...raw.evidence, toPlain(evidence)],
    });
    return evidence;
  }

  async listEvidence(submissionId: string): Promise<readonly PlaceReportEvidence[]> {
    const snap = await this.db
      .collection(C_SUB)
      .doc(submissionId)
      .collection("evidence")
      .orderBy(FieldPath.documentId())
      .limit(MAX_CORRECTION_PAGE_LIMIT)
      .get();
    return snap.docs.map((d) => d.data() as PlaceReportEvidence);
  }

  async getForReview(
    submissionId: string,
    _actor: TrustedActor,
  ): Promise<ReviewerVisibleSubmission | null> {
    const raw = await this.getSubmissionRaw(submissionId);
    return raw ? toReviewerVisibleSubmission(raw) : null;
  }

  async setStatus(
    submissionId: string,
    status: PlaceCorrectionSubmission["status"],
    actor: TrustedActor,
  ): Promise<void> {
    await this.db.collection(C_SUB).doc(submissionId).update({
      status,
      reviewedBy: actor.actorUid,
      reviewedAt: this.clock.now(),
    });
  }

  /** Audit append-only — `create` menolak penulisan ganti. */
  async appendAudit(entry: PlaceCorrectionAuditEntry): Promise<PlaceCorrectionAuditEntry> {
    const ref = this.db
      .collection(C_SUB)
      .doc(entry.submissionId)
      .collection("audit")
      .doc(entry.auditId);
    const existing = await ref.get();
    if (existing.exists) return existing.data() as PlaceCorrectionAuditEntry;
    await ref.create(toPlain(entry));
    return entry;
  }

  async listAudit(
    submissionId: string,
    page: CorrectionPagination,
  ): Promise<CorrectionPage<PlaceCorrectionAuditEntry>> {
    const limit = Math.max(1, Math.min(page.limit, MAX_CORRECTION_PAGE_LIMIT));
    let q = this.db
      .collection(C_SUB)
      .doc(submissionId)
      .collection("audit")
      .orderBy(FieldPath.documentId());
    if (page.cursor) q = q.startAfter(page.cursor);
    const snap = await q.limit(limit + 1).get();
    const docs = snap.docs.slice(0, limit);
    return {
      items: docs.map((d) => d.data() as PlaceCorrectionAuditEntry),
      nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : undefined,
    };
  }

  async recordDecision(
    decision: PlaceReportReviewDecision,
  ): Promise<PlaceReportReviewDecision> {
    const ref = this.db.collection(C_DEC).doc(decision.decisionId);
    const existing = await ref.get();
    if (existing.exists) return existing.data() as PlaceReportReviewDecision;
    await ref.create(toPlain(decision));
    return decision;
  }

  async listDecisions(submissionId: string): Promise<readonly PlaceReportReviewDecision[]> {
    const snap = await this.db
      .collection(C_DEC)
      .where("submissionId", "==", submissionId)
      .limit(MAX_CORRECTION_PAGE_LIMIT)
      .get();
    return snap.docs.map((d) => d.data() as PlaceReportReviewDecision);
  }

  async touchRateLimit(reporterUid: string, placeId: string, now: EpochMillis): Promise<void> {
    const key = rateLimitKey(reporterUid, placeId);
    await this.db.collection(C_RL).doc(key).set({ key, lastSubmittedAt: now }, { merge: true });
  }

  async getRateLimit(
    reporterUid: string,
    placeId: string,
  ): Promise<{ key: string; lastSubmittedAt: EpochMillis } | null> {
    const key = rateLimitKey(reporterUid, placeId);
    const s = await this.db.collection(C_RL).doc(key).get();
    return s.exists ? (s.data() as { key: string; lastSubmittedAt: EpochMillis }) : null;
  }
}
