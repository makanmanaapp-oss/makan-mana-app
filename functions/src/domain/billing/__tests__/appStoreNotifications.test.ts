import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";

import {
  NOTIFICATION_TYPES,
  classifyNotification,
  decideNotification,
  entitlementFromNotification,
  type StoredSubscriptionState,
} from "../appStoreNotifications";
import {APPLE_STATUS_ACTIVE, APPLE_STATUS_EXPIRED} from "../appStoreSubscription";
import {appleAccountTokenFor} from "../appleAccountToken";

const NOW = 1_700_000_000_000;

function stored(over: Partial<StoredSubscriptionState> = {}): StoredSubscriptionState {
  return {
    lastSignedDate: over.lastSignedDate ?? null,
    revoked: over.revoked ?? false,
    seenUuids: over.seenUuids ?? new Set<string>(),
  };
}

function incoming(over: Record<string, unknown> = {}) {
  return {
    notificationUUID: "uuid-1",
    notificationType: "DID_RENEW",
    signedDate: NOW,
    ...over,
  };
}

const tx = {
  productId: "makanmana_pro_monthly",
  expiresDate: NOW + 86_400_000,
  bundleId: "com.makanmana.apps",
  appAccountToken: appleAccountTokenFor("uid-abc"),
};

test("senarai jenis ialah skema Apple sebenar, bukan rekaan", () => {
  // Diambil daripada NotificationTypeV2 pustaka rasmi Apple 3.1.0.
  for (const t of ["SUBSCRIBED", "DID_RENEW", "EXPIRED", "REFUND", "REVOKE",
    "REFUND_REVERSED", "GRACE_PERIOD_EXPIRED", "DID_FAIL_TO_RENEW",
    "DID_CHANGE_RENEWAL_STATUS", "TEST"]) {
    assert.ok(
      (NOTIFICATION_TYPES as readonly string[]).includes(t),
      `${t} hilang daripada skema`,
    );
  }
  assert.equal(NOTIFICATION_TYPES.length, 23);
});

test("klasifikasi: mencabut, membatalkan pencabutan, maklumat", () => {
  for (const t of ["REFUND", "REVOKE"]) {
    const c = classifyNotification(t);
    assert.equal(c.revokes, true, t);
    assert.equal(c.recompute, true, t);
  }
  const rev = classifyNotification("REFUND_REVERSED");
  assert.equal(rev.unrevokes, true);
  assert.equal(rev.revokes, false);

  for (const t of ["TEST", "PRICE_INCREASE", "METADATA_UPDATE", "REFUND_DECLINED"]) {
    const c = classifyNotification(t);
    assert.equal(c.informational, true, t);
    assert.equal(c.recompute, false, t);
  }
});

test("jenis TIDAK DIKENALI diabaikan, bukan diteka", () => {
  const c = classifyNotification("SESUATU_YANG_APPLE_TAMBAH_KEMUDIAN");
  assert.equal(c.known, false);
  assert.equal(c.informational, true);
  assert.equal(c.recompute, false);
  assert.equal(c.revokes, false);
});

test("duplikat notificationUUID tidak diproses dua kali", () => {
  const d = decideNotification({
    incoming: incoming(),
    stored: stored({seenUuids: new Set(["uuid-1"])}),
  });
  assert.equal(d.action, "duplicate");
});

test("notificationUUID atau signedDate yang tiada diabaikan", () => {
  assert.equal(
    decideNotification({incoming: incoming({notificationUUID: null}), stored: stored()})
      .action,
    "ignored",
  );
  assert.equal(
    decideNotification({incoming: incoming({signedDate: null}), stored: stored()}).action,
    "ignored",
  );
  assert.equal(
    decideNotification({incoming: incoming({signedDate: NaN}), stored: stored()}).action,
    "ignored",
  );
});

test("notifikasi LUAR URUTAN tidak boleh memulihkan akses", () => {
  // Ini keperluan keselamatan yang paling penting dalam fail ini: satu
  // peristiwa ACTIVE lama yang tiba selepas pencabutan yang lebih baharu.
  const s = stored({lastSignedDate: NOW, revoked: true});
  const late = decideNotification({
    incoming: incoming({
      notificationUUID: "uuid-lama",
      notificationType: "DID_RENEW",
      signedDate: NOW - 60_000,
    }),
    stored: s,
  });
  assert.equal(late.action, "stale");
  assert.match(late.reason, /di luar urutan/);
});

