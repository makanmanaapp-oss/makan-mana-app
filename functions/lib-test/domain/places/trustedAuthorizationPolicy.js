"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrustedAuthorizationError = exports.TRUSTED_PERMISSIONS = void 0;
exports.isTrustedOwner = isTrustedOwner;
exports.hasTrustedPermission = hasTrustedPermission;
exports.assertTrustedPermission = assertTrustedPermission;
exports.canSubmitCorrection = canSubmitCorrection;
/**
 * Phase 1.14B — dasar kebenaran DIPERCAYAI untuk operasi tempat (TULEN).
 *
 * KESELAMATAN: kebenaran TIDAK PERNAH berdasarkan medan boleh-tulis-klien seperti
 * `users/{uid}.isAdmin`. Ia hanya menggunakan:
 *   1. Custom claims Firebase (`admin === true` atau `role === "owner"`)
 *   2. Senarai putih UID pemilik dikonfigur env (fallback sementara)
 *
 * Modul ini TIDAK membaca Firestore — jadi ia MUSTAHIL mempercayai medan dokumen
 * yang boleh ditulis klien. Penghantaran pembetulan ialah tindakan pengguna-sah
 * biasa (bukan kebenaran istimewa); semakan/migrasi/penerbitan berpagar-pemilik.
 */
exports.TRUSTED_PERMISSIONS = [
    "places.corrections.review",
    "places.corrections.accept_for_staging",
    "places.migration.dry_run",
    "places.migration.approve",
    "places.migration.execute",
    "places.publish",
    "places.rollback",
    "places.audit",
];
/** Adakah konteks ini seorang pemilik/admin DIPERCAYAI? Claim atau allowlist sahaja. */
function isTrustedOwner(ctx, config) {
    if (!ctx.uid)
        return false;
    const claimOwner = ctx.claims.admin === true || ctx.claims.role === "owner";
    const allowlisted = config.ownerAllowlist.includes(ctx.uid);
    return claimOwner || allowlisted;
}
/**
 * Adakah konteks mempunyai kebenaran DIPERCAYAI tertentu? Dalam fasa ini semua
 * kebenaran dipercayai adalah berpagar-pemilik (owner sahaja). Penghantaran
 * pembetulan BUKAN dalam set ini — ia hanya perlukan auth.
 */
function hasTrustedPermission(permission, ctx, config) {
    // Semua kebenaran dipercayai = pemilik sahaja (fasa ini). Tiada API admin produksi.
    void permission;
    return isTrustedOwner(ctx, config);
}
/** Melempar jika tiada kebenaran. Mengembalikan uid apabila dibenarkan. */
function assertTrustedPermission(permission, ctx, config) {
    if (!ctx.uid)
        throw new TrustedAuthorizationError("unauthenticated");
    if (!hasTrustedPermission(permission, ctx, config)) {
        throw new TrustedAuthorizationError("permission_denied", permission);
    }
    return ctx.uid;
}
class TrustedAuthorizationError extends Error {
    code;
    permission;
    constructor(code, permission) {
        super(permission ? `${code}:${permission}` : code);
        this.code = code;
        this.permission = permission;
        this.name = "TrustedAuthorizationError";
    }
}
exports.TrustedAuthorizationError = TrustedAuthorizationError;
/**
 * Penghantaran pembetulan: mana-mana pengguna yang disahkan dibenarkan (tiada
 * kebenaran istimewa). Nilai boleh-tulis-klien (isAdmin doc) TIDAK PERNAH dirujuk.
 */
function canSubmitCorrection(ctx) {
    return !!ctx.uid;
}
