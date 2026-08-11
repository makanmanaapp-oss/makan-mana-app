import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../../core/widgets/makan_avatar.dart';
import 'comment_sheet.dart';
import 'post_media.dart';
import 'saved_posts.dart';
import 'social_providers.dart';
import 'social_ui.dart';

/// Social Prompt 3: media viewer skrin penuh (/post/:postId/media).
///
/// - Latar hitam, zoom/pan (InteractiveViewer), back sistem + butang tutup.
/// - PageView + indikator: sedia multi-media (medan `imageUrls`),
///   hari ini biasanya satu gambar (`imageUrl`).
/// - PRIVASI: dibuka dari post yang MEMANG sudah kelihatan; navigasi terus
///   pun selamat — bacaan feed_posts tertakluk rules (private orang lain
///   ditolak) dan skrin papar ralat mesra, bukan kandungan.
class MediaViewerScreen extends ConsumerStatefulWidget {
  const MediaViewerScreen({
    super.key,
    required this.postId,
    this.initialPost,
    this.initialIndex = 0,
  });

  final String postId;

  /// Data post yang dibawa dari feed (elak fetch semula & jadi fallback
  /// serta-merta sementara stream live dimuat).
  final FeedPostData? initialPost;

  /// SP8: indeks gambar permulaan (dari carousel yang ditap).
  final int initialIndex;

  @override
  ConsumerState<MediaViewerScreen> createState() =>
      _MediaViewerScreenState();
}

class _MediaViewerScreenState extends ConsumerState<MediaViewerScreen> {
  late int _page = widget.initialIndex < 0 ? 0 : widget.initialIndex;
  late final PageController _pageController =
      PageController(initialPage: _page);
  bool _captionExpanded = false;
  bool? _likedOverride;
  int _likeDelta = 0;
  Map<String, dynamic> _lastData = const {};
  // Ditangkap di initState supaya dispose tidak sentuh ref (selamat).
  late final _logger = ref.read(eventLoggerProvider);

  @override
  void initState() {
    super.initState();
    final data = widget.initialPost?.data ?? const <String, dynamic>{};
    _logger.logEvent(
      EventType.postMediaOpened,
      sourceScreen: 'media_viewer',
      metadata: postEventMetadata(widget.postId, data,
          sourceScreen: 'feed', mediaIndex: _page),
    );
  }

  @override
  void dispose() {
    _pageController.dispose();
    // Fire-and-forget; guna data terakhir yang dilihat.
    _logger.logEvent(
      EventType.postMediaClosed,
      sourceScreen: 'media_viewer',
      metadata: postEventMetadata(widget.postId, _lastData,
          sourceScreen: 'feed', mediaIndex: _page),
    );
    super.dispose();
  }

  Future<void> _toggleLike(Map<String, dynamic> data) async {
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    final likedBy = (data['likedBy'] as List?)?.cast<String>() ?? const [];
    final currentlyLiked = _likedOverride ?? likedBy.contains(uid);
    setState(() {
      _likedOverride = !currentlyLiked;
      _likeDelta += currentlyLiked ? -1 : 1;
    });
    ref.read(eventLoggerProvider).logEvent(
          currentlyLiked ? EventType.postUnliked : EventType.postLiked,
          sourceScreen: 'media_viewer',
          metadata:
              postEventMetadata(widget.postId, data, sourceScreen: 'media_viewer'),
        );
    try {
      await ref.read(socialServiceProvider).toggleLike(widget.postId);
    } catch (_) {
      if (mounted) {
        setState(() {
          _likedOverride = currentlyLiked;
          _likeDelta += currentlyLiked ? 1 : -1;
        });
      }
    }
  }

  Future<void> _share(Map<String, dynamic> data) async {
    ref.read(eventLoggerProvider).logEvent(
          EventType.postShared,
          sourceScreen: 'media_viewer',
          metadata:
              postEventMetadata(widget.postId, data, sourceScreen: 'media_viewer'),
        );
    try {
      await SharePlus.instance
          .share(ShareParams(text: buildShareText(data)));
    } catch (_) {}
  }

