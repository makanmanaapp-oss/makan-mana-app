/**
 * Phase 2.15A — Calorie Scan meal validation (pure, testable).
 *
 * Bounds + shape validation for a corrected Calorie Scan meal BEFORE it is
 * saved. No Firestore, no image, no side effects. Macros may be `null`
 * ("not estimated") and MUST NOT be silently coerced to zero for storage.
 */

/** Reasonable upper bounds for a single logged meal (reject beyond these). */
export const SCAN_MEAL_BOUNDS = {
  /** kcal — a single meal above this is almost certainly a typo/overflow. */
  caloriesMax: 20000,
  /** grams — per macro. */
  macroMaxG: 2000,
  /** characters — detected/edited meal name. */
  nameMaxLen: 120,
} as const;

/**
 * Safe actionId: 8–128 chars, only [A-Za-z0-9_-]. No slash / dot / whitespace /
 * control / Unicode — cannot be abused as a path segment. The client mints
 * `${microsecondsSinceEpoch}_scan`, which matches this pattern.
 */
export const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export const ALLOWED_MEAL_TIMES = [
  "breakfast",
  "lunch",
  "dinner",
  "supper",
  "snack",
] as const;

/** Provenance for each macro / calorie figure. */
export type EstimateSource = "model" | "fallback" | "user" | "not_estimated";

export interface ScanMealInputRaw {
  actionId?: unknown;
  menuName?: unknown;
  servingDesc?: unknown;
  calories?: unknown;
  protein?: unknown;
  carbs?: unknown;
  fat?: unknown;
  isHealthy?: unknown;
  mealTime?: unknown;
  /** Provenance recorded for transparency; not trusted for safety. */
  calorieSource?: unknown;
  macroSource?: unknown;
}

export interface ScanMealValue {
  actionId: string;
  menuName: string;
  servingDesc: string | null;
  calories: number;
  /** null = not estimated (NOT zero). Stored as null; metric increment 0. */
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  isHealthy: boolean;
  mealTime: string;
  calorieSource: EstimateSource;
  macroSource: EstimateSource;
}

export type ValidationResult =
  | {ok: true; value: ScanMealValue}
  | {ok: false; code: string; message: string};

function fail(code: string, message: string): ValidationResult {
  return {ok: false, code, message};
}

/** A finite, non-negative, in-bound integer — or a validation failure. */
function validateAmount(
  raw: unknown,
  field: string,
  max: number,
  optional: boolean,
): {ok: true; value: number | null} | {ok: false; code: string; message: string} {
  if (raw === null || raw === undefined || raw === "") {
    if (optional) return {ok: true, value: null};
    return {ok: false, code: `${field}_required`, message: `${field} required`};
  }
  // Reject malformed numeric strings / booleans / objects.
  if (typeof raw !== "number") {
    return {ok: false, code: `${field}_invalid`, message: `${field} must be a number`};
  }
  if (!Number.isFinite(raw)) {
    return {ok: false, code: `${field}_invalid`, message: `${field} is NaN/Infinity`};
  }
  if (raw < 0) {
    return {ok: false, code: `${field}_negative`, message: `${field} cannot be negative`};
  }
  if (raw > max) {
    return {ok: false, code: `${field}_overflow`, message: `${field} exceeds ${max}`};
  }
  return {ok: true, value: Math.round(raw)};
}

function normSource(raw: unknown, fallback: EstimateSource): EstimateSource {
  return raw === "model" || raw === "fallback" || raw === "user" || raw === "not_estimated" ?
    raw :
    fallback;
}

/**
 * Validate a corrected Calorie Scan meal payload. Rejects negative / NaN /
 * Infinity / overflow / malformed numbers and empty meal name. Missing macros
 * stay `null` ("not estimated"), never coerced to zero.
 */
