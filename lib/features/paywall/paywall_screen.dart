import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/plan_constants.dart';
import '../../core/providers.dart';
import '../../core/services/purchase_service.dart';

/// Paywall (paparan; gating + mock RevenueCat penuh di Milestone 5).
class PaywallScreen extends ConsumerStatefulWidget {
  const PaywallScreen({super.key});

  @override
  ConsumerState<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends ConsumerState<PaywallScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((timeStamp) {
      ref.read(spinControllerProvider).logAppEvent('paywall_viewed');
    });
  }

  /// Mock purchase: sahkan -> kemas kini users/{uid}.plan.
  /// (RevenueCat sebenar akan ganti MockPurchaseService sahaja.)
  Future<void> _purchase(String plan) async {
    final l = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('${l.t('confirmPurchase')} ${_planLabel(l, plan)}?'),
        content: Text(l.t('mockNotice')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(l.t('cancelAction')),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style:
                ElevatedButton.styleFrom(minimumSize: const Size(88, 40)),
            child: Text(l.t('upgradeNow')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    ref.read(spinControllerProvider).logAppEvent('upgrade_clicked');
    try {
      // Cuba Google Play Billing sebenar dahulu (M6). Downgrade ke free
      // dan keadaan store-belum-sedia jatuh ke mock.
      if (plan != 'free') {
        final flow = await ref
            .read(purchaseServiceProvider)
            .buy(uid: uid, plan: plan);
        if (flow == PurchaseFlow.storeStarted) {
          // Play uruskan UI pembayaran; plan dikemaskini via purchaseStream.
          return;
        }
      }
      await ref
          .read(mockPurchaseServiceProvider)
          .purchase(uid: uid, plan: plan);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('planUpdated'))),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('📡 ${l.t('postFailed')}')),
        );
      }
    }
  }

  String _planLabel(AppLocalizations l, String plan) {
    switch (plan) {
      case 'plus':
        return l.t('planPlus');
      case 'pro':
        return l.t('planPro');
      default:
        return l.t('planFree');
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final plan = ref.watch(userPlanProvider).value ?? 'free';

    return Scaffold(
      appBar: AppBar(title: Text(l.t('paywallTitle'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          _PlanCard(
            emoji: '🍚',
            name: l.t('planFree'),
            price: 'RM0',
            perMonth: '',
            highlight: false,
            currentLabel: l.t('currentPlan'),
            isCurrent: plan == 'free',
            upgradeLabel: l.t('downgradeFree'),
            onUpgrade: () => _purchase('free'),
            features: const [
              '3 spin sehari',
              'Mood asas penuh',
              'Semua mood boleh dilihat (preview)',
              '1 tema spin (Magic Plate)',
              'Sejarah 7 hari',
              'Food Memory asas',
            ],
          ),
          const SizedBox(height: 16),
          _PlanCard(
            emoji: '⭐',
            name: l.t('planPlus'),
            price: PlanConstants.plusPriceLabel,
            perMonth: l.t('perMonth'),
            highlight: plan != 'plus',
            isCurrent: plan == 'plus',
            currentLabel: l.t('currentPlan'),
            upgradeLabel: l.t('upgradeNow'),
            onUpgrade: () => _purchase('plus'),
            features: const [
              'Spin tanpa had',
              'Semua mood lifestyle penuh',
              'Semua 4 tema spin',
              'Penapis lanjutan',
              'Sejarah penuh + simpan kegemaran',
              'Food Memory penuh',
            ],
          ),
          const SizedBox(height: 16),
          _PlanCard(
            emoji: '👑',
            name: l.t('planPro'),
            price: PlanConstants.proPriceLabel,
            perMonth: l.t('perMonth'),
            highlight: false,
            isCurrent: plan == 'pro',
            currentLabel: l.t('currentPlan'),
            upgradeLabel: l.t('upgradeNow'),
            onUpgrade: () => _purchase('pro'),
            features: const [
              'Semua dalam Plus',
              'Healthy Mode penuh + Diet Goal',
              'Calorie Scan',
              'Weekly Food Report + Meal Plan',
              'AI Food Coach',
              'Group Decision penuh',
            ],
          ),
        ],
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.emoji,
    required this.name,
    required this.price,
    required this.perMonth,
    required this.highlight,
    required this.features,
    this.isCurrent = false,
    this.currentLabel,
    this.upgradeLabel,
    this.onUpgrade,
  });

  final String emoji;
  final String name;
  final String price;
  final String perMonth;
  final bool highlight;
  final List<String> features;
  final bool isCurrent;
  final String? currentLabel;
  final String? upgradeLabel;
  final VoidCallback? onUpgrade;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: highlight ? AppColors.primaryRed : AppColors.softBorder,
          width: highlight ? 2.5 : 1,
        ),
        boxShadow: highlight
            ? [
                BoxShadow(
                  color: AppColors.primaryRed.withValues(alpha: 0.15),
                  blurRadius: 20,
                  offset: const Offset(0, 8),
                ),
              ]
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(emoji, style: const TextStyle(fontSize: 30)),
              const SizedBox(width: 10),
              Text(
                name,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: AppColors.darkText,
                ),
              ),
              const Spacer(),
              Text(
                price,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primaryRed,
                ),
              ),
              Text(
                perMonth,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.mutedText,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ...features.map(
            (f) => Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: Row(
                children: [
                  const Icon(Icons.check_circle,
                      size: 18, color: AppColors.healthyGreen),
                  const SizedBox(width: 8),
                  Expanded(child: Text(f, style: const TextStyle(fontSize: 14))),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          if (isCurrent && currentLabel != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: AppColors.softYellow,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Center(
                child: Text(
                  currentLabel!,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    color: AppColors.darkText,
                  ),
                ),
              ),
            )
          else if (upgradeLabel != null)
            ElevatedButton(
              onPressed: onUpgrade,
              child: Text(upgradeLabel!),
            ),
        ],
      ),
    );
  }
}
