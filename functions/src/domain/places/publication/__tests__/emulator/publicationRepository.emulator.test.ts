/**
 * Phase 1.6 — ujian repository penerbitan Firestore terhadap EMULATOR sahaja.
 * Jalankan: npm run test:emulator. Melangkau bila FIRESTORE_EMULATOR_HOST tiada.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { FirestorePublicationStore } from "../../firestorePublicationRepository";
import { buildPublicationVersion } from "../../publicationBuilder";
import { ADMIN, eligiblePlace, freshInputsAt, SOURCE_VERSION, T } from "../fixtures";

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const skip = EMU ? false : "FIRESTORE_EMULATOR_HOST unset (run via npm run test:emulator)";

let app: App | undefined;
let seq = 0;
function store(): FirestorePublicationStore {
  if (!app) app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-mm" });
  let t = T;
  return new FirestorePublicationStore(getFirestore(app), { now: () => (t += 1000) });
}

/** Kedai unik per-ujian supaya ujian tidak berlanggar dalam satu emulator. */
function placeFor(suffix: string) {
  const p = eligiblePlace();
  p.placeId = `emu_pub_${suffix}_${seq++}`;
  return p;
}

function version(place: ReturnType<typeof eligiblePlace>, versionNumber: number, now = T) {
  return buildPublicationVersion({
    place,
    actor: ADMIN,
    now,
    versionNumber,
    sourceCanonicalVersion: SOURCE_VERSION,
    eligibilityContext: { freshnessInputs: freshInputsAt(T) },
  }).version;
}

test("emulator: cipta versi + baca + senarai terbatas", { skip }, async () => {
  const s = store();
  const place = placeFor("create");
  const v1 = version(place, 1);
  const created = await s.createPublicationVersion(v1, ADMIN);
  assert.equal(created.publicationId, v1.publicationId);

  const read = await s.getPublicationVersion(v1.publicationId);
  assert.equal(read?.placeId, place.placeId);
  assert.equal(read?.publicationStatus, "published");
  assert.equal(read?.snapshot.place.identity.canonicalName, place.identity.canonicalName);

  const page = await s.listVersionsByPlace(place.placeId, { limit: 10 });
  assert.equal(page.items.length, 1);
  assert.equal(await s.nextVersionNumber(place.placeId), 2);
});

test("emulator: penerbitan IDEMPOTEN (kandungan sama)", { skip }, async () => {
  const s = store();
  const place = placeFor("idem");
  const a = await s.createPublicationVersion(version(place, 1), ADMIN);
  // Percubaan kedua: nombor versi & masa berbeza, kandungan SAMA.
  const b = await s.createPublicationVersion(version(place, 2, T + 90_000), ADMIN);
  assert.equal(a.publicationId, b.publicationId);
  assert.equal(b.versionNumber, 1, "ulangan tidak menaikkan nombor versi");
  const page = await s.listVersionsByPlace(place.placeId, { limit: 10 });
  assert.equal(page.items.length, 1);
});

test("emulator: versi immutable — create kedua kekal satu dokumen", { skip }, async () => {
  const s = store();
  const place = placeFor("immutable");
  const v = version(place, 1);
  await s.createPublicationVersion(v, ADMIN);
  const again = await s.createPublicationVersion(
    { ...v, publicationStatus: "hidden", publishedBy: "penyerang" },
    ADMIN,
  );
  // Dokumen asal dikembalikan — bukan ditulis ganti.
  assert.equal(again.publicationStatus, "published");
  assert.equal(again.publishedBy, ADMIN.actorUid);
});

test("emulator: penunjuk aktif + audit + invalidasi", { skip }, async () => {
  const s = store();
  const place = placeFor("head");
  const v1 = version(place, 1);
  await s.createPublicationVersion(v1, ADMIN);

  const head = await s.setEmulatorActivePublication(
    place.placeId,
    v1.publicationId,
    ADMIN,
    "publish",
  );
  assert.equal(head.activePublicationId, v1.publicationId);
  assert.equal((await s.getActiveHead(place.placeId))?.activeVersionNumber, 1);

  const audit = await s.listStatusAudit(place.placeId, { limit: 50 });
  const actions = new Set(audit.items.map((a) => a.action));
  assert.ok(actions.has("publication_created"));
  assert.ok(actions.has("publication_head_moved"));

  const inv = await s.listInvalidationEvents(place.placeId, { limit: 50 });
  assert.ok(inv.items.some((e) => e.reason === "publication_created"));
});

