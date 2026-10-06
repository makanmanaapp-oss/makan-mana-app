import 'package:flutter/foundation.dart';

/// PART 1 Phase 1.10 — feature flag Butiran Kedai kanonikal.
///
/// Default OFF: skrin Butiran Kedai LEGASI kekal & selamat. TIADA suis produksi
/// jauh dalam fasa ini — rollback serta-merta dengan menetapkan semula flag.
/// Kedua-dua laluan (legasi + kanonikal) diliputi ujian.
class RestaurantDetailFlags {
  RestaurantDetailFlags._();

  /// Release iOS/Android menggunakan Butiran Kedai V2 yang sudah mempunyai
  /// Profil, Ulasan dan Menu. Debug/ujian kekal opt-in supaya fixture lama tidak
  /// berubah secara senyap dan rollback QA masih mudah.
  static bool canonicalRestaurantDetailEnabled = kReleaseMode;

  /// Kebolehlihatan tindanan diagnostik kohort. Default OFF supaya paparan
  /// biasa (walau dalam debug) BERSIH dan tidak menutup kandungan pengguna;
  /// hidupkan secara eksplisit untuk QA dalaman. Keluaran tetap tersembunyi
  /// (pemanggil juga membalut dengan kDebugMode) — logik produksi tak berubah.
  static bool cohortDiagnosticsVisible = false;

  /// Tetap semula kepada lalai selamat (dipanggil dalam tearDown ujian).
  static void resetToSafeDefault() {
    canonicalRestaurantDetailEnabled = false;
    cohortDiagnosticsVisible = false;
  }
}