export function validateScanMealInput(raw: ScanMealInputRaw): ValidationResult {
  // actionId is NOT trimmed: whitespace/control chars must fail, not be cleaned.
  const actionId = typeof raw.actionId === "string" ? raw.actionId : "";
  if (!ACTION_ID_PATTERN.test(actionId)) {
    return fail(
      "actionId_invalid",
      "actionId must match ^[A-Za-z0-9_-]{8,128}$",
    );
  }

  const menuName = typeof raw.menuName === "string" ? raw.menuName.trim() : "";
  if (menuName.length === 0) {
    return fail("name_required", "Meal name required");
  }
  if (menuName.length > SCAN_MEAL_BOUNDS.nameMaxLen) {
    return fail("name_too_long", `Meal name exceeds ${SCAN_MEAL_BOUNDS.nameMaxLen}`);
  }

  const cal = validateAmount(raw.calories, "calories", SCAN_MEAL_BOUNDS.caloriesMax, false);
  if (!cal.ok) return cal;
  if (cal.value === null || cal.value <= 0) {
    return fail("calories_required", "calories must be greater than 0");
  }

  const p = validateAmount(raw.protein, "protein", SCAN_MEAL_BOUNDS.macroMaxG, true);
  if (!p.ok) return p;
  const c = validateAmount(raw.carbs, "carbs", SCAN_MEAL_BOUNDS.macroMaxG, true);
  if (!c.ok) return c;
  const f = validateAmount(raw.fat, "fat", SCAN_MEAL_BOUNDS.macroMaxG, true);
  if (!f.ok) return f;

  const mealTimeRaw = typeof raw.mealTime === "string" ? raw.mealTime : "lunch";
  const mealTime = (ALLOWED_MEAL_TIMES as readonly string[]).includes(mealTimeRaw) ?
    mealTimeRaw :
    "lunch";

  const servingDesc = typeof raw.servingDesc === "string" && raw.servingDesc.trim().length > 0 ?
    raw.servingDesc.trim().slice(0, 120) :
    null;

  return {
    ok: true,
    value: {
      actionId,
      menuName,
      servingDesc,
      calories: cal.value,
      protein: p.value,
      carbs: c.value,
      fat: f.value,
      isHealthy: raw.isHealthy === true,
      mealTime,
      calorieSource: normSource(raw.calorieSource, "model"),
      macroSource: normSource(raw.macroSource, "model"),
    },
  };
}

/**
 * Build the meal_logs document (matches existing schema used by Weekly Report /
 * Fit Monitor). Missing macros are stored as `null` (honest), not 0.
 */
export function buildMealLogDoc(
  uid: string,
  meal: ScanMealValue,
  dateKey: string,
  now: unknown,
): Record<string, unknown> {
  return {
    userId: uid,
    date: dateKey,
    mealTime: meal.mealTime,
    source: "photo_scan",
    placeId: null,
    placeNameSnapshot: null,
    menuName: meal.menuName,
    servingDesc: meal.servingDesc,
    caloriesEstimate: meal.calories,
    proteinEstimate: meal.protein,
    carbsEstimate: meal.carbs,
    fatEstimate: meal.fat,
    calorieSource: meal.calorieSource,
    macroSource: meal.macroSource,
    isHealthy: meal.isHealthy,
    sugaryDrink: false,
    notes: null,
    createdAt: now,
  };
}

/**
 * Metric increments for fitness_metrics. Null macros contribute 0 (documented):
 * an unestimated macro must not inflate totals.
 */
export function buildMetricsIncrements(meal: ScanMealValue): {
  caloriesIn: number;
  protein: number;
  carbs: number;
  fat: number;
  mealCount: number;
  healthyMealCount: number;
} {
  return {
    caloriesIn: meal.calories,
    protein: meal.protein ?? 0,
    carbs: meal.carbs ?? 0,
    fat: meal.fat ?? 0,
    mealCount: 1,
    healthyMealCount: meal.isHealthy ? 1 : 0,
  };
}
