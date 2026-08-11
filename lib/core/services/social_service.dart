import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../constants/app_constants.dart';

/// Servis Feed Makan v2: post status/gambar, like, grup komuniti.
class SocialService {
  SocialService({required this.firebaseReady});

  final bool firebaseReady;

  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  /// Upload gambar ke Storage dan pulangkan URL muat turun.
  /// Had masa supaya UI tidak tergantung bila rangkaian bermasalah.
  /// (Dikongsi oleh feed dan sistem rating.)
  Future<String> uploadImage(String uid, File image, {int index = 0}) async {
    final ref = FirebaseStorage.instance.ref(
      'feed_images/$uid/${DateTime.now().millisecondsSinceEpoch}_$index.jpg',
    );
    await ref
        .putFile(image, SettableMetadata(contentType: 'image/jpeg'))
        .timeout(const Duration(seconds: 45));
    return ref.getDownloadURL().timeout(const Duration(seconds: 10));
  }

  /// SP8: upload berbilang gambar (maks 6) secara berurutan dengan
  /// callback kemajuan. Jika satu gagal, fail yang SUDAH dimuat naik
  /// dibersihkan (best-effort) dan ralat dilempar — tiada post separuh.
  Future<List<String>> uploadImages(
    String uid,
    List<File> images, {
    void Function(int done, int total)? onProgress,
  }) async {
    final urls = <String>[];
    for (var i = 0; i < images.length; i++) {
      try {
        urls.add(await uploadImage(uid, images[i], index: i));
        onProgress?.call(i + 1, images.length);
      } catch (e) {
        for (final u in urls) {
          try {
            await FirebaseStorage.instance.refFromURL(u).delete();
          } catch (_) {}
        }
        rethrow;
      }
    }
    return urls;
  }

  /// Cipta siaran (teks dan/atau gambar; groupId untuk siaran grup).
  /// [visibility]: public | followers_only | group_only | private | unlisted.
  /// [postType]: food_post | meal_review | suggestion_result | budget_insight |
  ///             group_poll | group_result | meal_wallet_share | status |
  ///             checkin (Social Prompt 4).
  /// Pulangkan postId (untuk pautkan meal history check-in).
  Future<String?> createPost({
    required String uid,
    String text = '',
    File? image,
    // SP8: multi-gambar (1-6). Jika diberi, [image] diabaikan.
    List<File>? images,
    void Function(int done, int total)? onUploadProgress,
    String? groupId,
    String visibility = 'public',
    String postType = 'food_post',
    Map<String, dynamic>? payload,
    String? placeId,
    String? placeName,
    // Medan check-in (Social Prompt 4) — hanya dihantar bila diberi.
    String? areaLabel,
    String? menuName,
    double? totalSpend,
    int? userRating,
    List<String>? moodTags,
  }) async {
    var imageUrls = const <String>[];
    final files = (images != null && images.isNotEmpty)
        ? images.take(6).toList()
        : (image != null ? [image] : const <File>[]);
    if (files.isNotEmpty) {
      imageUrls = await uploadImages(uid, files, onProgress: onUploadProgress);
    }
    final imageUrl = imageUrls.isNotEmpty ? imageUrls.first : '';
    final res = await _functions
        .httpsCallable(
          'createFeedPost',
          options:
              HttpsCallableOptions(timeout: const Duration(seconds: 20)),
        )
        .call<Map>({
      'text': text,
      'imageUrl': imageUrl,
      if (imageUrls.isNotEmpty) 'imageUrls': imageUrls,
      'groupId': groupId ?? '',
      'visibility': visibility,
      'postType': postType,
      if (payload != null) 'payload': payload,
      if (placeId != null) 'placeId': placeId,
      if (placeName != null) 'placeName': placeName,
      if (areaLabel != null) 'areaLabel': areaLabel,
      if (menuName != null) 'menuName': menuName,
      if (totalSpend != null) 'totalSpend': totalSpend,
      if (userRating != null) 'userRating': userRating,
      if (moodTags != null && moodTags.isNotEmpty) 'moodTags': moodTags,
    });
    return res.data['postId'] as String?;
  }

