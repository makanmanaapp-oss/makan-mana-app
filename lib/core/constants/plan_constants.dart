import 'package:flutter/foundation.dart';

enum Plan { free, plus, pro }

enum GateState { available, preview, locked }

class PlanConstants {
  PlanConstants._();

  /// Had sebenar pelan Free (dipakai dalam build release).
  static const freeSpinLimitPerDay = 3;

  /// Build debug: had longgar supaya owner boleh test tanpa sekatan.
  /// Build release Play Store tetap 3 secara automatik.
  static int get effectiveFreeSpinLimit =>
      kDebugMode ? 999 : freeSpinLimitPerDay;

  static const plusPriceLabel = 'RM9.99';
  static const proPriceLabel = 'RM29.90';
  static const plusSubscriptionId = 'makanmana_plus_monthly';
  static const proSubscriptionId = 'makanmana_pro_monthly';
}

/// Tema butang Spin. Hanya visual, tidak mengubah logik algoritma.
enum SpinTheme { magicPlate, rodaMisteri, shuffleCard, nearbyRadar }
