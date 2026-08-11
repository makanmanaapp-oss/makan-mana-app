/**
 * Phase 1.5 — repository tag Firestore (firebase-admin) — UJIAN EMULATOR SAHAJA.
 * Tidak diimport oleh functions/src/index.ts. Koleksi: place_tag_definitions,
 * place_tag_sets/{placeId}/evidence, place_tag_sets/{placeId}/audit.
 * TIADA bacaan mobile, publication, tulisan klien, place_registry.
 */
import { FieldPath, Firestore } from "firebase-admin/firestore";
import { TagFamily } from "../placeTags";
import { CanonicalTagDefinition } from "./tagRegistry";
import {
  TagEvidence,
  TagEvidenceStatus,
  assertValidTagEvidenceTransition,
} from "./tagEvidence";
import { PlaceTagAuditEntry, TagAuditAction } from "./tagAudit";
import { TrustedActor } from "../staging/stagingAudit";
import {
  MAX_TAG_PAGE_LIMIT,
  PlaceTagAuditRepository,
  PlaceTagDefinitionRepository,
  PlaceTagSetRepository,
  TagPage,
  TagPagination,
} from "./tagRepository";

const C_DEF = "place_tag_definitions";
const C_SET = "place_tag_sets";

function toPlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function statusToAction(to: TagEvidenceStatus): TagAuditAction {
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

export interface TagFirestoreClock {
  now(): number;
}

export class FirestoreTagStore
  implements PlaceTagDefinitionRepository, PlaceTagSetRepository, PlaceTagAuditRepository
{
  constructor(
    private db: Firestore,
    private clock: TagFirestoreClock = { now: () => Date.now() },
  ) {}

  async seedDefinition(def: CanonicalTagDefinition): Promise<CanonicalTagDefinition> {
    await this.db.collection(C_DEF).doc(def.tagId).set(toPlain(def), { merge: true });
    return def;
  }

  async getDefinition(tagId: string): Promise<CanonicalTagDefinition | null> {
    const s = await this.db.collection(C_DEF).doc(tagId).get();
    return s.exists ? (s.data() as CanonicalTagDefinition) : null;
  }

  async listByFamily(
    familyId: TagFamily,
    page: TagPagination,
  ): Promise<TagPage<CanonicalTagDefinition>> {
    const limit = Math.max(1, Math.min(page.limit, MAX_TAG_PAGE_LIMIT));
    let q = this.db
      .collection(C_DEF)
      .where("familyId", "==", familyId)
      .orderBy(FieldPath.documentId());
    if (page.cursor) q = q.startAfter(page.cursor);
    const snap = await q.limit(limit + 1).get();
    const docs = snap.docs.slice(0, limit);
    return {
      items: docs.map((d) => d.data() as CanonicalTagDefinition),
      nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : undefined,
    };
  }

  async resolveAlias(tagId: string): Promise<string | null> {
    let cur = tagId;
    const seen = new Set<string>();
    let hops = 0;
    while (hops <= 8) {
      if (seen.has(cur)) return null;
      seen.add(cur);
      const doc = await this.db.collection(C_DEF).doc(cur).get();
      if (doc.exists) {
        const d = doc.data() as CanonicalTagDefinition;
        if (d.status !== "deprecated") return cur;
        if (d.replacedByTagId) {
          cur = d.replacedByTagId;
          hops++;
          continue;
        }
        return null;
      }
      const q = await this.db.collection(C_DEF).where("aliases", "array-contains", cur).limit(1).get();
      if (q.empty) return null;
      cur = q.docs[0].id;
      hops++;
    }
    return null;
  }

  async createProposedEvidence(
    placeId: string,
    ev: TagEvidence,
    actor: TrustedActor,
  ): Promise<TagEvidence> {
    const stored: TagEvidence = { ...ev, status: "proposed" };
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

  async storeNormalizedTagSet(
    placeId: string,
    tags: TagEvidence[],
    actor: TrustedActor,
  ): Promise<void> {
    const batch = this.db.batch();
    const col = this.db.collection(C_SET).doc(placeId).collection("evidence");
    for (const t of tags) batch.set(col.doc(t.tagId), toPlain(t));
    await batch.commit();
    await this.appendAuditInternal(placeId, "tag_normalized", actor, { nextState: "normalized" });
  }

  async getTagSet(placeId: string): Promise<TagEvidence[]> {
    const snap = await this.db.collection(C_SET).doc(placeId).collection("evidence").get();
    return snap.docs.map((d) => d.data() as TagEvidence);
  }

  async transitionEvidenceStatus(
    placeId: string,
    tagId: string,
    to: TagEvidenceStatus,
    actor: TrustedActor,
    reasonCode?: string,
  ): Promise<TagEvidence> {
    const ref = this.db.collection(C_SET).doc(placeId).collection("evidence").doc(tagId);
    const updated = await this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw new Error(`tag evidence not found: ${placeId}/${tagId}`);
      const ev = s.data() as TagEvidence;
      assertValidTagEvidenceTransition(ev.status, to);
      const patch: Partial<TagEvidence> = { status: to };
      if (to === "approved") {
        patch.approvedBy = actor.actorUid;
        patch.approvedAt = this.clock.now();
      }
      if (to === "rejected" && reasonCode) patch.rejectionReason = reasonCode;
      tx.set(ref, toPlain(patch), { merge: true });
      return { ...ev, ...patch } as TagEvidence;
    });
    await this.appendAuditInternal(placeId, statusToAction(to), actor, {
      tagId,
      previousState: undefined,
      nextState: to,
      reasonCode,
    });
    return updated;
  }

  async appendAudit(entry: PlaceTagAuditEntry): Promise<PlaceTagAuditEntry> {
    await this.db
      .collection(C_SET)
      .doc(entry.placeId)
      .collection("audit")
      .doc(entry.auditId)
      .create(toPlain(entry));
    return entry;
  }

  async listAudit(placeId: string): Promise<PlaceTagAuditEntry[]> {
    const snap = await this.db.collection(C_SET).doc(placeId).collection("audit").orderBy("createdAt").get();
    return snap.docs.map((d) => d.data() as PlaceTagAuditEntry);
  }

  private async appendAuditInternal(
    placeId: string,
    action: TagAuditAction,
    actor: TrustedActor,
    extra: Partial<PlaceTagAuditEntry> = {},
  ): Promise<void> {
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
