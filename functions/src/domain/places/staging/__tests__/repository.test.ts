import test from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryStagingStore,
  PlaceReviewDecision,
  TrustedActor,
} from "../index";
import {
  T,
  approvedNotPublishedStagingRecord,
  makeValidCandidate,
  validProviderSnapshot,
  validStagingRecord,
} from "./fixtures";

const ACTOR: TrustedActor = { actorUid: "server_admin", actorRole: "admin" };

function newStore() {
  let t = T;
  let n = 0;
  return new InMemoryStagingStore(
    { now: () => (t += 1000) },
    { next: (p) => `${p}_${(++n).toString().padStart(4, "0")}` },
  );
}

// 4. Source snapshot is immutable by repository contract (second create throws).
test("source snapshot is immutable (second create throws)", async () => {
  const store = newStore();
  await store.createSnapshot(validProviderSnapshot);
  await assert.rejects(() => store.createSnapshot(validProviderSnapshot));
});

// Cipta + baca rekod staging.
test("create and read staging record", async () => {
  const store = newStore();
  await store.createStagingRecord(validStagingRecord, ACTOR);
  const got = await store.getStagingRecord(validStagingRecord.stagingRecordId);
  assert.ok(got);
  assert.equal(got!.reviewStatus, "needs_review");
});

// 20. Audit entry is appended on transition.
test("audit entry is appended", async () => {
  const store = newStore();
  await store.createStagingRecord(validStagingRecord, ACTOR);
  const before = (await store.listAudit(validStagingRecord.stagingRecordId)).length;
  await store.transitionReviewStatus(
    validStagingRecord.stagingRecordId,
    "approved",
    ACTOR,
    "ok",
  );
  const after = await store.listAudit(validStagingRecord.stagingRecordId);
  assert.equal(after.length, before + 1);
  assert.equal(after[after.length - 1].action, "approved");
});

// 21. Audit actor is server-provided (client-claimed identity ignored).
test("audit actor is server-provided in repository", async () => {
  const store = newStore();
  await store.createStagingRecord(validStagingRecord, ACTOR);
  const decision: PlaceReviewDecision = {
    decisionId: "dec_1",
    stagingRecordId: validStagingRecord.stagingRecordId,
    decision: "approve",
    decidedBy: "CLIENT_CLAIMED_IDENTITY", // sepatutnya diabaikan
    decidedAt: T,
    reasonCode: "ok",
    previousReviewStatus: "needs_review",
    nextReviewStatus: "approved",
  };
  const updated = await store.recordReviewDecision(
    validStagingRecord.stagingRecordId,
    decision,
    ACTOR,
  );
  assert.equal(updated.reviewedBy, "server_admin");
  const audit = await store.listAudit(validStagingRecord.stagingRecordId);
  assert.ok(audit.every((a) => a.actorUid === "server_admin"));
});

// Peralihan tidak sah ditolak melalui repository.
test("repository rejects invalid transition", async () => {
  const store = newStore();
  await store.createStagingRecord(validStagingRecord, ACTOR);
  await assert.rejects(() =>
    store.transitionReviewStatus(
      validStagingRecord.stagingRecordId,
      "published" as never,
      ACTOR,
    ),
  );
});

// 24. Bounded staging pagination works.
test("bounded staging pagination works", async () => {
  const store = newStore();
  for (let i = 1; i <= 5; i++) {
    const id = `stg_p${i}`;
    await store.createStagingRecord(
      {
        ...validStagingRecord,
        stagingRecordId: id,
        candidate: makeValidCandidate({ candidateId: `cand_p${i}` }),
      },
      ACTOR,
    );
  }
  const page1 = await store.listStagingRecords({}, { limit: 2 });
  assert.equal(page1.items.length, 2);
  assert.ok(page1.nextCursor);
  const page2 = await store.listStagingRecords({}, { limit: 2, cursor: page1.nextCursor });
  assert.equal(page2.items.length, 2);
  const page3 = await store.listStagingRecords({}, { limit: 2, cursor: page2.nextCursor });
  assert.equal(page3.items.length, 1);
  assert.equal(page3.nextCursor, undefined);
});

// 28 & 29. No operation writes to place_registry / publishes to mobile.
test("repository exposes no publish or registry operation", () => {
  const store = newStore();
  const names = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
  const forbidden = names.filter((n) =>
    /publish|registry|promote/i.test(n),
  );
  assert.deepEqual(forbidden, []);
});

// 29. Approved staging record carries NO publication state.
test("approved staging record has no publication state", () => {
  const rec = approvedNotPublishedStagingRecord as unknown as Record<string, unknown>;
  assert.equal("publicationStatus" in rec, false);
  assert.equal("publishedAt" in rec, false);
  assert.equal(approvedNotPublishedStagingRecord.reviewStatus, "approved");
});
