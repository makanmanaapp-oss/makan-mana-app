// Profile Redesign — render/viewport proof + source guard.
//
// Renders the REAL ProfileScreen without Firebase (providers overridden with
// test fixtures, not fake in-app data), proving: expanded premium hero with
// real display name/handle/plan/trial gating, all menu items present, no
// overflow across small/normal × scale 1.0/1.3 × Bright/Dark, and generating
// golden screenshots. A source guard locks every route/callback + verifies no
// reference-screenshot data was hardcoded.
//
// Refresh goldens: flutter test --update-goldens test/profile_redesign_test.dart
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/features/profile/profile_screen.dart';
import 'package:makan_mana/features/social/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _freeDoc = <String, dynamic>{
  'displayName': 'Nadia Rahman',
  'username': 'nadiarahman',
};

final _trialDoc = <String, dynamic>{
  'displayName': 'Nadia Rahman',
  'username': 'nadiarahman',
  'plan': 'pro',
  'planSource': 'coupon',
  'couponExpiresAt': DateTime(2026, 8, 26),
};

Widget _harness({
  required Size size,
  required double scale,
  required bool dark,
  required SharedPreferences prefs,
  required Map<String, dynamic> doc,
  required String plan,
}) {
  return ProviderScope(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      myUserDocProvider.overrideWith((ref) => Stream.value(doc)),
      userPlanProvider.overrideWith((ref) => Stream.value(plan)),
    ],
    child: MaterialApp(
      theme: dark ? AppTheme.dark() : AppTheme.light(),
      locale: const Locale('en'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: MediaQuery(
        data: MediaQueryData(size: size, textScaler: TextScaler.linear(scale)),
        child: const ProfileScreen(),
      ),
    ),
  );
}

Future<void> _pump(WidgetTester tester, Widget w) async {
  await tester.pumpWidget(w);
  await tester.pump(const Duration(milliseconds: 120));
  await tester.pump(const Duration(milliseconds: 300));
}

const _profiles = [
  (label: 'small360_s10', size: Size(360, 800), scale: 1.0),
  (label: 'normal412_s10', size: Size(412, 900), scale: 1.0),
  (label: 'normal412_s13', size: Size(412, 900), scale: 1.30),
  (label: 'small360_s13', size: Size(360, 800), scale: 1.30),
];

void main() {
  late SharedPreferences prefs;

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  group('Profile redesign — render (no overflow) + goldens', () {
    for (final p in _profiles) {
      for (final dark in [false, true]) {
        final mode = dark ? 'Dark' : 'Bright';
        final tag = '${p.label}_${mode.toLowerCase()}';
        testWidgets('Profile render $tag (no overflow)', (tester) async {
          await tester.binding.setSurfaceSize(p.size);
          addTearDown(() => tester.binding.setSurfaceSize(null));
          await _pump(
            tester,
            _harness(
              size: p.size,
              scale: p.scale,
              dark: dark,
              prefs: prefs,
              doc: _freeDoc,
              plan: 'free',
            ),
          );
          expect(tester.takeException(), isNull, reason: 'overflow pada $tag');

          // Hero + menu hadir.
          expect(find.text('Profile'), findsOneWidget);
          expect(find.text('Nadia Rahman'), findsOneWidget);
          expect(find.text('@nadiarahman'), findsOneWidget);
          expect(find.text('Food Memory'), findsOneWidget);

          await expectLater(
            find.byType(ProfileScreen),
            matchesGoldenFile('goldens/profile_$tag.png'),
          );
        });
      }
    }
  });

  testWidgets('Free plan: badge=Free, Upgrade CTA shown, no trial line',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(412, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(
      tester,
      _harness(
          size: const Size(412, 900),
          scale: 1.0,
          dark: false,
          prefs: prefs,
          doc: _freeDoc,
          plan: 'free'),
    );
    expect(find.text('Free'), findsOneWidget);
    expect(find.text('Upgrade now'), findsOneWidget);
    // Tiada baris trial untuk pengguna free.
    expect(find.textContaining('Pro Trial active until'), findsNothing);
  });

  testWidgets('Pro Trial: badge=Pro Trial + real expiry line + CTA',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(412, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(
      tester,
      _harness(
          size: const Size(412, 900),
          scale: 1.0,
          dark: false,
          prefs: prefs,
          doc: _trialDoc,
          plan: 'pro'),
    );
    expect(find.text('Pro Trial'), findsOneWidget);
    // Tarikh tamat SEBENAR dari data (bukan hardcode rujukan).
    expect(find.textContaining('26 Ogos 2026'), findsOneWidget);
    // Masih pada trial (bukan Pro berbayar) → CTA naik taraf kekal.
    expect(find.text('Upgrade now'), findsOneWidget);
  });

  testWidgets('Language tile opens dialog (callback preserved)',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(412, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(
      tester,
      _harness(
          size: const Size(412, 900),
          scale: 1.0,
          dark: false,
          prefs: prefs,
          doc: _freeDoc,
          plan: 'free'),
    );
    await tester.tap(find.text('Language'));
    await tester.pumpAndSettle();
    // Dialog bahasa muncul (fungsi tukar bahasa kekal).
    expect(find.text('Bahasa Melayu'), findsOneWidget);
    expect(find.text('中文'), findsOneWidget);
  });

  group('Profile redesign — source guard (no regression)', () {
    final src =
        File('lib/features/profile/profile_screen.dart').readAsStringSync();

    test('all menu routes/callbacks preserved', () {
      for (final needle in const [
        "context.push('/edit-profile')",
        'RoutePaths.profileMakanan',
        "context.push('/taste')",
        "context.push('/food-memory')",
        "context.push('/favorites')",
        'RoutePaths.onboarding',
        'RoutePaths.themePicker',
        "context.push('/pro')",
        "context.push('/fit/onboarding')",
        "context.push('/social')",
        "context.push('/meal-wallet')",
        'RoutePaths.paywall',
        'RoutePaths.privacy',
        'RoutePaths.settings',
        "context.push('/help')",
        '_showLanguageDialog',
        '_logout',
      ]) {
        expect(src.contains(needle), isTrue, reason: 'hilang: $needle');
      }
    });

    test('real data sources preserved (no fabricated data)', () {
      expect(src.contains('myUserDocProvider'), isTrue);
      expect(src.contains('userPlanProvider'), isTrue);
      expect(src.contains('couponTrialInfo'), isTrue);
      // Nilai rujukan reka-letak TIDAK boleh di-hardcode.
      for (final banned in const [
        'Aqil Hazim',
        'aqilhzm',
        '26 Ogos 2026',
      ]) {
        expect(src.contains(banned), isFalse, reason: 'hardcoded: $banned');
      }
    });

    test('hero + tiles restyled with Home palette', () {
      expect(src.contains('HomePalette.of(context)'), isTrue);
      expect(src.contains('_HeroCard'), isTrue);
      expect(src.contains('_PlanBadge'), isTrue);
    });
  });
}
