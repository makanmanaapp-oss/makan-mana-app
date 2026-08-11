import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/features/fit/fit_log_sheets.dart';
import 'package:makan_mana/features/fit/fit_models.dart';
import 'package:makan_mana/features/fit/fit_monitor_screen.dart';
import 'package:makan_mana/features/fit/fit_onboarding_screen.dart';
import 'package:makan_mana/features/fit/fit_providers.dart';
import 'package:makan_mana/features/fit/fit_today_screen.dart';
import 'package:makan_mana/features/fit/fit_widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// QA VIEWPORT FIT (ISSUE 001.3).
///
/// Merender skrin Fit SEBENAR (Setup, Today, Monitor, sheet) tanpa Firebase:
/// firebaseReadyProvider sudah lalai false (semua provider Fit selamat dalam
/// keadaan itu), sharedPreferencesProvider ditindih dengan mock, dan hanya
/// provider strim/masa depan yang perlu data ujian ditindih secara eksplisit.
/// Tiada tingkah laku provider produksi diubah.

const _profiles = [
  (label: '360dp @ 1.30', size: Size(360, 800), scale: 1.30),
  (label: '390dp @ 1.15', size: Size(390, 844), scale: 1.15),
  (label: '412dp @ 1.00', size: Size(412, 892), scale: 1.00),
];

const _languages = ['ms', 'en', 'zh', 'ta'];

/// Profil penuh: hari latihan (preferredTrainingDays kosong = setiap hari),
/// mood fighterCamp supaya pelan janaan penuh (warmup + main + cooldown)
/// dan nota jurulatih fatLoss dipaparkan.
const _profile = FitnessProfile(
  heightCm: 170,
  weightKg: 70,
  age: 28,
  gender: 'male',
  mainGoal: 'fatLoss',
  fitnessLevel: 'beginner',
  selectedSportMood: 'fighterCamp',
);

/// Rekod workout_sessions legasi untuk baris Fit Monitor:
/// 1) ID stabil + petikan — laluan keutamaan 1.
/// 2) Petikan English sahaja (tiada ID) — laluan alias.
/// 3) Nilai tidak dikenali — mesti dikekalkan bulat-bulat.
const _legacyWorkouts = [
  {
    'sportMood': 'easyRun',
    'workoutName': 'Easy Run',
    'status': 'completed',
    'durationMinutes': 30,
    'date': '20260710',
  },
  {
    'workoutName': 'Fighter Camp',
    'status': 'skipped',
    'durationMinutes': 60,
    'date': '20260709',
  },
  {
    'workoutName': 'Sesi Lama Saya',
    'status': 'completed',
    'durationMinutes': 20,
    'date': '20260708',
  },
];

/// Corak kunci localization mentah - TIDAK boleh muncul sebagai teks paparan.
final _rawKeyPattern = RegExp(
    r'^(sportMood|sportWorkout|sportWarmup|sportCooldown|fitCoachNote|'
    r'advPref|legalMalayOnly|shareInvite|fit[A-Z])[A-Za-z0-9]*$');

late SharedPreferences _prefs;

Widget _harness({
  required Widget child,
  required String language,
  required double scale,
  required Size size,
  required bool dark,
  FitAccess access = FitAccess.full,
  Stream<FitnessProfile?>? profileStream,
  List<Map<String, dynamic>>? workouts,
}) {
  return ProviderScope(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(_prefs),
      fitAccessProvider.overrideWithValue(access),
      fitProfileProvider
          .overrideWith((ref) => profileStream ?? Stream.value(_profile)),
      nearbyPlacesProvider.overrideWith((ref) async => const []),
      if (workouts != null)
        recentWorkoutsProvider.overrideWith((ref) => Stream.value(workouts)),
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
        child: child,
      ),
    ),
  );
}

/// Pam berbatas (tiada pumpAndSettle - selamat terhadap animasi berterusan).
Future<void> _pump(WidgetTester tester, Widget widget) async {
  await tester.pumpWidget(widget);
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pump(const Duration(milliseconds: 400));
}

