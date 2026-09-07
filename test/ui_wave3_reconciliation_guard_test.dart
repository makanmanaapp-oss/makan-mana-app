/// PENGAWAL REKONSILIASI — baseline UI diluluskan + Wave 3, kedua-duanya.
///
/// Cawangan ini menggabungkan dua generasi yang wujud serentak pada satu
/// cakera: UI diluluskan terkini (tidak pernah di-commit dalam checkout MAIN)
/// dan kerja Wave 3 (backend restoran kanonikal, sosial, merchant).
///
/// Kegagalan sebenar yang dilaporkan pemilik ialah "QA build nampak seperti
/// antara muka LAMA" — iaitu satu generasi menimpa satu lagi. Fail ini wujud
/// supaya kegagalan itu tidak boleh berulang secara senyap: ia menegaskan
/// penanda dari KEDUA-DUA generasi hadir serentak. Memilih satu sisi dengan
/// memadam yang lain akan memecahkan ujian ini, bukan lulus dengan diam.
///
/// Ia sengaja membaca SUMBER, bukan merender. Regresi yang ditakuti ialah
/// "fail salah menang semasa merge", dan itu kelihatan pada teks sumber.
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:flutter/widgets.dart' show Locale;

String read(String path) => File(path).readAsStringSync().replaceAll(
      '\r\n',
      '\n',
    );

bool exists(String path) => File(path).existsSync();

