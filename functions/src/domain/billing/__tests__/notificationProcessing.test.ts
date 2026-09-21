import {strict as assert} from "node:assert";
import {test} from "node:test";

import {
  applyVerifiedNotification,
  httpStatusForOutcome,
  type CommitInput,
  type NotificationStore,
  type StoredSubscriptionRecord,
  type VerifiedNotification,
} from "../notificationProcessing";
import {APPLE_STATUS_ACTIVE, APPLE_STATUS_EXPIRED} from "../appStoreSubscription";
import {appleAccountTokenFor} from "../appleAccountToken";

const NOW = 1_700_000_000_000;
const UID = "uid-abc";
const KEY = "hash-langganan";

/** Simpanan pakai-buang dalam memori — tiada Firestore, tiada rangkaian. */
class FakeStore implements NotificationStore {
  receipts = new Set<string>();
  subs = new Map<string, StoredSubscriptionRecord>();
  commits: CommitInput[] = [];
  failReads = false;
  failCommit = false;
  /** Meniru ranap SELEPAS penyimpanan tetapi SEBELUM respons dipulangkan. */
  crashAfterCommit = false;

  async hasReceipt(uuid: string): Promise<boolean> {
    if (this.failReads) throw new Error("bacaan mati");
    return this.receipts.has(uuid);
  }

  async loadSubscription(key: string): Promise<StoredSubscriptionRecord | null> {
    if (this.failReads) throw new Error("bacaan mati");
    return this.subs.get(key) ?? null;
  }

  async commit(input: CommitInput): Promise<void> {
    if (this.failCommit) throw new Error("tulis mati");
    // Atom: resit + langganan bersama-sama.
    this.receipts.add(input.notificationUUID);
    this.subs.set(input.subscriptionKey, {
      lastSignedDate: input.signedDate,
      revoked: input.revoked,
      uid: this.subs.get(input.subscriptionKey)?.uid ?? null,
    });
    this.commits.push(input);
    if (this.crashAfterCommit) throw new Error("ranap selepas simpan");
  }
}

function verified(over: Partial<VerifiedNotification> = {}): VerifiedNotification {
  return {
    notificationUUID: "n-1",
    notificationType: "DID_RENEW",
    subtype: null,
    signedDate: NOW,
    environment: "Sandbox",
    status: APPLE_STATUS_ACTIVE,
    transaction: {
      productId: "makanmana_pro_monthly",
      expiresDate: NOW + 86_400_000,
      originalTransactionId: "ot-1",
      bundleId: "com.makanmana.apps",
      appAccountToken: appleAccountTokenFor(UID),
    },
    renewal: {autoRenewStatus: 1},
    subscriptionKey: KEY,
    ...over,
  };
}

const run = (store: NotificationStore, v = verified()) =>
  applyVerifiedNotification({verified: v, store, nowMillis: NOW});

test("1. notifikasi sah diproses dengan KEKAL → respons berjaya", async () => {
  const store = new FakeStore();
  store.subs.set(KEY, {lastSignedDate: null, revoked: false, uid: UID});

  const out = await run(store);
  assert.equal(out.ok, true);
  assert.equal(out.ok && out.action, "applied");
  assert.equal(out.ok && out.durable, true);
  assert.equal(httpStatusForOutcome(out), 200);
  assert.equal(store.commits.length, 1);
  assert.equal(store.commits[0].userWrite?.uid, UID);
});

test("2. kejayaan HANYA selepas selamat — commit mesti mendahului 2xx", async () => {
  const store = new FakeStore();
  store.failCommit = true;

  const out = await run(store);
  assert.equal(out.ok, false);
  assert.notEqual(httpStatusForOutcome(out), 200);
  assert.equal(store.commits.length, 0, "tiada apa-apa disimpan");
});

