import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/entitlement/entitlement.dart';
import '../../core/entitlement/plan_tier.dart';
import '../../core/providers.dart';
import '../../core/widgets/mm_icons.dart';

/// Pemilih tema Spin (Profile > App Style > Spin Theme).
/// Milestone 1: Magic Plate sahaja aktif; lain berkunci (Plus - Milestone 5).
class ThemePickerScreen extends ConsumerStatefulWidget {
  const ThemePickerScreen({super.key});

  @override
  ConsumerState<ThemePickerScreen> createState() => _ThemePickerScreenState();
}

class _ThemePickerScreenState extends ConsumerState<ThemePickerScreen> {
  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final prefs = ref.watch(appPrefsProvider);
    final active = ref.watch(spinThemeProvider);
    // Free: Magic Plate sahaja. Plus/Pro: semua 4 tema.
    final ent = ref.watch(entitlementProvider);
    final plusOk = ent.isPlusOrAbove;

    // BRIGHT MODE spec: emoji digantikan swatch gradient tema + ikon Spin
    // proprietary (identiti setiap tema kekal — visual sahaja).
    final themes = [
      (
        'magicPlate',
        l.t('themeMagicPlate'),
        const [AppColors.primaryRed, AppColors.deepSambalRed],
        false
      ),
      (
        'rodaMisteri',
        l.t('themeRodaMisteri'),
        const [Color(0xFF7C3AED), Color(0xFFDB2777)],
        !plusOk
      ),
      (
        'shuffleCard',
        l.t('themeShuffleCard'),
        const [Color(0xFF0F172A), Color(0xFF475569)],
        !plusOk
      ),
      (
        'nearbyRadar',
        l.t('themeNearbyRadar'),
        const [Color(0xFF059669), Color(0xFF0EA5E9)],
        !plusOk
      ),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(l.t('spinThemeTitle'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: themes.map((t) {
          final selected = active == t.$1;
          final locked = t.$4;
          return Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: () async {
                if (locked) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(l.t('lockedPlus'))),
                  );
                  context.push(
                    RoutePaths.paywall,
                    extra: ent.buildPaywallArgs(
                      featureId: FeatureId.allSpinThemes,
                      sourceScreen: 'theme_picker',
                      requiredPlan: PlanTier.plus,
                    ),
                  );
                  return;
                }
                await prefs.setSpinTheme(t.$1);
                ref.read(spinThemeProvider.notifier).state = t.$1;
                setState(() {});
              },
              child: Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color:
                      selected ? AppColors.softYellow : context.mm.card,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: selected
                        ? AppColors.warmYellow
                        : context.mm.border,
                    width: selected ? 2 : 1,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      height: 44,
                      width: 44,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: t.$3,
                        ),
                      ),
                      child: const Center(
                        child: MmIcon(MmIconType.spin,
                            size: 22,
                            color: Colors.white,
                            accent: Colors.white70),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Text(
                        t.$2,
                        // SP10.5: kad kuning (selected) kekal teks gelap;
                        // kad token guna onCard.
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: selected
                              ? AppColors.darkText
                              : context.mm.onCard,
                        ),
                      ),
                    ),
                    if (locked)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: AppColors.primaryRed,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          l.t('plusBadge'),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      )
                    else if (selected)
                      const Icon(Icons.check_circle,
                          color: AppColors.primaryRed),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
