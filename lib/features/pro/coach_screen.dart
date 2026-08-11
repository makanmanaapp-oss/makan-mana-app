import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/entitlement/entitlement.dart';
import '../../core/entitlement/plan_tier.dart';
import '../../core/events/event_types.dart';
import '../../core/models/makanmana_user_context.dart';
import '../../core/providers.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import '../../core/widgets/mm_icons.dart';
import 'pro_providers.dart';

const Map<String, String> _rejectReasonKeys = {
  'too_far': 'tooFar',
  'too_expensive': 'tooExpensive',
  'not_mood': 'notMood',
  'recently_ate': 'recentlyAte',
  'want_healthy': 'wantHealthy',
  'want_cheaper': 'wantCheaper',
  'want_nearby': 'wantNearby',
  'halal_uncertain': 'halalUncertain',
  'allergy_concern': 'allergyConcern',
  'other': 'otherReason',
};

/// 🧠 AI Food Coach (Pro): tips peribadi dari corak makan sebenar +
/// Food Memory. Free/Plus = preview terkunci. Retry bila cold-start.
class CoachScreen extends ConsumerStatefulWidget {
  const CoachScreen({super.key});

  @override
  ConsumerState<CoachScreen> createState() => _CoachScreenState();
}

class _CoachScreenState extends ConsumerState<CoachScreen> {
  bool _viewLogged = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_viewLogged) return;
      _viewLogged = true;
      final ent = ref.read(entitlementProvider);
      final ctx = ref.read(makanManaUserContextProvider);
      ref.read(eventLoggerProvider).logEvent(
        EventType.aiFoodCoachViewed,
        sourceScreen: 'ai_food_coach',
        metadata: {
          'userPlan': ent.plan.id,
          'accessLevel':
              ent.canUseFeature(FeatureId.aiFoodCoach) ? 'full' : 'preview',
          'hasMealHistory': ctx.recentPlaceIds.isNotEmpty,
          'hasUserBrain': ctx.foodMemorySummary != null,
        },
      );
      if (!ent.canUseFeature(FeatureId.aiFoodCoach)) {
        ref.read(eventLoggerProvider).logEvent(
          EventType.lockedFeaturePreviewed,
          sourceScreen: 'ai_food_coach',
          metadata: {
            'featureId': FeatureId.aiFoodCoach,
            'requiredPlan': 'pro',
            'userPlan': ent.plan.id,
            'previewType': 'ai_food_coach',
          },
        );
      }
    });
  }

  void _openPaywall() {
    final ent = ref.read(entitlementProvider);
    context.push(
      RoutePaths.paywall,
      extra: ent.buildPaywallArgs(
        featureId: FeatureId.aiFoodCoach,
        sourceScreen: 'ai_food_coach',
        requiredPlan: PlanTier.pro,
      ),
    );
  }

  /// Tips diperibadikan dari Food Memory / konteks (client-side, jujur).
  List<(MmIconType, String)> _clientTips(
      AppLocalizations l, MakanManaUserContext ctx) {
    final tips = <(MmIconType, String)>[];
    final heavy = ctx.heavyFoodFrequency ?? 0;
    final healthy = ctx.healthyPreference ?? 0;
    if (heavy >= 0.5 && heavy >= healthy) {
      tips.add((MmIconType.healthy, l.t('cvHeavyPattern')));
    } else if (healthy >= 0.5) {
      tips.add((MmIconType.fitCoach, l.t('cvHealthyPattern')));
    }
    if (ctx.topCuisines.isNotEmpty) {
      tips.add((MmIconType.cuisine,
          '${l.t('cvTopCuisineLabel')}: ${ctx.topCuisines.first}'));
    }
    if (ctx.commonRejectReasons.isNotEmpty) {
      final id = ctx.commonRejectReasons.first;
      tips.add((MmIconType.foodMatch,
          '${l.t('cvRejectLabel')}: ${l.t(_rejectReasonKeys[id] ?? id)}'));
    }
    tips.add((MmIconType.berhampiran,
        '${l.t('cvDistanceLabel')} ${ctx.preferredDistanceKm.toStringAsFixed(1)}km'));
    final bMin = ctx.budgetMin;
    final bMax = ctx.budgetMax;
    if (bMin > 0 && bMax > 0) {
      tips.add((MmIconType.bajet, '${l.t('cvBudgetLabel')}: RM$bMin–RM$bMax'));
    }
    if (ctx.dietGoal.isNotEmpty) {
      tips.add((MmIconType.foodMatch, l.t('cvDietHealthy')));
    }
    return tips;
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final ent = ref.watch(entitlementProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.t('proCoachTitle'))),
      body: ent.canUseFeature(FeatureId.aiFoodCoach)
          ? _proBody(l)
          : _previewBody(l),
    );
  }

  Widget _previewBody(AppLocalizations l) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        _CoachBubble(text: l.t('coachIntro'), icon: MmIconType.foodMemory),
        const SizedBox(height: 10),
        _CoachBubble(text: l.t('cvPreviewTip'), icon: MmIconType.pick),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: context.mm.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: context.mm.border),
          ),
          child: Column(
            children: [
              Icon(Icons.lock_outline,
                  size: 30, color: context.mm.iconMuted),
              const SizedBox(height: 8),
              Text(l.t('cvPreviewLocked'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 13.5, color: context.mm.onCardMuted, height: 1.4)),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _openPaywall,
            child: Text(l.t('upgradePro')),
          ),
        ),
      ],
    );
  }

  Widget _proBody(AppLocalizations l) {
    final reportAsync = ref.watch(weeklyReportProvider);
    final ctx = ref.watch(makanManaUserContextProvider);
    return reportAsync.when(
      loading: () => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 14),
            Text(l.t('cvReading'),
                style:
                    TextStyle(color: context.mm.onCardMuted, fontSize: 13)),
          ],
        ),
      ),
      error: (e, st) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 40, color: context.mm.iconMuted),
            const SizedBox(height: 10),
            Text(l.t('cvError'), style: const TextStyle(fontSize: 14)),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: () {
                ref.read(eventLoggerProvider).logEvent(
                  EventType.aiFoodCoachRetry,
                  sourceScreen: 'ai_food_coach',
                );
                ref.invalidate(weeklyReportProvider);
              },
              icon: const Icon(Icons.refresh, size: 18),
              label: Text(l.t('retry')),
            ),
          ],
        ),
      ),
      data: (r) {
        final serverTips = (r['tips'] as List? ?? [])
            .map((t) => Map<String, dynamic>.from(t as Map))
            .toList();
        final totalMeals = (r['totalMeals'] as num?)?.toInt() ?? 0;
        final clientTips = _clientTips(l, ctx);
        final lowData = totalMeals == 0 && ctx.foodMemorySummary == null;

        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            _CoachBubble(text: l.t('coachIntro'), icon: MmIconType.foodMemory),
            const SizedBox(height: 10),
            if (lowData)
              _CoachBubble(text: l.t('cvLowData'), icon: MmIconType.mealHistory)
            else ...[
              // Pattern detected dari Food Memory (client, jujur).
              ...clientTips.map((t) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _CoachBubble(text: t.$2, icon: t.$1),
                  )),
              // Tips analisis mingguan dari pelayan (data sebenar).
              ...serverTips.map((t) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _CoachBubble(
                      // Emoji pelayan tidak dipapar (spec ikon) — data kekal.
                      text: t['text'] as String? ?? '',
                      icon: MmIconType.pick,
                    ),
                  )),
            ],
            const SizedBox(height: 8),
            Text(l.t('cvDisclaimer'),
                style: TextStyle(
                    fontSize: 11.5, color: context.mm.onCardMuted, height: 1.3)),
          ],
        );
      },
    );
  }
}

class _CoachBubble extends StatelessWidget {
  const _CoachBubble({required this.text, required this.icon});

  final String text;
  final MmIconType icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 38,
          width: 38,
          decoration: const BoxDecoration(
            color: AppColors.softYellow,
            shape: BoxShape.circle,
          ),
          child: Center(
            // Kuning → ikon gelap (peraturan kontras spec).
            child: MmIcon(icon, size: 20, color: AppColors.darkText),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.mm.card,
              borderRadius: BorderRadius.only(
                topRight: Radius.circular(18),
                bottomLeft: Radius.circular(18),
                bottomRight: Radius.circular(18),
              ),
            ),
            child: Text(
              text,
              style: TextStyle(
                fontSize: 14.5,
                height: 1.4,
                color: context.mm.onCard,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
