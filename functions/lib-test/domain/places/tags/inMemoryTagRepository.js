"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryTagStore = void 0;
const tagEvidence_1 = require("./tagEvidence");
const tagRepository_1 = require("./tagRepository");
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
class InMemoryTagStore {
    clock;
    defs = new Map();
    aliasMap = new Map();
    byFamily = new Map();
    sets = new Map();
    audit = new Map();
    idc = 0;
    constructor(clock = { now: () => Date.now() }) {
        this.clock = clock;
    }
    async seedDefinition(def) {
        this.defs.set(def.tagId, { ...def });
        const l = this.byFamily.get(def.familyId) ?? [];
        if (!l.includes(def.tagId))
            l.push(def.tagId);
        this.byFamily.set(def.familyId, l);
        for (const a of def.aliases)
            this.aliasMap.set(a, def.tagId);
        if (def.status === "deprecated" && def.replacedByTagId) {
            this.aliasMap.set(def.tagId, def.replacedByTagId);
        }
        return { ...def };
    }
    async getDefinition(tagId) {
        const d = this.defs.get(tagId);
        return d ? { ...d } : null;
    }
    async listByFamily(familyId, page) {
        const limit = Math.max(1, Math.min(page.limit, tagRepository_1.MAX_TAG_PAGE_LIMIT));
        let ids = [...(this.byFamily.get(familyId) ?? [])].sort();
        if (page.cursor) {
            const idx = ids.indexOf(page.cursor);
            ids = idx >= 0 ? ids.slice(idx + 1) : ids;
        }
        const slice = ids.slice(0, limit);
        return {
            items: slice.map((id) => ({ ...this.defs.get(id) })),
            nextCursor: ids.length > limit ? slice[slice.length - 1] : undefined,
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
            const d = this.defs.get(cur);
            if (d && d.status !== "deprecated")
                return cur;
            const next = this.aliasMap.get(cur);
            if (!next)
                return null;
            cur = next;
            hops++;
        }
        return null;
    }
    async createProposedEvidence(placeId, ev, actor) {
        const set = this.sets.get(placeId) ?? new Map();
        const stored = { ...ev, status: "proposed" };
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
    async storeNormalizedTagSet(placeId, tags, actor) {
        const set = new Map();
        for (const t of tags)
            set.set(t.tagId, { ...t });
        this.sets.set(placeId, set);
        await this.appendAuditInternal(placeId, "tag_normalized", actor, { nextState: "normalized" });
    }
    async getTagSet(placeId) {
        return [...(this.sets.get(placeId)?.values() ?? [])].map((e) => ({ ...e }));
    }
    async transitionEvidenceStatus(placeId, tagId, to, actor, reasonCode) {
        const ev = this.sets.get(placeId)?.get(tagId);
        if (!ev)
            throw new Error(`tag evidence not found: ${placeId}/${tagId}`);
        (0, tagEvidence_1.assertValidTagEvidenceTransition)(ev.status, to);
        const from = ev.status;
        ev.status = to;
        if (to === "approved") {
            ev.approvedBy = actor.actorUid;
            ev.approvedAt = this.clock.now();
        }
        if (to === "rejected" && reasonCode)
            ev.rejectionReason = reasonCode;
        await this.appendAuditInternal(placeId, statusToAction(to), actor, {
            tagId,
            familyId: ev.familyId,
            previousState: from,
            nextState: to,
            reasonCode,
        });
        return { ...ev };
    }
    async appendAudit(entry) {
        const l = this.audit.get(entry.placeId) ?? [];
        l.push({ ...entry });
        this.audit.set(entry.placeId, l);
        return { ...entry };
    }
    async listAudit(placeId) {
        return (this.audit.get(placeId) ?? []).map((e) => ({ ...e }));
    }
    async appendAuditInternal(placeId, action, actor, extra = {}) {
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
exports.InMemoryTagStore = InMemoryTagStore;
