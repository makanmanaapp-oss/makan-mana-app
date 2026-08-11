/// ISSUE 003 — Penyegerakan kanonikal ↔ medan legasi (input cadangan).
///
/// Dipanggil HANYA apabila pengguna SIMPAN (onboarding/Taste Profile).
/// Ia memastikan medan legasi yang menjadi INPUT CADANGAN sedia ada
/// (dietType, halalPreference bool, allergies rata, spicyPreference int,
/// favoriteCuisines) mencerminkan pilihan kanonikal terkini — TANPA mengubah
/// formula pemarkahan. Membaca sahaja TIDAK mengkanonikalkan (Seksyen 7).
library;

import '../../models/user_profile.dart';
import 'taste_compat.dart';

/// Segerakkan medan legasi daripada nilai kanonikal untuk simpanan.
/// Medan baharu dikekalkan; medan legasi diselaraskan supaya enjin cadangan
/// (yang membaca medan legasi) menerima nilai terkini.
UserProfile canonicalizeForSave(UserProfile p) {
  // Diet: jika ada corak kanonikal, pilih yang PERTAMA sebagai dietType
  // legasi (medan legasi ialah satu-nilai). Senarai penuh kekal dalam
  // dietaryPatternIds.
  final legacyDiet =
      p.dietaryPatternIds.isNotEmpty ? p.dietaryPatternIds.first : p.dietType;

  // Halal: hanya `halal_required` = tapis keras (bool true).
  final legacyHalal = p.halalPreferenceId == null
      ? p.halalPreference
      : legacyBoolFromCanonicalHalal(p.halalPreferenceId!);

  // Spice: peta ID kanonikal → int 0..3 (input cadangan).
  final legacySpice = p.spiceToleranceId == null
      ? p.spicyPreference
      : legacyIntFromCanonicalSpice(p.spiceToleranceId!);

  // Alahan rata (input cadangan) = ID daripada allergyEntries jika ada,
  // digabung dengan senarai rata sedia ada (dedup, kekalkan legasi).
  final flatAllergies = <String>{...p.allergies};
  for (final e in p.allergyEntries) {
    final id = e['id'];
    if (id is String && id.isNotEmpty) flatAllergies.add(id);
  }

  return p.copyWith(
    dietType: legacyDiet,
    halalPreference: legacyHalal,
    spicyPreference: legacySpice,
    allergies: flatAllergies.toList(),
  );
}

/// Muatkan/kanonikalkan nilai legasi pada MASA BACA untuk paparan sahaja
/// (TIDAK menulis semula Firestore). Pulangkan objek dengan medan kanonikal
/// terisi daripada legasi apabila kosong — supaya UI Taste Profile boleh
/// tunjuk nilai lama pengguna sedia ada.
UserProfile hydrateCanonicalFromLegacy(UserProfile p) {
  return p.copyWith(
    primaryFoodGoal: p.primaryFoodGoal,
    halalPreferenceId: p.halalPreferenceId ??
        canonicalHalalIdFromLegacyBool(p.halalPreference),
    dietaryPatternIds: p.dietaryPatternIds.isNotEmpty
        ? p.dietaryPatternIds
        : [canonicalDietId(p.dietType)],
    spiceToleranceId: p.spiceToleranceId ??
        canonicalSpiceIdFromLegacyInt(p.spicyPreference),
    // Cuisine kegemaran legasi kekal sebagai favouriteCuisines; explore/avoid
    // hanya daripada medan baharu (tiada legasi setara).
  );
}
