import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';

/// Hub Pro 👑: pusat semua alat AI Food Coach.
/// Bukan Pro: semua kad kelihatan (preview) tapi tap -> paywall.
class ProHubScreen extends ConsumerWidget {
  const ProHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final plan = ref.watch(userPlanProvider).value ?? 'free';
    final proOk = plan == 'pro';

    void open(String route) {
      if (proOk) {
        context.push(route);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('lockedPro'))),
        );
        context.push(RoutePaths.paywall);
      }
    }

    final tools = [
      (
        Icons.insights,
        l.t('proReportTitle'),
        l.t('proReportDesc'),
        () => open('/pro/report'),
        false,
      ),
      (
        Icons.psychology_outlined,
        l.t('proCoachTitle'),
        l.t('proCoachDesc'),
        () => open('/pro/coach'),
        false,
      ),
      (
        Icons.flag_outlined,
        l.t('proGoalTitle'),
        l.t('proGoalDesc'),
        () => open('/pro/diet-goal'),
        false,
      ),
      (
        Icons.calendar_month_outlined,
        l.t('proPlanTitle'),
        l.t('proPlanDesc'),
        () => open('/pro/meal-plan'),
        false,
      ),
      (
        Icons.photo_camera_outlined,
        l.t('proScanTitle'),
        l.t('proScanDesc'),
        () => open('/pro/scan'),
        false,
      ),
      (
        Icons.how_to_vote_outlined,
        l.t('proGroupTitle'),
        l.t('proGroupDesc'),
        // Buka untuk semua: sertai percuma, buat sesi Pro (gate dlm skrin).
        () => context.push('/group-decision'),
        false,
      ),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(l.t('proHubTitle'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          if (!proOk)
            Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.softYellow,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                l.t('proHubTeaser'),
                // SP10.5: banner kuning B-style — teks WAJIB gelap
                // eksplisit (tema gelap default putih atas kuning).
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 13.5,
                  color: AppColors.darkText,
                ),
              ),
            ),
          ...tools.map((t) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: InkWell(
                  onTap: t.$4,
                  borderRadius: BorderRadius.circular(18),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: context.mm.card,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: context.mm.border),
                    ),
                    child: Row(
                      children: [
                        Container(
                          height: 46,
                          width: 46,
                          decoration: BoxDecoration(
                            color: AppColors.primaryRed
                                .withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Icon(t.$1,
                              size: 24, color: AppColors.primaryRed),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                t.$2,
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15.5,
                                  color: context.mm.onCard,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                t.$3,
                                style: TextStyle(
                                  color: context.mm.onCardMuted,
                                  fontSize: 12.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (t.$5)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: context.mm.border,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              l.t('soonBadge'),
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: context.mm.onCardMuted,
                              ),
                            ),
                          )
                        else if (!proOk)
                          Icon(Icons.lock_outline,
                              size: 20, color: context.mm.iconMuted)
                        else
                          Icon(Icons.chevron_right,
                              color: context.mm.iconMuted),
                      ],
                    ),
                  ),
                ),
              )),
        ],
      ),
    );
  }
}
