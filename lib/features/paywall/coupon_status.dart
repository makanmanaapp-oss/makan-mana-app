import 'package:cloud_firestore/cloud_firestore.dart';

/// PROMPT 12: pengiraan tulen status Pro Trial dari dokumen users
/// (diuji unit). Bezakan Pro-kupon (trial) dari Pro-berbayar.
class CouponTrialInfo {
  const CouponTrialInfo({
    required this.isTrial,
    required this.isActive,
    required this.isExpired,
    this.expiresAt,
  });

  /// planSource == 'coupon' (Pro melalui kupon, bukan berbayar).
  final bool isTrial;

  /// Trial kupon masih dalam tempoh sah.
  final bool isActive;

  /// Pernah guna kupon tapi sudah tamat (planSource == 'expired_coupon').
  final bool isExpired;

  final DateTime? expiresAt;

  static const none = CouponTrialInfo(
    isTrial: false,
    isActive: false,
    isExpired: false,
  );
}

DateTime? _toDate(dynamic v) {
  if (v is Timestamp) return v.toDate();
  if (v is DateTime) return v;
  return null;
}

/// Kira status trial dari dokumen users (boleh null).
/// [now] disuntik untuk ujian.
CouponTrialInfo couponTrialInfo(Map<String, dynamic>? userDoc,
    {DateTime? now}) {
  if (userDoc == null) return CouponTrialInfo.none;
  final source = userDoc['planSource'] as String? ?? '';
  final plan = userDoc['plan'] as String? ?? 'free';
  final expiresAt = _toDate(userDoc['couponExpiresAt']);
  final t = now ?? DateTime.now();

  if (source == 'coupon' && plan != 'free') {
    final active = expiresAt == null || expiresAt.isAfter(t);
    return CouponTrialInfo(
      isTrial: true,
      isActive: active,
      isExpired: !active,
      expiresAt: expiresAt,
    );
  }
  if (source == 'expired_coupon') {
    return CouponTrialInfo(
      isTrial: false,
      isActive: false,
      isExpired: true,
      expiresAt: expiresAt,
    );
  }
  return CouponTrialInfo.none;
}

/// Format tarikh ringkas "15 Ogos 2026" (BM).
String formatTrialDate(DateTime d) {
  const months = [
    '', 'Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun',
    'Jul', 'Ogos', 'Sep', 'Okt', 'Nov', 'Dis',
  ];
  return '${d.day} ${months[d.month]} ${d.year}';
}
