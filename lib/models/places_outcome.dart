/// WAVE 4A — hasil JUJUR carian tempat (klien).
///
/// Cermin `functions/src/domain/places/truthfulPlacesOutcome.ts`. Sebelum ini
/// klien meruntuhkan "tiada hasil" dan "perkhidmatan gagal" menjadi satu
/// senarai kosong, lalu menggantikannya dengan restoran REKAAN. Tiga keadaan
/// itu kini berbeza, dan tiada satu pun daripadanya mereka restoran.
library;

import 'place_summary.dart';

/// Status protokol wayar yang dipulangkan backend.
class PlacesStatus {
  static const String ok = 'OK';
  static const String empty = 'OK_EMPTY';
  static const String unavailable = 'PLACES_UNAVAILABLE';
}

/// Sebab perkhidmatan tempat tidak tersedia.
enum PlacesUnavailableReason {
  /// Gangguan pembekal atau had masa — berbaloi dicuba semula.
  providerError,

  /// Salah konfigurasi pelayan — mencuba semula tidak membantu.
  notConfigured,

  /// Klien tidak dapat menghubungi pelayan langsung.
  network,

  /// Lokasi peranti belum tersedia / belum dibenarkan.
  location,
}

/// Hasil carian tempat. Tepat satu daripada tiga keadaan.
class PlacesOutcome {
  const PlacesOutcome.ok(this.places)
      : isEmptyArea = false,
        isUnavailable = false,
        retryable = false,
        reason = null;

  /// Kawasan ini benar-benar tiada hasil. BUKAN gangguan.
  const PlacesOutcome.emptyArea()
      : places = const [],
        isEmptyArea = true,
        isUnavailable = false,
        retryable = false,
        reason = null;

  /// Perkhidmatan tidak dapat dilayan. BUKAN "tiada restoran".
  const PlacesOutcome.unavailable({
    required this.reason,
    this.retryable = true,
  })  : places = const [],
        isEmptyArea = false,
        isUnavailable = true;

  final List<PlaceSummary> places;
  final bool isEmptyArea;
  final bool isUnavailable;
  final bool retryable;
  final PlacesUnavailableReason? reason;

  bool get hasPlaces => places.isNotEmpty;

  /// Bina daripada muatan callable. Klien lama mengabaikan `status`; klien ini
  /// tidak — status yang hilang dengan tempat dianggap OK (serasi ke belakang).
  factory PlacesOutcome.fromMap(Map<String, dynamic> data) {
    final status = data['status'] as String?;
    final rawPlaces = (data['places'] as List? ?? const [])
        .map((p) => PlaceSummary.fromMap(Map<String, dynamic>.from(p as Map)))
        .toList();
    if (status == PlacesStatus.unavailable) {
      return PlacesOutcome.unavailable(
        reason: data['reason'] == 'not_configured'
            ? PlacesUnavailableReason.notConfigured
            : PlacesUnavailableReason.providerError,
        retryable: data['retryable'] != false,
      );
    }
    if (status == PlacesStatus.empty) return const PlacesOutcome.emptyArea();
    if (rawPlaces.isEmpty) return const PlacesOutcome.emptyArea();
    return PlacesOutcome.ok(rawPlaces);
  }
}
