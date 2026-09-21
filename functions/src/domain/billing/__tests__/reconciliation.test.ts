import {strict as assert} from "node:assert";
import {test} from "node:test";

import {
  RECONCILE_BATCH_LIMIT,
  RECONCILE_MAX_ATTEMPTS,
  RECONCILE_STALE_AFTER_MS,
  decideReconcile,
  isReconcileCandidate,
  nextAttemptDelayMs,
  runReconciliationBatch,
  selectReconcileBatch,
  type AuthoritativeStatus,
  type AuthoritativeStatusClient,
  type ReconcileRecord,
  type ReconcileStore,
} from "../reconciliation";
import {
  APPLE_STATUS_ACTIVE,
  APPLE_STATUS_EXPIRED,
} from "../appStoreSubscription";

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function rec(over: Partial<ReconcileRecord> = {}): ReconcileRecord {
  return {
    subscriptionKey: "k1",
    uid: "uid-abc",
    planStatus: "active",
    entitled: true,
    revoked: false,
    updatedAtMillis: NOW - RECONCILE_STALE_AFTER_MS - HOUR,
    expiryMillis: NOW + 30 * 24 * HOUR,
    attempts: 0,
    nextAttemptAtMillis: null,
    leaseUntilMillis: null,
    ...over,
  };
}

const tx = (over: Record<string, unknown> = {}) => ({
  productId: "makanmana_pro_monthly",
  expiresDate: NOW + 30 * 24 * HOUR,
  originalTransactionId: "ot-1",
  bundleId: "com.makanmana.apps",
  ...over,
});

test("backoff bertambah dan berhad", () => {
  assert.equal(nextAttemptDelayMs(0), 15 * 60 * 1000);
  assert.ok(nextAttemptDelayMs(2) > nextAttemptDelayMs(1));
  assert.ok(nextAttemptDelayMs(3) > nextAttemptDelayMs(2));
  // Berhad — gangguan Apple tidak boleh menjadi banjir.
  assert.equal(nextAttemptDelayMs(99), 12 * 60 * 60 * 1000);
  assert.equal(nextAttemptDelayMs(-5), 15 * 60 * 1000);
  assert.equal(nextAttemptDelayMs(Number.NaN), 15 * 60 * 1000);
});

test("rekod basi yang mendakwa akses ialah calon", () => {
  assert.equal(isReconcileCandidate(rec(), NOW), true);
});

test("rekod yang sudah luput BUKAN calon — tiada apa untuk dirosotkan", () => {
  for (const planStatus of ["expired", "on_hold", "pending"]) {
    assert.equal(
      isReconcileCandidate(rec({planStatus, entitled: false}), NOW),
      false,
      planStatus,
    );
  }
});

test("rekod segar BUKAN calon", () => {
  assert.equal(isReconcileCandidate(rec({updatedAtMillis: NOW - HOUR}), NOW), false);
});

test("luput mengikut jam kita menjadikannya calon walaupun segar", () => {
  // Kita sepatutnya mendengar daripada Apple dan tidak mendengar.
  const r = rec({updatedAtMillis: NOW - HOUR, expiryMillis: NOW - 1});
  assert.equal(isReconcileCandidate(r, NOW), true);
});

test("backoff dihormati — jangan cuba sebelum masanya", () => {
  assert.equal(
    isReconcileCandidate(rec({nextAttemptAtMillis: NOW + HOUR}), NOW),
    false,
  );
  assert.equal(
    isReconcileCandidate(rec({nextAttemptAtMillis: NOW - 1}), NOW),
    true,
  );
});

test("pajakan menghalang dua pekerja mengendalikan rekod yang sama", () => {
  assert.equal(isReconcileCandidate(rec({leaseUntilMillis: NOW + HOUR}), NOW), false);
  // Pajakan yang tamat tempoh boleh diambil semula — pekerja yang mati tidak
  // boleh mengunci rekod selama-lamanya.
  assert.equal(isReconcileCandidate(rec({leaseUntilMillis: NOW - 1}), NOW), true);
});

test("rekod yang berulang kali gagal diketepikan", () => {
  assert.equal(
    isReconcileCandidate(rec({attempts: RECONCILE_MAX_ATTEMPTS}), NOW),
    false,
  );
  assert.equal(
    isReconcileCandidate(rec({attempts: RECONCILE_MAX_ATTEMPTS - 1}), NOW),
    true,
  );
});

