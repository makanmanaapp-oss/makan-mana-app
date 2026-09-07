// FINAL APP COMPLETION PASS — pagar pelancaran.
//
// Ujian ini mengunci keputusan kesiapan-pelancaran yang mudah tergelincir
// semula: tiada skrin "akan datang" yang boleh dicapai, tiada jenama "AI" pada
// permukaan pengguna, mesej ralat pembelian yang jujur, dan gerbang `mounted`
// pada setState selepas await.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';

void main() {
  String read(String p) =>
      File(p).readAsStringSync().replaceAll('\r\n', '\n');

  String code(String s) => s
      .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), ' ')
      .replaceAll(RegExp(r'^[ \t]*///.*$', multiLine: true), ' ')
      .replaceAll(RegExp(r'^[ \t]*//.*$', multiLine: true), ' ');

  // ── A. TIADA SKRIN MATI ───────────────────────────────────────────────────

  group('A. tiada skrin placeholder boleh dicapai', () {
    test('1. router tidak lagi merender PlaceholderScreen', () {
      final router = code(read('lib/app/router.dart'));
      expect(router.contains('PlaceholderScreen'), isFalse,
          reason: 'skrin "Akan datang!" tidak boleh dicapai pengguna');
    });

    test('2. sandaran notifikasi grup pergi ke inbox Groups sebenar', () {
      // Notifikasi berkaitan grup TANPA groupId dahulunya jatuh ke /group,
      // iaitu PlaceholderScreen. Ia mesti mendarat di inbox tab Groups —
      // sandaran sama yang sudah terbukti untuk group_invite.
      for (final f in [
        'lib/core/notifications/notification_destination.dart',
        'lib/features/notifications/notification_screen.dart',
      ]) {
        final body = code(read(f));
        expect(body.contains('RoutePaths.group'), isFalse,
            reason: '$f masih jatuh ke laluan placeholder');
        expect(body, contains("'/social?tab=groups'"));
      }
    });

    test('3. deep link /group lama mendarat di tempat berguna', () {
      final router = code(read('lib/app/router.dart'));
      expect(router, contains('RoutePaths.group'));
      expect(router, contains("redirect: (context, state) => '/social?tab=groups'"));
    });

    test('4. laluan /nutrition yang mati telah dibuang', () {
      expect(read('lib/app/router.dart').contains('RoutePaths.nutrition'), isFalse);
      expect(read('lib/core/constants/app_constants.dart').contains("'/nutrition'"),
          isFalse);
    });
  });

  // ── B. JENAMA PERMUKAAN PENGGUNA ──────────────────────────────────────────

  group('B. jenama user-facing ialah MakanMana', () {
    test('5. tiada NILAI l10n memanggil produk "AI"', () {
      final ai = RegExp(r'\bA\.?I\.?\b');
      for (final lang in ['ms', 'en', 'zh', 'ta']) {
        final values = AppLocalizations.valuesForTesting(Locale(lang));
        final offenders = values.entries
            .where((e) => ai.hasMatch(e.value))
            .map((e) => '${e.key}=${e.value}')
            .toList();
        expect(offenders, isEmpty,
            reason: 'guna jenama MakanMana, bukan "AI" ($lang): $offenders');
      }
    });

    test('6. Food Coach dijenamakan MakanMana', () {
      final en = AppLocalizations.valuesForTesting(const Locale('en'));
      expect(en['proCoachTitle'], 'MakanMana Food Coach');
      expect(en['proBenefitFoodCoach'], 'MakanMana Food Coach');
      expect(en['shareCardSuggestion'], 'MakanMana Suggestion');
    });
  });

  // ── C. MESEJ RALAT JUJUR ──────────────────────────────────────────────────

  group('C. kegagalan pembelian dinyatakan dengan jujur', () {
    test('7. laluan berbayar tidak lagi kata ciri itu belum wujud', () {
      final paywall = code(read('lib/features/paywall/paywall_screen.dart'));
      // Blok catch mesti guna mesej boleh-cuba-semula, bukan "akan datang".
      expect(paywall.contains("l.t('subscriptionComingSoon')"), isFalse,
          reason: 'ralat sebenar tidak boleh dilaporkan sebagai "akan datang"');
      expect(paywall, contains("l.t('purchaseUnavailable')"));
      // paymentNotActive kekal HANYA untuk laluan pelan percuma.
      expect(paywall, contains("plan == 'free' ? 'paymentNotActive'"));
    });

    test('8. purchaseUnavailable wujud dalam keempat-empat bahasa', () {
      for (final lang in ['ms', 'en', 'zh', 'ta']) {
        final v = AppLocalizations.valuesForTesting(Locale(lang));
        expect(v['purchaseUnavailable'], isNotNull, reason: lang);
        expect(v['purchaseUnavailable']!.trim(), isNotEmpty, reason: lang);
      }
    });
  });

  // ── D. setState SELEPAS await ─────────────────────────────────────────────

  group('D. tiada setState selepas await tanpa gerbang', () {
    test('9. tapak yang dibetulkan mengekalkan gerbang mounted', () {
      const guarded = {
        'lib/features/onboarding/onboarding_screen.dart': 4,
        'lib/features/taste/taste_pickers.dart': 3,
        'lib/features/theme_picker/theme_picker_screen.dart': 1,
        'lib/features/social/post_card.dart': 1,
        'lib/features/groups/group_settings_screen.dart': 1,
      };
      guarded.forEach((path, atLeast) {
        final body = read(path);
        final n = 'if (!mounted) return;'.allMatches(body).length;
        expect(n, greaterThanOrEqualTo(atLeast),
            reason: '$path kehilangan gerbang mounted');
      });
      final fit = read('lib/features/fit/fit_onboarding_screen.dart');
      expect(fit, contains('&& mounted) setState('));
    });
  });

  // ── F. KONTRAK APP <-> CONTROL CENTER ─────────────────────────────────────

  group('F. kontrak data menu sejajar dengan Control Center', () {
    // Control Center menulis RegistryMenuItem (menu-import.ts):
    //   id, section, category, name, description, price, currency,
    //   available, imageUrl, sortOrder
    // dengan MenuSection = "makanan" | "minuman".
    // Adapter app mesti terus membaca setiap medan itu dan menerima
    // kedua-dua nilai section; menyempitkannya akan MENGGUGURKAN item menu
    // secara senyap selepas import.
    test('12. adapter membaca setiap medan yang Control Center tulis', () {
      final adapter = code(read(
          'lib/features/restaurant/canonical/restaurant_profile_v2_adapter.dart'));
      for (final field in [
        'id', 'section', 'category', 'name', 'description',
        'price', 'currency', 'available', 'imageUrl', 'sortOrder',
      ]) {
        expect(adapter, contains("item['$field']"),
            reason: 'medan menu Control Center "$field" tidak dibaca');
      }
    });

    test('13. kedua-dua nilai MenuSection diterima', () {
      final adapter = code(read(
          'lib/features/restaurant/canonical/restaurant_profile_v2_adapter.dart'));
      expect(adapter, contains("'makanan'"));
      expect(adapter, contains("'minuman'"));
    });

    test('14. ketersediaan dan susunan dihormati, bukan diabaikan', () {
      final adapter = code(read(
          'lib/features/restaurant/canonical/restaurant_profile_v2_adapter.dart'));
      expect(adapter, contains("item['available'] != false"));
      expect(adapter, contains('sortOrder.compareTo('));
    });
  });

  // ── E. KESELAMATAN PENGELUARAN ────────────────────────────────────────────

  group('E. invarian keselamatan pengeluaran', () {
    test('10. canonical Restaurant Detail kekal OFF dalam pengeluaran', () {
      expect(
        read('lib/features/restaurant/canonical/restaurant_detail_flags.dart'),
        contains('canonicalRestaurantDetailEnabled = false'),
      );
      final qa =
          code(read('lib/features/place_migration/qa_canonical_activation.dart'));
      expect(qa, contains('isDebugBuild'));
      expect(qa, contains('appFlavor'));
    });

    test('11. identiti pakej prod/qa tidak berubah', () {
      final g = read('android/app/build.gradle.kts');
      expect(g, contains('applicationId = "com.makanmana.apps"'));
      expect(g.substring(g.indexOf('create("qa")')),
          contains('applicationIdSuffix = ".qa"'));
      expect(
        g
            .substring(g.indexOf('create("prod")'), g.indexOf('create("qa")'))
            .contains('applicationIdSuffix'),
        isFalse,
      );
    });
  });
}
