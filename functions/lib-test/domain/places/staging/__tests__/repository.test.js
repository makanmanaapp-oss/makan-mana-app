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
function newStore() {
    let t = fixtures_1.T;
    let n = 0;
    return new index_1.InMemoryStagingStore({ now: () => (t += 1000) }, { next: (p) => `${p}_${(++n).toString().padStart(4, "0")}` });
}
// 4. Source snapshot is immutable by repository contract (second create throws).
(0, node_test_1.default)("source snapshot is immutable (second create throws)", async () => {
    const store = newStore();
    await store.createSnapshot(fixtures_1.validProviderSnapshot);
    await strict_1.default.rejects(() => store.createSnapshot(fixtures_1.validProviderSnapshot));
});
// Cipta + baca rekod staging.
(0, node_test_1.default)("create and read staging record", async () => {
    const store = newStore();
    await store.createStagingRecord(fixtures_1.validStagingRecord, ACTOR);
    const got = await store.getStagingRecord(fixtures_1.validStagingRecord.stagingRecordId);
    strict_1.default.ok(got);
    strict_1.default.equal(got.reviewStatus, "needs_review");
});
// 20. Audit entry is appended on transition.
(0, node_test_1.default)("audit entry is appended", async () => {
    const store = newStore();
    await store.createStagingRecord(fixtures_1.validStagingRecord, ACTOR);
    const before = (await store.listAudit(fixtures_1.validStagingRecord.stagingRecordId)).length;
    await store.transitionReviewStatus(fixtures_1.validStagingRecord.stagingRecordId, "approved", ACTOR, "ok");
    const after = await store.listAudit(fixtures_1.validStagingRecord.stagingRecordId);
    strict_1.default.equal(after.length, before + 1);
    strict_1.default.equal(after[after.length - 1].action, "approved");
});
// 21. Audit actor is server-provided (client-claimed identity ignored).
(0, node_test_1.default)("audit actor is server-provided in repository", async () => {
    const store = newStore();
    await store.createStagingRecord(fixtures_1.validStagingRecord, ACTOR);
    const decision = {
        decisionId: "dec_1",
        stagingRecordId: fixtures_1.validStagingRecord.stagingRecordId,
        decision: "approve",
        decidedBy: "CLIENT_CLAIMED_IDENTITY", // sepatutnya diabaikan
        decidedAt: fixtures_1.T,
        reasonCode: "ok",
        previousReviewStatus: "needs_review",
        nextReviewStatus: "approved",
    };
    const updated = await store.recordReviewDecision(fixtures_1.validStagingRecord.stagingRecordId, decision, ACTOR);
    strict_1.default.equal(updated.reviewedBy, "server_admin");
    const audit = await store.listAudit(fixtures_1.validStagingRecord.stagingRecordId);
    strict_1.default.ok(audit.every((a) => a.actorUid === "server_admin"));
});
// Peralihan tidak sah ditolak melalui repository.
(0, node_test_1.default)("repository rejects invalid transition", async () => {
    const store = newStore();
    await store.createStagingRecord(fixtures_1.validStagingRecord, ACTOR);
    await strict_1.default.rejects(() => store.transitionReviewStatus(fixtures_1.validStagingRecord.stagingRecordId, "published", ACTOR));
});
// 24. Bounded staging pagination works.
(0, node_test_1.default)("bounded staging pagination works", async () => {
    const store = newStore();
    for (let i = 1; i <= 5; i++) {
        const id = `stg_p${i}`;
        await store.createStagingRecord({
            ...fixtures_1.validStagingRecord,
            stagingRecordId: id,
            candidate: (0, fixtures_1.makeValidCandidate)({ candidateId: `cand_p${i}` }),
        }, ACTOR);
    }
    const page1 = await store.listStagingRecords({}, { limit: 2 });
    strict_1.default.equal(page1.items.length, 2);
    strict_1.default.ok(page1.nextCursor);
    const page2 = await store.listStagingRecords({}, { limit: 2, cursor: page1.nextCursor });
    strict_1.default.equal(page2.items.length, 2);
    const page3 = await store.listStagingRecords({}, { limit: 2, cursor: page2.nextCursor });
    strict_1.default.equal(page3.items.length, 1);
    strict_1.default.equal(page3.nextCursor, undefined);
});
// 28 & 29. No operation writes to place_registry / publishes to mobile.
(0, node_test_1.default)("repository exposes no publish or registry operation", () => {
    const store = newStore();
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
    const forbidden = names.filter((n) => /publish|registry|promote/i.test(n));
    strict_1.default.deepEqual(forbidden, []);
});
// 29. Approved staging record carries NO publication state.
(0, node_test_1.default)("approved staging record has no publication state", () => {
    const rec = fixtures_1.approvedNotPublishedStagingRecord;
    strict_1.default.equal("publicationStatus" in rec, false);
    strict_1.default.equal("publishedAt" in rec, false);
    strict_1.default.equal(fixtures_1.approvedNotPublishedStagingRecord.reviewStatus, "approved");
});
