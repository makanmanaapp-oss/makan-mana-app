/**
 * Phase 1.14G — resolver baca kanonikal server-mediated (domain TULEN).
 *
 * Menentukan kelayakan kohort dari claims DIPERCAYAI + menindih (overlay) data
 * kanonikal ke atas PlaceCandidate legasi UNTUK KOHORT SAHAJA. Awam = tidak
 * berubah. TIDAK PERNAH mereka nilai. Koleksi kanonikal server-only dibaca oleh
 * lapisan I/O (canonicalReadService); modul ini tulen + boleh diuji.
 */
import { AuthContext, AuthPolicyConfig, isTrustedOwner } from "../trustedAuthorizationPolicy";
import { PlaceCandidate } from "../../../types/place";

export interface CohortAuthorization {
  authenticated: boolean;
  canonicalCohortEligible: boolean;
  correctionEligible: boolean;
  source: "claim_owner" | "owner_allowlist" | "none";
  /** Identiti audit BERTOPENG (bukan UID penuh). */
  maskedIdentity: string;
}

function mask(uid: string): string {
  if (!uid) return "none";
  if (uid.length <= 8) return "****";
  return `${uid.slice(0, 4)}…${uid.slice(-4)}`;
}

/** Tentukan kebenaran kohort dari auth callable (claims DIPERCAYAI sahaja). */
export function resolveCohortAuthorization(
  auth: { uid?: string; token?: Record<string, unknown> } | undefined,
  config: AuthPolicyConfig,
): CohortAuthorization {
  const uid = auth?.uid ?? "";
  if (!uid) {
    return { authenticated: false, canonicalCohortEligible: false, correctionEligible: false, source: "none", maskedIdentity: "none" };
  }
  const ctx: AuthContext = { uid, claims: auth?.token ?? {} };
  const claimOwner = ctx.claims.admin === true || ctx.claims.role === "owner";
  const eligible = isTrustedOwner(ctx, config);
  return {
    authenticated: true,
    canonicalCohortEligible: eligible,
    correctionEligible: true, // mana-mana pengguna sah boleh hantar pembetulan
    source: eligible ? (claimOwner ? "claim_owner" : "owner_allowlist") : "none",
    maskedIdentity: mask(uid),
  };
}

/** Pandangan kanonikal (dari penerbitan aktif) — subset yang boleh ditindih. */
export interface CanonicalPlaceView {
  canonicalPlaceId: string;
  providerPlaceId: string;
  title: string;
  address: string | null;
  lat: number;
  lng: number;
  ratingState: string;
  priceState: string;
  hoursState: string;
  businessState: string;
  halalState: string;
  publicationId: string;
  publicationVersion: number;
}

export type CanonicalDataSource = "canonical" | "legacy";

export interface CanonicalOverlayResult {
  candidate: PlaceCandidate;
  dataSource: CanonicalDataSource;
  fallbackReason: string | null;
  canonicalIdMasked: string | null;
  publicationVersion: number | null;
  aliasResolved: boolean;
}

/**
 * Tindih data kanonikal ke atas satu calon UNTUK kohort. TULEN.
 * - tidak eligible / override → legasi tidak berubah.
 * - kanonikal sah → tindih nama/alamat/koordinat + tanda dataSource=canonical.
 * - kanonikal tiada/tak sah → legasi (fallback jujur).
 * TIDAK PERNAH mereka rating/harga/waktu — medan berangka legasi (dari
 * place_details yang sama) dikekalkan; keadaan tersembunyi dihormati klien.
 */
export function overlayCanonicalCandidate(
  candidate: PlaceCandidate,
  view: CanonicalPlaceView | null,
  opts: { cohortEligible: boolean; forceLegacy: boolean; aliasResolved: boolean; includeDebug: boolean },
): CanonicalOverlayResult {
  const legacy = (reason: string): CanonicalOverlayResult => ({
    candidate: opts.includeDebug ? { ...candidate, dataSource: "legacy" } : candidate,
    dataSource: "legacy",
    fallbackReason: reason,
    canonicalIdMasked: null,
    publicationVersion: null,
    aliasResolved: opts.aliasResolved,
  });

  if (!opts.cohortEligible) return legacy("not_cohort");
  if (opts.forceLegacy) return legacy("emergency_legacy_override");
  if (!opts.aliasResolved) return legacy("alias_not_resolved");
  if (view == null) return legacy("canonical_missing_or_invalid");
  if (!Number.isFinite(view.lat) || !Number.isFinite(view.lng)) {
    return legacy("canonical_location_invalid");
  }

  // Overlay JUJUR: nama/alamat/koordinat kanonikal; medan berangka legasi kekal.
  const overlaid: PlaceCandidate = {
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