/// Skrol sehingga [finder] kelihatan - ListView membina anak secara malas,
/// jadi baris bawah lipatan hanya wujud (dan hanya boleh melimpah) selepas
/// skrol. Ini juga menjadikan QA overflow meliputi kandungan luar skrin.
Future<void> _scrollTo(WidgetTester tester, Finder finder,
    {String? reason}) async {
  // NOTA: jangan guna finder.first di sini - .first melempar StateError
  // semasa penilaian apabila padanan masih kosong, mematikan skrol serta-
  // merta. Finder mentah dinilai selamat (isEmpty -> terus skrol).
  try {
    await tester.scrollUntilVisible(finder, 250,
        scrollable: find.byType(Scrollable).first);
  } on StateError {
    fail(reason ?? 'tidak dijumpai selepas skrol: $finder');
  }
  await tester.pump(const Duration(milliseconds: 100));
}

/// Sapuan ke hujung senarai: bina semua baris malas sambil memeriksa
/// pengecualian overflow pada setiap langkah.
Future<void> _sweepToEnd(WidgetTester tester, String context) async {
  for (var i = 0; i < 8; i++) {
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -600),
        warnIfMissed: false);
    await tester.pump(const Duration(milliseconds: 60));
    expect(tester.takeException(), isNull,
        reason: 'overflow semasa skrol ($context, langkah $i)');
  }
}

