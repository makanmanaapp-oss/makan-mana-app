/// PART 1 Phase 1.11 — feature flag pembetulan/laporan kedai.
///
/// Default OFF: UI legasi kekal & selamat, tiada titik masuk laporan dipapar.
/// TIADA suis produksi jauh dalam fasa ini — rollback serta-merta dengan
/// menetapkan semula flag. Kedua-dua laluan (ON + OFF) diliputi ujian.
///
/// Dalam fasa ini penghantaran adalah TEMPATAN/MOCK sahaja: tiada callable
/// produksi dipanggil dan tiada data dipercayai ditulis.
library;

class PlaceCorrectionFlags {
  PlaceCorrectionFlags._();

  /// true = tunjuk titik masuk laporan/pembetulan; false = sembunyi (default).
  /// Boleh ditimpa dalam debug/ujian sahaja.
  static bool placeCorrectionEnabled = false;

  /// Tetap semula kepada lalai selamat (dipanggil dalam tearDown ujian).
  static void resetToSafeDefault() {
    placeCorrectionEnabled = false;
  }
}
