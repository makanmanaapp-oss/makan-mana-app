"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
const ACTOR = { actorUid: "server_admin", actorRole: "admin" };
const newStore = () => new index_1.InMemoryDedupStore({ now: () => fixtures_1.T });
function candidate(idA, idB, a = fixtures_1.B_google, b = fixtures_1.B_owner) {
    return (0, index_1.buildDuplicateCandidate)({
        stagingRecordId: idA,
        comparedStagingRecordId: idB,
        a,
        b,
        now: fixtures_1.T,
    });
}
// 29 (repo). Repeated create is idempotent — no duplicate queue entry.
(0, node_test_1.default)("createDuplicateCandidate is idempotent", async () => {
    const store = newStore();
    const c = candidate("stg_a", "stg_b");
    await store.createDuplicateCandidate(c, ACTOR);
    await store.createDuplicateCandidate(c, ACTOR); // sekali lagi
    const page = await store.listDuplicateCandidates({}, { limit: 100 });
    strict_1.default.equal(page.items.length, 1);
});
// Review status transitions guarded + actor server-provided.
(0, node_test_1.default)("duplicate review status transitions are guarded", async () => {
    const store = newStore();
    const c = (0, index_1.buildDuplicateCandidate)({
        stagingRecordId: "stg_x",
        comparedStagingRecordId: "stg_y",
        a: fixtures_1.A_google1,
        b: fixtures_1.A_google2,
        now: fixtures_1.T,
    });
    await store.createDuplicateCandidate(c, ACTOR);
    strict_1.default.equal(c.reviewStatus, "auto_linked"); // exact identity
    const merged = await store.updateDuplicateReviewStatus(c.duplicateCandidateId, "merged", ACTOR, "confirmed");
    strict_1.default.equal(merged.reviewStatus, "merged");
    strict_1.default.equal(merged.resolvedBy, "server_admin");
    // Peralihan tidak sah ditolak.
    const c2 = candidate("stg_p", "stg_q");
    await store.createDuplicateCandidate(c2, ACTOR);
    await strict_1.default.rejects(() => store.updateDuplicateReviewStatus(c2.duplicateCandidateId, "merged", ACTOR));
});
// Bounded pagination.
(0, node_test_1.default)("bounded dedup pagination", async () => {
    const store = newStore();
    for (let i = 0; i < 5; i++) {
        await store.createDuplicateCandidate(candidate(`s${i}`, `t${i}`), ACTOR);
    }
    const p1 = await store.listDuplicateCandidates({}, { limit: 2 });
    strict_1.default.equal(p1.items.length, 2);
    strict_1.default.ok(p1.nextCursor);
});
// Alias repo resolve.
(0, node_test_1.default)("alias repository resolves canonical", async () => {
    const store = newStore();
    await store.putAlias({ aliasId: "ChIJ_g", canonicalPlaceId: "mm_1", aliasType: "google_place_id", createdAt: fixtures_1.T, reason: "legacy" }, ACTOR);
    const r = await store.resolve("ChIJ_g");
    strict_1.default.equal(r.status, "resolved");
    strict_1.default.equal(r.canonicalPlaceId, "mm_1");
});
// Merge plan lifecycle + append-only audit.
(0, node_test_1.default)("merge plan lifecycle + audit append-only", async () => {
    const store = newStore();
    const plan = (0, index_1.buildMergePlan)({
        mergePlanId: "mp_1",
        sourcePlaceIds: ["mm_1", "mm_2"],
        targetCanonicalPlaceId: "mm_1",
        aliases: [],
        sourceRefs: [],
        createdBy: "admin_1",
        now: fixtures_1.T,
    });
    await store.createMergePlan(plan, ACTOR);
    await store.transitionMergePlan("mp_1", "review_required", ACTOR);
    const approved = await store.transitionMergePlan("mp_1", "approved", ACTOR);
    strict_1.default.equal(approved.approvedBy, "server_admin");
    await store.appendMergeAudit("mp_1", {
        auditId: "a1",
        action: "merge_plan_approved",
        actorUid: "server_admin",
        actorRole: "admin",
        sourceIds: ["mm_1", "mm_2"],
        targetId: "mm_1",
        configVersion: "dedup_config_v1",
        algorithmVersion: "dedup_v1",
        createdAt: fixtures_1.T,
    });
    const audit = await store.listMergeAudit("mp_1");
    strict_1.default.equal(audit.length, 1);
});
// 36, 37, 38. No hard delete / place_registry / publish surface.
(0, node_test_1.default)("repository exposes no delete, registry or publish operation", () => {
    const store = newStore();
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
    const forbidden = names.filter((n) => /delete|registry|publish|promote/i.test(n));
    strict_1.default.deepEqual(forbidden, []);
});
