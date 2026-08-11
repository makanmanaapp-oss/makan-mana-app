import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import 'fit_charts.dart';
import 'fit_log_sheets.dart';
import 'fit_models.dart';
import 'fit_providers.dart';
import 'fit_widgets.dart';
import 'sport_mood_display.dart';

class FitTodayScreen extends ConsumerWidget {
  const FitTodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final access = ref.watch(fitAccessProvider);
    if (access != FitAccess.full) {
      return Scaffold(
        appBar: AppBar(title: Text(l.t('fitCoachTitle'))),
        body: LockedProOverlay(
          locked: true,
          paywallArgs: fitPaywallArgs('fit_coach', 'fit_coach'),
          child: _SampleToday(l: l),
        ),
      );
    }

    // valueOrNull: .value melempar semula ralat strim semasa build (skrin
    // ranap ke ErrorWidget). Ralat profil dilayan sama seperti belum ada
    // profil - jatuh ke keadaan persediaan yang selamat (QA ISSUE 001.3).
    final profile = ref.watch(fitProfileProvider).valueOrNull;
    if (profile == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l.t('fitCoachTitle'))),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.monitor_heart_outlined,
                    size: 56, color: AppColors.primaryRed),
                const SizedBox(height: 14),
                Text(
                  l.t('fitSetupPrompt'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
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
        ),
      );
    }

    final targets = ref.watch(nutritionTargetsProvider);
    final metrics =
        ref.watch(todayMetricsProvider).value ?? const DailyMetrics();
    final plan = ref.watch(todayPlanProvider);
    final score = ref.watch(dailyFitScoreProvider) ?? 0;
    final nearby = ref.watch(nearbyPlacesProvider).value ?? const [];
    final menus = targets == null
        ? const <MenuSuggestion>[]
        : ref.watch(fitServiceProvider).suggestMenus(
              profile: profile,
              targets: targets,
              today: metrics,
              nearby: nearby,
              trainingDay: plan?.isRestDay != true,
              logShown: false,
            );
    final insight = targets == null
        ? l.t('fitSetupPrompt')
        : ref.watch(fitServiceProvider).coachInsight(
              profile: profile,
              targets: targets,
              today: metrics,
              fitScore: score,
            );

    return Scaffold(
      appBar: AppBar(
        title: Text(l.t('fitTodayTitle')),
        actions: [
          IconButton(
            tooltip: l.t('fitEditProfile'),
            onPressed: () => context.push('/fit/onboarding'),
            icon: const Icon(Icons.tune),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              FitScoreRing(score: score),
              const SizedBox(width: 14),
              Expanded(
                child: CoachInsightCard(text: insight),
              ),
            ],
          ),
          if (targets != null)
            FitSectionCard(
              title: l.t('fitNutritionTargets'),
              child: Column(
                children: [
                  TargetBar(
                    label: 'kcal',
                    value: metrics.caloriesIn,
                    target: targets.calories,
                    unit: 'kcal',
                    color: AppColors.primaryRed,
                  ),
                  TargetBar(
                    label: 'Protein',
                    value: metrics.proteinG,
                    target: targets.proteinG,
                    unit: 'g',
                    color: AppColors.healthyGreen,
                  ),
                  TargetBar(
                    label: l.t('fitStepsUnit'),
                    value: metrics.steps,
                    target: profile.stepTarget,
                    unit: '',
                    color: const Color(0xFF0EA5E9),
                  ),
                  TargetBar(
                    label: l.t('fitWater'),
                    value: metrics.waterMl,
                    target: targets.waterMl,
                    unit: 'ml',
                    color: const Color(0xFF3B82F6),
                  ),
                ],
              ),
            ),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.45,
            children: [
              MetricCard(
                icon: Icons.restaurant_menu,
                value: '${metrics.mealCount}',
                label: l.t('statMeals'),
                onTap: () => showMealLogSheet(context, ref),
              ),
              MetricCard(
                icon: Icons.water_drop_outlined,
                value: '${metrics.waterMl} ml',
                label: l.t('fitWater'),
                color: const Color(0xFF3B82F6),
                onTap: () => showNumberSheet(
                  context,
                  title: l.t('fitLogWater'),
                  unit: 'ml',
                  quickValues: const [250, 500, 750],
                  onSave: (v) =>
                      ref.read(fitServiceProvider).logWater(v.round()),
                ),
              ),
              MetricCard(
                icon: Icons.directions_walk,
                value: _fmt(metrics.steps),
                label: l.t('fitStepsUnit'),
                color: const Color(0xFF0EA5E9),
                onTap: () => showNumberSheet(
                  context,
                  title: l.t('fitLogSteps'),
                  unit: l.t('fitStepsUnit'),
                  onSave: (v) => ref
                      .read(fitServiceProvider)
                      .logSteps(v.round(), profile.stepTarget),
                ),
              ),
              MetricCard(
                icon: Icons.monitor_weight_outlined,
                value: '${profile.weightKg.toStringAsFixed(1)} kg',
                label: l.t('fitWeight'),
                color: AppColors.warningOrange,
                onTap: () => showNumberSheet(
                  context,
                  title: l.t('fitLogWeight'),
                  unit: 'kg',
                  onSave: (v) => ref
                      .read(fitServiceProvider)
                      .addBodyMeasurement(weightKg: v),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (plan != null) _WorkoutCard(plan: plan),
          if (menus.isNotEmpty)
            FitSectionCard(
              title: l.t('fitMenuSuggestions'),
              child: Column(
                children: menus
                    .map(
                      (m) => MenuFitCard(
                        suggestion: m,
                        onAccept: () {
                          ref
                              .read(fitServiceProvider)
                              .acceptMenuSuggestion(m, profile);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(l.t('fitLogged'))),
                          );
                        },
                      ),
                    )
                    .toList(),
              ),
            ),
          OutlinedButton.icon(
            onPressed: () => context.push('/fit/monitor'),
            icon: const Icon(Icons.insights_outlined),
            label: Text(l.t('fitMonitorTitle')),
          ),
        ],
      ),
    );
  }

  static String _fmt(int n) => n
      .toString()
      .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]},');
}