test("3. kegagalan Firestore SEMENTARA → bukan-kejayaan, boleh cuba semula", async () => {
  const reads = new FakeStore();
  reads.failReads = true;
  const r1 = await run(reads);
  assert.equal(r1.ok, false);
  assert.equal(r1.ok === false && r1.failure.kind, "transient");
  assert.equal(httpStatusForOutcome(r1), 503);

  const writes = new FakeStore();
  writes.failCommit = true;
  const r2 = await run(writes);
  assert.equal(r2.ok === false && r2.failure.kind, "transient");
  assert.equal(httpStatusForOutcome(r2), 503);
});

test("5. duplikat → kejayaan idempoten, tiada tulisan kedua", async () => {
  const store = new FakeStore();
  store.subs.set(KEY, {lastSignedDate: null, revoked: false, uid: UID});

  const first = await run(store);
  assert.equal(first.ok && first.action, "applied");
  assert.equal(store.commits.length, 1);

  const second = await run(store);
  assert.equal(second.ok, true);
  assert.equal(second.ok && second.action, "duplicate");
  assert.equal(second.ok && second.durable, true);
  assert.equal(httpStatusForOutcome(second), 200);
  assert.equal(store.commits.length, 1, "tiada tulisan kedua");
});

test("6. jenis TIDAK DIKENALI → diabaikan secara eksplisit, kekal, tiada kelayakan", async () => {
  const store = new FakeStore();
  store.subs.set(KEY, {lastSignedDate: null, revoked: false, uid: UID});

  const out = await run(
    store,
    verified({notificationType: "JENIS_YANG_APPLE_TAMBAH_KEMUDIAN"}),
  );
  assert.equal(out.ok, true);
  assert.equal(out.ok && out.action, "ignored");
  assert.equal(out.ok && out.durable, true);
  assert.equal(httpStatusForOutcome(out), 200);
  assert.equal(store.commits[0].entitlement, null, "tiada kelayakan diubah");
  assert.equal(store.commits[0].userWrite, null);
});

test("7. ranap SEBELUM penyimpanan → tiada keadaan, tiada 2xx, cuba semula bersih", async () => {
  const store = new FakeStore();
  store.subs.set(KEY, {lastSignedDate: null, revoked: false, uid: UID});
  store.failCommit = true;

  const crashed = await run(store);
  assert.equal(crashed.ok, false);
  assert.notEqual(httpStatusForOutcome(crashed), 200);
  assert.equal(store.receipts.size, 0);
  assert.equal(store.subs.get(KEY)?.lastSignedDate, null, "keadaan tidak disentuh");

  // Percubaan semula Apple kemudian berjaya.
  store.failCommit = false;
  const retried = await run(store);
  assert.equal(retried.ok && retried.action, "applied");
  assert.equal(store.commits.length, 1);
});

test("8. ranap SELEPAS simpan, sebelum respons → cuba semula idempoten", async () => {
  const store = new FakeStore();
  store.subs.set(KEY, {lastSignedDate: null, revoked: false, uid: UID});
  store.crashAfterCommit = true;

  // Penyimpanan berjaya, kemudian proses mati. Apple tidak pernah menerima
  // respons, jadi ia menghantar semula.
  const out = await run(store);
  assert.equal(out.ok, false, "tiada respons kejayaan boleh dipulangkan");
  assert.equal(store.commits.length, 1, "tetapi ia MEMANG disimpan");

  // Penghantaran semula mesti menjadi duplikat yang selamat, bukan tulisan kedua.
  store.crashAfterCommit = false;
  const redelivered = await run(store);
  assert.equal(redelivered.ok && redelivered.action, "duplicate");
  assert.equal(store.commits.length, 1, "tiada kesan kedua");
  assert.equal(httpStatusForOutcome(redelivered), 200);
});

