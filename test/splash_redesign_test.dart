// Splash Redesign 2B (Option B) — source guard + no-Firebase render check.
//
// Guards the presentation-only splash contract WITHOUT touching startup logic:
//   * full red #DD1F22 background (Option B), no white variant
//   * official logo IMAGE asset (assets/icon/app_icon.png), never a Text
//     reconstruction of the brand name / tagline
//   * thin indeterminate white loading bar (LinearProgressIndicator, no value)
//   * routing decision + timing preserved exactly (context.go, same targets,
//     same 1600ms Timer — no NEW artificial delay)
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/features/splash/splash_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  final src =
      File('lib/features/splash/splash_screen.dart').readAsStringSync();

  group('Splash 2B — Option B full red', () {
    test('background uses splash red #DD1F22 (Option B)', () {
      expect(src.contains('0xFFDD1F22'), isTrue,
          reason: 'splash mesti guna merah #DD1F22');
    });

    test('no white / light splash variant', () {
      expect(src.contains('Colors.white,\n        body'), isFalse);
      // Scaffold background must be the red field, not white/cream.
      expect(src.contains('backgroundColor: _splashRed'), isTrue);
    });

    test('official logo IMAGE asset used, not a Text reconstruction', () {
      expect(src.contains("Image.asset(\n          'assets/icon/app_icon.png'"),
          isTrue,
          reason: 'guna aset imej rasmi');
      // Brand name / tagline Text widgets removed from production splash.
      expect(src.contains("l.t('appName')"), isFalse,
          reason: 'tiada binaan semula nama jenama guna Text');
      expect(src.contains("l.t('tagline')"), isFalse);
      expect(src.contains("'mano'"), isFalse);
    });

    test('logo rendered with BoxFit.contain', () {
      expect(src.contains('fit: BoxFit.contain'), isTrue);
    });

    test('thin indeterminate white loading bar', () {
      // Isolate the loader widget; an indicator with no `value:` == indeterminate.
      final loader = src.substring(src.indexOf('class _SplashLoader'));
      expect(loader.contains('const LinearProgressIndicator('), isTrue);
      expect(loader.contains('value:'), isFalse, reason: 'jangan palsukan %');
      expect(loader.contains('minHeight: 3'), isTrue);
      expect(loader.contains('backgroundColor: Color(0x33FFFFFF)'), isTrue);
      expect(loader.contains('AlwaysStoppedAnimation<Color>(Colors.white)'),
          isTrue);
    });

    test('light system icons blending with red', () {
      expect(src.contains('statusBarIconBrightness: Brightness.light'), isTrue);
    });

    test('restores neutral system chrome on exit (no red-nav leak into Home)',
        () {
      expect(src.contains('SystemChrome.setSystemUIOverlayStyle'), isTrue,
          reason: 'restore chrome bila keluar splash');
      expect(src.contains('systemNavigationBarColor: Colors.black'), isTrue,
          reason: 'nav bar kembali ke lalai app (bukan merah) pada Home');
    });
  });

  group('Splash 2B — startup logic frozen (no regression)', () {
    test('routing targets + go() preserved exactly', () {
      for (final t in const [
        'RoutePaths.language',
        'RoutePaths.login',
        'RoutePaths.onboarding',
        'RoutePaths.home',
      ]) {
        expect(src.contains('context.go($t)'), isTrue, reason: 'kekalkan $t');
      }
    });

    test('no NEW artificial delay — same 1600ms routing timer only', () {
      expect(src.contains('Timer(const Duration(milliseconds: 1600), _route)'),
          isTrue);
      expect('Future.delayed'.allMatches(src).length, 0,
          reason: 'jangan tambah Future.delayed');
      // Exactly one Timer in the whole splash (the pre-existing routing timer).
      expect('Timer('.allMatches(src).length, 1);
    });

    test('context hydration + auth/firebase reads preserved', () {
      expect(src.contains('makanManaUserContextProvider'), isTrue);
      expect(src.contains('authRepositoryProvider'), isTrue);
      expect(src.contains('firebaseReadyProvider'), isTrue);
    });
  });

  // Render the REAL SplashScreen (no Firebase) and capture a golden as visual
  // proof of the Option B composition: full red field, official logo tile
  // centered, thin white loading bar. Generate/refresh:
  //   flutter test --update-goldens test/splash_redesign_test.dart
  testWidgets('Splash 2B renders Option B (golden) + routes cleanly',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    const size = Size(412, 892);
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));

    // Stub router: splash + the real routing targets so the (unchanged) 1600ms
    // routing Timer can fire without error. firebaseReadyProvider defaults to
    // false → no Firebase touched.
    Widget stub(String tag) => const SizedBox.shrink();
    final router = GoRouter(
      initialLocation: '/splash',
      routes: [
        GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
        GoRoute(path: '/language', builder: (_, __) => stub('language')),
        GoRoute(path: '/login', builder: (_, __) => stub('login')),
        GoRoute(path: '/onboarding', builder: (_, __) => stub('onboarding')),
        GoRoute(path: '/home', builder: (_, __) => stub('home')),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
        child: MaterialApp.router(
          debugShowCheckedModeBanner: false,
          routerConfig: router,
        ),
      ),
    );
    // Decode the real logo PNG (headless tests don't auto-decode assets) so
    // the golden shows the actual official artwork, not the fallback tile.
    await tester.runAsync(() async {
      await precacheImage(
        const AssetImage('assets/icon/app_icon.png'),
        tester.element(find.byType(SplashScreen)),
      );
    });
    // Before the routing Timer fires — capture the splash.
    await tester.pump(const Duration(milliseconds: 500));
    expect(tester.takeException(), isNull);
    expect(find.byType(SplashScreen), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    await expectLater(
      find.byType(SplashScreen),
      matchesGoldenFile('goldens/splash_option_b_red.png'),
    );

    // Let the unchanged Timer fire → navigates away cleanly (no pending timer).
    await tester.pump(const Duration(milliseconds: 1300));
    await tester.pumpAndSettle();
    expect(find.byType(SplashScreen), findsNothing);
  });
}
