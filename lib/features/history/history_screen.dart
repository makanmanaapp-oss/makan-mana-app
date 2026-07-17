import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/mm_icons.dart';
import '../../core/providers.dart';
import '../../core/widgets/place_image.dart';
import '../../models/meal.dart';
import '../fit/sport_mood_display.dart';
import '../fit/fit_charts.dart';
import '../fit/fit_log_sheets.dart';
import '../fit/fit_models.dart';
import '../fit/fit_providers.dart';
import '../fit/fit_widgets.dart';
import '../reviews/rating_page.dart';

/// Sejarah (V3): 4 tab - Makanan, Fitness, Monitor, Laporan.
class HistoryScreen extends ConsumerWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.t('historyTitle')),
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            labelColor: AppColors.primaryRed,
            unselectedLabelColor: context.mm.onCardMuted,
            indicatorColor: AppColors.primaryRed,
            labelStyle: const TextStyle(
                fontWeight: FontWeight.w800, fontSize: 13.5),
            tabs: [
              Tab(text: l.t('historyTabMeals')),
              Tab(text: l.t('historyTabFitness')),
              Tab(text: l.t('historyTabMonitor')),
              Tab(text: l.t('historyTabReports')),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            _MealsTab(),
            _FitnessTab(),
            _MonitorTab(),
            _ReportsTab(),
          ],
        ),
      ),
    );
  }
}

// ---------- Tab 1: Makanan (kandungan asal V1/V2) ----------

class _MealsTab extends ConsumerWidget {
  const _MealsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final mealsAsync = ref.watch(mealsProvider);

    return mealsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, st) => Center(
        child: Text(l.t('cvError'), style: const TextStyle(fontSize: 13)),
      ),
      data: (meals) {
        final now = DateTime.now();
        final weekAgo = now.subtract(const Duration(days: 7));
        final weekMeals =
            meals.where((m) => m.mealTime.isAfter(weekAgo)).toList();
        final spend = weekMeals.fold<double>(
            0, (sum, m) => sum + m.estimatedSpend);
        final places = weekMeals.map((m) => m.placeId).toSet().length;

        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: context.mm.card,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: context.mm.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l.t('weeklySummary'),
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: context.mm.onCard,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _StatBox(
                        icon: MmIconType.mealHistory,
                        value: '${weekMeals.length}',
                        label: l.t('statMeals'),
                      ),
                      _StatBox(
                        icon: MmIconType.bajet,
                        value: '~RM${spend.round()}',
                        label: l.t('statSpend'),
                      ),
                      _StatBox(
                        icon: MmIconType.berhampiran,
                        value: '$places',
                        label: l.t('statPlaces'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            if (meals.isEmpty) ...[
              const SizedBox(height: 24),
              const Center(
                  child: MmIcon(MmIconType.history,
                      size: 56, color: AppColors.fadedText)),
              const SizedBox(height: 16),
              Center(
                child: Text(
                  l.t('historyEmpty'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: context.mm.onCardMuted,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ] else
              ...meals.map((m) => _MealTile(meal: m)),
          ],
        );
      },
    );
  }
}

// ---------- Tab 2: Fitness (log workout + makanan Fit Coach) ----------

class _FitnessTab extends ConsumerWidget {
  const _FitnessTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final access = ref.watch(fitAccessProvider);
    final workouts = ref.watch(recentWorkoutsProvider).value ?? const [];
    final mealLogs = ref.watch(todayMealLogsProvider).value ?? const [];

