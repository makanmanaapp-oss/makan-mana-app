import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import 'pro_providers.dart';

/// 📊 Laporan Makan Mingguan (Pro): analisis 7 hari dari data sebenar.
class WeeklyReportScreen extends ConsumerWidget {
  const WeeklyReportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final reportAsync = ref.watch(weeklyReportProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.t('proReportTitle'))),
      body: reportAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(
            child: Text('📡 ${l.t('postFailed')}',
                style: const TextStyle(fontSize: 13))),
        data: (r) {
          if (r['status'] != 'OK') {
            return Center(child: Text(l.t('lockedPro')));
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
                    emoji: '🍽️',
                    value: '${r['totalMeals']}',
                    label: l.t('statMeals'),
                  ),
                  const SizedBox(width: 10),
                  _StatTile(
                    emoji: '💸',
                    value: '~RM${r['estSpend']}',
                    label: l.t('statSpend'),
                  ),
                  const SizedBox(width: 10),
                  _StatTile(
                    emoji: '🥗',
                    value: '${r['healthyPct']}%',
                    label: l.t('healthyLabel'),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  _StatTile(
                    emoji: '🌈',
                    value: '${r['variety']}',
                    label: l.t('varietyLabel'),
                  ),
                  const SizedBox(width: 10),
                  _StatTile(
                    emoji: '⭐',
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
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.darkText,
                ),
              ),
              const SizedBox(height: 10),
              if (topCuisines.isEmpty)
                Text(
                  l.t('historyEmpty'),
                  style: const TextStyle(
                      color: AppColors.mutedText, fontSize: 13),
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
                              backgroundColor: AppColors.softBorder,
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
    required this.emoji,
    required this.value,
    required this.label,
  });

  final String emoji;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.cardWhite,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.softBorder),
        ),
        child: Column(
          children: [
            Text(emoji, style: const TextStyle(fontSize: 22)),
            const SizedBox(height: 4),
            Text(
              value,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: AppColors.darkText,
              ),
            ),
            Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.mutedText,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
