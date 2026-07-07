/// Penggunaan harian: daily_usage/{uid_yyyyMMdd}.
class DailyUsage {
  const DailyUsage({
    required this.userId,
    required this.date,
    required this.plan,
    this.spinUsed = 0,
    this.spinLimit = 3,
    this.paywallShownCount = 0,
  });

  final String userId;
  final String date; // yyyyMMdd
  final String plan;
  final int spinUsed;
  final int spinLimit; // -1 = tanpa had (plus/pro)
  final int paywallShownCount;

  bool get unlimited => spinLimit < 0;
  bool get canSpin => unlimited || spinUsed < spinLimit;
  int get spinLeft => unlimited ? 999 : (spinLimit - spinUsed).clamp(0, 99);

  Map<String, dynamic> toMap() => {
        'userId': userId,
        'date': date,
        'plan': plan,
        'spinUsed': spinUsed,
        'spinLimit': spinLimit,
        'paywallShownCount': paywallShownCount,
      };

  factory DailyUsage.fromMap(Map<String, dynamic> map) => DailyUsage(
        userId: map['userId'] as String? ?? '',
        date: map['date'] as String? ?? '',
        plan: map['plan'] as String? ?? 'free',
        spinUsed: (map['spinUsed'] as num?)?.toInt() ?? 0,
        spinLimit: (map['spinLimit'] as num?)?.toInt() ?? 3,
        paywallShownCount: (map['paywallShownCount'] as num?)?.toInt() ?? 0,
      );
}
