/** Slot waktu makan - mesti sepadan dengan TimeSlotUtils di Flutter. */
export function timeSlotForHour(hour: number): string {
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 18) return "tea";
  if (hour >= 18 && hour < 22) return "dinner";
  return "supper";
}

/** Waktu Malaysia (UTC+8) tanpa bergantung pada zon waktu pelayan. */
export function malaysiaNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
}

export function currentTimeSlot(): string {
  return timeSlotForHour(malaysiaNow().getHours());
}

/** Kunci dokumen daily_usage: uid_yyyyMMdd (tarikh Malaysia). */
export function dateKey(date: Date = malaysiaNow()): string {
  const y = date.getFullYear().toString().padStart(4, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}${m}${d}`;
}
