import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_colors.dart';
import 'social_providers.dart';

/// /profile/activity - My Posts, My Comments (kawalan kandungan sendiri).
class MyActivityScreen extends ConsumerWidget {
  const MyActivityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Aktiviti Saya'),
          bottom: const TabBar(
            labelColor: AppColors.primaryRed,
            unselectedLabelColor: AppColors.mutedText,
            indicatorColor: AppColors.primaryRed,
            labelStyle:
                TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
            tabs: [
              Tab(text: 'Post Saya'),
              Tab(text: 'Komen Saya'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [_MyPostsTab(), _MyCommentsTab()],
        ),
      ),
    );
  }
}

class _MyPostsTab extends ConsumerWidget {
  const _MyPostsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final posts = ref.watch(myPostsProvider);
    return posts.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, st) => Center(child: Text('😕 $e')),
      data: (list) {
        if (list.isEmpty) {
          return const _Empty(
              icon: Icons.article_outlined,
              text: 'Belum ada post. Kongsi makan best kau di Feed!');
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
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.softBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (text.isNotEmpty)
            Text(text,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.favorite,
                  size: 15, color: AppColors.primaryRed),
              const SizedBox(width: 4),
              Text('$likeCount',
                  style: const TextStyle(
                      fontSize: 12.5,
                      color: AppColors.mutedText,
                      fontWeight: FontWeight.w700)),
              const SizedBox(width: 12),
              Icon(
                switch (visibility) {
                  'private' => Icons.lock_outline,
                  'followers' => Icons.people_outline,
                  _ => Icons.public,
                },
                size: 14,
                color: AppColors.mutedText,
              ),
              const SizedBox(width: 4),
              Text(
                switch (visibility) {
                  'private' => 'Peribadi',
                  'followers' => 'Pengikut',
                  _ => 'Awam',
                },
                style: const TextStyle(
                    fontSize: 12.5,
                    color: AppColors.mutedText,
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
      icon: const Icon(Icons.more_horiz, color: AppColors.mutedText),
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
        const PopupMenuItem(
            value: 'followers', child: Text('Pengikut sahaja')),
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
      backgroundColor: AppColors.creamBackground,
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
                style:
                    TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              maxLines: 4,
              maxLength: 500,
              decoration: InputDecoration(
                filled: true,
                fillColor: AppColors.cardWhite,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
            ),
            FilledButton(
              onPressed: () async {
                await ref.read(socialServiceProvider).editPost(
                    postId: post.id, text: controller.text.trim());
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
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.softBorder),
      ),
      child: Row(
        children: [
          const Icon(Icons.mode_comment_outlined,
              size: 18, color: AppColors.mutedText),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 13.5, fontWeight: FontWeight.w600)),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_horiz,
                color: AppColors.mutedText, size: 20),
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
      backgroundColor: AppColors.creamBackground,
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
                style:
                    TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              maxLines: 3,
              maxLength: 300,
              decoration: InputDecoration(
                filled: true,
                fillColor: AppColors.cardWhite,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12)),
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
            Icon(icon, size: 54, color: AppColors.mutedText),
            const SizedBox(height: 14),
            Text(text,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: AppColors.mutedText,
                    fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
