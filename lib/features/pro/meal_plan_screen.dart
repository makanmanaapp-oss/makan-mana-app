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
import '../../core/providers.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import 'meal_plan_service.dart';

/// 🗓️ Meal Plan (Pro): pelan makan diperibadikan dari konteks + Food Memory
/// + tempat berdekatan sebenar. Free/Plus = preview terkunci (Prompt 11).
class MealPlanScreen extends ConsumerStatefulWidget {
  const MealPlanScreen({super.key});

  @override
  ConsumerState<MealPlanScreen> createState() => _MealPlanScreenState();
}

class _MealPlanScreenState extends ConsumerState<MealPlanScreen> {
  int _seed = 0;
  bool _viewLogged = false;
  int _generatedSeed = -1;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_viewLogged) return;
      _viewLogged = true;
      final ent = ref.read(entitlementProvider);
      ref.read(eventLoggerProvider).logEvent(
        EventType.mealPlanViewed,
        sourceScreen: 'meal_plan',
        metadata: {
          'userPlan': ent.plan.id,
          'accessLevel': ent.canUseFeature(FeatureId.mealPlan)
              ? 'full'
              : 'preview',
        },
      );
      if (!ent.canUseFeature(FeatureId.mealPlan)) {
        ref.read(eventLoggerProvider).logEvent(
          EventType.lockedFeaturePreviewed,
          sourceScreen: 'meal_plan',
          metadata: {
            'featureId': FeatureId.mealPlan,
            'requiredPlan': 'pro',
            'userPlan': ent.plan.id,
            'previewType': 'meal_plan',
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
        featureId: FeatureId.mealPlan,
        sourceScreen: 'meal_plan',
        requiredPlan: PlanTier.pro,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final ent = ref.watch(entitlementProvider);
    final canUse = ent.canUseFeature(FeatureId.mealPlan);
    final nearbyAsync = ref.watch(nearbyPlacesProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l.t('proPlanTitle')),
        actions: [
          if (canUse)
            IconButton(
              tooltip: l.t('regeneratePlan'),
              icon: const Icon(Icons.refresh),
              onPressed: () => setState(() => _seed++),
            ),
        ],
      ),
      body: nearbyAsync.when(
        loading: () => _LoadingState(text: l.t('mpLoading')),
        error: (e, st) => _ErrorState(
          text: l.t('mpError'),
          onRetry: () => ref.invalidate(nearbyPlacesProvider),
          retryLabel: l.t('retry'),
        ),
        data: (places) {
          final ctx = ref.watch(makanManaUserContextProvider);
          final result = buildMealPlan(ctx, places, seed: _seed);
          if (result.isEmpty || result.slotsCount == 0) {
            return _EmptyState(l: l, onSpin: () => context.go(RoutePaths.home));
          }
          if (!canUse) {
            return _PreviewPlan(
              l: l,
              result: result,
              onUnlock: _openPaywall,
            );
          }
          // Log meal_plan_generated sekali per penjanaan (seed berubah).
          if (_generatedSeed != _seed) {
            _generatedSeed = _seed;
            WidgetsBinding.instance.addPostFrameCallback((_) {
              ref.read(eventLoggerProvider).logEvent(
                EventType.mealPlanGenerated,
                sourceScreen: 'meal_plan',
                metadata: {
                  'planDays': result.days.length,
                  'slotsCount': result.slotsCount,
                  'confidence': result.confidence,
                  'starter': result.starter,
                  'usedBrain': result.usedBrain,
                  'usedRecentMeals': result.usedRecentMeals,
                },
              );
            });
          }
          return _FullPlan(l: l, result: result, ref: ref);
        },
      ),
    );
  }
}

const _dayKeys = ['dayToday', 'dayTomorrow', 'dayAfter'];
// Spec ikon: slot waktu guna ikon universal (bukan emoji).
const _slotIcon = {
  'slotBreakfast': Icons.wb_twilight,
  'slotLunch': Icons.wb_sunny_outlined,
  'slotDinner': Icons.nightlight_outlined,
};

