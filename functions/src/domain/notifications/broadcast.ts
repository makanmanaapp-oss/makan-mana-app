/**
 * PROMPT 7 — production broadcast fanout (pure logic).
 *
 * The fanout engine is Firestore-run-driven: an immutable
 * `notification_broadcast_runs/{runId}` doc carries the approved snapshot +
 * cursor + aggregate metrics. A scheduled worker claims a due run atomically,
 * resolves its audience in bounded pages, fans each recipient through the SAME
 * Notification V2 engine (notifySafely), advances the cursor, and completes.
 * Every recipient is exactly-once per campaign VERSION via createNotification's
 * (type, recipientUid, sourceEventId) dedup. This module holds only the pure,
 * unit-tested decisions; all I/O lives in scheduled/notificationBroadcast.ts.
 */
import {AdminBroadcastType, isAdminBroadcastType} from "./adminNotifications";

// ── run state machine ───────────────────────────────────────────────────────
export const BROADCAST_RUN_STATUSES = [
  "queued", "delivering", "completed", "failed", "cancelled",
] as const;
export type BroadcastRunStatus = (typeof BROADCAST_RUN_STATUSES)[number];

/** A run may be claimed only from queued (→delivering). delivering continues. */
export function isClaimable(status: BroadcastRunStatus): boolean {
  return status === "queued";
}
export function isActive(status: BroadcastRunStatus): boolean {
  return status === "queued" || status === "delivering";
}

/** Exactly-once identity: one canonical record per recipient per campaign VERSION.
 * A stale/edited version (v+1) yields a different id, so it never inherits an
 * older approval's delivery. */
export function broadcastSourceEventId(campaignId: string, version: number): string {
  return `admin_broadcast:${campaignId}:v${version}`;
}

// ── delivery gating (independent of the global production flags) ─────────────
export type DeliveryPurpose = "qa" | "production";

export interface BroadcastGate {
  productionEnabled: boolean; // NOTIFICATION_BROADCAST_DELIVERY_ENABLED
  qaEnabled: boolean;         // NOTIFICATION_BROADCAST_QA_ENABLED
}

/**
 * A run may deliver only when its purpose's narrow gate is on. A QA run is
 * additionally restricted to the QA audience so it can never reach normal users
 * even if mis-seeded. Neither gate is the global production/external flag.
 */
export function canDeliverRun(
  purpose: DeliveryPurpose,
  audienceId: string,
  gate: BroadcastGate,
): {allowed: boolean; reason: string} {
  if (purpose === "qa") {
    if (!gate.qaEnabled) return {allowed: false, reason: "qa_gate_off"};
    if (audienceId !== "test_recipients") return {allowed: false, reason: "qa_audience_must_be_test_recipients"};
    return {allowed: true, reason: "qa"};
  }
  if (!gate.productionEnabled) return {allowed: false, reason: "production_gate_off"};
  return {allowed: true, reason: "production"};
}

// ── admin type / critical safety (mirrors the bridge allowlist) ──────────────
export function isBroadcastableType(type: unknown): type is AdminBroadcastType {
  return isAdminBroadcastType(type);
}

// ── audience classes ─────────────────────────────────────────────────────────
export const BROADCAST_AUDIENCES = [
  "test_recipients", "all_eligible_users",
  "locale_bm", "locale_en", "locale_zh", "locale_ta",
  "plan_free", "plan_plus", "plan_pro", "app_version",
] as const;
export type BroadcastAudienceId = (typeof BROADCAST_AUDIENCES)[number];

export function isBroadcastAudience(v: unknown): v is BroadcastAudienceId {
  return typeof v === "string" && (BROADCAST_AUDIENCES as readonly string[]).includes(v);
}

/** Map an audience id → a recipient-local predicate on a user doc. Returns null
 * for audiences whose authoritative source is not yet available (UI shows
 * "Not Available"; the worker refuses rather than guessing). */
export type UserFacts = {
  language?: string | null;
  plan?: string | null;        // authoritative entitlement, when present
  appVersion?: string | null;
  deletedAt?: unknown;
  disabled?: boolean;
};

