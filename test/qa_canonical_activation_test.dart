import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/features/place_migration/place_migration_flags.dart';
import 'package:makan_mana/features/place_migration/qa_canonical_activation.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_flags.dart';

/// WAVE 3 GATE 3F-A — pengawal pengaktifan kanonikal QA sahaja.
///
/// Menjaga invarian yang ditemui oleh QA peranti: binaan QA MESTI boleh masuk
/// Butiran Kedai kanonikal, dan keluaran produksi MESTI kekal legasi/OFF.
void main() {
  String read(String path) =>
      File(path).readAsStringSync().replaceAll('\r\n', '\n');

  tearDown(PlaceMigrationFeatureFlags.resetToSafeDefaults);

  group('QA-only canonical activation', () {
    test('3. lalai selamat: canonical detail OFF sebelum apa-apa pengaktifan', () {
      PlaceMigrationFeatureFlags.resetToSafeDefaults();
      expect(RestaurantDetailFlags.canonicalRestaurantDetailEnabled, isFalse);
    });

    test('1. KELUARAN produksi tidak pernah diaktifkan oleh mekanisme QA', () {
      // Keluaran + flavor prod.
      expect(
        qaCanonicalDetailAllowed(isDebugBuild: false, flavor: 'prod'),
        isFalse,
      );
      // Walaupun flavor entah bagaimana "qa", keluaran tetap litar-pintas FALSE.
      expect(
        qaCanonicalDetailAllowed(isDebugBuild: false, flavor: kQaFlavorName),
        isFalse,
      );

      PlaceMigrationFeatureFlags.resetToSafeDefaults();
      expect(
        applyQaCanonicalActivation(isDebugBuild: false, flavor: kQaFlavorName),
        isFalse,
        reason: 'keluaran tidak boleh mengaktifkan apa-apa',
      );
      expect(RestaurantDetailFlags.canonicalRestaurantDetailEnabled, isFalse);
    });

    test('1b. debug + flavor prod / tiada flavor juga TIDAK diaktifkan', () {
      expect(qaCanonicalDetailAllowed(isDebugBuild: true, flavor: 'prod'), isFalse);
      expect(qaCanonicalDetailAllowed(isDebugBuild: true, flavor: null), isFalse);
      expect(qaCanonicalDetailAllowed(isDebugBuild: true, flavor: ''), isFalse);

      PlaceMigrationFeatureFlags.resetToSafeDefaults();
      expect(applyQaCanonicalActivation(isDebugBuild: true, flavor: 'prod'), isFalse);
      expect(RestaurantDetailFlags.canonicalRestaurantDetailEnabled, isFalse);
    });

    test('2. debug + flavor qa MENGAKTIFKAN butiran kanonikal', () {
      expect(
        qaCanonicalDetailAllowed(isDebugBuild: true, flavor: kQaFlavorName),
        isTrue,
      );

      PlaceMigrationFeatureFlags.resetToSafeDefaults();
      expect(RestaurantDetailFlags.canonicalRestaurantDetailEnabled, isFalse);

      final applied =
          applyQaCanonicalActivation(isDebugBuild: true, flavor: kQaFlavorName);
      expect(applied, isTrue);
      expect(RestaurantDetailFlags.canonicalRestaurantDetailEnabled, isTrue);
      // Fallback legasi MESTI kekal: mod baca bukan canonical-only.
      expect(
        PlaceMigrationFeatureFlags.canonicalPlaceReadMode,
        PlaceReadMode.canonicalPreferredWithLegacyFallback,
      );
    });

    test('2b. pengaktifan QA dinilai pada permulaan app, bukan pada log masuk', () {
      // Punca asal kegagalan QA: satu-satunya laluan pengaktifan hanya dipanggil
      // dari skrin log masuk, jadi pelancaran dengan sesi sedia ada tidak pernah
      // mengaktifkannya. main() mesti memanggilnya secara langsung.
      final main = read('lib/main.dart');
      expect(main, contains('applyQaCanonicalActivation()'));
      expect(main, contains('qa_canonical_activation.dart'));
    });

    test('2c. log masuk akaun bukan-kohort tidak mematikan semula binaan QA', () {
      final cohort =
          read('lib/features/place_migration/internal_cohort_activation.dart');
      final ineligible = cohort.substring(cohort.indexOf('if (!decision.eligible)'));
      expect(ineligible, contains('resetToSafeDefaults()'));
      expect(
        ineligible.split('}').first,
        contains('applyQaCanonicalActivation()'),
        reason: 'reset tanpa pemulihan QA akan mematikan Butiran kanonikal',
      );
    });

    test('mekanisme QA tidak menggunakan rahsia atau UID keras', () {
      final source =
          read('lib/features/place_migration/qa_canonical_activation.dart');
      // Hanya jenis binaan + flavor yang menentukan pengaktifan.
      expect(source, contains('isDebugBuild'));
      expect(source, contains('appFlavor'));
      // Tiada UID Firebase ditanam: UID akan muncul sebagai LITERAL berpetik
      // alfanumerik panjang. (Memadan pengecam biasa seperti
      // `canonicalPreferredWithLegacyFallback` adalah positif palsu, jadi
      // pemadanan dibuat pada literal string sahaja.)
      expect(
        RegExp(r"'[A-Za-z0-9]{20,}'").hasMatch(source),
        isFalse,
        reason: 'sumber pengaktifan QA tidak boleh mengandungi UID keras',
      );
    });
  });

  group('Flavor package identity', () {
    late String gradle;
    setUp(() => gradle = read('android/app/build.gradle.kts'));

    test('4. flavor qa mengekalkan suffix .qa', () {
      final qaBlock = gradle.substring(gradle.indexOf('create("qa")'));
      expect(qaBlock, contains('applicationIdSuffix = ".qa"'));
    });

    test('5. flavor prod TIADA suffix (pakej produksi tidak berubah)', () {
      expect(gradle, contains('applicationId = "com.makanmana.apps"'));
      final prodStart = gradle.indexOf('create("prod")');
      final qaStart = gradle.indexOf('create("qa")');
      final prodBlock = gradle.substring(prodStart, qaStart);
      expect(prodBlock.contains('applicationIdSuffix'), isFalse);
    });
  });

  group('Branding', () {
    test('tajuk cadangan menggunakan jenama MakanMana, bukan "AI"', () {
      for (final locale in AppLocalizations.supportedLocales) {
        final l = AppLocalizations(locale);
        final title = l.t('aiPickTitle');
        expect(title, contains('MakanMana'),
            reason: 'locale ${locale.languageCode} mesti berjenama MakanMana');
        expect(title.contains('AI '), isFalse,
            reason: 'locale ${locale.languageCode} masih memaparkan "AI"');
      }
    });

    test('tiada teks "Pilihan AI" tinggal dalam sumber', () {
      final l10n = read('lib/app/localization/app_localizations.dart');
      expect(l10n.contains('Pilihan AI'), isFalse);
    });
  });
}
