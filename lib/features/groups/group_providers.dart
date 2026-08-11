import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../social/social_providers.dart';

/// Model ringkas grup (groups/{id}).
class GroupData {
  const GroupData({required this.id, required this.data});
  final String id;
  final Map<String, dynamic> data;

  String get name => data['name'] as String? ?? '';
  String get emoji => data['emoji'] as String? ?? '🍜';
  // HOTFIX 4.5C: metadata imej KANONIK = imagePath (objek Storage), BUKAN URL
  // kekal. URL diselesaikan jangka-pendek melalui getGroupImageUrlV2 (resolver).
  // hasImage memandu label/kawalan UI (Upload vs Change + butang Remove).
  String? get imagePath {
    final p = data['imagePath'] as String?;
    return (p != null && p.isNotEmpty) ? p : null;
  }

  bool get hasImage => imagePath != null;
  String? get imageVersion => data['imageVersion'] as String?;

  // Legasi 4.5 (URL kekal) — dikekalkan HANYA untuk kompat model; UI V2 guna
  // resolver + imagePath. Dibersihkan oleh finalize/removeGroupImageV2.
  String? get imageUrl {
    final u = data['imageUrl'] as String?;
    return (u != null && u.isNotEmpty) ? u : null;
  }
  String get description => data['description'] as String? ?? '';
  String get privacy => data['privacy'] as String? ?? 'public';
  String get ownerUid => data['ownerUid'] as String? ?? '';
  int get memberCount => (data['memberCount'] as num?)?.toInt() ?? 0;
  String? get pinnedPlaceId => data['pinnedPlaceId'] as String?;
  String? get pinnedPlaceName => data['pinnedPlaceName'] as String?;
  String? get pinnedAnnouncement => data['pinnedAnnouncement'] as String?;
  // FIX 3: status kitaran hayat (active|deleted). Legasi tanpa status = aktif.
  String get status => data['status'] as String? ?? 'active';
  bool get isDeleted => status == 'deleted';
  bool get isPrivate => privacy == 'private';
}

/// HOTFIX 4.5C: RESOLVER imej grup (signed GET jangka pendek melalui callable
/// getGroupImageUrlV2). Pulangkan URL sementara atau null (tiada imej / tanpa
/// kebenaran → GroupAvatar fallback emoji, TIADA ikon rosak).
///
/// Watch uid → RE-RESOLVE pada tukar akaun (Part 21): akaun lama TIDAK boleh
/// resolve imej grup peribadi selepas logout/switch. autoDispose + keepAlive
/// bertimer → URL sah DI-CACHE (tiada re-resolve setiap rebuild) tetapi disegar
/// berkala di bawah TTL server (Part 26, elak N+1 storm).
final groupImageUrlProvider =
    FutureProvider.autoDispose.family<String?, String>((ref, groupId) async {
  final uid = ref.watch(currentUidProvider);
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty || groupId.isEmpty) {
    return null;
  }
  final link = ref.keepAlive();
  final timer = Timer(const Duration(minutes: 20), link.close);
  ref.onDispose(timer.cancel);
  try {
    return await ref.read(socialServiceProvider).getGroupImageUrl(groupId);
  } catch (_) {
    return null; // degrade selamat → emoji
  }
});

/// HOTFIX 4.6: token jemputan tertunda — disimpan bila pengguna membuka pautan
/// /invite/{token} tetapi BELUM log masuk. Selepas auth, aliran log-masuk boleh
/// menggunakannya untuk menyambung semula pratonton jemputan (Part 14).
final pendingInviteTokenProvider = StateProvider<String?>((ref) => null);

