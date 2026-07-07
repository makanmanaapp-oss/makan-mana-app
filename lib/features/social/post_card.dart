import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import 'comment_sheet.dart';
import 'social_providers.dart';

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
    final l = AppLocalizations.of(context);
    final ts = data['createdAt'];
    if (ts is! Timestamp) return l.t('justNow');
    final diff = DateTime.now().difference(ts.toDate());
    if (diff.inMinutes < 1) return l.t('justNow');
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}j';
    return '${diff.inDays}h';
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
    try {
      await ref.read(socialServiceProvider).toggleLike(widget.post.id);
    } catch (_) {
      setState(() {
        _likedOverride = currentlyLiked;
        _likeDelta += currentlyLiked ? 1 : -1;
      });
    }
  }

  Future<void> _sharePost() async {
    final name = data['displayName'] as String? ?? 'Foodie';
    final text = data['text'] as String? ?? '';
    final placeName = data['placeName'] as String?;
    final body = text.isNotEmpty
        ? '"$text" — $name'
        : '$name makan kat ${placeName ?? 'tempat best'} 😋';
    try {
      await SharePlus.instance
          .share(ShareParams(text: '$body\n\n🍽️ Dari MakanMana'));
    } catch (_) {}
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
                style: const TextStyle(
                    color: AppColors.threadsText,
                    fontWeight: FontWeight.w700,
                    fontSize: 15)),
          ],
          if (subtitle.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(subtitle,
                style: const TextStyle(
                    color: AppColors.threadsMuted, fontSize: 12.5)),
          ],
        ],
      ),
    );
  }

  Future<void> _moreMenu() async {
    final l = AppLocalizations.of(context);
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    final mine = data['authorUid'] == uid;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.cardWhite,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (mine)
              ListTile(
                leading:
                    const Icon(Icons.delete_outline, color: AppColors.primaryRed),
                title: Text(l.t('deleteAction'),
                    style: const TextStyle(color: AppColors.primaryRed)),
                onTap: () {
                  Navigator.pop(ctx);
                  _maybeDelete();
                },
              )
            else ...[
              ListTile(
                leading: const Icon(Icons.flag_outlined),
                title: Text(l.t('report')),
                onTap: () {
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
            ],
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
    final name = data['displayName'] as String? ?? 'Foodie';
    final emoji = data['emoji'] as String? ?? '😋';
    final text = data['text'] as String?;
    final imageUrl = data['imageUrl'] as String?;
    final placeName = data['placeName'] as String?;
    final cuisine = data['cuisine'] as String?;
    final isAuto = data['type'] == 'auto' ||
        (data['type'] == null && placeName != null);
    final likedBy = (data['likedBy'] as List?)?.cast<String>() ?? const [];
    final liked = _likedOverride ?? likedBy.contains(uid);
    final likeCount =
        ((data['likeCount'] as num?)?.toInt() ?? 0) + _likeDelta;

    return GestureDetector(
      onLongPress: _maybeDelete,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Avatar bulat gaya Threads: gambar profil jika ada (tap → profil).
            GestureDetector(
              onTap: _openProfile,
              child: CircleAvatar(
                radius: 19,
                backgroundColor: AppColors.softYellow,
                backgroundImage: data['photoUrl'] != null
                    ? NetworkImage(data['photoUrl'] as String)
                    : null,
                child: data['photoUrl'] == null
                    ? Text(emoji, style: const TextStyle(fontSize: 20))
                    : null,
              ),
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
                            style: const TextStyle(
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
                        style: const TextStyle(
                          color: AppColors.threadsMuted,
                          fontSize: 13,
                        ),
                      ),
                      InkWell(
                        onTap: _moreMenu,
                        borderRadius: BorderRadius.circular(20),
                        child: const Padding(
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
                      style: const TextStyle(
                        color: AppColors.threadsMuted,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                  // Siaran rating: bintang + kedai yang dinilai.
                  if (data['type'] == 'review' &&
                      data['reviewRating'] != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      '${'⭐' * ((data['reviewRating'] as num).toInt())}'
                      '${placeName != null ? '  •  $placeName' : ''}',
                      style: const TextStyle(
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
                      style: const TextStyle(
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
                  if (imageUrl != null && imageUrl.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: CachedNetworkImage(
                        imageUrl: imageUrl,
                        width: double.infinity,
                        fit: BoxFit.cover,
                        placeholder: (context, url) => Container(
                          height: 200,
                          color: AppColors.softYellow,
                          child: const Center(
                              child: CircularProgressIndicator(
                                  strokeWidth: 2)),
                        ),
                        errorWidget: (context, url, error) => Container(
                          height: 120,
                          color: AppColors.softYellow,
                          child: const Center(child: Text('🖼️')),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  // Baris aksi gaya Threads: like, komen, kongsi.
                  Row(
                    children: [
                      _ActionIcon(
                        icon: liked
                            ? Icons.favorite
                            : Icons.favorite_border,
                        color: liked
                            ? AppColors.primaryRed
                            : AppColors.threadsText,
                        label: likeCount > 0 ? '$likeCount' : null,
                        onTap: _toggleLike,
                      ),
                      const SizedBox(width: 18),
                      _ActionIcon(
                        icon: Icons.mode_comment_outlined,
                        color: AppColors.threadsText,
                        label: ((data['commentCount'] as num?)?.toInt() ??
                                    0) >
                                0
                            ? '${(data['commentCount'] as num).toInt()}'
                            : null,
                        onTap: () =>
                            showCommentsSheet(context, widget.post.id),
                      ),
                      const SizedBox(width: 18),
                      _ActionIcon(
                        icon: Icons.send_outlined,
                        color: AppColors.threadsText,
                        onTap: _sharePost,
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

class _ActionIcon extends StatelessWidget {
  const _ActionIcon({
    required this.icon,
    required this.color,
    required this.onTap,
    this.label,
  });

  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  final String? label;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
        child: Row(
          children: [
            Icon(icon, size: 22, color: color),
            if (label != null) ...[
              const SizedBox(width: 5),
              Text(
                label!,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
