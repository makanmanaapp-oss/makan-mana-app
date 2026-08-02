/**
 * Phase 1.4 — ujian repository dedup Firestore terhadap EMULATOR sahaja.
 * Jalankan: npm run test:emulator (subset dedup). Melangkau bila
 * FIRESTORE_EMULATOR_HOST tiada — TIDAK PERNAH sentuh produksi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { FirestoreDedupStore } from "../../firestoreDedupRepository";
import { buildDuplicateCandidate, buildMergePlan } from "../../index";
import { TrustedActor } from "../../../staging/stagingAudit";
import { A_google1, A_google2, B_google, B_owner, T } from "../fixtures";

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";
const ACTOR: TrustedActor = { actorUid: "server_admin", actorRole: "admin" };

let app: App | undefined;
function store(): FirestoreDedupStore {
  if (!app) app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-mm" });
  let t = T;
  return new FirestoreDedupStore(getFirestore(app), { now: () => (t += 1000) });
}

test("emulator: duplicate candidate create is idempotent", { skip }, async () => {
  const s = store();
  const c = buildDuplicateCandidate({
    stagingRecordId: "emu_a",
    comparedStagingRecordId: "emu_b",
    a: B_google,
    b: B_owner,
    now: T,
  });
  await s.createDuplicateCandidate(c, ACTOR);
  await s.createDuplicateCandidate(c, ACTOR); // idempoten
  const page = await s.listDuplicateCandidates({ stagingRecordId: "emu_a" }, { limit: 10 });
  assert.equal(page.items.length, 1);
});

test("emulator: review status transition + server actor", { skip }, async () => {
  const s = store();
  const c = buildDuplicateCandidate({
    stagingRecordId: "emu_x",
    comparedStagingRecordId: "emu_y",
    a: A_google1,
    b: A_google2,
    now: T,
  });
  await s.createDuplicateCandidate(c, ACTOR);
  const merged = await s.updateDuplicateReviewStatus(c.duplicateCandidateId, "merged", ACTOR, "confirmed");
  assert.equal(merged.reviewStatus, "merged");
  assert.equal(merged.resolvedBy, "server_admin");
});

test("emulator: invalid review transition rejected", { skip }, async () => {
  const s = store();
  const c = buildDuplicateCandidate({
    stagingRecordId: "emu_p",
    comparedStagingRecordId: "emu_q",
    a: B_google,
    b: B_owner,
    now: T,
  });
  await s.createDuplicateCandidate(c, ACTOR);
  // open → merged tidak sah.
  await assert.rejects(() =>
    s.updateDuplicateReviewStatus(c.duplicateCandidateId, "merged", ACTOR),
  );
});

test("emulator: merge plan lifecycle + audit subcollection", { skip }, async () => {
  const s = store();
  const plan = buildMergePlan({
    mergePlanId: "emu_mp_1",
    sourcePlaceIds: ["mm_1", "mm_2"],
    targetCanonicalPlaceId: "mm_1",
    aliases: [],
    sourceRefs: [],
    createdBy: "admin_1",
    now: T,
  });
  await s.createMergePlan(plan, ACTOR);
  await s.transitionMergePlan("emu_mp_1", "review_required", ACTOR);
  const approved = await s.transitionMergePlan("emu_mp_1", "approved", ACTOR);
  assert.equal(approved.approvedBy, "server_admin");
  await s.appendMergeAudit("emu_mp_1", {
    auditId: "aud_1",
    action: "merge_plan_approved",
    actorUid: "server_admin",
    actorRole: "admin",
    sourceIds: ["mm_1", "mm_2"],
    targetId: "mm_1",
    configVersion: "dedup_config_v1",
    algorithmVersion: "dedup_v1",
    createdAt: T,
  });
  const audit = await s.listMergeAudit("emu_mp_1");
  assert.equal(audit.length, 1);
});

test("emulator: alias put + resolve", { skip }, async () => {
  const s = store();
  await s.putAlias(
    { aliasId: "emu_ChIJ", canonicalPlaceId: "mm_canon", aliasType: "google_place_id", createdAt: T, reason: "legacy" },
    ACTOR,
  );
  const r = await s.resolve("emu_ChIJ");
  assert.equal(r.status, "resolved");
  assert.equal(r.canonicalPlaceId, "mm_canon");
});
