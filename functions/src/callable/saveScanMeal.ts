import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";
import {logEvent} from "../services/eventService";
import {dateKey} from "../utils/timeSlot";
import {idempotentSaveScanMeal} from "../domain/calorieScan/idempotentSave";
import {createFirestoreTxStore} from "../domain/calorieScan/firestoreScanStore";
import {
  ScanMealInputRaw,
  validateScanMealInput,
} from "../domain/calorieScan/scanMealValidation";

/**
 * 📸 Save a corrected Calorie Scan meal (Pro) with server-enforced idempotency.
 *
 * The client mints one stable `actionId` per scan result and reuses it across
 * retries; the server create-locks `users/{uid}/scan_saves/{actionId}` inside a
 * transaction so retries/double-taps never create a second meal, event or
 * metric. No image content is accepted or stored here.
 */
export const saveScanMeal = onCall(
  {timeoutSeconds: 30, memory: "256MiB"},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
    }
    // Calorie Scan is a Pro feature — enforce on the server.
    const userSnap = await db.collection("users").doc(uid).get();
    const plan = (userSnap.data()?.plan as string | undefined) ?? "free";
    if (plan !== "pro") {
      return {status: "PRO_REQUIRED"};
    }

    const validation = validateScanMealInput(
      (request.data ?? {}) as ScanMealInputRaw,
    );
    if (!validation.ok) {
      throw new HttpsError("invalid-argument", validation.message, {
        code: validation.code,
      });
    }
    const meal = validation.value;
    const dk = dateKey();

    const result = await idempotentSaveScanMeal(
      createFirestoreTxStore(db, FieldValue),
      {uid, meal, dateKey: dk},
    );

    // One event per successful (created) save — retries do NOT re-log.
    if (result.status === "created") {
      await logEvent({
        userId: uid,
        eventType: "meal_logged",
        plan,
        sourceScreen: "calorie_scan",
        metadata: {source: "photo_scan", mealTime: meal.mealTime},
      });
    }

    return {status: result.status, mealId: result.mealId};
  },
);