  /// SP8: repost / quote repost — SEMUA validasi privasi di pelayan
  /// (repostFeedPost); client hanya pra-semak untuk UX.
  Future<String?> repostPost({
    required String originalPostId,
    String mode = 'repost',
    String text = '',
    String visibility = 'public',
    String? groupId,
  }) async {
    final res = await _fn('repostFeedPost', {
      'originalPostId': originalPostId,
      'mode': mode,
      'text': text,
      'visibility': visibility,
      if (groupId != null) 'groupId': groupId,
    });
    return res['postId'] as String?;
  }

  // ---------------- V4 Social: follow / mute / block / report ----------------

  Future<bool> followUser(String targetUid) async {
    final res = await _fn('followUser', {'targetUid': targetUid});
    return (res['following'] as bool?) ?? true;
  }

  Future<bool> unfollowUser(String targetUid) async {
    final res = await _fn('unfollowUser', {'targetUid': targetUid});
    return (res['following'] as bool?) ?? false;
  }

  Future<void> muteUser(String targetUid, {bool mute = true}) =>
      _fn('muteUser', {'targetUid': targetUid, 'mute': mute});

  Future<void> blockUser(String targetUid, {bool block = true}) =>
      _fn('blockUser', {'targetUid': targetUid, 'block': block});

  Future<void> reportContent({
    required String targetType,
    String? targetId,
    String? targetUid,
    String reason = '',
  }) =>
      _fn('reportContent', {
        'targetType': targetType,
        if (targetId != null) 'targetId': targetId,
        if (targetUid != null) 'targetUid': targetUid,
        'reason': reason,
      });

  Future<void> updateFoodProfile(Map<String, dynamic> data) =>
      _fn('updateFoodProfile', data);

  // ---------------- V4 Group Hub ----------------

  Future<String?> createGroupV2({
    required String name,
    String emoji = '🍜',
    String description = '',
    String privacy = 'public',
  }) async {
    final res = await _fn('createGroupV2', {
      'name': name,
      'emoji': emoji,
      'description': description,
      'privacy': privacy,
    });
    return res['groupId'] as String?;
  }

  Future<void> joinGroupV2(String groupId) =>
      _fn('joinGroupV2', {'groupId': groupId});

  Future<void> leaveGroupV2(String groupId, String uid) =>
      _fn('removeGroupMember', {'groupId': groupId, 'targetUid': uid});

  Future<void> addGroupMember(String groupId, String targetUid,
          {String role = 'member'}) =>
      _fn('addGroupMember',
          {'groupId': groupId, 'targetUid': targetUid, 'role': role});

  Future<void> removeGroupMember(String groupId, String targetUid) =>
      _fn('removeGroupMember', {'groupId': groupId, 'targetUid': targetUid});

  Future<void> changeGroupRole(String groupId, String targetUid, String role) =>
      _fn('changeGroupRole',
          {'groupId': groupId, 'targetUid': targetUid, 'role': role});

  Future<void> updateGroupSettings(String groupId,
          {String? name, String? emoji, String? description, String? privacy}) =>
      _fn('updateGroupSettings', {
        'groupId': groupId,
        if (name != null) 'name': name,
        if (emoji != null) 'emoji': emoji,
        if (description != null) 'description': description,
        if (privacy != null) 'privacy': privacy,
      });

  // ---------------- HOTFIX 4.5C: Imej grup SERVER-MEDIATED V2 ----------------
  // Klien TIDAK menulis terus ke Storage (rules group_images=read,write:false).
  // Aliran: prepare (authz+signed PUT URL) → PUT bait → finalize (server sahkan
  // objek + commit imagePath). Baca: resolver signed GET jangka pendek.

  /// Minta kebenaran + signed PUT URL untuk objek imej grup ini.
  /// Pulangkan {uploadUrl, objectPath, assetId, expiresAt, contentType}.
  Future<Map<String, dynamic>> prepareGroupImageUpload(String groupId) =>
      _fn('prepareGroupImageUploadV2', {'groupId': groupId});

  /// Muat naik bait JPEG terus ke signed PUT URL (memintas Storage rules pada
  /// lapisan GCS). Content-Type MESTI sepadan dgn yang ditandatangani server.
  Future<void> putBytesToSignedUrl(
      String uploadUrl, File jpeg, String contentType) async {
    final bytes = await jpeg.readAsBytes();
    final client = HttpClient();
    try {
      final req = await client.putUrl(Uri.parse(uploadUrl));
      req.headers.set(HttpHeaders.contentTypeHeader, contentType);
      req.add(bytes);
      final resp = await req.close().timeout(const Duration(seconds: 60));
      await resp.drain<void>();
      if (resp.statusCode < 200 || resp.statusCode >= 300) {
        throw Exception('Signed upload failed: HTTP ${resp.statusCode}');
      }
    } finally {
      client.close();
    }
  }

