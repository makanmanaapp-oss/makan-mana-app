// Front Page Redesign 1A — QA VIEWPORT + SCREENSHOT (skrin Home SEBENAR).
//
// Merender HomeScreen sebenar tanpa Firebase (firebaseReadyProvider lalai
// false; hanya penyedia data yang perlu ditindih dengan FIXTURE ujian — bukan
// data palsu dalam app). Membuktikan: tiada overflow / tiada pengecualian
// merentas skrin kecil/biasa × skala teks 1.0/1.3 × Bright/Dark, DAN menjana
// tangkapan skrin golden (test/goldens/home_*.png) sebagai bukti visual.
//
// Jana/kemas kini imej: flutter test --update-goldens \
//   test/home_redesign_viewport_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/features/home/home_screen.dart';
import 'package:makan_mana/features/notifications/notification_providers.dart';
import 'package:makan_mana/features/suggestions/suggestion_repository.dart';
import 'package:makan_mana/models/daily_usage.dart';
import 'package:makan_mana/models/place_summary.dart';
import 'package:shared_preferences/shared_preferences.dart';

PlaceSummary _place(String id, String name,
        {double rating = 4.5,
        double dist = 1.2,
        int match = 0,
        String cuisine = 'Nasi Campur',
        String price = ''}) =>
    PlaceSummary(
      placeId: id,
      name: name,
      cuisine: cuisine,
      emoji: '🍜',
      rating: rating,
      userRatingCount: 120,
      priceLevel: 2,
      distanceKm: dist,
      isOpen: true,
      address: 'Jalan Ujian 1',
      matchScore: match,
      matchReasonKeys: const [], // kosong → sebab jatuh ke cuisine (tiada kunci mentah)
      priceEstimate: price,
    );

final _hero = HomeSuggestion(
  primary: _place('p1', 'Warung Pak Din', rating: 4.6, dist: 0.8, match: 92,
      cuisine: 'Nasi Lemak', price: r'RM7–12'),
  alternatives: [_place('p2', 'Kedai Kopi Aman')],
  source: 'google_places',
);

final _nearby = [
  _place('n1', 'Mee Kari Haji', rating: 4.4, dist: 0.5, match: 80),
  _place('n2', 'Sate Kajang Ria', rating: 4.7, dist: 1.1, match: 74),
  _place('n3', 'Roti Canai Corner', rating: 4.2, dist: 1.6, match: 0),
  _place('n4', 'Char Kuey Teow 88', rating: 4.5, dist: 2.0, match: 66),
];

const _profiles = [
  (label: 'small360_s10', size: Size(360, 780), scale: 1.0),
  (label: 'normal412_s10', size: Size(412, 892), scale: 1.0),
  (label: 'normal412_s13', size: Size(412, 892), scale: 1.30),
  (label: 'small360_s13', size: Size(360, 780), scale: 1.30),
];

Widget _harness({
  required String language,
  required Size size,
  required double scale,
  required bool dark,
  required SharedPreferences prefs,
}) {
  return ProviderScope(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      homeSuggestionProvider.overrideWith((ref) async => _hero),
      nearbyPlacesProvider.overrideWith((ref) async => _nearby),
      dailyUsageProvider.overrideWith((ref) async => const DailyUsage(
          userId: 'test', date: '20260807', plan: 'free',
          spinUsed: 1, spinLimit: 3)),
      unreadNotificationCountProvider.overrideWithValue(3),
    ],
    child: MaterialApp(
      theme: dark ? AppTheme.dark() : AppTheme.light(),
      locale: Locale(language),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: MediaQuery(
        data: MediaQueryData(size: size, textScaler: TextScaler.linear(scale)),
        child: const HomeScreen(),
      ),
    ),
  );
}

Future<void> _pump(WidgetTester tester, Widget w) async {
  await tester.pumpWidget(w);
  await tester.pump(const Duration(milliseconds: 120));
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  late SharedPreferences prefs;

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  for (final p in _profiles) {
    for (final dark in [false, true]) {
      final mode = dark ? 'Dark' : 'Bright';
      final tag = '${p.label}_${mode.toLowerCase()}';

      testWidgets('Home redesign render $tag (no overflow)', (tester) async {
        await tester.binding.setSurfaceSize(p.size);
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await _pump(
          tester,
          _harness(
            language: 'en',
            size: p.size,
            scale: p.scale,
            dark: dark,
            prefs: prefs,
          ),
        );

        // Tiada overflow / pengecualian susun-atur pada mana-mana konfigurasi.
        expect(tester.takeException(), isNull, reason: 'overflow pada $tag');

        // Elemen teras hadir (hero heading, AI Pick, Nearby, Fit Coach).
        final l = AppLocalizations(const Locale('en'));
        expect(find.text(l.t('aiPickTitle')), findsWidgets);
        expect(find.text(l.t('nearbyTitle')), findsOneWidget);
        expect(find.text('Warung Pak Din'), findsOneWidget);
        expect(find.text('Mee Kari Haji'), findsOneWidget);

        // Bukti visual: tangkapan skrin golden per konfigurasi.
        await expectLater(
          find.byType(HomeScreen),
          matchesGoldenFile('goldens/home_$tag.png'),
        );
        // Buang widget → dispose batalkan Timer carousel hero (elak
        // "pending timer" pada penghujung ujian).
        await tester.pumpWidget(const SizedBox());
      });
    }
  }

  // Tangkapan skrin DIGULUNG (normal Bright) — bukti visual karusel Nearby +
  // Fit Coach + promo di bawah lipatan.
  testWidgets('Home redesign scrolled normal Bright (nearby+fit)',
      (tester) async {
    const size = Size(412, 892);
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(
      tester,
      _harness(
          language: 'en', size: size, scale: 1.0, dark: false, prefs: prefs),
    );
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -520),
        warnIfMissed: false);
    await tester.pump(const Duration(milliseconds: 120));
    expect(tester.takeException(), isNull);
    await expectLater(
      find.byType(HomeScreen),
      matchesGoldenFile('goldens/home_scrolled_normal_bright.png'),
    );
    await tester.pumpWidget(const SizedBox()); // dispose → batal Timer carousel
  });

  // Regresi khusus: skala teks 1.30 pada 360dp tidak melimpah selepas skrol.
  testWidgets('Home redesign sweep-scroll 360@1.3 no overflow',
      (tester) async {
    const size = Size(360, 780);
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(
      tester,
      _harness(
          language: 'ms', size: size, scale: 1.30, dark: false, prefs: prefs),
    );
    for (var i = 0; i < 6; i++) {
      await tester.drag(
          find.byType(Scrollable).first, const Offset(0, -500),
          warnIfMissed: false);
      await tester.pump(const Duration(milliseconds: 60));
      expect(tester.takeException(), isNull, reason: 'overflow langkah $i');
    }
    await tester.pumpWidget(const SizedBox()); // dispose → batal Timer carousel
  });
}
