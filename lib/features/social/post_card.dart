import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../../core/widgets/makan_avatar.dart';
import '../groups/bill_attach.dart';
import 'checkin_utils.dart';
import 'comment_sheet.dart';
import 'live_identity.dart';
import 'post_media.dart';
import 'post_media_carousel.dart';
import 'repost.dart';
import 'saved_posts.dart';
import 'social_providers.dart';
import 'social_time.dart';
import 'social_ui.dart';
import 'visibility.dart';

/// Kad siaran gaya Threads: tiada kotak, avatar kiri, aksi ringkas bawah.
class PostCard extends ConsumerStatefulWidget {
  const PostCard({super.key, required this.post});

  final FeedPostData post;

  @override
  ConsumerState<PostCard> createState() => _PostCardState();
}

class _PostCardState extends ConsumerState<PostCard> {
  bool? _likedOverride;
  int _likeDelta = 0;

  Map<String, dynamic> get data => widget.post.data;

  @override
  void didUpdateWidget(covariant PostCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Data baru dari stream Firestore = kebenaran muktamad;
    // reset override optimistik supaya kiraan tidak berganda.
    if (!identical(oldWidget.post.data, widget.post.data)) {
      _likedOverride = null;
      _likeDelta = 0;
    }
  }

  String _timeAgo(BuildContext context) {
    // Threads Fix 1: cap masa ASAL autoritatif (SUMBER tunggal). Post lama
    // TIDAK jadi "baru tadi"; hanya post baharu (pending) yang "baru tadi".
    return relativePostTime(
      AppLocalizations.of(context),
      data['createdAt'],
      pending: widget.post.pending,
    );
  }

  Future<void> _toggleLike() async {
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    final likedBy = (data['likedBy'] as List?)?.cast<String>() ?? const [];
    final currentlyLiked = _likedOverride ?? likedBy.contains(uid);
    // Optimistic UI; stream akan betulkan bila pelayan sahkan.
    setState(() {
      _likedOverride = !currentlyLiked;
      _likeDelta += currentlyLiked ? -1 : 1;
    });
    ref.read(eventLoggerProvider).logEvent(
          currentlyLiked ? EventType.postUnliked : EventType.postLiked,
          sourceScreen: 'feed',
          metadata: postEventMetadata(widget.post.id, data,
              sourceScreen: 'feed'),
        );
    try {
      await ref.read(socialServiceProvider).toggleLike(widget.post.id);
    } catch (_) {
      setState(() {
        _likedOverride = currentlyLiked;
        _likeDelta += currentlyLiked ? 1 : -1;
      });
    }
  }

  /// Kongsi melalui OS share sheet. Ini "Share", BUKAN repost —
  /// tiada dokumen/kiraan dicipta (model repost = prompt akan datang).
  Future<void> _sharePost() async {
    ref.read(eventLoggerProvider).logEvent(
          EventType.postShared,
          sourceScreen: 'feed',
          metadata: postEventMetadata(widget.post.id, data,
              sourceScreen: 'feed'),
        );
    try {
      await SharePlus.instance
          .share(ShareParams(text: buildShareText(data)));
    } catch (_) {}
  }

