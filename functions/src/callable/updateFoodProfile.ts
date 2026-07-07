import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db, FieldValue} from "../config/firebase";

interface FoodProfileInput {
  bio?: string;
  favouriteFood?: string;
  favouriteCuisine?: string;
  foodMood?: string;
  dietPreference?: string;
  budgetRange?: string;
  showDiet?: boolean;
  showBudget?: boolean;
}

/**
 * Profil makanan awam (public_profiles/{uid}) - dipaparkan kepada orang lain.
 * Kiraan (followers/following/posts) diselenggara oleh fungsi lain.
 * Diet & bajet pilihan; ditunjukkan hanya jika showDiet/showBudget true.
 * Lokasi & status kesihatan TIDAK disimpan di sini (peribadi).
 */
export const updateFoodProfile = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const input = (request.data ?? {}) as FoodProfileInput;

  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) : "";

  // Denormalisasi nama/username/gambar terkini dari users.
  const userSnap = await db.collection("users").doc(uid).get();
  const u = userSnap.data() ?? {};

  await db.collection("public_profiles").doc(uid).set(
    {
      uid,
      displayName: (u.displayName as string | undefined) || "Foodie",
      username: (u.username as string | undefined) ?? null,
      photoUrl: (u.photoUrl as string | undefined) ?? null,
      bio: str(input.bio, 160),
      favouriteFood: str(input.favouriteFood, 40),
      favouriteCuisine: str(input.favouriteCuisine, 40),
      foodMood: str(input.foodMood, 40),
      dietPreference: str(input.dietPreference, 40),
      budgetRange: str(input.budgetRange, 40),
      showDiet: input.showDiet === true,
      showBudget: input.showBudget === true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  return {status: "OK"};
});
