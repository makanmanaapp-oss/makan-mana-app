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
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import '../suggestions/spin_controller.dart';

/// Rangka utama app: 4 tab + butang Spin tengah (aksi utama MakanMana).
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  Future<void> _startSpin(BuildContext context, WidgetRef ref) async {
    final l = AppLocalizations.of(context);
    final controller = ref.read(spinControllerProvider);

    // Animasi Magic Plate berjalan serentak dengan logik spin
    // (semak had harian, rekod sesi + suggestion, log events).
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => _SpinDialog(
        label: l.t('spinning'),
        ringColor: _themeRing(ref.read(spinThemeProvider)),
      ),
    );

    final results = await Future.wait<Object?>([
      controller.spin(mood: ref.read(selectedMoodProvider)),
      Future<void>.delayed(const Duration(milliseconds: 2200)),
    ]);
    final outcome = results.first as SpinOutcome;

    // Segarkan penunjuk "spin hari ni" di Home.
    ref.invalidate(dailyUsageProvider);

    if (!context.mounted) return;
    Navigator.of(context, rootNavigator: true).pop();

    if (outcome.blocked) {
      // Prompt 10: had spin Free dicapai -> event + paywall Plus (unlimited).
      final ent = ref.read(entitlementProvider);
      ref.read(eventLoggerProvider).logEvent(
        EventType.quotaLimitReached,
        sourceScreen: SourceScreen.spinButton,
        metadata: {
          'limitType': 'daily_spin',
          'userPlan': ent.plan.id,
        },
      );
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t('spinLimitReached'))),
      );
      context.push(
        RoutePaths.paywall,
        extra: PaywallArgs(
          featureId: FeatureId.unlimitedSpin,
          requiredPlan: PlanTier.plus,
          userPlan: ent.plan,
          sourceScreen: SourceScreen.spinButton,
          trigger: 'spin_limit',
        ),
      );
    } else {
      // Prompt 7: serah sesi spin (sessionId/suggestionId + calon) kepada
      // gelung tindakan supaya Accept/Reject di skrin cadangan kekal betul.
      final place = outcome.place ?? ref.read(currentSuggestionProvider);
      if (place != null) {
        ref.read(suggestionActionControllerProvider.notifier).beginFromSpin(
              place,
              suggestionId: controller.currentSuggestionId,
              sessionId: controller.sessionId,
              source: place.source,
              alternatives: controller.remoteCandidates,
              mood: ref.read(selectedMoodProvider),
              radiusMeters:
                  ref.read(makanManaUserContextProvider).effectiveRadiusMeters,
              contextHash: controller.contextHash,
            );
      }
      context.push(RoutePaths.suggestion);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final mm = context.mm;

    // BRIGHT MODE spec: navigasi TETAP lebar penuh melekat pada tepi bawah
    // (bukan pil terapung), permukaan putih/tema, pembahagi atas halus,
    // aktif merah / tidak aktif kelabu, Spin bersepadu naik 10px sahaja.
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: Container(
        // Front Page Redesign 1A — bekas warm-white bersudut-atas bulat +
        // bayang lembut ke atas (arah imej rujukan). Destinasi/callback kekal.
        decoration: BoxDecoration(
          color: mm.card,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
          border: Border(top: BorderSide(color: mm.border)),
          boxShadow: context.isDarkMode
              ? null
              : [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.06),
                    blurRadius: 16,
                    offset: const Offset(0, -4),
                  ),
                ],
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 62,
            child: Row(
              children: [
                _navItem(context, 0, MmIconType.home, l.t('navHome')),
                _navItem(context, 1, MmIconType.explore, l.t('navExplore')),
                // Aksi Spin signature - bersepadu, matang, tanpa glow.
                Expanded(
                  child: Semantics(
                    button: true,
                    label: l.t('spinShort'),
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () => _startSpin(context, ref),
                      child: Transform.translate(
                        offset: const Offset(0, -10),
                        child: Builder(builder: (builderContext) {
                          final theme = ref.watch(spinThemeProvider);
                          final colors = _themeGradient(theme);
                          return Container(
                            height: 56,
                            width: 56,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: colors,
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color:
                                      Colors.black.withValues(alpha: 0.18),
                                  blurRadius: 8,
                                  offset: const Offset(0, 3),
                                ),
                              ],
                            ),
                            child: const Center(
                              child: MmIcon(
                                MmIconType.spin,
                                size: 30,
                                color: Colors.white,
                                accent: Colors.white70,
                              ),
                            ),
                          );
                        }),
                      ),
                    ),
                  ),
                ),
                _navItem(context, 2, MmIconType.history, l.t('navHistory')),
                _navItem(context, 3, MmIconType.profile, l.t('navProfile')),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Gradient butang tengah per tema - bagi setiap tema identiti sendiri.
  List<Color> _themeGradient(String theme) {
    switch (theme) {
      case 'rodaMisteri':
        return const [Color(0xFF7C3AED), Color(0xFFDB2777)]; // ungu-magenta
      case 'shuffleCard':
        return const [Color(0xFF0F172A), Color(0xFF475569)]; // gelap premium
      case 'nearbyRadar':
        return const [Color(0xFF059669), Color(0xFF0EA5E9)]; // hijau-biru
      default:
        return const [AppColors.primaryRed, AppColors.deepSambalRed];
    }
  }

  Color _themeRing(String theme) {
    switch (theme) {
      case 'rodaMisteri':
        return const Color(0xFFF0ABFC);
      case 'shuffleCard':
        return AppColors.warmYellow;
      case 'nearbyRadar':
        return const Color(0xFF6EE7B7);
      default:
        return AppColors.warmYellow;
    }
  }

  Widget _navItem(
      BuildContext context, int index, MmIconType icon, String label) {
    final selected = navigationShell.currentIndex == index;
    final inactive = context.mm.iconMuted;
    return Expanded(
      child: InkWell(
        onTap: () => navigationShell.goBranch(
          index,
          initialLocation: index == navigationShell.currentIndex,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            MmIcon(
              icon,
              size: 24,
              filled: selected,
              color: selected ? AppColors.primaryRed : inactive,
              accent: selected ? AppColors.primaryRed : inactive,
            ),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? AppColors.primaryRed : inactive,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SpinDialog extends StatefulWidget {
  const _SpinDialog({
    required this.label,
    this.ringColor = AppColors.warmYellow,
  });

  final String label;
  final Color ringColor;

  @override
  State<_SpinDialog> createState() => _SpinDialogState();
}

class _SpinDialogState extends State<_SpinDialog>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller =
        AnimationController(vsync: this, duration: const Duration(seconds: 1))
          ..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      elevation: 0,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            height: 108,
            width: 108,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              // Dark: permukaan elevated charcoal (ZIP), Bright: putih.
              color: context.isDarkMode
                  ? context.mm.elevatedCard
                  : AppColors.cardWhite,
              border: Border.all(color: widget.ringColor, width: 3),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.25),
                  blurRadius: 14,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: RotationTransition(
              turns: _controller,
              child: const Center(
                child: MmIcon(
                  MmIconType.spin,
                  size: 52,
                  color: AppColors.primaryRed,
                ),
              ),
            ),
          ),
          const SizedBox(height: 18),
          Text(
            widget.label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
