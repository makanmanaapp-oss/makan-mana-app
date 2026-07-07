import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import 'fit_charts.dart';
import 'fit_models.dart';
import 'fit_providers.dart';

/// Kad seksyen putih standard Monitor.
class FitSectionCard extends StatelessWidget {
  const FitSectionCard({
    super.key,
    required this.child,
    this.title,
    this.trailing,
    this.padding = const EdgeInsets.all(16),
  });

  final String? title;
  final Widget child;
  final Widget? trailing;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: padding,
      decoration: BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.softBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Row(
              children: [
                Expanded(
                  child: Text(
                    title!,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w800,
                      color: AppColors.darkText,
                    ),
                  ),
                ),
                if (trailing != null) trailing!,
              ],
            ),
            const SizedBox(height: 12),
          ],
          child,
        ],
      ),
    );
  }
}

/// Kad Fit Coach di Home - ringkasan hari ini + CTA buka coach.
class FitCoachCard extends ConsumerWidget {
  const FitCoachCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final access = ref.watch(fitAccessProvider);
    final profile = ref.watch(fitProfileProvider).value;
    final metrics = ref.watch(todayMetricsProvider).value;
    final score = ref.watch(dailyFitScoreProvider);

    String subtitle;
    if (access != FitAccess.full) {
      subtitle = l.t('fitCoachTeaser');
    } else if (profile == null) {
      subtitle = l.t('fitSetupPrompt');
    } else {
      final steps = metrics?.steps ?? 0;
      final workout = metrics?.workoutCompleted == true
          ? l.t('fitWorkoutDone')
          : l.t('fitWorkoutPending');
      subtitle =
          '${_fmt(steps)} ${l.t('fitStepsUnit')} · $workout · Fit Score ${score ?? '-'}';
    }

    return GestureDetector(
      onTap: () {
        if (access != FitAccess.full) {
          context.push('/fit/monitor'); // pratonton berkunci
        } else if (profile == null) {
          context.push('/fit/onboarding');
        } else {
          context.push('/fit/today');
        }
      },
      child: Container(
        margin: const EdgeInsets.fromLTRB(20, 4, 20, 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF0F766E), Color(0xFF15803D)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            Container(
              height: 46,
              width: 46,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(Icons.monitor_heart_outlined,
                  color: Colors.white, size: 26),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          l.t('fitCoachTitle'),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (access != FitAccess.full) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.warmYellow,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Text(
                            'PRO',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: AppColors.darkText,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.9),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: Colors.white),
          ],
        ),
      ),
    );
  }

  static String _fmt(int n) => n
      .toString()
      .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]},');
}

/// Kad metrik kecil (grid Monitor).
class MetricCard extends StatelessWidget {
  const MetricCard({
    super.key,
    required this.icon,
    required this.value,
    required this.label,
    this.color = AppColors.primaryRed,
    this.onTap,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.cardWhite,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.softBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: color),
                const Spacer(),
                if (onTap != null)
                  const Icon(Icons.add_circle_outline,
                      size: 17, color: AppColors.mutedText),
              ],
            ),
            const SizedBox(height: 8),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                value,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: AppColors.darkText,
                ),
              ),
            ),
            Text(
              label,
              style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.mutedText,
                  fontWeight: FontWeight.w600),
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

/// Nota coach (nasihat pendek AI).
class CoachInsightCard extends StatelessWidget {
  const CoachInsightCard({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFEFFAF3),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFB8E6CB)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 34,
            width: 34,
            decoration: BoxDecoration(
              color: AppColors.healthyGreen.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.tips_and_updates_outlined,
                size: 19, color: Color(0xFF15803D)),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 13,
                height: 1.45,
                fontWeight: FontWeight.w600,
                color: Color(0xFF14532D),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Kad menu dengan MenuFitScore.
class MenuFitCard extends StatelessWidget {
  const MenuFitCard({
    super.key,
    required this.suggestion,
    this.onAccept,
  });

  final MenuSuggestion suggestion;
  final VoidCallback? onAccept;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final s = suggestion;
    final scoreColor = s.fitScore >= 75
        ? AppColors.healthyGreen
        : s.fitScore >= 55
            ? AppColors.warmYellow
            : AppColors.warningOrange;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.softBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      s.menuName,
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 14),
                    ),
                    if (s.placeName != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          '📍 ${s.placeName}',
                          style: const TextStyle(
                              fontSize: 11.5,
                              color: AppColors.mutedText,
                              fontWeight: FontWeight.w600),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: scoreColor.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  'Fit ${s.fitScore}%',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: Color.lerp(scoreColor, Colors.black, 0.25),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '${s.calories} kcal · P ${s.proteinG}g · C ${s.carbsG}g · '
            'L ${s.fatG}g · ~RM${s.priceEstimate}',
            style: const TextStyle(
                fontSize: 12,
                color: AppColors.mutedText,
                fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          ...s.reasons.map((r) => Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('•  ',
                        style: TextStyle(color: AppColors.mutedText)),
                    Expanded(
                      child: Text(
                        r,
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.darkText),
                      ),
                    ),
                  ],
                ),
              )),
          if (onAccept != null) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: onAccept,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primaryRed,
                  minimumSize: const Size(104, 36),
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                ),
                child: Text(
                  l.t('fitLogThis'),
                  style: const TextStyle(
                      fontSize: 12.5, fontWeight: FontWeight.w800),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Pratonton berkunci untuk Free/Plus - tunjuk nilai dahulu, blur detail.
class LockedProOverlay extends StatelessWidget {
  const LockedProOverlay({
    super.key,
    required this.child,
    required this.locked,
  });

  final Widget child;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    if (!locked) return child;
    final l = AppLocalizations.of(context);
    return Stack(
      children: [
        // Kandungan sampel kekal nampak samar - "show value first".
        Opacity(opacity: 0.35, child: IgnorePointer(child: child)),
        Positioned.fill(
          child: Center(
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 32),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.cardWhite,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.softBorder),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.08),
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    height: 52,
                    width: 52,
                    decoration: BoxDecoration(
                      color: AppColors.warmYellow.withValues(alpha: 0.25),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(Icons.workspace_premium,
                        color: Color(0xFFB45309), size: 28),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    l.t('fitLockedTitle'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 15),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    l.t('fitLockedBody'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontSize: 12.5,
                        color: AppColors.mutedText,
                        height: 1.4),
                  ),
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: () => context.push('/paywall'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primaryRed,
                      minimumSize: const Size(200, 44),
                    ),
                    child: Text(l.t('fitUpgradeCta'),
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Legend kecil untuk donut makro.
class MacroLegend extends StatelessWidget {
  const MacroLegend({
    super.key,
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
  });

  final int proteinG;
  final int carbsG;
  final int fatG;

  @override
  Widget build(BuildContext context) {
    Widget row(Color c, String label, int g) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(
            children: [
              Container(
                height: 10,
                width: 10,
                decoration: BoxDecoration(color: c, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Text(label,
                  style: const TextStyle(
                      fontSize: 12.5,
                      color: AppColors.mutedText,
                      fontWeight: FontWeight.w600)),
              const Spacer(),
              Text('${g}g',
                  style: const TextStyle(
                      fontSize: 12.5, fontWeight: FontWeight.w800)),
            ],
          ),
        );
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        row(MacroDonut.proteinColor, 'Protein', proteinG),
        row(MacroDonut.carbsColor, 'Karbohidrat', carbsG),
        row(MacroDonut.fatColor, 'Lemak', fatG),
      ],
    );
  }
}
