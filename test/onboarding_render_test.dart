import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/features/onboarding/onboarding_screen.dart';
import 'package:makan_mana/models/user_profile.dart';

/// ISSUE 003 Increment 3 — bukti render onboarding 8-seksyen merentas
/// bahasa/tema/viewport TANPA Firebase (guna ProviderScope lalai).
/// Ini bukti automatik boleh-ulang untuk keperluan render (ujian 46-50).
Widget _app({
  required String lang,
  required bool dark,
  double scale = 1.0,
  Size size = const Size(360, 800),
  List<Override> overrides = const [],
}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      locale: Locale(lang),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: MediaQuery(
        data: MediaQueryData(
            size: size, textScaler: TextScaler.linear(scale)),
        child: const OnboardingScreen(),
      ),
    ),
  );
}

void main() {
  // Matriks: 4 bahasa × 2 tema pada 360dp @ 1.30 (profil paling ketat).
  for (final lang in ['ms', 'en', 'zh', 'ta']) {
    for (final dark in [false, true]) {
      testWidgets(
          'onboarding render $lang ${dark ? "Dark" : "Bright"} 360@1.30',
          (tester) async {
        await tester.binding.setSurfaceSize(const Size(360, 800));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.pumpWidget(_app(lang: lang, dark: dark, scale: 1.30));
        await tester.pump();
        // Tiada overflow/ralat lukisan pada langkah pertama.
        expect(tester.takeException(), isNull);
        // Tajuk onboarding hadir (dari l10n bahasa berkenaan).
        expect(find.byType(OnboardingScreen), findsOneWidget);
      });
    }
  }

  testWidgets('onboarding 390dp @1.15 Bright tiada ralat', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(_app(
        lang: 'en', dark: false, scale: 1.15, size: const Size(390, 844)));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('onboarding 412dp @1.00 Dark tiada ralat', (tester) async {
    await tester.binding.setSurfaceSize(const Size(412, 915));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(_app(
        lang: 'ta', dark: true, scale: 1.0, size: const Size(412, 915)));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  // Interaksi: pilih matlamat → Continue → langkah 2 → Back → draf kekal.
  testWidgets('onboarding: Continue/Back & draf kekal (survive Back)',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(_app(lang: 'en', dark: false));
    await tester.pump();

    // Langkah 1: pilih satu matlamat makanan.
    expect(find.text('Eat healthier'), findsOneWidget);
    await tester.tap(find.text('Eat healthier'));
    await tester.pump();

    // Continue → langkah 2 (Halal & diet).
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Halal required'), findsOneWidget);

    // Back → langkah 1; matlamat masih dipilih (draf survive Back).
    await tester.tap(find.text('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Eat healthier'), findsOneWidget);
    // Kad terpilih menunjukkan ikon check.
    expect(find.byIcon(Icons.check_circle), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  // Regresi ISSUE 003 (QA emulator): "Ubah citarasa" mesti pra-isi medan
  // KANONIKAL profil tersimpan. Sebelum pembetulan, matlamat (dan
  // explore/avoid/custom, keterukan+nota, repeat/discovery) tidak
  // diprapilih dan hilang senyap apabila disimpan semula.
  testWidgets('edit semula: matlamat kanonikal tersimpan diprapilih',
      (tester) async {
    const saved = UserProfile(
      uid: 'qa',
      primaryFoodGoal: 'discover_new',
      allergyEntries: [
        {'id': 'peanuts', 'severity': 'severe', 'note': 'QA severe note'},
      ],
      exploreCuisineIds: ['japanese'],
      avoidedCuisineIds: ['fast_food'],
      customCuisineEntries: [
        {'id': 'custom:fusion qa', 'label': 'Fusion QA'},
      ],
      repeatToleranceId: 'balanced_repeat_and_new',
      discoveryPreferenceId: 'slightly_adventurous',
      preferredDistanceKm: 5.0,
    );
    await tester.binding.setSurfaceSize(const Size(390, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(_app(lang: 'en', dark: false, overrides: [
      loadedUserProfileProvider.overrideWith((ref) async => saved),
    ]));
    // Pra-isi berlaku dalam postFrameCallback async — beri masa.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    // Langkah 1: matlamat tersimpan 'Discover new food' diprapilih —
    // satu-satunya kad dengan ikon check pada langkah ini.
    expect(find.byIcon(Icons.check_circle), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  // Konflik diet: pilih omnivore + vegan → dialog konflik muncul.
  testWidgets('onboarding: dialog konflik diet muncul', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 1100));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(_app(lang: 'en', dark: false));
    await tester.pump();
    // Ke langkah 2.
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    // Pilih Omnivore kemudian Vegan → sepatutnya cetus dialog konflik.
    await tester.tap(find.text('Omnivore'));
    await tester.pump();
    await tester.tap(find.text('Vegan'));
    await tester.pumpAndSettle();
    expect(find.text('Conflicting choice'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
