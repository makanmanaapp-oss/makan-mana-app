import test from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryDedupStore,
  buildDuplicateCandidate,
  buildMergePlan,
} from "../index";
import { TrustedActor } from "../../staging/stagingAudit";
import { A_google1, A_google2, B_google, B_owner, T } from "./fixtures";

const ACTOR: TrustedActor = { actorUid: "server_admin", actorRole: "admin" };
const newStore = () => new InMemoryDedupStore({ now: () => T });

function candidate(idA: string, idB: string, a = B_google, b = B_owner) {
  return buildDuplicateCandidate({
    stagingRecordId: idA,
    comparedStagingRecordId: idB,
    a,
    b,
    now: T,
  });
}

// 29 (repo). Repeated create is idempotent — no duplicate queue entry.
test("createDuplicateCandidate is idempotent", async () => {
  const store = newStore();
  const c = candidate("stg_a", "stg_b");
  await store.createDuplicateCandidate(c, ACTOR);
  await store.createDuplicateCandidate(c, ACTOR); // sekali lagi
  const page = await store.listDuplicateCandidates({}, { limit: 100 });
  assert.equal(page.items.length, 1);
});

// Review status transitions guarded + actor server-provided.
test("duplicate review status transitions are guarded", async () => {
  const store = newStore();
  const c = buildDuplicateCandidate({
    stagingRecordId: "stg_x",
    comparedStagingRecordId: "stg_y",
    a: A_google1,
    b: A_google2,
    now: T,
  });
  await store.createDuplicateCandidate(c, ACTOR);
  assert.equal(c.reviewStatus, "auto_linked"); // exact identity
  const merged = await store.updateDuplicateReviewStatus(c.duplicateCandidateId, "merged", ACTOR, "confirmed");
  assert.equal(merged.reviewStatus, "merged");
  assert.equal(merged.resolvedBy, "server_admin");
  // Peralihan tidak sah ditolak.
  const c2 = candidate("stg_p", "stg_q");
  await store.createDuplicateCandidate(c2, ACTOR);
  await assert.rejects(() =>
    store.updateDuplicateReviewStatus(c2.duplicateCandidateId, "merged", ACTOR),
  );
});

// Bounded pagination.
test("bounded dedup pagination", async () => {
  const store = newStore();
  for (let i = 0; i < 5; i++) {
    await store.createDuplicateCandidate(candidate(`s${i}`, `t${i}`), ACTOR);
  }
  const p1 = await store.listDuplicateCandidates({}, { limit: 2 });
  assert.equal(p1.items.length, 2);
  assert.ok(p1.nextCursor);
});

// Alias repo resolve.
test("alias repository resolves canonical", async () => {
  const store = newStore();
  await store.putAlias({ aliasId: "ChIJ_g", canonicalPlaceId: "mm_1", aliasType: "google_place_id", createdAt: T, reason: "legacy" }, ACTOR);
  const r = await store.resolve("ChIJ_g");
  assert.equal(r.status, "resolved");
  assert.equal(r.canonicalPlaceId, "mm_1");
});

// Merge plan lifecycle + append-only audit.
test("merge plan lifecycle + audit append-only", async () => {
  const store = newStore();
  const plan = buildMergePlan({
    mergePlanId: "mp_1",
    sourcePlaceIds: ["mm_1", "mm_2"],
    targetCanonicalPlaceId: "mm_1",
    aliases: [],
    sourceRefs: [],
    createdBy: "admin_1",
    now: T,
  });
  await store.createMergePlan(plan, ACTOR);
  await store.transitionMergePlan("mp_1", "review_required", ACTOR);
  const approved = await store.transitionMergePlan("mp_1", "approved", ACTOR);
  assert.equal(approved.approvedBy, "server_admin");
  await store.appendMergeAudit("mp_1", {
    auditId: "a1",
    action: "merge_plan_approved",
    actorUid: "server_admin",
    actorRole: "admin",
    sourceIds: ["mm_1", "mm_2"],
    targetId: "mm_1",
    configVersion: "dedup_config_v1",
    algorithmVersion: "dedup_v1",
    createdAt: T,
  });
  const audit = await store.listMergeAudit("mp_1");
  assert.equal(audit.length, 1);
});

// 36, 37, 38. No hard delete / place_registry / publish surface.
test("repository exposes no delete, registry or publish operation", () => {
  const store = newStore();
  const names = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
  const forbidden = names.filter((n) => /delete|registry|publish|promote/i.test(n));
  assert.deepEqual(forbidden, []);
});
