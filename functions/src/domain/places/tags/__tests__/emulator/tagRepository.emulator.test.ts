/**
 * Phase 1.5 — ujian repository tag Firestore terhadap EMULATOR sahaja.
 * Jalankan: npm run test:emulator. Melangkau bila FIRESTORE_EMULATOR_HOST tiada.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { FirestoreTagStore } from "../../firestoreTagRepository";
import { CANONICAL_TAG_REGISTRY } from "../../index";
import { TrustedActor } from "../../../staging/stagingAudit";
import { T, ev } from "../fixtures";

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";
const ACTOR: TrustedActor = { actorUid: "server_admin", actorRole: "admin" };

let app: App | undefined;
function store(): FirestoreTagStore {
  if (!app) app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-mm" });
  let t = T;
  return new FirestoreTagStore(getFirestore(app), { now: () => (t += 1000) });
}

const SEED_SUBSET = ["restaurant", "malay", "western", "western_food", "ayam_geprek"]
  .map((id) => CANONICAL_TAG_REGISTRY.byId.get(id)!)
  .filter(Boolean);

test("emulator: seed + get + listByFamily + resolveAlias", { skip }, async () => {
  const s = store();
  for (const d of SEED_SUBSET) await s.seedDefinition(d);
  assert.equal((await s.getDefinition("restaurant"))?.familyId, "place_type");
  const page = await s.listByFamily("cuisine", { limit: 2 });
  assert.ok(page.items.length <= 2);
  assert.equal(await s.resolveAlias("western_food"), "western"); // deprecated → replacement
  assert.equal(await s.resolveAlias("ayam_gepuk"), "ayam_geprek"); // alias
});

test("emulator: propose evidence + approve + audit subcollection", { skip }, async () => {
  const s = store();
  await s.createProposedEvidence("emu_place_1", ev("cuisine", "malay"), ACTOR);
  const approved = await s.transitionEvidenceStatus("emu_place_1", "malay", "approved", ACTOR);
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvedBy, "server_admin");
  const audit = await s.listAudit("emu_place_1");
  assert.ok(audit.length >= 2); // proposed + approved
});

test("emulator: invalid tag evidence transition rejected", { skip }, async () => {
  const s = store();
  await s.createProposedEvidence("emu_place_2", ev("cuisine", "chinese"), ACTOR);
  await assert.rejects(() =>
    s.transitionEvidenceStatus("emu_place_2", "chinese", "expired" as never, ACTOR),
  );
});

test("emulator: store normalized tag set", { skip }, async () => {
  const s = store();
  await s.storeNormalizedTagSet(
    "emu_place_3",
    [ev("place_type", "restaurant"), ev("cuisine", "malay")],
    ACTOR,
  );
  const set = await s.getTagSet("emu_place_3");
  assert.equal(set.length, 2);
});