/// Tiada kunci localization mentah bocor sebagai teks paparan.
void _expectNoRawKeys(WidgetTester tester, String context) {
  for (final t in tester.widgetList<Text>(find.byType(Text))) {
    final data = t.data;
    if (data != null) {
      expect(_rawKeyPattern.hasMatch(data.trim()), isFalse,
          reason: 'kunci mentah "$data" dipaparkan pada $context');
      expect(data, isNot(contains('�')),
          reason: 'aksara pengganti pada $context');
    }
  }
}

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    _prefs = await SharedPreferences.getInstance();
  });

  for (final p in _profiles) {
    for (final language in _languages) {
      for (final dark in [false, true]) {
        final mode = dark ? 'Dark' : 'Bright';
        final tag = '$language ${p.label} $mode';
        final l = AppLocalizations(Locale(language));

        Future<void> run(
          WidgetTester tester,
          Widget child, {
          FitAccess access = FitAccess.full,
          Stream<FitnessProfile?>? profileStream,
          List<Map<String, dynamic>>? workouts,
        }) async {
          await tester.binding.setSurfaceSize(p.size);
          addTearDown(() => tester.binding.setSurfaceSize(null));
          await _pump(
            tester,
            _harness(
              child: child,
              language: language,
              scale: p.scale,
              size: p.size,
              dark: dark,
              access: access,
              profileStream: profileStream,
              workouts: workouts,
            ),
          );
        }

        // ---------- 1. Fit Setup (onboarding) + ringkasan mood dipilih ----
        testWidgets('Fit Setup $tag', (tester) async {
          await run(tester, const FitOnboardingScreen());
          expect(tester.takeException(), isNull, reason: 'overflow pada $tag');
          expect(find.text(l.t('fitSetupTitle')), findsOneWidget);
          // Ringkasan Sport Mood dipilih (lalai homeWorkout) diselesaikan.
          await _scrollTo(tester, find.text(l.t('sportMoodHomeWorkoutTitle')),
              reason: 'ringkasan mood tidak dijumpai pada $tag');
          expect(find.text(l.t('sportMoodHomeWorkoutPurpose')), findsWidgets);
          _expectNoRawKeys(tester, 'Fit Setup $tag');
          await _sweepToEnd(tester, 'Fit Setup $tag');
        });

        // ---------- 2. Fit Today penuh + pelan workout janaan --------------
        testWidgets('Fit Today penuh $tag', (tester) async {
          await run(tester, const FitTodayScreen());
          expect(tester.takeException(), isNull, reason: 'overflow pada $tag');
          // Tajuk pelan janaan diselesaikan dari peta bahasa aktif.
          await _scrollTo(tester, find.text(l.t('sportMoodFighterCampTitle')),
              reason: 'tajuk workout janaan tidak dipaparkan pada $tag');
          // Nota jurulatih (mainGoal fatLoss) diselesaikan.
          await _scrollTo(tester, find.text(l.t('fitCoachNoteFatLoss')),
              reason: 'nota jurulatih tidak dijumpai pada $tag');
          _expectNoRawKeys(tester, 'Fit Today $tag');
          await _sweepToEnd(tester, 'Fit Today $tag');
        });

        // ---------- 3. Blok pelan janaan (warmup + main) --------------------
        testWidgets('Pelan janaan blok $tag', (tester) async {
          await run(tester, const FitTodayScreen());
          expect(tester.takeException(), isNull);
          // Blok warm-up kongsi & blok utama fighterCamp diselesaikan.
          final warmup = l.t('sportWarmupBriskWalkName');
          final mainBlock = l.t('sportWorkoutFighterCampSkippingName');
          await _scrollTo(
            tester,
            find.textContaining(warmup, findRichText: true),
            reason: 'blok warm-up tidak dijumpai pada $tag',
          );
          expect(
            find.textContaining(mainBlock, findRichText: true),
            findsWidgets,
            reason: 'blok utama tidak dijumpai pada $tag',
          );
        });

        // ---------- 4. Fit Today terkunci (Pro locked preview) --------------
        testWidgets('Fit Today terkunci $tag', (tester) async {
          await run(tester, const FitTodayScreen(),
              access: FitAccess.preview);
          expect(tester.takeException(), isNull, reason: 'overflow pada $tag');
          expect(find.byType(LockedProOverlay), findsOneWidget);
          _expectNoRawKeys(tester, 'Fit Today terkunci $tag');
        });

        // ---------- 5. Fit Today kosong (tiada profil) ----------------------
        testWidgets('Fit Today kosong $tag', (tester) async {
          await run(tester, const FitTodayScreen(),
              profileStream: Stream.value(null));
          expect(tester.takeException(), isNull, reason: 'overflow pada $tag');
          // Tindakan utama mesti kelihatan (tiada tindakan tersembunyi).
          expect(find.text(l.t('fitSetupPrompt')), findsOneWidget);
          final cta = find.text(l.t('fitStartSetup'));
          expect(cta, findsOneWidget);
          expect(tester.getSize(cta).height, greaterThan(0));
          _expectNoRawKeys(tester, 'Fit Today kosong $tag');
        });

        // ---------- 6. Fit Today ralat (strim profil gagal) -----------------
        testWidgets('Fit Today ralat $tag', (tester) async {
          await run(tester, const FitTodayScreen(),
              profileStream:
                  Stream<FitnessProfile?>.error(Exception('ujian ralat')));
          // Ralat strim yang disuntik dilaporkan ke zon ujian - itu dijangka.
          // Apa-apa pengecualian LAIN (overflow, ralat lukisan) mesti gagal.
          final caught = tester.takeException();
          if (caught != null) {
            expect('$caught', contains('ujian ralat'),
                reason: 'pengecualian tidak dijangka pada $tag: $caught');
          }
          // Ralat profil jatuh ke keadaan persediaan yang selamat.
          expect(find.text(l.t('fitSetupPrompt')), findsOneWidget);
          _expectNoRawKeys(tester, 'Fit Today ralat $tag');
        });

        // ---------- 7. Fit Monitor penuh + baris legasi ---------------------
        testWidgets('Fit Monitor legasi $tag', (tester) async {
          await run(tester, const FitMonitorScreen(),
              workouts: _legacyWorkouts);
          expect(tester.takeException(), isNull, reason: 'overflow pada $tag');
          // Laluan 1: ID stabil diselesaikan ke bahasa aktif.
          await _scrollTo(tester, find.text(l.t('sportMoodEasyRunTitle')),
              reason: 'baris legasi (ID) tidak diselesaikan pada $tag');
          // Laluan alias: petikan English tanpa ID.
          expect(find.text(l.t('sportMoodFighterCampTitle')), findsWidgets,
              reason: 'baris legasi (alias) tidak diselesaikan pada $tag');
          // Nilai tidak dikenali dikekalkan bulat-bulat.
          await _scrollTo(tester, find.text('Sesi Lama Saya'),
              reason: 'nilai legasi tidak dikenali hilang pada $tag');
          _expectNoRawKeys(tester, 'Fit Monitor $tag');
          await _sweepToEnd(tester, 'Fit Monitor $tag');
        });

        // ---------- 8. Fit Monitor pratonton terkunci -----------------------
        testWidgets('Fit Monitor pratonton $tag', (tester) async {
          await run(tester, const FitMonitorScreen(),
              access: FitAccess.preview);
          expect(tester.takeException(), isNull, reason: 'overflow pada $tag');
          expect(find.byType(LockedProOverlay), findsOneWidget);
          _expectNoRawKeys(tester, 'Fit Monitor pratonton $tag');
        });

        // ---------- 9. Bottom sheet: log makanan ----------------------------
        testWidgets('Sheet log makanan $tag', (tester) async {
          await run(
            tester,
            Consumer(builder: (context, ref, _) {
              return Scaffold(
                body: Center(
                  child: FilledButton(
                    onPressed: () => showMealLogSheet(context, ref),
                    child: const Text('buka'),
                  ),
                ),
              );
            }),
          );
          await tester.tap(find.text('buka'));
          await tester.pump(const Duration(milliseconds: 400));
          expect(tester.takeException(), isNull,
              reason: 'sheet log makanan melimpah pada $tag');
          _expectNoRawKeys(tester, 'sheet log makanan $tag');
        });

        // ---------- 10. Bottom sheet: input nombor --------------------------
        testWidgets('Sheet nombor $tag', (tester) async {
          await run(
            tester,
            Builder(builder: (context) {
              return Scaffold(
                body: Center(
                  child: FilledButton(
                    onPressed: () => showNumberSheet(
                      context,
                      title: AppLocalizations.of(context).t('fitLogWater'),
                      unit: 'ml',
                      quickValues: const [250, 500, 750],
                      onSave: (_) {},
                    ),
                    child: const Text('buka'),
                  ),
                ),
              );
            }),
          );
          await tester.tap(find.text('buka'));
          await tester.pump(const Duration(milliseconds: 400));
          expect(tester.takeException(), isNull,
              reason: 'sheet nombor melimpah pada $tag');
          expect(find.text(l.t('fitLogWater')), findsWidgets);
          _expectNoRawKeys(tester, 'sheet nombor $tag');
        });

        // ---------- 11. Bottom sheet: maklum balas workout -------------------
        testWidgets('Sheet maklum balas workout $tag', (tester) async {
          await run(
            tester,
            Consumer(builder: (context, ref, _) {
              return Scaffold(
                body: Center(
                  child: FilledButton(
                    onPressed: () {
                      final plan = ref
                          .read(fitServiceProvider)
                          .generateDailyPlan(_profile);
                      showWorkoutFeedbackSheet(context, ref, plan);
                    },
                    child: const Text('buka'),
                  ),
                ),
              );
            }),
          );
          await tester.tap(find.text('buka'));
          await tester.pump(const Duration(milliseconds: 400));
          expect(tester.takeException(), isNull,
              reason: 'sheet maklum balas melimpah pada $tag');
          expect(find.text(l.t('fitFbDone')), findsWidgets);
          _expectNoRawKeys(tester, 'sheet maklum balas $tag');
        });
      }
    }
  }
}
