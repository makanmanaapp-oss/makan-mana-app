import {onSchedule} from "firebase-functions/v2/scheduler";

import {db, FieldValue} from "../config/firebase";
import {dateKey, malaysiaNow} from "../utils/timeSlot";

/**
 * Metrik AI Brain harian (jam 3 pagi waktu Malaysia):
 * baca events 24 jam lepas -> brain_metrics/{yyyyMMdd}.
 */
export const updateBrainMetrics = onSchedule(
  {schedule: "every day 03:00", timeZone: "Asia/Kuala_Lumpur"},
  async () => {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const snap = await db
      .collection("events")
      .where("timestamp", ">=", since)
      .get();

    let accepts = 0;
    let rejects = 0;
    let shown = 0;
    const acceptByTimeSlot: Record<string, number> = {};
    const shownByTimeSlot: Record<string, number> = {};
    const rejectionReasons: Record<string, number> = {};

    for (const doc of snap.docs) {
      const d = doc.data();
      const slot = (d.timeSlot as string) ?? "unknown";
      // Prompt 8: terima nama lama (accept/reject) DAN kanonik baharu
      // (suggestion_accept/suggestion_reject) untuk keserasian peralihan.
      switch (d.eventType) {
        case "accept":
        case "suggestion_accept":
          accepts++;
          acceptByTimeSlot[slot] = (acceptByTimeSlot[slot] ?? 0) + 1;
          break;
        case "reject":
        case "suggestion_reject": {
          rejects++;
          const reason =
            ((d.metadata as Record<string, unknown>)?.reason as string) ??
            "unknown";
          rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
          break;
        }
        case "suggestion_shown":
          shown++;
          shownByTimeSlot[slot] = (shownByTimeSlot[slot] ?? 0) + 1;
          break;
      }
    }

    const acceptRateByTimeSlot: Record<string, number> = {};
    for (const slot of Object.keys(shownByTimeSlot)) {
      acceptRateByTimeSlot[slot] =
        shownByTimeSlot[slot] > 0 ?
          (acceptByTimeSlot[slot] ?? 0) / shownByTimeSlot[slot] :
          0;
    }
    const topRejectionReasons = Object.entries(rejectionReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({reason, count}));

    await db.collection("brain_metrics").doc(dateKey(malaysiaNow())).set({
      acceptRateGlobal: shown > 0 ? accepts / shown : 0,
      totalShown: shown,
      totalAccepts: accepts,
      totalRejects: rejects,
      acceptRateByTimeSlot,
      topRejectionReasons,
      computedAt: FieldValue.serverTimestamp(),
    });
    console.log(
      `brain_metrics siap: shown=${shown} accept=${accepts} reject=${rejects}`,
    );
  },
);