export function audienceMatches(
  audienceId: BroadcastAudienceId,
  user: UserFacts,
  opts: {appVersionMin?: string | null} = {},
): boolean | null {
  if (user.deletedAt || user.disabled === true) return false; // never target terminal accounts
  const lang = (user.language ?? "").toLowerCase().slice(0, 2);
  switch (audienceId) {
    case "test_recipients": return true; // membership enforced by the allowlist source
    case "all_eligible_users": return true;
    case "locale_bm": return lang === "ms" || lang === "bm";
    case "locale_en": return lang === "en";
    case "locale_zh": return lang === "zh";
    case "locale_ta": return lang === "ta";
    case "plan_free": return user.plan == null ? null : user.plan === "free";
    case "plan_plus": return user.plan == null ? null : user.plan === "plus";
    case "plan_pro": return user.plan == null ? null : user.plan === "pro";
    case "app_version": {
      if (!opts.appVersionMin || !user.appVersion) return null;
      return compareVersions(user.appVersion, opts.appVersionMin) >= 0;
    }
    default: return null;
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

// ── failure classification (retry vs terminal) ───────────────────────────────
export type FailureClass = "transient" | "terminal";
const TERMINAL_PATTERNS = [
  /recipient_ineligible/i, /not[\s_-]?found/i, /deleted/i, /disabled/i,
  /forbidden_admin_type/i, /invalid/i, /cancelled/i,
];
export function classifyFailure(errorMessage: string): FailureClass {
  return TERMINAL_PATTERNS.some((re) => re.test(errorMessage)) ? "terminal" : "transient";
}

// ── metric aggregation ───────────────────────────────────────────────────────
export interface BroadcastMetrics {
  processed: number;
  canonicalCreated: number;
  duplicateSkipped: number;
  inAppHidden: number;
  pushSent: number;
  pushSuppressedPreference: number;
  pushSuppressedQuietHours: number;
  pushNotApplicable: number;
  pushFailed: number;
  recipientFailed: number;
}

export function emptyMetrics(): BroadcastMetrics {
  return {
    processed: 0, canonicalCreated: 0, duplicateSkipped: 0, inAppHidden: 0,
    pushSent: 0, pushSuppressedPreference: 0, pushSuppressedQuietHours: 0,
    pushNotApplicable: 0, pushFailed: 0, recipientFailed: 0,
  };
}

/** Fold one recipient outcome into the running metrics (pure, order-free). */
export function foldOutcome(m: BroadcastMetrics, o: {
  recordStatus: "created" | "duplicate" | "suppressed_preference" | "suppressed_self" | "failed";
  inAppVisible?: boolean;
  push?: {sent: number; reason: string};
}): BroadcastMetrics {
  const n = {...m, processed: m.processed + 1};
  if (o.recordStatus === "created") {
    n.canonicalCreated += 1;
    if (o.inAppVisible === false) n.inAppHidden += 1;
  } else if (o.recordStatus === "duplicate") {
    n.duplicateSkipped += 1;
  } else if (o.recordStatus === "failed") {
    n.recipientFailed += 1;
  }
  const p = o.push;
  if (p) {
    if (p.sent > 0) n.pushSent += p.sent;
    else if (p.reason === "suppressed_preference" || p.reason === "not_push_eligible_type") n.pushSuppressedPreference += 1;
    else if (p.reason === "suppressed_quiet_hours") n.pushSuppressedQuietHours += 1;
    else if (p.reason === "no_device") n.pushNotApplicable += 1;
    else if (p.reason === "delivery_error") n.pushFailed += 1;
  }
  return n;
}

/** After a page: still more to do, or the audience is exhausted → complete. */
export function nextRunState(audienceExhausted: boolean, anyRecipientFatal: boolean): BroadcastRunStatus {
  if (anyRecipientFatal) return "delivering"; // per-recipient failure never fails the run
  return audienceExhausted ? "completed" : "delivering";
}
