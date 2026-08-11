import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../../core/providers/makanmana_user_context_provider.dart';

/// Splash Redesign 2B — OPTION B (full red).
///
/// Presentation layer ONLY around the existing startup pipeline. Routing
/// decision (_route) and its timing are unchanged from the previous splash;
/// no new artificial delay is added. The whole screen is MakanMana splash
/// red (#DD1F22) in Bright and Dark; the official logo tile is centered with
/// a thin, indeterminate white loading bar beneath it.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen>
    with SingleTickerProviderStateMixin {
  // Splash red — spec Option B. Deliberately NOT AppColors.primaryRed so the
  // locked global token is untouched by this presentation-only task.
  static const Color _splashRed = Color(0xFFDD1F22);

  late final AnimationController _intro;
  late final Animation<double> _fade;
  late final Animation<double> _scale;

  // Captured in build() so dispose() can restore the pre-splash system-bar
  // chrome without the (unavailable) MediaQuery.
  Brightness _platformBrightness = Brightness.light;

  @override
  void initState() {
    super.initState();

    // Subtle fade-in + 0.97→1.0 scale only. No spin / bounce / rotate.
    _intro = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
    );
    _fade = CurvedAnimation(parent: _intro, curve: Curves.easeOut);
    _scale = Tween<double>(begin: 0.97, end: 1.0)
        .animate(CurvedAnimation(parent: _intro, curve: Curves.easeOutCubic));
    _intro.forward();

    // Existing startup routing — timing UNCHANGED from prior implementation.
    Timer(const Duration(milliseconds: 1600), _route);
  }

  @override
  void dispose() {
    // The splash sets the system nav bar red to blend with its red field. That
    // style is sticky, so restore a neutral chrome as we leave the splash —
    // otherwise the red bar would leak into Home and every later screen. This
    // matches the app's pre-splash default (dark nav bar; icon brightness per
    // platform) and keeps this task scoped to the splash only.
    final dark = _platformBrightness == Brightness.dark;
    SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: dark ? Brightness.light : Brightness.dark,
      statusBarBrightness: dark ? Brightness.dark : Brightness.light,
      systemNavigationBarColor: Colors.black,
      systemNavigationBarIconBrightness: Brightness.light,
    ));
    _intro.dispose();
    super.dispose();
  }

  void _route() {
    if (!mounted) return;
    final prefs = ref.read(appPrefsProvider);
    final auth = ref.read(authRepositoryProvider);
    final firebaseReady = ref.read(firebaseReadyProvider);

    final loggedIn =
        firebaseReady ? auth.currentUser != null : prefs.devLoggedIn;

    // Core Spine: hidrat konteks global awal (fire-and-forget) supaya
    // provider hidup & jambatan mood/bahasa/tema aktif. Tidak menyekat UI.
    final uid = auth.currentUser?.uid ?? '';
    if (loggedIn && uid.isNotEmpty) {
      ref.read(makanManaUserContextProvider.notifier).loadForUser(uid);
    }

    if (prefs.language == null) {
      context.go(RoutePaths.language);
    } else if (!loggedIn) {
      context.go(RoutePaths.login);
    } else if (!prefs.onboardingDone) {
      context.go(RoutePaths.onboarding);
    } else {
      context.go(RoutePaths.home);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Remember device brightness so dispose() can restore matching chrome.
    _platformBrightness = MediaQuery.platformBrightnessOf(context);
    // Light system icons that blend into the red splash across both themes.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
        systemNavigationBarColor: _splashRed,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: _splashRed,
        body: SafeArea(
          child: Stack(
            children: [
              // Logo around the visual center, slightly above the loading bar.
              Align(
                alignment: const Alignment(0, -0.06),
                child: FadeTransition(
                  opacity: _fade,
                  child: ScaleTransition(
                    scale: _scale,
                    child: const _SplashLogo(),
                  ),
                ),
              ),
              // Thin, centered, indeterminate white loading bar beneath logo.
              const Align(
                alignment: Alignment(0, 0.34),
                child: _SplashLoader(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Official approved logo tile (red / white / yellow, location-pin final
/// letter). Uses the bundled production image asset — never a Text
/// reconstruction. Falls back to a plain rounded tile only on asset failure.
class _SplashLogo extends StatelessWidget {
  const _SplashLogo();

  @override
  Widget build(BuildContext context) {
    const double size = 132;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(30),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.22),
            blurRadius: 28,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(30),
        child: Image.asset(
          'assets/icon/app_icon.png',
          height: size,
          width: size,
          fit: BoxFit.contain,
          filterQuality: FilterQuality.high,
          errorBuilder: (_, __, ___) => Container(
            height: size,
            width: size,
            color: const Color(0xFFC4161A),
          ),
        ),
      ),
    );
  }
}

/// Thin, rounded, indeterminate white loading indicator on a translucent
/// white track. Indeterminate on purpose — startup exposes no real % so no
/// fake progress is shown. ~1s cycle.
class _SplashLoader extends StatelessWidget {
  const _SplashLoader();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 96,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: const LinearProgressIndicator(
          minHeight: 3,
          backgroundColor: Color(0x33FFFFFF),
          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
        ),
      ),
    );
  }
}