  /// Server periksa objek yang dimuat naik (wujud/jenis/saiz) + commit metadata
  /// kanonik (imagePath/imageVersion). Owner/admin sahaja.
  Future<void> finalizeGroupImageUpload(String groupId, String objectPath) =>
      _fn('finalizeGroupImageUploadV2',
          {'groupId': groupId, 'objectPath': objectPath});

  /// Aliran gabungan prepare → PUT → finalize. Imej lama kekal sehingga imej
  /// baru di-commit (assetId unik server → identiti cache baru).
  Future<void> uploadGroupImageV2(String groupId, File jpeg) async {
    final prep = await prepareGroupImageUpload(groupId);
    final uploadUrl = prep['uploadUrl'] as String;
    final objectPath = prep['objectPath'] as String;
    final contentType = (prep['contentType'] as String?) ?? 'image/jpeg';
    await putBytesToSignedUrl(uploadUrl, jpeg, contentType);
    await finalizeGroupImageUpload(groupId, objectPath);
  }

  /// Selesaikan URL imej grup (signed GET jangka pendek). null = tiada imej
  /// atau tanpa kebenaran → klien fallback emoji.
  Future<String?> getGroupImageUrl(String groupId) async {
    final res = await _fn('getGroupImageUrlV2', {'groupId': groupId});
    return res['imageUrl'] as String?;
  }

  /// Resolver kelompok (had server MAX_BATCH): {groupId: imageUrl}. Hanya grup
  /// dibenarkan + berimej dikembalikan.
  Future<Map<String, String>> getGroupImageUrls(List<String> groupIds) async {
    if (groupIds.isEmpty) return const {};
    final res = await _fn('getGroupImageUrlsV2', {'groupIds': groupIds});
    final images = (res['images'] as Map?) ?? const {};
    final out = <String, String>{};
    images.forEach((k, v) {
      final url = (v is Map) ? v['imageUrl'] as String? : null;
      if (url != null) out['$k'] = url;
    });
    return out;
  }

  /// Keluarkan imej grup (server kosongkan metadata + padam objek) → emoji.
  Future<void> removeGroupImageV2(String groupId) =>
      _fn('removeGroupImageV2', {'groupId': groupId});

  Future<void> pinGroupItem(String groupId,
          {String? placeId, String? placeName, String? announcement}) =>
      _fn('pinGroupItem', {
        'groupId': groupId,
        if (placeId != null) 'placeId': placeId,
        if (placeName != null) 'placeName': placeName,
        if (announcement != null) 'announcement': announcement,
      });

  // ---------------- FIX 3: Jemputan grup peribadi + padam grup ----------
  /// Owner/admin menjemput pengguna ke grup (server-authoritative).
  Future<void> inviteToGroup(String groupId, String targetUid) =>
      _fn('inviteToGroup', {'groupId': groupId, 'targetUid': targetUid});

  /// Penerima menerima/menolak jemputannya sendiri (idempotent di pelayan).
  Future<void> respondGroupInvite(String inviteId, {required bool accept}) =>
      _fn('respondGroupInvite', {'inviteId': inviteId, 'accept': accept});

  /// Inviter/owner/admin membatalkan jemputan tertunda.
  Future<void> cancelGroupInvite(String inviteId) =>
      _fn('cancelGroupInvite', {'inviteId': inviteId});

  /// Owner memadam grup (SOFT DELETE — status='deleted' di pelayan).
  Future<void> deleteGroupV2(String groupId) =>
      _fn('deleteGroupV2', {'groupId': groupId});

  // ---------------- HOTFIX 4.6: Smart invite + secure invite links ----------
  /// Carian orang server-authoritative untuk jemput (manager-gated). Query
  /// kosong → cadangan "Following". Pulangkan senarai baris identiti awam +
  /// keadaan (member/invited/invite) + isFollowing.
  Future<List<Map<String, dynamic>>> searchPeople(
      String groupId, String query) async {
    final res = await _fn('searchPeopleV2', {'groupId': groupId, 'query': query});
    final people = (res['people'] as List?) ?? const [];
    return people
        .whereType<Map>()
        .map((m) => m.cast<String, dynamic>())
        .toList();
  }