class _FullPlan extends StatelessWidget {
  const _FullPlan({required this.l, required this.result, required this.ref});
  final AppLocalizations l;
  final MealPlanResult result;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        // Banjar keyakinan / starter (jujur).
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.softYellow,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Text(
            result.starter
                ? l.t('mpStarterNote')
                : '${l.t('fmConfidence')}: '
                    '${(result.confidence * 100).round()}%',
            style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: AppColors.darkText),
          ),
        ),
        const SizedBox(height: 16),
        for (var d = 0; d < result.days.length; d++) ...[
          Text(
            l.t(_dayKeys[d.clamp(0, _dayKeys.length - 1)]),
            style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: context.mm.onCard),
          ),
          const SizedBox(height: 10),
          ...result.days[d].map((item) => _SlotCard(
                l: l,
                item: item,
                onTap: item.isIdea
                    ? null
                    : () {
                        ref
                            .read(currentSuggestionProvider.notifier)
                            .state = item.place;
                        context.push('/restaurant/${item.place!.placeId}');
                      },
              )),
          const SizedBox(height: 8),
        ],
        const SizedBox(height: 8),
        Text(
          l.t('mpDisclaimer'),
          style: TextStyle(
              fontSize: 11.5, color: context.mm.onCardMuted, height: 1.3),
        ),
      ],
    );
  }
}

class _PreviewPlan extends StatelessWidget {
  const _PreviewPlan(
      {required this.l, required this.result, required this.onUnlock});
  final AppLocalizations l;
  final MealPlanResult result;
  final VoidCallback onUnlock;

  @override
  Widget build(BuildContext context) {
    final sample = result.days.isNotEmpty && result.days.first.isNotEmpty
        ? result.days.first.first
        : null;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
      children: [
        Text(l.t('mpPreviewTitle'),
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        if (sample != null) _SlotCard(l: l, item: sample, onTap: null),
        const SizedBox(height: 12),
        // Slot terkunci (blur konsep — tunjuk nilai, sekat penuh).
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
              Text(l.t('mpPreviewLocked'),
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
            onPressed: onUnlock,
            child: Text(l.t('upgradePro')),
          ),
        ),
      ],
    );
  }
}

class _SlotCard extends StatelessWidget {
  const _SlotCard({required this.l, required this.item, this.onTap});
  final AppLocalizations l;
  final MealPlanItem item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final title = item.isIdea ? l.t(item.ideaKey ?? 'mpIdeaGeneric') : item.place!.name;
    final subtitle = [
      l.t(item.slotKey),
      if (item.cuisine.isNotEmpty) item.cuisine,
      if (item.budgetText.isNotEmpty) item.budgetText,
    ].join(' • ');

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: context.mm.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.mm.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            InkWell(
              onTap: onTap,
              child: Row(
                children: [
                  Icon(_slotIcon[item.slotKey] ?? Icons.restaurant_outlined,
                      size: 24, color: AppColors.primaryRed),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title,
                            style: const TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 14.5),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                        Text(subtitle,
                            style: TextStyle(
                                fontSize: 12, color: context.mm.onCardMuted),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  ),
                  if (!item.isIdea)
                    Text('${item.place!.matchScore}%',
                        style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: AppColors.primaryRed,
                            fontSize: 13)),
                ],
              ),
            ),
            // Sebab (mesra, tanpa istilah teknikal).
            if (item.reasonKeys.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: item.reasonKeys
                    .map((k) => _pill(l.t(k), AppColors.softYellow))
                    .toList(),
              ),
            ],
            // Amaran jujur (tidak mendakwa selamat/halal).
            for (final c in item.cautionKeys) ...[
              const SizedBox(height: 6),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline,
                      size: 15, color: context.mm.iconMuted),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(l.t(c),
                        style: TextStyle(
                            fontSize: 11.5, color: context.mm.onCardMuted)),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _pill(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration:
            BoxDecoration(color: color, borderRadius: BorderRadius.circular(20)),
        // Pill sentiasa kuning pucat → teks WAJIB gelap (dua-dua mod).
        child: Text(text,
            style: const TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: AppColors.darkText)),
      );
}

class _LoadingState extends StatelessWidget {
  const _LoadingState({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 14),
          Text(text,
              style: TextStyle(color: context.mm.onCardMuted, fontSize: 13)),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState(
      {required this.text, required this.onRetry, required this.retryLabel});
  final String text;
  final VoidCallback onRetry;
  final String retryLabel;
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.error_outline,
              size: 40, color: context.mm.onCardMuted),
          const SizedBox(height: 10),
          Text(text, style: const TextStyle(fontSize: 14)),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh, size: 18),
            label: Text(retryLabel),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.l, required this.onSpin});
  final AppLocalizations l;
  final VoidCallback onSpin;
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.calendar_month_outlined,
              size: 44, color: AppColors.fadedText),
            const SizedBox(height: 12),
            Text(l.t('mpEmpty'),
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 14.5, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: onSpin, child: Text(l.t('spinNow'))),
          ],
        ),
      ),
    );
  }
}
