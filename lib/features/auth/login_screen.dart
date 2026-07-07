import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../../core/widgets/primary_cta_button.dart';
import '../../models/app_user.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isSignUp = false;
  bool _loading = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l = AppLocalizations.of(context);
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty || password.length < 6) {
      _showError(l.t('authError'));
      return;
    }

    setState(() => _loading = true);
    try {
      final auth = ref.read(authRepositoryProvider);
      final UserCredential cred = _isSignUp
          ? await auth.signUp(email, password)
          : await auth.signIn(email, password);

      final uid = cred.user?.uid;
      if (uid != null) {
        // Tulis users/{uid} ke Firestore.
        await ref.read(userRepositoryProvider).upsertUser(
              AppUser(
                uid: uid,
                email: email,
                language: ref.read(languageProvider).languageCode,
              ),
            );
      }
      _routeNext();
    } on FirebaseAuthException catch (e) {
      _showError(e.message ?? l.t('authError'));
    } catch (_) {
      _showError(l.t('authError'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _devContinue() async {
    await ref.read(appPrefsProvider).setDevLoggedIn(true);
    _routeNext();
  }

  void _routeNext() {
    if (!mounted) return;
    final prefs = ref.read(appPrefsProvider);
    context.go(
      prefs.onboardingDone ? RoutePaths.home : RoutePaths.onboarding,
    );
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final firebaseReady = ref.watch(firebaseReadyProvider);

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 32),
              Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: Image.asset(
                      'assets/icon/app_icon.png',
                      height: 56,
                      width: 56,
                      fit: BoxFit.cover,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Text(
                    l.t('appName'),
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      color: AppColors.darkText,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                l.t('tagline'),
                style: const TextStyle(
                  fontSize: 16,
                  color: AppColors.mutedText,
                ),
              ),
              const SizedBox(height: 36),
              if (!firebaseReady) ...[
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.softYellow,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.info_outline,
                          color: AppColors.warningOrange),
                      const SizedBox(width: 10),
                      Expanded(child: Text(l.t('devMode'))),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],
              TextField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                enabled: firebaseReady,
                decoration: InputDecoration(hintText: l.t('email')),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _passwordController,
                obscureText: true,
                enabled: firebaseReady,
                decoration: InputDecoration(hintText: l.t('password')),
              ),
              const SizedBox(height: 20),
              PrimaryCtaButton(
                label: _isSignUp ? l.t('createAccount') : l.t('signIn'),
                loading: _loading,
                onPressed: firebaseReady ? _submit : null,
              ),
              const SizedBox(height: 10),
              Center(
                child: TextButton(
                  onPressed: firebaseReady
                      ? () => setState(() => _isSignUp = !_isSignUp)
                      : null,
                  child: Text(
                    _isSignUp ? l.t('haveAccount') : l.t('noAccount'),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () {
                  // Placeholder: Google Sign-In dikonfigurasi selepas build stabil pertama.
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(l.t('comingSoon'))),
                  );
                },
                icon: const Text('G',
                    style: TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 18)),
                label: Text(l.t('signInGoogle')),
              ),
              if (!firebaseReady) ...[
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _devContinue,
                  icon: const Icon(Icons.build_circle_outlined),
                  label: Text(l.t('devContinue')),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
