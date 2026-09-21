import {strict as assert} from "node:assert";
import {test} from "node:test";

import {
  APPLE_STATUS_ACTIVE,
  APPLE_STATUS_BILLING_RETRY,
  APPLE_STATUS_EXPIRED,
  APPLE_STATUS_GRACE_PERIOD,
  APPLE_STATUS_REVOKED,
  appleAccountMatches,
  appleBundleMatches,
  appleEntitlementToUserFields,
  isAllowedAppleProduct,
  mapAppleSubscriptionToEntitlement,
  planForAppleProduct,
  type AppleSubscriptionStatusLike,
} from "../appStoreSubscription";

const NOW = 1_700_000_000_000;
const FUTURE = NOW + 86_400_000;
const PAST = NOW - 86_400_000;

function sub(
  over: Partial<AppleSubscriptionStatusLike> & {
    tx?: Record<string, unknown>;
    renewal?: Record<string, unknown>;
  } = {},
): AppleSubscriptionStatusLike {
  return {
    // `in` dan bukan `??`: `status: null` ialah kes ujian yang SAH dan tidak
    // boleh diam-diam menjadi ACTIVE.
    status: "status" in over ? over.status : APPLE_STATUS_ACTIVE,
    transaction: {
      productId: "makanmana_pro_monthly",
      expiresDate: FUTURE,
      originalTransactionId: "ot-1",
      appAccountToken: "uid-abc",
      bundleId: "com.makanmana.apps",
      ...(over.tx ?? {}),
    },
    renewal: {autoRenewStatus: 1, ...(over.renewal ?? {})},
  };
}

test("allowlist produk dikongsi dengan Play", () => {
  assert.equal(isAllowedAppleProduct("makanmana_pro_monthly"), true);
  assert.equal(isAllowedAppleProduct("makanmana_plus_monthly"), true);
  assert.equal(isAllowedAppleProduct("makanmana_percuma_selamanya"), false);
  assert.equal(isAllowedAppleProduct(null), false);
  assert.equal(planForAppleProduct("makanmana_pro_monthly"), "pro");
  assert.equal(planForAppleProduct("makanmana_plus_monthly"), "plus");
  assert.equal(planForAppleProduct("apa-apa"), null);
});

test("ACTIVE dengan auto-renew → active dan berhak", () => {
  const e = mapAppleSubscriptionToEntitlement(sub(), NOW);
  assert.equal(e.entitled, true);
  assert.equal(e.plan, "pro");
  assert.equal(e.planStatus, "active");
  assert.equal(e.autoRenewing, true);
});

test("ACTIVE tanpa auto-renew → cancelled_but_active, MASIH berhak", () => {
  const e = mapAppleSubscriptionToEntitlement(
    sub({renewal: {autoRenewStatus: 0}}),
    NOW,
  );
  assert.equal(e.entitled, true);
  assert.equal(e.planStatus, "cancelled_but_active");
  assert.equal(e.autoRenewing, false);
});

test("ACTIVE tetapi expiresDate sudah lepas → TIDAK berhak", () => {
  // Apple boleh melaporkan ACTIVE sebentar selepas tamat tempoh; masa menang.
  const e = mapAppleSubscriptionToEntitlement(sub({tx: {expiresDate: PAST}}), NOW);
  assert.equal(e.entitled, false);
  assert.equal(e.planStatus, "expired");
});

test("GRACE_PERIOD masih berhak sehingga tempoh tangguh tamat", () => {
  const live = mapAppleSubscriptionToEntitlement(
    sub({
      status: APPLE_STATUS_GRACE_PERIOD,
      renewal: {autoRenewStatus: 1, gracePeriodExpiresDate: FUTURE},
    }),
    NOW,
  );
  assert.equal(live.entitled, true);
  assert.equal(live.planStatus, "grace_period");

  const done = mapAppleSubscriptionToEntitlement(
    sub({
      status: APPLE_STATUS_GRACE_PERIOD,
      renewal: {autoRenewStatus: 1, gracePeriodExpiresDate: PAST},
    }),
    NOW,
  );
  assert.equal(done.entitled, false);
  assert.equal(done.planStatus, "on_hold");
});

