import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/services/social_service.dart';
import 'food_profile.dart';

final socialServiceProvider = Provider<SocialService>(
  (ref) => SocialService(firebaseReady: ref.watch(firebaseReadyProvider)),
);

/// PRIVASI (Social 1.1): post auto lama ("makan kat ...") yang dicipta
/// tanpa persetujuan/visibility TIDAK lagi dipapar di permukaan awam —
/// hanya penulisnya sendiri boleh nampak. Backend baharu sudah berhenti
/// mencipta post sebegini; backfill Firestore penuh = Social Prompt 8.
bool _legacyAutoHidden(Map<String, dynamic> data, String myUid) =>
    data['type'] == 'auto' &&
    (myUid.isEmpty || data['authorUid'] != myUid);

/// Feed awam (bukan grup), 50 siaran terkini.
/// SP9.2B: query HANYA visibility=='public' — followers_only kini
/// owner-only di rules (query luas akan gagal jika pulangkan doc yang
/// rules tolak). Post soft-deleted ditapis di client.
final publicFeedProvider =
    StreamProvider<List<FeedPostData>>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(const []);
  final myUid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  return FirebaseFirestore.instance
      .collection('feed_posts')
      .where('visibility', isEqualTo: 'public')
      .orderBy('createdAt', descending: true)
      .limit(60)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => FeedPostData(id: d.id, data: d.data(), pending: d.metadata.hasPendingWrites))
          .where((p) =>
              p.data['status'] != 'deleted' &&
              p.data['groupId'] == null &&
              !_legacyAutoHidden(p.data, myUid))
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
  final myUid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  final slice = ids.take(30).toList();
  // SP9.2B: semasa beta, following feed HANYA post public dari orang
  // diikut (followers_only dimatikan → owner-only; query luas gagal).
  return FirebaseFirestore.instance
      .collection('feed_posts')
      .where('authorUid', whereIn: slice)
      .where('visibility', isEqualTo: 'public')
      .orderBy('createdAt', descending: true)
      .limit(60)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => FeedPostData(id: d.id, data: d.data(), pending: d.metadata.hasPendingWrites))
          .where((p) =>
              p.data['status'] != 'deleted' &&
              p.data['groupId'] == null &&
              !_legacyAutoHidden(p.data, myUid))
          .take(50)
          .toList());
});

/// Feed "Trending": siaran awam paling banyak like.
final trendingFeedProvider =
    StreamProvider.autoDispose<List<FeedPostData>>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(const []);
  final myUid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  // SP9.2B: query visibility=='public' (bukan groupId null) — selari
  // rules; followers_only owner-only tidak dipulangkan.
  return FirebaseFirestore.instance
      .collection('feed_posts')
      .where('visibility', isEqualTo: 'public')
      .orderBy('likeCount', descending: true)
      .limit(50)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => FeedPostData(id: d.id, data: d.data(), pending: d.metadata.hasPendingWrites))
          .where((p) =>
              p.data['status'] != 'deleted' &&
              p.data['groupId'] == null &&
              !_legacyAutoHidden(p.data, myUid) &&
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
          .map((d) => FeedPostData(id: d.id, data: d.data(), pending: d.metadata.hasPendingWrites))
          .where((p) => p.data['status'] != 'deleted')
          .toList());
});

