import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/models/user_profile.dart';
import 'package:makan_mana/features/taste/taste_profile_sync.dart';

/// ISSUE 003 Increment 2 — ujian keserasian persistence (backward-safe).
void main() {
  // ---- 1. Dokumen LAMA (tanpa medan baharu) nyah-siri selamat ----
  test('dokumen lama tanpa medan ISSUE003 nyah-siri dgn lalai selamat', () {
    final legacyDoc = {
      'uid': 'u1',
      'dietType': 'vegetarian',
      'halalPreference': true,
      'allergies': ['peanuts'],
      'budgetMin': 10,
      'budgetMax': 40,
      'favoriteCuisines': ['malay', 'thai'],
      'spicyPreference': 3,
      'usualMealTimes': ['lunch'],
    };
    final p = UserProfile.fromMap(legacyDoc);
    // Legasi kekal.
    expect(p.dietType, 'vegetarian');
    expect(p.allergies, ['peanuts']);
    expect(p.favoriteCuisines, ['malay', 'thai']);
    expect(p.spicyPreference, 3);
    // Medan baharu = lalai selamat.
    expect(p.primaryFoodGoal, isNull);
    expect(p.dietaryPatternIds, isEmpty);
    expect(p.allergyEntries, isEmpty);
    expect(p.tasteProfileVersion, 1);
  });

  // ---- 2. toMap dokumen lama TIDAK menambah medan baharu kosong ----
  test('toMap tidak menggemuk dokumen lama dgn medan baharu kosong', () {
    const p = UserProfile(uid: 'u1', dietType: 'none');
    final m = p.toMap();
    // Hanya kunci legasi hadir (tiada medan ISSUE003).
    expect(m.containsKey('primaryFoodGoal'), isFalse);
    expect(m.containsKey('dietaryPatternIds'), isFalse);
    expect(m.containsKey('allergyEntries'), isFalse);
    expect(m.containsKey('tasteProfileVersion'), isFalse);
    // Legasi sentiasa ada.
    expect(m['dietType'], 'none');
    expect(m['budgetMin'], 8);
  });

  // ---- 3. Round-trip profil BAHARU penuh ----
  test('round-trip serialisasi profil baharu kekal', () {
    final now = DateTime.parse('2026-07-17T10:00:00.000');
    final p = UserProfile(
      uid: 'u2',
      primaryFoodGoal: 'eat_healthier',
      secondaryFoodGoals: const ['save_money'],
      halalPreferenceId: 'halal_required',
      dietaryPatternIds: const ['high_protein', 'balanced'],
      allergyEntries: const [
        {'id': 'peanuts', 'severity': 'severe', 'note': 'x'},
      ],
      exploreCuisineIds: const ['korean'],
      avoidedCuisineIds: const ['western'],
      customCuisineEntries: const [
        {'id': 'custom:nasi kerabu', 'label': 'Nasi Kerabu'},
      ],
      spiceToleranceId: 'very_spicy',
      spiceCustomNote: 'ikut mood',
      tastePreferenceIds: const ['sweet', 'crispy'],
      specialMealContextIds: const ['iftar', 'post_workout'],
      customMealTimes: const [
        {'id': 'custom:brek', 'label': 'Brek pagi'}
      ],
      mealBalancePreferences: const {'healthy_light_meals': 'often'},
      repeatToleranceId: 'mostly_new',
      discoveryPreferenceId: 'adventurous',
      preferredDistanceKm: 5,
      tasteProfileVersion: 2,
      tasteProfileUpdatedAt: now,
    );
    final r = UserProfile.fromMap(p.toMap());
    expect(r.primaryFoodGoal, 'eat_healthier');
    expect(r.secondaryFoodGoals, ['save_money']);
    expect(r.halalPreferenceId, 'halal_required');
    expect(r.dietaryPatternIds, ['high_protein', 'balanced']);
    expect(r.allergyEntries.first['severity'], 'severe');
    expect(r.exploreCuisineIds, ['korean']);
    expect(r.avoidedCuisineIds, ['western']);
    expect(r.customCuisineEntries.first['label'], 'Nasi Kerabu');
    expect(r.spiceToleranceId, 'very_spicy');
    expect(r.tastePreferenceIds, ['sweet', 'crispy']);
    expect(r.specialMealContextIds, ['iftar', 'post_workout']);
    expect(r.mealBalancePreferences['healthy_light_meals'], 'often');
    expect(r.repeatToleranceId, 'mostly_new');
    expect(r.discoveryPreferenceId, 'adventurous');
    expect(r.preferredDistanceKm, 5);
    expect(r.tasteProfileVersion, 2);
    expect(r.tasteProfileUpdatedAt, now);
  });

  // ---- 4. Nilai legasi tidak dikenali DIKEKALKAN ----
  test('cuisine/diet legasi tidak dikenali dikekalkan', () {
    final p = UserProfile.fromMap({
      'uid': 'u3',
      'dietType': 'diet_pelik_lama',
      'favoriteCuisines': ['kampung_x', 'malay'],
    });
    expect(p.dietType, 'diet_pelik_lama');
    expect(p.favoriteCuisines, ['kampung_x', 'malay']);
  });

  // ---- 5. Kanonikal → legasi (input cadangan) diselaraskan pada SIMPAN ----
  test('canonicalizeForSave selaraskan medan legasi input cadangan', () {
    final p = UserProfile(
      uid: 'u4',
      dietType: 'none',
      halalPreference: true,
      spicyPreference: 2,
      allergies: const ['dairy'],
      dietaryPatternIds: const ['vegan'],
      halalPreferenceId: 'no_halal_filter',
      spiceToleranceId: 'extreme',
      allergyEntries: const [
        {'id': 'peanuts', 'severity': 'mild'},
      ],
    );
    final s = canonicalizeForSave(p);
    expect(s.dietType, 'vegan'); // legasi ikut corak pertama
    expect(s.halalPreference, isFalse); // no_halal_filter → bool false
    expect(s.spicyPreference, 3); // extreme → 3
    expect(s.allergies, containsAll(['dairy', 'peanuts'])); // gabung dedup
    // Medan baharu kekal.
    expect(s.dietaryPatternIds, ['vegan']);
    expect(s.spiceToleranceId, 'extreme');
  });

  // ---- 6. Hydrate kanonikal daripada legasi pada BACA (paparan sahaja) ----
  test('hydrateCanonicalFromLegacy isi kanonikal utk pengguna lama', () {
    const legacy = UserProfile(
      uid: 'u5',
      dietType: 'vegetarian',
      halalPreference: true,
      spicyPreference: 1,
    );
    final h = hydrateCanonicalFromLegacy(legacy);
    expect(h.halalPreferenceId, 'halal_required');
    expect(h.dietaryPatternIds, ['vegetarian']);
    expect(h.spiceToleranceId, 'mild');
    // Tidak menyentuh nilai legasi asal.
    expect(h.dietType, 'vegetarian');
    expect(h.spicyPreference, 1);
  });

  // ---- 7. Label terjemah TIDAK PERNAH disimpan sebagai ID ----
  test('nilai disimpan ialah ID stabil, bukan label', () {
    final p = UserProfile(uid: 'u6', dietaryPatternIds: const ['vegan']);
    final m = p.toMap();
    expect(m['dietaryPatternIds'], ['vegan']); // ID, bukan "Vegan"/"纯素"
  });

  // ---- 8. copyWith mengekalkan medan tak berubah ----
  test('copyWith mengekalkan medan lain', () {
    final p = UserProfile(
        uid: 'u7',
        primaryFoodGoal: 'save_money',
        dietaryPatternIds: const ['keto']);
    final c = p.copyWith(discoveryPreferenceId: 'surprise_me');
    expect(c.primaryFoodGoal, 'save_money');
    expect(c.dietaryPatternIds, ['keto']);
    expect(c.discoveryPreferenceId, 'surprise_me');
  });
}