class _WorkoutCard extends ConsumerWidget {
  const _WorkoutCard({required this.plan});

  final DailyPlan plan;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    return FitSectionCard(
      title: l.t('fitWorkoutToday'),
      trailing: TextButton.icon(
        onPressed: () => context.push('/fit/sport-moods'),
        icon: const Icon(Icons.swap_horiz, size: 18),
        label: Text(l.t('fitChangeMood')),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            resolveSportMoodTitle(l,
                moodId: plan.moodId, legacyName: plan.workoutName),
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            '${plan.durationMinutes} min - '
            '${resolveIntensityLabel(l, plan.intensity)}',
            style: const TextStyle(
              color: AppColors.mutedText,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Text(l.t(plan.coachNoteKey ?? 'fitCoachNoteDefault'),
              style: const TextStyle(height: 1.4, fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          ...[
            ...plan.warmup,
            ...plan.main,
            ...plan.cooldown,
          ].map((b) => _BlockRow(block: b)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => showWorkoutFeedbackSheet(context, ref, plan),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primaryRed,
                    minimumSize: const Size(0, 44),
                  ),
                  icon: const Icon(Icons.check_circle_outline),
                  label: Text(l.t('fitFinishWorkout')),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Prompt 12: penafian keselamatan (bukan nasihat perubatan).
          Text(
            l.t('fitSafetyNote'),
            style: const TextStyle(
                fontSize: 11, color: AppColors.mutedText, height: 1.3),
          ),
        ],
      ),
    );
  }
}

class _BlockRow extends StatelessWidget {
  const _BlockRow({required this.block});

  final WorkoutBlock block;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.check, size: 17, color: AppColors.healthyGreen),
          const SizedBox(width: 8),
          Expanded(
            child: Text.rich(
              TextSpan(
                text: resolveWorkoutBlockName(l, block),
                style: const TextStyle(fontWeight: FontWeight.w800),
                children: [
                  TextSpan(
                    text: ' - ${resolveWorkoutBlockDetail(l, block)}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w500,
                      color: AppColors.mutedText,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SampleToday extends StatelessWidget {
  const _SampleToday({required this.l});

  final AppLocalizations l;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          children: [
            const FitScoreRing(score: 82),
            const SizedBox(width: 14),
            Expanded(child: CoachInsightCard(text: l.t('fitCoachTeaser'))),
          ],
        ),
        FitSectionCard(
          title: l.t('fitNutritionTargets'),
          child: const Column(
            children: [
              TargetBar(label: 'kcal', value: 1450, target: 1900, unit: 'kcal'),
              TargetBar(label: 'Protein', value: 98, target: 125, unit: 'g'),
            ],
          ),
        ),
      ],
    );
  }
}
