/**
 * Phase 1.6 Part O — ujian versi, rollback, idempotency & invalidasi (31-43).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPublicationVersion,
  computePublicationContentHash,
  InMemoryPublicationStore,
  PublicationNotEligibleError,
  publicationIdFromContent,
  validatePublicationVersion,
  buildCacheInvalidationEvent,
  canTransitionRollbackStatus,
  DEFAULT_SCOPES_BY_REASON,
} from "../index";
import { ADMIN, eligiblePlace, freshInputsAt, permanentlyClosed, SOURCE_VERSION, T } from "./fixtures";

function clock(start = T) {
  let t = start;
  return { now: () => (t += 1000) };
}

function build(placeOverride?: Partial<ReturnType<typeof eligiblePlace>>, versionNumber = 1) {
  const place = { ...eligiblePlace(), ...(placeOverride ?? {}) };
  return buildPublicationVersion({
    place,
    actor: ADMIN,
    now: T,
    versionNumber,
    sourceCanonicalVersion: SOURCE_VERSION,
    eligibilityContext: { freshnessInputs: freshInputsAt(T) },
  });
}

// 31. Versi penerbitan IMMUTABLE.
test("31. versi penerbitan immutable — cipta kedua mengembalikan yang sama", async () => {
  const store = new InMemoryPublicationStore(clock());
  const { version } = build();
  const a = await store.createPublicationVersion(version, ADMIN);
  const b = await store.createPublicationVersion(version, ADMIN);
  assert.equal(a.publicationId, b.publicationId);
  assert.equal(a.versionNumber, b.versionNumber);
  const page = await store.listVersionsByPlace(version.placeId, { limit: 10 });
  assert.equal(page.items.length, 1, "tiada versi pendua dicipta");
});

test("31b. mutasi salinan yang dikembalikan tidak menjejaskan simpanan", async () => {
  const store = new InMemoryPublicationStore(clock());
  const { version } = build();
  const created = await store.createPublicationVersion(version, ADMIN);
  created.publicationStatus = "hidden";
  created.snapshot.place.identity.canonicalName = "DIUBAH";
  const fetched = await store.getPublicationVersion(version.publicationId);
  assert.equal(fetched?.publicationStatus, "published");
  assert.notEqual(fetched?.snapshot.place.identity.canonicalName, "DIUBAH");
});

// 32. Nombor versi MENINGKAT.
test("32. nombor versi meningkat bagi kandungan berbeza", async () => {
  const store = new InMemoryPublicationStore(clock());
  const first = build().version;
  await store.createPublicationVersion(first, ADMIN);
  assert.equal(await store.nextVersionNumber(first.placeId), 2);

  const changed = eligiblePlace();
  changed.quality = { rating: 4.9, reviewCount: 999 };
  const second = buildPublicationVersion({
    place: changed,
    actor: ADMIN,
    now: T + 5000,
    versionNumber: 2,
    sourceCanonicalVersion: SOURCE_VERSION,
    eligibilityContext: { freshnessInputs: freshInputsAt(T) },
  }).version;
  await store.createPublicationVersion(second, ADMIN);

  const page = await store.listVersionsByPlace(first.placeId, { limit: 10 });
  assert.equal(page.items.length, 2);
  assert.equal(page.items[0].versionNumber, 2, "terbaharu dahulu");
  assert.equal(page.items[1].versionNumber, 1);
});

// 33. Kandungan sama = IDEMPOTEN.
test("33. kandungan sama menghasilkan ID + hash sama (idempoten)", () => {
  const a = build().version;
  const b = build().version;
  assert.equal(a.contentHash, b.contentHash);
  assert.equal(a.publicationId, b.publicationId);
});

test("33b. masa/pelaku BERBEZA tidak mengubah hash kandungan", () => {
  const a = build().version;
  const b = buildPublicationVersion({
    place: eligiblePlace(),
    actor: { actorUid: "other_admin", actorRole: "admin" },
    now: T + 999_999,
    versionNumber: 7,
    sourceCanonicalVersion: SOURCE_VERSION,
    eligibilityContext: { freshnessInputs: freshInputsAt(T) },
  }).version;
  assert.equal(a.contentHash, b.contentHash, "hash mesti bebas masa/pelaku/versi");
});

test("33c. idempoten walaupun ID berbeza tetapi kandungan sama", async () => {
  const store = new InMemoryPublicationStore(clock());
  const v1 = build().version;
  await store.createPublicationVersion(v1, ADMIN);
  const v2 = { ...v1, publicationId: "pub_manual_different_id" };
  const out = await store.createPublicationVersion(v2, ADMIN);
  assert.equal(out.publicationId, v1.publicationId, "kandungan sama → versi sedia ada");
  const page = await store.listVersionsByPlace(v1.placeId, { limit: 10 });
  assert.equal(page.items.length, 1);
});

// 34. Kandungan berbeza = hash berbeza.
test("34. kandungan berbeza menghasilkan hash berbeza", () => {
  const a = build().version;
  const changed = eligiblePlace();
  changed.identity = { ...changed.identity, canonicalName: "Warung Lain" };
  const b = buildPublicationVersion({
    place: changed,
    actor: ADMIN,
    now: T,
    versionNumber: 1,
    sourceCanonicalVersion: SOURCE_VERSION,
    eligibilityContext: { freshnessInputs: freshInputsAt(T) },
  }).version;
  assert.notEqual(a.contentHash, b.contentHash);
  assert.notEqual(a.publicationId, b.publicationId);
});

test("34b. versi config/algoritma berbeza menghasilkan hash berbeza", () => {
  const base = {
    placeId: "p1",
    snapshot: { place: eligiblePlace() },
    sourceCanonicalVersion: "v1",
    algorithmVersion: "publication_v1",
    configVersion: "publication_config_v1",
  };
  assert.notEqual(
    computePublicationContentHash(base),
    computePublicationContentHash({ ...base, configVersion: "publication_config_v2" }),
  );
  assert.notEqual(
    publicationIdFromContent(base),
    publicationIdFromContent({ ...base, algorithmVersion: "publication_v2" }),
  );
});

test("pengesahan versi menangkap hash yang tidak sepadan", () => {
  const v = build().version;
  assert.deepEqual(validatePublicationVersion(v), []);
  assert.ok(
    validatePublicationVersion({ ...v, contentHash: "palsu" }).includes(
      "contentHash_mismatch",
    ),
  );
  assert.ok(
    validatePublicationVersion({ ...v, versionNumber: 0 }).includes("versionNumber_invalid"),
  );
});

// Tiada penerbitan boleh memintas pengesahan (peraturan #10).
test("penerbitan tidak layak MELEMPAR — tiada laluan pintasan", () => {
  assert.throws(
    () =>
      buildPublicationVersion({
        place: permanentlyClosed(),
        actor: ADMIN,
        now: T,
        versionNumber: 1,
        sourceCanonicalVersion: SOURCE_VERSION,
        eligibilityContext: { freshnessInputs: freshInputsAt(T) },
      }),
    (e: unknown) => {
      assert.ok(e instanceof PublicationNotEligibleError);
      assert.ok(e.result.blockingReasons.includes("permanently_closed"));
      return true;
    },
  );
});

test("snapshot kelayakan dibekukan ke dalam versi", () => {
  const { version } = build();
  assert.equal(version.eligibilitySnapshot.eligible, true);
  assert.equal(version.eligibilitySnapshot.engineVersion, "eligibility_v1");
  assert.equal(version.eligibilitySnapshot.overallFreshnessState, "fresh");
  assert.ok(version.snapshot.displayState, "keadaan paparan jujur disertakan");
  assert.equal(version.snapshot.displayState?.hours.canComputeOpenNow, true);
  assert.deepEqual(version.changeSummary, ["initial_publication"]);
});

// 35. Rollback MENGEKALKAN versi lebih baharu.
test("35. rollback mengekalkan versi lebih baharu (tiada pemadaman)", async () => {
  const store = new InMemoryPublicationStore(clock());
  const v1 = build().version;
  await store.createPublicationVersion(v1, ADMIN);
  await store.setEmulatorActivePublication(v1.placeId, v1.publicationId, ADMIN, "publish");

  const changed = eligiblePlace();
  changed.quality = { rating: 2.0, reviewCount: 5 }; // penerbitan "salah"
  const v2 = buildPublicationVersion({
    place: changed,
    actor: ADMIN,
    now: T + 10_000,
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

  assert.equal(done.status, "executed_in_emulator");
  assert.ok(done.resultingPublicationId, "rollback mencipta versi BAHARU");

  // Versi 1 & 2 KEKAL wujud; versi 3 (pemulihan) ditambah.
  const page = await store.listVersionsByPlace(v1.placeId, { limit: 10 });
  assert.equal(page.items.length, 3);
  assert.ok(await store.getPublicationVersion(v2.publicationId), "v2 TIDAK dipadam");

  // Penunjuk aktif emulator menunjuk ke versi pemulihan baharu.
  const head = await store.getActiveHead(v1.placeId);
  assert.equal(head?.activePublicationId, done.resultingPublicationId);
  assert.equal(head?.activeVersionNumber, 3);

  // Versi terdahulu ditanda superseded, bukan dipadam.
  const from = await store.getPublicationVersion(v2.publicationId);
  assert.equal(from?.publicationStatus, "superseded");
  assert.ok(from?.effectiveUntil !== undefined);

  // Versi pemulihan membawa metadata rollback.
  const restored = await store.getPublicationVersion(done.resultingPublicationId!);
  assert.equal(restored?.rollbackOfPublicationId, v1.publicationId);
  assert.equal(restored?.supersedesPublicationId, v2.publicationId);
});

test("35b. pelaksanaan rollback IDEMPOTEN (tiada versi tambahan)", async () => {
  const store = new InMemoryPublicationStore(clock());
  const v1 = build().version;
  await store.createPublicationVersion(v1, ADMIN);
  const changed = eligiblePlace();
  changed.commercial = { priceState: "unknown" };
  const v2 = buildPublicationVersion({
    place: changed,
    actor: ADMIN,
    now: T + 10_000,
    versionNumber: 2,
    sourceCanonicalVersion: SOURCE_VERSION,
    eligibilityContext: { freshnessInputs: freshInputsAt(T) },
  }).version;
  await store.createPublicationVersion(v2, ADMIN);

  const rb = await store.requestRollback({
    placeId: v1.placeId,
    fromPublicationId: v2.publicationId,
    targetPublicationId: v1.publicationId,
    reasonCode: "admin_request",
    actor: ADMIN,
  });
  await store.approveRollback(rb.rollbackId, ADMIN);
  const one = await store.executeRollbackInEmulator(rb.rollbackId, ADMIN);
  const two = await store.executeRollbackInEmulator(rb.rollbackId, ADMIN);
  assert.equal(one.resultingPublicationId, two.resultingPublicationId);
  const page = await store.listVersionsByPlace(v1.placeId, { limit: 10 });
  assert.equal(page.items.length, 3, "pelaksanaan kedua tidak menambah versi");

  // Permintaan rollback berulang juga idempoten.
  const again = await store.requestRollback({
    placeId: v1.placeId,
    fromPublicationId: v2.publicationId,
    targetPublicationId: v1.publicationId,
    reasonCode: "admin_request",
    actor: ADMIN,
  });
  assert.equal(again.rollbackId, rb.rollbackId);
});

test("35c. peralihan status rollback dikawal", () => {
  assert.equal(canTransitionRollbackStatus("requested", "approved"), true);
  assert.equal(canTransitionRollbackStatus("approved", "executed_in_emulator"), true);
  assert.equal(canTransitionRollbackStatus("requested", "executed_in_emulator"), false);
  assert.equal(canTransitionRollbackStatus("executed_in_emulator", "approved"), false);
  assert.equal(canTransitionRollbackStatus("rejected", "approved"), false);
});

// 36. Rollback mencipta AUDIT.
test("36. rollback mencipta jejak audit lengkap", async () => {
  const store = new InMemoryPublicationStore(clock());
  const v1 = build().version;
  await store.createPublicationVersion(v1, ADMIN);
  const changed = eligiblePlace();
  changed.hours = { hoursState: "unknown" };
  const v2 = buildPublicationVersion({
    place: changed,
    actor: ADMIN,
    now: T + 10_000,
    versionNumber: 2,
    sourceCanonicalVersion: SOURCE_VERSION,
    eligibilityContext: { freshnessInputs: freshInputsAt(T) },
  }).version;
  await store.createPublicationVersion(v2, ADMIN);

  const rb = await store.requestRollback({
    placeId: v1.placeId,
    fromPublicationId: v2.publicationId,
    targetPublicationId: v1.publicationId,
    reasonCode: "safety_data_incorrect",
    notes: "bukti alergen salah",
    actor: ADMIN,
  });
  await store.approveRollback(rb.rollbackId, ADMIN);
  const done = await store.executeRollbackInEmulator(rb.rollbackId, ADMIN);

  // Audit dalam rekod rollback.
  const actions = done.auditEntries.map((e) => e.action);
  assert.deepEqual(actions, [
    "rollback_requested",
    "rollback_approved",
    "rollback_executed",
  ]);
  assert.equal(done.auditEntries[0].notes, "bukti alergen salah");

  // Audit status peringkat kedai (append-only).
  const audit = await store.listStatusAudit(v1.placeId, { limit: 50 });
  const kinds = new Set(audit.items.map((a) => a.action));
  assert.ok(kinds.has("publication_created"));
  assert.ok(kinds.has("rollback_requested"));
  assert.ok(kinds.has("rollback_approved"));
  assert.ok(kinds.has("rollback_executed"));
  assert.ok(kinds.has("publication_head_moved"));
  for (const e of audit.items) {
    assert.ok(e.reasonCode, "setiap entri audit mesti membawa reasonCode");
    assert.equal(e.actorUid, ADMIN.actorUid);
  }
});

// 37. Peristiwa invalidasi cache DICIPTA.
test("37. peristiwa invalidasi cache dicipta untuk terbit & rollback", async () => {
  const store = new InMemoryPublicationStore(clock());
  const v1 = build().version;
  await store.createPublicationVersion(v1, ADMIN);
  const events = await store.listInvalidationEvents(v1.placeId, { limit: 20 });
  assert.equal(events.items.length, 1);
  assert.equal(events.items[0].reason, "publication_created");
  assert.ok(events.items[0].affectedScopes.includes("place_card"));
  assert.equal(events.items[0].publicationVersion, 1);
});

test("37b. peristiwa invalidasi idempoten pada eventId sama", async () => {
  const store = new InMemoryPublicationStore(clock());
  const ev = buildCacheInvalidationEvent({
    placeId: "mm_x",
    reason: "merge_executed",
    createdAt: T,
    algorithmVersion: "publication_v1",
  });
  await store.appendInvalidationEvent(ev);
  await store.appendInvalidationEvent(ev);
  const list = await store.listInvalidationEvents("mm_x", { limit: 10 });
  assert.equal(list.items.length, 1);
  assert.deepEqual(ev.affectedScopes, DEFAULT_SCOPES_BY_REASON.merge_executed);
});

// 42/43. Repository TIDAK mendedahkan tulisan produksi atau penerbitan mobile.
test("42/43. repository tiada operasi place_registry, mobile publish atau delete", () => {
  const store = new InMemoryPublicationStore(clock());
  const names = new Set([
    ...Object.getOwnPropertyNames(Object.getPrototypeOf(store)),
    ...Object.keys(store),
  ]);
  for (const forbidden of [
    "writePlaceRegistry",
    "publishToMobile",
    "publishToProduction",
    "deletePublication",
    "deleteVersion",
    "hardDelete",
    "invalidateCacheNow",
    "purgeHistory",
  ]) {
    assert.equal(names.has(forbidden), false, `${forbidden} tidak boleh wujud`);
  }
  // Nama koleksi yang disentuh oleh repository ini adalah emulator sahaja.
  const src = InMemoryPublicationStore.toString();
  assert.equal(src.includes("place_registry"), false);
});

test("senarai versi TERBATAS (had halaman dikuatkuasa)", async () => {
  const store = new InMemoryPublicationStore(clock());
  const v1 = build().version;
  await store.createPublicationVersion(v1, ADMIN);
  const page = await store.listVersionsByPlace(v1.placeId, { limit: 10_000 });
  assert.ok(page.items.length <= 100);
});

test("penunjuk aktif menolak versi kedai lain", async () => {
  const store = new InMemoryPublicationStore(clock());
  const v1 = build().version;
  await store.createPublicationVersion(v1, ADMIN);
  await assert.rejects(() =>
    store.setEmulatorActivePublication("mm_other", v1.publicationId, ADMIN, "publish"),
  );
  await assert.rejects(() =>
    store.setEmulatorActivePublication(v1.placeId, "pub_tidak_wujud", ADMIN, "publish"),
  );
});