test("pencabutan MELEKAT merentas notifikasi berikutnya", () => {
  const afterRefund = decideNotification({
    incoming: incoming({notificationUUID: "u-refund", notificationType: "REFUND"}),
    stored: stored({lastSignedDate: NOW - 1000}),
  });
  assert.equal(afterRefund.action, "apply");
  assert.equal(afterRefund.revoked, true);

  // Pembaharuan KEMUDIAN tidak mengosongkan pencabutan dengan sendirinya.
  const laterRenew = decideNotification({
    incoming: incoming({
      notificationUUID: "u-renew",
      notificationType: "DID_RENEW",
      signedDate: NOW + 1000,
    }),
    stored: stored({lastSignedDate: NOW, revoked: true}),
  });
  assert.equal(laterRenew.action, "apply");
  assert.equal(laterRenew.revoked, true, "pencabutan mesti melekat");
});

test("REFUND_REVERSED yang lebih baharu memulihkan akses", () => {
  const d = decideNotification({
    incoming: incoming({
      notificationUUID: "u-rev",
      notificationType: "REFUND_REVERSED",
      signedDate: NOW + 5000,
    }),
    stored: stored({lastSignedDate: NOW, revoked: true}),
  });
  assert.equal(d.action, "apply");
  assert.equal(d.revoked, false);
});

test("signedDate yang SAMA diterima — Apple boleh hantar berbilang", () => {
  const d = decideNotification({
    incoming: incoming({notificationUUID: "u-baharu", signedDate: NOW}),
    stored: stored({lastSignedDate: NOW}),
  });
  assert.equal(d.action, "apply");
});

test("kelayakan dikira semula daripada data disahkan, bukan daripada jenis", () => {
  const live = entitlementFromNotification({
    status: APPLE_STATUS_ACTIVE,
    transaction: tx,
    renewal: {autoRenewStatus: 1},
    revoked: false,
    nowMillis: NOW,
  });
  assert.equal(live.entitled, true);
  assert.equal(live.plan, "pro");

  const expired = entitlementFromNotification({
    status: APPLE_STATUS_EXPIRED,
    transaction: tx,
    renewal: {autoRenewStatus: 0},
    revoked: false,
    nowMillis: NOW,
  });
  assert.equal(expired.entitled, false);
});

test("dicabut memaksa turun walaupun Apple lapor AKTIF", () => {
  const e = entitlementFromNotification({
    status: APPLE_STATUS_ACTIVE,
    transaction: tx,
    renewal: {autoRenewStatus: 1},
    revoked: true,
    nowMillis: NOW,
  });
  assert.equal(e.entitled, false);
  assert.equal(e.plan, "free");
  assert.equal(e.planStatus, "expired");
  assert.match(e.reason, /dicabut/);
});

test("tiada muatan mentah, token atau kunci dilog", () => {
  const files = [
    "src/services/appleNotificationService.ts",
    "src/callable/appStoreServerNotifications.ts",
    "src/services/appleSubscriptionService.ts",
  ];
  // Nama pemboleh ubah yang TIDAK boleh muncul di dalam panggilan log.
  const forbidden = [
    "signedPayload",
    "signedTransactionInfo",
    "signedRenewalInfo",
    "appAccountToken",
    "privateKeyPem",
    "bearer",
    "trustedRoots",
  ];
  const logCall = /console\.(log|info|warn|error)\(([^;]*?)\)\s*;/gs;

  for (const file of files) {
    const src = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const m of src.matchAll(logCall)) {
      const args = m[1];
      for (const token of forbidden) {
        assert.equal(
          args.includes(token),
          false,
          `${file}: log mengandungi ${token}`,
        );
      }
      // Interpolasi objek permintaan mentah juga dilarang.
      assert.equal(args.includes("request.body"), false, `${file}: log body mentah`);
    }
  }
});

test("endpoint memulangkan 5xx untuk sementara dan 4xx untuk tidak sah", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/callable/appStoreServerNotifications.ts"),
    "utf8",
  );
  // Kegagalan sementara MESTI meminta cuba semula; 4xx akan membuang
  // notifikasi pembatalan secara kekal.
  assert.match(src, /kind === "transient"[\s\S]{0,200}status\(503\)/);
  assert.match(src, /status\(400\)/, "muatan tidak sah mesti 4xx");
  assert.match(src, /status\(200\)/, "diterima mesti 200");
});
