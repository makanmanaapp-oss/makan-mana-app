import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

import '../constants/app_constants.dart';

/// PROMPT 12: pelanggan tipis untuk callable kupon Pro Trial.
/// TIADA tulisan plan dari klien — semua melalui Cloud Functions.
class CouponService {
  FirebaseFunctions get _fns =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  /// Tebus kod kupon. Pulangkan hasil ({message, expiresAt}) atau
  /// lempar [CouponException] dengan mesej mesra.
  Future<CouponResult> redeem(String code) async {
    try {
      final res = await _fns
          .httpsCallable('redeemCoupon')
          .call<Map<dynamic, dynamic>>({'code': code});
      final data = res.data;
      return CouponResult(
        message: data['message'] as String? ??
            'Kod berjaya ditebus. Pro aktif.',
        expiresAtMs: (data['expiresAt'] as num?)?.toInt(),
        plan: data['plan'] as String? ?? 'pro',
      );
    } on FirebaseFunctionsException catch (e) {
      // Pelayan hantar mesej mesra dalam e.message; fallback jujur.
      throw CouponException(
        e.message?.isNotEmpty == true ? e.message! : 'Kod kupon tidak sah.',
      );
    } catch (_) {
      throw const CouponException('Ada masalah rangkaian. Cuba lagi.');
    }
  }

  /// Semak & luputkan trial tamat (fire-and-forget bila app dibuka).
  /// Server kembalikan pelan ke asal jika kupon sudah tamat.
  void refreshPlanStatus() {
    _fns.httpsCallable('refreshMyPlanStatus').call().then(
      (_) {},
      onError: (Object e) =>
          debugPrint('MakanMana: refreshMyPlanStatus tertangguh: $e'),
    );
  }
}

class CouponResult {
  const CouponResult({
    required this.message,
    required this.plan,
    this.expiresAtMs,
  });
  final String message;
  final String plan;
  final int? expiresAtMs;
}

class CouponException implements Exception {
  const CouponException(this.message);
  final String message;
  @override
  String toString() => message;
}