test("emulator: rollback mengekalkan sejarah + memindah penunjuk", { skip }, async () => {
  const s = store();
  const place = placeFor("rollback");
  const v1 = version(place, 1);
  await s.createPublicationVersion(v1, ADMIN);
  await s.setEmulatorActivePublication(place.placeId, v1.publicationId, ADMIN, "publish");

  const bad = { ...place, quality: { rating: 1.2, reviewCount: 3 } };
  const v2 = version(bad, 2, T + 30_000);
  await s.createPublicationVersion(v2, ADMIN);
  await s.setEmulatorActivePublication(place.placeId, v2.publicationId, ADMIN, "publish");

  const rb = await s.requestRollback({
    placeId: place.placeId,
    fromPublicationId: v2.publicationId,
    targetPublicationId: v1.publicationId,
    reasonCode: "incorrect_data_published",
    actor: ADMIN,
  });
  await s.approveRollback(rb.rollbackId, ADMIN);
  const done = await s.executeRollbackInEmulator(rb.rollbackId, ADMIN);

  assert.equal(done.status, "executed_in_emulator");
  // Tiada versi dipadam.
  assert.ok(await s.getPublicationVersion(v1.publicationId));
  assert.ok(await s.getPublicationVersion(v2.publicationId));
  const page = await s.listVersionsByPlace(place.placeId, { limit: 20 });
  assert.equal(page.items.length, 3);

  // Versi lama ditanda superseded (bukan dipadam).
  assert.equal(
    (await s.getPublicationVersion(v2.publicationId))?.publicationStatus,
    "superseded",
  );
  // Penunjuk aktif menunjuk ke versi pemulihan.
  const head = await s.getActiveHead(place.placeId);
  assert.equal(head?.activePublicationId, done.resultingPublicationId);
  // Kandungan yang dipulihkan = sasaran.
  const restored = await s.getPublicationVersion(done.resultingPublicationId!);
  assert.equal(restored?.snapshot.place.quality.rating, 4.4);
});

test("emulator: pelaksanaan rollback IDEMPOTEN", { skip }, async () => {
  const s = store();
  const place = placeFor("rbidem");
  const v1 = version(place, 1);
  await s.createPublicationVersion(v1, ADMIN);
  const bad = { ...place, commercial: { priceState: "unknown" as const } };
  const v2 = version(bad, 2, T + 30_000);
  await s.createPublicationVersion(v2, ADMIN);

  const rb = await s.requestRollback({
    placeId: place.placeId,
    fromPublicationId: v2.publicationId,
    targetPublicationId: v1.publicationId,
    reasonCode: "admin_request",
    actor: ADMIN,
  });
  await s.approveRollback(rb.rollbackId, ADMIN);
  const one = await s.executeRollbackInEmulator(rb.rollbackId, ADMIN);
  const two = await s.executeRollbackInEmulator(rb.rollbackId, ADMIN);
  assert.equal(one.resultingPublicationId, two.resultingPublicationId);
  const page = await s.listVersionsByPlace(place.placeId, { limit: 20 });
  assert.equal(page.items.length, 3, "pelaksanaan kedua tidak menambah versi");

  const rollbacks = await s.listRollbacksByPlace(place.placeId, { limit: 10 });
  assert.equal(rollbacks.items.length, 1);
  assert.equal(rollbacks.items[0].auditEntries.length, 3);
});

test("emulator: audit append-only (tiada ganti pada auditId sama)", { skip }, async () => {
  const s = store();
  const place = placeFor("audit");
  const entry = {
    auditId: `emu_aud_${place.placeId}`,
    placeId: place.placeId,
    action: "business_status_changed" as const,
    actorUid: ADMIN.actorUid,
    actorRole: ADMIN.actorRole,
    previousState: "active",
    nextState: "temporarily_closed",
    reasonCode: "merchant_reported",
    createdAt: T,
  };
  await s.appendStatusAudit(entry);
  const again = await s.appendStatusAudit({ ...entry, nextState: "permanently_closed" });
  assert.equal(again.nextState, "temporarily_closed", "entri asal tidak ditulis ganti");
  const list = await s.listStatusAudit(place.placeId, { limit: 10 });
  assert.equal(list.items.length, 1);
});

test("emulator: TIADA tulisan place_registry oleh repository", { skip }, async () => {
  const s = store();
  const place = placeFor("registry");
  await s.createPublicationVersion(version(place, 1), ADMIN);
  await s.setEmulatorActivePublication(
    place.placeId,
    version(place, 1).publicationId,
    ADMIN,
    "publish",
  );
  // Koleksi produksi mesti kekal kosong.
  const db = getFirestore(app!);
  for (const c of ["place_registry", "places_cache", "place_details"]) {
    const snap = await db.collection(c).limit(1).get();
    assert.equal(snap.empty, true, `${c} tidak boleh disentuh oleh Phase 1.6`);
  }
});
