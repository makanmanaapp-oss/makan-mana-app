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
  Future<String> uploadImage(String uid, File image) async {
    final ref = FirebaseStorage.instance.ref(
      'feed_images/$uid/${DateTime.now().millisecondsSinceEpoch}.jpg',
    );
    await ref
        .putFile(image, SettableMetadata(contentType: 'image/jpeg'))
        .timeout(const Duration(seconds: 45));
    return ref.getDownloadURL().timeout(const Duration(seconds: 10));
  }

  /// Cipta siaran (teks dan/atau gambar; groupId untuk siaran grup).
  /// [visibility]: public | followers_only | group_only | private | unlisted.
  /// [postType]: food_post | meal_review | suggestion_result | budget_insight |
  ///             group_poll | group_result | meal_wallet_share.
  Future<void> createPost({
    required String uid,
    String text = '',
    File? image,
    String? groupId,
    String visibility = 'public',
    String postType = 'food_post',
    Map<String, dynamic>? payload,
    String? placeId,
    String? placeName,
  }) async {
    String imageUrl = '';
    if (image != null) {
      imageUrl = await uploadImage(uid, image);
    }
    await _functions
        .httpsCallable(
          'createFeedPost',
          options:
              HttpsCallableOptions(timeout: const Duration(seconds: 20)),
        )
        .call<Map>({
      'text': text,
      'imageUrl': imageUrl,
      'groupId': groupId ?? '',
      'visibility': visibility,
      'postType': postType,
      if (payload != null) 'payload': payload,
      if (placeId != null) 'placeId': placeId,
      if (placeName != null) 'placeName': placeName,
    });
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

  Future<void> pinGroupItem(String groupId,
          {String? placeId, String? placeName, String? announcement}) =>
      _fn('pinGroupItem', {
        'groupId': groupId,
        if (placeId != null) 'placeId': placeId,
        if (placeName != null) 'placeName': placeName,
        if (announcement != null) 'announcement': announcement,
      });

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
