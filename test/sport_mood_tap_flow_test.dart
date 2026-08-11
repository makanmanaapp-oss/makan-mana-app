import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/constants/app_constants.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/providers/makanmana_user_context_provider.dart';
import 'package:makan_mana/features/fit/fit_models.dart';
import 'package:makan_mana/features/fit/fit_monitor_screen.dart';
import 'package:makan_mana/features/fit/fit_providers.dart';
import 'package:makan_mana/features/fit/sport_moods_data.dart';
import 'package:makan_mana/features/fit/sport_moods_screen.dart';
import 'package:makan_mana/features/fit/fit_widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// REGRESI PEPIJAT AUTO-EXIT SPORT MODE.
///
/// Harness GoRouter sebenar: hos -> push /fit/sport-moods -> stub paywall.
/// Mengesahkan kontrak pemilih: tap mood Pro menyimpan ID stabil, pop SEKALI
/// dengan hasil, tunjuk pengesahan; mood terkunci membuka gate SEKALI tanpa
/// meninggalkan pemilih; strim profil loading/ralat TIDAK menutup skrin.

late SharedPreferences _prefs;

class _Harness {
  _Harness({
    required this.access,
    this.profileStream,
    String language = 'ms',
    bool dark = false,
  })  : messengerKey = GlobalKey<ScaffoldMessengerState>(),
        container = ProviderContainer(overrides: [
          sharedPreferencesProvider.overrideWithValue(_prefs),
          fitAccessProvider.overrideWithValue(access),
          fitProfileProvider.overrideWith(
              (ref) => profileStream ?? Stream.value(null)),
          nearbyPlacesProvider.overrideWith((ref) async => const []),
        ]) {
    router = GoRouter(routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => Scaffold(
          body: Center(
            child: FilledButton(
              onPressed: () async {
                lastResult = await context.push<String>('/fit/sport-moods');
              },
              child: const Text('BUKA_SPORT_MOOD'),
            ),
          ),
        ),
      ),
      GoRoute(
        path: RoutePaths.fitSportMoods,
        builder: (context, state) => const SportMoodsScreen(),
      ),
      GoRoute(
        path: RoutePaths.paywall,
        builder: (context, state) =>
            const Scaffold(body: Center(child: Text('PAYWALL_STUB'))),
      ),
    ]);
    app = UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(
        scaffoldMessengerKey: messengerKey,
        theme: dark ? AppTheme.dark() : AppTheme.light(),
        locale: Locale(language),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        routerConfig: router,
      ),
    );
  }

  final FitAccess access;
  final Stream<FitnessProfile?>? profileStream;
  final ProviderContainer container;
  final GlobalKey<ScaffoldMessengerState> messengerKey;
  late final GoRouter router;
  late final Widget app;
  String? lastResult;

  void dispose() => container.dispose();
}

Future<void> _pump(WidgetTester tester, Widget app) async {
  await tester.pumpWidget(app);
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pump(const Duration(milliseconds: 300));
}

Future<void> _settle(WidgetTester tester) async {
  // Transisi laluan go_router ~300ms; beri masa penuh sebelum penegasan.
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pump(const Duration(milliseconds: 350));
  await tester.pump(const Duration(milliseconds: 350));
}

Future<void> _openPicker(WidgetTester tester) async {
  await tester.tap(find.text('BUKA_SPORT_MOOD'));
  await _settle(tester);
}

