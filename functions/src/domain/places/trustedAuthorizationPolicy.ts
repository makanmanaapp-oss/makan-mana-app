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
export const TRUSTED_PERMISSIONS = [
  "places.corrections.review",
  "places.corrections.accept_for_staging",
  "places.migration.dry_run",
  "places.migration.approve",
  "places.migration.execute",
  "places.publish",
  "places.rollback",
  "places.audit",
] as const;
export type TrustedPermission = (typeof TRUSTED_PERMISSIONS)[number];

export interface AuthContext {
  uid: string;
  /** request.auth.token (custom claims). TIDAK PERNAH dokumen Firestore. */
  claims: Record<string, unknown>;
}

export interface AuthPolicyConfig {
  /** Senarai putih UID pemilik (env ADMIN_UIDS). Fallback sementara sahaja. */
  ownerAllowlist: readonly string[];
}

/** Adakah konteks ini seorang pemilik/admin DIPERCAYAI? Claim atau allowlist sahaja. */
export function isTrustedOwner(ctx: AuthContext, config: AuthPolicyConfig): boolean {
  if (!ctx.uid) return false;
  const claimOwner = ctx.claims.admin === true || ctx.claims.role === "owner";
  const allowlisted = config.ownerAllowlist.includes(ctx.uid);
  return claimOwner || allowlisted;
}

/**
 * Adakah konteks mempunyai kebenaran DIPERCAYAI tertentu? Dalam fasa ini semua
 * kebenaran dipercayai adalah berpagar-pemilik (owner sahaja). Penghantaran
 * pembetulan BUKAN dalam set ini — ia hanya perlukan auth.
 */
export function hasTrustedPermission(
  permission: TrustedPermission,
  ctx: AuthContext,
  config: AuthPolicyConfig,
): boolean {
  // Semua kebenaran dipercayai = pemilik sahaja (fasa ini). Tiada API admin produksi.
  void permission;
  return isTrustedOwner(ctx, config);
}

/** Melempar jika tiada kebenaran. Mengembalikan uid apabila dibenarkan. */
export function assertTrustedPermission(
  permission: TrustedPermission,
  ctx: AuthContext,
  config: AuthPolicyConfig,
): string {
  if (!ctx.uid) throw new TrustedAuthorizationError("unauthenticated");
  if (!hasTrustedPermission(permission, ctx, config)) {
    throw new TrustedAuthorizationError("permission_denied", permission);
  }
  return ctx.uid;
}

export class TrustedAuthorizationError extends Error {
  constructor(public readonly code: "unauthenticated" | "permission_denied", public readonly permission?: string) {
    super(permission ? `${code}:${permission}` : code);
    this.name = "TrustedAuthorizationError";
  }
}

/**
 * Penghantaran pembetulan: mana-mana pengguna yang disahkan dibenarkan (tiada
 * kebenaran istimewa). Nilai boleh-tulis-klien (isAdmin doc) TIDAK PERNAH dirujuk.
 */
export function canSubmitCorrection(ctx: {uid?: string}): boolean {
  return !!ctx.uid;
}
