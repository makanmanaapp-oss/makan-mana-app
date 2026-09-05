import 'package:cloud_functions/cloud_functions.dart';

import '../constants/app_constants.dart';

/// WAVE 3D Gate 2 — thin Firebase callable client for restaurant engagement.
///
/// The mobile app NEVER writes `restaurant_follows`, `menu_comments`, or a
/// restaurant-authored `feed_posts` document directly. Firestore rules deny all
/// client writes on those collections; every mutation is routed through an
/// authenticated Cloud Function that re-validates identity server-side.
///
/// IDENTITY CONTRACT (locked):
///   user       -> authorType "user",       authorUid = Firebase UID
///   restaurant -> authorType "restaurant", restaurantId = canonicalPlaceId
/// The acting merchant Firebase UID is NEVER sent as a public author identity
/// and never appears in any document this client can read — the server records
/// it only in its internal audit event.
///
/// Every restaurant action is addressed by `canonicalPlaceId`. The callables
/// additionally resolve an alias/provider id to the active canonical
/// publication, so the server is always the final authority on identity.
class RestaurantEngagementService {
  const RestaurantEngagementService();

  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  Map<String, dynamic> _map(dynamic value) {
    if (value is Map) {
      return value.map((key, item) => MapEntry(key.toString(), item));
    }
    return <String, dynamic>{};
  }

  RestaurantEngagementException _error(FirebaseFunctionsException error) {
    final message = error.message?.trim();
    return RestaurantEngagementException(
      message?.isNotEmpty == true ? message! : 'restaurant_action_failed',
      code: error.code,
    );
  }

  Future<Map<String, dynamic>> _call(
    String name,
    Map<String, dynamic> payload,
  ) async {
    try {
      final result = await _functions
          .httpsCallable(name)
          .call<Map<dynamic, dynamic>>(payload);
      return _map(result.data);
    } on FirebaseFunctionsException catch (error) {
      throw _error(error);
    } catch (_) {
      throw const RestaurantEngagementException(
        'Ada masalah rangkaian. Cuba lagi.',
      );
    }
  }

  // ── Follow (server-mediated; no direct restaurant_follows write) ─────────

  Future<bool> follow({required String canonicalPlaceId}) async {
    final data = await _call('followRestaurant', {
      'canonicalPlaceId': canonicalPlaceId,
    });
    return data['following'] == true;
  }

  Future<bool> unfollow({required String canonicalPlaceId}) async {
    final data = await _call('unfollowRestaurant', {
      'canonicalPlaceId': canonicalPlaceId,
    });
    return data['following'] == true;
  }

  // ── Menu comments (server-mediated; no direct menu_comments write) ───────

  /// Normal customer comment on an exact restaurant + menu item.
  Future<String?> createMenuComment({
    required String canonicalPlaceId,
    required String menuItemId,
    required String text,
    String? parentCommentId,
  }) async {
    final data = await _call('createMenuComment', {
      'canonicalPlaceId': canonicalPlaceId,
      'menuItemId': menuItemId,
      'text': text,
      if (parentCommentId != null && parentCommentId.isNotEmpty)
        'parentCommentId': parentCommentId,
    });
    final id = data['commentId'];
    return id is String ? id : null;
  }

  /// OFFICIAL restaurant reply. Merchant authorization is proven server-side;
  /// the public author is the RESTAURANT, never the acting merchant.
  Future<String?> replyToMenuComment({
    required String canonicalPlaceId,
    required String menuItemId,
    required String parentCommentId,
    required String text,
  }) async {
    final data = await _call('replyToRestaurantMenuComment', {
      'canonicalPlaceId': canonicalPlaceId,
      'menuItemId': menuItemId,
      'parentCommentId': parentCommentId,
      'text': text,
    });
    final id = data['commentId'];
    return id is String ? id : null;
  }

  // ── Restaurant post (server-authorized; no direct feed_posts write) ──────

  /// Publish a post AS THE RESTAURANT. Merchant membership is verified by the
  /// server through the trusted read-only merchant authorization bridge.
  Future<RestaurantPostResult> createRestaurantPost({
    required String canonicalPlaceId,
    required String text,
    List<String> imageUrls = const [],
    String? emoji,
  }) async {
    final data = await _call('createRestaurantPost', {
      'canonicalPlaceId': canonicalPlaceId,
      'text': text,
      if (imageUrls.isNotEmpty) 'imageUrls': imageUrls,
      if (emoji != null && emoji.isNotEmpty) 'emoji': emoji,
    });
    return RestaurantPostResult(
      postId: data['postId'] is String ? data['postId'] as String : null,
      restaurantId:
          data['restaurantId'] is String ? data['restaurantId'] as String : null,
    );
  }
}

class RestaurantPostResult {
  const RestaurantPostResult({this.postId, this.restaurantId});

  final String? postId;

  /// The canonical restaurant identity the server actually published under.
  final String? restaurantId;
}

class RestaurantEngagementException implements Exception {
  const RestaurantEngagementException(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => message;
}
