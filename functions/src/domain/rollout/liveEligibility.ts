/**
 * Algorithm 2 / Phase 2.6B — Kelayakan LIVE tunggal & server-authoritative.
 *
 * SATU sumber kebenaran untuk "adakah akaun ini menerima runtime Algorithm 2 LIVE
 * penuh" (expanded pool, Explore pagination, early alt-reuse, unified scoring).
 * TRUE untuk: owner_internal, beta_allowlist, (masa depan) percentage_live.
 * FALSE untuk: percentage_shadow (read-only), public_legacy, emergency_legacy.
 * Klien TIDAK boleh mempengaruhi (diputuskan dari resolver server).
 */
import { Algorithm2RolloutDecision } from "./rolloutResolver";

/** Adakah keputusan rollout melayakkan runtime Algorithm 2 LIVE penuh? */
export function algorithm2LiveEligible(d: Algorithm2RolloutDecision): boolean {
  return d.enabled === true && d.shadowEnabled !== true && d.emergencyLegacy !== true;
}

/** Adakah diagnostik/debug peringkat-owner dibenarkan? (owner/internal sahaja). */
export function ownerDiagnosticsAllowed(d: Algorithm2RolloutDecision): boolean {
  return d.diagnosticsAllowed === true;
}
