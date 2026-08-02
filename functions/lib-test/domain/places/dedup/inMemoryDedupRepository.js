"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryDedupStore = void 0;
const aliasResolver_1 = require("./aliasResolver");
const duplicateCandidate_1 = require("./duplicateCandidate");
const mergePlan_1 = require("./mergePlan");
const dedupRepository_1 = require("./dedupRepository");
class InMemoryDedupStore {
    clock;
    candidates = new Map();
    candidateOrder = [];
    plans = new Map();
    planAudit = new Map();
    aliases = new Map();
    constructor(clock = { now: () => Date.now() }) {
        this.clock = clock;
    }
    // ---- Duplicate candidates ----
    async createDuplicateCandidate(candidate, _actor) {
        const existing = this.candidates.get(candidate.duplicateCandidateId);
        if (existing)
            return { ...existing }; // IDEMPOTEN — tiada gandaan
        this.candidates.set(candidate.duplicateCandidateId, { ...candidate });
        this.candidateOrder.push(candidate.duplicateCandidateId);
        return { ...candidate };
    }
    async getDuplicateCandidate(id) {
        const c = this.candidates.get(id);
        return c ? { ...c } : null;
    }
    async listDuplicateCandidates(filter, page) {
        const limit = Math.max(1, Math.min(page.limit, dedupRepository_1.MAX_DEDUP_PAGE_LIMIT));
        let ids = this.candidateOrder.filter((id) => {
            const c = this.candidates.get(id);
            if (filter.reviewStatus && c.reviewStatus !== filter.reviewStatus)
                return false;
            if (filter.decision && c.decision !== filter.decision)
                return false;
            if (filter.stagingRecordId && c.stagingRecordId !== filter.stagingRecordId)
                return false;
            return true;
        });
        if (page.cursor) {
            const idx = ids.indexOf(page.cursor);
            ids = idx >= 0 ? ids.slice(idx + 1) : ids;
        }
        const slice = ids.slice(0, limit);
        return {
            items: slice.map((id) => ({ ...this.candidates.get(id) })),
            nextCursor: ids.length > limit ? slice[slice.length - 1] : undefined,
        };
    }
    async updateDuplicateReviewStatus(id, to, actor, resolution) {
        const c = this.candidates.get(id);
        if (!c)
            throw new Error(`duplicate candidate not found: ${id}`);
        (0, duplicateCandidate_1.assertValidDuplicateTransition)(c.reviewStatus, to);
        c.reviewStatus = to;
        c.resolvedBy = actor.actorUid; // pelaku dipercayai
        c.resolvedAt = this.clock.now();
        if (resolution)
            c.resolution = resolution;
        return { ...c };
    }
    // ---- Merge plans ----
    async createMergePlan(plan, _actor) {
        if (this.plans.has(plan.mergePlanId)) {
            throw new Error(`merge plan exists: ${plan.mergePlanId}`);
        }
        this.plans.set(plan.mergePlanId, { ...plan });
        return { ...plan };
    }
    async getMergePlan(id) {
        const p = this.plans.get(id);
        return p ? { ...p } : null;
    }
    async transitionMergePlan(id, to, actor) {
        const p = this.plans.get(id);
        if (!p)
            throw new Error(`merge plan not found: ${id}`);
        (0, mergePlan_1.assertValidMergePlanTransition)(p.status, to);
        if (to === "approved") {
            p.approvedBy = actor.actorUid;
            p.approvedAt = this.clock.now();
        }
        p.status = to;
        return { ...p };
    }
    async cancelMergePlan(id, actor) {
        return this.transitionMergePlan(id, "cancelled", actor);
    }
    async appendMergeAudit(planId, entry) {
        const list = this.planAudit.get(planId) ?? [];
        list.push({ ...entry });
        this.planAudit.set(planId, list);
        return { ...entry };
    }
    async listMergeAudit(planId) {
        return (this.planAudit.get(planId) ?? []).map((e) => ({ ...e }));
    }
    // ---- Aliases ----
    async putAlias(alias, _actor) {
        this.aliases.set(alias.aliasId, { ...alias });
        return { ...alias };
    }
    async getAlias(aliasId) {
        const a = this.aliases.get(aliasId);
        return a ? { ...a } : null;
    }
    async buildAliasMap() {
        const map = new Map();
        for (const a of this.aliases.values())
            map.set(a.aliasId, a.canonicalPlaceId);
        return map;
    }
    async resolve(aliasId) {
        return (0, aliasResolver_1.resolveCanonicalPlaceId)(aliasId, await this.buildAliasMap());
    }
}
exports.InMemoryDedupStore = InMemoryDedupStore;
