import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import 'post_media.dart';
import 'social_providers.dart';

/// Social Prompt 3: simpan/bookmark post.
///
/// V1 selamat: tulis HANYA ke subkoleksi sendiri
/// users/{uid}/saved_posts/{postId} (rules: owner sahaja).
/// TIADA kiraan saveCount global — itu perlu transaksi/Cloud Function,
/// jadi tidak dipalsukan di client.

/// Set ID post yang saya simpan (untuk state ikon bookmark).
final mySavedPostIdsProvider = StreamProvider<Set<String>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const {});
  }
  return FirebaseFirestore.instance
      .collection('users')
      .doc(uid)
      .collection('saved_posts')
      .snapshots()
      .map((snap) => snap.docs.map((d) => d.id).toSet())
      // Rules belum benarkan? Jangan runtuhkan UI — anggap tiada simpanan.
      .handleError((Object _) {});
});

/// Rujukan simpanan saya (terkini dahulu) untuk tab "Disimpan".
final mySavedRefsProvider =
    StreamProvider.autoDispose<List<FeedPostData>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('users')
      .doc(uid)
      .collection('saved_posts')
      .orderBy('createdAt', descending: true)
      .limit(60)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => FeedPostData(id: d.id, data: d.data(), pending: d.metadata.hasPendingWrites))
          .toList());
});

/// Post penuh secara live (untuk tab Disimpan + media viewer).
/// Rules Firestore kekal berkuat kuasa: post private orang lain akan
/// gagal dibaca — pemanggil mesti kendalikan error/null dengan mesra.
final postByIdProvider = StreamProvider.autoDispose
    .family<FeedPostData?, String>((ref, postId) {
  if (!ref.watch(firebaseReadyProvider) || postId.isEmpty) {
    return Stream.value(null);
  }
  return FirebaseFirestore.instance
      .collection('feed_posts')
      .doc(postId)
      .snapshots()
      .map((snap) {
    final data = snap.data();
    if (data == null || data['status'] == 'deleted') return null;
    return FeedPostData(
        id: snap.id, data: data, pending: snap.metadata.hasPendingWrites);
  });
});

/// Toggle simpan post. Pulangkan status baharu (true = disimpan).
/// Melempar jika tulis gagal (contoh: rules belum deploy) — UI mesti
/// tunjuk ralat jujur, BUKAN kejayaan palsu.
Future<bool> toggleSavePost(
  WidgetRef ref, {
  required String postId,
  required Map<String, dynamic> postData,
  required bool currentlySaved,
  String sourceScreen = 'feed',
}) async {
  final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
  if (uid.isEmpty) throw StateError('not signed in');
  final doc = FirebaseFirestore.instance
      .collection('users')
      .doc(uid)
      .collection('saved_posts')
      .doc(postId);
  if (currentlySaved) {
    await doc.delete().timeout(const Duration(seconds: 10));
  } else {
    await doc.set({
      'postId': postId,
      'postOwnerId': postData['authorUid'] ?? '',
      'createdAt': FieldValue.serverTimestamp(),
      'sourceScreen': sourceScreen,
    }).timeout(const Duration(seconds: 10));
  }
  ref.read(eventLoggerProvider).logEvent(
        currentlySaved ? EventType.postUnsaved : EventType.postSaved,
        sourceScreen: sourceScreen,
        metadata: postEventMetadata(postId, postData,
            sourceScreen: sourceScreen),
      );
  return !currentlySaved;
}
