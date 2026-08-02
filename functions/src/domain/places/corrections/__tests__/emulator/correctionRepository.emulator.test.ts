/**
 * Phase 1.11 — ujian repository pembetulan Firestore terhadap EMULATOR sahaja.
 * Jalankan: npm run test:emulator.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { FirestoreCorrectionStore } from "../../firestoreCorrectionRepository";
import { InMemoryCorrectionStore } from "../../inMemoryCorrectionRepository";
import { withCorrectionLimits } from "../../correctionDedup";
import { containsForbiddenPublicField } from "../../correctionPrivacy";
import { evidence, OTHER_REPORTER, REPORTER, REVIEWER, submissionInput, T } from "../fixtures";

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";

let app: App | undefined;
let seq = 0;

function db() {
  if (!app) app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-mm" });
  return getFirestore(app);
}
function store(): FirestoreCorrectionStore {
  let t = T;
  return new FirestoreCorrectionStore(db(), { now: () => (t += 1000) });
}
/** Bina penghantaran sah melalui repository dalam-ingatan, kemudian simpan. */
async function makeSubmission(placeSuffix: string) {
  const memory = new InMemoryCorrectionStore(
    withCorrectionLimits({ cooldownSeconds: 0, maxReportsPerPlacePerDay: 100 }),
  );
  const input = submissionInput({ placeId: `EMU-PLACE-${placeSuffix}` });
  const { submission } = await memory.submit(input, REPORTER, T);
  return { ...submission, submissionId: `emu_sub_${placeSuffix}_${seq++}` };
}

test("emulator: cipta penghantaran + baca sendiri (ditapis privasi)", { skip }, async () => {
  const s = store();
  const submission = await makeSubmission("a");
  await s.createSubmission(submission);

  const raw = await s.getSubmissionRaw(submission.submissionId);
  assert.equal(raw?.placeId, submission.placeId);
  assert.ok(raw?.originalSnapshot.contentHash);

  const own = await s.getOwnSubmission(submission.submissionId, REPORTER);
  assert.ok(own);
  assert.equal(containsForbiddenPublicField(own), null, "tiada medan terlarang");
  assert.equal((own as unknown as Record<string, unknown>).submittedBy, undefined);

  // Pengguna lain DITOLAK walaupun melalui Admin SDK helper.
  await assert.rejects(() => s.getOwnSubmission(submission.submissionId, OTHER_REPORTER), /forbidden/);
});

test("emulator: penghantaran IMMUTABLE (cipta kedua tidak menulis ganti)", { skip }, async () => {
  const s = store();
  const submission = await makeSubmission("b");
  await s.createSubmission(submission);
  const again = await s.createSubmission({
    ...submission,
    description: "CUBAAN MENULIS GANTI",
    status: "accepted_for_staging",
  });
  assert.equal(again.description, submission.description);
  assert.equal(again.status, submission.status);
});

test("emulator: bukti ditambah tanpa menyentuh snapshot asal", { skip }, async () => {
  const s = store();
  const submission = await makeSubmission("c");
  await s.createSubmission(submission);
  const before = (await s.getSubmissionRaw(submission.submissionId))!.originalSnapshot;

  await s.appendEvidence(submission.submissionId, evidence({ evidenceId: "emu_ev_1" }), REPORTER);
  const after = (await s.getSubmissionRaw(submission.submissionId))!;
  assert.deepEqual(after.originalSnapshot, before, "snapshot asal kekal");
  assert.equal(after.evidence.length, submission.evidence.length + 1);

  const list = await s.listEvidence(submission.submissionId);
  assert.ok(list.some((e) => e.evidenceId === "emu_ev_1"));

  // Pengguna lain tidak boleh menambah bukti.
  await assert.rejects(
    () => s.appendEvidence(submission.submissionId, evidence({ evidenceId: "x" }), OTHER_REPORTER),
    /forbidden/,
  );
});

test("emulator: audit append-only", { skip }, async () => {
  const s = store();
  const submission = await makeSubmission("d");
  await s.createSubmission(submission);
  const entry = {
    auditId: "emu_aud_1",
    submissionId: submission.submissionId,
    action: "assigned" as const,
    actorType: "trusted_reviewer" as const,
    trustedActorId: REVIEWER.actorUid,
    changedFields: ["assignedReviewer"],
    reasonCode: "assigned",
    createdAt: T,
  };
  await s.appendAudit(entry);
  const again = await s.appendAudit({ ...entry, reasonCode: "DIUBAH" });
  assert.equal(again.reasonCode, "assigned", "entri asal tidak ditulis ganti");

  const page = await s.listAudit(submission.submissionId, { limit: 20 });
  assert.equal(page.items.length, 1);
});

test("emulator: keputusan disimpan; penerimaan hanya merujuk staging", { skip }, async () => {
  const s = store();
  const submission = await makeSubmission("e");
  await s.createSubmission(submission);

  const decision = {
    decisionId: `emu_dec_${seq++}`,
    submissionId: submission.submissionId,
    decision: "accept_for_staging" as const,
    decidedBy: REVIEWER.actorUid,
    decidedAt: T,
    reasonCode: "verified_by_reviewer",
    acceptedFields: ["phone"] as never,
    rejectedFields: [] as never,
    stagingRecordId: "stgprop_emu_1",
    previousStatus: "under_review" as const,
    nextStatus: "accepted_for_staging" as const,
    auditEntryId: "emu_aud_dec",
  };
  await s.recordDecision(decision);
  const list = await s.listDecisions(submission.submissionId);
  assert.equal(list.length, 1);
  assert.equal(list[0].stagingRecordId, "stgprop_emu_1");
  // Tiada medan penerbitan wujud pada keputusan.
  assert.equal((list[0] as unknown as Record<string, unknown>).publicationId, undefined);
});

test("emulator: had kadar direkod per pelapor+kedai", { skip }, async () => {
  const s = store();
  await s.touchRateLimit(REPORTER, "EMU-PLACE-rl", T);
  const row = await s.getRateLimit(REPORTER, "EMU-PLACE-rl");
  assert.ok(row);
  assert.equal(row!.lastSubmittedAt, T);
  // Kunci tidak mendedahkan UID mentah.
  assert.equal(row!.key.includes(REPORTER), false);
});

test("emulator: TIADA tulisan kepada koleksi produksi kedai", { skip }, async () => {
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
    assert.equal(snap.empty, true, `${c} tidak boleh disentuh oleh Phase 1.11`);
  }
  // Repository pembetulan tidak merujuk mana-mana koleksi kedai dipercayai.
  const src = FirestoreCorrectionStore.toString();
  for (const c of ["place_registry", "places_cache", "place_details", "place_publications"]) {
    assert.equal(src.includes(c), false, `${c} tidak boleh dirujuk oleh repository ini`);
  }
});
