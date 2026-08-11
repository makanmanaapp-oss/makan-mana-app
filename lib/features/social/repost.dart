import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../../core/widgets/makan_avatar.dart';
import 'checkin_utils.dart';
import 'live_identity.dart';
import 'post_media.dart';
import 'saved_posts.dart';
import 'social_providers.dart';

/// Social Prompt 8: Repost + Quote Repost.
///
/// PRIVASI: pra-semakan client di sini untuk UX; kuat kuasa SEBENAR di
/// pelayan (repostFeedPost) — rules feed_posts menutup tulisan client
/// sepenuhnya, jadi UI tak boleh dipintas.

/// Keputusan pra-semakan repost (tulen, diuji unit).
class RepostCheck {
  const RepostCheck({
    required this.allowed,
    this.allowedVisibilities = const [],
    this.reasonKey,
  });

  final bool allowed;

  /// Keterlihatan hasil yang dibenarkan (kekangan privasi post asal).
  final List<String> allowedVisibilities;

  /// Kunci l10n mesej mesra bila disekat.
  final String? reasonKey;
}

/// Pra-semak sama ada post boleh direpost/quote dan dengan keterlihatan
/// apa. Padan dengan logik pelayan:
/// - deleted/hidden  -> tidak boleh.
/// - private         -> tidak boleh (sesiapa pun).
/// - group_only/grup -> hanya dalam grup sama & mesti ahli (group_only).
/// - followers_only / unlisted -> dipaksa followers_only/private.
/// - public          -> public/followers_only/private.
RepostCheck checkRepostability(
  Map<String, dynamic> original, {
  required bool isGroupMember,
}) {
  final status = original['status'];
  if (status == 'deleted' || status == 'hidden') {
    return const RepostCheck(allowed: false, reasonKey: 'postUnavailable');
  }
  final groupId = original['groupId'] as String?;
  if (groupId != null && groupId.isNotEmpty) {
    if (!isGroupMember) {
      return const RepostCheck(allowed: false, reasonKey: 'cannotRepost');
    }
    return const RepostCheck(
        allowed: true, allowedVisibilities: ['group_only']);
  }
  switch (original['visibility'] as String? ?? 'public') {
    case 'public':
    case 'unlisted':
      // SP9.2B: hasil tidak pernah followers_only (dimatikan beta).
      return const RepostCheck(
        allowed: true,
        allowedVisibilities: ['public', 'private'],
      );
    // followers_only, private & nilai tak dikenal -> sekat.
    default:
      return const RepostCheck(allowed: false, reasonKey: 'cannotRepost');
  }
}

/// Sasaran sebenar repost: repost biasa dihalakan ke post AKAR supaya
/// tiada rantaian repost-atas-repost (quote kekal sasaran sendiri).
String repostTargetId(String postId, Map<String, dynamic> data) {
  final root = data['repostOfPostId'];
  if (data['postType'] == 'repost' && root is String && root.isNotEmpty) {
    return root;
  }
  return postId;
}

