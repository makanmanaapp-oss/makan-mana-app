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

/// QA-DEV23 Profile cleanup (Phase A) — presentation-only refresh into a modern
/// account hub: larger identity hero, a clean (non-underlined) upgrade CTA, and
/// FLAT grouped menu sections with hairline separators instead of ~22 repeated
/// oversized floating cards.
///
/// Every provider, callback and route destination is preserved exactly:
/// - identity/plan/trial data → [myUserDocProvider], [userPlanProvider],
///   [couponTrialInfo] (unchanged) — no private Fit data is ever shown here.
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
    // AUTHORITY LOKASI (QA-DEV7): padam lokasi tepat berskop-UID sebelum
    // sign-out — koordinat akaun ini tidak boleh kekal untuk akaun seterusnya.
    await ref.read(locationServiceProvider).clearPersistedLocation(uid: uid);
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
    final uid = authUser?.uid ?? '';
    final isAdmin = ref.watch(myUserDocProvider).value?['isAdmin'] == true;

    // Destinations grouped into flat sections — SAME icons/labels/routes as
    // before, just reorganised for a cleaner, less card-heavy hub.
    final food = <_MenuItem>[
      _MenuItem(Icons.ramen_dining_outlined, l.t('profileMakanan'),
          () => context.push(RoutePaths.profileMakanan)),
      _MenuItem(Icons.restaurant_menu, l.t('tasteProfile'),
          () => context.push('/taste')),
      _MenuItem(Icons.psychology_outlined, l.t('foodMemory'),
          () => context.push('/food-memory')),
      _MenuItem(Icons.favorite_outline, l.t('favoritesTitle'),
          () => context.push('/favorites')),
      _MenuItem(Icons.tune, l.t('dietBudget'),
          () => context.push(RoutePaths.onboarding)),
    ];
    final fit = <_MenuItem>[
      _MenuItem(Icons.monitor_heart_outlined, l.t('fitCoachTitle'),
          () => context.push('/fit/onboarding')),
      _MenuItem(Icons.sports_mma, l.t('fitSportMoodTitle'),
          () => context.push('/fit/sport-moods')),
      _MenuItem(Icons.insights_outlined, l.t('fitMonitorTitle'),
          () => context.push('/fit/monitor')),
      _MenuItem(Icons.watch_outlined, l.t('fitWearable'),
          () => context.push('/fit/wearables')),
      _MenuItem(Icons.privacy_tip_outlined, l.t('fitHealthPermTitle'),
          () => context.push('/fit/health-permissions')),
    ];
    final social = <_MenuItem>[
      _MenuItem(Icons.badge_outlined, l.t('myFoodProfile'), () {
        if (uid.isNotEmpty) context.push('/u/$uid');
      }),
      _MenuItem(Icons.dynamic_feed_outlined, l.t('feedTitle'),
          () => context.push('/social')),
      _MenuItem(Icons.account_balance_wallet_outlined, l.t('mealWalletTitle'),
          () => context.push('/meal-wallet')),
      _MenuItem(Icons.groups_outlined, l.t('tongTongTitle'),
          () => context.push('/tong-tong')),
      _MenuItem(Icons.history_toggle_off_outlined, l.t('myActivityTitle'),
          () => context.push('/profile/activity')),
    ];
    final account = <_MenuItem>[
      _MenuItem(Icons.workspace_premium_outlined, l.t('proHubTitle'),
          () => context.push('/pro')),
      _MenuItem(Icons.card_membership, l.t('planLabel'),
          () => context.push(RoutePaths.paywall)),
      _MenuItem(Icons.language, l.t('languageLabel'),
          () => _showLanguageDialog(context, ref)),
      _MenuItem(Icons.palette_outlined, l.t('appStyle'),
          () => context.push(RoutePaths.themePicker)),
      _MenuItem(Icons.lock_outline, l.t('privacyLabel'),
          () => context.push(RoutePaths.privacy)),
      _MenuItem(Icons.settings_outlined, l.t('settingsLabel'),
          () => context.push(RoutePaths.settings)),
      _MenuItem(Icons.help_outline, l.t('helpLabel'),
          () => context.push('/help')),
      // PART 1 Phase 1.11: sejarah laporan (flag OFF = tiada tile).
      if (PlaceCorrectionFlags.placeCorrectionEnabled)
        _MenuItem(Icons.flag_outlined, l.t('reportMySubmissions'),
            () => context.push(RoutePaths.placeReports)),
      // Semakan Admin - hanya untuk akaun admin.
      if (isAdmin)
        _MenuItem(Icons.verified_user_outlined, l.t('adminTitle'),
            () => context.push('/admin')),
    ];

    return Scaffold(
      backgroundColor: palette.background,
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
          children: [
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
            _section(palette, l.t('profileSectionFood'), food),
            _section(palette, l.t('profileSectionFit'), fit),
            _section(palette, l.t('profileSectionSocial'), social),
            _section(palette, l.t('profileSectionAccount'), account),
            const SizedBox(height: 4),
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

  /// A titled, restrained surface holding flat rows separated by hairlines —
  /// replaces the previous per-item floating cards.
  Widget _section(HomePalette palette, String header, List<_MenuItem> items) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(6, 0, 6, 8),
          child: Text(
            header.toUpperCase(),
            style: TextStyle(
              color: palette.subtext,
              fontSize: 11.5,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: palette.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: palette.border.withValues(alpha: 0.7)),
          ),
          child: Column(
            children: [
              for (var i = 0; i < items.length; i++) ...[
                _flatRow(palette, items[i]),
                if (i != items.length - 1)
                  Divider(
                    height: 1,
                    thickness: 0.6,
                    color: palette.border.withValues(alpha: 0.55),
                    indent: 62,
                  ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 20),
      ],
    );
  }

  Widget _flatRow(HomePalette palette, _MenuItem item) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: item.onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          child: Row(
            children: [
              Container(
                height: 34,
                width: 34,
                decoration: BoxDecoration(
                  color: palette.primary.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(item.icon, size: 19, color: palette.primary),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  item.label,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                    color: palette.text,
                  ),
                ),
              ),
              Icon(Icons.chevron_right, size: 20, color: palette.subtext),
            ],
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

/// A single Profile menu destination (icon + label + existing route callback).
class _MenuItem {
  const _MenuItem(this.icon, this.label, this.onTap);
  final IconData icon;
  final String label;
  final VoidCallback onTap;
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

/// Expanded identity hero — larger avatar, clear name/handle, plan state kept
/// secondary, and a CLEAN pill upgrade CTA (no busy underline). Same underlying
/// authoritative data as before; every line gated on real provider values.
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

    final planLabel =
        trial.isActive ? l.t('planProTrial') : l.t(_planKey(plan));

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
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    // Larger, dominant avatar with a soft white ring.
                    Container(
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.5),
                          width: 2,
                        ),
                      ),
                      child: MakanAvatar(
                        radius: 44,
                        photoUrl: photoUrl,
                        presetId: doc?['avatarPreset'] as String?,
                        displayName: displayName,
                      ),
                    ),
                    const SizedBox(width: 18),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Padding(
                            // reserve space so the name never sits under edit
                            padding: const EdgeInsets.only(right: 40),
                            child: Text(
                              displayName.isNotEmpty ? displayName : email,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                                fontSize: 23,
                                letterSpacing: -0.3,
                              ),
                            ),
                          ),
                          if (username.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 3),
                              child: Text(
                                '@$username',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.9),
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                // Plan state (secondary) + clean upgrade pill — placed on the
                // FULL hero width (below identity) so the CTA is never squeezed
                // next to the avatar; Wrap handles narrow widths/large text.
                Wrap(
                  spacing: 10,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    _PlanBadge(label: planLabel),
                    if (!isPaidPro) _UpgradePill(label: l.t('upgradeNow')),
                  ],
                ),
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
              ],
            ),
          ),
          // Circular edit button, top-right — callback & route unchanged.
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
                    child:
                        const Icon(Icons.edit, color: Colors.white, size: 20),
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

/// Plan pill — crown + real plan label on the brand yellow surface.
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

/// Clean upgrade CTA — a soft translucent pill (NOT an underlined text link),
/// opening the EXISTING paywall route.
class _UpgradePill extends StatelessWidget {
  const _UpgradePill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.16),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push(RoutePaths.paywall),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(width: 3),
              const Icon(Icons.chevron_right, size: 16, color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}
