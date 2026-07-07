import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// Model ringkas grup (groups/{id}).
class GroupData {
  const GroupData({required this.id, required this.data});
  final String id;
  final Map<String, dynamic> data;

  String get name => data['name'] as String? ?? '';
  String get emoji => data['emoji'] as String? ?? '🍜';
  String get description => data['description'] as String? ?? '';
  String get privacy => data['privacy'] as String? ?? 'public';
  String get ownerUid => data['ownerUid'] as String? ?? '';
  int get memberCount => (data['memberCount'] as num?)?.toInt() ?? 0;
  String? get pinnedPlaceId => data['pinnedPlaceId'] as String?;
  String? get pinnedPlaceName => data['pinnedPlaceName'] as String?;
  String? get pinnedAnnouncement => data['pinnedAnnouncement'] as String?;
}

/// Satu grup (live).
final groupProvider =
    StreamProvider.autoDispose.family<GroupData?, String>((ref, groupId) {
  if (!ref.watch(firebaseReadyProvider) || groupId.isEmpty) {
    return Stream.value(null);
  }
  return FirebaseFirestore.instance
      .collection('groups')
      .doc(groupId)
      .snapshots()
      .map((snap) =>
          snap.exists ? GroupData(id: snap.id, data: snap.data()!) : null);
});

/// Ahli grup (dengan peranan).
final groupMembersProvider = StreamProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>((ref, groupId) {
  if (!ref.watch(firebaseReadyProvider) || groupId.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('groups')
      .doc(groupId)
      .collection('members')
      .limit(200)
      .snapshots()
      .map((snap) => snap.docs.map((d) => d.data()).toList());
});

/// Peranan saya dalam grup (owner|admin|member|viewer|null).
final myGroupRoleProvider =
    StreamProvider.autoDispose.family<String?, String>((ref, groupId) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty || groupId.isEmpty) {
    return Stream.value(null);
  }
  return FirebaseFirestore.instance
      .collection('groups')
      .doc(groupId)
      .collection('members')
      .doc(uid)
      .snapshots()
      .map((snap) => snap.exists ? (snap.data()?['role'] as String?) : null);
});

/// Undian dalam grup (terbaru dulu).
final groupPollsProvider = StreamProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>((ref, groupId) {
  if (!ref.watch(firebaseReadyProvider) || groupId.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('groups')
      .doc(groupId)
      .collection('polls')
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .map((snap) =>
          snap.docs.map((d) => {'id': d.id, ...d.data()}).toList());
});

/// Undi saya untuk satu poll (optionKey atau null).
final myPollVoteProvider = StreamProvider.autoDispose
    .family<String?, ({String groupId, String pollId})>((ref, arg) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(null);
  }
  return FirebaseFirestore.instance
      .collection('groups')
      .doc(arg.groupId)
      .collection('polls')
      .doc(arg.pollId)
      .collection('votes')
      .doc(uid)
      .snapshots()
      .map((snap) =>
          snap.exists ? (snap.data()?['optionKey'] as String?) : null);
});

/// Status makan dikongsi ahli grup.
final groupStatusProvider = StreamProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>((ref, groupId) {
  if (!ref.watch(firebaseReadyProvider) || groupId.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('groups')
      .doc(groupId)
      .collection('status')
      .limit(100)
      .snapshots()
      .map((snap) => snap.docs.map((d) => d.data()).toList());
});

/// Bil Tong-Tong milik grup ini.
final groupBillsProvider = StreamProvider.autoDispose
    .family<List<(String, Map<String, dynamic>)>, String>((ref, groupId) {
  if (!ref.watch(firebaseReadyProvider) || groupId.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('group_bills')
      .where('groupId', isEqualTo: groupId)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .map((snap) => snap.docs.map((d) => (d.id, d.data())).toList());
});

/// Semua grup untuk teroka (Group tab).
final discoverGroupsProvider =
    StreamProvider<List<GroupData>>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(const []);
  return FirebaseFirestore.instance
      .collection('groups')
      .orderBy('createdAt', descending: true)
      .limit(60)
      .snapshots()
      .map((snap) =>
          snap.docs.map((d) => GroupData(id: d.id, data: d.data())).toList());
});
