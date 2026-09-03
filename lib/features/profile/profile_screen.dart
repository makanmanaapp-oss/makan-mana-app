import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../../core/widgets/makan_avatar.dart';
import '../home/home_palette.dart';
import '../paywall/coupon_status.dart';
import '../place_corrections/place_correction_flags.dart';
import '../social/social_providers.dart';

/// Profile Redesign — presentation-only refresh toward the approved Home
/// design language (warm background, premium red hero, soft white menu cards).
///
/// Every provider, callback and route destination is preserved exactly:
/// - identity/plan/trial data → [myUserDocProvider], [userPlanProvider],
///   [couponTrialInfo] (unchanged)
/// - edit action → `/edit-profile`
/// - all menu tiles → their existing `context.push(...)` targets
/// - logout → [_logout]
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    // Front Page Redesign 1 — putuskan token push akaun ini SEBELUM sign-out
    // (token FCM hanya dikaitkan dengan pengguna disahkan; elak push silang
    // akaun pada peranti sama). Best-effort; tidak menghalang log keluar.
    final uid = ref.read(currentUidProvider);
    await ref.read(notificationServiceProvider).detach(uid);
    await ref.read(authRepositoryProvider).signOut();
    await ref.read(appPrefsProvider).setDevLoggedIn(false);
    if (context.mounted) context.go(RoutePaths.login);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final palette = HomePalette.of(context);
    final auth = ref.watch(authRepositoryProvider);
    // 10.1B-PHONE-CLOSE: akaun telefon tiada email — papar nombor
    // sendiri, bukan placeholder dev lama.
    final authUser = auth.currentUser;
    final email = (authUser?.email?.isNotEmpty ?? false)
        ? authUser!.email!
        : (authUser?.phoneNumber?.isNotEmpty ?? false)
            ? authUser!.phoneNumber!
            : 'dev@makanmana.app';

    return Scaffold(
      backgroundColor: palette.background,
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
          children: [
            // Tajuk halaman besar (selaras Home) — gantikan AppBar rata.
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 8, 4, 16),
              child: Text(
                l.t('profileTitle'),
                style: TextStyle(
                  color: palette.text,
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
            ),
            _HeroCard(email: email),
            const SizedBox(height: 22),
            // Menu — SEMUA item & route dikekalkan; hanya rupa diperbaharui.
            _tile(context, palette, Icons.ramen_dining_outlined,
                l.t('profileMakanan'),
                () => context.push(RoutePaths.profileMakanan)),
            _tile(context, palette, Icons.restaurant_menu, l.t('tasteProfile'),
                () => context.push('/taste')),
            _tile(context, palette, Icons.psychology_outlined, l.t('foodMemory'),
                () => context.push('/food-memory')),
            _tile(context, palette, Icons.favorite_outline,
                l.t('favoritesTitle'), () => context.push('/favorites')),
            _tile(context, palette, Icons.tune, l.t('dietBudget'),
                () => context.push(RoutePaths.onboarding)),
            _tile(context, palette, Icons.language, l.t('languageLabel'),
                () => _showLanguageDialog(context, ref)),
            _tile(context, palette, Icons.palette_outlined, l.t('appStyle'),
                () => context.push(RoutePaths.themePicker)),
            _tile(context, palette, Icons.workspace_premium_outlined,
                l.t('proHubTitle'), () => context.push('/pro')),
            // MakanMana Fit Coach (V3).
            _tile(context, palette, Icons.monitor_heart_outlined,
                l.t('fitCoachTitle'), () => context.push('/fit/onboarding')),
            _tile(context, palette, Icons.sports_mma, l.t('fitSportMoodTitle'),
                () => context.push('/fit/sport-moods')),
            _tile(context, palette, Icons.insights_outlined,
                l.t('fitMonitorTitle'), () => context.push('/fit/monitor')),
            _tile(context, palette, Icons.watch_outlined, l.t('fitWearable'),
                () => context.push('/fit/wearables')),
            _tile(context, palette, Icons.privacy_tip_outlined,
                l.t('fitHealthPermTitle'),
                () => context.push('/fit/health-permissions')),
            // Profil makanan awam + Feed (V4 Social).
            _tile(context, palette, Icons.badge_outlined, l.t('myFoodProfile'),
                () {
              final uid =
                  ref.read(authRepositoryProvider).currentUser?.uid ?? '';
              if (uid.isNotEmpty) context.push('/u/$uid');
            }),
            _tile(context, palette, Icons.dynamic_feed_outlined, l.t('feedTitle'),
                () => context.push('/social')),
            // Meal Wallet + Tong-Tong (V4).
            _tile(context, palette, Icons.account_balance_wallet_outlined,
                l.t('mealWalletTitle'), () => context.push('/meal-wallet')),
            _tile(context, palette, Icons.groups_outlined, l.t('tongTongTitle'),
                () => context.push('/tong-tong')),
            _tile(context, palette, Icons.history_toggle_off_outlined,
                l.t('myActivityTitle'),
                () => context.push('/profile/activity')),
            // Merchant & Business Foundation — authenticated, review-gated flow.
            _tile(context, palette, Icons.storefront_outlined,
                _merchantCenterLabel(context),
                () => context.push(RoutePaths.merchantCenter)),
            _tile(context, palette, Icons.card_membership, l.t('planLabel'),
                () => context.push(RoutePaths.paywall)),
            _tile(context, palette, Icons.lock_outline, l.t('privacyLabel'),
                () => context.push(RoutePaths.privacy)),
            _tile(context, palette, Icons.settings_outlined,
                l.t('settingsLabel'), () => context.push(RoutePaths.settings)),
            _tile(context, palette, Icons.help_outline, l.t('helpLabel'),
                () => context.push('/help')),
            // PART 1 Phase 1.11: sejarah laporan (flag OFF = tiada tile).
            if (PlaceCorrectionFlags.placeCorrectionEnabled)
              _tile(context, palette, Icons.flag_outlined,
                  l.t('reportMySubmissions'),
                  () => context.push(RoutePaths.placeReports)),
            // Semakan Admin - hanya untuk akaun admin.
            if (ref.watch(myUserDocProvider).value?['isAdmin'] == true)
              _tile(context, palette, Icons.verified_user_outlined,
                  l.t('adminTitle'), () => context.push('/admin')),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => _logout(context, ref),
              icon: const Icon(Icons.logout),
              label: Text(l.t('logout')),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tile(BuildContext context, HomePalette palette, IconData icon,
      String label, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        decoration: BoxDecoration(
          color: palette.card,
          borderRadius: BorderRadius.circular(20),
          border: palette.isDark ? Border.all(color: palette.border) : null,
          boxShadow: palette.isDark
              ? null
              : [
                  BoxShadow(
                    color: const Color(0xFF7A3B1E).withValues(alpha: 0.06),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  ),
                ],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              child: Row(
                children: [
                  Container(
                    height: 46,
                    width: 46,
                    decoration: BoxDecoration(
                      color: palette.primary.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(icon, size: 23, color: palette.primary),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      label,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15.5,
                        color: palette.text,
                      ),
                    ),
                  ),
                  Icon(Icons.chevron_right, color: palette.subtext),
                ],
              ),
            ),
          ),
        ),
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

