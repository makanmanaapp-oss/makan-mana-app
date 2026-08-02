"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.4 — ujian repository dedup Firestore terhadap EMULATOR sahaja.
 * Jalankan: npm run test:emulator (subset dedup). Melangkau bila
 * FIRESTORE_EMULATOR_HOST tiada — TIDAK PERNAH sentuh produksi.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firestoreDedupRepository_1 = require("../../firestoreDedupRepository");
const index_1 = require("../../index");
const fixtures_1 = require("../fixtures");
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";
const ACTOR = { actorUid: "server_admin", actorRole: "admin" };
let app;
function store() {
    if (!app)
        app = (0, app_1.initializeApp)({ projectId: process.env.GCLOUD_PROJECT ?? "demo-mm" });
    let t = fixtures_1.T;
    return new firestoreDedupRepository_1.FirestoreDedupStore((0, firestore_1.getFirestore)(app), { now: () => (t += 1000) });
}
(0, node_test_1.default)("emulator: duplicate candidate create is idempotent", { skip }, async () => {
    const s = store();
    const c = (0, index_1.buildDuplicateCandidate)({
        stagingRecordId: "emu_a",
        comparedStagingRecordId: "emu_b",
        a: fixtures_1.B_google,
        b: fixtures_1.B_owner,
        now: fixtures_1.T,
    });
    await s.createDuplicateCandidate(c, ACTOR);
    await s.createDuplicateCandidate(c, ACTOR); // idempoten
    const page = await s.listDuplicateCandidates({ stagingRecordId: "emu_a" }, { limit: 10 });
    strict_1.default.equal(page.items.length, 1);
});
(0, node_test_1.default)("emulator: review status transition + server actor", { skip }, async () => {
    const s = store();
    const c = (0, index_1.buildDuplicateCandidate)({
        stagingRecordId: "emu_x",
        comparedStagingRecordId: "emu_y",
        a: fixtures_1.A_google1,
        b: fixtures_1.A_google2,
        now: fixtures_1.T,
    });
    await s.createDuplicateCandidate(c, ACTOR);
    const merged = await s.updateDuplicateReviewStatus(c.duplicateCandidateId, "merged", ACTOR, "confirmed");
    strict_1.default.equal(merged.reviewStatus, "merged");
    strict_1.default.equal(merged.resolvedBy, "server_admin");
});
(0, node_test_1.default)("emulator: invalid review transition rejected", { skip }, async () => {
    const s = store();
    const c = (0, index_1.buildDuplicateCandidate)({
        stagingRecordId: "emu_p",
        comparedStagingRecordId: "emu_q",
        a: fixtures_1.B_google,
        b: fixtures_1.B_owner,
        now: fixtures_1.T,
    });
    await s.createDuplicateCandidate(c, ACTOR);
    // open → merged tidak sah.
    await strict_1.default.rejects(() => s.updateDuplicateReviewStatus(c.duplicateCandidateId, "merged", ACTOR));
});
(0, node_test_1.default)("emulator: merge plan lifecycle + audit subcollection", { skip }, async () => {
    const s = store();
    const plan = (0, index_1.buildMergePlan)({
        mergePlanId: "emu_mp_1",
        sourcePlaceIds: ["mm_1", "mm_2"],
        targetCanonicalPlaceId: "mm_1",
        aliases: [],
        sourceRefs: [],
        createdBy: "admin_1",
        now: fixtures_1.T,
    });
    await s.createMergePlan(plan, ACTOR);
    await s.transitionMergePlan("emu_mp_1", "review_required", ACTOR);
    const approved = await s.transitionMergePlan("emu_mp_1", "approved", ACTOR);
    strict_1.default.equal(approved.approvedBy, "server_admin");
    await s.appendMergeAudit("emu_mp_1", {
        auditId: "aud_1",
        action: "merge_plan_approved",
        actorUid: "server_admin",
        actorRole: "admin",
        sourceIds: ["mm_1", "mm_2"],
        targetId: "mm_1",
        configVersion: "dedup_config_v1",
        algorithmVersion: "dedup_v1",
        createdAt: fixtures_1.T,
    });
    const audit = await s.listMergeAudit("emu_mp_1");
    strict_1.default.equal(audit.length, 1);
});
(0, node_test_1.default)("emulator: alias put + resolve", { skip }, async () => {
    const s = store();
    await s.putAlias({ aliasId: "emu_ChIJ", canonicalPlaceId: "mm_canon", aliasType: "google_place_id", createdAt: fixtures_1.T, reason: "legacy" }, ACTOR);
    const r = await s.resolve("emu_ChIJ");
    strict_1.default.equal(r.status, "resolved");
    strict_1.default.equal(r.canonicalPlaceId, "mm_canon");
});