test("kelompok TERHAD dan paling lama dahulu", () => {
  const records = Array.from({length: 200}, (_, i) =>
    rec({
      subscriptionKey: `k${i}`,
      updatedAtMillis: NOW - RECONCILE_STALE_AFTER_MS - i * HOUR,
    }),
  );
  const batch = selectReconcileBatch({records, nowMillis: NOW});
  assert.equal(batch.length, RECONCILE_BATCH_LIMIT, "tidak pernah tanpa had");
  // Paling lama (i terbesar) datang dahulu.
  assert.equal(batch[0].subscriptionKey, "k199");
  assert.ok(batch[0].updatedAtMillis! < batch[1].updatedAtMillis!);
});

test("had kelompok tersuai dihormati; had sifar memulangkan kosong", () => {
  const records = Array.from({length: 10}, (_, i) => rec({subscriptionKey: `k${i}`}));
  assert.equal(selectReconcileBatch({records, nowMillis: NOW, limit: 3}).length, 3);
  assert.equal(selectReconcileBatch({records, nowMillis: NOW, limit: 0}).length, 0);
  assert.equal(selectReconcileBatch({records, nowMillis: NOW, limit: -1}).length, 0);
});

test("status berwibawa yang SEPADAN → tiada tulisan (idempoten)", () => {
  const d = decideReconcile({
    record: rec(),
    authoritative: {
      status: APPLE_STATUS_ACTIVE,
      transaction: tx(),
      renewal: {autoRenewStatus: 1},
    },
    nowMillis: NOW,
  });
  assert.equal(d.action, "unchanged");
});

test("langganan yang luput di Apple merosotkan rekod kita", () => {
  const d = decideReconcile({
    record: rec(),
    authoritative: {
      status: APPLE_STATUS_EXPIRED,
      transaction: tx(),
      renewal: {autoRenewStatus: 0},
    },
    nowMillis: NOW,
  });
  assert.equal(d.action, "write");
  assert.equal(d.action === "write" && d.entitlement.entitled, false);
  assert.equal(d.action === "write" && d.entitlement.planStatus, "expired");
});

test("pencabutan yang terlepas ditangkap walaupun Apple lapor AKTIF", () => {
  // Inilah notifikasi REFUND yang tidak pernah sampai.
  const d = decideReconcile({
    record: rec(),
    authoritative: {
      status: APPLE_STATUS_ACTIVE,
      transaction: tx({revocationDate: NOW - HOUR}),
      renewal: {autoRenewStatus: 1},
    },
    nowMillis: NOW,
  });
  assert.equal(d.action, "write");
  assert.equal(d.action === "write" && d.revoked, true);
  assert.equal(d.action === "write" && d.entitlement.entitled, false);
});

test("ACTIVE BASI tidak boleh memulihkan akses yang masih dicabut di Apple", () => {
  // Rekod sudah dicabut. Apple MASIH menunjukkan pencabutan. Penyelarasan
  // mesti mengekalkannya dicabut, bukan memulihkan.
  const d = decideReconcile({
    record: rec({revoked: true, entitled: false, planStatus: "expired"}),
    authoritative: {
      status: APPLE_STATUS_ACTIVE,
      transaction: tx({revocationDate: NOW - 2 * HOUR}),
      renewal: {autoRenewStatus: 1},
    },
    nowMillis: NOW,
  });
  assert.equal(d.action, "unchanged", "tiada perubahan, tiada pemulihan");
});

test("bayaran balik yang DIBALIKKAN di Apple memulihkan akses", () => {
  // Data semasa yang berwibawa tiada pencabutan → akses kembali. Ini BUKAN
  // keadaan basi; ia kebenaran terkini daripada Apple.
  const d = decideReconcile({
    record: rec({revoked: true, entitled: false, planStatus: "expired"}),
    authoritative: {
      status: APPLE_STATUS_ACTIVE,
      transaction: tx(),
      renewal: {autoRenewStatus: 1},
    },
    nowMillis: NOW,
  });
  assert.equal(d.action, "write");
  assert.equal(d.action === "write" && d.revoked, false);
  assert.equal(d.action === "write" && d.entitlement.entitled, true);
});

test("penyelarasan berulang tidak menghasilkan perubahan duplikat", () => {
  const authoritative = {
    status: APPLE_STATUS_EXPIRED,
    transaction: tx(),
    renewal: {autoRenewStatus: 0},
  };
  const first = decideReconcile({record: rec(), authoritative, nowMillis: NOW});
  assert.equal(first.action, "write");

  // Selepas tulisan pertama, rekod mencerminkan kebenaran; larian kedua ialah
  // no-op.
  const after = rec({
    entitled: false,
    planStatus: "expired",
    revoked: false,
    updatedAtMillis: NOW - RECONCILE_STALE_AFTER_MS - HOUR,
  });
  const second = decideReconcile({record: after, authoritative, nowMillis: NOW});
  assert.equal(second.action, "unchanged");
});

