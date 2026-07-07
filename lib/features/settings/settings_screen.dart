import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final language = ref.watch(languageProvider).languageCode;
    final firebaseReady = ref.watch(firebaseReadyProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.t('settingsLabel'))),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          ListTile(
            tileColor: AppColors.cardWhite,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(color: AppColors.softBorder),
            ),
            leading: const Text('🌏', style: TextStyle(fontSize: 24)),
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
          const SizedBox(height: 10),
          ListTile(
            tileColor: AppColors.cardWhite,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(color: AppColors.softBorder),
            ),
            leading: const Text('🔥', style: TextStyle(fontSize: 24)),
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
            leading: Text('ℹ️', style: TextStyle(fontSize: 24)),
            title: Text('MakanMana v0.1.0 (Milestone 1)'),
          ),
        ],
      ),
    );
  }
}
