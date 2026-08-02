/**
 * Phase 1.6 Part O — ujian freshness (1-6, 11-14 sebahagian).
 * Masa DISUNTIK dalam setiap ujian (tiada Date.now()).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_FRESHNESS_POLICY_REGISTRY,
  evaluateFieldFreshness,
  evaluatePlaceFreshness,
  publicationBlockingFields,
  withPolicyOverrides,
} from "../index";
import { T, DAY, freshInputsAt } from "./fixtures";

const REG = DEFAULT_FRESHNESS_POLICY_REGISTRY;
const d = (n: number) => n * DAY;

// 1. Medan segar kekal segar sebelum ambang stale.
test("1. medan kekal fresh sebelum ambang stale", () => {
  const r = evaluateFieldFreshness({ fetchedAt: T }, REG.rating, T + d(13));
  assert.equal(r.state, "fresh");
  assert.equal(r.stale, false);
  assert.equal(r.expired, false);
  assert.equal(r.publicationBlocked, false);
  assert.equal(r.warningCode, undefined);
});

// 2. Medan menjadi stale selepas ambang.
test("2. medan menjadi aging/stale selepas ambang stale", () => {
  // rating: stale 14d, expired 120d → midpoint = 67d.
  const aging = evaluateFieldFreshness({ fetchedAt: T }, REG.rating, T + d(20));
  assert.equal(aging.state, "aging");
  assert.equal(aging.stale, true);
  assert.equal(aging.expired, false);

  const stale = evaluateFieldFreshness({ fetchedAt: T }, REG.rating, T + d(100));
  assert.equal(stale.state, "stale");
  assert.equal(stale.stale, true);
  assert.equal(stale.warningCode, "freshness_stale");
});

// 3. Medan menjadi expired selepas expiry.
test("3. medan menjadi expired selepas ambang expiry", () => {
  const r = evaluateFieldFreshness({ fetchedAt: T }, REG.rating, T + d(121));
  assert.equal(r.state, "expired");
  assert.equal(r.expired, true);
  assert.equal(r.warningCode, "freshness_expired");
  assert.ok(r.ageSeconds !== undefined && r.ageSeconds > 0);
});

// 4. Timestamp hilang menghasilkan unknown.
test("4. fetchedAt+verifiedAt tiada → unknown (bukan fresh)", () => {
  const r = evaluateFieldFreshness({}, REG.businessStatus, T);
  assert.equal(r.state, "unknown");
  assert.equal(r.stale, false);
  assert.equal(r.expired, false);
  assert.equal(r.warningCode, "freshness_unknown");
  assert.equal(r.ageSeconds, undefined);
  // Tidak diketahui TIDAK menyekat penerbitan, tetapi tidak pernah "fresh".
  assert.equal(r.publicationBlocked, false);
});

test("4b. verifiedAt sahaja mencukupi sebagai rujukan masa", () => {
  const r = evaluateFieldFreshness({ verifiedAt: T }, REG.rating, T + d(1));
  assert.equal(r.state, "fresh");
});

test("4c. verifiedAt lebih baharu menyegarkan semula medan", () => {
  // fetchedAt lama (luput) tetapi disahkan semula baru-baru ini.
  const r = evaluateFieldFreshness(
    { fetchedAt: T, verifiedAt: T + d(200) },
    REG.rating,
    T + d(201),
  );
  assert.equal(r.state, "fresh");
});

// 13. Medan kritikal luput MENYEKAT penerbitan.
test("13. medan kritikal luput menyekat penerbitan", () => {
  const hours = evaluateFieldFreshness({ fetchedAt: T }, REG.openingHours, T + d(61));
  assert.equal(hours.expired, true);
  assert.equal(hours.publicationBlocked, true);
  // openingHours: allowStaleDisplay=false → paparan TIDAK dibenarkan.
  assert.equal(hours.displayAllowed, false);

  const halal = evaluateFieldFreshness({ fetchedAt: T }, REG.halalEvidence, T + d(366));
  assert.equal(halal.publicationBlocked, true);
});

// 14. Medan stale bukan-kritikal boleh terbit dengan amaran.
test("14. medan bukan-kritikal stale tidak menyekat (amaran sahaja)", () => {
  const r = evaluateFieldFreshness({ fetchedAt: T }, REG.images, T + d(541));
  assert.equal(r.expired, true);
  assert.equal(r.publicationBlocked, false); // images: block=false
  assert.equal(r.displayAllowed, true); // allowStaleDisplay=true
});

test("polisi: expiresAt eksplisit mengatasi TTL polisi", () => {
  // Sijil halal dengan tarikh luput sendiri (lebih awal daripada TTL 365d).
  const r = evaluateFieldFreshness(
    { fetchedAt: T, expiresAt: T + d(10) },
    REG.halalEvidence,
    T + d(11),
  );
  assert.equal(r.state, "expired");
  assert.equal(r.publicationBlocked, true);
});

test("registri: semua TTL stale < expiry, versi ditetapkan", () => {
  for (const p of Object.values(REG)) {
    assert.ok(p.staleAfterSeconds < p.expiresAfterSeconds, `${p.fieldId} TTL salah`);
    assert.equal(p.version, "freshness_policy_v1");
  }
  // Medan penyekat penerbitan mesti termasuk semua yang kritikal-keselamatan.
  const blocking = publicationBlockingFields();
  for (const f of ["businessStatus", "openingHours", "halalEvidence", "allergenEvidence"]) {
    assert.ok(blocking.includes(f as never), `${f} sepatutnya menyekat`);
  }
});

// ---- Part C: ringkasan peringkat kedai ----

test("place freshness: semua medan segar → overall fresh", () => {
  const r = evaluatePlaceFreshness(freshInputsAt(T), T + 1000);
  assert.equal(r.overallFreshnessState, "fresh");
  assert.equal(r.publicationBlocked, false);
  assert.deepEqual(r.expiredFieldIds, []);
  assert.deepEqual(r.criticalExpiredFieldIds, []);
});

test("place freshness: SATU medan kritikal luput mendominasi (tiada purata)", () => {
  const inputs = freshInputsAt(T + d(60)); // kebanyakan medan sangat segar
  inputs.openingHours = { fetchedAt: T }; // luput pada T+61d
  const r = evaluatePlaceFreshness(inputs, T + d(61));
  assert.equal(r.overallFreshnessState, "expired");
  assert.ok(r.criticalExpiredFieldIds.includes("openingHours"));
  assert.equal(r.publicationBlocked, true);
  // Medan kritikal yang luput KEKAL kelihatan — tidak dilarutkan.
  assert.ok(r.requiredWarnings.some((w) => w.startsWith("openingHours:")));
});

test("place freshness: medan tanpa input → unknown, bukan fresh", () => {
  const r = evaluatePlaceFreshness({}, T);
  assert.equal(r.overallFreshnessState, "unknown");
  for (const f of Object.values(r.fieldResults)) assert.equal(f.state, "unknown");
  assert.equal(r.publicationBlocked, false);
});

test("place freshness: nextRefreshAt & keutamaan ambil medan paling segera", () => {
  const inputs = freshInputsAt(T);
  // businessStatus: stale 3d, expired 30d → pada T+20d ia STALE (belum luput).
  const r = evaluatePlaceFreshness(inputs, T + d(20));
  assert.ok(r.staleFieldIds.includes("businessStatus"));
  assert.equal(r.expiredFieldIds.includes("businessStatus"), false);
  assert.equal(r.refreshPriority, 1); // immediate
  assert.ok(r.nextRefreshAt !== undefined);
  assert.equal(r.publicationBlocked, false, "stale sahaja tidak menyekat");
});

test("place freshness: businessStatus melepasi 30d menjadi EXPIRED + menyekat", () => {
  const r = evaluatePlaceFreshness(freshInputsAt(T), T + d(31));
  assert.ok(r.expiredFieldIds.includes("businessStatus"));
  assert.ok(r.criticalExpiredFieldIds.includes("businessStatus"));
  assert.equal(r.overallFreshnessState, "expired");
  assert.equal(r.publicationBlocked, true);
});

test("polisi override: boleh dilonggarkan untuk ujian tanpa ubah lalai", () => {
  const relaxed = withPolicyOverrides({
    openingHours: { blockPublicationWhenExpired: false },
  });
  const r = evaluateFieldFreshness({ fetchedAt: T }, relaxed.openingHours, T + d(61));
  assert.equal(r.publicationBlocked, false);
  // Lalai TIDAK berubah.
  assert.equal(REG.openingHours.blockPublicationWhenExpired, true);
});