/** Simpanan + klien palsu. Tiada Firestore, tiada rangkaian, tiada Apple. */
class FakeReconcileStore implements ReconcileStore {
  records: ReconcileRecord[] = [];
  leases = new Set<string>();
  writes: string[] = [];
  failures: Array<{key: string; attempts: number; next: number}> = [];
  successes: string[] = [];
  refuseLeaseFor = new Set<string>();

  async listCandidates(): Promise<ReconcileRecord[]> {
    return this.records;
  }
  async acquireLease(key: string): Promise<boolean> {
    if (this.refuseLeaseFor.has(key)) return false;
    this.leases.add(key);
    return true;
  }
  async writeReconciled(p: {record: ReconcileRecord}): Promise<void> {
    this.writes.push(p.record.subscriptionKey);
  }
  async recordFailure(p: {
    subscriptionKey: string;
    attempts: number;
    nextAttemptAtMillis: number;
  }): Promise<void> {
    this.failures.push({key: p.subscriptionKey, attempts: p.attempts, next: p.nextAttemptAtMillis});
  }
  async recordSuccess(key: string): Promise<void> {
    this.successes.push(key);
  }
}

function clientReturning(status: AuthoritativeStatus): AuthoritativeStatusClient {
  return {fetch: async () => status};
}

const ACTIVE_STATUS: AuthoritativeStatus = {
  status: APPLE_STATUS_ACTIVE,
  transaction: tx(),
  renewal: {autoRenewStatus: 1},
};

test("pelari: kelompok terhad, tulis hanya bila berubah", async () => {
  const store = new FakeReconcileStore();
  store.records = [rec({subscriptionKey: "a"}), rec({subscriptionKey: "b"})];

  const expired: AuthoritativeStatus = {
    status: APPLE_STATUS_EXPIRED,
    transaction: tx(),
    renewal: {autoRenewStatus: 0},
  };
  const s = await runReconciliationBatch({
    store,
    client: clientReturning(expired),
    nowMillis: NOW,
  });
  assert.equal(s.examined, 2);
  assert.equal(s.written, 2);
  assert.deepEqual(store.successes.sort(), ["a", "b"]);
});

test("pelari: status yang sepadan TIDAK menulis", async () => {
  const store = new FakeReconcileStore();
  store.records = [rec({subscriptionKey: "a"})];

  const s = await runReconciliationBatch({
    store,
    client: clientReturning(ACTIVE_STATUS),
    nowMillis: NOW,
  });
  assert.equal(s.unchanged, 1);
  assert.equal(s.written, 0);
  assert.deepEqual(store.writes, []);
});

test("pelari: rekod yang dipajak orang lain dilangkau", async () => {
  const store = new FakeReconcileStore();
  store.records = [rec({subscriptionKey: "a"}), rec({subscriptionKey: "b"})];
  store.refuseLeaseFor.add("a");

  const s = await runReconciliationBatch({
    store,
    client: clientReturning(ACTIVE_STATUS),
    nowMillis: NOW,
  });
  assert.equal(s.skippedLeased, 1);
  assert.equal(store.successes.includes("a"), false);
});

test("pelari: kegagalan Apple → backoff, kelompok TERUS", async () => {
  const store = new FakeReconcileStore();
  store.records = [rec({subscriptionKey: "a"}), rec({subscriptionKey: "b"})];

  let calls = 0;
  const flaky: AuthoritativeStatusClient = {
    fetch: async () => {
      calls++;
      if (calls === 1) throw new Error("Apple tidak tersedia");
      return ACTIVE_STATUS;
    },
  };

  const s = await runReconciliationBatch({store, client: flaky, nowMillis: NOW});
  assert.equal(s.failed, 1);
  assert.equal(s.examined, 2, "satu kegagalan tidak menghentikan kelompok");
  assert.equal(store.failures.length, 1);
  assert.equal(store.failures[0].attempts, 1);
  assert.ok(
    store.failures[0].next > NOW,
    "percubaan seterusnya mesti dijadualkan pada masa hadapan",
  );
});

test("pelari: tiada calon → tiada kesan", async () => {
  const store = new FakeReconcileStore();
  store.records = [rec({updatedAtMillis: NOW})]; // segar
  const s = await runReconciliationBatch({
    store,
    client: clientReturning(ACTIVE_STATUS),
    nowMillis: NOW,
  });
  assert.equal(s.examined, 0);
  assert.deepEqual(store.writes, []);
  assert.deepEqual(store.successes, []);
});
