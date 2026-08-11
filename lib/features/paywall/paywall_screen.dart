import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/plan_constants.dart';
import '../../core/entitlement/entitlement.dart';
import '../../core/entitlement/plan_tier.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../../core/services/purchase_service.dart';
import '../../core/widgets/mm_icons.dart';

/// Paywall (Prompt 10): papar Free/Plus/Pro, copy & harga betul, event
/// paywall_viewed / upgrade_clicked. Tiada gateway pembayaran sebenar dibina
/// — CTA guna aliran mock/dev sedia ada, tidak memalsukan bayaran berjaya.
class PaywallScreen extends ConsumerStatefulWidget {
  const PaywallScreen({super.key, this.args});

  final PaywallArgs? args;

  @override
  ConsumerState<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends ConsumerState<PaywallScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final a = widget.args;
      final ent = ref.read(entitlementProvider);
      ref.read(eventLoggerProvider).logEvent(
        EventType.paywallViewed,
        sourceScreen: a?.sourceScreen ?? 'paywall',
        metadata: {
          'requiredPlan': (a?.requiredPlan ?? PlanTier.plus).id,
          'userPlan': ent.plan.id,
          if (a?.featureId != null) 'featureId': a!.featureId,
          'trigger': a?.trigger ?? 'direct',
          'priceShown': (a?.requiredPlan ?? PlanTier.plus).priceLabel,
        },
      );
    });
  }

  /// PAY-01: CTA paywall TIDAK lagi menulis users/{uid}.plan dari klien.
  /// - log upgrade_clicked (analitik kekal)
  /// - cuba Google Play Billing sebenar jika tersedia (bukan bayaran palsu)
  /// - jika store belum sedia: papar "Pembayaran sebenar belum diaktifkan."
  /// Mock upgrade lama hanya wujud di belakang flag dev
  /// (PlanConstants.devMockUpgradeEnabled + kDebugMode; lalai OFF).
  /// NOTA QA INTERNAL: untuk uji Free/Plus/Pro, tukar users/{uid}.plan
  /// secara manual di Firebase Console (bukan melalui butang ini).
  Future<void> _purchase(String plan) async {
    final l = AppLocalizations.of(context);
    // Event upgrade_clicked (tiada data bayaran; paymentImplemented=false).
    ref.read(eventLoggerProvider).logEvent(
      EventType.upgradeClicked,
      sourceScreen: widget.args?.sourceScreen ?? 'paywall',
      metadata: {
        'selectedPlan': plan,
        if (widget.args?.featureId != null) 'featureId': widget.args!.featureId,
        'price': PlanTier.parse(plan).priceLabel,
        'paymentImplemented': false,
      },
    );

    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    try {
      if (plan != 'free') {
        final flow = await ref
            .read(purchaseServiceProvider)
            .buy(uid: uid, plan: plan);
        if (flow == PurchaseFlow.storeStarted) {
          return; // Play uruskan UI bayaran sebenar.
        }
      }

      // Laluan mock dev-only (lalai OFF) — bukan untuk QA internal biasa.
      if (kDebugMode && PlanConstants.devMockUpgradeEnabled) {
        await ref
            .read(mockPurchaseServiceProvider)
            .purchase(uid: uid, plan: plan);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l.t('planUpdated'))),
          );
        }
        return;
      }

      // Tiada gateway sebenar lagi: JANGAN ubah plan, JANGAN pura-pura jaya.
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('paymentNotActive'))),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('subscriptionComingSoon'))),
        );
      }
    }
  }

  /// Part 22: pulihkan langganan sedia ada (Play pancar semula → sahkan
  /// semula di pelayan). Juga segar status pelan autoritatif.
  Future<void> _restore() async {
    final l = AppLocalizations.of(context);
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    try {
      await ref.read(purchaseServiceProvider).restore(uid);
      ref.read(couponServiceProvider).refreshPlanStatus();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('subVerifying'))),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('subUnavailable'))),
        );
      }
    }
  }

  /// Part 32: urus langganan → buka halaman langganan Google Play.
  Future<void> _manageSubscription() async {
    final l = AppLocalizations.of(context);
    // Halaman langganan khusus produk/app (rasmi Google Play).
    final uri = Uri.parse(
      'https://play.google.com/store/account/subscriptions'
      '?package=${PlanConstants.androidPackageName}',
    );
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t('subUnavailable'))),
      );
    }
  }

  /// Papar mesej JUJUR dari aliran hasil pembelian (pending/jaya/gagal/batal).
  void _showPurchaseResult(PurchaseResult r) {
    if (!mounted) return;
    final l = AppLocalizations.of(context);
    final String msg;
    switch (r.outcome) {
      case PurchaseOutcome.verifiedActive:
        msg = l.t('subActiveThanks');
        // Segar semula status pelan (pelayan autoritatif) supaya UI kemas kini.
        ref.read(couponServiceProvider).refreshPlanStatus();
        break;
      case PurchaseOutcome.verifiedNotEntitled:
        final status = r.planStatus ?? '';
        if (status == 'grace_period') {
          msg = l.t('subGracePeriod');
        } else if (status == 'on_hold') {
          msg = l.t('subOnHold');
        } else if (status == 'pending') {
          msg = l.t('subPending');
        } else {
          msg = '${l.t('subNotEntitledYet')}$status';
        }
        break;
      case PurchaseOutcome.pending:
        msg = l.t('subPending');
        break;
      case PurchaseOutcome.cancelled:
        msg = l.t('subCancelled');
        break;
      case PurchaseOutcome.error:
        msg = l.t('subUnavailable');
        break;
    }
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final plan = ref.watch(userPlanProvider).value ?? 'free';
    final targetPro = widget.args?.requiredPlan == PlanTier.pro;

    // Dengar hasil pembelian server-authoritative (Part 24) — mesej jujur.
    ref.listen<AsyncValue<PurchaseResult>>(
      purchaseResultsProvider,
      (prev, next) {
        final r = next.value;
        if (r != null) _showPurchaseResult(r);
      },
    );

    return Scaffold(
      appBar: AppBar(title: Text(l.t('paywallTitle'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          // SP10: banner promo pelancaran — FRAMING sahaja; harga sebenar
          // TIDAK berubah (Plus RM9.99 / Pro RM29.90, PlanConstants).
          Container(
            padding: const EdgeInsets.all(16),
            margin: const EdgeInsets.only(bottom: 16),
            // DARK MODE ZIP: banner promo = permukaan bersalut merah
            // (bukan gradient terang); Bright kekal seperti diluluskan.
            decoration: BoxDecoration(
              gradient: context.isDarkMode
                  ? null
                  : const LinearGradient(
                      colors: [AppColors.primaryRed, Color(0xFFFF6B45)],
                    ),
              color: context.isDarkMode
                  ? MMColors.redTintSurfaceDark
                  : null,
              borderRadius: BorderRadius.circular(18),
              border: context.isDarkMode
                  ? Border.all(
                      color:
                          AppColors.primaryRed.withValues(alpha: 0.45))
                  : null,
            ),
            child: Row(
              children: [
                const Icon(Icons.local_fire_department,
                    size: 28, color: Colors.white),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l.t('launchPromoTitle'),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        l.t('launchPromoSub'),
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.9),
                          fontSize: 12.5,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.warmYellow,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    l.t('save60Badge'),
                    style: const TextStyle(
                      color: AppColors.darkText,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Tajuk mengikut pelan disasarkan (jika datang dari ciri terkunci).
          if (widget.args != null) ...[
            Text(
              targetPro ? l.t('paywallProHeadline') : l.t('paywallPlusHeadline'),
              style: const TextStyle(
                  fontSize: 22, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text(
              targetPro ? l.t('paywallProSub') : l.t('paywallPlusSub'),
              style: const TextStyle(
                  fontSize: 13.5, color: AppColors.mutedText, height: 1.35),
            ),
            const SizedBox(height: 18),
          ],
          _PlanCard(
            icon: MmIconType.lapar,
            name: l.t('planFree'),
            price: 'RM0',
            perMonth: '',
            highlight: false,
            currentLabel: l.t('currentPlan'),
            isCurrent: plan == 'free',
            upgradeLabel: l.t('downgradeFree'),
            onUpgrade: () => _purchase('free'),
            features: [
              l.t('freeBenefitSpins'),
              l.t('freeBenefitBasicMoods'),
              l.t('freeBenefitPreviewMoods'),
              l.t('freeBenefitBasicMemory'),
            ],
          ),
          const SizedBox(height: 16),
          _PlanCard(
            icon: MmIconType.highRating,
            name: l.t('planPlus'),
            price: PlanConstants.plusPriceLabel,
            perMonth: l.t('perMonth'),
            highlight: plan != 'plus' && !targetPro,
            isCurrent: plan == 'plus',
            currentLabel: l.t('currentPlan'),
            promoBadge: l.t('save60Badge'),
            // Kunci l10n sedia ada SUDAH ada harga ("Upgrade Plus ·
            // RM9.99/bulan") — jangan tambah lagi (elak berganda).
            upgradeLabel: l.t('upgradePlus'),
            onUpgrade: () => _purchase('plus'),
            features: [
              l.t('plusBenefitUnlimitedSpin'),
              l.t('plusBenefitLifestyleMoods'),
              l.t('plusBenefitAllThemes'),
              l.t('plusBenefitAdvancedFilter'),
              l.t('plusBenefitFavorites'),
              l.t('plusBenefitFullHistory'),
            ],
          ),
          const SizedBox(height: 16),
          _PlanCard(
            icon: MmIconType.proSeal,
            name: l.t('planPro'),
            price: PlanConstants.proPriceLabel,
            perMonth: l.t('perMonth'),
            highlight: plan != 'pro' && targetPro,
            isCurrent: plan == 'pro',
            currentLabel: l.t('currentPlan'),
            promoBadge: l.t('save60Badge'),
            upgradeLabel: l.t('upgradePro'),
            onUpgrade: () => _purchase('pro'),
            features: [
              l.t('proBenefitHealthyMode'),
              l.t('proBenefitDietGoal'),
              l.t('proBenefitCalorieScan'),
              l.t('proBenefitWeeklyReport'),
              l.t('proBenefitMealPlan'),
              l.t('proBenefitFoodCoach'),
              l.t('proBenefitFitCoach'),
              l.t('proBenefitFoodMemory'),
            ],
          ),
          const SizedBox(height: 14),
          // SP10: nota jujur harga promo pelancaran.
          Text(
            l.t('launchPromoNote'),
            textAlign: TextAlign.center,
            style: const TextStyle(
                fontSize: 12, color: AppColors.mutedText, height: 1.4),
          ),
          const SizedBox(height: 8),
          // PROMPT 12: ada kod kupon? → skrin tebus Pro Trial.
          OutlinedButton.icon(
            onPressed: () => context.push('/coupon'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(0, 48),
              side: const BorderSide(color: AppColors.primaryRed),
              foregroundColor: AppColors.primaryRed,
            ),
            icon: const Icon(Icons.confirmation_number_outlined, size: 18),
            label: Text(l.t('couponEntryPaywall'),
                style: const TextStyle(fontWeight: FontWeight.w800)),
          ),
          const SizedBox(height: 4),
          // Part 22/25: pulih pembelian + urus/segar langganan. Semua
          // server-authoritative — tiada plan ditulis dari klien.
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            children: [
              TextButton.icon(
                onPressed: _restore,
                icon: const Icon(Icons.restore, size: 18),
                label: Text(l.t('restorePurchase')),
              ),
              TextButton.icon(
                onPressed: _manageSubscription,
                icon: const Icon(Icons.settings_outlined, size: 18),
                label: Text(l.t('manageSubscription')),
              ),
            ],
          ),
          const SizedBox(height: 4),
          // Pilihan sekunder: terus guna Free (tidak agresif).
          TextButton(
            onPressed: () => context.pop(),
            child: Text(l.t('continueFreeMode')),
          ),
        ],
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.icon,
    required this.name,
    required this.price,
    required this.perMonth,
    required this.highlight,
    required this.features,
    this.isCurrent = false,
    this.currentLabel,
    this.upgradeLabel,
    this.onUpgrade,
    this.promoBadge,
  });

  final MmIconType icon;
  final String name;
  final String price;
  final String perMonth;
  final bool highlight;
  final List<String> features;
  final bool isCurrent;
  final String? currentLabel;
  final String? upgradeLabel;
  final VoidCallback? onUpgrade;

  /// SP10: badge "JIMAT 60%" — framing promo; harga tidak berubah.
  final String? promoBadge;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.mm.card,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: highlight ? AppColors.primaryRed : context.mm.border,
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
          // QA akhir: header pelan guna Wrap — pada 360dp skala teks 1.30
          // Row tegar (nama + badge + harga) melimpah 65px. Harga turun ke
          // baris kedua dengan kemas apabila sempit; nilai TIDAK dipotong.
          Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  MmIcon(icon, size: 28, color: AppColors.primaryRed),
                  const SizedBox(width: 10),
                  Text(
                    name,
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: context.mm.onCard,
                    ),
                  ),
                ],
              ),
              if (promoBadge != null)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.warmYellow,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    promoBadge!,
                    style: const TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w900,
                      color: AppColors.darkText,
                    ),
                  ),
                ),
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: price,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primaryRed,
                      ),
                    ),
                    TextSpan(
                      text: perMonth,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.mutedText,
                      ),
                    ),
                  ],
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
                  // Kad ini hardcode putih — teks mesti gelap eksplisit
                  // supaya kekal boleh dibaca dalam mod gelap.
                  Expanded(
                      child: Text(f,
                          style: TextStyle(
                              fontSize: 14, color: context.mm.onCard))),
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
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: onUpgrade,
                child: Text(upgradeLabel!),
              ),
            ),
        ],
      ),
    );
  }
}
