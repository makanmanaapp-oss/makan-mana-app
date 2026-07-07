import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db} from "../config/firebase";
import {HEALTHY_CUISINES} from "../services/scoringService";

const SPEND_BY_LEVEL: Record<number, number> = {0: 0, 1: 8, 2: 18, 3: 35, 4: 60};

interface MealRow {
  placeId: string;
  placeName: string;
  cuisine: string;
  emoji: string;
  timeSlot: string;
  priceLevel: number;
  satisfactionRating: number | null;
  mealTime: Date | null;
}

/**
 * Laporan Makan Mingguan + tips AI Food Coach (Pro).
 * Analisis 7 hari: kekerapan, belanja, cuisine, kepuasan, kesihatan,
 * corak waktu — plus tips coach berperaturan dari data sebenar pengguna.
 */
export const getWeeklyReport = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
  }
  // Penguatkuasaan Pro di pelayan (client hanya papar preview).
  const userSnap = await db.collection("users").doc(uid).get();
  const plan = (userSnap.data()?.plan as string | undefined) ?? "free";
  if (plan !== "pro") {
    return {status: "PRO_REQUIRED"};
  }

  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("meals")
    .orderBy("mealTime", "desc")
    .limit(100)
    .get();

  const meals: MealRow[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const mealTime = d.mealTime ? new Date(d.mealTime as string) : null;
    if (mealTime && mealTime < weekAgo) continue;
    meals.push({
      placeId: (d.placeId as string) ?? "",
      placeName: (d.placeNameSnapshot as string) ?? "",
      cuisine:
        ((d.cuisineTags as string[] | undefined) ?? [])[0] ?? "Lain-lain",
      emoji: (d.emoji as string) ?? "🍽️",
      timeSlot: (d.timeSlot as string) ?? "lunch",
      priceLevel: (d.priceLevel as number) ?? 1,
      satisfactionRating: (d.satisfactionRating as number | null) ?? null,
      mealTime,
    });
  }

  // Aggregat asas.
  const totalMeals = meals.length;
  const estSpend = meals.reduce(
    (sum, m) => sum + (SPEND_BY_LEVEL[m.priceLevel] ?? 15),
    0,
  );
  const cuisineCount: Record<string, number> = {};
  const slotCount: Record<string, number> = {};
  const placeCount: Record<string, {name: string; emoji: string; n: number}> =
    {};
  let healthyMeals = 0;
  let ratedCount = 0;
  let ratingTotal = 0;
  for (const m of meals) {
    cuisineCount[m.cuisine] = (cuisineCount[m.cuisine] ?? 0) + 1;
    slotCount[m.timeSlot] = (slotCount[m.timeSlot] ?? 0) + 1;
    const p = placeCount[m.placeId] ??
      {name: m.placeName, emoji: m.emoji, n: 0};
    p.n += 1;
    placeCount[m.placeId] = p;
    const c = m.cuisine.toLowerCase();
    if (HEALTHY_CUISINES.some((h) => c.includes(h))) healthyMeals++;
    if (m.satisfactionRating != null) {
      ratedCount++;
      ratingTotal += m.satisfactionRating;
    }
  }
  const topCuisines = Object.entries(cuisineCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({name, count}));
  const favoritePlace = Object.values(placeCount)
    .sort((a, b) => b.n - a.n)[0] ?? null;
  const avgSatisfaction =
    ratedCount > 0 ? Math.round((ratingTotal / ratedCount) * 10) / 10 : null;
  const healthyPct =
    totalMeals > 0 ? Math.round((healthyMeals / totalMeals) * 100) : 0;
  const variety = Object.keys(cuisineCount).length;

  // AI Food Coach: tips berperaturan dari corak sebenar.
  const dietGoal =
    ((await db.collection("user_profiles").doc(uid).get()).data()
      ?.dietGoal as string | undefined) ?? null;
  const tips: Array<{emoji: string; text: string}> = [];
  if (totalMeals === 0) {
    tips.push({
      emoji: "🍽️",
      text: "Belum ada rekod minggu ini. Spin dan terima cadangan " +
        "untuk mula membina Food Memory kau!",
    });
  } else {
    if (variety <= 2 && totalMeals >= 3) {
      tips.push({
        emoji: "🔁",
        text: `Kau makan ${topCuisines[0].name} ${topCuisines[0].count}x ` +
          "minggu ni. Cuba cuisine lain untuk variasi nutrisi.",
      });
    } else if (variety >= 4) {
      tips.push({
        emoji: "🌈",
        text: `Power! ${variety} jenis cuisine minggu ini - ` +
          "variasi kau sangat baik.",
      });
    }
    if (healthyPct < 20) {
      tips.push({
        emoji: "🥗",
        text: `Hanya ${healthyPct}% makanan sihat minggu ini. ` +
          "Cuba mood Healthy untuk pilihan lebih seimbang.",
      });
    } else if (healthyPct >= 40) {
      tips.push({
        emoji: "💪",
        text: `${healthyPct}% pilihan sihat - kekalkan momentum ni!`,
      });
    }
    if (estSpend > 150) {
      tips.push({
        emoji: "💸",
        text: `Belanja makan ~RM${estSpend} minggu ini. ` +
          "Mood Jimat boleh bantu kurangkan tanpa korbankan rasa.",
      });
    }
    if ((slotCount["supper"] ?? 0) >= 3) {
      tips.push({
        emoji: "🌙",
        text: `Supper ${slotCount["supper"]}x minggu ini - ` +
          "makan lewat malam selalu, jaga masa tidur!",
      });
    }
    if (avgSatisfaction != null && avgSatisfaction < 3.5) {
      tips.push({
        emoji: "🤔",
        text: `Purata kepuasan kau ${avgSatisfaction}/5. Cuba kawasan ` +
          "atau cuisine baru - MakanMana akan belajar dari rating kau.",
      });
    }
    if (ratedCount === 0) {
      tips.push({
        emoji: "⭐",
        text: "Tiada rating minggu ini. Rating membantu MakanMana " +
          "faham selera kau dengan lebih tepat!",
      });
    }
    if (dietGoal == null) {
      tips.push({
        emoji: "🎯",
        text: "Set Diet Goal kau (Sihat / Jimat / Seimbang) supaya " +
          "setiap cadangan menyokong matlamat kau.",
      });
    }
  }

  return {
    status: "OK",
    totalMeals,
    estSpend,
    topCuisines,
    favoritePlace,
    avgSatisfaction,
    ratedCount,
    healthyPct,
    variety,
    slotCount,
    dietGoal,
    tips: tips.slice(0, 5),
  };
});