/// Buka sheet Repost/Quote untuk sesuatu post. Disekat privasi →
/// snackbar mesra + event repost_blocked_privacy (client-side UX;
/// pelayan log juga bila cubaan sampai backend).
Future<void> showRepostSheet(
  BuildContext context,
  WidgetRef ref, {
  required FeedPostData post,
}) async {
  final l = AppLocalizations.of(context);
  final logger = ref.read(eventLoggerProvider);
  final data = post.data;
  final groupId = data['groupId'] as String?;
  final myGroups = ref.read(myGroupIdsProvider).value ?? const {};
  final check = checkRepostability(
    data,
    isGroupMember: groupId == null || myGroups.contains(groupId),
  );
  logger.logEvent(
    EventType.repostSheetOpened,
    sourceScreen: 'feed',
    metadata: postEventMetadata(post.id, data, sourceScreen: 'feed'),
  );
  if (!check.allowed) {
    logger.logEvent(
      EventType.repostBlockedPrivacy,
      sourceScreen: 'feed',
      metadata: {
        ...postEventMetadata(post.id, data, sourceScreen: 'feed'),
        'reason': check.reasonKey,
      },
    );
    ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t(check.reasonKey ?? 'cannotRepost'))));
    return;
  }
  final targetId = repostTargetId(post.id, data);
  await showModalBottomSheet<void>(
    context: context,
    // FIX 10.6: biar bottomSheetTheme uruskan bg (gelap/terang) — elak
    // putih-atas-putih pada pilihan repost/quote dalam mod gelap.
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.repeat, color: AppColors.primaryRed),
            title: Text(l.t('repostAction')),
            subtitle: groupId != null
                ? Text(l.t('sharedToGroupOnly'),
                    style: const TextStyle(fontSize: 12))
                : null,
            onTap: () {
              Navigator.pop(ctx);
              _doPlainRepost(context, ref,
                  post: post, targetId: targetId, check: check);
            },
          ),
          ListTile(
            leading:
                const Icon(Icons.format_quote, color: AppColors.warmYellow),
            title: Text(l.t('quoteAction')),
            onTap: () {
              Navigator.pop(ctx);
              logger.logEvent(
                EventType.quoteRepostStarted,
                sourceScreen: 'feed',
                metadata:
                    postEventMetadata(post.id, data, sourceScreen: 'feed'),
              );
              final params = <String>[
                'quoteOf=$targetId',
                if (groupId != null) 'groupId=$groupId',
              ];
              context.push('/compose?${params.join('&')}', extra: post);
            },
          ),
          ListTile(
            leading: const Icon(Icons.close),
            title: Text(l.t('cancelAction')),
            onTap: () => Navigator.pop(ctx),
          ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}

Future<void> _doPlainRepost(
  BuildContext context,
  WidgetRef ref, {
  required FeedPostData post,
  required String targetId,
  required RepostCheck check,
}) async {
  final l = AppLocalizations.of(context);
  final messenger = ScaffoldMessenger.of(context);
  final groupId = post.data['groupId'] as String?;
  try {
    await ref.read(socialServiceProvider).repostPost(
          originalPostId: targetId,
          mode: 'repost',
          visibility: check.allowedVisibilities.first,
          groupId: groupId,
        );
    messenger
        .showSnackBar(SnackBar(content: Text(l.t('repostDone'))));
  } catch (_) {
    // Pelayan menolak (privasi/blok/rangkaian) — mesej jujur.
    messenger
        .showSnackBar(SnackBar(content: Text(l.t('cannotRepost'))));
  }
}

/// Kad post asal terbenam (untuk quote repost & repost biasa).
///
/// Sumber kebenaran = bacaan LIVE post asal (rules Firestore kekal
/// berkuat kuasa): dipadam / private / tak boleh dibaca → kad
/// "Post tidak tersedia" — snapshot TIDAK dipapar lagi selepas itu.
/// [snapshot] hanya untuk paparan awal semasa strim dimuat.
class EmbeddedOriginalCard extends ConsumerWidget {
  const EmbeddedOriginalCard({
    super.key,
    required this.originalPostId,
    this.snapshot,
    this.interactive = true,
  });

  final String originalPostId;
  final Map<String, dynamic>? snapshot;

  /// false dalam pratonton composer (tiada navigasi).
  final bool interactive;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final liveAsync = ref.watch(postByIdProvider(originalPostId));
    Map<String, dynamic>? data;
    var unavailable = false;
    if (liveAsync.hasError) {
      unavailable = true; // permission-denied / rangkaian
    } else if (liveAsync.isLoading) {
      data = snapshot; // paparan awal sahaja
    } else {
      final live = liveAsync.valueOrNull;
      if (live == null) {
        unavailable = true; // dipadam / tiada
      } else {
        data = live.data;
      }
    }

