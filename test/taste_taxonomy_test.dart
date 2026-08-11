import 'package:flutter_test/flutter_test.dart';

import 'package:flutter/widgets.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/features/taste/taste_taxonomy.dart';
import 'package:makan_mana/features/taste/taste_compat.dart';

/// ISSUE 003 — ujian foundation taksonomi citarasa (pure, tanpa Firebase).
void main() {
  // ---- Kunci UI onboarding ISSUE 003 wujud & diterjemah 4 bahasa ----
  test('kunci UI onboarding ISSUE 003 resolve 4 bahasa (bukan nama kunci)', () {
    const uiKeys = [
      'onbGoal', 'onbGoalSub', 'onbHalalDiet', 'onbAllergyStep',
      'onbCuisineStep', 'onbSpiceTaste', 'onbTimesContexts', 'onbBudgetDist',
      'onbRepeatDisc', 'onbSummary', 'onbFav', 'onbExplore', 'onbAvoid',
      'onbUsualTimes', 'onbSpecialContexts', 'onbDistance', 'onbBalance',
      'onbRepeatTol', 'onbDiscovery', 'onbTastePrefs', 'dietConflictTitle',
      'dietConflictBody', 'keepNew', 'keepExisting', 'noKnownAllergyTitle',
      'noKnownAllergyBody', 'tasteSelected', 'saveProfile', 'tasteSaved',
    ];
    for (final lang in ['ms', 'en', 'zh', 'ta']) {
      final l = AppLocalizations(Locale(lang));
      for (final k in uiKeys) {
        final v = l.t(k);
        expect(v, isNot(k), reason: '$lang $k tidak diterjemah');
        expect(v.trim().isNotEmpty, isTrue, reason: '$lang $k kosong');
      }
    }
  });

  // ---- Penafian keselamatan wujud 4 bahasa ----
  test('penafian alahan & diet wujud 4 bahasa', () {
    for (final lang in ['ms', 'en', 'zh', 'ta']) {
      expect(kAllergyDisclaimer[lang]?.trim().isNotEmpty, isTrue);
      expect(kDietDisclaimer[lang]?.trim().isNotEmpty, isTrue);
    }
    // Tiada jaminan keselamatan mutlak.
    expect(kAllergyDisclaimer['en']!.toLowerCase(), contains('cannot guarantee'));
  });

  // ---- Keunikan ID dalam setiap senarai ----
  test('setiap senarai taksonomi ada ID unik', () {
    kAllTasteLists.forEach((name, list) {
      final ids = list.map((o) => o.id).toList();
      expect(ids.toSet().length, ids.length,
          reason: 'ID pendua dalam $name: $ids');
    });
    // Cuisine (berkategori) juga unik merentas semua kategori.
    final cuisineIds = kAllCuisines.map((o) => o.id).toList();
    expect(cuisineIds.toSet().length, cuisineIds.length,
        reason: 'ID cuisine pendua: $cuisineIds');
  });

  // ---- Parity 4-bahasa: tiada label kosong, tiada guna ID sbg label ----
  test('setiap opsyen ada label 4 bahasa tidak kosong & bukan ID', () {
    final all = [...kAllTasteLists.values.expand((e) => e), ...kAllCuisines];
    for (final o in all) {
      for (final lang in ['ms', 'en', 'zh', 'ta']) {
        final label = o.label(lang);
        expect(label.trim().isNotEmpty, isTrue,
            reason: '${o.id} label $lang kosong');
        expect(label, isNot(o.id),
            reason: '${o.id} label $lang guna ID sebagai teks');
      }
    }
  });

  // ---- zh & ta BUKAN salinan English (elak placeholder) untuk teks CJK/Tamil.
  test('zh/ta bukan salinan English untuk label bukan-nombor', () {
    final all = [...kAllTasteLists.values.expand((e) => e), ...kAllCuisines];
    // Kecualikan label yang memang guna angka/RM/km (contoh: "RM10–RM15").
    final numeric = RegExp(r'RM|km|KM|[0-9]');
    for (final o in all) {
      if (numeric.hasMatch(o.en)) continue;
      expect(o.zh, isNot(o.en), reason: '${o.id} zh masih English');
      expect(o.ta, isNot(o.en), reason: '${o.id} ta masih English');
    }
  });

  // ---- Kiraan stabil (spec) ----
  test('kiraan senarai kanonikal kekal seperti dijangka', () {
    expect(kDietPatterns.length, 20);
    expect(kHalalOptions.length, 3);
    expect(kSpiceLevels.length, 9);
    expect(kMealTimes.length, 8);
    expect(kMealContexts.length, 13);
    expect(kTastePreferences.length, 11);
    expect(kFoodGoals.length, 11);
    expect(kFrequencyLevels.length, 4);
    expect(kRepeatTolerance.length, 4);
    expect(kDiscoveryLevels.length, 4);
    // Alahan: 15 biasa + 10 tempatan + 2 lain.
    expect(kAllergensCommon.length, 15);
    expect(kAllergensLocal.length, 10);
    expect(kAllergensOther.length, 2);
  });

  // ---- LEGASI: diet ----
  test('legasi diet Melayu & English memetakan ke ID kanonikal', () {
    expect(canonicalDietId('none'), 'omnivore');
    expect(canonicalDietId('Makan semua'), 'omnivore');
    expect(canonicalDietId('Everything'), 'omnivore');
    expect(canonicalDietId('vegetarian'), 'vegetarian');
    expect(canonicalDietId('vegan'), 'vegan');
    expect(canonicalDietId('pescatarian'), 'pescatarian');
    expect(canonicalDietId('keto'), 'keto');
  });

  test('legasi diet tidak dikenali DIKEKALKAN (tidak dibuang)', () {
    expect(canonicalDietId('nasi_lemak_only'), 'nasi_lemak_only');
    expect(canonicalDietId(''), 'omnivore');
    expect(canonicalDietId(null), 'omnivore');
  });

  // ---- LEGASI: spice int 0..3 ----
  test('legasi spice int memetakan dua hala tanpa merosakkan', () {
    expect(canonicalSpiceIdFromLegacyInt(0), 'none');
    expect(canonicalSpiceIdFromLegacyInt(1), 'mild');
    expect(canonicalSpiceIdFromLegacyInt(2), 'medium');
    expect(canonicalSpiceIdFromLegacyInt(3), 'spicy');
    expect(canonicalSpiceIdFromLegacyInt(null), 'medium');
    // Tulis-balik ke int legasi (serasi UserProfile).
    expect(legacyIntFromCanonicalSpice('none'), 0);
    expect(legacyIntFromCanonicalSpice('mild'), 1);
    expect(legacyIntFromCanonicalSpice('medium'), 2);
    expect(legacyIntFromCanonicalSpice('spicy'), 3);
    expect(legacyIntFromCanonicalSpice('very_spicy'), 3);
  });

  // ---- LEGASI: halal bool ----
  test('legasi halal bool memetakan & kekal berbeza dari no_halal_filter', () {
    expect(canonicalHalalIdFromLegacyBool(true), 'halal_required');
    expect(canonicalHalalIdFromLegacyBool(false), 'no_halal_filter');
    expect(legacyBoolFromCanonicalHalal('halal_required'), isTrue);
    expect(legacyBoolFromCanonicalHalal('halal_preferred'), isFalse);
    expect(legacyBoolFromCanonicalHalal('no_halal_filter'), isFalse);
  });

  // ---- LEGASI: cuisine dikekalkan ----
  test('cuisine tidak dikenali dikekalkan dalam partition', () {
    final r = partitionCuisines(['malay', 'chinese', 'kampung_legacy_x']);
    expect(r.known, containsAll(['malay', 'chinese']));
    expect(r.unknown, ['kampung_legacy_x']);
  });

  // ---- Konflik diet ----
  test('omnivore vs vegan/vegetarian dikesan sebagai konflik', () {
    expect(dietConflictsFor('omnivore', ['vegan']), ['vegan']);
    expect(dietConflictsFor('vegan', ['pescatarian']), ['pescatarian']);
    expect(dietConflictsFor('high_protein', ['omnivore']), isEmpty);
    expect(dietConflictsFor('gluten_free', ['vegan']), isEmpty);
  });

  // ---- Konflik alahan no_known_allergy ----
  test('no_known_allergy vs alahan lain dikesan', () {
    expect(allergyHasNoKnownConflict(['no_known_allergy', 'peanuts']), isTrue);
    expect(allergyHasNoKnownConflict(['no_known_allergy']), isFalse);
    expect(allergyHasNoKnownConflict(['peanuts', 'dairy']), isFalse);
  });

  // ---- Konflik cuisine fav/try/avoid ----
  test('cuisine sama dalam kumpulan bercanggah dikesan', () {
    final c = cuisineGroupConflicts(
        {'thai', 'malay'}, {'thai'}, {'korean'});
    expect(c, ['thai']);
    expect(
        cuisineGroupConflicts({'malay'}, {'thai'}, {'korean'}), isEmpty);
  });

  // ---- Bajet validasi ----
  test('validasi bajet min <= max, tiada negatif', () {
    expect(isValidBudget(8, 30), isTrue);
    expect(isValidBudget(30, 8), isFalse);
    expect(isValidBudget(-1, 10), isFalse);
    expect(isValidBudget(10, 10), isTrue);
  });

  // ---- Custom entry normalisasi & dedup ----
  test('custom entry: normalisasi, tolak kosong, dedup case-insensitive', () {
    expect(normalizeCustomEntry('  '), isNull);
    expect(normalizeCustomEntry('  Nasi   Kerabu  '), 'Nasi Kerabu');
    final long = normalizeCustomEntry('a' * 100)!;
    expect(long.length, lessThanOrEqualTo(40));
    var list = <String>[];
    list = addCustomDedup(list, 'Ayam Masak Merah');
    list = addCustomDedup(list, 'ayam masak merah'); // dup case-insensitive
    expect(list.length, 1);
    expect(list.first, 'custom:ayam masak merah');
  });

  // ---- ID kanonikal STABIL (jaga jangan tersilap tukar) ----
  test('ID kanonikal utama kekal stabil', () {
    expect(kDietPatterns.map((o) => o.id),
        containsAll(['omnivore', 'vegetarian', 'vegan', 'pescatarian']));
    expect(kHalalOptions.map((o) => o.id),
        ['halal_required', 'halal_preferred', 'no_halal_filter']);
    expect(kSpiceLevels.first.id, 'none');
    expect(kAllCuisines.map((o) => o.id), contains('mamak'));
  });
}
