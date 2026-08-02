/// PART 1 Phase 1.9 — feature flag kad kanonikal.
///
/// Default OFF: laluan legasi kekal & selamat. TIADA suis produksi jauh dalam
/// fasa ini — rollback serta-merta dengan menetapkan semula flag. Kedua-dua
/// laluan diliputi ujian.
class PlaceCardFlags {
  PlaceCardFlags._();

  /// true = render kad KANONIKAL; false = kekal laluan legasi (default).
  /// Boleh ditimpa dalam debug/ujian sahaja.
  static bool canonicalCardsEnabled = false;

  /// Tetap semula kepada lalai selamat (dipanggil dalam tearDown ujian).
  static void resetToSafeDefault() {
    canonicalCardsEnabled = false;
  }
}
