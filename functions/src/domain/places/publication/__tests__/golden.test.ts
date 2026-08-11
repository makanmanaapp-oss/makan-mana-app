/**
 * Phase 1.6 Part P — SENARIO EMAS (A-H).
 * Setiap senario mengesahkan tingkah laku hujung-ke-hujung yang diminta.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPublicationVersion,
  deriveHonestDisplayState,
  evaluatePublicationEligibility,
  InMemoryPublicationStore,
} from "../index";
import {
  ADMIN,
  DAY,
  eligiblePlace,
  freshInputsAt,
  permanentlyClosed,
  SOURCE_VERSION,
  T,
  unknownPricePlace,
  unresolvedDuplicatePlace,
} from "./fixtures";

const ctx = (over: Record<string, unknown> = {}) => ({
  now: T + 1000,
  freshnessInputs: freshInputsAt(T),
  ...over,
});

// A. Kedai aktif, lengkap, segar → LAYAK.
test("A. kedai aktif+lengkap+segar layak diterbitkan", () => {
  const r = evaluatePublicationEligibility(eligiblePlace(), ctx());
  assert.equal(r.eligible, true, `blocked: ${r.blockingReasons.join(",")}`);
  assert.deepEqual(r.blockingReasons, []);
});

// B. Kedai aktif, harga tidak diketahui → LAYAK dengan amaran price_unknown.
test("B. harga tidak diketahui → layak DENGAN amaran unknown_price", () => {
  const place = unknownPricePlace();
  const r = evaluatePublicationEligibility(place, ctx());
  assert.equal(r.eligible, true);
  assert.ok(r.warnings.includes("unknown_price"));
  // Kad tidak akan mereka julat harga.
  const display = deriveHonestDisplayState(place, r, T);
  assert.equal(display.price.state, "price_unknown");
  assert.equal(display.price.priceBandId, undefined);
});

// C. Kedai aktif, waktu LUPUT → tiada open_now; sekat/amaran ikut polisi.
test("C. waktu luput → tiada open_now, penerbitan disekat oleh polisi lalai", () => {
  const inputs = freshInputsAt(T);
  inputs.openingHours = { fetchedAt: T - 61 * DAY };
  const place = eligiblePlace();
  const r = evaluatePublicationEligibility(place, ctx({ freshnessInputs: inputs }));

  // Polisi lalai: openingHours ialah kritikal + blockPublicationWhenExpired.
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes("expired_critical_freshness"));

  // Dan yang paling penting: open_now TIDAK boleh dikira.
  const display = deriveHonestDisplayState(place, r, T);
  assert.equal(display.hours.state, "hours_expired");
  assert.equal(display.hours.canComputeOpenNow, false);
});

// D. Kedai tutup kekal → DISEKAT.
test("D. kedai tutup kekal disekat daripada penerbitan & paparan awam", () => {
  const place = permanentlyClosed();
  const r = evaluatePublicationEligibility(place, ctx());
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes("permanently_closed"));

  const display = deriveHonestDisplayState(place, r, T);
  assert.equal(display.business.state, "blocked");
  assert.equal(display.business.blockedFromPublic, true);
});

// E. Duplikat belum diselesaikan → DISEKAT.
test("E. duplikat belum selesai disekat", () => {
  const r = evaluatePublicationEligibility(unresolvedDuplicatePlace(), ctx());
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes("unresolved_duplicate"));
});

// F. Bukti halal LUPUT → tidak boleh papar certified; recheck diperlukan.
test("F. bukti halal luput → tidak boleh papar certified, recheck diperlukan", () => {
  const inputs = freshInputsAt(T);
  inputs.halalEvidence = { fetchedAt: T - 366 * DAY };
  const place = eligiblePlace();
  const r = evaluatePublicationEligibility(place, ctx({ freshnessInputs: inputs }));

  const display = deriveHonestDisplayState(place, r, T);
  assert.notEqual(display.safety.halal, "halal_certified");
  assert.equal(display.safety.halal, "halal_recheck_required");
  assert.ok(display.safety.warningCodes.includes("halal_evidence_expired"));
  // Bukti keselamatan kritikal yang luput turut menyekat penerbitan.
  assert.equal(r.eligible, false);
  assert.ok(r.blockingReasons.includes("expired_critical_freshness"));
  assert.ok(r.warnings.includes("halal_evidence_recheck"));
});

// G. Penerbitan sedia ada di-rollback → sejarah kekal, penunjuk berubah.
test("G. rollback: sejarah kekal, penunjuk emulator berubah, tiada versi dipadam", async () => {
  let t = T;
  const store = new InMemoryPublicationStore({ now: () => (t += 1000) });

  const v1 = buildPublicationVersion({
    place: eligiblePlace(),
    actor: ADMIN,
    now: T,
    versionNumber: 1,
    sourceCanonicalVersion: SOURCE_VERSION,
    eligibilityContext: { freshnessInputs: freshInputsAt(T) },
  }).version;
  await store.createPublicationVersion(v1, ADMIN);
  await store.setEmulatorActivePublication(v1.placeId, v1.publicationId, ADMIN, "publish");

  const bad = eligiblePlace();
  bad.quality = { rating: 1.0, reviewCount: 1 };
  const v2 = buildPublicationVersion({
    place: bad,
    actor: ADMIN,
    now: T + 60_000,
    versionNumber: 2,
    sourceCanonicalVersion: SOURCE_VERSION,
    eligibilityContext: { freshnessInputs: freshInputsAt(T) },
  }).version;
  await store.createPublicationVersion(v2, ADMIN);
  await store.setEmulatorActivePublication(v1.placeId, v2.publicationId, ADMIN, "publish");

  const rb = await store.requestRollback({
    placeId: v1.placeId,
    fromPublicationId: v2.publicationId,
    targetPublicationId: v1.publicationId,
    reasonCode: "incorrect_data_published",
    actor: ADMIN,
  });
  await store.approveRollback(rb.rollbackId, ADMIN);
  const done = await store.executeRollbackInEmulator(rb.rollbackId, ADMIN);

  // Sejarah dikekalkan.
  assert.ok(await store.getPublicationVersion(v1.publicationId));
  assert.ok(await store.getPublicationVersion(v2.publicationId));
  const page = await store.listVersionsByPlace(v1.placeId, { limit: 20 });
  assert.equal(page.items.length, 3);

  // Penunjuk aktif emulator berubah kepada versi pemulihan.
  const head = await store.getActiveHead(v1.placeId);
  assert.equal(head?.activePublicationId, done.resultingPublicationId);
  assert.equal(head?.reasonCode, "rollback_executed");

  // Kandungan yang dipulihkan sepadan dengan sasaran (rating asal).
  const restored = await store.getPublicationVersion(done.resultingPublicationId!);
  assert.equal(restored?.snapshot.place.quality.rating, 4.4);
});

// H. Penerbitan sama dihantar dua kali → satu versi sahaja (idempoten).
test("H. penerbitan sama dihantar dua kali → satu versi (idempoten)", async () => {
  let t = T;
  const store = new InMemoryPublicationStore({ now: () => (t += 1000) });

  const a = buildPublicationVersion({
    place: eligiblePlace(),
    actor: ADMIN,
    now: T,
    versionNumber: 1,
    sourceCanonicalVersion: SOURCE_VERSION,
    eligibilityContext: { freshnessInputs: freshInputsAt(T) },
  }).version;
  // Percubaan kedua: masa & nombor versi berbeza, kandungan SAMA.
  const b = buildPublicationVersion({
    place: eligiblePlace(),
    actor: ADMIN,
    now: T + 120_000,
    versionNumber: 2,
    sourceCanonicalVersion: SOURCE_VERSION,
    eligibilityContext: { freshnessInputs: freshInputsAt(T) },
  }).version;

  const r1 = await store.createPublicationVersion(a, ADMIN);
  const r2 = await store.createPublicationVersion(b, ADMIN);

  assert.equal(r1.publicationId, r2.publicationId);
  assert.equal(r2.versionNumber, 1, "nombor versi TIDAK dinaikkan oleh ulangan");
  const page = await store.listVersionsByPlace(a.placeId, { limit: 20 });
  assert.equal(page.items.length, 1);

  // Satu peristiwa invalidasi sahaja.
  const events = await store.listInvalidationEvents(a.placeId, { limit: 20 });
  assert.equal(events.items.length, 1);
});