    final body = ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
      children: [
        // Log hari ini.
        FitSectionCard(
          title: l.t('fitTodayLogs'),
          trailing: TextButton(
            onPressed: () => showMealLogSheet(context, ref),
            style: TextButton.styleFrom(
              minimumSize: const Size(60, 32),
              padding: const EdgeInsets.symmetric(horizontal: 8),
            ),
            child: Text('+ ${l.t('fitLogMealTitle')}',
                style: const TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w800)),
          ),
          child: mealLogs.isEmpty
              ? Text(l.t('fitNoLogsToday'),
                  style: TextStyle(
                      color: context.mm.onCardMuted,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600))
              : Column(
                  children: mealLogs
                      .map((m) => Padding(
                            padding:
                                const EdgeInsets.symmetric(vertical: 4),
                            child: Row(
                              children: [
                                Icon(Icons.restaurant,
                                    size: 16,
                                    color: context.mm.iconMuted),
                                const SizedBox(width: 9),
                                Expanded(
                                  child: Text(
                                    '${m['menuName'] ?? '-'}',
                                    style: TextStyle(
                                        fontSize: 13,
                                        color: context.mm.onCard,
                                        fontWeight: FontWeight.w700),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                Text(
                                  '${m['caloriesEstimate'] ?? 0} kcal',
                                  style: TextStyle(
                                      fontSize: 12,
                                      color: context.mm.onCardMuted,
                                      fontWeight: FontWeight.w700),
                                ),
                              ],
                            ),
                          ))
                      .toList(),
                ),
        ),

        // Sejarah workout.
        FitSectionCard(
          title: l.t('fitRecentWorkouts'),
          child: workouts.isEmpty
              ? Text(l.t('fitNoWorkoutYet'),
                  style: TextStyle(
                      color: context.mm.onCardMuted,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600))
              : Column(
                  children: workouts.take(15).map((w) {
                    final completed = w['status'] == 'completed';
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 5),
                      child: Row(
                        children: [
                          Icon(
                            completed
                                ? Icons.check_circle
                                : Icons.cancel_outlined,
                            size: 18,
                            color: completed
                                ? AppColors.healthyGreen
                                : AppColors.warningOrange,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              // Rekod legasi: ID stabil diutamakan,
                              // jatuh balik ke petikan teks tersimpan.
                              resolveSportMoodTitle(
                                l,
                                moodId: w['sportMood'] as String?,
                                legacyName: w['workoutName'] as String?,
                              ),
                              style: TextStyle(
                                  fontSize: 13,
                                  color: context.mm.onCard,
                                  fontWeight: FontWeight.w700),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          Text(
                            _dateLabel('${w['date'] ?? ''}'),
                            style: TextStyle(
                                fontSize: 11.5,
                                color: context.mm.onCardMuted,
                                fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
        ),

        OutlinedButton.icon(
          onPressed: () => context.push('/fit/today'),
          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 46)),
          icon: const Icon(Icons.monitor_heart_outlined, size: 18),
          label: Text(l.t('fitTodayTitle'),
              style: const TextStyle(fontWeight: FontWeight.w800)),
        ),
      ],
    );

    return access == FitAccess.full
        ? body
        : LockedProOverlay(locked: true, child: body);
  }

  static String _dateLabel(String key) {
    if (key.length != 8) return '';
    return '${int.tryParse(key.substring(6)) ?? ''}/${int.tryParse(key.substring(4, 6)) ?? ''}';
  }
}

// ---------- Tab 3: Monitor (ringkasan + pautan penuh) ----------

class _MonitorTab extends ConsumerWidget {
  const _MonitorTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final access = ref.watch(fitAccessProvider);
    final profile = ref.watch(fitProfileProvider).value;
    final targets = ref.watch(nutritionTargetsProvider);
    final metrics =
        ref.watch(todayMetricsProvider).value ?? const DailyMetrics();
    final score = ref.watch(dailyFitScoreProvider) ?? 0;

    final unlocked = access == FitAccess.full && profile != null;

    final body = ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            FitScoreRing(score: unlocked ? score : 78),
            const SizedBox(width: 14),
            Expanded(
              child: CoachInsightCard(
                text: unlocked && targets != null
                    ? ref.watch(fitServiceProvider).coachInsight(
                          profile: profile,
                          targets: targets,
                          today: metrics,
                          fitScore: score,
                        )
                    : l.t('fitCoachTeaser'),
              ),
            ),
          ],
        ),
        FitSectionCard(
          title: l.t('fitNutritionTargets'),
          child: Column(
            children: [
              TargetBar(
                label: 'kcal',
                value: unlocked ? metrics.caloriesIn : 1450,
                target: targets?.calories ?? 1900,
                unit: 'kcal',
                color: AppColors.primaryRed,
              ),
              TargetBar(
                label: 'Protein',
                value: unlocked ? metrics.proteinG : 98,
                target: targets?.proteinG ?? 125,
                unit: 'g',
                color: const Color(0xFF7C3AED),
              ),
              TargetBar(
                label: l.t('fitStepsUnit'),
                value: unlocked ? metrics.steps : 6240,
                target: profile?.stepTarget ?? 8000,
                unit: '',
                color: const Color(0xFF0EA5E9),
              ),
            ],
          ),
        ),
        FilledButton.icon(
          onPressed: () => context.push('/fit/monitor'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.primaryRed,
            minimumSize: const Size(0, 48),
          ),
          icon: const Icon(Icons.insights_outlined, size: 18),
          label: Text(l.t('fitOpenMonitor'),
              style: const TextStyle(fontWeight: FontWeight.w800)),
        ),
      ],
    );

