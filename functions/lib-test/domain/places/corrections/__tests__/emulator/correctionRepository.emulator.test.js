"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.11 — ujian repository pembetulan Firestore terhadap EMULATOR sahaja.
 * Jalankan: npm run test:emulator.
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firestoreCorrectionRepository_1 = require("../../firestoreCorrectionRepository");
const inMemoryCorrectionRepository_1 = require("../../inMemoryCorrectionRepository");
const correctionDedup_1 = require("../../correctionDedup");
const correctionPrivacy_1 = require("../../correctionPrivacy");
const fixtures_1 = require("../fixtures");
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";
let app;
let seq = 0;
function db() {
    if (!app)
        app = (0, app_1.initializeApp)({ projectId: process.env.GCLOUD_PROJECT ?? "demo-mm" });
    return (0, firestore_1.getFirestore)(app);
}
function store() {
    let t = fixtures_1.T;
    return new firestoreCorrectionRepository_1.FirestoreCorrectionStore(db(), { now: () => (t += 1000) });
}
/** Bina penghantaran sah melalui repository dalam-ingatan, kemudian simpan. */
async function makeSubmission(placeSuffix) {
    const memory = new inMemoryCorrectionRepository_1.InMemoryCorrectionStore((0, correctionDedup_1.withCorrectionLimits)({ cooldownSeconds: 0, maxReportsPerPlacePerDay: 100 }));
    const input = (0, fixtures_1.submissionInput)({ placeId: `EMU-PLACE-${placeSuffix}` });
    const { submission } = await memory.submit(input, fixtures_1.REPORTER, fixtures_1.T);
    return { ...submission, submissionId: `emu_sub_${placeSuffix}_${seq++}` };
}
(0, node_test_1.default)("emulator: cipta penghantaran + baca sendiri (ditapis privasi)", { skip }, async () => {
    const s = store();
    const submission = await makeSubmission("a");
    await s.createSubmission(submission);
    const raw = await s.getSubmissionRaw(submission.submissionId);
    strict_1.default.equal(raw?.placeId, submission.placeId);
    strict_1.default.ok(raw?.originalSnapshot.contentHash);
    const own = await s.getOwnSubmission(submission.submissionId, fixtures_1.REPORTER);
    strict_1.default.ok(own);
    strict_1.default.equal((0, correctionPrivacy_1.containsForbiddenPublicField)(own), null, "tiada medan terlarang");
    strict_1.default.equal(own.submittedBy, undefined);
    // Pengguna lain DITOLAK walaupun melalui Admin SDK helper.
    await strict_1.default.rejects(() => s.getOwnSubmission(submission.submissionId, fixtures_1.OTHER_REPORTER), /forbidden/);
});
(0, node_test_1.default)("emulator: penghantaran IMMUTABLE (cipta kedua tidak menulis ganti)", { skip }, async () => {
    const s = store();
    const submission = await makeSubmission("b");
    await s.createSubmission(submission);
    const again = await s.createSubmission({
        ...submission,
        description: "CUBAAN MENULIS GANTI",
        status: "accepted_for_staging",
    });
    strict_1.default.equal(again.description, submission.description);
    strict_1.default.equal(again.status, submission.status);
});
(0, node_test_1.default)("emulator: bukti ditambah tanpa menyentuh snapshot asal", { skip }, async () => {
    const s = store();
    const submission = await makeSubmission("c");
    await s.createSubmission(submission);
    const before = (await s.getSubmissionRaw(submission.submissionId)).originalSnapshot;
    await s.appendEvidence(submission.submissionId, (0, fixtures_1.evidence)({ evidenceId: "emu_ev_1" }), fixtures_1.REPORTER);
    const after = (await s.getSubmissionRaw(submission.submissionId));
    strict_1.default.deepEqual(after.originalSnapshot, before, "snapshot asal kekal");
    strict_1.default.equal(after.evidence.length, submission.evidence.length + 1);
    const list = await s.listEvidence(submission.submissionId);
    strict_1.default.ok(list.some((e) => e.evidenceId === "emu_ev_1"));
    // Pengguna lain tidak boleh menambah bukti.
    await strict_1.default.rejects(() => s.appendEvidence(submission.submissionId, (0, fixtures_1.evidence)({ evidenceId: "x" }), fixtures_1.OTHER_REPORTER), /forbidden/);
});
(0, node_test_1.default)("emulator: audit append-only", { skip }, async () => {
    const s = store();
    const submission = await makeSubmission("d");
    await s.createSubmission(submission);
    const entry = {
        auditId: "emu_aud_1",
        submissionId: submission.submissionId,
        action: "assigned",
        actorType: "trusted_reviewer",
        trustedActorId: fixtures_1.REVIEWER.actorUid,
        changedFields: ["assignedReviewer"],
        reasonCode: "assigned",
        createdAt: fixtures_1.T,
    };
    await s.appendAudit(entry);
    const again = await s.appendAudit({ ...entry, reasonCode: "DIUBAH" });
    strict_1.default.equal(again.reasonCode, "assigned", "entri asal tidak ditulis ganti");
    const page = await s.listAudit(submission.submissionId, { limit: 20 });
    strict_1.default.equal(page.items.length, 1);
});
(0, node_test_1.default)("emulator: keputusan disimpan; penerimaan hanya merujuk staging", { skip }, async () => {
    const s = store();
    const submission = await makeSubmission("e");
    await s.createSubmission(submission);
    const decision = {
        decisionId: `emu_dec_${seq++}`,
        submissionId: submission.submissionId,
        decision: "accept_for_staging",
        decidedBy: fixtures_1.REVIEWER.actorUid,
        decidedAt: fixtures_1.T,
        reasonCode: "verified_by_reviewer",
        acceptedFields: ["phone"],
        rejectedFields: [],
        stagingRecordId: "stgprop_emu_1",
        previousStatus: "under_review",
        nextStatus: "accepted_for_staging",
        auditEntryId: "emu_aud_dec",
    };
    await s.recordDecision(decision);
    const list = await s.listDecisions(submission.submissionId);
    strict_1.default.equal(list.length, 1);
    strict_1.default.equal(list[0].stagingRecordId, "stgprop_emu_1");
    // Tiada medan penerbitan wujud pada keputusan.
    strict_1.default.equal(list[0].publicationId, undefined);
});
(0, node_test_1.default)("emulator: had kadar direkod per pelapor+kedai", { skip }, async () => {
    const s = store();
    await s.touchRateLimit(fixtures_1.REPORTER, "EMU-PLACE-rl", fixtures_1.T);
    const row = await s.getRateLimit(fixtures_1.REPORTER, "EMU-PLACE-rl");
    strict_1.default.ok(row);
    strict_1.default.equal(row.lastSubmittedAt, fixtures_1.T);
    // Kunci tidak mendedahkan UID mentah.
    strict_1.default.equal(row.key.includes(fixtures_1.REPORTER), false);
});
(0, node_test_1.default)("emulator: TIADA tulisan kepada koleksi produksi kedai", { skip }, async () => {
    const s = store();
    const submission = await makeSubmission("f");
    await s.createSubmission(submission);
    const d = db();
    // Koleksi PRODUKSI sebenar — tiada fasa Part 1 pernah menulis kepadanya.
    // NOTA: `place_publications` sengaja TIDAK disenaraikan di sini kerana ujian
    // emulator Phase 1.6 menulis kepadanya dalam contoh emulator yang SAMA;
    // pengasingan modul ini dibuktikan melalui pemeriksaan sumber di bawah.
    for (const c of ["place_registry", "places_cache", "place_details"]) {
        const snap = await d.collection(c).limit(1).get();
        strict_1.default.equal(snap.empty, true, `${c} tidak boleh disentuh oleh Phase 1.11`);
    }
    // Repository pembetulan tidak merujuk mana-mana koleksi kedai dipercayai.
    const src = firestoreCorrectionRepository_1.FirestoreCorrectionStore.toString();
    for (const c of ["place_registry", "places_cache", "place_details", "place_publications"]) {
        strict_1.default.equal(src.includes(c), false, `${c} tidak boleh dirujuk oleh repository ini`);
    }
});
