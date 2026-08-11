import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/constants/app_colors.dart';
import '../core/constants/app_constants.dart';
import '../core/providers.dart';
import '../core/providers/makanmana_user_context_provider.dart';
import '../features/dev_qa/canonical_qa_harness.dart';
import 'localization/app_localizations.dart';
import 'router.dart';
import 'theme.dart';

class MakanManaApp extends ConsumerWidget {
  const MakanManaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // PHASE 1.13A: harnes QA canonical — DEBUG + dart-define sahaja. Binaan
    // keluaran & binaan debug biasa (tanpa define) TIDAK terjejas; lalai
    // produksi kekal legasi & selamat.
    if (kCanonicalQaEnabled) {
      return const CanonicalQaApp();
    }
    // SP7.2: bila akaun bertukar (log masuk/keluar), kosongkan state
    // berskop pengguna yang TIDAK berbentuk strim (StateNotifier/State).
    // Provider strim di-reset automatik melalui authRepositoryProvider.
    // Config global (bahasa/tema/l10n) TIDAK disentuh.
    ref.listen<String>(currentUidProvider, (prev, next) {
      if (prev == next) return;
      final userCtx = ref.read(makanManaUserContextProvider.notifier);
      userCtx.clear();
      if (next.isNotEmpty) userCtx.loadForUser(next);
      ref.invalidate(currentSuggestionProvider);
      ref.invalidate(suggestionActionControllerProvider);
      // PROMPT 12: luputkan Pro Trial kupon yang tamat (server-side,
      // fire-and-forget). Sandaran kepada scheduled expireCouponTrials.
      if (next.isNotEmpty) {
        ref.read(couponServiceProvider).refreshPlanStatus();
      }
    });

    final locale = ref.watch(languageProvider);
    final router = ref.watch(routerProvider);
    // SP10: Appearance — System/Light/Dark, persist & apply serta-merta.
    final themeMode = ref.watch(appearanceProvider);

    return MaterialApp.router(
      title: AppConstants.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // THREADS REDESIGN: route the Threads (AppColors.threadsX) colour system
      // through the resolved app theme so Threads renders proper Bright OR Dark
      // Mode (previously hardcoded dark). Central — no per-widget brightness
      // scatter; updates live on theme switch (full rebuild re-runs this).
      builder: (context, child) {
        AppColors.threadsDark =
            Theme.of(context).brightness == Brightness.dark;
        return child ?? const SizedBox.shrink();
      },
      routerConfig: router,
    );
  }
}
