import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../groups/group_providers.dart';
import '../../core/providers.dart';
import '../../core/services/google_auth_service.dart';
import '../../core/widgets/primary_cta_button.dart';
import 'auth_bootstrap.dart';
import 'auth_error_messages.dart';

/// SP10.1B: Firebase Console SIAP dikonfigurasi (provider Google+Phone
/// aktif, SHA-1/256 didaftar, Play Integrity on, google-services.json
/// baharu dengan oauth_client lengkap diganti). Flag ini kekal sebagai
/// suis jujur — flip ke false jika config console ditarik balik.
const bool kGoogleSignInConfigured = true;
const bool kPhoneAuthConfigured = true;

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  // Milik State (BUKAN lokal) — dispose selepas await sheet menyebabkan
  // crash '_dependents.isEmpty' kerana animasi tutup masih render field.
  final _resetEmailController = TextEditingController();
  bool _loading = false;
  // SP10.1B: loading berasingan untuk Google Sign-In.
  bool _googleLoading = false;
  // SP10.3: toggle papar/sorok password.
  bool _showPassword = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _resetEmailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l = AppLocalizations.of(context);
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    // Login: wajib diisi sahaja (akaun lama mungkin password pendek —
    // panjang minimum dikuatkuasa masa DAFTAR, bukan masa login).
    if (email.isEmpty || password.isEmpty) {
      _showError(l.t('authError'));
      return;
    }

    setState(() => _loading = true);
    try {
      // SP10.3: skrin ini LOGIN sahaja — daftar di /register.
      final UserCredential cred =
          await ref.read(authRepositoryProvider).signIn(email, password);

      final user = cred.user;
      if (user != null) {
        // SP10.1B: bootstrap kongsi semua provider — akaun pulang
        // TIDAK ditimpa (null dibuang), tiada medan protected.
        await bootstrapSignedInUser(ref, user);
      }
      _routeNext();
    } on FirebaseAuthException catch (e) {
      // SP7.2: mesej mesra ikut kod ralat — bukan mesej mentah Firebase.
      _showError(l.t(authErrorKey(e.code)));
    } catch (_) {
      _showError(l.t('authError'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// SP10.1B: Google Sign-In sebenar. Ralat mesra sahaja — batal,
  /// rangkaian, config, akaun wujud dengan kaedah lain.
  Future<void> _googleSignIn() async {
    final l = AppLocalizations.of(context);
    setState(() => _googleLoading = true);
    try {
      final cred = await GoogleAuthService.signInWithGoogle();
      final user = cred.user;
      if (user != null) {
        // Bootstrap kongsi: akaun baharu dapat nama/gambar Google;
        // akaun pulang TIDAK ditimpa; tiada medan protected.
        await bootstrapSignedInUser(ref, user);
      }
      _routeNext();
    } on GoogleSignInException catch (e) {
      _showError(l.t(googleErrorKey(e.code.name)));
    } on FirebaseAuthException catch (e) {
      _showError(l.t(authErrorKey(e.code)));
    } catch (_) {
      _showError(l.t('authError'));
    } finally {
      if (mounted) setState(() => _googleLoading = false);
    }
  }

  Future<void> _devContinue() async {
    await ref.read(appPrefsProvider).setDevLoggedIn(true);
    _routeNext();
  }

  void _routeNext() {
    if (!mounted) return;
    final prefs = ref.read(appPrefsProvider);
    // HOTFIX 4.6A: sambung jemputan tertunda selepas auth (tiada auto-join).
    context.go(postAuthRoute(ref, onboardingDone: prefs.onboardingDone));
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  /// SP10: Lupa password — sheet emel + sendPasswordResetEmail.
  /// PRIVASI: mesej berjaya neutral (tak dedah kewujudan akaun).
  Future<void> _forgotPassword() async {
    final l = AppLocalizations.of(context);
    _resetEmailController.text = _emailController.text.trim();
    final emailCtrl = _resetEmailController;
    var sending = false;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20,
              MediaQuery.of(sheetContext).viewInsets.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l.t('forgotPasswordTitle'),
                style: const TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Text(
                l.t('forgotPasswordBody'),
                style: TextStyle(
                    fontSize: 13, color: sheetContext.tMuted, height: 1.35),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: emailCtrl,
                keyboardType: TextInputType.emailAddress,
                autofocus: true,
                decoration: InputDecoration(hintText: l.t('email')),
              ),
              const SizedBox(height: 14),
              PrimaryCtaButton(
                label: l.t('sendResetLink'),
                loading: sending,
                onPressed: sending
                    ? null
                    : () async {
                        final email = emailCtrl.text.trim();
                        if (email.isEmpty || !email.contains('@')) {
                          ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                  content:
                                      Text(l.t('authErrInvalidEmail'))));
                          return;
                        }
                        setSheetState(() => sending = true);
                        String messageKey;
                        try {
                          await ref
                              .read(authRepositoryProvider)
                              .sendPasswordReset(email);
                          messageKey = resetPasswordMessageKey(null);
                        } on FirebaseAuthException catch (e) {
                          messageKey = resetPasswordMessageKey(e.code);
                        } catch (_) {
                          messageKey = 'authErrNetwork';
                        }
                        if (sheetContext.mounted) {
                          Navigator.pop(sheetContext);
                        }
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(l.t(messageKey))));
                        }
                      },
              ),
            ],
          ),
        ),
      ),
    );
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
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      // SP10: theme-aware — kekal boleh dibaca mod gelap.
                      color: context.tText,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                l.t('tagline'),
                style: TextStyle(
                  fontSize: 16,
                  color: context.tMuted,
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
                      Expanded(
                          child: Text(l.t('devMode'),
                              style: const TextStyle(
                                  color: AppColors.darkText))),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],
              // SP10.3: kad borang login — kemas macam app sebenar.
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: context.mm.card,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: context.mm.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      enabled: firebaseReady,
                      decoration: InputDecoration(hintText: l.t('email')),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _passwordController,
                      obscureText: !_showPassword,
                      enabled: firebaseReady,
                      decoration: InputDecoration(
                        hintText: l.t('password'),
                        suffixIcon: IconButton(
                          tooltip: _showPassword
                              ? l.t('hidePassword')
                              : l.t('showPassword'),
                          icon: Icon(
                            _showPassword
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                            size: 21,
                            color: context.mm.iconMuted,
                          ),
                          onPressed: () => setState(
                              () => _showPassword = !_showPassword),
                        ),
                      ),
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed:
                            firebaseReady ? _forgotPassword : null,
                        child: Text(
                          l.t('forgotPassword'),
                          style: const TextStyle(fontSize: 13.5),
                        ),
                      ),
                    ),
                    const SizedBox(height: 2),
                    PrimaryCtaButton(
                      label: l.t('signIn'),
                      loading: _loading,
                      onPressed:
                          firebaseReady && !_loading ? _submit : null,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              // CTA daftar — skrin daftar penuh (/register).
              Center(
                child: TextButton(
                  onPressed: firebaseReady
                      ? () => context.push('/register')
                      : null,
                  child: Text(
                    l.t('noAccount'),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              // Divider "atau" sebelum kaedah lain (belum aktif).
              Row(
                children: [
                  Expanded(child: Divider(color: context.mm.border)),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      l.t('orDivider'),
                      style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: context.mm.onCardMuted),
                    ),
                  ),
                  Expanded(child: Divider(color: context.mm.border)),
                ],
              ),
              const SizedBox(height: 12),
              // SP10.1B: Google Sign-In SEBENAR (console siap: provider
              // aktif + SHA didaftar + google-services.json baharu).
              // Jika flag ditarik balik, butang jadi jujur-dinyahaktif.
              Opacity(
                opacity: kGoogleSignInConfigured ? 1 : 0.55,
                child: OutlinedButton.icon(
                  onPressed: kGoogleSignInConfigured
                      ? (firebaseReady && !_loading && !_googleLoading
                          ? _googleSignIn
                          : null)
                      : () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                                content: Text(l.t('googleNotActive'))),
                          );
                        },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: kGoogleSignInConfigured
                        ? context.tText
                        : context.tMuted,
                    side: BorderSide(color: context.tBorder),
                  ),
                  icon: _googleLoading
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child:
                              CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('G',
                          style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 18)),
                  label: Text(kGoogleSignInConfigured
                      ? l.t('signInGoogle')
                      : '${l.t('signInGoogle')} · ${l.t('notActiveYet')}'),
                ),
              ),
              const SizedBox(height: 8),
              // SP10.1B: log masuk nombor telefon SEBENAR — buka skrin
              // OTP (/phone-login). Fallback jujur jika flag false.
              Opacity(
                opacity: kPhoneAuthConfigured ? 1 : 0.55,
                child: OutlinedButton.icon(
                  onPressed: kPhoneAuthConfigured
                      ? (firebaseReady && !_loading && !_googleLoading
                          ? () => context.push('/phone-login')
                          : null)
                      : () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                                content: Text(l.t('phoneNotActive'))),
                          );
                        },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: kPhoneAuthConfigured
                        ? context.tText
                        : context.tMuted,
                    side: BorderSide(color: context.tBorder),
                  ),
                  icon: const Icon(Icons.phone_android, size: 20),
                  label: Text(kPhoneAuthConfigured
                      ? l.t('signInPhone')
                      : '${l.t('signInPhone')} · ${l.t('notActiveYet')}'),
                ),
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
