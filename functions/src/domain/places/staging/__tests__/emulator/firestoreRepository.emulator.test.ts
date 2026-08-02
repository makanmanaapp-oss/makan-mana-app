/**
 * Phase 1.3 — ujian repository Firestore terhadap EMULATOR sahaja (offline).
 * Jalankan melalui: npm run test:emulator
 * (firebase emulators:exec --only firestore ...). Melangkau bila
 * FIRESTORE_EMULATOR_HOST tidak ditetapkan supaya TIDAK PERNAH sentuh produksi.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { FirestoreStagingStore } from "../../firestoreRepository";
import {
  PlaceStagingRecord,
  PlaceReviewDecision,
  TrustedActor,
} from "../../index";
import { makeValidCandidate, validProviderSnapshot } from "../fixtures";

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";
const ACTOR: TrustedActor = { actorUid: "server_admin", actorRole: "admin" };

let app: App | undefined;
function store(): FirestoreStagingStore {
  if (!app) {
    app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-mm-staging" });
  }
  let t = 1_700_000_000_000;
  let n = 0;
  return new FirestoreStagingStore(getFirestore(app), { now: () => (t += 1000) }, {
    next: (p) => `${p}_${(++n).toString().padStart(4, "0")}`,
  });
}

function recordWith(id: string): PlaceStagingRecord {
  const candidate = makeValidCandidate({
    candidateId: `${id}_cand`,
    sourceSnapshotId: `${id}_snap`,
  });
  return {
    stagingRecordId: id,
    importBatchId: "batch_emu",
    sourceSnapshotId: `${id}_snap`,
    candidate,
    reviewStatus: "needs_review",
    validationResult: {
      valid: true,
      errors: [],
      warnings: [],
      checkedRules: [],
      validatorVersion: "staging-validator-v1",
      validatedAt: 1_700_000_000_000,
    },
    duplicateCandidates: [],
    auditTrail: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
}

test("emulator: source snapshot immutable (second create rejects)", { skip }, async () => {
  const s = store();
  const snap = { ...validProviderSnapshot, snapshotId: "emu_snap_imm" };
  await s.createSnapshot(snap);
  await assert.rejects(() => s.createSnapshot(snap));
});

test("emulator: create record + transition writes append-only audit", { skip }, async () => {
  const s = store();
  await s.createStagingRecord(recordWith("emu_stg_1"), ACTOR);
  await s.transitionReviewStatus("emu_stg_1", "approved", ACTOR, "ok");
  const audit = await s.listAudit("emu_stg_1");
  assert.ok(audit.length >= 2); // imported + edited
  const got = await s.getStagingRecord("emu_stg_1");
  assert.equal(got!.reviewStatus, "approved");
});

test("emulator: invalid transition rejected", { skip }, async () => {
  const s = store();
  await s.createStagingRecord(recordWith("emu_stg_2"), ACTOR);
  await assert.rejects(() =>
    s.transitionReviewStatus("emu_stg_2", "published" as never, ACTOR),
  );
});

test("emulator: review decision uses server actor, not client claim", { skip }, async () => {
  const s = store();
  await s.createStagingRecord(recordWith("emu_stg_3"), ACTOR);
  const decision: PlaceReviewDecision = {
    decisionId: "dec_emu",
    stagingRecordId: "emu_stg_3",
    decision: "approve",
    decidedBy: "CLIENT_CLAIM",
    decidedAt: 1_700_000_000_000,
    reasonCode: "ok",
    previousReviewStatus: "needs_review",
    nextReviewStatus: "approved",
  };
  const updated = await s.recordReviewDecision("emu_stg_3", decision, ACTOR);
  assert.equal(updated.reviewedBy, "server_admin");
});

test("emulator: bounded pagination", { skip }, async () => {
  const s = store();
  for (let i = 1; i <= 3; i++) await s.createStagingRecord(recordWith(`emu_pg_${i}`), ACTOR);
  const page = await s.listStagingRecords({ importBatchId: "batch_emu" }, { limit: 2 });
  assert.ok(page.items.length <= 2);
});
