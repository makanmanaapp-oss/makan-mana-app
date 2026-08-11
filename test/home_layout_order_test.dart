// Front Page Redesign 1 — pengawal susunan Home + pemeliharaan fungsi.
//
// Ujian struktur sumber (bukan Firebase): membuktikan susunan WAJIB
// Mood → AI Pick → Nearby → Fit Coach, kehadiran loceng + butang profil,
// dan bahawa penyedia/callback teras Home KEKAL (tiada regresi fungsi).
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final src = File('lib/features/home/home_screen.dart').readAsStringSync();

  int idx(String needle) {
    final i = src.indexOf(needle);
    expect(i, greaterThanOrEqualTo(0), reason: 'tidak jumpa: $needle');
    return i;
  }

  group('Susunan Home: Mood → AI Pick → Nearby → Fit Coach', () {
    test('AI Pick sebelum Nearby sebelum Fit Coach', () {
      final aiPick = idx("l.t('aiPickTitle')");
      final nearby = idx("l.t('nearbyTitle')");
      final fitCoach = idx('const FitCoachCard()');
      expect(aiPick, lessThan(nearby), reason: 'AI Pick mesti sebelum Nearby');
      expect(nearby, lessThan(fitCoach),
          reason: 'Fit Coach mesti SELEPAS Nearby');
    });

    test('Fit Coach muncul tepat SEKALI (tiada salinan lama di atas)', () {
      final count = 'const FitCoachCard()'.allMatches(src).length;
      expect(count, 1, reason: 'FitCoachCard patut wujud sekali sahaja');
    });
  });

  group('Header: loceng notifikasi + butang profil', () {
    test('loceng notifikasi hadir', () {
      expect(src, contains('_NotificationBell('));
      expect(src, contains('RoutePaths.notifications'));
    });

    test('butang Threads (api) di header → feed sosial', () {
      expect(src, contains('_ThreadsButton'));
      expect(src, contains('Icons.local_fire_department_rounded'));
      expect(src, contains('RoutePaths.social'));
    });

    test('ikon forum lama dibuang dari header', () {
      expect(src.contains('Icons.forum_outlined'), isFalse,
          reason: 'ikon forum lama sepatutnya diganti loceng+Threads');
    });
  });

  group('Pemeliharaan fungsi Home (tiada regresi)', () {
    test('penyedia cadangan + berdekatan kekal digunakan', () {
      expect(src, contains('homeSuggestionProvider'));
      expect(src, contains('nearbyPlacesProvider'));
      expect(src, contains('dailyUsageProvider'));
    });

    test('callback buka cadangan/spin/carian kekal', () {
      expect(src, contains('_openSuggestion'));
      expect(src, contains('_HeroPickCard'));
      expect(src, contains('_NearbyCard'));
    });
  });

  group('Redesign 1A — penanda visual hadir', () {
    test('palet skop-Home digunakan (bukan ubah token global)', () {
      expect(src, contains('HomePalette.of(context)'));
    });

    test('hero: wordmark jenama + tajuk disorot + visual makanan', () {
      expect(src, contains('_BrandWordmark'));
      expect(src, contains('makanmana_wordmark.png'));
      expect(src, contains("l.t('homeHeroLead')"));
      expect(src, contains("l.t('homeHeroAccent')"));
      expect(src, contains('_HeroFoodVisual'));
    });

    test('jubin mood + butang kegemaran berfungsi', () {
      expect(src, contains('_MoodTile'));
      expect(src, contains('_FavoriteButton'));
      // Kegemaran guna semula kontrak sedia ada (bukan kawalan palsu).
      expect(src, contains('isFavoriteProvider'));
      expect(src, contains("collection('favorites')"));
    });

    test('bar carian ada ikon penapis merah', () {
      expect(src, contains('Icons.tune_rounded'));
    });
  });
}
