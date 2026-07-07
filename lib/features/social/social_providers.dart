import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/services/social_service.dart';
import 'food_profile.dart';

final socialServiceProvider = Provider<SocialService>(
  (ref) => SocialService(firebaseReady: ref.watch(firebaseReadyProvider)),
);

/// Feed awam (bukan grup), 50 siaran terkini.
/// Post soft-deleted (status=deleted) ditapis di client - tidak muncul.
final publicFeedProvider =
    StreamProvider<List<FeedPostData>>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(const []);
  return FirebaseFirestore.instance
      .collection('feed_posts')
      .where('groupId', isNull: true)
      .orderBy('createdAt', descending: true)
      .limit(60)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => FeedPostData(id: d.id, data: d.data()))
          .where((p) => p.data['status'] != 'deleted')
          .take(50)
          .toList());
});

/// Feed "Following": siaran daripada pengguna yang saya ikut.
/// Firestore `in` had 30 - ambil 30 pertama yang diikuti.
final followingFeedProvider =
    StreamProvider.autoDispose<List<FeedPostData>>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(const []);
  final ids = ref.watch(myFollowingIdsProvider).value ?? const {};
  if (ids.isEmpty) return Stream.value(const []);
  final slice = ids.take(30).toList();
  return FirebaseFirestore.instance
      .collection('feed_posts')
      .where('authorUid', whereIn: slice)
      .orderBy('createdAt', descending: true)
      .limit(60)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => FeedPostData(id: d.id, data: d.data()))
          .where((p) =>
              p.data['status'] != 'deleted' &&
              p.data['groupId'] == null &&
              p.data['visibility'] != 'private')
          .take(50)
          .toList());
});

/// Feed "Trending": siaran awam paling banyak like.
final trendingFeedProvider =
    StreamProvider.autoDispose<List<FeedPostData>>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(const []);
  return FirebaseFirestore.instance
      .collection('feed_posts')
      .where('groupId', isNull: true)
      .orderBy('likeCount', descending: true)
      .limit(50)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => FeedPostData(id: d.id, data: d.data()))
          .where((p) =>
              p.data['status'] != 'deleted' &&
              (p.data['visibility'] == null ||
                  p.data['visibility'] == 'public') &&
              ((p.data['likeCount'] as num?)?.toInt() ?? 0) > 0)
          .take(40)
          .toList());
});

/// Post saya (My Posts) - termasuk soft-deleted disembunyikan di UI.
final myPostsProvider =
    StreamProvider.autoDispose<List<FeedPostData>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('feed_posts')
      .where('authorUid', isEqualTo: uid)
      .orderBy('createdAt', descending: true)
      .limit(60)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => FeedPostData(id: d.id, data: d.data()))
          .where((p) => p.data['status'] != 'deleted')
          .toList());
});

/// Siaran awam seseorang (untuk profil makanan orang lain).
final userPublicPostsProvider = StreamProvider.autoDispose
    .family<List<FeedPostData>, String>((ref, targetUid) {
  if (!ref.watch(firebaseReadyProvider) || targetUid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('feed_posts')
      .where('authorUid', isEqualTo: targetUid)
      .orderBy('createdAt', descending: true)
      .limit(60)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => FeedPostData(id: d.id, data: d.data()))
          .where((p) =>
              p.data['status'] != 'deleted' &&
              p.data['groupId'] == null &&
              (p.data['visibility'] == null ||
                  p.data['visibility'] == 'public' ||
                  p.data['visibility'] == 'followers_only'))
          .take(40)
          .toList());
});

/// Komen saya (My Comments) via collection-group.
final myCommentsProvider =
    StreamProvider.autoDispose<List<FeedPostData>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collectionGroup('comments')
      .where('authorUid', isEqualTo: uid)
      .limit(60)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => FeedPostData(
                id: d.id,
                data: {
                  ...d.data(),
                  'postId': d.reference.parent.parent?.id ?? '',
                },
              ))
          .where((c) => c.data['status'] != 'deleted')
          .toList());
});

/// Feed satu grup.
final groupFeedProvider = StreamProvider.autoDispose
    .family<List<FeedPostData>, String>((ref, groupId) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(const []);
  return FirebaseFirestore.instance
      .collection('feed_posts')
      .where('groupId', isEqualTo: groupId)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => FeedPostData(id: d.id, data: d.data()))
          .toList());
});

/// Semua grup komuniti (50 terbaru).
final allGroupsProvider =
    StreamProvider<List<FeedPostData>>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(const []);
  return FirebaseFirestore.instance
      .collection('groups')
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => FeedPostData(id: d.id, data: d.data()))
          .toList());
});

/// ID grup yang pengguna semasa sertai.
final myGroupIdsProvider = StreamProvider<Set<String>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const {});
  }
  return FirebaseFirestore.instance
      .collectionGroup('members')
      .where('uid', isEqualTo: uid)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => d.reference.parent.parent?.id ?? '')
          .where((id) => id.isNotEmpty)
          .toSet());
});

/// Komen sesebuah post (100 terawal, susunan kronologi).
final commentsProvider = StreamProvider.autoDispose
    .family<List<FeedPostData>, String>((ref, postId) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(const []);
  return FirebaseFirestore.instance
      .collection('feed_posts')
      .doc(postId)
      .collection('comments')
      .orderBy('createdAt', descending: false)
      .limit(100)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => FeedPostData(id: d.id, data: d.data()))
          .where((c) => c.data['status'] != 'deleted')
          .toList());
});

/// Dokumen users/{uid} penuh pengguna semasa (nama, username, photoUrl).
final myUserDocProvider = StreamProvider<Map<String, dynamic>?>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(null);
  }
  return FirebaseFirestore.instance
      .collection('users')
      .doc(uid)
      .snapshots()
      .map((snap) => snap.data());
});

/// Nama paparan pengguna semasa (untuk komen).
final myDisplayNameProvider = StreamProvider<String>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value('Foodie');
  }
  return FirebaseFirestore.instance
      .collection('users')
      .doc(uid)
      .snapshots()
      .map((snap) {
    final name = snap.data()?['displayName'] as String?;
    if (name != null && name.isNotEmpty) return name;
    final email = snap.data()?['email'] as String? ?? '';
    return email.contains('@') ? email.split('@')[0] : 'Foodie';
  });
});

/// Pembalut ringkas dokumen Firestore (id + data).
class FeedPostData {
  const FeedPostData({required this.id, required this.data});

  final String id;
  final Map<String, dynamic> data;
}
