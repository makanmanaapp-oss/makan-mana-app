/**
 * Algorithm 2 / Phase 2.5 — Konfig rollout (server-side env, fail-closed).
 *
 * Semua env; klien TIDAK boleh pengaruh. Validasi ketat: konfig tak sah →
 * valid=false → resolver fail-closed ke legasi. Awam lalai livePercent=0.
 */
import { RolloutConfig, ROLLOUT_MODULES } from "../domain/rollout/rolloutResolver";

const ALL_ALGO2_FLAGS = [
  "sessionSuppression", "rejectMemory", "alternativeReuse", "sessionRotation",
  "expandedPool", "explorePagination", "unifiedScoring", "moodScoring",
  "budgetSignals", "foodMemory", "fitSignals", "explainability",
];

function parseFlags(): Set<string> {
  const raw = (process.env.ALGO2_FLAGS ?? "").trim();
  if (!raw) return new Set();
  if (raw === "all") return new Set(ALL_ALGO2_FLAGS);
  const wanted = raw.split(",").map((s) => s.trim());
  return new Set(ALL_ALGO2_FLAGS.filter((f) => wanted.includes(f)));
}

function parsePercent(v: string | undefined): number | null {
  if (v == null || v.trim() === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 100) return null;
  return n;
}

function parseModuleSwitches(): Record<string, boolean> {
  // ALGO2_MODULE_OFF="unifiedScoring,expandedPool" → matikan modul disenarai.
  const raw = (process.env.ALGO2_MODULE_OFF ?? "").trim();
  const off = raw ? raw.split(",").map((s) => s.trim()) : [];
  const sw: Record<string, boolean> = {};
  for (const m of ROLLOUT_MODULES) sw[m] = !off.includes(m);
  return sw;
}

/** Baca + validasi konfig rollout. Kegagalan validasi → valid=false (fail-closed). */
export function getRolloutConfig(): RolloutConfig {
  const emergencyLegacy = process.env.ALGO2_EMERGENCY_LEGACY === "true";
  const scoringEmergencyLegacy = process.env.ALGO2_SCORING_EMERGENCY_LEGACY === "true";
  const salt = (process.env.ALGO2_ROLLOUT_SALT ?? "").trim();
  const rolloutVersion = (process.env.ALGO2_ROLLOUT_VERSION ?? "r1").trim() || "r1";
  const live = parsePercent(process.env.ALGO2_ROLLOUT_LIVE_PERCENT);
  const shadow = parsePercent(process.env.ALGO2_ROLLOUT_SHADOW_PERCENT);
  const capReq = Number(process.env.ALGO2_PROVIDER_CAP_PER_REQUEST ?? "3");
  const capSess = Number(process.env.ALGO2_PROVIDER_CAP_PER_SESSION ?? "8");

  let valid = true;
  // Peratusan mesti sah.
  if (live == null || shadow == null) valid = false;
  const livePercent = live ?? 0;
  const shadowPercent = shadow ?? 0;
  // Jumlah tidak melebihi 100.
  if (livePercent + shadowPercent > 100) valid = false;
  // Peratusan > 0 memerlukan salt (penetapan stabil).
  if ((livePercent > 0 || shadowPercent > 0) && salt.length === 0) valid = false;
  // Cap kos munasabah (JANGAN naikkan melebihi lalai selamat).
  if (!Number.isFinite(capReq) || capReq < 0 || capReq > 3) valid = false;
  if (!Number.isFinite(capSess) || capSess < 0 || capSess > 8) valid = false;

  return {
    valid,
    emergencyLegacy,
    scoringEmergencyLegacy,
    livePercent,
    shadowPercent,
    salt,
    rolloutVersion,
    moduleSwitches: parseModuleSwitches(),
    enabledFlags: parseFlags(),
    providerCapPerRequest: Math.min(3, Math.max(0, capReq)),
    providerCapPerSession: Math.min(8, Math.max(0, capSess)),
  };
}
