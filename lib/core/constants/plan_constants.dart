enum Plan { free, plus, pro }

enum GateState { available, preview, locked }

class PlanConstants {
  PlanConstants._();

  /// Had sebenar pelan Free — SAMA dalam debug & release (QUOTA-01):
  /// bypass debug 999 lama menyebabkan kuota tidak dikuatkuasa & cip "999".
  /// Untuk QA tanpa had: tukar users/{uid}.plan ke plus/pro di Firebase
  /// Console (kaedah rasmi internal QA).
  static const freeSpinLimitPerDay = 3;

  /// Had berkesan pelan Free (kekal getter untuk keserasian pemanggil).
  static int get effectiveFreeSpinLimit => freeSpinLimitPerDay;

  /// PAY-01: mock upgrade dev-only. WAJIB kekal false — bila true (dan
  /// build debug), butang paywall akan tulis plan terus (aliran mock lama).
  /// Penguji internal TIDAK guna ini; tukar plan di Firebase Console.
  static const bool devMockUpgradeEnabled = false;

  static const plusPriceLabel = 'RM9.99';
  static const proPriceLabel = 'RM29.90';
  static const plusSubscriptionId = 'makanmana_plus_monthly';
  static const proSubscriptionId = 'makanmana_pro_monthly';

  /// applicationId Android (BEKU — tidak diubah). Digunakan untuk pautan
  /// "Urus langganan" ke halaman langganan Google Play.
  static const androidPackageName = 'com.makanmana.apps';
}

/// Tema butang Spin. Hanya visual, tidak mengubah logik algoritma.
enum SpinTheme { magicPlate, rodaMisteri, shuffleCard, nearbyRadar }
