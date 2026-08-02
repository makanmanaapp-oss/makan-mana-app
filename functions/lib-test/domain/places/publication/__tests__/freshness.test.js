"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 1.6 Part O — ujian freshness (1-6, 11-14 sebahagian).
 * Masa DISUNTIK dalam setiap ujian (tiada Date.now()).
 */
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
const REG = index_1.DEFAULT_FRESHNESS_POLICY_REGISTRY;
const d = (n) => n * fixtures_1.DAY;
// 1. Medan segar kekal segar sebelum ambang stale.
(0, node_test_1.default)("1. medan kekal fresh sebelum ambang stale", () => {
    const r = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.rating, fixtures_1.T + d(13));
    strict_1.default.equal(r.state, "fresh");
    strict_1.default.equal(r.stale, false);
    strict_1.default.equal(r.expired, false);
    strict_1.default.equal(r.publicationBlocked, false);
    strict_1.default.equal(r.warningCode, undefined);
});
// 2. Medan menjadi stale selepas ambang.
(0, node_test_1.default)("2. medan menjadi aging/stale selepas ambang stale", () => {
    // rating: stale 14d, expired 120d → midpoint = 67d.
    const aging = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.rating, fixtures_1.T + d(20));
    strict_1.default.equal(aging.state, "aging");
    strict_1.default.equal(aging.stale, true);
    strict_1.default.equal(aging.expired, false);
    const stale = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.rating, fixtures_1.T + d(100));
    strict_1.default.equal(stale.state, "stale");
    strict_1.default.equal(stale.stale, true);
    strict_1.default.equal(stale.warningCode, "freshness_stale");
});
// 3. Medan menjadi expired selepas expiry.
(0, node_test_1.default)("3. medan menjadi expired selepas ambang expiry", () => {
    const r = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.rating, fixtures_1.T + d(121));
    strict_1.default.equal(r.state, "expired");
    strict_1.default.equal(r.expired, true);
    strict_1.default.equal(r.warningCode, "freshness_expired");
    strict_1.default.ok(r.ageSeconds !== undefined && r.ageSeconds > 0);
});
// 4. Timestamp hilang menghasilkan unknown.
(0, node_test_1.default)("4. fetchedAt+verifiedAt tiada → unknown (bukan fresh)", () => {
    const r = (0, index_1.evaluateFieldFreshness)({}, REG.businessStatus, fixtures_1.T);
    strict_1.default.equal(r.state, "unknown");
    strict_1.default.equal(r.stale, false);
    strict_1.default.equal(r.expired, false);
    strict_1.default.equal(r.warningCode, "freshness_unknown");
    strict_1.default.equal(r.ageSeconds, undefined);
    // Tidak diketahui TIDAK menyekat penerbitan, tetapi tidak pernah "fresh".
    strict_1.default.equal(r.publicationBlocked, false);
});
(0, node_test_1.default)("4b. verifiedAt sahaja mencukupi sebagai rujukan masa", () => {
    const r = (0, index_1.evaluateFieldFreshness)({ verifiedAt: fixtures_1.T }, REG.rating, fixtures_1.T + d(1));
    strict_1.default.equal(r.state, "fresh");
});
(0, node_test_1.default)("4c. verifiedAt lebih baharu menyegarkan semula medan", () => {
    // fetchedAt lama (luput) tetapi disahkan semula baru-baru ini.
    const r = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T, verifiedAt: fixtures_1.T + d(200) }, REG.rating, fixtures_1.T + d(201));
    strict_1.default.equal(r.state, "fresh");
});
// 13. Medan kritikal luput MENYEKAT penerbitan.
(0, node_test_1.default)("13. medan kritikal luput menyekat penerbitan", () => {
    const hours = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.openingHours, fixtures_1.T + d(61));
    strict_1.default.equal(hours.expired, true);
    strict_1.default.equal(hours.publicationBlocked, true);
    // openingHours: allowStaleDisplay=false → paparan TIDAK dibenarkan.
    strict_1.default.equal(hours.displayAllowed, false);
    const halal = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.halalEvidence, fixtures_1.T + d(366));
    strict_1.default.equal(halal.publicationBlocked, true);
});
// 14. Medan stale bukan-kritikal boleh terbit dengan amaran.
(0, node_test_1.default)("14. medan bukan-kritikal stale tidak menyekat (amaran sahaja)", () => {
    const r = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, REG.images, fixtures_1.T + d(541));
    strict_1.default.equal(r.expired, true);
    strict_1.default.equal(r.publicationBlocked, false); // images: block=false
    strict_1.default.equal(r.displayAllowed, true); // allowStaleDisplay=true
});
(0, node_test_1.default)("polisi: expiresAt eksplisit mengatasi TTL polisi", () => {
    // Sijil halal dengan tarikh luput sendiri (lebih awal daripada TTL 365d).
    const r = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T, expiresAt: fixtures_1.T + d(10) }, REG.halalEvidence, fixtures_1.T + d(11));
    strict_1.default.equal(r.state, "expired");
    strict_1.default.equal(r.publicationBlocked, true);
});
(0, node_test_1.default)("registri: semua TTL stale < expiry, versi ditetapkan", () => {
    for (const p of Object.values(REG)) {
        strict_1.default.ok(p.staleAfterSeconds < p.expiresAfterSeconds, `${p.fieldId} TTL salah`);
        strict_1.default.equal(p.version, "freshness_policy_v1");
    }
    // Medan penyekat penerbitan mesti termasuk semua yang kritikal-keselamatan.
    const blocking = (0, index_1.publicationBlockingFields)();
    for (const f of ["businessStatus", "openingHours", "halalEvidence", "allergenEvidence"]) {
        strict_1.default.ok(blocking.includes(f), `${f} sepatutnya menyekat`);
    }
});
// ---- Part C: ringkasan peringkat kedai ----
(0, node_test_1.default)("place freshness: semua medan segar → overall fresh", () => {
    const r = (0, index_1.evaluatePlaceFreshness)((0, fixtures_1.freshInputsAt)(fixtures_1.T), fixtures_1.T + 1000);
    strict_1.default.equal(r.overallFreshnessState, "fresh");
    strict_1.default.equal(r.publicationBlocked, false);
    strict_1.default.deepEqual(r.expiredFieldIds, []);
    strict_1.default.deepEqual(r.criticalExpiredFieldIds, []);
});
(0, node_test_1.default)("place freshness: SATU medan kritikal luput mendominasi (tiada purata)", () => {
    const inputs = (0, fixtures_1.freshInputsAt)(fixtures_1.T + d(60)); // kebanyakan medan sangat segar
    inputs.openingHours = { fetchedAt: fixtures_1.T }; // luput pada T+61d
    const r = (0, index_1.evaluatePlaceFreshness)(inputs, fixtures_1.T + d(61));
    strict_1.default.equal(r.overallFreshnessState, "expired");
    strict_1.default.ok(r.criticalExpiredFieldIds.includes("openingHours"));
    strict_1.default.equal(r.publicationBlocked, true);
    // Medan kritikal yang luput KEKAL kelihatan — tidak dilarutkan.
    strict_1.default.ok(r.requiredWarnings.some((w) => w.startsWith("openingHours:")));
});
(0, node_test_1.default)("place freshness: medan tanpa input → unknown, bukan fresh", () => {
    const r = (0, index_1.evaluatePlaceFreshness)({}, fixtures_1.T);
    strict_1.default.equal(r.overallFreshnessState, "unknown");
    for (const f of Object.values(r.fieldResults))
        strict_1.default.equal(f.state, "unknown");
    strict_1.default.equal(r.publicationBlocked, false);
});
(0, node_test_1.default)("place freshness: nextRefreshAt & keutamaan ambil medan paling segera", () => {
    const inputs = (0, fixtures_1.freshInputsAt)(fixtures_1.T);
    // businessStatus: stale 3d, expired 30d → pada T+20d ia STALE (belum luput).
    const r = (0, index_1.evaluatePlaceFreshness)(inputs, fixtures_1.T + d(20));
    strict_1.default.ok(r.staleFieldIds.includes("businessStatus"));
    strict_1.default.equal(r.expiredFieldIds.includes("businessStatus"), false);
    strict_1.default.equal(r.refreshPriority, 1); // immediate
    strict_1.default.ok(r.nextRefreshAt !== undefined);
    strict_1.default.equal(r.publicationBlocked, false, "stale sahaja tidak menyekat");
});
(0, node_test_1.default)("place freshness: businessStatus melepasi 30d menjadi EXPIRED + menyekat", () => {
    const r = (0, index_1.evaluatePlaceFreshness)((0, fixtures_1.freshInputsAt)(fixtures_1.T), fixtures_1.T + d(31));
    strict_1.default.ok(r.expiredFieldIds.includes("businessStatus"));
    strict_1.default.ok(r.criticalExpiredFieldIds.includes("businessStatus"));
    strict_1.default.equal(r.overallFreshnessState, "expired");
    strict_1.default.equal(r.publicationBlocked, true);
});
(0, node_test_1.default)("polisi override: boleh dilonggarkan untuk ujian tanpa ubah lalai", () => {
    const relaxed = (0, index_1.withPolicyOverrides)({
        openingHours: { blockPublicationWhenExpired: false },
    });
    const r = (0, index_1.evaluateFieldFreshness)({ fetchedAt: fixtures_1.T }, relaxed.openingHours, fixtures_1.T + d(61));
    strict_1.default.equal(r.publicationBlocked, false);
    // Lalai TIDAK berubah.
    strict_1.default.equal(REG.openingHours.blockPublicationWhenExpired, true);
});
