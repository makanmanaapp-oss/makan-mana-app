/**
 * B5 — how a nightly repair catches up after it did not run.
 *
 * THE GAP THIS CLOSES. `reconcileCmsAnalyticsDaily` repaired yesterday and
 * today. If one night's invocation never happened, the next night's "yesterday"
 * is a different day, so the skipped day was never repaired again — the drift it
 * held stayed forever, silently.
 *
 * WHY RETRY IS NOT THE ANSWER. Cloud Scheduler retries are explicitly
 * configured on the job as well, but they only help while the run is still
 * being attempted. A night that never fired, or that exhausted its retries,
 * leaves nothing behind to retry.
 *
 * WHY A QUEUE IS NOT THE ANSWER EITHER. A persisted list of failed days can
 * only be written by something that ran. An invocation that never happened
 * enqueues nothing, so a queue cannot survive the case this exists for.
 *
 * WHAT THIS DOES INSTEAD. Each run looks back a BOUNDED number of Malaysia days
 * and repairs any day that is not yet settled. "Settled" is not "we ran once":
 * a day is settled only when a receipt says a repair COMPLETED after that day
 * had closed, so a run during the day never settles it, and a run that truncated
 * or deferred writes no receipt at all.
 *
 * COST. A healthy night reads `RECOVERY_LOOKBACK_DAYS` tiny receipt documents
 * and then reconciles exactly the same two days it always did — today, which can
 * never be settled while it is still open, and yesterday, which this run is the
 * first to see closed. Older days are skipped on a single-document read each.
 * After an outage of k nights, the next run additionally reconciles those k days,
 * bounded by the horizon.
 *
 * BEYOND THE HORIZON. An outage longer than the horizon cannot be repaired
 * automatically, and this refuses to pretend otherwise: the oldest day in the
 * window being unsettled is reported so an operator can run the documented
 * manual repair. Widening the window silently would mean unbounded scans.
 */
import {businessDayKey, businessDayStartMs} from "../analytics/analyticsAggregation";

/**
 * How many Malaysia days back a run may repair, inclusive of today.
 *
 * Seven is a week of tolerated outage. It is a deliberate ceiling: every extra
 * day is an extra day-scan whenever it is unsettled, and an unbounded lookback
 * would turn one bad week into a full-history rescan.
 */
export const RECOVERY_LOOKBACK_DAYS = 7;

/** Where a completed repair records that a day is done. */
export const RECONCILE_RECEIPT_COLLECTION = "cms_analytics_reconcile_receipts";

const DAY_MS = 86_400_000;

/** Receipt id. Scope-prefixed so the aggregate and the mirror never overwrite each other. */
export function reconcileReceiptId(scope: "aggregate" | "mirror", dayKey: string): string {
  return `${scope}__${dayKey}`;
}

/** The instant a Malaysia business day stops accepting new events. */
export function businessDayEndMs(dayKey: string): number {
  return businessDayStartMs(dayKey) + DAY_MS;
}

/** Today first, then backwards. Bounded by `lookbackDays`. */
export function recoveryDayKeys(
  nowMs: number,
  lookbackDays: number = RECOVERY_LOOKBACK_DAYS,
): string[] {
  const days: string[] = [];
  for (let i = 0; i < Math.max(1, lookbackDays); i += 1) {
    days.push(businessDayKey(nowMs - i * DAY_MS));
  }
  return days;
}

export interface RecoveryPlan {
  /** Days to reconcile now, oldest first so a repair never runs ahead of an older gap. */
  due: string[];
  /** Days a completed repair has already settled. */
  settled: string[];
  /**
   * True when the OLDEST day in the window is still unsettled, which means the
   * outage is at least as long as the horizon and days beyond it — which this
   * job will never look at — may also be unrepaired.
   */
  beyondHorizon: boolean;
}

/**
 * Decide what tonight has to do.
 *
 * `receiptCompletedAtMs` is the receipt for that day, or null when there is
 * none. A receipt only settles a day if it was written AFTER the day closed;
 * otherwise the run saw an incomplete day and its figures say nothing about the
 * hours that followed.
 */
export function planRecovery(params: {
  nowMs: number;
  receiptCompletedAtMs: (dayKey: string) => number | null;
  lookbackDays?: number;
}): RecoveryPlan {
  const days = recoveryDayKeys(params.nowMs, params.lookbackDays ?? RECOVERY_LOOKBACK_DAYS);
  const due: string[] = [];
  const settled: string[] = [];

  for (const dayKey of days) {
    const completedAtMs = params.receiptCompletedAtMs(dayKey);
    if (completedAtMs !== null && completedAtMs > businessDayEndMs(dayKey)) {
      settled.push(dayKey);
    } else {
      due.push(dayKey);
    }
  }

  const oldest = days[days.length - 1];
  return {
    // Oldest first: if the run dies part way through, the days least likely to
    // be picked up again are the ones already done.
    due: due.slice().reverse(),
    settled,
    beyondHorizon: due.includes(oldest) && days.length > 1,
  };
}

/**
 * Should the mirror re-push a day it has already pushed?
 *
 * Yes when the aggregate was repaired after the mirror last pushed: the mirror
 * is then holding figures the repair has since replaced. This is what keeps the
 * two recoveries coordinated instead of each declaring its own day done.
 */
export function mirrorNeedsRepush(params: {
  dayKey: string;
  mirrorCompletedAtMs: number | null;
  aggregateCompletedAtMs: number | null;
}): boolean {
  const {dayKey, mirrorCompletedAtMs, aggregateCompletedAtMs} = params;
  if (mirrorCompletedAtMs === null) return true;
  if (mirrorCompletedAtMs <= businessDayEndMs(dayKey)) return true;
  if (aggregateCompletedAtMs === null) return false;
  return aggregateCompletedAtMs > mirrorCompletedAtMs;
}