test("notifikasi LUAR URUTAN tidak memulihkan akses yang dicabut", async () => {
  const store = new FakeStore();
  store.subs.set(KEY, {lastSignedDate: NOW, revoked: true, uid: UID});

  const stale = await run(
    store,
    verified({notificationUUID: "n-lama", signedDate: NOW - 60_000}),
  );
  assert.equal(stale.ok && stale.action, "stale");
  assert.equal(httpStatusForOutcome(stale), 200, "basi ialah kejayaan — jangan cuba lagi");
  assert.equal(store.subs.get(KEY)?.revoked, true, "pencabutan kekal");
  assert.equal(store.commits[0].entitlement, null);
});

test("pencabutan melekat merentas pembaharuan kemudian", async () => {
  const store = new FakeStore();
  store.subs.set(KEY, {lastSignedDate: NOW - 1000, revoked: true, uid: UID});

  const out = await run(
    store,
    verified({notificationUUID: "n-renew", signedDate: NOW, status: APPLE_STATUS_ACTIVE}),
  );
  assert.equal(out.ok && out.action, "applied");
  assert.equal(store.commits[0].revoked, true);
  assert.equal(store.commits[0].entitlement?.entitled, false);
  assert.equal(store.commits[0].userWrite?.fields.plan, "free");
});

test("notifikasi TIDAK PERNAH mencipta pengikatan akaun baharu", async () => {
  const store = new FakeStore();
  // Tiada pemilik disahkan lagi.
  store.subs.set(KEY, {lastSignedDate: null, revoked: false, uid: null});

  const out = await run(store);
  assert.equal(out.ok && out.action, "applied");
  assert.equal(store.commits[0].userWrite, null, "tiada pengguna ditulis");
});

test("token yang tidak sepadan tidak boleh menulis kepada pemilik", async () => {
  const store = new FakeStore();
  store.subs.set(KEY, {lastSignedDate: null, revoked: false, uid: UID});

  const out = await run(
    store,
    verified({
      transaction: {
        productId: "makanmana_pro_monthly",
        expiresDate: NOW + 86_400_000,
        originalTransactionId: "ot-1",
        bundleId: "com.makanmana.apps",
        appAccountToken: appleAccountTokenFor("uid-orang-lain"),
      },
    }),
  );
  assert.equal(out.ok && out.action, "applied");
  assert.equal(store.commits[0].userWrite, null, "token orang lain tidak menulis");
});

test("tiada originalTransactionId → berjaya secara remeh, tiada simpanan", async () => {
  const store = new FakeStore();
  const out = await run(store, verified({subscriptionKey: null}));
  assert.equal(out.ok, true);
  assert.equal(out.ok && out.durable, true);
  assert.equal(httpStatusForOutcome(out), 200);
  assert.equal(store.commits.length, 0);
});

test("pemetaan HTTP: 2xx HANYA untuk hasil yang kekal", () => {
  assert.equal(
    httpStatusForOutcome({ok: true, action: "applied", reason: "", durable: true}),
    200,
  );
  // Berjaya tetapi tidak kekal tidak boleh mendapat 2xx.
  assert.equal(
    httpStatusForOutcome({ok: true, action: "applied", reason: "", durable: false}),
    503,
  );
  assert.equal(
    httpStatusForOutcome({ok: false, failure: {kind: "transient", reason: ""}}),
    503,
  );
  assert.equal(
    httpStatusForOutcome({ok: false, failure: {kind: "invalid", reason: ""}}),
    400,
  );
});

test("kelayakan luput ditulis kepada pemilik yang disahkan", async () => {
  const store = new FakeStore();
  store.subs.set(KEY, {lastSignedDate: null, revoked: false, uid: UID});

  const out = await run(
    store,
    verified({notificationType: "EXPIRED", status: APPLE_STATUS_EXPIRED}),
  );
  assert.equal(out.ok && out.action, "applied");
  assert.equal(store.commits[0].entitlement?.entitled, false);
  assert.equal(store.commits[0].userWrite?.fields.plan, "free");
  assert.equal(store.commits[0].userWrite?.fields.planStatus, "expired");
});