/// HOTFIX 4.6A: destinasi selepas auth berjaya. Jika ada token jemputan
/// tertunda → SAMBUNG ke pratonton (/invite/{token}); pengguna tetap perlu tekan
/// Join secara eksplisit (TIADA auto-join). Jika tiada → home/onboarding.
/// Token TIDAK dikosongkan di sini — pratonton yang mengendali keadaan terminal.
String postAuthRoute(WidgetRef ref, {required bool onboardingDone}) {
  final t = ref.read(pendingInviteTokenProvider);
  if (t != null && t.isNotEmpty) return '/invite/$t';
  return onboardingDone ? RoutePaths.home : RoutePaths.onboarding;
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
      .map((snap) => snap.exists ? (snap.data()?['role'] as String?) : null)
      // HOTFIX 4.3: baca doc member sendiri DITOLAK rules untuk non-member
      // (member-doc read = isGroupMember). Group Hub kini tentukan keahlian
      // dari myGroupIdsProvider dan hanya watch provider ini dalam cabang
      // MEMBER — tetapi degrade selamat (null) jika di-watch dlm edge/transient
      // supaya tiada AsyncError permission-denied bocor ke UI.
      .handleError((Object _) {});
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

/// Bil Tong-Tong milik grup ini (yang SAYA sertai).
///
/// FIX SP5: query `where(groupId)` sahaja DITOLAK rules Firestore
/// (rule baca = `auth.uid in participantUids`, tidak boleh dibuktikan
/// dari kekangan query itu) — ini punca skrin merah permission-denied.
/// Guna corak sama seperti myBillsProvider yang memang berfungsi
/// (arrayContains uid → rule dipenuhi), kemudian tapis groupId di
/// client. Privasi kekal: hanya bil yang saya peserta boleh dibaca.
final groupBillsProvider = StreamProvider.autoDispose
    .family<List<(String, Map<String, dynamic>)>, String>((ref, groupId) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) ||
      groupId.isEmpty ||
      uid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('group_bills')
      .where('participantUids', arrayContains: uid)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => (d.id, d.data()))
          .where((b) => b.$2['groupId'] == groupId)
          .toList())
      // Jangan sekali-kali runtuhkan UI hub kerana satu stream gagal.
      .handleError((Object _) {});
});

/// Semua grup untuk teroka (Group tab).
final discoverGroupsProvider =
    StreamProvider<List<GroupData>>((ref) {
  // FIX 3.1R (defek dikesan QA dua-akaun): WATCH uid semasa supaya provider
  // RE-SUBSCRIBE bila tukar akaun (logout→login). Tanpa ini, provider ini
  // (non-autoDispose, hanya watch firebaseReady) TIDAK dibina semula pada
  // pertukaran auth; strim lama fire dalam window token auth belum propagate
  // → permission-denied, lalu error itu DI-CACHE sampai app di-restart (tab
  // switch pun tak clear). Corak sama authRepositoryProvider/favoritesProvider
  // /myGroupIdsProvider — semua provider berskop-auth mesti watch uid.
  final uid = ref.watch(currentUidProvider);
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const []);
  }
  // FIX 3: discovery HANYA grup AWAM (rules: doc peribadi = ahli sahaja, jadi
  // list query WAJIB ditapis public). Grup dipadam (status=='deleted')
  // ditapis di klien — grup legasi tanpa status kekal dipapar (kompat).
  return FirebaseFirestore.instance
      .collection('groups')
      .where('privacy', isEqualTo: 'public')
      .orderBy('createdAt', descending: true)
      .limit(60)
      .snapshots()
      .map((snap) => snap.docs
          .map((d) => GroupData(id: d.id, data: d.data()))
          .where((g) => g.data['status'] != 'deleted')
          .toList())
      // FIX 3.1R: jangan runtuhkan SELURUH Groups tab (My Groups + jemputan)
      // kerana satu deny sekejap semasa peralihan auth — degrade dgn selamat
      // (idiom sama groupBillsProvider). Strim segar pada auth settle pulih.
      .handleError((Object _) {});
});

/// FIX 3: jemputan grup TERTUNDA untuk saya (penerima). Baca dibenarkan rules
/// (inviteeUid == uid). Guna untuk lencana + skrin "Jemputan".
class GroupInvite {
  const GroupInvite({required this.id, required this.data});
  final String id;
  final Map<String, dynamic> data;
  String get groupId => data['groupId'] as String? ?? '';
  String get groupName => data['groupName'] as String? ?? '';
  String get groupEmoji => data['groupEmoji'] as String? ?? '🍜';
  String get inviterUid => data['inviterUid'] as String? ?? '';
  String get status => data['status'] as String? ?? 'pending';
}

final myGroupInvitesProvider =
    StreamProvider.autoDispose<List<GroupInvite>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('group_invites')
      .where('inviteeUid', isEqualTo: uid)
      .where('status', isEqualTo: 'pending')
      .limit(50)
      .snapshots()
      .map((snap) =>
          snap.docs.map((d) => GroupInvite(id: d.id, data: d.data())).toList());
});
