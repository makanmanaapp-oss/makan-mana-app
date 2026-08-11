import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../groups/group_providers.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../../core/widgets/primary_cta_button.dart';
import 'auth_bootstrap.dart';
import 'auth_error_messages.dart';
import 'register_validation.dart';

/// SP10.3: skrin Daftar berasingan — borang kemas, validasi mesra,
/// bootstrap users/{uid} + cermin nama ke profil awam melalui pelayan.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _showPassword = false;
  bool _termsAccepted = false;
  bool _loading = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _register() async {
    final l = AppLocalizations.of(context);
    final errKey = validateRegister(
      displayName: _nameCtrl.text,
      email: _emailCtrl.text,
      password: _passwordCtrl.text,
      confirmPassword: _confirmCtrl.text,
      termsAccepted: _termsAccepted,
    );
    if (errKey != null) {
      _showMessage(l.t(errKey));
      return;
    }
    setState(() => _loading = true);
    final displayName = _nameCtrl.text.trim();
    final email = _emailCtrl.text.trim();
    try {
      final cred = await ref
          .read(authRepositoryProvider)
          .signUp(email, _passwordCtrl.text);
      final user = cred.user;
      if (user != null) {
        // SP10.1B: bootstrap KONGSI semua provider — users/{uid} tanpa
        // medan protected/null + cermin nama ke public_profiles via
        // pelayan (fire-and-forget dalam helper).
        await bootstrapSignedInUser(ref, user,
            displayNameOverride: displayName);
      }
      if (!mounted) return;
      _showMessage(l.t('registerSuccess'));
      final prefs = ref.read(appPrefsProvider);
      // HOTFIX 4.6A: sambung jemputan tertunda selepas auth (tiada auto-join).
      context.go(postAuthRoute(ref, onboardingDone: prefs.onboardingDone));
    } on FirebaseAuthException catch (e) {
      _showMessage(l.t(authErrorKey(e.code)));
    } catch (_) {
      _showMessage(l.t('registerFailed'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  InputDecoration _deco(String hint, {Widget? suffixIcon}) =>
      InputDecoration(hintText: hint, suffixIcon: suffixIcon);

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final mm = context.mm;
    final strength = passwordStrength(_passwordCtrl.text);
    final strengthColor = switch (strength) {
      PasswordStrength.weak => AppColors.warningOrange,
      PasswordStrength.medium => AppColors.warmYellow,
      PasswordStrength.strong => AppColors.healthyGreen,
    };

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 4, 24, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: Image.asset(
                      'assets/icon/app_icon.png',
                      height: 44,
                      width: 44,
                      fit: BoxFit.cover,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      l.t('registerTitle'),
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        color: mm.onCard,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                l.t('registerSubtitle'),
                style: TextStyle(
                    fontSize: 13.5, color: mm.onCardMuted, height: 1.4),
              ),
              const SizedBox(height: 22),
              // Kad borang — bersih, jarak selesa (bukan borang padat).
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: mm.card,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: mm.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextField(
                      controller: _nameCtrl,
                      textCapitalization: TextCapitalization.words,
                      maxLength: 40,
                      decoration: _deco(l.t('displayNameLabel'))
                          .copyWith(counterText: ''),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _emailCtrl,
                      keyboardType: TextInputType.emailAddress,
                      decoration: _deco(l.t('email')),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _passwordCtrl,
                      obscureText: !_showPassword,
                      onChanged: (v) => setState(() {}),
                      decoration: _deco(
                        l.t('password'),
                        suffixIcon: IconButton(
                          tooltip: _showPassword
                              ? l.t('hidePassword')
                              : l.t('showPassword'),
                          icon: Icon(
                            _showPassword
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                            size: 21,
                            color: mm.iconMuted,
                          ),
                          onPressed: () => setState(
                              () => _showPassword = !_showPassword),
                        ),
                      ),
                    ),
                    if (_passwordCtrl.text.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: LinearProgressIndicator(
                                value: switch (strength) {
                                  PasswordStrength.weak => 0.33,
                                  PasswordStrength.medium => 0.66,
                                  PasswordStrength.strong => 1.0,
                                },
                                minHeight: 5,
                                backgroundColor:
                                    mm.border.withValues(alpha: 0.6),
                                valueColor:
                                    AlwaysStoppedAnimation(strengthColor),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            l.t(passwordStrengthKey(strength)),
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: strengthColor,
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 12),
                    TextField(
                      controller: _confirmCtrl,
                      obscureText: !_showPassword,
                      decoration: _deco(l.t('confirmPasswordLabel')),
                    ),
                    const SizedBox(height: 8),
                    // Terma & Privasi — wajib ditanda.
                    CheckboxListTile(
                      value: _termsAccepted,
                      onChanged: _loading
                          ? null
                          : (v) =>
                              setState(() => _termsAccepted = v ?? false),
                      controlAffinity: ListTileControlAffinity.leading,
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      activeColor: AppColors.primaryRed,
                      title: Text(
                        l.t('termsAgreeLabel'),
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: mm.onCard),
                      ),
                      // PROMPT 11: link Terma SEBENAR (halaman in-app),
                      // bukan lagi "akan disediakan".
                      subtitle: GestureDetector(
                        onTap: () => context.push('/terms'),
                        child: Text(
                          l.t('termsReadLink'),
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.primaryRed,
                            fontWeight: FontWeight.w700,
                            decoration: TextDecoration.underline,
                            decorationColor: AppColors.primaryRed,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    PrimaryCtaButton(
                      label: l.t('createAccount'),
                      loading: _loading,
                      onPressed: _loading ? null : _register,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Center(
                child: TextButton(
                  onPressed:
                      _loading ? null : () => context.go(RoutePaths.login),
                  child: Text(l.t('haveAccount')),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
