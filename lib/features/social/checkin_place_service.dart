import 'package:cloud_functions/cloud_functions.dart';

import '../../core/constants/app_constants.dart';
import 'checkin_place.dart';

/// Carian tempat untuk composer sahaja. API key Google tidak pernah berada
/// dalam aplikasi; callable memilih DB bersama dahulu dan Google sebagai fallback.
class CheckinPlaceService {
  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  Future<List<CheckinPlace>> search(String query,
      {String languageCode = 'ms'}) async {
    final clean = query.trim();
    if (clean.length < 2) return const [];
    final result = await _functions
        .httpsCallable('searchCheckinPlaces',
            options: HttpsCallableOptions(timeout: const Duration(seconds: 12)))
        .call<Map<Object?, Object?>>(
            {'query': clean, 'languageCode': languageCode});
    final data = Map<Object?, Object?>.from(result.data);
    return (data['places'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => CheckinPlace.fromMap(Map<Object?, Object?>.from(item)))
        .toList();
  }
}