  /// Owner/admin cipta pautan jemputan selamat (token legap). Pulangkan
  /// {token, url, linkId, expiresAt, maxUses}.
  Future<Map<String, dynamic>> createGroupInviteLink(String groupId,
          {int expiresInDays = 7, int? maxUses}) =>
      _fn('createGroupInviteLinkV2', {
        'groupId': groupId,
        'expiresInDays': expiresInDays,
        if (maxUses != null) 'maxUses': maxUses,
      });

  /// Pratonton grup melalui token pautan (link-scoped; token = kapabiliti).
  Future<Map<String, dynamic>> getGroupInviteLinkInfo(String token) =>
      _fn('getGroupInviteLinkInfoV2', {'token': token});

  /// Sertai grup melalui token pautan (server-authoritative, role=member).
  Future<Map<String, dynamic>> joinGroupByInviteLink(String token) =>
      _fn('joinGroupByInviteLinkV2', {'token': token});

  /// Owner/admin batalkan pautan (redemption seterusnya ditolak pelayan).
  Future<void> revokeGroupInviteLink(String linkId) =>
      _fn('revokeGroupInviteLinkV2', {'linkId': linkId});

  /// Senarai metadata pautan aktif (owner/admin) — untuk urus/revoke selepas
  /// mula semula app. TIDAK sekali-kali memulangkan token plaintext.
  Future<List<Map<String, dynamic>>> listGroupInviteLinks(String groupId) async {
    final res = await _fn('listGroupInviteLinksV2', {'groupId': groupId});
    final links = (res['links'] as List?) ?? const [];
    return links
        .whereType<Map>()
        .map((m) => m.cast<String, dynamic>())
        .toList();
  }

  // ---------------- V4 Group Poll + Status ----------------

  Future<String?> createGroupPoll({
    required String groupId,
    required String question,
    required String type,
    required List<String> options,
  }) async {
    final res = await _fn('createGroupPoll', {
      'groupId': groupId,
      'question': question,
      'type': type,
      'options': options,
    });
    return res['pollId'] as String?;
  }

  Future<void> voteGroupPoll(String groupId, String pollId, String optionKey) =>
      _fn('voteGroupPoll',
          {'groupId': groupId, 'pollId': pollId, 'optionKey': optionKey});

  Future<void> closeGroupPoll(String groupId, String pollId) =>
      _fn('closeGroupPoll', {'groupId': groupId, 'pollId': pollId});

  Future<void> setGroupStatus(String groupId, Map<String, dynamic> status) =>
      _fn('setGroupStatus', {'groupId': groupId, 'status': status});

  /// Pemanggil generik ringkas untuk fungsi V4 (timeout 20s).
  Future<Map<String, dynamic>> _fn(String name, Map<String, dynamic> data) async {
    final res = await _functions
        .httpsCallable(name,
            options:
                HttpsCallableOptions(timeout: const Duration(seconds: 20)))
        .call<Map>(data);
    return (res.data).cast<String, dynamic>();
  }

  Future<bool> toggleLike(String postId) async {
    final res = await _functions
        .httpsCallable(
          'toggleLike',
          options:
              HttpsCallableOptions(timeout: const Duration(seconds: 15)),
        )
        .call<Map>({
      'postId': postId,
    });
    return (res.data['liked'] as bool?) ?? false;
  }

  /// Soft delete post sendiri (server tanda status=deleted).
  Future<void> deletePost(String postId) => _functions
      .httpsCallable('deleteUserPost')
      .call<Map>({'postId': postId});

  /// Edit kapsyen / keterlihatan / komen post sendiri.
  Future<void> editPost({
    required String postId,
    String? text,
    String? visibility,
    bool? commentEnabled,
  }) =>
      _functions.httpsCallable('editUserPost').call<Map>({
        'postId': postId,
        if (text != null) 'text': text,
        if (visibility != null) 'visibility': visibility,
        if (commentEnabled != null) 'commentEnabled': commentEnabled,
      });

  Future<void> editComment({
    required String postId,
    required String commentId,
    required String body,
  }) =>
      _functions.httpsCallable('editUserComment').call<Map>({
        'postId': postId,
        'commentId': commentId,
        'body': body,
      });

  Future<void> deleteComment({
    required String postId,
    required String commentId,
  }) =>
      _functions.httpsCallable('deleteUserComment').call<Map>({
        'postId': postId,
        'commentId': commentId,
      });

}
