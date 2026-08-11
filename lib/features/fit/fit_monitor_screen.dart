import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import 'fit_charts.dart';
import 'fit_models.dart';
import 'sport_mood_display.dart';
import 'fit_providers.dart';
import 'fit_widgets.dart';

class FitMonitorScreen extends ConsumerWidget {
  const FitMonitorScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final access = ref.watch(fitAccessProvider);
    final locked = access != FitAccess.full;
    return Scaffold(
      appBar: AppBar(
        title: Text(l.t('fitMonitorTitle')),
        actions: [
          IconButton(
            tooltip: l.t('fitTodayTitle'),
            onPressed: () => context.push('/fit/today'),
            icon: const Icon(Icons.today_outlined),
          ),
        ],
      ),
      body: LockedProOverlay(
        locked: locked,
        paywallArgs: fitPaywallArgs('pro_monitor', 'pro_monitor'),
        child: _MonitorBody(preview: locked),
      ),
    );
  }
}

class _MonitorBody extends ConsumerWidget {
  const _MonitorBody({required this.preview});

  final bool preview;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    // valueOrNull: elak build ranap bila strim profil ralat (ISSUE 001.3).
    final profile = ref.watch(fitProfileProvider).valueOrNull;
    if (!preview && profile == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                l.t('fitSetupPrompt'),
                textAlign: TextAlign.center,
                style:
                    const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
              const SizedBox(height: 14),
              FilledButton(
                onPressed: () => context.go('/fit/onboarding'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primaryRed,
                  minimumSize: const Size(220, 48),
                ),
                child: Text(l.t('fitStartSetup')),
              ),
            ],
          ),
        ),
      );
    }

    // Ditonton SELEPAS pemeriksaan profil: nutritionTargetsProvider membaca
    // .value strim profil secara dalaman dan melempar semula ralat strim -
    // laluan biasa mesti selamat dahulu (ISSUE 001.3).
    final targets = ref.watch(nutritionTargetsProvider);
    final weekly = preview
        ? _sampleWeek()
        : ref.watch(weeklyMetricsProvider).value ?? const [];
    final bodyEntries = preview
        ? _sampleBody()
        : ref.watch(bodyEntriesProvider).value ?? const [];
    final workouts = preview
        ? _sampleWorkouts()
        : ref.watch(recentWorkoutsProvider).value ?? const [];
    // Phase 2.16A: the Pro production path must never fall back to sample data.
    // _sampleReport stays only behind the non-Pro locked preview (paywall).
    final report = preview
        ? _sampleReport(l)
        : ref.watch(fitWeeklyReportProvider).value ?? const <String, dynamic>{};

    final stepTarget = profile?.stepTarget.toDouble() ?? 8000;
    final labels = weekly.map((e) => _dayLabel(e.$1.weekday)).toList();
    final steps = weekly.map((e) => e.$2.steps.toDouble()).toList();
    final calories = weekly.map((e) => e.$2.caloriesIn.toDouble()).toList();
    final weight = bodyEntries
        .map((e) => (e['weightKg'] as num?)?.toDouble() ?? 0)
        .where((v) => v > 0)
        .toList();
    final score = weekly
        .map((e) => e.$2
            .fitScore(
                targets ??
                    const NutritionTargets(
                      calories: 1900,
                      proteinG: 120,
                      carbsG: 220,
                      fatG: 55,
                      waterMl: 2500,
                    ),
                stepTarget.round())
            .toDouble())
        .toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        FitSectionCard(
          title: l.t('fitWeeklyScore'),
          trailing: Builder(builder: (builderContext) {
            final streak =
                preview ? 3 : ref.watch(trainingStreakProvider);
            if (streak < 1) return const SizedBox.shrink();
            return Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.warmYellow.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$streak ${l.t('fitStreakDays')}',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: builderContext.mm.onCard,
                ),
              ),
            );
          }),
          child: WeeklyBarChart(
            values: score.isEmpty ? const [54, 62, 78, 0, 82, 74, 0] : score,
            dayLabels: labels.isEmpty
                ? const ['M', 'T', 'W', 'T', 'F', 'S', 'S']
                : labels,
            target: 75,
            color: AppColors.healthyGreen,
          ),
        ),
        FitSectionCard(
          title: l.t('fitStepsTrend'),
          child: WeeklyBarChart(
            values: steps.isEmpty
                ? const [4200, 6500, 8200, 7800, 9000, 0, 0]
                : steps,
            dayLabels: labels.isEmpty
                ? const ['M', 'T', 'W', 'T', 'F', 'S', 'S']
                : labels,
            target: stepTarget,
            color: const Color(0xFF0EA5E9),
          ),
        ),
        FitSectionCard(
          title: l.t('fitCaloriesTrend'),
          child: TrendLineChart(
            values: calories.isEmpty
                ? const [1800, 2050, 1950, 1700, 1880, 0, 0]
                : calories,
            target: (targets?.calories ?? 1900).toDouble(),
            labels: labels,
            color: AppColors.primaryRed,
          ),
        ),
        FitSectionCard(
          title: l.t('fitBodyTrend'),
          child: weight.length < 2
              ? Text(
                  l.t('fitBodyTrendEmpty'),
                  style: TextStyle(
                    color: context.mm.onCardMuted,
                    fontWeight: FontWeight.w600,
                  ),
                )
              : TrendLineChart(
                  values: weight,
                  color: AppColors.warningOrange,
                  labels: List.generate(weight.length, (i) => '${i + 1}'),
                ),
        ),
        FitSectionCard(
          title: l.t('fitWeeklyReport'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${report['coachSummary'] ?? ''}',
                style:
                    const TextStyle(fontWeight: FontWeight.w700, height: 1.45),
              ),
              const SizedBox(height: 10),
              ...((report['recommendations'] as List?) ?? const [])
                  .map((r) => _Recommendation(text: '$r')),
            ],
          ),
        ),
        FitSectionCard(
          title: l.t('fitRecentWorkouts'),
          child: workouts.isEmpty
              ? Text(
                  l.t('fitNoWorkoutYet'),
                  style: TextStyle(color: context.mm.onCardMuted),
                )
              : Column(
                  children: workouts
                      .take(5)
                      .map((w) => _WorkoutRow(data: w))
                      .toList(),
                ),
        ),
      ],
    );
  }

  static String _dayLabel(int weekday) =>
      const ['M', 'T', 'W', 'T', 'F', 'S', 'S'][weekday - 1];

  static List<(DateTime, DailyMetrics)> _sampleWeek() {
    final now = DateTime.now();
    final monday = now.subtract(Duration(days: now.weekday - 1));
    final metrics = [
      const DailyMetrics(
          caloriesIn: 1800, proteinG: 110, waterMl: 2200, steps: 4200),
      const DailyMetrics(
          caloriesIn: 2050, proteinG: 118, waterMl: 2600, steps: 6500),
      const DailyMetrics(
          caloriesIn: 1950,
          proteinG: 130,
          waterMl: 2800,
          steps: 8200,
          workoutCompleted: true),
      const DailyMetrics(
          caloriesIn: 1700, proteinG: 100, waterMl: 2400, steps: 7800),
      const DailyMetrics(
          caloriesIn: 1880,
          proteinG: 135,
          waterMl: 3000,
          steps: 9000,
          workoutCompleted: true),
      const DailyMetrics(),
      const DailyMetrics(),
    ];
    return List.generate(7, (i) => (monday.add(Duration(days: i)), metrics[i]));
  }

  static List<Map<String, dynamic>> _sampleBody() => const [
        {'weightKg': 72.0},
        {'weightKg': 71.7},
        {'weightKg': 71.4},
        {'weightKg': 71.1},
      ];

  static List<Map<String, dynamic>> _sampleWorkouts() => const [
        {
          'workoutName': 'Home Workout',
          'status': 'completed',
          'durationMinutes': 35
        },
        {
          'workoutName': 'Easy Run',
          'status': 'completed',
          'durationMinutes': 30
        },
      ];

  static Map<String, dynamic> _sampleReport(AppLocalizations l) => {
        'coachSummary': l.t('fitSampleReport'),
        'recommendations': [
          l.t('fitSampleRecProtein'),
          l.t('fitSampleRecSteps'),
        ],
      };
}

class _Recommendation extends StatelessWidget {
  const _Recommendation({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.check_circle_outline,
              size: 18, color: AppColors.healthyGreen),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}

class _WorkoutRow extends StatelessWidget {
  const _WorkoutRow({required this.data});

  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final status = data['status'] as String?;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.fitness_center, color: AppColors.primaryRed),
      title: Text(
        // Rekod legasi: ID stabil diutamakan, jatuh balik ke petikan teks.
        resolveSportMoodTitle(
          l,
          moodId: data['sportMood'] as String?,
          legacyName: data['workoutName'] as String?,
        ),
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
      subtitle: Text(switch (status) {
        'completed' => l.t('fitStatusCompleted'),
        'skipped' => l.t('fitStatusSkipped'),
        _ => status ?? '-',
      }),
      trailing: Text('${data['durationMinutes'] ?? '-'} min'),
    );
  }
}
