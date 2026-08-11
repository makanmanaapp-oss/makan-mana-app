import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/mm_icons.dart';
import '../../core/constants/app_constants.dart';
import '../../core/entitlement/entitlement.dart';
import '../../core/entitlement/plan_tier.dart';
import '../../core/providers.dart';
import '../../core/widgets/app_states.dart';
import 'pro_providers.dart';

/// 📊 Laporan Makan Mingguan (Pro): analisis 7 hari dari data sebenar.
/// Prompt 13: gate Pro + keadaan loading/empty/error/retry (tiada spinner
/// kosong / kunci keras).
class WeeklyReportScreen extends ConsumerWidget {
  const WeeklyReportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final ent = ref.watch(entitlementProvider);

    // Free/Plus: preview terkunci + paywall (tidak panggil backend).
    if (!ent.canUseFeature(FeatureId.weeklyFoodReport)) {
      return Scaffold(
        appBar: AppBar(title: Text(l.t('proReportTitle'))),
        body: AppLockedPreviewState(
          title: l.t('proReportTitle'),
          message: l.t('wrLockedBody'),
          ctaLabel: l.t('upgradePro'),
          onUnlock: () => context.push(
            RoutePaths.paywall,
            extra: ent.buildPaywallArgs(
              featureId: FeatureId.weeklyFoodReport,
              sourceScreen: 'weekly_report',
              requiredPlan: PlanTier.pro,
            ),
          ),
        ),
      );
    }

    final reportAsync = ref.watch(weeklyReportProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.t('proReportTitle'))),
      body: reportAsync.when(
        loading: () => AppLoadingState(message: l.t('wrLoading')),
        error: (e, st) => AppErrorState(
          message: l.t('wrError'),
          retryLabel: l.t('retry'),
          onRetry: () => ref.invalidate(weeklyReportProvider),
        ),
        data: (r) {
          if (r['status'] != 'OK') {
            // Pro tapi backend tolak (jarang) -> retry, bukan kunci keras.
            return AppErrorState(
              message: l.t('wrError'),
              retryLabel: l.t('retry'),
              onRetry: () => ref.invalidate(weeklyReportProvider),
            );
          }
          final totalMeals = (r['totalMeals'] as num?)?.toInt() ?? 0;
          if (totalMeals == 0) {
            return AppEmptyState(
              icon: MmIconType.foodMatch,
              title: l.t('wrEmpty'),
              ctaLabel: l.t('spinNow'),
              onCta: () => context.go(RoutePaths.home),
            );
          }
          final topCuisines = (r['topCuisines'] as List? ?? [])
              .map((c) => Map<String, dynamic>.from(c as Map))
              .toList();
          final fav = r['favoritePlace'] == null
              ? null
              : Map<String, dynamic>.from(r['favoritePlace'] as Map);
          final maxCount = topCuisines.isEmpty
              ? 1
              : (topCuisines.first['count'] as num).toInt();

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              // Tiles statistik utama.
              Row(
                children: [
                  _StatTile(
                    icon: MmIconType.mealHistory,
                    value: '${r['totalMeals']}',
                    label: l.t('statMeals'),
                  ),
                  const SizedBox(width: 10),
                  _StatTile(
                    icon: MmIconType.bajet,
                    value: '~RM${r['estSpend']}',
                    label: l.t('statSpend'),
                  ),
                  const SizedBox(width: 10),
                  _StatTile(
                    icon: MmIconType.healthy,
                    value: '${r['healthyPct']}%',
                    label: l.t('healthyLabel'),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  _StatTile(
                    icon: MmIconType.cuisine,
                    value: '${r['variety']}',
                    label: l.t('varietyLabel'),
                  ),
                  const SizedBox(width: 10),
                  _StatTile(
                    icon: MmIconType.highRating,
                    value: r['avgSatisfaction'] == null
                        ? '—'
                        : '${r['avgSatisfaction']}/5',
                    label: l.t('satisfactionLabel'),
                  ),
                ],
              ),
              if (fav != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.softYellow,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: [
                      Text(fav['emoji'] as String? ?? '🍽️',
                          style: const TextStyle(fontSize: 28)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          '${l.t('favoritePlaceLabel')}: '
                          '${fav['name']} (${fav['n']}x)',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            color: AppColors.darkText,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 20),
              Text(
                l.t('topCuisinesLabel'),
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: context.mm.onCard,
                ),
              ),
              const SizedBox(height: 10),
              if (topCuisines.isEmpty)
                Text(
                  l.t('historyEmpty'),
                  style: TextStyle(
                      color: context.mm.onCardMuted, fontSize: 13),
                )
              else
                ...topCuisines.map((c) {
                  final count = (c['count'] as num).toInt();
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 96,
                          child: Text(
                            c['name'] as String,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: LinearProgressIndicator(
                              value: count / maxCount,
                              minHeight: 12,
                              backgroundColor: context.mm.border,
                              valueColor:
                                  const AlwaysStoppedAnimation<Color>(
                                AppColors.warmYellow,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '$count',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  );
                }),
            ],
          );
        },
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.icon,
    required this.value,
    required this.label,
  });

  final MmIconType icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: context.mm.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.mm.border),
        ),
        child: Column(
          children: [
            MmIcon(icon, size: 22, color: AppColors.primaryRed),
            const SizedBox(height: 4),
            Text(
              value,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: context.mm.onCard,
              ),
            ),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                color: context.mm.onCardMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
