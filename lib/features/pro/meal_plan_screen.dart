import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import '../../models/place_summary.dart';

/// 🗓️ Meal Plan (Pro): pelan makan 3 hari dari tempat sebenar
/// berdekatan (skor tertinggi, tanpa ulangan berdekatan).
class MealPlanScreen extends ConsumerStatefulWidget {
  const MealPlanScreen({super.key});

  @override
  ConsumerState<MealPlanScreen> createState() => _MealPlanScreenState();
}

class _MealPlanScreenState extends ConsumerState<MealPlanScreen> {
  int _shuffleSeed = 0;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final nearbyAsync = ref.watch(nearbyPlacesProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l.t('proPlanTitle')),
        actions: [
          IconButton(
            tooltip: l.t('regeneratePlan'),
            icon: const Icon(Icons.refresh),
            onPressed: () => setState(() => _shuffleSeed++),
          ),
        ],
      ),
      body: nearbyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(
            child: Text('📡 ${l.t('postFailed')}',
                style: const TextStyle(fontSize: 13))),
        data: (places) {
          final open = places.where((p) => p.isOpen).toList();
          if (open.length < 3) {
            return Center(child: Text(l.t('noResults')));
          }
          // Susun ikut skor, kocok ringan supaya refresh beri variasi.
          final pool = [...open]
            ..sort((a, b) => b.matchScore.compareTo(a.matchScore));
          final random = Random(_shuffleSeed);
          final plan = <List<PlaceSummary>>[];
          var cursor = 0;
          for (var day = 0; day < 3; day++) {
            final dayPlan = <PlaceSummary>[];
            for (var slot = 0; slot < 3; slot++) {
              final pick = pool[(cursor + random.nextInt(2)) % pool.length];
              dayPlan.add(pick);
              cursor = (cursor + 1 + random.nextInt(2)) % pool.length;
            }
            plan.add(dayPlan);
          }
          final slotLabels = [
            ('🌅', l.t('slotBreakfast')),
            ('☀️', l.t('slotLunch')),
            ('🌙', l.t('slotDinner')),
          ];
          final dayLabels = [
            l.t('dayToday'),
            l.t('dayTomorrow'),
            l.t('dayAfter'),
          ];

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              for (var day = 0; day < 3; day++) ...[
                Text(
                  dayLabels[day],
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.darkText,
                  ),
                ),
                const SizedBox(height: 10),
                for (var slot = 0; slot < 3; slot++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: ListTile(
                      onTap: () {
                        ref
                            .read(currentSuggestionProvider.notifier)
                            .state = plan[day][slot];
                        context.push(
                            '/restaurant/${plan[day][slot].placeId}');
                      },
                      tileColor: AppColors.cardWhite,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                        side:
                            const BorderSide(color: AppColors.softBorder),
                      ),
                      leading: Text(slotLabels[slot].$1,
                          style: const TextStyle(fontSize: 24)),
                      title: Text(
                        plan[day][slot].name,
                        style:
                            const TextStyle(fontWeight: FontWeight.w700),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: Text(
                        '${slotLabels[slot].$2} • '
                        '${plan[day][slot].cuisine} • '
                        '${plan[day][slot].priceEstimate}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12.5),
                      ),
                      trailing: Text(
                        '${plan[day][slot].matchScore}%',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          color: AppColors.primaryRed,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: 8),
              ],
            ],
          );
        },
      ),
    );
  }
}