void main() {
  // ── A. GENERASI UI DILULUSKAN ────────────────────────────────────────────

  group('A. baseline UI diluluskan kekal hadir', () {
    test('1. HomeLocalHero + suara negeri Malaysia wujud dan berwayar', () {
      expect(exists('lib/features/home/home_local_hero.dart'), isTrue);
      expect(exists('lib/core/location/malaysia_state_hero_voice.dart'), isTrue);
      expect(exists('lib/core/location/malaysia_state_resolver.dart'), isTrue);
      // Hero mesti benar-benar dipasang oleh skrin Home, bukan sekadar wujud.
      final home = read('lib/features/home/home_screen.dart');
      expect(home, contains('home_local_hero.dart'));
      expect(home, contains('LocalHero'));
      // Frasa BM diluluskan menghasilkan "Nak makan mana?" — hero Selangor
      // sama dengan frasa bahasa app, jadi ia statik (tiada putaran).
      expect(
        AppLocalizations.valuesForTesting(const Locale('ms'))['homeHeroAccent'],
        'mana?',
        reason: 'salinan hero yang diluluskan tidak boleh berundur',
      );
    });

    test('2. shell navigasi guna PageView boleh-leret', () {
      final shell = read('lib/features/shell/app_shell.dart');
      expect(shell, contains('PageView'));
      expect(shell, contains('PageController'));
      expect(shell, contains('buildMainNavigationContainer'));
      // Router mesti memasang bekas itu, bukan indexedStack lama.
      final router = read('lib/app/router.dart');
      expect(router, contains('navigatorContainerBuilder:'));
      expect(router, contains('buildMainNavigationContainer'));
    });

    test('3. penapisan Activity + tetapan notifikasi boleh dicapai', () {
      expect(exists('lib/features/notifications/activity_filter.dart'), isTrue);
      expect(
          exists('lib/features/notifications/notification_settings_screen.dart'),
          isTrue);
      final screen = read('lib/features/notifications/notification_screen.dart');
      expect(screen, contains('activity_filter.dart'));
      expect(screen, contains('RoutePaths.notificationSettings'));
      final router = read('lib/app/router.dart');
      expect(router, contains('RoutePaths.notificationSettings'));
      expect(router, contains('NotificationSettingsScreen'));
    });

    test('4. undian suapan + penggubah undian dipasang dalam suapan', () {
      expect(exists('lib/features/social/feed_poll_card.dart'), isTrue);
      expect(exists('lib/features/social/poll_form.dart'), isTrue);
      final card = read('lib/features/social/post_card.dart');
      expect(card, contains('FeedPollCard'));
      expect(card, contains("data['postType'] == 'poll'"));
      final compose = read('lib/features/social/compose_sheet.dart');
      expect(compose, contains('poll_form.dart'));
    });

    test('5. check-in tempat boleh diketik dari suapan', () {
      expect(exists('lib/features/social/checkin_place.dart'), isTrue);
      expect(exists('lib/features/social/checkin_place_service.dart'), isTrue);
      final card = read('lib/features/social/post_card.dart');
      expect(card, contains('checkin_place.dart'));
      expect(card, contains('openCheckinPlaceInMaps'));
    });
  });

  // ── B. GENERASI WAVE 3 ───────────────────────────────────────────────────

  group('B. kelakuan Wave 3 kekal berkuat kuasa', () {
    test('6. Restaurant Detail kanonikal + Follow + komen menu utuh', () {
      final detail = read('lib/features/restaurant/restaurant_detail_screen.dart');
      expect(detail, contains('canonicalRestaurantDetailEnabled'));
      expect(detail, contains('getRestaurantProfileV2'));
      expect(detail, contains('RestaurantFollowButton'));
      expect(detail, contains('MenuComment'));
      // Identiti kanonikal yang DISELESAIKAN pelayan ialah satu-satunya
      // identiti yang melekapkan engagement — alias tidak boleh menyamar.
      expect(detail, contains('_resolvedCanonicalPlaceId'));
    });

    test('7. Merchant Center boleh dicapai dari Profil', () {
      final router = read('lib/app/router.dart');
      expect(router, contains('RoutePaths.merchantCenter'));
      expect(router, contains('MerchantCenterScreen'));
      final profile = read('lib/features/profile/profile_screen.dart');
      expect(profile, contains('RoutePaths.merchantCenter'));
    });

    test('8. pertanyaan sosial kekal terkekang kitaran hayat', () {
      final social = read('lib/features/social/social_providers.dart');
      expect(social, contains("const kPostStatusActive = 'active'"));
      expect(social, contains("const kCommentStatusActive = 'active'"));
      expect(social, contains("where('status', isEqualTo: kPostStatusActive)"));
    });

    test('9. tanda-baca notifikasi menulis status kitaran hayat sebenar', () {
      final notif = read('lib/features/notifications/notification_providers.dart');
      expect(notif, contains("const kNotificationStatusRead = 'read'"));
      expect(notif, contains("'status': kNotificationStatusRead"));
      // Laluan tunggal dan batch mesti menulis set medan yang SAMA.
      expect(notif.contains("'status': 'read'"), isFalse,
          reason: 'nilai status literal memintas pemalar');
    });

    test('10. post restoran menyelesaikan identiti restoran, bukan pengguna',
        () {
      final card = read('lib/features/social/post_card.dart');
      expect(card, contains("data['authorType'] == 'restaurant'"));
      expect(card, contains('canonicalPlaceId'));
      expect(card, contains("const Key('post-restaurant-badge')"));
    });

    test('11. kad asal terbenam tidak pernah memaparkan snapshot basi', () {
      final repost = read('lib/features/social/repost.dart');
      expect(repost.contains('this.snapshot'), isFalse,
          reason: 'WAVE 3C: kandungan asal dibaca LIVE sahaja');
      for (final f in [
        'lib/features/social/post_card.dart',
        'lib/features/social/compose_sheet.dart',
      ]) {
        expect(read(f).contains('snapshot: '), isFalse,
            reason: '$f masih menyuap snapshot ke kad asal');
      }
    });

    test('12. laluan mati kekal dibuang', () {
      final router = read('lib/app/router.dart');
      expect(router.contains('PlaceholderScreen'), isFalse);
      expect(router.contains('RoutePaths.nutrition'), isFalse);
      expect(router, contains("redirect: (context, state) => '/social?tab=groups'"));
    });
  });

  // ── C. INVARIAN KELUARAN ─────────────────────────────────────────────────

  group('C. invarian keluaran tidak berundur', () {
    test('13. versi kekal 0.1.9+14 atau lebih baharu', () {
      final pubspec = read('pubspec.yaml');
      final match = RegExp(r'^version:\s*(\d+)\.(\d+)\.(\d+)\+(\d+)',
              multiLine: true)
          .firstMatch(pubspec);
      expect(match, isNotNull, reason: 'pubspec mesti mengisytiharkan versi');
      final build = int.parse(match!.group(4)!);
      expect(build, greaterThanOrEqualTo(14),
          reason: 'versionCode tidak boleh diturunkan oleh merge');
      // Label Tetapan dikunci pada versi yang sama.
      expect(read('lib/core/constants/app_constants.dart'),
          contains("kAppVersionLabel = 'MakanMana v0.1.9'"));
    });

    test('14. akhiran pakej prod/qa tidak berubah', () {
      final gradle = read('android/app/build.gradle.kts');
      expect(gradle, contains('applicationIdSuffix = ".qa"'));
      expect(gradle, contains('com.makanmana.apps'));
    });

    test('15. pengaktifan QA kanonikal kekal debug/QA sahaja', () {
      final flags =
          read('lib/features/restaurant/canonical/restaurant_detail_flags.dart');
      expect(flags, contains('canonicalRestaurantDetailEnabled = false'),
          reason: 'skrin kanonikal mesti OFF secara lalai dalam pengeluaran');
      final activation =
          read('lib/features/place_migration/qa_canonical_activation.dart');
      expect(activation, contains('kDebugMode'));
      expect(activation, contains('qaCanonicalDetailAllowed'));
    });

    test('16. l10n ialah KESATUAN — kedua-dua generasi hadir', () {
      final ms = AppLocalizations.valuesForTesting(const Locale('ms'));
      // Dari baseline UI diluluskan.
      for (final key in const [
        'actTabAll',
        'notifSettingsTitle',
        'checkinBadge',
        'socialPublicationTime',
      ]) {
        expect(ms.containsKey(key), isTrue, reason: 'kunci UI $key hilang');
      }
      // Dari Wave 3.
      for (final key in const [
        'dmLoadError',
        'purchaseUnavailable',
        'notificationCommentTitle',
        'notificationCommentBody',
      ]) {
        expect(ms.containsKey(key), isTrue, reason: 'kunci Wave3 $key hilang');
      }
      // Parity merentas keempat-empat bahasa dikuatkuasakan di tempat lain;
      // di sini yang penting ialah tiada sisi yang dibuang.
      for (final code in const ['en', 'zh', 'ta']) {
        expect(AppLocalizations.keysForTesting(Locale(code)),
            equals(AppLocalizations.keysForTesting(const Locale('ms'))));
      }
    });
  });
}
