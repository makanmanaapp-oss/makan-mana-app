/// Phase 2.8A — Kejujuran paparan LOKASI (satu sumber kebenaran, sisi-klien).
///
/// Membezakan lokasi PERANTI/tersimpan (koordinat sebenar) daripada lokasi
/// LALAI (fallback KL bila tiada koordinat). Bila fallback, UI TIDAK boleh
/// mendakwa "Sekitar lokasi anda" — mesti didedah sebagai lokasi lalai.
///
/// Model sumber sedia ada: LocationRequestContext.source ('device_gps'|'stored'
/// |'none') + koordinat. Di lapisan makanManaUserContext, currentLat==null bila
/// tiada koordinat (kes fallback). TIDAK menukar polisi/koordinat fallback.
library;

enum LocationDisplayKind {
  /// Koordinat peranti/tersimpan sebenar — "Sekitar lokasi anda" DIBENARKAN.
  deviceOrStored,

  /// Kawasan dipilih manual — papar nama kawasan.
  manual,

  /// Tiada koordinat → pelayan guna lokasi LALAI (KL). MESTI didedah.
  defaultFallback,
}

class LocationDisplay {
  const LocationDisplay._();

  /// Tentukan jenis paparan dari (koordinat, nama manual). Satu resolver
  /// dikongsi Home/Explore/Spin/Meal Plan — tiada inferens per-skrin.
  static LocationDisplayKind resolve({double? lat, String? manualName}) {
    if (manualName != null && manualName.trim().isNotEmpty) {
      return LocationDisplayKind.manual;
    }
    if (lat != null) return LocationDisplayKind.deviceOrStored;
    return LocationDisplayKind.defaultFallback;
  }

  /// Kunci l10n untuk label lokasi. (manual dikendali pemanggil dgn nama.)
  static String labelKey(LocationDisplayKind kind) {
    switch (kind) {
      case LocationDisplayKind.deviceOrStored:
        return 'yourArea'; // "Sekitar lokasi anda"
      case LocationDisplayKind.defaultFallback:
        return 'locDefaultArea'; // "Sekitar KL (lokasi lalai)"
      case LocationDisplayKind.manual:
        return 'near'; // pemanggil tambah nama kawasan
    }
  }

  /// Adakah notis fallback (banner tak-menghalang) perlu dipapar?
  static bool showsFallbackNotice(LocationDisplayKind kind) =>
      kind == LocationDisplayKind.defaultFallback;

  /// Adakah label BOLEH mendakwa lokasi semasa pengguna? (device/manual sahaja).
  static bool allowsCurrentLocationClaim(LocationDisplayKind kind) =>
      kind != LocationDisplayKind.defaultFallback;
}