  /// Simpan/nyahsimpan post (users/{uid}/saved_posts). Gagal = snackbar
  /// jujur (contoh: rules belum aktif) — TIDAK pura-pura berjaya.
  Future<void> _toggleSave(bool currentlySaved) async {
    final l = AppLocalizations.of(context);
    try {
      final saved = await toggleSavePost(
        ref,
        postId: widget.post.id,
        postData: data,
        currentlySaved: currentlySaved,
        sourceScreen: 'feed',
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content:
                Text(saved ? l.t('postSavedOk') : l.t('postUnsavedOk'))));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('saveFailed'))));
      }
    }
  }

  /// Buka media viewer skrin penuh pada indeks gambar yang ditap (SP8).
  void _openMedia([int index = 0]) {
    context.push('/post/${widget.post.id}/media?i=$index',
        extra: widget.post);
  }

  Future<void> _maybeDelete() async {
    final l = AppLocalizations.of(context);
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    if (data['authorUid'] != uid) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l.t('deletePost')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(l.t('cancelAction')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(
              l.t('deleteAction'),
              style: const TextStyle(color: AppColors.primaryRed),
            ),
          ),
        ],
      ),
    );
    if (confirm == true) {
      await ref.read(socialServiceProvider).deletePost(widget.post.id);
    }
  }

  void _openProfile() {
    final authorUid = data['authorUid'] as String?;
    if (authorUid != null && authorUid.isNotEmpty) {
      context.push('/u/$authorUid');
    }
  }

  IconData? _visIcon() => switch (data['visibility']) {
        'followers_only' => Icons.group_outlined,
        'private' => Icons.lock_outline,
        'group_only' => Icons.groups_outlined,
        'unlisted' => Icons.link_off,
        _ => null,
      };

  /// Kad hasil dikongsi (cadangan AI / insight bajet / hasil undian / wallet).
  Widget _shareCard(AppLocalizations l) {
    final postType = data['postType'] as String?;
    final payload = (data['payload'] as Map?)?.cast<String, dynamic>() ?? {};
    final (emoji, title) = switch (postType) {
      'suggestion_result' => ('✨', l.t('shareCardSuggestion')),
      'budget_insight' => ('💸', l.t('shareCardBudget')),
      'group_result' => ('📊', l.t('shareCardGroupResult')),
      'group_poll' => ('🗳️', l.t('shareCardPoll')),
      'meal_wallet_share' => ('🧾', l.t('shareCardWallet')),
      _ => ('🍽️', ''),
    };
    final headline = payload['headline'] as String? ??
        payload['placeName'] as String? ??
        payload['title'] as String? ??
        '';
    final subtitle = payload['subtitle'] as String? ??
        payload['detail'] as String? ??
        '';
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1E1E1E), Color(0xFF262626)],
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.threadsBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(emoji, style: const TextStyle(fontSize: 16)),
              const SizedBox(width: 6),
              Text(title,
                  style: const TextStyle(
                      color: AppColors.warmYellow,
                      fontWeight: FontWeight.w800,
                      fontSize: 12)),
            ],
          ),
          if (headline.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(headline,
                style: TextStyle(
                    color: AppColors.threadsText,
                    fontWeight: FontWeight.w700,
                    fontSize: 15)),
          ],
          if (subtitle.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(subtitle,
                style: TextStyle(
                    color: AppColors.threadsMuted, fontSize: 12.5)),
          ],
        ],
      ),
    );
  }

  /// Edit kapsyen post sendiri (backend sedia ada: editUserPost).
  Future<void> _editCaption() async {
    final l = AppLocalizations.of(context);
    final controller =
        TextEditingController(text: data['text'] as String? ?? '');
    final newText = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l.t('editPostTitle')),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 500,
          minLines: 1,
          maxLines: 5,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(l.t('cancelAction')),
          ),
          TextButton(
            onPressed: () =>
                Navigator.pop(dialogContext, controller.text.trim()),
            child: Text(l.t('saveAction')),
          ),
        ],
      ),
    );
    if (newText == null || newText == (data['text'] as String? ?? '')) {
      return;
    }
    try {
      await ref
          .read(socialServiceProvider)
          .editPost(postId: widget.post.id, text: newText);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l.t('editPostSaved'))));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('postFailed'))));
      }
    }
  }

  /// Tukar keterlihatan post sendiri (backend sedia ada: editUserPost).
  /// Post grup tidak ditawarkan (kekal group_only — jangan bocor keluar).
  Future<void> _changeVisibility() async {
    final l = AppLocalizations.of(context);
    final currentWire = data['visibility'] as String? ?? 'public';
    final current = PostVisibility.values.firstWhere(
      (v) => v.wire == currentWire,
      orElse: () => PostVisibility.public,
    );
    final picked = await showVisibilityPicker(context, current);
    if (picked == null || picked.wire == currentWire) return;
    try {
      await ref
          .read(socialServiceProvider)
          .editPost(postId: widget.post.id, visibility: picked.wire);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l.t('editPostSaved'))));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('postFailed'))));
      }
    }
  }

  /// "Tak berminat": sorok post ini (pilihan lokal, boleh buat asal).
  void _notInterested() {
    ref.read(eventLoggerProvider).logEvent(
          EventType.postNotInterested,
          sourceScreen: 'feed',
          metadata: postEventMetadata(widget.post.id, data,
              sourceScreen: 'feed'),
        );
    ref.read(hiddenPostIdsProvider.notifier).update(
          (ids) => {...ids, widget.post.id},
        );
  }

  /// SP6: buka aliran cipta bil dari post/check-in grup (prefill).
  void _createBillFromPost(String groupId) {
    ref.read(eventLoggerProvider).logEvent(
          EventType.billCreateFromPostTapped,
          sourceScreen: 'group_feed',
          metadata: postEventMetadata(widget.post.id, data,
              sourceScreen: 'group_feed'),
        );
    context.push('/groups/$groupId/bills/create', extra: {
      'placeName': data['placeName'] as String? ?? '',
      'total': data['totalSpend'],
      'postId': widget.post.id,
    });
  }

  Future<void> _moreMenu() async {
    final l = AppLocalizations.of(context);
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    final mine = data['authorUid'] == uid;
    final isGroupPost = data['groupId'] != null;
    final groupId = data['groupId'] as String? ?? '';
    // SP6: bil terpaut (jika ada) — menu tunjuk Buka vs Buat/Lekat.
    final attachedBill = isGroupPost
        ? ref.read(billForPostProvider(
            (groupId: groupId, postId: widget.post.id)))
        : null;
    ref.read(eventLoggerProvider).logEvent(
          EventType.postMoreOpened,
          sourceScreen: 'feed',
          metadata: postEventMetadata(widget.post.id, data,
              sourceScreen: 'feed'),
        );
    await showModalBottomSheet<void>(
      context: context,
      // FIX 10.6: JANGAN paksa putih — biar bottomSheetTheme (mm.card gelap /
      // cardWhite terang) uruskan supaya teks ListTile tak jadi putih-atas-putih.
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // SP6: aksi Tong-Tong Bill untuk post/check-in grup.
            if (isGroupPost && attachedBill != null)
              ListTile(
                leading: const Text('🧾', style: TextStyle(fontSize: 20)),
                title: Text(l.t('openLinkedBill')),
                onTap: () {
                  Navigator.pop(ctx);
                  ref.read(eventLoggerProvider).logEvent(
                        EventType.billOpenedFromPost,
                        sourceScreen: 'group_feed',
                        metadata: {
                          'groupId': groupId,
                          'postId': widget.post.id,
                          'billId': attachedBill.$1,
                        },
                      );
                  context.push('/tong-tong/${attachedBill.$1}');
                },
              )
            else if (isGroupPost) ...[
              ListTile(
                leading: const Text('🧾', style: TextStyle(fontSize: 20)),
                title: Text(l.t('createBillFromPost')),
                onTap: () {
                  Navigator.pop(ctx);
                  _createBillFromPost(groupId);
                },
              ),
              ListTile(
                leading: const Icon(Icons.add_link,
                    color: AppColors.warmYellow),
                title: Text(l.t('attachExistingBill')),
                onTap: () {
                  Navigator.pop(ctx);
                  showAttachBillSheet(context, ref,
                      groupId: groupId, postId: widget.post.id);
                },
              ),
            ],
            if (mine) ...[
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: Text(l.t('editPostTitle')),
                onTap: () {
                  Navigator.pop(ctx);
                  _editCaption();
                },
              ),
              if (!isGroupPost)
                ListTile(
                  leading: const Icon(Icons.visibility_outlined),
                  title: Text(l.t('changeVisibility')),
                  onTap: () {
                    Navigator.pop(ctx);
                    _changeVisibility();
                  },
                ),
              ListTile(
                leading: const Icon(Icons.delete_outline,
                    color: AppColors.primaryRed),
                title: Text(l.t('deleteAction'),
                    style: const TextStyle(color: AppColors.primaryRed)),
                onTap: () {
                  Navigator.pop(ctx);
                  _maybeDelete();
                },
              ),
            ] else ...[
              ListTile(
                leading: const Icon(Icons.visibility_off_outlined),
                title: Text(l.t('notInterested')),
                onTap: () {
                  Navigator.pop(ctx);
                  _notInterested();
                },
              ),
              ListTile(
                leading: const Icon(Icons.flag_outlined),
                title: Text(l.t('report')),
                onTap: () {
                  ref.read(eventLoggerProvider).logEvent(
                        EventType.postReportTapped,
                        sourceScreen: 'feed',
                        metadata: postEventMetadata(widget.post.id, data,
                            sourceScreen: 'feed'),
                      );
                  ref.read(socialServiceProvider).reportContent(
                        targetType: 'post',
                        targetId: widget.post.id,
                        targetUid: data['authorUid'] as String?,
                      );
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(l.t('reportSent'))));
                },
              ),
              ListTile(
                leading: const Icon(Icons.volume_off_outlined),
                title: Text(l.t('mute')),
                onTap: () {
                  final au = data['authorUid'] as String?;
                  if (au != null) {
                    ref.read(socialServiceProvider).muteUser(au);
                  }
                  Navigator.pop(ctx);
                },
              ),
              ListTile(
                leading: const Icon(Icons.block_outlined,
                    color: AppColors.primaryRed),
                title: Text(l.t('block'),
                    style: const TextStyle(color: AppColors.primaryRed)),
                onTap: () {
                  final au = data['authorUid'] as String?;
                  if (au != null) {
                    ref.read(socialServiceProvider).blockUser(au);
                  }
                  Navigator.pop(ctx);
                },
              ),
            ],
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  /// SP8: kad repost biasa — "🔁 {nama} repost semula" + post asal.
  Widget _plainRepostCard(AppLocalizations l, String name) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.repeat,
                  size: 15, color: AppColors.threadsMuted),
              const SizedBox(width: 8),
              Expanded(
                child: GestureDetector(
                  onTap: _openProfile,
                  child: Text(
                    '$name ${l.t('repostedSuffix')}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: AppColors.threadsMuted,
                        fontSize: 13,
                        fontWeight: FontWeight.w700),
                  ),
                ),
              ),
              Text(
                _timeAgo(context),
                style: TextStyle(
                    color: AppColors.threadsMuted, fontSize: 13),
              ),
              InkWell(
                onTap: _moreMenu,
                borderRadius: BorderRadius.circular(20),
                child: Padding(
                  padding: EdgeInsets.only(left: 6, top: 2, bottom: 2),
                  child: Icon(Icons.more_horiz,
                      size: 18, color: AppColors.threadsMuted),
                ),
              ),
            ],
          ),
          EmbeddedOriginalCard(
            originalPostId: data['repostOfPostId'] as String,
            snapshot: (data['originalSnapshot'] as Map?)
                ?.cast<String, dynamic>(),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    // "Tak berminat": kad runtuh kepada tile kecil + buat asal.
    final hidden = ref.watch(hiddenPostIdsProvider);
    if (hidden.contains(widget.post.id)) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Icon(Icons.visibility_off_outlined,
                size: 16, color: AppColors.threadsMuted),
            const SizedBox(width: 8),
            Expanded(
              child: Text(l.t('postHidden'),
                  style: TextStyle(
                      color: AppColors.threadsMuted,
                      fontSize: 13,
                      fontWeight: FontWeight.w600)),
            ),
            InkWell(
              onTap: () => ref
                  .read(hiddenPostIdsProvider.notifier)
                  .update((ids) => {...ids}..remove(widget.post.id)),
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                child: Text(l.t('undoAction'),
                    style: const TextStyle(
                        color: AppColors.warmYellow,
                        fontSize: 13,
                        fontWeight: FontWeight.w800)),
              ),
            ),
          ],
        ),
      );
    }
    final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
    // ISSUE 004: identiti pengarang LIVE - profil semasa diutamakan,
    // snapshot post lama sebagai fallback (tiada penulisan semula massa).
    final author = resolveAuthorIdentity(
      ref,
      l,
      uid: data['authorUid'] as String? ?? '',
      snapshotName: data['displayName'] as String?,
      snapshotPhotoUrl: data['photoUrl'] as String?,
      snapshotPreset: data['avatarPreset'] as String?,
    );
    final name = author.displayName;
    // SP8: repost biasa = label kompak + kad post asal (tiada kandungan
    // sendiri, tiada baris aksi — kiraan milik post asal, bukan palsu).
    if (data['postType'] == 'repost' &&
        data['repostOfPostId'] is String) {
      return _plainRepostCard(l, name);
    }
    final emoji = data['emoji'] as String? ?? '😋';
    final text = data['text'] as String?;
    final mediaUrls = postMediaUrls(data);
    final placeName = data['placeName'] as String?;
    final cuisine = data['cuisine'] as String?;
    final isAuto = data['type'] == 'auto' ||
        (data['type'] == null && placeName != null);
    final likedBy = (data['likedBy'] as List?)?.cast<String>() ?? const [];
    final liked = _likedOverride ?? likedBy.contains(uid);
    final likeCount =
        ((data['likeCount'] as num?)?.toInt() ?? 0) + _likeDelta;
    final saved = (ref.watch(mySavedPostIdsProvider).value ?? const {})
        .contains(widget.post.id);

    return GestureDetector(
      onLongPress: _maybeDelete,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ISSUE 004: avatar LIVE diutamakan (resolveAuthorIdentity),
            // snapshot post lama kekal fallback.
            MakanAvatar(
              radius: 19,
              photoUrl: author.photoUrl,
              presetId: author.avatarPreset,
              displayName: name,
              emoji: emoji,
              onTap: _openProfile,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: GestureDetector(
                          onTap: _openProfile,
                          child: Text(
                            name,
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                              color: AppColors.threadsText,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                      if (_visIcon() != null) ...[
                        const SizedBox(width: 6),
                        Icon(_visIcon(),
                            size: 13, color: AppColors.threadsMuted),
                      ],
                      const Spacer(),
                      Text(
                        _timeAgo(context),
                        style: TextStyle(
                          color: AppColors.threadsMuted,
                          fontSize: 13,
                        ),
                      ),
                      InkWell(
                        onTap: _moreMenu,
                        borderRadius: BorderRadius.circular(20),
                        child: Padding(
                          padding: EdgeInsets.only(left: 6, top: 2, bottom: 2),
                          child: Icon(Icons.more_horiz,
                              size: 18, color: AppColors.threadsMuted),
                        ),
                      ),
                    ],
                  ),
                  if (isAuto && placeName != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      '📍 ${l.t('feedAteAt')} $placeName'
                      '${cuisine != null ? ' • $cuisine' : ''}',
                      style: TextStyle(
                        color: AppColors.threadsMuted,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                  // Social Prompt 4: metadata check-in (kompak).
                  if (data['type'] == 'checkin') ...[
                    if (placeName != null && placeName.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        '📍 ${l.t('checkinBadge')} $placeName',
                        style: const TextStyle(
                          color: AppColors.warmYellow,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                    if (checkinSummaryLine(data).isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        checkinSummaryLine(data),
                        style: TextStyle(
                          color: AppColors.threadsText,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                    if ((data['areaLabel'] as String?)?.isNotEmpty ??
                        false) ...[
                      const SizedBox(height: 2),
                      Text(
                        '${l.t('areaPrefix')} ${data['areaLabel']}',
                        style: TextStyle(
                          color: AppColors.threadsMuted,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                    if ((data['moodTags'] as List?)?.isNotEmpty ??
                        false) ...[
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final tag in (data['moodTags'] as List)
                              .whereType<String>()
                              .take(6))
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 9, vertical: 4),
                              decoration: BoxDecoration(
                                color: AppColors.threadsSurface,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                    color: AppColors.threadsBorder),
                              ),
                              child: Text(
                                tag,
                                style: TextStyle(
                                  color: AppColors.threadsText,
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ],
                  // Siaran rating: bintang + kedai yang dinilai.
                  if (data['type'] == 'review' &&
                      data['reviewRating'] != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      '${'⭐' * ((data['reviewRating'] as num).toInt())}'
                      '${placeName != null ? '  •  $placeName' : ''}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.threadsText,
                      ),
                    ),
                  ],
                  if (text != null && text.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      text,
                      style: TextStyle(
                        fontSize: 15,
                        height: 1.35,
                        color: AppColors.threadsText,
                      ),
                    ),
                  ],
                  if (const {
                    'suggestion_result',
                    'budget_insight',
                    'group_result',
                    'group_poll',
                    'meal_wallet_share',
                  }.contains(data['postType']))
                    _shareCard(l),
                  // SP8: media — 1 gambar seperti dulu, 2-6 = carousel.
                  if (mediaUrls.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    PostMediaCarousel(
                      postId: widget.post.id,
                      urls: mediaUrls,
                      onOpen: _openMedia,
                    ),
                  ],
                  // SP8: kad asal terbenam untuk quote repost.
                  if (data['postType'] == 'quote_repost' &&
                      data['quotedPostId'] is String)
                    EmbeddedOriginalCard(
                      originalPostId: data['quotedPostId'] as String,
                      snapshot: (data['originalSnapshot'] as Map?)
                          ?.cast<String, dynamic>(),
                    ),
                  // SP6: ringkasan Tong-Tong Bil terpaut (post grup
                  // sahaja — kiraan selamat, tiada nama penghutang).
                  if (data['groupId'] != null)
                    PostBillSummaryCard(
                      groupId: data['groupId'] as String,
                      postId: widget.post.id,
                    ),
                  const SizedBox(height: 8),
                  // Baris aksi sosial: like/komen dengan kiraan sebenar
                  // (default 0 — tiada kiraan palsu), kongsi, simpan.
                  // saveCount/shareCount global TIDAK dipapar sebab medan
                  // itu belum wujud (jangan fake).
                  // FIX 4: baris engagement melalui SocialActionButton DIKONGSI
                  // (saiz/sasaran-sentuh/semantik seragam). Logik, warna aktif
                  // dan kiraan KEKAL sama (freeze Fix 1/2).
                  Row(
                    children: [
                      SocialActionButton(
                        icon: liked
                            ? Icons.favorite
                            : Icons.favorite_border,
                        color: liked
                            ? AppColors.primaryRed
                            : AppColors.threadsText,
                        semanticLabel:
                            l.t(liked ? 'unlikeAction' : 'likeAction'),
                        label: '${likeCount < 0 ? 0 : likeCount}',
                        onTap: _toggleLike,
                      ),
                      const SizedBox(width: 10),
                      SocialActionButton(
                        icon: Icons.mode_comment_outlined,
                        color: AppColors.threadsText,
                        semanticLabel: l.t('replyAction'),
                        label:
                            '${(data['commentCount'] as num?)?.toInt() ?? 0}',
                        onTap: () {
                          ref.read(eventLoggerProvider).logEvent(
                                EventType.postCommentOpened,
                                sourceScreen: 'feed',
                                metadata: postEventMetadata(
                                    widget.post.id, data,
                                    sourceScreen: 'feed'),
                              );
                          showCommentsSheet(context, widget.post.id);
                        },
                      ),
                      const SizedBox(width: 10),
                      // SP8: repost/quote — kiraan sebenar dari pelayan.
                      SocialActionButton(
                        icon: Icons.repeat,
                        color: AppColors.threadsText,
                        semanticLabel: l.t('repostAction'),
                        label:
                            '${((data['repostCount'] as num?)?.toInt() ?? 0) + ((data['quoteCount'] as num?)?.toInt() ?? 0)}',
                        onTap: () =>
                            showRepostSheet(context, ref, post: widget.post),
                      ),
                      const SizedBox(width: 10),
                      SocialActionButton(
                        icon: Icons.send_outlined,
                        color: AppColors.threadsText,
                        semanticLabel: l.t('shareAction'),
                        onTap: _sharePost,
                      ),
                      const Spacer(),
                      SocialActionButton(
                        icon: saved
                            ? Icons.bookmark
                            : Icons.bookmark_border,
                        color: saved
                            ? AppColors.warmYellow
                            : AppColors.threadsText,
                        semanticLabel:
                            l.t(saved ? 'removeSavedAction' : 'saveAction'),
                        onTap: () => _toggleSave(saved),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

