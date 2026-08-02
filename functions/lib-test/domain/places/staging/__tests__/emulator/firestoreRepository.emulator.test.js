"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.3 — ujian repository Firestore terhadap EMULATOR sahaja (offline).
 * Jalankan melalui: npm run test:emulator
 * (firebase emulators:exec --only firestore ...). Melangkau bila
 * FIRESTORE_EMULATOR_HOST tidak ditetapkan supaya TIDAK PERNAH sentuh produksi.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firestoreRepository_1 = require("../../firestoreRepository");
const fixtures_1 = require("../fixtures");
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";
const ACTOR = { actorUid: "server_admin", actorRole: "admin" };
let app;
function store() {
    if (!app) {
        app = (0, app_1.initializeApp)({ projectId: process.env.GCLOUD_PROJECT ?? "demo-mm-staging" });
    }
    let t = 1_700_000_000_000;
    let n = 0;
    return new firestoreRepository_1.FirestoreStagingStore((0, firestore_1.getFirestore)(app), { now: () => (t += 1000) }, {
        next: (p) => `${p}_${(++n).toString().padStart(4, "0")}`,
    });
}
function recordWith(id) {
    const candidate = (0, fixtures_1.makeValidCandidate)({
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
(0, node_test_1.default)("emulator: source snapshot immutable (second create rejects)", { skip }, async () => {
    const s = store();
    const snap = { ...fixtures_1.validProviderSnapshot, snapshotId: "emu_snap_imm" };
    await s.createSnapshot(snap);
    await strict_1.default.rejects(() => s.createSnapshot(snap));
});
(0, node_test_1.default)("emulator: create record + transition writes append-only audit", { skip }, async () => {
    const s = store();
    await s.createStagingRecord(recordWith("emu_stg_1"), ACTOR);
    await s.transitionReviewStatus("emu_stg_1", "approved", ACTOR, "ok");
    const audit = await s.listAudit("emu_stg_1");
    strict_1.default.ok(audit.length >= 2); // imported + edited
    const got = await s.getStagingRecord("emu_stg_1");
    strict_1.default.equal(got.reviewStatus, "approved");
});
(0, node_test_1.default)("emulator: invalid transition rejected", { skip }, async () => {
    const s = store();
    await s.createStagingRecord(recordWith("emu_stg_2"), ACTOR);
    await strict_1.default.rejects(() => s.transitionReviewStatus("emu_stg_2", "published", ACTOR));
});
(0, node_test_1.default)("emulator: review decision uses server actor, not client claim", { skip }, async () => {
    const s = store();
    await s.createStagingRecord(recordWith("emu_stg_3"), ACTOR);
    const decision = {
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
    strict_1.default.equal(updated.reviewedBy, "server_admin");
});
(0, node_test_1.default)("emulator: bounded pagination", { skip }, async () => {
    const s = store();
    for (let i = 1; i <= 3; i++)
        await s.createStagingRecord(recordWith(`emu_pg_${i}`), ACTOR);
    const page = await s.listStagingRecords({ importBatchId: "batch_emu" }, { limit: 2 });
    strict_1.default.ok(page.items.length <= 2);
});
