/// WAVE 4A — tempat SEBENAR lawan tempat bukan-sebenar (klien).
///
/// Cermin `functions/src/domain/places/realPlaceIdentity.ts`. Satu soalan:
/// bolehkah tempat ini dilayan sebagai perniagaan sebenar — dinavigasi dalam
/// peta, disimpan sebagai makan, dipelajari sebagai citarasa?
///
/// Dua keluarga ID bukan-sebenar:
///   - `dummy_`        contoh demo tempatan (mod demo sahaja selepas Wave 4A)
///   - `qa_synthetic_` data ujian QA berlabel (tidak pernah produksi)
library;

import '../../models/place_summary.dart';

/// Awalan ID tempat contoh/rekaan tempatan.
const String kFictionalPlaceIdPrefix = 'dummy_';

/// Awalan ID tempat sintetik QA (dijana oleh backend dalam runtime QA sahaja).
const String kQaSyntheticPlaceIdPrefix = 'qa_synthetic_';

/// true jika ID ini merujuk perniagaan sebenar.
bool isRealPlaceId(String? placeId) {
  if (placeId == null || placeId.isEmpty) return false;
  return !placeId.startsWith(kFictionalPlaceIdPrefix) &&
      !placeId.startsWith(kQaSyntheticPlaceIdPrefix);
}

/// true jika tempat ini boleh dibuka dalam Google Maps sebagai kedai sebenar.
///
/// Contoh dan data sintetik TIDAK boleh: menghantar pengguna mencari nama
/// rekaan di kawasan sebenar ialah kerosakan yang dibaiki oleh Wave 4A.
bool isNavigablePlace(PlaceSummary place) =>
    isRealPlaceId(place.placeId) && !place.isSample;

/// true jika tindakan pada tempat ini boleh melatih AI Brain.
bool isLearningEligiblePlace(PlaceSummary place) => isNavigablePlace(place);
