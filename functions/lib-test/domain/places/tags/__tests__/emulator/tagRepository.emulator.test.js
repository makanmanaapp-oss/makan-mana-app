"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.5 — ujian repository tag Firestore terhadap EMULATOR sahaja.
 * Jalankan: npm run test:emulator. Melangkau bila FIRESTORE_EMULATOR_HOST tiada.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firestoreTagRepository_1 = require("../../firestoreTagRepository");
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
    return new firestoreTagRepository_1.FirestoreTagStore((0, firestore_1.getFirestore)(app), { now: () => (t += 1000) });
}
const SEED_SUBSET = ["restaurant", "malay", "western", "western_food", "ayam_geprek"]
    .map((id) => index_1.CANONICAL_TAG_REGISTRY.byId.get(id))
    .filter(Boolean);
(0, node_test_1.default)("emulator: seed + get + listByFamily + resolveAlias", { skip }, async () => {
    const s = store();
    for (const d of SEED_SUBSET)
        await s.seedDefinition(d);
    strict_1.default.equal((await s.getDefinition("restaurant"))?.familyId, "place_type");
    const page = await s.listByFamily("cuisine", { limit: 2 });
    strict_1.default.ok(page.items.length <= 2);
    strict_1.default.equal(await s.resolveAlias("western_food"), "western"); // deprecated → replacement
    strict_1.default.equal(await s.resolveAlias("ayam_gepuk"), "ayam_geprek"); // alias
});
(0, node_test_1.default)("emulator: propose evidence + approve + audit subcollection", { skip }, async () => {
    const s = store();
    await s.createProposedEvidence("emu_place_1", (0, fixtures_1.ev)("cuisine", "malay"), ACTOR);
    const approved = await s.transitionEvidenceStatus("emu_place_1", "malay", "approved", ACTOR);
    strict_1.default.equal(approved.status, "approved");
    strict_1.default.equal(approved.approvedBy, "server_admin");
    const audit = await s.listAudit("emu_place_1");
    strict_1.default.ok(audit.length >= 2); // proposed + approved
});
(0, node_test_1.default)("emulator: invalid tag evidence transition rejected", { skip }, async () => {
    const s = store();
    await s.createProposedEvidence("emu_place_2", (0, fixtures_1.ev)("cuisine", "chinese"), ACTOR);
    await strict_1.default.rejects(() => s.transitionEvidenceStatus("emu_place_2", "chinese", "expired", ACTOR));
});
(0, node_test_1.default)("emulator: store normalized tag set", { skip }, async () => {
    const s = store();
    await s.storeNormalizedTagSet("emu_place_3", [(0, fixtures_1.ev)("place_type", "restaurant"), (0, fixtures_1.ev)("cuisine", "malay")], ACTOR);
    const set = await s.getTagSet("emu_place_3");
    strict_1.default.equal(set.length, 2);
});
