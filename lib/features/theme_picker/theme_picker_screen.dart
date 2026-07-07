import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';

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
    final plan = ref.watch(userPlanProvider).value ?? 'free';
    final plusOk = plan == 'plus' || plan == 'pro';

    final themes = [
      ('magicPlate', l.t('themeMagicPlate'), '🍽️', false),
      ('rodaMisteri', l.t('themeRodaMisteri'), '🎡', !plusOk),
      ('shuffleCard', l.t('themeShuffleCard'), '🃏', !plusOk),
      ('nearbyRadar', l.t('themeNearbyRadar'), '📡', !plusOk),
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
                  context.push(RoutePaths.paywall);
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
                      selected ? AppColors.softYellow : AppColors.cardWhite,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: selected
                        ? AppColors.warmYellow
                        : AppColors.softBorder,
                    width: selected ? 2 : 1,
                  ),
                ),
                child: Row(
                  children: [
                    Text(t.$3, style: const TextStyle(fontSize: 32)),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Text(
                        t.$2,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: AppColors.darkText,
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
