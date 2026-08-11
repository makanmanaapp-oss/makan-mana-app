import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';

class LanguageScreen extends ConsumerWidget {
  const LanguageScreen({super.key});

  static const _languages = [
    ('ms', 'Bahasa Melayu', '🇲🇾'),
    ('en', 'English', '🇬🇧'),
    ('zh', '中文', '🀄'),
    ('ta', 'தமிழ்', '🪔'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final current = ref.watch(languageProvider).languageCode;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 24),
              const Icon(Icons.language,
              size: 48, color: AppColors.primaryRed),
              const SizedBox(height: 16),
              Text(
                l.t('chooseLanguage'),
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: context.mm.onCard,
                ),
              ),
              const SizedBox(height: 32),
              ..._languages.map((lang) {
                final selected = current == lang.$1;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(20),
                    onTap: () async {
                      await ref
                          .read(languageProvider.notifier)
                          .setLanguage(lang.$1);
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: selected
                            ? AppColors.softYellow
                            : context.mm.card,
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
                          Text(lang.$3, style: const TextStyle(fontSize: 28)),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Text(
                              lang.$2,
                              // Kad kuning (dipilih) = teks gelap;
                              // kad token = onCard.
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                                color: selected
                                    ? AppColors.darkText
                                    : context.mm.onCard,
                              ),
                            ),
                          ),
                          if (selected)
                            const Icon(Icons.check_circle,
                                color: AppColors.primaryRed),
                        ],
                      ),
                    ),
                  ),
                );
              }),
              const Spacer(),
              ElevatedButton(
                onPressed: () async {
                  // Pastikan pilihan (atau default ms) disimpan sebelum teruskan.
                  await ref.read(languageProvider.notifier).setLanguage(current);
                  if (context.mounted) context.go(RoutePaths.login);
                },
                child: Text(l.t('continueLabel')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