    return access == FitAccess.full
        ? body
        : LockedProOverlay(locked: true, child: body);
  }
}

// ---------- Tab 4: Laporan ----------

class _ReportsTab extends ConsumerWidget {
  const _ReportsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final access = ref.watch(fitAccessProvider);
    final report = access == FitAccess.full
        ? ref.watch(fitWeeklyReportProvider).value
        : null;

    final body = ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
      children: [
        FitSectionCard(
          title: l.t('fitReportTitle'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${report?['coachSummary'] ?? l.t('fitReportTeaser')}',
                style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    height: 1.45),
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _StatBox(
                    icon: MmIconType.fitCoach,
                    value:
                        '${report?['trainingCompleted'] ?? 4}/${report?['trainingPlanned'] ?? 5}',
                    label: l.t('fitTrainingDone'),
                  ),
                  _StatBox(
                    icon: MmIconType.berhampiran,
                    value: _fmt(report?['averageSteps'] ?? 7850),
                    label: l.t('fitAvgSteps'),
                  ),
                  _StatBox(
                    icon: MmIconType.healthy,
                    value: '${report?['proteinHitRate'] ?? 71}%',
                    label: l.t('fitProteinHit'),
                  ),
                ],
              ),
            ],
          ),
        ),
        FilledButton.icon(
          onPressed: () => context.push('/fit/reports'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.primaryRed,
            minimumSize: const Size(0, 48),
          ),
          icon: const Icon(Icons.description_outlined, size: 18),
          label: Text(l.t('fitViewFullReport'),
              style: const TextStyle(fontWeight: FontWeight.w800)),
        ),
      ],
    );

    return access == FitAccess.full
        ? body
        : LockedProOverlay(locked: true, child: body);
  }

  static String _fmt(dynamic n) {
    final v = (n as num?)?.round() ?? 0;
    return v.toString().replaceAllMapped(
        RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]},');
  }
}

// ---------- Komponen kongsi asal ----------

class _MealTile extends StatelessWidget {
  const _MealTile({required this.meal});

  final Meal meal;

  String _formatTime(DateTime t) {
    final h = t.hour.toString().padLeft(2, '0');
    final m = t.minute.toString().padLeft(2, '0');
    return '${t.day}/${t.month} $h:$m';
  }

  @override
  Widget build(BuildContext context) {
    // SP10.2: kad theme-aware — tajuk/sari kata jelas dua-dua mod.
    final mm = context.mm;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        tileColor: mm.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: mm.border),
        ),
        leading: PlaceImage(
          name: meal.placeNameSnapshot,
          height: 46,
          width: 46,
          borderRadius: 13,
          monogramFontSize: 15,
        ),
        title: Text(
          meal.placeNameSnapshot,
          style:
              TextStyle(fontWeight: FontWeight.w700, color: mm.onCard),
        ),
        subtitle: Text(
          '${meal.cuisine} • ${_formatTime(meal.mealTime)} • ${meal.timeSlot}',
          style: TextStyle(fontSize: 12.5, color: mm.onCardMuted),
        ),
        // Sudah dinilai: tunjuk bintang. Belum: butang Bagi rating.
        trailing: meal.satisfactionRating != null
            ? Text(
                '★' * meal.satisfactionRating!,
                style: const TextStyle(fontSize: 12),
              )
            : meal.id.isNotEmpty
                ? OutlinedButton(
                    onPressed: () => context.push(
                      '/rate',
                      extra: RatingArgs(
                        placeId: meal.placeId,
                        placeName: meal.placeNameSnapshot,
                        emoji: meal.emoji,
                        cuisine: meal.cuisine,
                        source: 'meal',
                        mealId: meal.id,
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(64, 34),
                      padding:
                          const EdgeInsets.symmetric(horizontal: 10),
                    ),
                    child: Text(
                      '★ ${AppLocalizations.of(context).t('rateShort')}',
                      style: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w700),
                    ),
                  )
                : null,
      ),
    );
  }
}

class _StatBox extends StatelessWidget {
  const _StatBox({
    required this.icon,
    required this.value,
    required this.label,
  });

  final MmIconType icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    return Column(
      children: [
        MmIcon(icon, size: 24, color: AppColors.primaryRed),
        const SizedBox(height: 6),
        Text(
          value,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: mm.onCard,
          ),
        ),
        Text(
          label,
          style: TextStyle(fontSize: 12, color: mm.onCardMuted),
        ),
      ],
    );
  }
}
