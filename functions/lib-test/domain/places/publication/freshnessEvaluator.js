"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FRESHNESS_WARNING_CODES = void 0;
exports.evaluateFieldFreshness = evaluateFieldFreshness;
exports.fromLegacyFieldFreshness = fromLegacyFieldFreshness;
exports.evaluatePlaceFreshness = evaluatePlaceFreshness;
const freshnessPolicy_1 = require("./freshnessPolicy");
/** Kod amaran kanonikal (bebas bahasa; label l10n pada Phase 1.9). */
exports.FRESHNESS_WARNING_CODES = [
    "freshness_unknown",
    "freshness_aging",
    "freshness_stale",
    "freshness_expired",
];
/**
 * Rujukan masa medan = yang TERBAHARU antara verifiedAt dan fetchedAt.
 * Pengesahan manusia/merchant menyegarkan semula medan.
 */
function referenceTime(input) {
    const { fetchedAt, verifiedAt } = input;
    if (fetchedAt === undefined && verifiedAt === undefined)
        return undefined;
    if (fetchedAt === undefined)
        return verifiedAt;
    if (verifiedAt === undefined)
        return fetchedAt;
    return Math.max(fetchedAt, verifiedAt);
}
/**
 * Nilai freshness SATU medan terhadap polisinya.
 *
 * Peraturan (Part B):
 * - `fetchedAt` DAN `verifiedAt` kedua-dua tiada → "unknown".
 * - Ambang stale dilepasi → "aging" (separuh pertama) atau "stale".
 * - Ambang expiry dilepasi → "expired".
 * - Medan kritikal yang luput boleh MENYEKAT penerbitan (ikut polisi).
 * - Paparan stale dibenarkan HANYA dengan amaran (`allowStaleDisplay`).
 * - "unknown" TIDAK PERNAH dianggap segar — paparan dibenarkan tetapi
 *   pemanggil mesti melabelnya jujur (helper Part J menguatkuasa ini).
 */
function evaluateFieldFreshness(input, policy, now) {
    const ref = referenceTime(input);
    if (ref === undefined) {
        return {
            fieldId: policy.fieldId,
            state: "unknown",
            stale: false,
            expired: false,
            // Nilai tidak diketahui boleh "dipapar" hanya sebagai TIDAK DIKETAHUI.
            displayAllowed: true,
            publicationBlocked: false,
            warningCode: "freshness_unknown",
            refreshPriority: policy.refreshPriority,
        };
    }
    const staleAt = input.staleAfter ?? ref + policy.staleAfterSeconds * 1000;
    const expiresAt = input.expiresAt ?? ref + policy.expiresAfterSeconds * 1000;
    const ageSeconds = Math.max(0, Math.floor((now - ref) / 1000));
    let state;
    if (now >= expiresAt) {
        state = "expired";
    }
    else if (now >= staleAt) {
        // Separuh pertama tetingkap stale→expired = "aging" (amaran lembut).
        const midpoint = staleAt + (expiresAt - staleAt) / 2;
        state = now < midpoint ? "aging" : "stale";
    }
    else {
        state = "fresh";
    }
    const expired = state === "expired";
    const stale = state === "stale" || state === "aging";
    let warningCode;
    if (expired)
        warningCode = "freshness_expired";
    else if (state === "stale" && policy.requiresWarningWhenStale) {
        warningCode = "freshness_stale";
    }
    else if (state === "aging" && policy.requiresWarningWhenStale) {
        warningCode = "freshness_aging";
    }
    // Luput: paparan HANYA jika polisi membenarkan stale display; walaupun
    // begitu pemanggil mesti melabel "expired" (Part J). Medan seperti
    // openingHours/halal/allergen sengaja allowStaleDisplay=false.
    const displayAllowed = expired ? policy.allowStaleDisplay : true;
    const publicationBlocked = expired && policy.blockPublicationWhenExpired;
    return {
        fieldId: policy.fieldId,
        state,
        ageSeconds,
        stale,
        expired,
        displayAllowed,
        publicationBlocked,
        warningCode,
        refreshPriority: policy.refreshPriority,
        nextRefreshAt: staleAt,
    };
}
/** Susunan keterukan untuk penggabungan keadaan keseluruhan. */
const SEVERITY = {
    fresh: 0,
    unknown: 1,
    aging: 2,
    stale: 3,
    expired: 4,
};
/**
 * Ekstrak input freshness daripada peta `PlaceFreshness` Phase 1.2 supaya
 * kontrak sedia ada boleh disalurkan terus ke penilai baharu ini.
 */
