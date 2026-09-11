import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

import '../../models/place_summary.dart';
import '../constants/app_constants.dart';

/// Bounded server-mediated search over active MakanMana first-party places.
/// This complements Explore's local page filter and never reads canonical
/// Firestore collections directly from the mobile client.
class CanonicalPlaceSearchService {
  CanonicalPlaceSearchService({required this.firebaseReady});

  final bool firebaseReady;

  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  Future<List<PlaceSummary>?> search({
    required String query,
    double? lat,
    double? lng,
    int limit = 20,
  }) async {
    final clean = query.trim();
    if (!firebaseReady || clean.isEmpty) return const [];
    try {
      final callable = _functions.httpsCallable(
        'searchCanonicalPlaces',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 12)),
      );
      final response = await callable.call<Map<Object?, Object?>>({
        'query': clean,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
        'limit': limit.clamp(1, 20),
      });
      final data = Map<String, dynamic>.from(response.data);
      return (data['places'] as List? ?? const [])
          .map((raw) =>
              PlaceSummary.fromMap(Map<String, dynamic>.from(raw as Map)))
          .toList();
    } catch (error) {
      debugPrint('MakanMana: canonical place search gagal: $error');
      return null;
    }
  }
}
