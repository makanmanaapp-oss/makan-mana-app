import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

import '../../models/place_summary.dart';
import '../constants/app_constants.dart';

/// Hasil panggilan getSuggestions dari Cloud Function.
class CloudSpinResult {
  const CloudSpinResult({
    required this.paywallRequired,
    this.place,
    this.sessionId,
    this.suggestionId,
    this.spinUsed,
    this.spinLimit,
    this.candidates = const [],
  });

  final bool paywallRequired;
  final PlaceSummary? place;
  final String? sessionId;
  final String? suggestionId;
  final int? spinUsed;
  final int? spinLimit;

  /// Calon tambahan dari pelayan (untuk reject-chain tanpa panggilan baru).
  final List<PlaceSummary> candidates;
}

/// Klien Cloud Functions (region asia-southeast1).
/// SpinController cuba servis ini dahulu dan fallback ke logik
/// tempatan jika Functions belum deploy / tiada rangkaian.
class CloudSuggestionService {
  CloudSuggestionService({required this.firebaseReady});

  final bool firebaseReady;

  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  Future<CloudSpinResult?> getSuggestions({
    String? mood,
    String? languageCode,
    double? lat,
    double? lng,
    int? radius,
  }) async {
    if (!firebaseReady) return null;
    try {
      final callable = _functions.httpsCallable(
        'getSuggestions',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 15)),
      );
      final res = await callable.call<Map<Object?, Object?>>({
        'mood': mood,
        'languageCode': languageCode,
        'lat': lat,
        'lng': lng,
        'radius': radius,
      });
      final data = Map<String, dynamic>.from(res.data);
      if (data['status'] == 'PAYWALL_REQUIRED') {
        return CloudSpinResult(
          paywallRequired: true,
          spinUsed: (data['spinUsed'] as num?)?.toInt(),
          spinLimit: (data['spinLimit'] as num?)?.toInt(),
        );
      }
      final primary = data['primary'];
      if (primary == null) return null;
      final candidates = (data['candidates'] as List? ?? [])
          .map((c) =>
              PlaceSummary.fromMap(Map<String, dynamic>.from(c as Map)))
          .toList();
      return CloudSpinResult(
        paywallRequired: false,
        place: PlaceSummary.fromMap(
          Map<String, dynamic>.from(primary as Map),
        ),
        sessionId: data['sessionId'] as String?,
        suggestionId: data['suggestionId'] as String?,
        spinUsed: (data['spinUsed'] as num?)?.toInt(),
        spinLimit: (data['spinLimit'] as num?)?.toInt(),
        candidates: candidates,
      );
    } catch (e) {
      debugPrint('MakanMana: getSuggestions cloud gagal, guna lokal: $e');
      return null;
    }
  }

  /// Senarai tempat berdekatan untuk Home (hero + grid).
  /// Hampir selalu hit cache 7 hari di pelayan — sangat jimat API.
  Future<List<PlaceSummary>?> getNearbyPlaces({
    double? lat,
    double? lng,
    int? radius,
    String? languageCode,
  }) async {
    if (!firebaseReady) return null;
    try {
      final callable = _functions.httpsCallable(
        'getNearbyPlaces',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 15)),
      );
      final res = await callable.call<Map<Object?, Object?>>({
        'lat': lat,
        'lng': lng,
        'radius': radius,
        'languageCode': languageCode,
      });
      final data = Map<String, dynamic>.from(res.data);
      return (data['places'] as List? ?? [])
          .map((p) =>
              PlaceSummary.fromMap(Map<String, dynamic>.from(p as Map)))
          .toList();
    } catch (e) {
      debugPrint('MakanMana: getNearbyPlaces cloud gagal, guna lokal: $e');
      return null;
    }
  }

  /// true jika berjaya dihantar ke pelayan.
  /// [place] ialah snapshot tempat (perlu untuk rekod meal tempat sebenar).
  Future<bool> submitFeedback({
    required String action,
    String? suggestionId,
    String? placeId,
    String? sessionId,
    String? reason,
    PlaceSummary? place,
  }) async {
    if (!firebaseReady) return false;
    try {
      final callable = _functions.httpsCallable(
        'submitFeedback',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 12)),
      );
      await callable.call<Map<Object?, Object?>>({
        'action': action,
        'suggestionId': suggestionId,
        'placeId': placeId,
        'sessionId': sessionId,
        'reason': reason,
        if (place != null)
          'place': {
            'name': place.name,
            'cuisine': place.cuisine,
            'emoji': place.emoji,
            'priceLevel': place.priceLevel,
            'priceEstimate': place.priceEstimate,
            'matchScore': place.matchScore,
          },
      });
      return true;
    } catch (e) {
      debugPrint('MakanMana: submitFeedback cloud gagal, guna lokal: $e');
      return false;
    }
  }
}
