import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../groups/group_providers.dart';
import '../../core/providers.dart';
import '../../core/widgets/primary_cta_button.dart';
import 'auth_bootstrap.dart';
import 'auth_error_messages.dart';
import 'phone_validation.dart';

/// SP10.1B: log masuk / daftar dengan nombor telefon (OTP sebenar).
/// Langkah 1: masukkan nombor (+60 lalai) -> Hantar OTP.
/// Langkah 2: masukkan kod OTP -> Sahkan (+ Hantar semula).
class PhoneLoginScreen extends ConsumerStatefulWidget {
  const PhoneLoginScreen({super.key});

  @override
  ConsumerState<PhoneLoginScreen> createState() =>
      _PhoneLoginScreenState();
}

class _PhoneLoginScreenState extends ConsumerState<PhoneLoginScreen> {
  final _phoneCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  String? _verificationId;
  int? _resendToken;
  bool _sending = false;
  bool _verifying = false;

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _sendOtp({bool resend = false}) async {
    final l = AppLocalizations.of(context);
    final phone = normalizePhoneNumber(_phoneCtrl.text);
    if (phone == null) {
      _showMessage(l.t('authErrPhoneInvalid'));
      return;
    }
    setState(() => _sending = true);
    await FirebaseAuth.instance.verifyPhoneNumber(
      phoneNumber: phone,
      timeout: const Duration(seconds: 60),
      forceResendingToken: resend ? _resendToken : null,
      // Android boleh auto-sahkan (termasuk nombor test Firebase).
      verificationCompleted: (credential) => _signInWith(credential),
      verificationFailed: (e) {
        if (!mounted) return;
        setState(() => _sending = false);
        _showMessage(l.t(authErrorKey(e.code)));
      },
      codeSent: (verificationId, resendToken) {
        if (!mounted) return;
        setState(() {
          _verificationId = verificationId;
          _resendToken = resendToken;
          _sending = false;
        });
        _showMessage(l.t('otpSent'));
      },
      codeAutoRetrievalTimeout: (verificationId) {
        _verificationId ??= verificationId;
      },
    );
  }

  Future<void> _verifyOtp() async {
    final l = AppLocalizations.of(context);
    final code = _otpCtrl.text.trim();
    if (_verificationId == null || code.length < 4) {
      _showMessage(l.t('authErrOtpInvalid'));
      return;
    }
    await _signInWith(PhoneAuthProvider.credential(
      verificationId: _verificationId!,
      smsCode: code,
    ));
  }

  Future<void> _signInWith(PhoneAuthCredential credential) async {
    if (_verifying) return;
    final l = AppLocalizations.of(context);
    setState(() {
      _verifying = true;
      _sending = false;
    });
    try {
      final cred =
          await FirebaseAuth.instance.signInWithCredential(credential);
      final user = cred.user;
      if (user != null) {
        // Bootstrap kongsi SP10.1B — tiada medan protected, tiada null.
        await bootstrapSignedInUser(ref, user);
      }
      if (!mounted) return;
      final prefs = ref.read(appPrefsProvider);
      // HOTFIX 4.6A: sambung jemputan tertunda selepas auth (tiada auto-join).
      context.go(postAuthRoute(ref, onboardingDone: prefs.onboardingDone));
    } on FirebaseAuthException catch (e) {
      _showMessage(l.t(authErrorKey(e.code)));
    } catch (_) {
      _showMessage(l.t('authError'));
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final mm = context.mm;
    final otpStage = _verificationId != null;

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
              Text(
                l.t('signInPhone'),
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: mm.onCard,
                ),
              ),
              const SizedBox(height: 22),
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: mm.card,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: mm.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: _phoneCtrl,
                      keyboardType: TextInputType.phone,
                      enabled: !otpStage && !_sending && !_verifying,
                      decoration: InputDecoration(
                        prefixText: '+60 ',
                        hintText: l.t('phoneNumberHint'),
                      ),
                    ),
                    const SizedBox(height: 14),
                    if (!otpStage)
                      PrimaryCtaButton(
                        label: l.t('sendOtp'),
                        loading: _sending || _verifying,
                        onPressed: _sending || _verifying
                            ? null
                            : () => _sendOtp(),
                      )
                    else ...[
                      TextField(
                        controller: _otpCtrl,
                        keyboardType: TextInputType.number,
                        maxLength: 8,
                        autofocus: true,
                        decoration: InputDecoration(
                          hintText: l.t('otpHint'),
                          counterText: '',
                        ),
                      ),
                      const SizedBox(height: 14),
                      PrimaryCtaButton(
                        label: l.t('verifyOtp'),
                        loading: _verifying,
                        onPressed: _verifying ? null : _verifyOtp,
                      ),
                      const SizedBox(height: 4),
                      Center(
                        child: TextButton(
                          onPressed: _sending || _verifying
                              ? null
                              : () => _sendOtp(resend: true),
                          child: Text(
                            l.t('resendOtp'),
                            style: const TextStyle(fontSize: 13.5),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
