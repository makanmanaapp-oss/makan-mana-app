/**
 * Algorithm 2 / Phase 2.5 — Resolver rollout AUTHORITATIF (tulen, fail-closed).
 *
 * Menentukan SATU keputusan rollout per permintaan tanpa mengubah logik algoritma.
 * PRINSIP: awam OFF secara lalai; klien TIDAK boleh mengaktifkan Algorithm 2;
 * kecemasan global menang ke atas SEMUA; sebarang kegagalan/konfig tak sah →
 * legasi (fail-closed). TIADA UID penuh / lokasi tepat dalam output metrik.
 */
import { createHash } from "crypto";

/** Hash deterministik (hex) atas objek kanonikal — untuk cohortId/bucket/decisionHash. */
function hashCanonical(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const canon = keys.map((k) => `${k}=${String(obj[k])}`).join("|");
  return createHash("sha256").update(canon).digest("hex");
}

export type RolloutMode =
  | "legacy"
  | "owner_internal"
  | "beta_allowlist"
  | "percentage_shadow"
  | "percentage_live"
  | "emergency_legacy";

/** Modul yang boleh dimatikan individu (kill switch). */
export const ROLLOUT_MODULES = [
  "expandedPool", "explorePagination", "sessionSuppression", "rejectMemory",
  "alternativeReuse", "sessionRotation", "unifiedScoring", "explainability",
  "aiBrainHydration", "mealPlanUnified",
] as const;
export type RolloutModule = typeof ROLLOUT_MODULES[number];

export interface RolloutConfig {
  valid: boolean; // validasi konfig; false → fail-closed legasi
  emergencyLegacy: boolean; // ALGO2_EMERGENCY_LEGACY (menang atas semua)
  scoringEmergencyLegacy: boolean;
  livePercent: number; // 0..100 (lalai 0 — TIADA awam live)
  shadowPercent: number; // 0..100 (sampel shadow)
  salt: string; // ALGO2_ROLLOUT_SALT (mesti ada)
  rolloutVersion: string;
  /** Kill switch per-modul (true=on). Modul tak disenarai = on. */
  moduleSwitches: Record<string, boolean>;
  /** Bendera modul dihidupkan via ALGO2_FLAGS. */
  enabledFlags: ReadonlySet<string>;
  /** Had kos (Part I). */
  providerCapPerRequest: number;
  providerCapPerSession: number;
}

export interface AllowlistMember {
  cohort?: string | null; // "beta_live" | "beta_shadow"
  enabled?: boolean;
  expiresAt?: number | null;
}

export interface RolloutInput {
  uid: string;
  isOwner: boolean; // dari custom claims / ADMIN_UIDS
  allowlistMember: AllowlistMember | null;
  now: number;
  config: RolloutConfig;
}

export interface Algorithm2RolloutDecision {
  enabled: boolean; // Algorithm 2 dipapar kepada pengguna
  mode: RolloutMode;
  cohortType: RolloutMode;
  cohortId: string; // ID anon STABIL (hash), BUKAN uid
  rolloutVersion: string;
  assignmentReason: string;
  modules: Record<RolloutModule, boolean>;
  emergencyLegacy: boolean;
  shadowEnabled: boolean;
  diagnosticsAllowed: boolean; // owner/internal sahaja
  assignedAt: number;
  decisionHash: string;
  providerCapPerRequest: number;
  providerCapPerSession: number;
}

/** ID kohort anon stabil (hash uid+salt; 10 hex). BUKAN UID penuh. */
export function cohortIdFor(uid: string, salt: string): string {
  return hashCanonical({ uid, salt, kind: "cohort" }).slice(0, 10);
}

/** Bucket stabil 0..99 dari uid+salt (penetapan deterministik). */
export function stableBucket(uid: string, salt: string): number {
  const h = hashCanonical({ uid, salt, kind: "bucket" });
  // Ambil 8 hex → integer → mod 100.
  const n = parseInt(h.slice(0, 8), 16);
  return n % 100;
}

const allModulesOff = (): Record<RolloutModule, boolean> => {
  const m = {} as Record<RolloutModule, boolean>;
  for (const k of ROLLOUT_MODULES) m[k] = false;
  return m;
};

