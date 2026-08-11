import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import 'post_media.dart';
import 'saved_posts.dart';
import 'live_identity.dart';
import 'social_providers.dart';

/// /profile/activity - My Posts, My Comments, Disimpan.
class MyActivityScreen extends ConsumerWidget {
  const MyActivityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Aktiviti Saya'),
          bottom: TabBar(
            // QA akhir: scrollable — label tab terklip pudar pada skala 1.30.
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            labelColor: AppColors.primaryRed,
            unselectedLabelColor: context.mm.onCardMuted,
            indicatorColor: AppColors.primaryRed,
            labelStyle:
                const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
            tabs: [
              const Tab(text: 'Post Saya'),
              const Tab(text: 'Komen Saya'),
              Tab(text: l.t('savedTab')),
            ],
          ),
        ),
        body: const TabBarView(
          children: [_MyPostsTab(), _MyCommentsTab(), _SavedTab()],
        ),
      ),
    );
  }
}

/// Social Prompt 3: tab post yang disimpan (bookmark).
class _SavedTab extends ConsumerWidget {
  const _SavedTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final refs = ref.watch(mySavedRefsProvider);
    return refs.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, st) =>
          _Empty(icon: Icons.bookmark_border, text: l.t('savedEmpty')),
      data: (list) {
        if (list.isEmpty) {
          return _Empty(icon: Icons.bookmark_border, text: l.t('savedEmpty'));
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
          children: list.map((s) => _SavedPostTile(savedRef: s)).toList(),
        );
      },
    );
  }
}

class _SavedPostTile extends ConsumerWidget {
  const _SavedPostTile({required this.savedRef});

  /// Dokumen users/{uid}/saved_posts/{postId} (id = postId).
  final FeedPostData savedRef;

  Future<void> _unsave(
      BuildContext context, WidgetRef ref, Map<String, dynamic> data) async {
    final l = AppLocalizations.of(context);
    try {
      await toggleSavePost(
        ref,
        postId: savedRef.id,
        postData: data,
        currentlySaved: true,
        sourceScreen: 'my_activity_saved',
      );
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('saveFailed'))));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final postAsync = ref.watch(postByIdProvider(savedRef.id));
    final post = postAsync.valueOrNull;
    // Post dipadam / tidak lagi boleh dibaca (rules keterlihatan kekal
    // dihormati) → tile jujur + boleh buang simpanan.
    final unavailable =
        post == null && (!postAsync.isLoading || postAsync.hasError);
    final data = post?.data ?? const <String, dynamic>{};
    final text = data['text'] as String? ?? '';
    // ISSUE 004: nama pengarang live (snapshot post lama fallback).
    final name = post == null
        ? ''
        : resolveAuthorIdentity(
            ref,
            l,
            uid: data['authorUid'] as String? ?? '',
            snapshotName: data['displayName'] as String?,
          ).displayName;
    final urls = post == null ? const <String>[] : postMediaUrls(data);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.mm.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.mm.border),
      ),
      child: Row(
        children: [
          Icon(
            unavailable ? Icons.hide_image_outlined : Icons.bookmark,
            size: 20,
            color: unavailable ? context.mm.iconMuted : AppColors.primaryRed,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: unavailable
                ? Text(l.t('savedGone'),
                    style: TextStyle(
                        fontSize: 13.5,
                        color: context.mm.onCardMuted,
                        fontWeight: FontWeight.w600))
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (name.isNotEmpty)
                        Text(name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 12.5,
                                color: context.mm.onCardMuted,
                                fontWeight: FontWeight.w700)),
                      Text(
                        text.isNotEmpty ? text : '📷',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 13.5, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
          ),
          if (urls.isNotEmpty)
            IconButton(
              onPressed: () =>
                  context.push('/post/${savedRef.id}/media', extra: post),
              icon: Icon(Icons.open_in_full,
                  size: 18, color: context.mm.iconMuted),
            ),
          IconButton(
            onPressed: () => _unsave(context, ref, data),
            icon: Icon(Icons.bookmark_remove_outlined,
                size: 20, color: context.mm.iconMuted),
          ),
        ],
      ),
    );
  }
}

class _MyPostsTab extends ConsumerWidget {
  const _MyPostsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final posts = ref.watch(myPostsProvider);
    return posts.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, st) => Center(child: Text('😕 $e')),
      data: (list) {
        if (list.isEmpty) {
          return _Empty(icon: Icons.article_outlined, text: l.t('feedEmpty'));
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
          children: list.map((p) => _MyPostCard(post: p)).toList(),
        );
      },
    );
  }
}

class _MyPostCard extends ConsumerWidget {
  const _MyPostCard({required this.post});

