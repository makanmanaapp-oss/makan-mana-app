import {db, FieldValue} from "../config/firebase";
import {FREE_SPIN_LIMIT_PER_DAY} from "../config/constants";
import {dateKey} from "../utils/timeSlot";

export interface DailyUsage {
  spinUsed: number;
  spinLimit: number; // -1 = tanpa had
}

function docRef(uid: string) {
  return db.collection("daily_usage").doc(`${uid}_${dateKey()}`);
}

export function spinLimitForPlan(plan: string): number {
  return plan === "free" ? FREE_SPIN_LIMIT_PER_DAY : -1;
}

export async function getTodayUsage(
  uid: string,
  plan: string,
): Promise<DailyUsage> {
  const snap = await docRef(uid).get();
  const spinUsed = (snap.data()?.spinUsed as number | undefined) ?? 0;
  return {spinUsed, spinLimit: spinLimitForPlan(plan)};
}

export async function incrementSpin(uid: string, plan: string): Promise<void> {
  await docRef(uid).set(
    {
      userId: uid,
      date: dateKey(),
      plan,
      spinLimit: spinLimitForPlan(plan),
      spinUsed: FieldValue.increment(1),
      lastSpinAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
}

export async function incrementPaywallShown(uid: string): Promise<void> {
  await docRef(uid).set(
    {
      userId: uid,
      date: dateKey(),
      paywallShownCount: FieldValue.increment(1),
    },
    {merge: true},
  );
}