/// Siaran awam seseorang (untuk profil makanan orang lain).
final userPublicPostsProvider = StreamProvider.autoDispose
    .family<List<FeedPostData>, String>((ref, targetUid) {
  if (!ref.watch(firebaseReadyProvider) || targetUid.isEmpty) {
    return Stream.value(const []);
  }
  final myUid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  final isOwnProfile = myUid.isNotEmpty && myUid == targetUid;
  final base = FirebaseFirestore.instance
      .collection('feed_posts')
      .where('authorUid', isEqualTo: targetUid);
  // SP9.2B: profil ORANG LAIN → HANYA public (followers_only kini
  // owner-only; private/group_only tak pernah bocor). Profil SENDIRI →
  // semua post sendiri bukan-grup (rules benarkan pemilik).
  final query = isOwnProfile
      ? base.where('groupId', isNull: true)
      : base.where('visibility', isEqualTo: 'public');
  return query
      .orderBy('createdAt', descending: true)
      .limit(60)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => FeedPostData(id: d.id, data: d.data(), pending: d.metadata.hasPendingWrites))
          .where((p) =>
              p.data['status'] != 'deleted' &&
              (isOwnProfile || p.data['groupId'] == null) &&
              !_legacyAutoHidden(p.data, myUid))
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
                pending: d.metadata.hasPendingWrites,
              ))
          .where((c) => c.data['status'] != 'deleted')
          .toList());
});

/// ISSUE 005 (closeout keselamatan): balasan AWAM seseorang.
/// Senarai datang daripada indeks ID-SAHAJA public_reply_activity yang
/// dikekalkan Cloud Functions (tiada teks - entri basi tidak membocorkan
/// kandungan). Teks komen diambil per-item melalui GET, dan rules GET
/// menyemak induk SEMASA - induk yang bertukar private/hidden/deleted
/// ditolak serta-merta dan item DISKIP.
final userPublicRepliesProvider = StreamProvider.autoDispose
    .family<List<FeedPostData>, String>((ref, targetUid) {
  if (!ref.watch(firebaseReadyProvider) || targetUid.isEmpty) {
    return Stream.value(const []);
  }
  final db = FirebaseFirestore.instance;
  return db
      .collection('public_reply_activity')
      .where('authorUid', isEqualTo: targetUid)
      .where('active', isEqualTo: true)
      .limit(60)
      .snapshots()
      .asyncMap((snap) async {
    final out = <FeedPostData>[];
    for (final e in snap.docs.take(30)) {
      final postId = e.data()['postId'] as String? ?? '';
      final commentId = e.data()['commentId'] as String? ?? '';
      if (postId.isEmpty || commentId.isEmpty) continue;
      try {
        final c = await db
            .collection('feed_posts')
            .doc(postId)
            .collection('comments')
            .doc(commentId)
            .get();
        final d = c.data();
        if (d != null && d['status'] != 'deleted') {
          out.add(FeedPostData(
              id: c.id,
              data: {...d, 'postId': postId},
              pending: c.metadata.hasPendingWrites));
        }
      } catch (_) {
        // GET ditolak rules (induk tidak lagi boleh dibaca) -> skip.
      }
    }
    return out;
  });
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
          .map((d) => FeedPostData(id: d.id, data: d.data(), pending: d.metadata.hasPendingWrites))
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
          .map((d) => FeedPostData(id: d.id, data: d.data(), pending: d.metadata.hasPendingWrites))
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
          .map((d) => FeedPostData(id: d.id, data: d.data(), pending: d.metadata.hasPendingWrites))
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

/// Social Prompt 3: "Tak berminat" — post yang pengguna sorok.
/// Pilihan LOKAL sesi sahaja (tiada tulisan backend); kad runtuh kepada
/// tile kecil dengan butang buat asal. Reset bila app dilancar semula.
final hiddenPostIdsProvider =
    StateProvider<Set<String>>((ref) => const {});

/// Pembalut ringkas dokumen Firestore (id + data).
///
/// [pending]: `snapshot.metadata.hasPendingWrites` — benar hanya untuk tulisan
/// optimistik pengguna sendiri yang serverTimestamp-nya belum diselesaikan.
/// Digunakan supaya post BAHARU papar "baru tadi" manakala post lama/hilang
/// TIDAK (lihat [relativePostTime]).
class FeedPostData {
  const FeedPostData({
    required this.id,
    required this.data,
    this.pending = false,
  });

  final String id;
  final Map<String, dynamic> data;
  final bool pending;
}