  final FeedPostData post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = post.data;
    final text = d['text'] as String? ?? '';
    final likeCount = (d['likeCount'] as num?)?.toInt() ?? 0;
    final visibility = d['visibility'] as String? ?? 'public';
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.mm.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.mm.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (text.isNotEmpty)
            Text(text,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.favorite, size: 15, color: AppColors.primaryRed),
              const SizedBox(width: 4),
              Text('$likeCount',
                  style: TextStyle(
                      fontSize: 12.5,
                      color: context.mm.onCardMuted,
                      fontWeight: FontWeight.w700)),
              const SizedBox(width: 12),
              Icon(
                switch (visibility) {
                  'private' => Icons.lock_outline,
                  'followers' => Icons.people_outline,
                  _ => Icons.public,
                },
                size: 14,
                color: context.mm.iconMuted,
              ),
              const SizedBox(width: 4),
              Text(
                switch (visibility) {
                  'private' => 'Peribadi',
                  'followers' => 'Pengikut',
                  _ => 'Awam',
                },
                style: TextStyle(
                    fontSize: 12.5,
                    color: context.mm.onCardMuted,
                    fontWeight: FontWeight.w700),
              ),
              const Spacer(),
              _menuButton(context, ref),
            ],
          ),
        ],
      ),
    );
  }

  Widget _menuButton(BuildContext context, WidgetRef ref) {
    return PopupMenuButton<String>(
      icon: Icon(Icons.more_horiz, color: context.mm.iconMuted),
      onSelected: (v) async {
        final service = ref.read(socialServiceProvider);
        switch (v) {
          case 'edit':
            _editCaption(context, ref);
          case 'public':
          case 'followers':
          case 'private':
            await service.editPost(postId: post.id, visibility: v);
          case 'delete':
            final ok = await _confirmDelete(context);
            if (ok) await service.deletePost(post.id);
        }
      },
      itemBuilder: (menuContext) => [
        const PopupMenuItem(value: 'edit', child: Text('Edit kapsyen')),
        const PopupMenuItem(value: 'public', child: Text('Jadikan Awam')),
        const PopupMenuItem(value: 'followers', child: Text('Pengikut sahaja')),
        const PopupMenuItem(value: 'private', child: Text('Peribadi')),
        const PopupMenuItem(value: 'delete', child: Text('Padam post')),
      ],
    );
  }

  void _editCaption(BuildContext context, WidgetRef ref) {
    final controller =
        TextEditingController(text: post.data['text'] as String? ?? '');
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.mm.appBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 18,
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Edit kapsyen',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              maxLines: 4,
              maxLength: 500,
              decoration: InputDecoration(
                filled: true,
                fillColor: context.mm.card,
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            FilledButton(
              onPressed: () async {
                await ref
                    .read(socialServiceProvider)
                    .editPost(postId: post.id, text: controller.text.trim());
                if (sheetContext.mounted) Navigator.pop(sheetContext);
              },
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primaryRed,
                minimumSize: const Size.fromHeight(48),
              ),
              child: const Text('Simpan',
                  style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      ),
    );
  }
}

class _MyCommentsTab extends ConsumerWidget {
  const _MyCommentsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comments = ref.watch(myCommentsProvider);
    return comments.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, st) => Center(child: Text('😕 $e')),
      data: (list) {
        if (list.isEmpty) {
          return const _Empty(
              icon: Icons.mode_comment_outlined,
              text: 'Belum ada komen. Sertai perbualan di Feed!');
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
          children: list.map((c) => _MyCommentCard(comment: c)).toList(),
        );
      },
    );
  }
}

class _MyCommentCard extends ConsumerWidget {
  const _MyCommentCard({required this.comment});

  final FeedPostData comment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = comment.data['text'] as String? ?? '';
    final postId = comment.data['postId'] as String? ?? '';
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.mm.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.mm.border),
      ),
      child: Row(
        children: [
          Icon(Icons.mode_comment_outlined,
              size: 18, color: context.mm.iconMuted),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 13.5, fontWeight: FontWeight.w600)),
          ),
          PopupMenuButton<String>(
            icon: Icon(Icons.more_horiz, color: context.mm.iconMuted, size: 20),
            onSelected: (v) async {
              final service = ref.read(socialServiceProvider);
              if (v == 'edit') {
                _edit(context, ref, postId);
              } else if (v == 'delete') {
                final ok = await _confirmDelete(context);
                if (ok) {
                  await service.deleteComment(
                      postId: postId, commentId: comment.id);
                }
              }
            },
            itemBuilder: (menuContext) => [
              const PopupMenuItem(value: 'edit', child: Text('Edit')),
              const PopupMenuItem(value: 'delete', child: Text('Padam')),
            ],
          ),
        ],
      ),
    );
  }

  void _edit(BuildContext context, WidgetRef ref, String postId) {
    final controller =
        TextEditingController(text: comment.data['text'] as String? ?? '');
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.mm.appBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 18,
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Edit komen',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              maxLines: 3,
              maxLength: 300,
              decoration: InputDecoration(
                filled: true,
                fillColor: context.mm.card,
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            FilledButton(
              onPressed: () async {
                final body = controller.text.trim();
                if (body.isEmpty) return;
                await ref.read(socialServiceProvider).editComment(
                    postId: postId, commentId: comment.id, body: body);
                if (sheetContext.mounted) Navigator.pop(sheetContext);
              },
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primaryRed,
                minimumSize: const Size.fromHeight(48),
              ),
              child: const Text('Simpan',
                  style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      ),
    );
  }
}

Future<bool> _confirmDelete(BuildContext context) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('Padam?'),
      content: const Text('Kandungan ini akan dibuang dari feed.'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: const Text('Batal'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          style: FilledButton.styleFrom(backgroundColor: AppColors.primaryRed),
          child: const Text('Padam'),
        ),
      ],
    ),
  );
  return ok ?? false;
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 54, color: context.mm.iconMuted),
            const SizedBox(height: 14),
            Text(text,
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: context.mm.onCardMuted,
                    fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