  Future<void> _toggleSave(
      Map<String, dynamic> data, bool currentlySaved) async {
    final l = AppLocalizations.of(context);
    try {
      final saved = await toggleSavePost(
        ref,
        postId: widget.postId,
        postData: data,
        currentlySaved: currentlySaved,
        sourceScreen: 'media_viewer',
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content:
                Text(saved ? l.t('postSavedOk') : l.t('postUnsavedOk'))));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l.t('saveFailed'))));
      }
    }
  }

  void _openAuthor(Map<String, dynamic> data) {
    final uid = data['authorUid'] as String? ?? '';
    if (uid.isEmpty) return;
    context.push('/u/$uid');
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final liveAsync = ref.watch(postByIdProvider(widget.postId));
    // Live dahulu; jatuh balik kepada data dari feed sementara/jika gagal.
    final post = liveAsync.valueOrNull ?? widget.initialPost;

    if (post == null) {
      final failed = liveAsync.hasError ||
          (!liveAsync.isLoading && liveAsync.valueOrNull == null);
      return _messageScaffold(
        failed ? l.t('savedGone') : null,
      );
    }
    final data = post.data;
    // Snapshot stream baharu = kebenaran muktamad; reset override
    // optimistik supaya kiraan like tidak berganda (sama seperti PostCard).
    if (!identical(_lastData, data)) {
      _likedOverride = null;
      _likeDelta = 0;
    }
    _lastData = data;
    final urls = postMediaUrls(data);
    if (urls.isEmpty) {
      return _messageScaffold(l.t('mediaNoMedia'));
    }
    if (_page >= urls.length) _page = urls.length - 1;

    final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
    final likedBy = (data['likedBy'] as List?)?.cast<String>() ?? const [];
    final liked = _likedOverride ?? likedBy.contains(uid);
    final likeCount =
        (((data['likeCount'] as num?)?.toInt() ?? 0) + _likeDelta)
            .clamp(0, 1 << 31);
    final commentCount = (data['commentCount'] as num?)?.toInt() ?? 0;
    final savedIds = ref.watch(mySavedPostIdsProvider).value ?? const {};
    final saved = savedIds.contains(widget.postId);
    final text = data['text'] as String? ?? '';

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Gambar: swipe antara media + zoom/pan setiap satu.
          Positioned.fill(
            child: PageView.builder(
              controller: _pageController,
              itemCount: urls.length,
              onPageChanged: (i) {
                setState(() => _page = i);
                _logger.logEvent(
                  EventType.mediaViewerSwiped,
                  sourceScreen: 'media_viewer',
                  metadata: postEventMetadata(widget.postId, _lastData,
                      sourceScreen: 'media_viewer', mediaIndex: i),
                );
              },
              itemBuilder: (context, i) {
                final image = InteractiveViewer(
                  maxScale: 4,
                  child: Center(
                    child: CachedNetworkImage(
                      imageUrl: urls[i],
                      fit: BoxFit.contain,
                      width: double.infinity,
                      placeholder: (context, url) => const Center(
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white54)),
                      errorWidget: (context, url, error) => Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Text('🖼️', style: TextStyle(fontSize: 44)),
                          const SizedBox(height: 10),
                          Text(
                            l.t('mediaLoadError'),
                            style: const TextStyle(
                                color: Colors.white70,
                                fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
                // Hero hanya pada gambar pertama (padan dengan kad feed).
                return i == 0
                    ? Hero(
                        tag: postMediaHeroTag(widget.postId, 0),
                        child: image,
                      )
                    : image;
              },
            ),
          ),
          // Bar atas: tutup + penulis (tap → profil awam).
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.black87, Colors.transparent],
                ),
              ),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 4, 12, 14),
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: () => context.pop(),
                        icon: const Icon(Icons.close,
                            color: Colors.white, size: 26),
                        tooltip: l.t('cancelAction'),
                      ),
                      Expanded(
                        child: GestureDetector(
                          onTap: () => _openAuthor(data),
                          behavior: HitTestBehavior.opaque,
                          child: Row(
                            children: [
                              MakanAvatar(
                                radius: 16,
                                photoUrl: data['photoUrl'] as String?,
                                presetId:
                                    data['avatarPreset'] as String?,
                                displayName:
                                    data['displayName'] as String?,
                                emoji: data['emoji'] as String?,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  data['displayName'] as String? ??
                                      'Foodie',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 15,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      // SP8: kaunter "1/4" bila banyak gambar.
                      if (urls.length > 1)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.black38,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            '${_page + 1}/${urls.length}',
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 13,
                                fontWeight: FontWeight.w800),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          // Bawah: kapsyen + indikator halaman + baris aksi.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [Colors.black87, Colors.transparent],
                ),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 26, 20, 10),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (text.isNotEmpty) ...[
                        GestureDetector(
                          onTap: () => setState(
                              () => _captionExpanded = !_captionExpanded),
                          child: Text(
                            text,
                            maxLines: _captionExpanded ? 8 : 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              height: 1.35,
                            ),
                          ),
                        ),
                        if (!_captionExpanded && text.length > 90)
                          Text(
                            l.t('seeMore'),
                            style: const TextStyle(
                                color: Colors.white54,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700),
                          ),
                        const SizedBox(height: 8),
                      ],
                      if (urls.length > 1) ...[
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            for (var i = 0; i < urls.length; i++)
                              Container(
                                width: 7,
                                height: 7,
                                margin: const EdgeInsets.symmetric(
                                    horizontal: 3),
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: i == _page
                                      ? Colors.white
                                      : Colors.white30,
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 8),
                      ],
                      // FIX 4.1: adopt shared SocialActionButton (bahasa visual
                      // sama seperti Feed). Warna putih atas backdrop media
                      // hitam; logik/kiraan KEKAL sama.
                      Row(
                        children: [
                          SocialActionButton(
                            icon: liked
                                ? Icons.favorite
                                : Icons.favorite_border,
                            color: liked
                                ? AppColors.primaryRed
                                : Colors.white,
                            semanticLabel:
                                l.t(liked ? 'unlikeAction' : 'likeAction'),
                            label: '$likeCount',
                            onTap: () => _toggleLike(data),
                          ),
                          const SizedBox(width: 14),
                          SocialActionButton(
                            icon: Icons.mode_comment_outlined,
                            color: Colors.white,
                            semanticLabel: l.t('replyAction'),
                            label: '$commentCount',
                            onTap: () {
                              ref.read(eventLoggerProvider).logEvent(
                                    EventType.postCommentOpened,
                                    sourceScreen: 'media_viewer',
                                    metadata: postEventMetadata(
                                        widget.postId, data,
                                        sourceScreen: 'media_viewer'),
                                  );
                              showCommentsSheet(context, widget.postId);
                            },
                          ),
                          const SizedBox(width: 14),
                          SocialActionButton(
                            icon: Icons.send_outlined,
                            color: Colors.white,
                            semanticLabel: l.t('shareAction'),
                            onTap: () => _share(data),
                          ),
                          const Spacer(),
                          SocialActionButton(
                            icon: saved
                                ? Icons.bookmark
                                : Icons.bookmark_border,
                            color: saved
                                ? AppColors.warmYellow
                                : Colors.white,
                            semanticLabel:
                                l.t(saved ? 'removeSavedAction' : 'saveAction'),
                            onTap: () => _toggleSave(data, saved),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Skrin mesej mesra (post hilang / tiada media) — masih boleh tutup.
  Widget _messageScaffold(String? message) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.close),
        ),
      ),
      body: Center(
        child: message == null
            ? const CircularProgressIndicator(
                strokeWidth: 2, color: Colors.white54)
            : Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text('🖼️', style: TextStyle(fontSize: 44)),
                  const SizedBox(height: 12),
                  Text(
                    message,
                    style: const TextStyle(
                        color: Colors.white70,
                        fontWeight: FontWeight.w600),
                  ),
                ],
              ),
      ),
    );
  }
}

