/**
 * Algorithm 2 — kontrak kelayakan BERSATU (tulen, boleh diuji).
 *
 * SATU sumber kebenaran untuk "adakah permintaan ini menerima runtime Algorithm 2
 * LIVE penuh" — digunakan oleh getSuggestions (melalui formula `algorithm2LiveEligible`)
 * DAN nextSuggestion / operasi sesi (session alternative reuse, reject-memory,
 * suppression, session rotation) melalui `resolveAlgorithm2EligibilityForRequest`.
 *
 * PRINSIP:
 *  - Formula kelayakan TIDAK diduplikasi: ia hanya `algorithm2LiveEligible(decision)`
 *    (owner_internal + beta_allowlist + percentage_live; BUKAN shadow/legacy/emergency).
 *  - Identiti permintaan yang SAMA mesti menghasilkan keputusan yang SAMA dalam semua
 *    fungsi (kedua-dua guna resolver rollout `resolveRolloutForRequest`).
 *  - emergencyLegacy MENANG ke atas semua (dikendali oleh resolver → decision).
 *  - Kelayakan Algorithm 2 BUKAN kepercayaan admin: ini TIDAK menggantikan
 *    `isTrustedOwner` untuk tulisan kanonikal/admin/migrasi yang berpagar-pemilik.
 *  - Output privasi-selamat: cohortId anon (BUKAN uid), reasonCode, mode.
 */
import { Algorithm2RolloutDecision, RolloutMode } from "./rolloutResolver";
import { algorithm2LiveEligible } from "./liveEligibility";

export interface Algorithm2Eligibility {
  /** Runtime Algorithm 2 LIVE penuh (session alternatives, reject/next, suppression). */
  eligible: boolean;
  mode: RolloutMode;
  /** ID kohort anon STABIL (hash), BUKAN uid. */
  cohortId: string;
  emergencyLegacy: boolean;
  shadowEnabled: boolean;
  /** Diagnostik peringkat-owner (owner/internal sahaja). */
  diagnosticsAllowed: boolean;
  /** Sebab penetapan (owner_internal / allowlist_live / public_legacy / ...). */
  reasonCode: string;
  rolloutVersion: string;
  decisionHash: string;
}

/**
 * Petakan satu keputusan rollout AUTHORITATIF → kelayakan Algorithm 2 berstruktur.
 * TULEN: tiada I/O. Formula kelayakan = `algorithm2LiveEligible` (tidak diduplikasi).
 */
export function resolveAlgorithm2Eligibility(
  decision: Algorithm2RolloutDecision,
): Algorithm2Eligibility {
  return {
    eligible: algorithm2LiveEligible(decision),
    mode: decision.mode,
    cohortId: decision.cohortId,
    emergencyLegacy: decision.emergencyLegacy,
    shadowEnabled: decision.shadowEnabled,
    diagnosticsAllowed: decision.diagnosticsAllowed,
    reasonCode: decision.assignmentReason,
    rolloutVersion: decision.rolloutVersion,
    decisionHash: decision.decisionHash,
  };
}
