import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/services/restaurant_engagement_service.dart';

/// WAVE 3D Gate 2 — READ-ONLY restaurant engagement state.
///
/// Every provider here only READS. All mutations go through
/// [RestaurantEngagementService] (Cloud Functions); Firestore rules deny client
/// writes to `restaurant_follows`, `restaurant_public` and `menu_comments`.

final restaurantEngagementServiceProvider =
    Provider<RestaurantEngagementService>(
  (ref) => const RestaurantEngagementService(),
);

/// Public follower COUNT for a restaurant.
///
/// Read from the server-maintained aggregate `restaurant_public/{canonicalId}`.
/// The follower UID LIST is never exposed: `restaurant_follows` rules only ever
/// allow a user to read their OWN follow document, so no client can enumerate
/// who follows a restaurant.
final restaurantFollowerCountProvider =
    StreamProvider.autoDispose.family<int, String>((ref, canonicalPlaceId) {
  // GATE 3F — UNRESOLVED is not ZERO. Emitting 0 here made an uninitialised
  // Firebase (or an absent target) indistinguishable from a restaurant that
  // genuinely has no followers, which is one of the ways the Follow surface
  // came to state a confident falsehood. An empty stream never produces a
  // value, so the provider stays in its loading state and the UI says so.
  if (!ref.watch(firebaseReadyProvider) || canonicalPlaceId.isEmpty) {
    return const Stream<int>.empty();
  }
  return FirebaseFirestore.instance
      .collection('restaurant_public')
      .doc(canonicalPlaceId)
      .snapshots()
      .map((snap) => (snap.data()?['followerCount'] as num?)?.toInt() ?? 0);
});

/// Is the CURRENT user following this restaurant?
///
/// Keyed on the signed-in uid as well as the restaurant, so a logout/login can
/// never surface the previous user's follow state from a cached provider — a
/// different uid is a different provider instance, and an empty uid resolves to
/// `false` without touching Firestore.
///
/// The query is `followerUid == me AND canonicalPlaceId == this`, which the
/// rules can prove (they require `followerUid == request.auth.uid`). It is used
/// in preference to reading the document by id so the client never has to
/// duplicate the server-side follow document-id scheme.
final myRestaurantFollowProvider = StreamProvider.autoDispose
    .family<bool, String>((ref, canonicalPlaceId) {
  // GATE 3F — an uninitialised Firebase or an unresolved restaurant means
  // nothing is known yet, so the provider must stay UNRESOLVED rather than
  // assert "not following". Checked before the auth read so a not-ready app
  // never touches FirebaseAuth at all.
  if (!ref.watch(firebaseReadyProvider) || canonicalPlaceId.isEmpty) {
    return const Stream<bool>.empty();
  }
  // A signed-OUT user, by contrast, genuinely follows nothing: `false` is a
  // true answer, reached without touching Firestore.
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (uid.isEmpty) {
    return Stream.value(false);
  }
  return FirebaseFirestore.instance
      .collection('restaurant_follows')
      .where('followerUid', isEqualTo: uid)
      .where('canonicalPlaceId', isEqualTo: canonicalPlaceId)
      .limit(1)
      .snapshots()
      .map((snap) => snap.docs.isNotEmpty);
});

/// Menu comments for an EXACT restaurant + EXACT menu item.
///
/// The `status == 'visible'` constraint is MANDATORY, not cosmetic: the
/// `menu_comments` rule allows a read only when the stored status is
/// `visible`, and a Firestore list query fails ENTIRELY if it could return a
/// document the rules reject. Without this constraint a single moderator-hidden
/// or removed comment would break the whole thread — the same lifecycle
/// contract Wave 3C/3D established for posts and post comments.
final menuCommentsProvider = StreamProvider.autoDispose
    .family<List<MenuCommentData>, MenuCommentTarget>((ref, target) {
  if (!ref.watch(firebaseReadyProvider) || !target.isValid) {
    return Stream.value(const <MenuCommentData>[]);
  }
  return FirebaseFirestore.instance
      .collection('menu_comments')
      .where('canonicalPlaceId', isEqualTo: target.canonicalPlaceId)
      .where('menuItemId', isEqualTo: target.menuItemId)
      .where('status', isEqualTo: kMenuCommentStatusVisible)
      .orderBy('createdAt', descending: false)
      .limit(100)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => MenuCommentData(id: d.id, data: d.data()))
          .toList(growable: false));
});

/// The only menu-comment lifecycle state a consumer surface may render.
/// Hidden / removed comments are excluded by the query above AND denied by
/// rules; nothing in the consumer path can display them.
const kMenuCommentStatusVisible = 'visible';

/// Identity of a menu-comment thread: an EXACT canonical restaurant + menu item.
class MenuCommentTarget {
  const MenuCommentTarget({
    required this.canonicalPlaceId,
    required this.menuItemId,
  });

  final String canonicalPlaceId;
  final String menuItemId;

  bool get isValid => canonicalPlaceId.isNotEmpty && menuItemId.isNotEmpty;

  @override
  bool operator ==(Object other) =>
      other is MenuCommentTarget &&
      other.canonicalPlaceId == canonicalPlaceId &&
      other.menuItemId == menuItemId;

  @override
  int get hashCode => Object.hash(canonicalPlaceId, menuItemId);
}

/// One `menu_comments` document as the UI sees it.
class MenuCommentData {
  const MenuCommentData({required this.id, required this.data});

  final String id;
  final Map<String, dynamic> data;

  /// Official restaurant reply (authorType == "restaurant").
  bool get isRestaurantReply => data['authorType'] == 'restaurant';

  /// Public author label. For a restaurant reply this is the RESTAURANT name;
  /// the acting merchant identity is never stored in the document at all.
  String get displayName {
    final snapshot = data['displayNameSnapshot'];
    if (snapshot is String && snapshot.trim().isNotEmpty) {
      return snapshot.trim();
    }
    return isRestaurantReply ? 'Restoran' : 'Foodie';
  }

  String get text => (data['text'] as String?)?.trim() ?? '';

  /// Flat threading: the parent this comment replies to, if any. The backend
  /// contract is a FLAT collection with a single parent link — no deep nesting.
  String? get parentCommentId {
    final parent = data['parentCommentId'];
    return parent is String && parent.isNotEmpty ? parent : null;
  }

  bool get isRootComment => parentCommentId == null;
}
