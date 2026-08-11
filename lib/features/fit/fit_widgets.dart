import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/mm_icons.dart';
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
    // SP10.2: kad theme-aware — gelap dlm mod gelap, teks onCard.
    final mm = context.mm;
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: padding,
      decoration: BoxDecoration(
        color: mm.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: mm.border),
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
                    style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w800,
                      color: mm.onCard,
                    ),
                  ),
                ),
                // Flexible: trailing (cth butang tukar mood) dengan label
                // terjemahan panjang mesti mengecil, bukan melimpah
                // (QA ISSUE 001.3: 12-19px overflow pada ta/zh).
                if (trailing != null) Flexible(child: trailing!),
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
      // BRIGHT MODE spec: Fit Coach dalam identiti MakanMana — permukaan
      // putih/tema, aksen merah halus, badge PRO kuning kompak. TIADA
      // identiti hijau berasingan.
      // Refinement: kad Fit Coach lebih bersih & premium — ikon lebih besar,
      // permukaan tanpa sempadan tebal (bayang lembut Bright / sempadan halus
      // Dark), badge "EXCLUSIVE" oren. Callback & plan-gating TIDAK berubah.
      child: Builder(builder: (builderContext) {
        final mm = builderContext.mm;
        final dark = builderContext.isDarkMode;
        const exclusive = Color(0xFFF59E14); // oren jenama
        return Container(
          margin: const EdgeInsets.fromLTRB(20, 4, 20, 16),
          decoration: BoxDecoration(
            color: mm.card,
            borderRadius: BorderRadius.circular(22),
            border: dark ? Border.all(color: mm.border) : null,
            boxShadow: dark
                ? null
                : [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ],
          ),
          child: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
                child: Row(
                  children: [
                    // Ikon lebih besar & lebih menonjol.
                    Container(
                      height: 58,
                      width: 58,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            AppColors.primaryRed.withValues(alpha: 0.16),
                            AppColors.primaryRed.withValues(alpha: 0.06),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: const Center(
                        child: MmIcon(MmIconType.fitCoach,
                            size: 32, color: AppColors.primaryRed),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l.t('fitCoachTitle'),
                            style: TextStyle(
                              color: mm.onCard,
                              fontWeight: FontWeight.w800,
                              fontSize: 16.5,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            subtitle,
                            style: TextStyle(
                              color: mm.onCardMuted,
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Icon(Icons.chevron_right, color: mm.iconMuted),
                  ],
                ),
              ),
              // Badge EXCLUSIVE — jelas tetapi tidak terlalu besar.
              Positioned(
                top: 10,
                right: 12,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: exclusive.withValues(alpha: dark ? 0.22 : 0.14),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                        color: exclusive.withValues(alpha: 0.65), width: 1),
                  ),
                  child: Text(
                    l.t('fitExclusive'),
                    style: const TextStyle(
                      fontSize: 9.5,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.4,
                      color: exclusive,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      }),
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
    final mm = context.mm;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: mm.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: mm.border),
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
                  Icon(Icons.add_circle_outline,
                      size: 17, color: mm.iconMuted),
              ],
            ),
            const SizedBox(height: 8),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                value,
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: mm.onCard,
                ),
              ),
            ),
            Text(
              label,
              style: TextStyle(
                  fontSize: 11,
                  color: mm.onCardMuted,
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
    // DARK MODE: kad tip ini dulu HIJAU PUCAT tetap — permukaan terang
    // menyerlah atas latar gelap. Kini permukaan/teks ikut token; aksen
    // hijau kekal terkawal. Nilai Bright TIDAK berubah.
    final dark = context.isDarkMode;
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: dark ? context.mm.card : const Color(0xFFEFFAF3),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: dark
              ? AppColors.healthyGreen.withValues(alpha: 0.35)
              : const Color(0xFFB8E6CB),
        ),
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
            child: Icon(Icons.tips_and_updates_outlined,
                size: 19,
                color: dark
                    ? AppColors.healthyGreen
                    : const Color(0xFF15803D)),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 13,
                height: 1.45,
                fontWeight: FontWeight.w600,
                color: dark ? context.mm.onCard : const Color(0xFF14532D),
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
    final mm = context.mm;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: mm.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: mm.border),
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
                      style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                          color: mm.onCard),
                    ),
                    if (s.placeName != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          '${s.placeName}',
                          style: TextStyle(
                              fontSize: 11.5,
                              color: mm.onCardMuted,
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
                    // Gelap: cerahkan skor; cerah: gelapkan (kontras).
                    color: context.isDarkMode
                        ? Color.lerp(scoreColor, Colors.white, 0.35)
                        : Color.lerp(scoreColor, Colors.black, 0.25),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '${s.calories} kcal · P ${s.proteinG}g · C ${s.carbsG}g · '
            'L ${s.fatG}g · ~RM${s.priceEstimate}',
            style: TextStyle(
                fontSize: 12,
                color: mm.onCardMuted,
                fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          ...s.reasons.map((r) => Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('•  ', style: TextStyle(color: mm.onCardMuted)),
                    Expanded(
                      child: Text(
                        r,
                        style:
                            TextStyle(fontSize: 12, color: mm.onCard),
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
    this.paywallArgs,
  });

  final Widget child;
  final bool locked;

  /// Prompt 12: bawa PaywallArgs (requiredPlan Pro) ke skrin paywall.
  final Object? paywallArgs;

  @override
  Widget build(BuildContext context) {
    if (!locked) return child;
    final l = AppLocalizations.of(context);
    final mm = context.mm;
    // SP10.5: bila child lebih pendek daripada kandungan overlay
    // (cth. satu kad kecil), Stack ikut saiz child dan overlay
    // melimpah (overflow 129px di Meal Wallet). minHeight menjamin
    // ruang cukup untuk kad kunci penuh.
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 310),
      child: Stack(
      children: [
        // Kandungan sampel kekal nampak samar - "show value first".
        Opacity(opacity: 0.35, child: IgnorePointer(child: child)),
        Positioned.fill(
          child: Center(
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 32),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: mm.elevatedCard,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: mm.border),
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
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: mm.onCard),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    l.t('fitLockedBody'),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 12.5,
                        color: mm.onCardMuted,
                        height: 1.4),
                  ),
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: () =>
                        context.push('/paywall', extra: paywallArgs),
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
      ),
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
    final mm = context.mm;
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
                  style: TextStyle(
                      fontSize: 12.5,
                      color: mm.onCardMuted,
                      fontWeight: FontWeight.w600)),
              const Spacer(),
              Text('${g}g',
                  style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                      color: mm.onCard)),
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
