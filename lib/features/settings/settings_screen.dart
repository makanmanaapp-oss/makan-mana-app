import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../paywall/coupon_status.dart';
import '../social/social_providers.dart' show myUserDocProvider;

/// SP10: Tetapan — Akaun, Penampilan (System/Light/Dark), Bahasa, Pelan.
/// Bukan redesign besar; cukup untuk semua benda penting mudah dijumpai.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final language = ref.watch(languageProvider).languageCode;
    final firebaseReady = ref.watch(firebaseReadyProvider);
    final themeMode = ref.watch(appearanceProvider);
    final user = ref.watch(authRepositoryProvider).currentUser;
    final plan = ref.watch(userPlanProvider).value ?? 'free';

    ShapeBorder tileShape() => RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: context.tBorder),
        );

    Widget sectionLabel(String text) => Padding(
          padding: const EdgeInsets.only(bottom: 8, top: 18),
          child: Text(
            text,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: context.tMuted,
            ),
          ),
        );

    return Scaffold(
      appBar: AppBar(title: Text(l.t('settingsLabel'))),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ---------- Akaun ----------
          sectionLabel(l.t('accountSection')),
          ListTile(
            tileColor: context.tCard,
            shape: tileShape(),
            leading: const Icon(Icons.person_outline,
                color: AppColors.primaryRed),
            // 10.1B-PHONE-CLOSE: akaun telefon tiada email — papar
            // nombor; provider dipapar ikut providerData SEBENAR.
            title: Text(
                (user?.email?.isNotEmpty ?? false)
                    ? user!.email!
                    : (user?.phoneNumber?.isNotEmpty ?? false)
                        ? user!.phoneNumber!
                        : l.t('devMode'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
            subtitle: Text(
              switch (user?.providerData
                      .map((p) => p.providerId)
                      .toList() ??
                  const <String>[]) {
                final p when p.contains('google.com') => 'Google',
                final p when p.contains('phone') =>
                  l.t('phoneNumberHint'),
                _ => l.t('providerEmailPassword'),
              },
              style: const TextStyle(fontSize: 12),
            ),
          ),

          // ---------- Penampilan ----------
          sectionLabel(l.t('appearanceLabel')),
          Container(
            decoration: BoxDecoration(
              color: context.tCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.tBorder),
            ),
            child: Column(
              children: [
                for (final (mode, prefValue, key, icon) in [
                  (ThemeMode.system, 'system', 'appearanceSystem',
                      Icons.brightness_auto_outlined),
                  (ThemeMode.light, 'light', 'appearanceLight',
                      Icons.light_mode_outlined),
                  (ThemeMode.dark, 'dark', 'appearanceDark',
                      Icons.dark_mode_outlined),
                ])
                  ListTile(
                    onTap: () => ref
                        .read(appearanceProvider.notifier)
                        .setAppearance(prefValue),
                    leading: Icon(icon, size: 20, color: context.tMuted),
                    title: Text(l.t(key),
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    trailing: themeMode == mode
                        ? const Icon(Icons.check_circle,
                            color: AppColors.primaryRed, size: 22)
                        : Icon(Icons.circle_outlined,
                            color: context.tBorder, size: 22),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          ListTile(
            tileColor: context.tCard,
            shape: tileShape(),
            leading: const Icon(Icons.palette_outlined,
                color: AppColors.primaryRed),
            title: Text(l.t('appStyle')),
            trailing: const Icon(Icons.chevron_right, size: 20),
            onTap: () => context.push(RoutePaths.themePicker),
          ),

          // ---------- Bahasa & Pelan ----------
          sectionLabel(l.t('languageLabel')),
          ListTile(
            tileColor: context.tCard,
            shape: tileShape(),
            leading: Icon(Icons.language, color: context.mm.iconMuted),
            title: Text(l.t('languageLabel')),
            trailing: Text(
              language.toUpperCase(),
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                color: AppColors.primaryRed,
              ),
            ),
            onTap: () => context.push(RoutePaths.language),
          ),
          sectionLabel(l.t('planLabel')),
          Builder(builder: (context) {
            final trial =
                couponTrialInfo(ref.watch(myUserDocProvider).value);
            final planTitle = trial.isActive
                ? l.t('planProTrial')
                : l.t(switch (plan) {
                    'plus' => 'planPlus',
                    'pro' => 'planPro',
                    _ => 'planFree',
                  });
            return ListTile(
              tileColor: context.tCard,
              shape: tileShape(),
              leading: const Icon(Icons.card_membership,
                  color: AppColors.primaryRed),
              title: Text(planTitle),
              subtitle: trial.isActive && trial.expiresAt != null
                  ? Text(
                      '${l.t('couponActiveUntil')} '
                      '${formatTrialDate(trial.expiresAt!)}',
                      style: const TextStyle(fontSize: 12),
                    )
                  : null,
              trailing: Text(
                l.t('upgradeAction'),
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  color: AppColors.primaryRed,
                ),
              ),
              onTap: () => context.push(RoutePaths.paywall),
            );
          }),
          const SizedBox(height: 8),
          // PROMPT 12: masukkan kod kupon → Pro Trial.
          ListTile(
            tileColor: context.tCard,
            shape: tileShape(),
            leading: const Icon(Icons.confirmation_number_outlined,
                color: AppColors.primaryRed),
            title: Text(l.t('couponEntrySettings')),
            trailing: const Icon(Icons.chevron_right, size: 20),
            onTap: firebaseReady ? () => context.push('/coupon') : null,
          ),

          // ---------- PROMPT 11: Perundangan & Sokongan ----------
          sectionLabel(l.t('legalSection')),
          for (final (labelKey, icon, route) in [
            ('privacyLabel', Icons.privacy_tip_outlined, '/privacy'),
            ('termsLabel', Icons.description_outlined, '/terms'),
            ('guidelinesLabel', Icons.groups_outlined, '/guidelines'),
            ('supportLabel', Icons.support_agent_outlined, '/support'),
          ]) ...[
            ListTile(
              tileColor: context.tCard,
              shape: tileShape(),
              leading: Icon(icon, color: AppColors.primaryRed),
              title: Text(l.t(labelKey)),
              trailing: const Icon(Icons.chevron_right, size: 20),
              onTap: () => context.push(route),
            ),
            const SizedBox(height: 8),
          ],
          // Padam Akaun — hantar permintaan (deletion_requests).
          ListTile(
            tileColor: context.tCard,
            shape: tileShape(),
            leading: const Icon(Icons.delete_outline,
                color: AppColors.primaryRed),
            title: Text(l.t('deleteAccountLabel')),
            trailing: const Icon(Icons.chevron_right, size: 20),
            onTap: firebaseReady && user != null
                ? () => _requestDeletion(context, ref, user.uid)
                : null,
          ),

          const SizedBox(height: 18),
          ListTile(
            tileColor: context.tCard,
            shape: tileShape(),
            leading: Icon(Icons.cloud_outlined, color: context.mm.iconMuted),
            title: const Text('Firebase'),
            trailing: Text(
              firebaseReady ? 'OK' : 'DEV',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                color: firebaseReady
                    ? AppColors.openGreen
                    : AppColors.warningOrange,
              ),
            ),
          ),
          const SizedBox(height: 10),
          const ListTile(
            leading: Icon(Icons.info_outline),
            title: Text('MakanMana v0.1.0'),
          ),
        ],
      ),
    );
  }

  /// PROMPT 11: permintaan pemadaman akaun (beta-safe) — tulis
  /// deletion_requests/{auto}, kemudian log keluar. TIADA hard delete
  /// data sosial/grup dari client (diproses selamat oleh pasukan).
  Future<void> _requestDeletion(
      BuildContext context, WidgetRef ref, String uid) async {
    final l = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l.t('deleteAccountLabel')),
        content: Text(l.t('deleteAccountBody')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(l.t('cancelAction')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(
              l.t('deleteAccountConfirm'),
              style: const TextStyle(color: AppColors.primaryRed),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final user = ref.read(authRepositoryProvider).currentUser;
    try {
      await FirebaseFirestore.instance.collection('deletion_requests').add({
        'uid': uid,
        'email': user?.email ?? '',
        'phoneNumber': user?.phoneNumber ?? '',
        'displayName': user?.displayName ?? '',
        'requestedAt': FieldValue.serverTimestamp(),
        'status': 'pending',
        'source': 'app',
        'notes': '',
      }).timeout(const Duration(seconds: 10));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('deleteRequestSent'))),
        );
      }
      // Front Page Redesign 1 — putuskan token push akaun sebelum sign-out.
      await ref
          .read(notificationServiceProvider)
          .detach(ref.read(currentUidProvider));
      await ref.read(authRepositoryProvider).signOut();
      if (context.mounted) context.go(RoutePaths.login);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('authErrNetwork'))),
        );
      }
    }
  }
}
