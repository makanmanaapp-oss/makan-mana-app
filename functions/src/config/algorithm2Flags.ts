/**
 * Algorithm 2 / Phase 2.2 — bendera server-side (lalai SELAMAT OFF untuk awam).
 *
 * Sumber: env (dipisah koma dalam ALGO2_FLAGS) — BUKAN dokumen Firestore boleh-
 * tulis-klien. Awam/global kekal tingkah laku legasi (semua OFF). Kohort
 * dalaman (owner/claims) menghidupkan ciri semasa rollout. `emergencyLegacy`
 * menang ke atas SEMUA bendera.
 */
export type Algorithm2Flag =
  | "sessionSuppression"
  | "rejectMemory"
  | "alternativeReuse"
  | "sessionRotation"
  | "expandedPool"
  | "explorePagination"
  // Phase 2.3 — pemarkahan bersatu (owner cohort ON, awam OFF).
  | "unifiedScoring"
  | "moodScoring"
  | "budgetSignals"
  | "foodMemory"
  | "fitSignals"
  | "explainability";

const ALL_FLAGS: readonly Algorithm2Flag[] = [
  "sessionSuppression", "rejectMemory", "alternativeReuse",
  "sessionRotation", "expandedPool", "explorePagination",
  "unifiedScoring", "moodScoring", "budgetSignals",
  "foodMemory", "fitSignals", "explainability",
];

/** Override kecemasan: paksa tingkah laku legasi (menang ke atas semua). */
export function emergencyLegacyActive(): boolean {
  return process.env.ALGO2_EMERGENCY_LEGACY === "true";
}

/**
 * Phase 2.3 — kecemasan KHUSUS pemarkahan: paksa legasi scoreAndRank walaupun
 * unifiedScoring dihidupkan. Menang ke atas semua bendera pemarkahan. Rollback
 * pantas tanpa menyentuh ciri sesi/pagination.
 */
export function scoringEmergencyLegacyActive(): boolean {
  return process.env.ALGO2_SCORING_EMERGENCY_LEGACY === "true";
}

/**
 * Adakah pemarkahan bersatu (v2) aktif untuk permintaan ini? Hanya bila bukan
 * mod kecemasan (am ATAU pemarkahan), kohort layak, dan bendera unifiedScoring ON.
 */
export function unifiedScoringActive(cohortEligible: boolean): boolean {
  if (scoringEmergencyLegacyActive()) return false;
  return algorithm2FlagActive("unifiedScoring", cohortEligible);
}

/** Sub-bendera pemarkahan (default ON bila unifiedScoring aktif). */
export function scoringSubFlags(cohortEligible: boolean): {
  mood: boolean; budget: boolean; foodMemory: boolean; fit: boolean; explain: boolean;
} {
  const on = unifiedScoringActive(cohortEligible);
  return {
    // Sub-bendera boleh dimatikan individu; jika env tak sebut, default = on.
    mood: on && (algorithm2FlagActive("moodScoring", cohortEligible) || !subFlagMentioned("moodScoring")),
    budget: on && (algorithm2FlagActive("budgetSignals", cohortEligible) || !subFlagMentioned("budgetSignals")),
    foodMemory: on && (algorithm2FlagActive("foodMemory", cohortEligible) || !subFlagMentioned("foodMemory")),
    fit: on && (algorithm2FlagActive("fitSignals", cohortEligible) || !subFlagMentioned("fitSignals")),
    explain: on && (algorithm2FlagActive("explainability", cohortEligible) || !subFlagMentioned("explainability")),
  };
}

/** Adakah sub-bendera disebut secara eksplisit dalam env (untuk default-ON). */
function subFlagMentioned(flag: Algorithm2Flag): boolean {
  const raw = (process.env.ALGO2_FLAGS ?? "").trim();
  if (raw === "all") return true;
  return raw.split(",").map((s) => s.trim()).includes(flag);
}

/** Set bendera yang dihidupkan melalui env (ALGO2_FLAGS="a,b" atau ALGO2_FLAGS="all"). */
function enabledFlagSet(): Set<Algorithm2Flag> {
  const raw = (process.env.ALGO2_FLAGS ?? "").trim();
  if (!raw) return new Set();
  if (raw === "all") return new Set(ALL_FLAGS);
  const wanted = raw.split(",").map((s) => s.trim());
  return new Set(ALL_FLAGS.filter((f) => wanted.includes(f)));
}

/**
 * Adakah [flag] aktif untuk permintaan ini? Hanya bila:
 *  - bukan mod kecemasan-legasi,
 *  - pemanggil ialah kohort dalaman yang layak,
 *  - bendera dihidupkan dalam env.
 * Awam (bukan kohort) SENTIASA legasi (false).
 */
export function algorithm2FlagActive(
  flag: Algorithm2Flag,
  cohortEligible: boolean,
): boolean {
  if (emergencyLegacyActive()) return false;
  if (!cohortEligible) return false;
  return enabledFlagSet().has(flag);
}

/** Ringkasan bendera (untuk diagnostik kohort, bukan awam). */
export function algorithm2FlagSummary(cohortEligible: boolean): Record<string, boolean> {
  const out: Record<string, boolean> = { emergencyLegacy: emergencyLegacyActive() };
  for (const f of ALL_FLAGS) out[f] = algorithm2FlagActive(f, cohortEligible);
  return out;
}
