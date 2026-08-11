import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import '../../core/providers/makanmana_user_context_provider.dart';

/// 🍜 Profil Makanan — pusat kawalan selera makan.
/// Membaca terus dari MakanManaUserContext (Prompt 2) dan menghala ke
/// editor yang menyimpan melalui kaedah kemas kini konteks.
class ProfileMakananScreen extends ConsumerStatefulWidget {
  const ProfileMakananScreen({super.key});

  @override
  ConsumerState<ProfileMakananScreen> createState() =>
      _ProfileMakananScreenState();
}

class _ProfileMakananScreenState extends ConsumerState<ProfileMakananScreen> {
  @override
  void initState() {
    super.initState();
    // Pastikan konteks terhidrat (dilangkau jika sudah).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
      if (uid.isNotEmpty) {
        ref.read(makanManaUserContextProvider.notifier).loadForUser(uid);
      }
    });
  }

  String _dietLabel(AppLocalizations l, String diet) => switch (diet) {
        'vegetarian' => l.t('dietVegetarian'),
        'vegan' => l.t('dietVegan'),
        'pescatarian' => l.t('dietPescatarian'),
        _ => l.t('dietNone'),
      };

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = ref.watch(makanManaUserContextProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.t('profileMakanan'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          // Ringkasan selera (live dari konteks).
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.primaryRed, Color(0xFFFF6B45)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.t('pmSummary'),
                    style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _pill(context, _dietLabel(l, c.dietType)),
                    _pill(
                        context,
                        c.halalPreference
                            ? l.t('halalYes')
                            : l.t('halalAny')),
                    _pill(context, 'RM${c.budgetMin}–RM${c.budgetMax}'),
                    _pill(context, '${c.effectiveRadiusKm.round()} km'),
                    _pill(context,
                        'Pedas ${c.spicyPreference.clamp(0, 3)}/3'),
                    if (c.favoriteCuisines.isNotEmpty)
                      _pill(context, '${c.favoriteCuisines.length} cuisine'),
                    if (c.allergies.isNotEmpty)
                      _pill(context, '${c.allergies.length} alahan'),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          _tile(context, Icons.psychology_outlined, l.t('foodMemory'),
              () => context.push('/food-memory')),
          _tile(context, Icons.restaurant_menu, l.t('tasteProfile'),
              () => context.push('/taste')),
          _tile(context, Icons.spa_outlined, l.t('pmDietAllergy'),
              () => context.push('/pm/diet-allergy')),
          _tile(context, Icons.tune, l.t('pmBudgetRadius'),
              () => context.push('/pm/budget-radius')),
          _tile(context, Icons.ramen_dining_outlined, l.t('pmFavCuisine'),
              () => context.push('/pm/cuisine')),
          _tile(context, Icons.local_fire_department_outlined, l.t('pmSpice'),
              () => context.push('/pm/spice')),
          _tile(context, Icons.schedule_outlined, l.t('pmMealTime'),
              () => context.push('/pm/meal-time')),
          _tile(context, Icons.flag_outlined, l.t('proGoalTitle'),
              () => context.push('/pro/diet-goal'),
              subtitle: c.dietGoal),
          // Jambatan Fit Food (status sahaja — tiada penjana workout).
          _tile(
            context,
            Icons.fitness_center_outlined,
            l.t('pmFitFoodGoal'),
            () => context.push('/fit/onboarding'),
            subtitle: c.fitGoal == 'none' || c.fitGoal.isEmpty
                ? l.t('pmNoFitGoal')
                : c.fitGoal,
          ),
        ],
      ),
    );
  }

  Widget _pill(BuildContext context, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: context.mm.card,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: context.mm.border),
        ),
        child: Text(text,
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: context.mm.onCard)),
      );

  Widget _tile(BuildContext context, IconData icon, String label,
      VoidCallback onTap,
      {String? subtitle}) {
    // SP10.2: PERATURAN KAD — card + onCard + onCardMuted (theme-aware).
    final mm = context.mm;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: onTap,
        tileColor: mm.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: mm.border),
        ),
        leading: Container(
          height: 40,
          width: 40,
          decoration: BoxDecoration(
            color: AppColors.primaryRed
                .withValues(alpha: context.isDarkMode ? 0.18 : 0.08),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, size: 21, color: AppColors.primaryRed),
        ),
        title: Text(label,
            style: TextStyle(
                fontWeight: FontWeight.w700, color: mm.onCard)),
        subtitle: (subtitle != null && subtitle.isNotEmpty)
            ? Text(subtitle,
                style:
                    TextStyle(fontSize: 12.5, color: mm.onCardMuted))
            : null,
        trailing: Icon(Icons.chevron_right, color: mm.iconMuted),
      ),
    );
  }
}
