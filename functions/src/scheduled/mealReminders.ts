import {onSchedule} from "firebase-functions/v2/scheduler";

import {pushToTopic} from "../services/pushService";

/** Peringatan makan tengah hari (12:15 waktu Malaysia). */
export const lunchReminder = onSchedule(
  {schedule: "15 12 * * *", timeZone: "Asia/Kuala_Lumpur"},
  async () => {
    await pushToTopic(
      "meal_reminders",
      "Dah tengah hari!",
      "Nak lunch mana hari ni? Spin dan MakanMana carikan.",
    );
  },
);

/** Peringatan makan malam (19:00 waktu Malaysia). */
export const dinnerReminder = onSchedule(
  {schedule: "0 19 * * *", timeZone: "Asia/Kuala_Lumpur"},
  async () => {
    await pushToTopic(
      "meal_reminders",
      "Masa makan malam",
      "Jom cari tempat dinner yang padan dengan mood anda.",
    );
  },
);
