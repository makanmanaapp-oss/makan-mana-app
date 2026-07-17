import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/constants/app_colors.dart';
import 'package:makan_mana/core/widgets/app_chip.dart';
import 'package:makan_mana/core/widgets/app_states.dart';
import 'package:makan_mana/core/widgets/mm_icons.dart';

/// QA REGRESI AKHIR BRIGHT MODE: ujian tipografi/responsif tahan lama.
/// Harness saiz logik + textScale tanpa Firebase (widget presentasi tulen).
Widget _harness(Widget child, {double scale = 1.0}) => MaterialApp(
      theme: AppTheme.light(),
      home: MediaQuery(
        data: MediaQueryData(
          size: const Size(360, 800),
          textScaler: TextScaler.linear(scale),
        ),
        child: Scaffold(body: Center(child: child)),
      ),
    );

void main() {
  testWidgets('AppChip label Tamil panjang @360dp 1.30 tiada overflow',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 800));
    await tester.pumpWidget(_harness(
      const SizedBox(
        width: 360,
        child: Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            AppChip(label: 'சைவம் மட்டும் உணவு விருப்பம்', selected: true),
            AppChip(label: 'ஆரோக்கியமான உணவுகள்', icon: MmIconType.healthy),
          ],
        ),
      ),
      scale: 1.30,
    ));
    expect(tester.takeException(), isNull,
        reason: 'chip mesti tiada RenderFlex overflow pada 1.30');
  });

  testWidgets('AppChip harga/label BM @1.15 render bersih', (tester) async {
    await tester.pumpWidget(_harness(
      const Wrap(
        spacing: 8,
        children: [
          AppChip(label: 'RM8 - RM30', icon: MmIconType.bajet),
          AppChip(label: 'Berhampiran', icon: MmIconType.berhampiran),
        ],
      ),
      scale: 1.15,
    ));
    expect(tester.takeException(), isNull);
    expect(find.text('RM8 - RM30'), findsOneWidget);
  });

  testWidgets('MmIcon render 20/24/28px tanpa ralat lukisan', (tester) async {
    await tester.pumpWidget(_harness(
      Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final s in [20.0, 24.0, 28.0]) ...[
            MmIcon(MmIconType.spin, size: s),
            MmIcon(MmIconType.pedas, size: s),
            MmIcon(MmIconType.tongtongBill, size: s),
            MmIcon(MmIconType.groupDecision, size: s),
          ],
        ],
      ),
    ));
    expect(tester.takeException(), isNull);
  });

  testWidgets('AppEmptyState @360dp 1.30 tiada overflow', (tester) async {
    await tester.pumpWidget(_harness(
      AppEmptyState(
        icon: MmIconType.mealHistory,
        title: 'Belum ada rekod makan lagi. '
            'Spin dan terima cadangan untuk mula!',
        message: 'Penjelasan tambahan yang agak panjang untuk menguji '
            'pembalutan teks pada skala 1.30 tanpa keratan.',
        ctaLabel: 'Spin sekarang',
        onCta: () {},
      ),
      scale: 1.30,
    ));
    expect(tester.takeException(), isNull);
  });

  testWidgets('DARK: AppChip dipilih = kuning + TEKS GELAP (bukan putih)',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.dark(),
      home: const Scaffold(
        body: Center(child: AppChip(label: 'Lapar', selected: true)),
      ),
    ));
    final text = tester.widget<Text>(find.text('Lapar'));
    expect(text.style?.color, AppColors.darkText,
        reason: 'teks chip dipilih mesti gelap atas kuning dlm mod gelap');
    expect(tester.takeException(), isNull);
  });

  testWidgets('DARK: AppEmptyState & MmIcon render tanpa ralat',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.dark(),
      home: Scaffold(
        body: AppEmptyState(
          icon: MmIconType.mealHistory,
          title: 'Tiada rekod',
          message: 'Permukaan gelap mesti kekal terbaca.',
          ctaLabel: 'Spin',
          onCta: () {},
        ),
      ),
    ));
    expect(tester.takeException(), isNull);
  });

  test('DARK: token ZIP betul & Bright tidak berubah', () {
    // Dark ikut ZIP.
    expect(MMColors.dark.appBackground.toARGB32(), 0xFF0F1115);
    expect(MMColors.dark.card.toARGB32(), 0xFF171A20);
    expect(MMColors.dark.elevatedCard.toARGB32(), 0xFF1E2229);
    expect(MMColors.dark.onCard.toARGB32(), 0xFFF5F7FA);
    expect(MMColors.dark.chipSelectedBackground.toARGB32(), 0xFFF6D778);
    // Bright DILINDUNGI — nilai diluluskan owner tidak berubah.
    expect(MMColors.light.appBackground.toARGB32(), 0xFFFFF9F2);
    expect(MMColors.light.card.toARGB32(), 0xFFFFFFFF);
    expect(MMColors.light.onCard.toARGB32(), 0xFF1C1D20);
    expect(MMColors.light.border.toARGB32(), 0xFFE4E1DC);
    expect(MMColors.light.chipSelectedBackground.toARGB32(), 0xFFF6D778);
  });

  test('l10n: fitCoachTeaser zh/ta BUKAN placeholder English', () {
    final en = AppLocalizations(const Locale('en')).t('fitCoachTeaser');
    final zh = AppLocalizations(const Locale('zh')).t('fitCoachTeaser');
    final ta = AppLocalizations(const Locale('ta')).t('fitCoachTeaser');
    expect(zh, isNot(en), reason: 'zh mesti diterjemah');
    expect(ta, isNot(en), reason: 'ta mesti diterjemah');
    // Kunci gate/keselamatan turut diterjemah.
    for (final k in [
      'fitSetupPrompt',
      'fitWorkoutDone',
      'fitLockedTitle',
      'fitUpgradeCta',
      'fitPainWarning',
    ]) {
      expect(AppLocalizations(const Locale('zh')).t(k),
          isNot(AppLocalizations(const Locale('en')).t(k)),
          reason: '$k zh masih English');
      expect(AppLocalizations(const Locale('ta')).t(k),
          isNot(AppLocalizations(const Locale('en')).t(k)),
          reason: '$k ta masih English');
    }
  });

  test('l10n: semua bahasa ada set kunci yang sama (tiada fallback senyap)',
      () {
    const probe = [
      'navHome',
      'navExplore',
      'navHistory',
      'navProfile',
      'tagline',
      'searchHint',
      'moodTitle',
      'aiPickTitle',
      'nearbyTitle',
      'paywallTitle',
      'planFree',
      'planPlus',
      'planPro',
      'fitCoachTitle',
      'fitCoachTeaser',
    ];
    for (final lang in ['ms', 'en', 'zh', 'ta']) {
      final l = AppLocalizations(Locale(lang));
      for (final k in probe) {
        expect(l.t(k), isNot(k), reason: 'kunci $k hilang untuk bahasa $lang');
      }
    }
  });

  test('l10n: Fit zh dan ta tiada lagi placeholder English', () {
    const completedFitKeys = [
      'fitSetupTitle',
      'fitSetupBody',
      'fitBodyBasics',
      'fitHeight',
      'fitWeight',
      'fitAge',
      'fitGender',
      'fitMale',
      'fitFemale',
      'fitGoalTitle',
      'fitGoalHealthy',
      'fitGoalFatLoss',
      'fitGoalLean',
      'fitGoalRecomp',
      'fitGoalMuscle',
      'fitGoalSport',
      'fitLevel',
      'fitLevelBeginner',
      'fitLevelIntermediate',
      'fitLevelAdvanced',
      'fitLevelAthlete',
      'fitTrainingPref',
      'fitDaysPerWeek',
      'fitSessionDuration',
      'fitTargets',
      'fitBudgetMin',
      'fitBudgetMax',
      'fitStepTarget',
      'fitSaveProfile',
      'fitStartSetup',
      'fitEditProfile',
      'fitTodayTitle',
      'fitNutritionTargets',
      'fitWater',
      'fitLogWater',
      'fitLogSteps',
      'fitLogWeight',
      'fitWorkoutToday',
      'fitChangeMood',
      'fitFinishWorkout',
      'fitMenuSuggestions',
      'fitMonitorTitle',
      'fitWeeklyScore',
      'fitStepsTrend',
      'fitCaloriesTrend',
      'fitBodyTrend',
      'fitBodyTrendEmpty',
      'fitWeeklyReport',
      'fitRecentWorkouts',
      'fitNoWorkoutYet',
      'fitSampleReport',
      'fitSampleRecProtein',
      'fitSampleRecSteps',
      'fitSportMoodTitle',
      'fitSportMoodIntro',
    ];
    final en = AppLocalizations(const Locale('en'));
    for (final language in ['zh', 'ta']) {
      final translated = AppLocalizations(Locale(language));
      for (final key in completedFitKeys) {
        expect(translated.t(key), isNot(en.t(key)),
            reason: '$key masih sama dengan English untuk $language');
      }
    }
  });

  // 919 kunci asal + 334 kunci Sport Mood/blok senaman + 5 kunci UI statik
  // (ISSUE 001.2).
  test('l10n: semua 1258 kunci dan parameter sepadan', () {
    final msKeys = AppLocalizations.keysForTesting(const Locale('ms'));
    expect(msKeys, hasLength(1258));
    final placeholder = RegExp(r'\{[^}]+\}');
    final msValues = AppLocalizations.valuesForTesting(const Locale('ms'));
    for (final language in ['en', 'zh', 'ta']) {
      final locale = Locale(language);
      expect(AppLocalizations.keysForTesting(locale), equals(msKeys),
          reason: 'set kunci $language mesti sepadan dengan ms');
      final values = AppLocalizations.valuesForTesting(locale);
      for (final key in msKeys) {
        expect(
            placeholder
                .allMatches(values[key]!)
                .map((m) => m.group(0))
                .toList(),
            equals(placeholder
                .allMatches(msValues[key]!)
                .map((m) => m.group(0))
                .toList()),
            reason: 'parameter $key tidak sepadan untuk $language');
      }
    }
  });

  // Regresi ISSUE 001.2: 55 kunci Fit ISSUE 001.1 pernah dimasukkan ke dalam
  // blok locale yang salah (en menyimpan salinan Cina, zh menyimpan Tamil, ta
  // menyimpan English). Ujian parity lama terlepas kerana zh != en kekal benar
  // walaupun nilainya berputar. Semakan skrip ini menangkap kelas pepijat itu.
  test('l10n: nilai berada dalam blok locale yang betul (semakan skrip)', () {
    final cjk = RegExp(r'[一-鿿]');
    final tamil = RegExp(r'[஀-௿]');

    final en = AppLocalizations.valuesForTesting(const Locale('en'));
    for (final entry in en.entries) {
      expect(cjk.hasMatch(entry.value), isFalse,
          reason: 'nilai en ${entry.key} mengandungi aksara Cina');
      expect(tamil.hasMatch(entry.value), isFalse,
          reason: 'nilai en ${entry.key} mengandungi aksara Tamil');
    }

    final zh = AppLocalizations.valuesForTesting(const Locale('zh'));
    for (final entry in zh.entries) {
      expect(tamil.hasMatch(entry.value), isFalse,
          reason: 'nilai zh ${entry.key} mengandungi aksara Tamil');
    }

    final ta = AppLocalizations.valuesForTesting(const Locale('ta'));
    for (final entry in ta.entries) {
      expect(cjk.hasMatch(entry.value), isFalse,
          reason: 'nilai ta ${entry.key} mengandungi aksara Cina');
    }

    final ms = AppLocalizations.valuesForTesting(const Locale('ms'));
    for (final entry in ms.entries) {
      expect(cjk.hasMatch(entry.value), isFalse,
          reason: 'nilai ms ${entry.key} mengandungi aksara Cina');
      expect(tamil.hasMatch(entry.value), isFalse,
          reason: 'nilai ms ${entry.key} mengandungi aksara Tamil');
    }
  });

  test('l10n: salinan sistem Melayu tidak menggunakan istilah tidak formal',
      () {
    final values = AppLocalizations.valuesForTesting(const Locale('ms'));
    final informal = RegExp(r'\b(?:kau|korang)\b', caseSensitive: false);
    for (final entry in values.entries) {
      expect(entry.value, isNot(matches(informal)),
          reason: '${entry.key} masih menggunakan salinan tidak formal');
    }
  });
}
