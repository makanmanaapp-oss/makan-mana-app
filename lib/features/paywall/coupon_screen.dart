import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import '../../core/services/coupon_service.dart';
import '../../core/widgets/primary_cta_button.dart';
import '../social/social_providers.dart' show myUserDocProvider;
import 'coupon_status.dart';

/// PROMPT 12: skrin tebus kod kupon → Pro Trial.
class CouponScreen extends ConsumerStatefulWidget {
  const CouponScreen({super.key});

  @override
  ConsumerState<CouponScreen> createState() => _CouponScreenState();
}

class _CouponScreenState extends ConsumerState<CouponScreen> {
  final _controller = TextEditingController();
  bool _loading = false;
  String? _error;
  String? _success;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _redeem() async {
    if (_loading) return;
    final code = _controller.text.trim();
    if (code.isEmpty) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _error = null;
      _success = null;
    });
    try {
      final res = await ref.read(couponServiceProvider).redeem(code);
      if (!mounted) return;
      setState(() => _success = res.message);
    } on CouponException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final mm = context.mm;
    final userDoc = ref.watch(myUserDocProvider).value;
    final info = couponTrialInfo(userDoc);

    return Scaffold(
      appBar: AppBar(title: Text(l.t('couponTitle'))),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Status trial semasa (jika ada).
              if (info.isActive && info.expiresAt != null)
                _banner(
                  mm,
                  icon: Icons.workspace_premium,
                  bg: AppColors.softYellow,
                  fg: AppColors.darkText,
                  text:
                      '${l.t('couponActiveUntil')} ${formatTrialDate(info.expiresAt!)}',
                )
              else if (info.isExpired)
                _banner(
                  mm,
                  icon: Icons.history,
                  bg: mm.card,
                  fg: mm.onCardMuted,
                  text: l.t('couponExpiredNote'),
                ),
              if (info.isActive || info.isExpired)
                const SizedBox(height: 16),

              Text(
                l.t('couponSubtitle'),
                style: TextStyle(
                    fontSize: 14, color: mm.onCardMuted, height: 1.4),
              ),
              const SizedBox(height: 18),

              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: mm.card,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: mm.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: _controller,
                      enabled: !_loading,
                      textCapitalization: TextCapitalization.characters,
                      autocorrect: false,
                      maxLength: 40,
                      inputFormatters: [
                        UpperCaseTextFormatter(),
                      ],
                      style: TextStyle(
                        color: mm.onCard,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 2,
                      ),
                      decoration: InputDecoration(
                        hintText: l.t('couponInputHint'),
                        counterText: '',
                        filled: true,
                        fillColor: mm.chipBackground,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide.none,
                        ),
                      ),
                      onSubmitted: (_) => _redeem(),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _error!,
                        style: const TextStyle(
                          color: AppColors.primaryRed,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                    if (_success != null) ...[
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          const Icon(Icons.check_circle,
                              color: AppColors.healthyGreen, size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              l.t('couponSuccess'),
                              style: const TextStyle(
                                color: AppColors.healthyGreen,
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                height: 1.35,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 14),
                    PrimaryCtaButton(
                      label: l.t('couponRedeem'),
                      loading: _loading,
                      onPressed: _loading ? null : _redeem,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              // Jujur: pembayaran sebenar masih belum aktif.
              Text(
                l.t('couponPaymentNote'),
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 11.5, color: mm.onCardFaint, height: 1.4),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _banner(
    MMColors mm, {
    required IconData icon,
    required Color bg,
    required Color fg,
    required String text,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: bg == mm.card ? Border.all(color: mm.border) : null,
      ),
      child: Row(
        children: [
          Icon(icon, size: 22, color: fg),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                  color: fg, fontWeight: FontWeight.w700, fontSize: 13.5),
            ),
          ),
        ],
      ),
    );
  }
}

/// Paksa huruf besar semasa taip (kod kupon).
class UpperCaseTextFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    return TextEditingValue(
      text: newValue.text.toUpperCase(),
      selection: newValue.selection,
    );
  }
}