function fromLegacyFieldFreshness(f) {
    if (!f)
        return undefined;
    return {
        fetchedAt: f.fetchedAt,
        verifiedAt: f.verifiedAt,
        staleAfter: f.staleAfter,
        expiresAt: f.expiresAt,
    };
}
/**
 * Nilai freshness SELURUH kedai.
 *
 * Peraturan keadaan keseluruhan (didokumenkan; bukan purata):
 * 1. Jika MANA-MANA medan `critical` luput → keseluruhan "expired".
 * 2. Jika tidak, ambil keadaan PALING TERUK antara semua medan yang dinilai
 *    (expired > stale > aging > unknown > fresh).
 * 3. Medan tanpa input LANGSUNG diberi "unknown" — ketiadaan data bukan
 *    kesegaran. Ia tidak menaikkan keadaan melebihi "unknown" sendiri.
 *
 * Kami sengaja TIDAK mengeluarkan skor 0..1: purata akan menyembunyikan satu
 * medan keselamatan yang luput di sebalik sembilan medan segar.
 */
function evaluatePlaceFreshness(freshnessInputs, now, registry = freshnessPolicy_1.DEFAULT_FRESHNESS_POLICY_REGISTRY) {
    const fieldResults = {};
    const staleFieldIds = [];
    const expiredFieldIds = [];
    const criticalExpiredFieldIds = [];
    const requiredWarnings = [];
    let worst = "fresh";
    let publicationBlocked = false;
    let nextRefreshAt;
    let refreshPriority = registry.images.refreshPriority;
    for (const fieldId of freshnessPolicy_1.FRESHNESS_POLICY_FIELDS) {
        const policy = registry[fieldId];
        const input = freshnessInputs[fieldId] ?? {};
        const r = evaluateFieldFreshness(input, policy, now);
        fieldResults[fieldId] = r;
        if (r.stale)
            staleFieldIds.push(fieldId);
        if (r.expired) {
            expiredFieldIds.push(fieldId);
            if (policy.criticality === "critical")
                criticalExpiredFieldIds.push(fieldId);
        }
        if (r.publicationBlocked)
            publicationBlocked = true;
        if (r.warningCode)
            requiredWarnings.push(`${fieldId}:${r.warningCode}`);
        if (SEVERITY[r.state] > SEVERITY[worst])
            worst = r.state;
        // Keutamaan/refresh hanya diambil kira untuk medan yang BERMASALAH.
        if (r.state !== "fresh") {
            if (r.refreshPriority < refreshPriority)
                refreshPriority = r.refreshPriority;
            if (r.nextRefreshAt !== undefined) {
                nextRefreshAt =
                    nextRefreshAt === undefined
                        ? r.nextRefreshAt
                        : Math.min(nextRefreshAt, r.nextRefreshAt);
            }
        }
    }
    // Peraturan 1 — medan kritikal luput mendominasi keputusan.
    const overallFreshnessState = criticalExpiredFieldIds.length > 0 ? "expired" : worst;
    return {
        fieldResults,
        overallFreshnessState,
        staleFieldIds,
        expiredFieldIds,
        criticalExpiredFieldIds,
        publicationBlocked,
        requiredWarnings,
        nextRefreshAt,
        refreshPriority,
    };
}