Future<void> _scrollToTile(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 250,
      scrollable: find.byType(Scrollable).first);
  await tester.pump(const Duration(milliseconds: 80));
}

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    _prefs = await SharedPreferences.getInstance();
  });

  testWidgets('Pemilih dibuka; kesemua 30 mood boleh dicapai melalui skrol',
      (tester) async {
    final h = _Harness(access: FitAccess.full);
    addTearDown(h.dispose);
    await tester.binding.setSurfaceSize(const Size(412, 892));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(tester, h.app);
    await _openPicker(tester);
    expect(find.byType(SportMoodsScreen), findsOneWidget);
    expect(kSportMoods, hasLength(30));
    final l = AppLocalizations(const Locale('ms'));
    // Mood pertama dan terakhir (skrol penuh) - semua kategori dilalui.
    expect(find.text(l.t(kSportMoods.first.titleKey)), findsWidgets);
    await _scrollToTile(
        tester, find.text(l.t(kSportMoods.last.titleKey)));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'Pro: tap SETIAP 30 mood -> simpan ID stabil, pop SEKALI, buka semula',
      (tester) async {
    final h = _Harness(access: FitAccess.full);
    addTearDown(h.dispose);
    await tester.binding.setSurfaceSize(const Size(412, 892));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(tester, h.app);
    final l = AppLocalizations(const Locale('ms'));

    for (final mood in kSportMoods) {
      expect(mood.id, isNotEmpty);
      await _openPicker(tester);
      expect(find.byType(SportMoodsScreen), findsOneWidget,
          reason: 'pemilih gagal dibuka semula sebelum ${mood.id}');
      final tile = find.text(l.t(mood.titleKey));
      await _scrollToTile(tester, tile);
      await tester.tap(tile.first, warnIfMissed: false);
      await _settle(tester);
      expect(tester.takeException(), isNull,
          reason: 'tap ${mood.id} melempar pengecualian');
      // Pop tepat SEKALI: kembali ke hos, bukan keluar terus dari app.
      expect(find.text('BUKA_SPORT_MOOD'), findsOneWidget,
          reason: 'selepas tap ${mood.id} bukan di hos (pop berganda?)');
      expect(find.byType(SportMoodsScreen), findsNothing);
      // Hasil pop = ID stabil (bukan label terjemahan).
      expect(h.lastResult, mood.id,
          reason: 'hasil pop untuk ${mood.id} ialah ${h.lastResult}');
      // Keadaan konteks menyimpan ID stabil yang sama.
      expect(h.container.read(makanManaUserContextProvider).sportMood,
          mood.id);
      h.messengerKey.currentState?.clearSnackBars();
      await tester.pump(const Duration(milliseconds: 50));
    }
    // ID unik kesemua 30.
    expect(kSportMoods.map((m) => m.id).toSet(), hasLength(30));
  });

  testWidgets('Pengesahan SnackBar dipaparkan selepas pilihan (bukan exit senyap)',
      (tester) async {
    final h = _Harness(access: FitAccess.full);
    addTearDown(h.dispose);
    await tester.binding.setSurfaceSize(const Size(412, 892));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(tester, h.app);
    await _openPicker(tester);
    final l = AppLocalizations(const Locale('ms'));
    await tester.tap(find.text(l.t('sportMoodFighterCampTitle')).first,
        warnIfMissed: false);
    await tester.pump(const Duration(milliseconds: 300));
    // >=1: semasa transisi pop, messenger merender snackbar pada kedua-dua
    // Scaffold berdaftar (kelakuan standard Flutter).
    expect(
      find.textContaining(l.t('sportMoodSelectedToast')),
      findsWidgets,
      reason: 'tiada pengesahan selepas pilihan',
    );
    h.messengerKey.currentState?.clearSnackBars();
    await tester.pump(const Duration(milliseconds: 50));
  });

  testWidgets('Keadaan dipilih kekal dipaparkan selepas buka semula '
      '(profil separa/tiada profil)', (tester) async {
    // Strim profil null = pengguna belum lengkap onboarding Fit. Sebelum
    // pembetulan, pilihan TIDAK pernah kelihatan untuk pengguna ini.
    final h = _Harness(access: FitAccess.full);
    addTearDown(h.dispose);
    await tester.binding.setSurfaceSize(const Size(412, 892));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(tester, h.app);
    await _openPicker(tester);
    final l = AppLocalizations(const Locale('ms'));
    await tester.tap(find.text(l.t('sportMoodFighterCampTitle')).first,
        warnIfMissed: false);
    await tester.pump(const Duration(milliseconds: 300));
    h.messengerKey.currentState?.clearSnackBars();
    await tester.pump(const Duration(milliseconds: 50));
    await _openPicker(tester);
    expect(find.byIcon(Icons.check_circle), findsOneWidget,
        reason: 'mood dipilih tidak ditanda selepas buka semula');
    expect(tester.takeException(), isNull);
  });

  testWidgets('Free/Plus: mood terkunci membuka paywall SEKALI; '
      'pemilih tidak hilang selepas kembali', (tester) async {
    final h = _Harness(access: FitAccess.preview);
    addTearDown(h.dispose);
    await tester.binding.setSurfaceSize(const Size(412, 892));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(tester, h.app);
    await _openPicker(tester);
    final l = AppLocalizations(const Locale('ms'));
    await tester.tap(find.text(l.t('sportMoodFighterCampTitle')).first,
        warnIfMissed: false);
    await _settle(tester);
    // Gate dibuka sekali sahaja.
    expect(find.text('PAYWALL_STUB'), findsOneWidget);
    expect(tester.takeException(), isNull);
    // Kembali: pemilih masih ada (laluan tidak hilang).
    h.router.pop();
    await _settle(tester);
    expect(find.byType(SportMoodsScreen), findsOneWidget,
        reason: 'pemilih hilang selepas kembali dari paywall');
    // Tiada pilihan disimpan untuk pengguna terkunci.
    expect(h.container.read(makanManaUserContextProvider).sportMood, 'none');
  });

  testWidgets('Strim profil LOADING tidak menutup pemilih', (tester) async {
    final h = _Harness(
      access: FitAccess.full,
      // Strim tidak pernah memancarkan nilai.
      profileStream: const Stream<FitnessProfile?>.empty(),
    );
    addTearDown(h.dispose);
    await tester.binding.setSurfaceSize(const Size(412, 892));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(tester, h.app);
    await _openPicker(tester);
    expect(find.byType(SportMoodsScreen), findsOneWidget,
        reason: 'keadaan loading menutup pemilih');
    expect(tester.takeException(), isNull);
  });

  testWidgets('Strim profil RALAT tidak menutup/meranapkan pemilih',
      (tester) async {
    final h = _Harness(
      access: FitAccess.full,
      profileStream:
          Stream<FitnessProfile?>.error(Exception('ujian ralat strim')),
    );
    addTearDown(h.dispose);
    await tester.binding.setSurfaceSize(const Size(412, 892));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(tester, h.app);
    await _openPicker(tester);
    final caught = tester.takeException();
    if (caught != null) {
      expect('$caught', contains('ujian ralat strim'),
          reason: 'pengecualian tidak dijangka: $caught');
    }
    expect(find.byType(SportMoodsScreen), findsOneWidget,
        reason: 'keadaan ralat menutup pemilih (regresi .value)');
    // Jubin masih boleh dirender.
    final l = AppLocalizations(const Locale('ms'));
    expect(find.text(l.t('sportMoodFighterCampTitle')), findsWidgets);
  });

  testWidgets(
      'nutritionTargetsProvider: strim ralat TIDAK meranapkan pratonton Monitor',
      (tester) async {
    final h = _Harness(
      access: FitAccess.preview,
      profileStream:
          Stream<FitnessProfile?>.error(Exception('ujian ralat strim')),
    );
    addTearDown(h.dispose);
    await tester.binding.setSurfaceSize(const Size(412, 892));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(UncontrolledProviderScope(
      container: h.container,
      child: MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('ms'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: const FitMonitorScreen(),
      ),
    ));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 400));
    final caught = tester.takeException();
    if (caught != null) {
      expect('$caught', contains('ujian ralat strim'),
          reason: 'pratonton Monitor ranap: $caught');
    }
    expect(find.byType(LockedProOverlay), findsOneWidget,
        reason: 'pratonton Monitor tidak dirender');
  });

  testWidgets('Tukar bahasa TIDAK membatalkan ID pilihan', (tester) async {
    final h = _Harness(access: FitAccess.full);
    addTearDown(h.dispose);
    await tester.binding.setSurfaceSize(const Size(412, 892));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(tester, h.app);
    await _openPicker(tester);
    final ms = AppLocalizations(const Locale('ms'));
    await tester.tap(find.text(ms.t('sportMoodEasyRunTitle')).first,
        warnIfMissed: false);
    await tester.pump(const Duration(milliseconds: 300));
    h.messengerKey.currentState?.clearSnackBars();
    await tester.pump(const Duration(milliseconds: 50));
    expect(h.container.read(makanManaUserContextProvider).sportMood,
        'easyRun');

    // App zh baharu BERKONGSI container - pilihan mesti kekal easyRun.
    final zhApp = UncontrolledProviderScope(
      container: h.container,
      child: MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('zh'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: const SportMoodsScreen(),
      ),
    );
    await tester.pumpWidget(zhApp);
    await tester.pump(const Duration(milliseconds: 300));
    expect(h.container.read(makanManaUserContextProvider).sportMood,
        'easyRun', reason: 'tukar bahasa membatalkan pilihan');
    // Jubin zh yang dipilih ditanda (label zh, ID sama).
    final zh = AppLocalizations(const Locale('zh'));
    await _scrollToTile(tester, find.text(zh.t('sportMoodEasyRunTitle')));
    expect(find.byIcon(Icons.check_circle), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Mod Gelap: pemilih + pilihan kekal, tiada ralat',
      (tester) async {
    final h = _Harness(access: FitAccess.full, dark: true);
    addTearDown(h.dispose);
    await tester.binding.setSurfaceSize(const Size(412, 892));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(tester, h.app);
    await _openPicker(tester);
    expect(find.byType(SportMoodsScreen), findsOneWidget);
    final l = AppLocalizations(const Locale('ms'));
    await tester.tap(find.text(l.t('sportMoodFighterCampTitle')).first,
        warnIfMissed: false);
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.takeException(), isNull);
    expect(h.lastResult, 'fighterCamp');
    h.messengerKey.currentState?.clearSnackBars();
    await tester.pump(const Duration(milliseconds: 50));
  });

  testWidgets('Back berfungsi sekali; buka semula berfungsi', (tester) async {
    final h = _Harness(access: FitAccess.full);
    addTearDown(h.dispose);
    await tester.binding.setSurfaceSize(const Size(412, 892));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(tester, h.app);
    await _openPicker(tester);
    // Back manual (tiada tap mood).
    await tester.tap(find.byType(BackButton));
    await _settle(tester);
    expect(find.text('BUKA_SPORT_MOOD'), findsOneWidget);
    expect(tester.takeException(), isNull);
    // Buka semula tanpa ranap.
    await _openPicker(tester);
    expect(find.byType(SportMoodsScreen), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
