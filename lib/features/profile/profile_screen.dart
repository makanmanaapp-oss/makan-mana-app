import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../social/social_providers.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    await ref.read(authRepositoryProvider).signOut();
    await ref.read(appPrefsProvider).setDevLoggedIn(false);
    if (context.mounted) context.go(RoutePaths.login);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final auth = ref.watch(authRepositoryProvider);
    final email = auth.currentUser?.email ?? 'dev@makanmana.app';

    return Scaffold(
      appBar: AppBar(title: Text(l.t('profileTitle'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
        children: [
          // Kad identiti
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.primaryRed, AppColors.deepSambalRed],
              ),
              borderRadius: BorderRadius.circular(22),
            ),
            child: Builder(builder: (builderContext) {
              final doc = ref.watch(myUserDocProvider).value;
              final photoUrl = doc?['photoUrl'] as String?;
              final displayName =
                  (doc?['displayName'] as String?)?.trim() ?? '';
              final username = doc?['username'] as String? ?? '';
              return Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: Colors.white,
                    backgroundImage:
                        photoUrl != null ? NetworkImage(photoUrl) : null,
                    child: photoUrl == null
                        ? const Text('😋', style: TextStyle(fontSize: 28))
                        : null,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          displayName.isNotEmpty ? displayName : email,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (username.isNotEmpty)
                          Text(
                            '@$username',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.85),
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.warmYellow,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            '${l.t('planLabel')}: '
                            '${l.t(_planKey(ref.watch(userPlanProvider).value))}',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: AppColors.darkText,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: l.t('editProfileTitle'),
                    onPressed: () => context.push('/edit-profile'),
                    icon: const Icon(Icons.edit, color: Colors.white),
                  ),
                ],
              );
            }),
          ),
          const SizedBox(height: 20),
          _tile(context, Icons.restaurant_menu, l.t('tasteProfile'),
              () => context.push('/taste')),
          _tile(context, Icons.psychology_outlined, l.t('foodMemory'),
              () => context.push('/food-memory')),
          _tile(context, Icons.favorite_outline, l.t('favoritesTitle'),
              () => context.push('/favorites')),
          _tile(context, Icons.tune, l.t('dietBudget'),
              () => context.push(RoutePaths.onboarding)),
          _tile(context, Icons.language, l.t('languageLabel'),
              () => _showLanguageDialog(context, ref)),
          _tile(context, Icons.palette_outlined, l.t('appStyle'),
              () => context.push(RoutePaths.themePicker)),
          _tile(context, Icons.workspace_premium_outlined,
              l.t('proHubTitle'), () => context.push('/pro')),
          // MakanMana Fit Coach (V3).
          _tile(context, Icons.monitor_heart_outlined,
              l.t('fitCoachTitle'), () => context.push('/fit/onboarding')),
          _tile(context, Icons.sports_mma, l.t('fitSportMoodTitle'),
              () => context.push('/fit/sport-moods')),
          _tile(context, Icons.insights_outlined, l.t('fitMonitorTitle'),
              () => context.push('/fit/monitor')),
          _tile(context, Icons.watch_outlined, l.t('fitWearable'),
              () => context.push('/fit/wearables')),
          _tile(context, Icons.privacy_tip_outlined,
              l.t('fitHealthPermTitle'),
              () => context.push('/fit/health-permissions')),
          // Profil makanan awam + Feed (V4 Social).
          _tile(context, Icons.badge_outlined, l.t('myFoodProfile'), () {
            final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
            if (uid.isNotEmpty) context.push('/u/$uid');
          }),
          _tile(context, Icons.dynamic_feed_outlined, l.t('feedTitle'),
              () => context.push('/social')),
          // Meal Wallet + Tong-Tong (V4).
          _tile(context, Icons.account_balance_wallet_outlined,
              l.t('mealWalletTitle'), () => context.push('/meal-wallet')),
          _tile(context, Icons.groups_outlined, l.t('tongTongTitle'),
              () => context.push('/tong-tong')),
          _tile(context, Icons.history_toggle_off_outlined, l.t('myActivityTitle'),
              () => context.push('/profile/activity')),
          _tile(context, Icons.card_membership, l.t('planLabel'),
              () => context.push(RoutePaths.paywall)),
          _tile(context, Icons.lock_outline, l.t('privacyLabel'),
              () => context.push(RoutePaths.privacy)),
          _tile(context, Icons.settings_outlined, l.t('settingsLabel'),
              () => context.push(RoutePaths.settings)),
          _tile(context, Icons.help_outline, l.t('helpLabel'),
              () => context.push('/help')),
          // Semakan Admin - hanya untuk akaun admin.
          if (ref.watch(myUserDocProvider).value?['isAdmin'] == true)
            _tile(context, Icons.verified_user_outlined,
                l.t('adminTitle'), () => context.push('/admin')),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => _logout(context, ref),
            icon: const Icon(Icons.logout),
            label: Text(l.t('logout')),
          ),
        ],
      ),
    );
  }

  String _planKey(String? plan) {
    switch (plan) {
      case 'plus':
        return 'planPlus';
      case 'pro':
        return 'planPro';
      default:
        return 'planFree';
    }
  }

  Widget _tile(
      BuildContext context, IconData icon, String label, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: onTap,
        tileColor: AppColors.cardWhite,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.softBorder),
        ),
        leading: Container(
          height: 40,
          width: 40,
          decoration: BoxDecoration(
            color: AppColors.primaryRed.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, size: 22, color: AppColors.primaryRed),
        ),
        title: Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        trailing:
            const Icon(Icons.chevron_right, color: AppColors.mutedText),
      ),
    );
  }

  void _showLanguageDialog(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    const languages = [
      ('ms', 'Bahasa Melayu'),
      ('en', 'English'),
      ('zh', '中文'),
      ('ta', 'தமிழ்'),
    ];
    showDialog<void>(
      context: context,
      builder: (dialogContext) => SimpleDialog(
        title: Text(l.t('languageLabel')),
        children: languages
            .map(
              (lang) => SimpleDialogOption(
                onPressed: () async {
                  await ref
                      .read(languageProvider.notifier)
                      .setLanguage(lang.$1);
                  if (dialogContext.mounted) Navigator.pop(dialogContext);
                },
                child: Text(lang.$2),
              ),
            )
            .toList(),
      ),
    );
  }
}