/** Modul aktif = kill switch ON dan bendera env ada (untuk pengguna enabled). */
function resolveModules(config: RolloutConfig): Record<RolloutModule, boolean> {
  const m = {} as Record<RolloutModule, boolean>;
  for (const k of ROLLOUT_MODULES) {
    const killOn = config.moduleSwitches[k] !== false; // tak disenarai = on
    // Peta modul → bendera env (jika ada nama sepadan; jika tidak, ikut kill sahaja).
    const flagKey = MODULE_FLAG[k];
    const flagOn = flagKey ? config.enabledFlags.has(flagKey) : true;
    m[k] = killOn && flagOn;
  }
  return m;
}

/** Peta modul rollout → nama bendera ALGO2_FLAGS (jika berkaitan). */
const MODULE_FLAG: Partial<Record<RolloutModule, string>> = {
  expandedPool: "expandedPool",
  explorePagination: "explorePagination",
  sessionSuppression: "sessionSuppression",
  rejectMemory: "rejectMemory",
  alternativeReuse: "alternativeReuse",
  sessionRotation: "sessionRotation",
  unifiedScoring: "unifiedScoring",
  explainability: "explainability",
};

function decide(input: RolloutInput, mode: RolloutMode, enabled: boolean, reason: string, shadow = false): Algorithm2RolloutDecision {
  const { config, uid, now } = input;
  const emergency = config.emergencyLegacy || !config.valid;
  const modules = enabled && !emergency ? resolveModules(config) : allModulesOff();
  const cohortId = cohortIdFor(uid, config.salt || "nosalt");
  const decisionHash = hashCanonical({
    cohortId, mode, rv: config.rolloutVersion, enabled, emergency,
  }).slice(0, 16);
  return {
    enabled: enabled && !emergency,
    mode: emergency ? "emergency_legacy" : mode,
    cohortType: emergency ? "emergency_legacy" : mode,
    cohortId,
    rolloutVersion: config.rolloutVersion,
    assignmentReason: reason,
    modules,
    emergencyLegacy: emergency,
    shadowEnabled: shadow && !emergency,
    diagnosticsAllowed: input.isOwner && !emergency,
    assignedAt: now,
    decisionHash,
    providerCapPerRequest: config.providerCapPerRequest,
    providerCapPerSession: config.providerCapPerSession,
  };
}

/**
 * Resolusi rollout tunggal & deterministik. Susunan keutamaan:
 * 1. kecemasan global / konfig tak sah → legasi.
 * 2. owner/internal → Algorithm 2.
 * 3. allow-list sah → beta (live atau shadow ikut cohort).
 * 4. peratusan (deterministik bucket): live → live; shadow → shadow; else legasi.
 * Awam lalai livePercent=0 → tiada awam dapat Algorithm 2.
 */
export function resolveRollout(input: RolloutInput): Algorithm2RolloutDecision {
  const { config, isOwner, allowlistMember, now } = input;

  // 1. Fail-closed / kecemasan (menang atas semua).
  if (config.emergencyLegacy || !config.valid) {
    return decide(input, "emergency_legacy", false, config.valid ? "emergency_legacy" : "invalid_config");
  }
  // 2. Owner/internal (klien tak boleh palsukan — isOwner dari claims/ADMIN_UIDS server).
  if (isOwner) {
    return decide(input, "owner_internal", true, "owner_internal");
  }
  // 3. Allow-list (server-managed; enabled + belum luput).
  if (allowlistMember && allowlistMember.enabled === true) {
    const notExpired = allowlistMember.expiresAt == null || allowlistMember.expiresAt > now;
    if (notExpired) {
      if (allowlistMember.cohort === "beta_shadow") {
        return decide(input, "percentage_shadow", false, "allowlist_shadow", true);
      }
      return decide(input, "beta_allowlist", true, "allowlist_live");
    }
    // Luput → legasi.
    return decide(input, "legacy", false, "allowlist_expired");
  }
  // 4. Peratusan deterministik.
  const live = Math.min(100, Math.max(0, config.livePercent));
  const shadow = Math.min(100, Math.max(0, config.shadowPercent));
  if (live > 0 || shadow > 0) {
    const bucket = stableBucket(input.uid, config.salt);
    if (bucket < live) return decide(input, "percentage_live", true, "percentage_live");
    if (bucket < live + shadow) return decide(input, "percentage_shadow", false, "percentage_shadow", true);
  }
  // Awam / lalai → legasi.
  return decide(input, "legacy", false, "public_legacy");
}
