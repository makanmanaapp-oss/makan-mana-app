"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCohortAuthorization = resolveCohortAuthorization;
exports.overlayCanonicalCandidate = overlayCanonicalCandidate;
/**
 * Phase 1.14G — resolver baca kanonikal server-mediated (domain TULEN).
 *
 * Menentukan kelayakan kohort dari claims DIPERCAYAI + menindih (overlay) data
 * kanonikal ke atas PlaceCandidate legasi UNTUK KOHORT SAHAJA. Awam = tidak
 * berubah. TIDAK PERNAH mereka nilai. Koleksi kanonikal server-only dibaca oleh
 * lapisan I/O (canonicalReadService); modul ini tulen + boleh diuji.
 */
const trustedAuthorizationPolicy_1 = require("../trustedAuthorizationPolicy");
function mask(uid) {
    if (!uid)
        return "none";
    if (uid.length <= 8)
        return "****";
    return `${uid.slice(0, 4)}…${uid.slice(-4)}`;
}
/** Tentukan kebenaran kohort dari auth callable (claims DIPERCAYAI sahaja). */
function resolveCohortAuthorization(auth, config) {
    const uid = auth?.uid ?? "";
    if (!uid) {
        return { authenticated: false, canonicalCohortEligible: false, correctionEligible: false, source: "none", maskedIdentity: "none" };
    }
    const ctx = { uid, claims: auth?.token ?? {} };
    const claimOwner = ctx.claims.admin === true || ctx.claims.role === "owner";
    const eligible = (0, trustedAuthorizationPolicy_1.isTrustedOwner)(ctx, config);
    return {
        authenticated: true,
        canonicalCohortEligible: eligible,
        correctionEligible: true, // mana-mana pengguna sah boleh hantar pembetulan
        source: eligible ? (claimOwner ? "claim_owner" : "owner_allowlist") : "none",
        maskedIdentity: mask(uid),
    };
}
/**
 * Tindih data kanonikal ke atas satu calon UNTUK kohort. TULEN.
 * - tidak eligible / override → legasi tidak berubah.
 * - kanonikal sah → tindih nama/alamat/koordinat + tanda dataSource=canonical.
 * - kanonikal tiada/tak sah → legasi (fallback jujur).
 * TIDAK PERNAH mereka rating/harga/waktu — medan berangka legasi (dari
 * place_details yang sama) dikekalkan; keadaan tersembunyi dihormati klien.
 */
function overlayCanonicalCandidate(candidate, view, opts) {
    const legacy = (reason) => ({
        candidate: opts.includeDebug ? { ...candidate, dataSource: "legacy" } : candidate,
        dataSource: "legacy",
        fallbackReason: reason,
        canonicalIdMasked: null,
        publicationVersion: null,
        aliasResolved: opts.aliasResolved,
    });
    if (!opts.cohortEligible)
        return legacy("not_cohort");
    if (opts.forceLegacy)
        return legacy("emergency_legacy_override");
    if (!opts.aliasResolved)
        return legacy("alias_not_resolved");
    if (view == null)
        return legacy("canonical_missing_or_invalid");
    if (!Number.isFinite(view.lat) || !Number.isFinite(view.lng)) {
        return legacy("canonical_location_invalid");
    }
    // Overlay JUJUR: nama/alamat/koordinat kanonikal; medan berangka legasi kekal.
    const overlaid = {
        ...candidate,
        name: view.title || candidate.name,
        address: view.address ?? candidate.address,
        dataSource: "canonical",
        canonicalPlaceId: view.canonicalPlaceId,
    };
    return {
        candidate: overlaid,
        dataSource: "canonical",
        fallbackReason: null,
        canonicalIdMasked: `${view.canonicalPlaceId.slice(0, 6)}…${view.canonicalPlaceId.slice(-4)}`,
        publicationVersion: view.publicationVersion,
        aliasResolved: true,
    };
}
