import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';

import '../constants/app_constants.dart';
import 'app_prefs.dart';
import 'social_service.dart';

/// Hasil hantaran rating: approved (terus keluar) atau pending (admin).
class ReviewResult {
  const ReviewResult({required this.approved});

  final bool approved;
}

/// Sistem rating kedai (Milestone Rating):
/// - meal: dari rekod makan via app (verified)
/// - checkin: bukti lokasi >= 5 minit (verified)
/// - delivery: pending kelulusan admin
class ReviewService {
  ReviewService({
    required this.firebaseReady,
    required this.prefs,
    required this.socialService,
  });

  final bool firebaseReady;
  final AppPrefs prefs;
  final SocialService socialService;

  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  /// Check-in di kedai: rekod lokasi + masa di pelayan dan tempatan.
  Future<void> checkIn({
    required String placeId,
    required String placeName,
    required double lat,
    required double lng,
  }) async {
    await _functions
        .httpsCallable(
          'checkIn',
          options:
              HttpsCallableOptions(timeout: const Duration(seconds: 15)),
        )
        .call<Map>({
      'placeId': placeId,
      'placeName': placeName,
      'lat': lat,
      'lng': lng,
    });
    await prefs.setCheckin(placeId, DateTime.now());
  }

  /// Masa check-in tempatan untuk kedai ini (null = belum check-in).
  DateTime? checkinTime(String placeId) => prefs.checkinTime(placeId);

  Future<ReviewResult> submitReview({
    required String uid,
    required String placeId,
    required String placeName,
    required String emoji,
    required String cuisine,
    required int rating,
    String text = '',
    File? image,
    required String source, // meal | checkin | delivery
    String? mealId,
    double? lat,
    double? lng,
    bool shareToFeed = true,
  }) async {
    String imageUrl = '';
    if (image != null) {
      imageUrl = await socialService.uploadImage(uid, image);
    }
    final res = await _functions
        .httpsCallable(
          'submitReview',
          options:
              HttpsCallableOptions(timeout: const Duration(seconds: 20)),
        )
        .call<Map>({
      'placeId': placeId,
      'placeName': placeName,
      'emoji': emoji,
      'cuisine': cuisine,
      'rating': rating,
      'text': text,
      'imageUrl': imageUrl,
      'source': source,
      'mealId': mealId,
      'lat': lat,
      'lng': lng,
      'shareToFeed': shareToFeed,
    });
    return ReviewResult(
      approved: (res.data['reviewStatus'] as String?) == 'approved',
    );
  }
}
