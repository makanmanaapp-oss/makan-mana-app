import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// Profil makanan awam pengguna (public_profiles/{uid}).
class FoodProfile {
  const FoodProfile({
    required this.uid,
    required this.displayName,
    this.username,
    this.photoUrl,
    this.avatarPreset,
    this.bio = '',
    this.favouriteFood = '',
    this.favouriteCuisine = '',
    this.foodMood = '',
    this.dietPreference = '',
    this.budgetRange = '',
    this.showDiet = false,
    this.showBudget = false,
    this.followersCount = 0,
    this.followingCount = 0,
    this.postsCount = 0,
    this.reviewsCount = 0,
    this.exists = false,
  });

  final String uid;
  final String displayName;
  final String? username;
  final String? photoUrl;

  /// SP10: avatar default bertema MakanMana (fallback bila tiada photo).
  final String? avatarPreset;
  final String bio;
  final String favouriteFood;
  final String favouriteCuisine;
  final String foodMood;
  final String dietPreference;
  final String budgetRange;
  final bool showDiet;
  final bool showBudget;
  final int followersCount;
  final int followingCount;
  final int postsCount;
  final int reviewsCount;

  /// ISSUE 004: true hanya bila dokumen public_profiles benar-benar wujud.
  /// Penyelesai identiti live memerlukan ini untuk membezakan "profil hidup"
  /// daripada nilai lalai 'Foodie' (yang TIDAK boleh menimpa snapshot).
  final bool exists;

  static FoodProfile fromMap(String uid, Map<String, dynamic>? m) {
    final docExists = m != null && m.isNotEmpty;
    m ??= const {};
    return FoodProfile(
      uid: uid,
      displayName: (m['displayName'] as String?)?.trim().isNotEmpty == true
          ? m['displayName'] as String
          : 'Foodie',
      username: m['username'] as String?,
      photoUrl: m['photoUrl'] as String?,
      avatarPreset: m['avatarPreset'] as String?,
      bio: m['bio'] as String? ?? '',
      favouriteFood: m['favouriteFood'] as String? ?? '',
      favouriteCuisine: m['favouriteCuisine'] as String? ?? '',
      foodMood: m['foodMood'] as String? ?? '',
      dietPreference: m['dietPreference'] as String? ?? '',
      budgetRange: m['budgetRange'] as String? ?? '',
      showDiet: m['showDiet'] as bool? ?? false,
      showBudget: m['showBudget'] as bool? ?? false,
      followersCount: (m['followersCount'] as num?)?.toInt() ?? 0,
      followingCount: (m['followingCount'] as num?)?.toInt() ?? 0,
      postsCount: (m['postsCount'] as num?)?.toInt() ?? 0,
      reviewsCount: (m['reviewsCount'] as num?)?.toInt() ?? 0,
      exists: docExists,
    );
  }
}

/// Profil awam seseorang (live).
final publicProfileProvider = StreamProvider.autoDispose
    .family<FoodProfile, String>((ref, uid) {
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(FoodProfile.fromMap(uid, null));
  }
  return FirebaseFirestore.instance
      .collection('public_profiles')
      .doc(uid)
      .snapshots()
      .map((snap) => FoodProfile.fromMap(uid, snap.data()));
});

/// Adakah saya ikut [targetUid]?
final isFollowingProvider =
    StreamProvider.autoDispose.family<bool, String>((ref, targetUid) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty || targetUid.isEmpty) {
    return Stream.value(false);
  }
  return FirebaseFirestore.instance
      .collection('follows')
      .doc('${uid}_$targetUid')
      .snapshots()
      .map((snap) => snap.exists);
});

/// Senarai pengikut seseorang (uid pengikut).
final followersProvider =
    StreamProvider.autoDispose.family<List<String>, String>((ref, uid) {
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('follows')
      .where('followingUid', isEqualTo: uid)
      .orderBy('createdAt', descending: true)
      .limit(200)
      .snapshots()
      .map((snap) =>
          snap.docs.map((d) => d.data()['followerUid'] as String).toList());
});

/// Senarai yang diikuti seseorang.
final followingProvider =
    StreamProvider.autoDispose.family<List<String>, String>((ref, uid) {
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('follows')
      .where('followerUid', isEqualTo: uid)
      .orderBy('createdAt', descending: true)
      .limit(200)
      .snapshots()
      .map((snap) =>
          snap.docs.map((d) => d.data()['followingUid'] as String).toList());
});

/// Uid yang saya ikut (untuk tab "Following" & cadangan).
final myFollowingIdsProvider = StreamProvider<Set<String>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const {});
  }
  return FirebaseFirestore.instance
      .collection('follows')
      .where('followerUid', isEqualTo: uid)
      .limit(200)
      .snapshots()
      .map((snap) =>
          snap.docs.map((d) => d.data()['followingUid'] as String).toSet());
});

/// Uid yang saya blok (untuk tapis feed & interaksi).
final myBlockedIdsProvider = StreamProvider<Set<String>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const {});
  }
  return FirebaseFirestore.instance
      .collection('blocks')
      .where('blockerUid', isEqualTo: uid)
      .limit(200)
      .snapshots()
      .map((snap) =>
          snap.docs.map((d) => d.data()['blockedUid'] as String).toSet());
});

/// Uid yang saya senyapkan (mute).
final myMutedIdsProvider = StreamProvider<Set<String>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const {});
  }
  return FirebaseFirestore.instance
      .collection('mutes')
      .where('muterUid', isEqualTo: uid)
      .limit(200)
      .snapshots()
      .map((snap) =>
          snap.docs.map((d) => d.data()['mutedUid'] as String).toSet());
});