String _merchantCenterLabel(BuildContext context) {
  return switch (Localizations.localeOf(context).languageCode) {
    'en' => 'Register / Claim Business',
    'zh' => '注册 / 认领商家',
    'ta' => 'வணிகத்தை பதிவு / உரிமைகோரு',
    _ => 'Daftar / Claim Kedai',
  };
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

/// Premium expanded identity hero — same underlying data as before, richer
/// composition (larger avatar, name, handle, plan badge, trial line, and an
/// Upgrade CTA that opens the EXISTING paywall route only when the user is not
/// already on paid Pro). No data is fabricated: every line is gated on real,
/// authoritative provider values.
class _HeroCard extends ConsumerWidget {
  const _HeroCard({required this.email});

  final String email;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final doc = ref.watch(myUserDocProvider).value;
    final photoUrl = doc?['photoUrl'] as String?;
    final displayName = (doc?['displayName'] as String?)?.trim() ?? '';
    final username = doc?['username'] as String? ?? '';
    final trial = couponTrialInfo(doc);
    final plan = ref.watch(userPlanProvider).value;
    final isPaidPro = plan == 'pro' && !trial.isTrial;

    final planLabel = trial.isActive
        ? l.t('planProTrial')
        : l.t(_planKey(plan));

    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primaryRed, AppColors.deepSambalRed],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: AppColors.primaryRed.withValues(alpha: 0.28),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Stack(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Avatar lebih besar + cincin lembut. Logik avatar kekal.
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.45),
                      width: 2,
                    ),
                  ),
                  child: MakanAvatar(
                    radius: 38,
                    photoUrl: photoUrl,
                    presetId: doc?['avatarPreset'] as String?,
                    displayName: displayName,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Padding kanan HANYA pada nama/handle supaya tidak
                      // bertindih butang edit; badge/trial/CTA guna lebar penuh.
                      Padding(
                        padding: const EdgeInsets.only(right: 44),
                        child: Text(
                          displayName.isNotEmpty ? displayName : email,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 22,
                            letterSpacing: -0.3,
                          ),
                        ),
                      ),
                      if (username.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 2, right: 44),
                          child: Text(
                            '@$username',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.88),
                              fontSize: 13.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      const SizedBox(height: 12),
                      _PlanBadge(label: planLabel),
                      if (trial.isActive && trial.expiresAt != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 10),
                          child: Text(
                            '${l.t('couponActiveUntil')} '
                            '${formatTrialDate(trial.expiresAt!)}',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Colors.white.withValues(alpha: 0.92),
                            ),
                          ),
                        ),
                      if (!isPaidPro)
                        Padding(
                          padding: const EdgeInsets.only(top: 14),
                          child: InkWell(
                            onTap: () => context.push(RoutePaths.paywall),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Flexible(
                                  child: Text(
                                    l.t('upgradeNow'),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    softWrap: false,
                                    style: const TextStyle(
                                      color: AppColors.warmYellow,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w800,
                                      decoration: TextDecoration.underline,
                                      decorationColor: AppColors.warmYellow,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 4),
                                const Icon(Icons.chevron_right,
                                    size: 18, color: AppColors.warmYellow),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          // Butang edit bulat, sudut kanan atas — callback & route kekal.
          Positioned(
            top: 12,
            right: 12,
            child: Material(
              color: Colors.white.withValues(alpha: 0.18),
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: () => context.push('/edit-profile'),
                child: Padding(
                  padding: const EdgeInsets.all(9),
                  child: Tooltip(
                    message: l.t('editProfileTitle'),
                    child: const Icon(Icons.edit,
                        color: Colors.white, size: 20),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Premium plan pill — crown + real plan label on the brand yellow surface.
class _PlanBadge extends StatelessWidget {
  const _PlanBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.warmYellow,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.workspace_premium,
              size: 15, color: AppColors.darkText),
          const SizedBox(width: 5),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: AppColors.darkText,
            ),
          ),
        ],
      ),
    );
  }
}
