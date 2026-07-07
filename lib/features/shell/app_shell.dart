import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
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
        emoji: _themeEmoji(ref.read(spinThemeProvider)),
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t('spinLimitReached'))),
      );
      context.push(RoutePaths.paywall);
    } else {
      context.push(RoutePaths.suggestion);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);

    return Scaffold(
      body: navigationShell,
      extendBody: true,
      bottomNavigationBar: SafeArea(
        child: Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          height: 68,
          decoration: BoxDecoration(
            color: AppColors.cardWhite,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: AppColors.softBorder),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.08),
                blurRadius: 20,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            children: [
              _navItem(context, 0, Icons.home_rounded, l.t('navHome')),
              _navItem(context, 1, Icons.explore_rounded, l.t('navExplore')),
              // Butang Spin tengah - visual ikut tema terpilih (M5).
              Expanded(
                child: GestureDetector(
                  onTap: () => _startSpin(context, ref),
                  child: Transform.translate(
                    offset: const Offset(0, -18),
                    child: Builder(builder: (builderContext) {
                      final theme = ref.watch(spinThemeProvider);
                      final colors = _themeGradient(theme);
                      final ring = _themeRing(theme);
                      return Container(
                        height: 64,
                        width: 64,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: colors,
                          ),
                          border: Border.all(color: ring, width: 3),
                          boxShadow: [
                            BoxShadow(
                              color: colors.first.withValues(alpha: 0.45),
                              blurRadius: 16,
                              offset: const Offset(0, 6),
                            ),
                          ],
                        ),
                        child: Center(
                          child: Text(
                            _themeEmoji(theme),
                            style: const TextStyle(fontSize: 28),
                          ),
                        ),
                      );
                    }),
                  ),
                ),
              ),
              _navItem(context, 2, Icons.history_rounded, l.t('navHistory')),
              _navItem(context, 3, Icons.person_rounded, l.t('navProfile')),
            ],
          ),
        ),
      ),
    );
  }

  /// Emoji butang tengah ikut tema (visual sahaja, logik sama).
  String _themeEmoji(String theme) {
    switch (theme) {
      case 'rodaMisteri':
        return '🎡';
      case 'shuffleCard':
        return '🃏';
      case 'nearbyRadar':
        return '📡';
      default:
        return '🍽️';
    }
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
      BuildContext context, int index, IconData icon, String label) {
    final selected = navigationShell.currentIndex == index;
    return Expanded(
      child: InkWell(
        onTap: () => navigationShell.goBranch(
          index,
          initialLocation: index == navigationShell.currentIndex,
        ),
        borderRadius: BorderRadius.circular(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 26,
              color: selected ? AppColors.primaryRed : AppColors.mutedText,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? AppColors.primaryRed : AppColors.mutedText,
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
    this.emoji = '🍽️',
    this.ringColor = AppColors.warmYellow,
  });

  final String label;
  final String emoji;
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
            height: 120,
            width: 120,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.cardWhite,
              border: Border.all(color: widget.ringColor, width: 4),
              boxShadow: [
                BoxShadow(
                  color: widget.ringColor.withValues(alpha: 0.55),
                  blurRadius: 30,
                ),
              ],
            ),
            child: RotationTransition(
              turns: _controller,
              child: Center(
                child: Text(widget.emoji,
                    style: const TextStyle(fontSize: 56)),
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
