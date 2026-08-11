/** Phase 1.5 — repository tag DALAM-INGATAN (deterministik, emulator-safe). */
import { EpochMillis } from "../common";
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

export interface TagClock {
  now(): EpochMillis;
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

export class InMemoryTagStore
  implements PlaceTagDefinitionRepository, PlaceTagSetRepository, PlaceTagAuditRepository
{
  private defs = new Map<string, CanonicalTagDefinition>();
  private aliasMap = new Map<string, string>();
  private byFamily = new Map<TagFamily, string[]>();
  private sets = new Map<string, Map<string, TagEvidence>>();
  private audit = new Map<string, PlaceTagAuditEntry[]>();
  private idc = 0;

  constructor(private clock: TagClock = { now: () => Date.now() }) {}

  async seedDefinition(def: CanonicalTagDefinition): Promise<CanonicalTagDefinition> {
    this.defs.set(def.tagId, { ...def });
    const l = this.byFamily.get(def.familyId) ?? [];
    if (!l.includes(def.tagId)) l.push(def.tagId);
    this.byFamily.set(def.familyId, l);
    for (const a of def.aliases) this.aliasMap.set(a, def.tagId);
    if (def.status === "deprecated" && def.replacedByTagId) {
      this.aliasMap.set(def.tagId, def.replacedByTagId);
    }
    return { ...def };
  }

  async getDefinition(tagId: string): Promise<CanonicalTagDefinition | null> {
    const d = this.defs.get(tagId);
    return d ? { ...d } : null;
  }

  async listByFamily(
    familyId: TagFamily,
    page: TagPagination,
  ): Promise<TagPage<CanonicalTagDefinition>> {
    const limit = Math.max(1, Math.min(page.limit, MAX_TAG_PAGE_LIMIT));
    let ids = [...(this.byFamily.get(familyId) ?? [])].sort();
    if (page.cursor) {
      const idx = ids.indexOf(page.cursor);
      ids = idx >= 0 ? ids.slice(idx + 1) : ids;
    }
    const slice = ids.slice(0, limit);
    return {
      items: slice.map((id) => ({ ...this.defs.get(id)! })),
      nextCursor: ids.length > limit ? slice[slice.length - 1] : undefined,
    };
  }

  async resolveAlias(tagId: string): Promise<string | null> {
    let cur = tagId;
    const seen = new Set<string>();
    let hops = 0;
    while (hops <= 8) {
      if (seen.has(cur)) return null;
      seen.add(cur);
      const d = this.defs.get(cur);
      if (d && d.status !== "deprecated") return cur;
      const next = this.aliasMap.get(cur);
      if (!next) return null;
      cur = next;
      hops++;
    }
    return null;
  }

  async createProposedEvidence(
    placeId: string,
    ev: TagEvidence,
    actor: TrustedActor,
  ): Promise<TagEvidence> {
    const set = this.sets.get(placeId) ?? new Map<string, TagEvidence>();
    const stored: TagEvidence = { ...ev, status: "proposed" };
    set.set(ev.tagId, stored);
    this.sets.set(placeId, set);
    await this.appendAuditInternal(placeId, "tag_proposed", actor, {
      tagId: ev.tagId,
      familyId: ev.familyId,
      nextState: "proposed",
      evidenceLevel: ev.evidenceLevel,
      confidence: ev.confidence,
      sourceRecordId: ev.sourceRecordId,
    });
    return { ...stored };
  }

  async storeNormalizedTagSet(
    placeId: string,
    tags: TagEvidence[],
    actor: TrustedActor,
  ): Promise<void> {
    const set = new Map<string, TagEvidence>();
    for (const t of tags) set.set(t.tagId, { ...t });
    this.sets.set(placeId, set);
    await this.appendAuditInternal(placeId, "tag_normalized", actor, { nextState: "normalized" });
  }

  async getTagSet(placeId: string): Promise<TagEvidence[]> {
    return [...(this.sets.get(placeId)?.values() ?? [])].map((e) => ({ ...e }));
  }

  async transitionEvidenceStatus(
    placeId: string,
    tagId: string,
    to: TagEvidenceStatus,
    actor: TrustedActor,
    reasonCode?: string,
  ): Promise<TagEvidence> {
    const ev = this.sets.get(placeId)?.get(tagId);
    if (!ev) throw new Error(`tag evidence not found: ${placeId}/${tagId}`);
    assertValidTagEvidenceTransition(ev.status, to);
    const from = ev.status;
    ev.status = to;
    if (to === "approved") {
      ev.approvedBy = actor.actorUid;
      ev.approvedAt = this.clock.now();
    }
    if (to === "rejected" && reasonCode) ev.rejectionReason = reasonCode;
    await this.appendAuditInternal(placeId, statusToAction(to), actor, {
      tagId,
      familyId: ev.familyId,
      previousState: from,
      nextState: to,
      reasonCode,
    });
    return { ...ev };
  }

  async appendAudit(entry: PlaceTagAuditEntry): Promise<PlaceTagAuditEntry> {
    const l = this.audit.get(entry.placeId) ?? [];
    l.push({ ...entry });
    this.audit.set(entry.placeId, l);
    return { ...entry };
  }

  async listAudit(placeId: string): Promise<PlaceTagAuditEntry[]> {
    return (this.audit.get(placeId) ?? []).map((e) => ({ ...e }));
  }

  private async appendAuditInternal(
    placeId: string,
    action: TagAuditAction,
    actor: TrustedActor,
    extra: Partial<PlaceTagAuditEntry> = {},
  ): Promise<void> {
    await this.appendAudit({
      auditId: `tagaud_${(++this.idc).toString().padStart(6, "0")}`,
      placeId,
      action,
      actorUid: actor.actorUid,
      actorRole: actor.actorRole,
      createdAt: this.clock.now(),
      ...extra,
    });
  }
}
