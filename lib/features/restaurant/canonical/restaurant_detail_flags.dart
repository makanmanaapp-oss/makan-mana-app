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

  /// Tetap semula kepada lalai selamat (dipanggil dalam tearDown ujian).
  static void resetToSafeDefault() {
    canonicalRestaurantDetailEnabled = false;
  }
}
