/// PART 1 Phase 1.10 — feature flag Butiran Kedai kanonikal.
///
/// Default OFF: skrin Butiran Kedai LEGASI kekal & selamat. TIADA suis produksi
/// jauh dalam fasa ini — rollback serta-merta dengan menetapkan semula flag.
/// Kedua-dua laluan (legasi + kanonikal) diliputi ujian.
class RestaurantDetailFlags {
  RestaurantDetailFlags._();

  /// true = render skrin Butiran KANONIKAL; false = kekal skrin legasi (default).
  /// Boleh ditimpa dalam debug/ujian sahaja.
  static bool canonicalRestaurantDetailEnabled = false;

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