    if (unavailable) {
      return _frame(
        child: Row(
          children: [
            Icon(Icons.visibility_off_outlined,
                size: 18, color: AppColors.threadsMuted),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                l.t('postUnavailable'),
                style: TextStyle(
                    color: AppColors.threadsMuted,
                    fontSize: 13,
                    fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      );
    }
    if (data == null) {
      return _frame(
        child: SizedBox(
          height: 40,
          child: Center(
              child: CircularProgressIndicator(
                  strokeWidth: 2, color: AppColors.threadsMuted)),
        ),
      );
    }

    final d = data;
    // ISSUE 004: identiti pengarang post asal - live dulu, snapshot fallback.
    final embedAuthor = resolveAuthorIdentity(
      ref,
      AppLocalizations.of(context),
      uid: d['authorUid'] as String? ?? '',
      snapshotName: d['displayName'] as String?,
      snapshotUsername: d['username'] as String?,
      snapshotPhotoUrl: d['photoUrl'] as String?,
      snapshotPreset: d['avatarPreset'] as String?,
    );
    final name = embedAuthor.displayName;
    final username = embedAuthor.username;
    final text = d['text'] as String? ?? '';
    final placeName = d['placeName'] as String?;
    final urls = postMediaUrls(d);
    final isCheckin = d['type'] == 'checkin';
    final isQuote = d['postType'] == 'quote_repost';
    final authorUid = d['authorUid'] as String? ?? '';

    return GestureDetector(
      onTap: interactive && authorUid.isNotEmpty
          ? () => context.push('/u/$authorUid')
          : null,
      child: _frame(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // ISSUE 004: avatar live diutamakan, snapshot fallback.
                MakanAvatar(
                  radius: 12,
                  photoUrl: embedAuthor.photoUrl,
                  presetId: embedAuthor.avatarPreset,
                  displayName: name,
                  emoji: d['emoji'] as String?,
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: AppColors.threadsText,
                        fontWeight: FontWeight.w800,
                        fontSize: 13),
                  ),
                ),
                if (username != null && username.isNotEmpty) ...[
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      '@$username',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: AppColors.threadsMuted, fontSize: 12),
                    ),
                  ),
                ],
              ],
            ),
            if (isCheckin && placeName != null && placeName.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                '📍 $placeName',
                style: const TextStyle(
                    color: AppColors.warmYellow,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800),
              ),
            ],
            if (isCheckin && checkinSummaryLine(d).isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(
                checkinSummaryLine(d),
                style: TextStyle(
                    color: AppColors.threadsText,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700),
              ),
            ],
            if (text.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                text,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: AppColors.threadsText,
                    fontSize: 13.5,
                    height: 1.3),
              ),
            ],
            // Quote-atas-quote: SATU aras sahaja — tanda ringkas, tiada
            // sarang kad (elak letupan rekursi).
            if (isQuote) ...[
              const SizedBox(height: 6),
              Text(
                '💬 ${l.t('quotePostLabel')}',
                style: TextStyle(
                    color: AppColors.threadsMuted,
                    fontSize: 12,
                    fontWeight: FontWeight.w700),
              ),
            ],
            if (urls.isNotEmpty) ...[
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Stack(
                  children: [
                    CachedNetworkImage(
                      imageUrl: urls.first,
                      width: double.infinity,
                      height: 150,
                      fit: BoxFit.cover,
                      placeholder: (context, url) => Container(
                          height: 150, color: AppColors.threadsSurface),
                      errorWidget: (context, url, error) => Container(
                        height: 90,
                        color: AppColors.threadsSurface,
                        child: const Center(child: Text('🖼️')),
                      ),
                    ),
                    if (urls.length > 1)
                      Positioned(
                        right: 8,
                        top: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.black54,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            '+${urls.length - 1}',
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11.5,
                                fontWeight: FontWeight.w800),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _frame({required Widget child}) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.threadsSurface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.threadsBorder),
        ),
        child: child,
      );
}
