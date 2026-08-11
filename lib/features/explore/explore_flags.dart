/// Explore — flag kebolehlihatan panel diagnostik.
///
/// Default OFF supaya paparan Explore biasa (walau dalam debug) BERSIH dan
/// tidak ditutup panel diagnostik. Hidupkan secara eksplisit untuk QA dalaman.
/// Keluaran tetap tersembunyi (pemanggil juga membalut dengan kDebugMode) —
/// logik baca produksi TIDAK berubah.
class ExploreFlags {
  ExploreFlags._();

  /// true = papar panel diagnostik (debug + flag ON sahaja).
  static bool diagnosticsVisible = false;

  /// Tetap semula kepada lalai selamat (dipanggil dalam tearDown ujian).
  static void resetToSafeDefault() {
    diagnosticsVisible = false;
  }
}
