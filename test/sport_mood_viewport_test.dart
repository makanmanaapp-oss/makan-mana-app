import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/features/fit/fit_models.dart';
import 'package:makan_mana/features/fit/fit_providers.dart';
import 'package:makan_mana/features/fit/sport_moods_screen.dart';

/// QA VIEWPORT SPORT MOOD (ISSUE 001.2).
///
/// Merender skrin Sport Mood SEBENAR dengan provider yang ditindih supaya
/// tiada Firebase diperlukan. Meliputi 4 bahasa x 3 profil viewport x
/// Bright/Dark Mode.

/// Profil viewport yang diuji - dikunci oleh spec.
const _profiles = [
  (label: '360dp @ 1.30', size: Size(360, 800), scale: 1.30),
  (label: '390dp @ 1.15', size: Size(390, 844), scale: 1.15),
  (label: '412dp @ 1.00', size: Size(412, 892), scale: 1.00),
];

const _languages = ['ms', 'en', 'zh', 'ta'];

/// Profil kecergasan minimum - memadai untuk merender pemilih mood.
const _profile = FitnessProfile(
  heightCm: 170,
  weightKg: 70,
  age: 28,
  gender: 'male',
  mainGoal: 'fatLoss',
  fitnessLevel: 'beginner',
  selectedSportMood: 'fighterCamp',
);

Widget _harness({
  required String language,
  required double scale,
  required Size size,
  required bool dark,
  FitAccess access = FitAccess.full,
}) {
  return ProviderScope(
    overrides: [
      fitAccessProvider.overrideWithValue(access),
      fitProfileProvider.overrideWith((ref) => Stream.value(_profile)),
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
        child: const SportMoodsScreen(),
      ),
    ),
  );
}

void main() {
  for (final profile in _profiles) {
    for (final language in _languages) {
      for (final dark in [false, true]) {
        final mode = dark ? 'Dark' : 'Bright';
        testWidgets(
          'Sport Mood picker $language ${profile.label} $mode tiada overflow',
          (tester) async {
            await tester.binding.setSurfaceSize(profile.size);
            addTearDown(() => tester.binding.setSurfaceSize(null));

            await tester.pumpWidget(_harness(
              language: language,
              scale: profile.scale,
              size: profile.size,
              dark: dark,
            ));
            await tester.pump();

            // RenderFlex overflow / ralat lukisan muncul di sini.
            expect(tester.takeException(), isNull,
                reason: 'overflow pada $language ${profile.label} $mode');

            // Kad mood sebenar mesti wujud dan tajuknya diselesaikan.
            expect(find.byType(ListTile), findsWidgets);
            final l = AppLocalizations(Locale(language));
            expect(find.text(l.t('sportMoodFighterCampTitle')), findsWidgets,
                reason: 'tajuk mood tidak dipaparkan untuk $language');
          },
        );
      }
    }
  }

  testWidgets('Kad Sport Mood terkunci (preview) render tanpa ralat',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(_harness(
      language: 'ta',
      scale: 1.30,
      size: const Size(360, 800),
      dark: false,
      access: FitAccess.preview,
    ));
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.byIcon(Icons.lock_outline), findsWidgets);
  });

  testWidgets('Teks Cina tiada aksara pengganti dalam pokok widget',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(412, 892));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(_harness(
      language: 'zh',
      scale: 1.0,
      size: const Size(412, 892),
      dark: false,
    ));
    await tester.pump();
    expect(tester.takeException(), isNull);
    final texts = tester.widgetList<Text>(find.byType(Text));
    for (final t in texts) {
      final data = t.data;
      if (data != null) {
        expect(data, isNot(contains('�')),
            reason: 'aksara pengganti dijumpai: $data');
      }
    }
  });
}