test("BILLING_RETRY / EXPIRED / REVOKED → tiada akses", () => {
  const cases: Array<[number, string]> = [
    [APPLE_STATUS_BILLING_RETRY, "on_hold"],
    [APPLE_STATUS_EXPIRED, "expired"],
    [APPLE_STATUS_REVOKED, "expired"],
  ];
  for (const [status, expected] of cases) {
    const e = mapAppleSubscriptionToEntitlement(sub({status}), NOW);
    assert.equal(e.entitled, false, `status ${status}`);
    assert.equal(e.planStatus, expected);
    assert.equal(e.plan, "free");
  }
});

test("PENCABUTAN menang atas status aktif", () => {
  // Bayaran balik: Apple mungkin masih melaporkan ACTIVE. Ia tidak boleh
  // mengekalkan akses.
  const e = mapAppleSubscriptionToEntitlement(
    sub({status: APPLE_STATUS_ACTIVE, tx: {revocationDate: PAST}}),
    NOW,
  );
  assert.equal(e.entitled, false);
  assert.equal(e.planStatus, "expired");
  assert.match(e.reason, /dicabut/);
});

test("produk di luar allowlist tidak boleh memberi kelayakan", () => {
  const e = mapAppleSubscriptionToEntitlement(
    sub({tx: {productId: "makanmana_pro_seumur_hidup_palsu"}}),
    NOW,
  );
  assert.equal(e.entitled, false);
  assert.equal(e.plan, "free");
});

test("status tiada atau tidak dikenali → pending, tidak berhak", () => {
  assert.equal(
    mapAppleSubscriptionToEntitlement(sub({status: null}), NOW).planStatus,
    "pending",
  );
  const unknown = mapAppleSubscriptionToEntitlement(sub({status: 99}), NOW);
  assert.equal(unknown.entitled, false);
  assert.equal(unknown.planStatus, "pending");
});

test("pengikatan akaun: appAccountToken mesti sepadan uid", () => {
  const tx = {appAccountToken: "UID-ABC"};
  assert.equal(appleAccountMatches(tx, "uid-abc"), true, "tidak peka huruf");
  assert.equal(appleAccountMatches(tx, "uid-lain"), false);
  // KETIADAAN ialah gagal-tertutup, bukan lulus.
  assert.equal(appleAccountMatches({}, "uid-abc"), false);
  assert.equal(appleAccountMatches({appAccountToken: ""}, "uid-abc"), false);
  assert.equal(appleAccountMatches(null, "uid-abc"), false);
  assert.equal(appleAccountMatches(tx, ""), false);
});

test("bundle id disemak sisi pelayan", () => {
  assert.equal(appleBundleMatches({bundleId: "com.makanmana.apps"}), true);
  assert.equal(appleBundleMatches({bundleId: "com.penyerang.apps"}), false);
  assert.equal(appleBundleMatches({}), false);
  assert.equal(appleBundleMatches(null), false);
});

test("medan pengguna menggunakan planSource app_store dan turun ke free", () => {
  const entitled = mapAppleSubscriptionToEntitlement(sub(), NOW);
  const f = appleEntitlementToUserFields(entitled);
  assert.equal(f.planSource, "app_store");
  assert.equal(f.plan, "pro");
  assert.equal(f.planStatus, "active");

  const expired = mapAppleSubscriptionToEntitlement(
    sub({status: APPLE_STATUS_EXPIRED}),
    NOW,
  );
  const g = appleEntitlementToUserFields(expired);
  assert.equal(g.plan, "free", "pelan turun ke free");
  assert.equal(g.planStatus, "expired", "status sebenar dikekalkan untuk UI jujur");
});
