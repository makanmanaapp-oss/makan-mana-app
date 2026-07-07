import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import 'social_providers.dart';

/// Sheet komen gaya Threads: senarai + input di bawah.
Future<void> showCommentsSheet(BuildContext context, String postId) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.threadsBg,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (sheetContext) => Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
      ),
      child: SizedBox(
        height: MediaQuery.of(sheetContext).size.height * 0.7,
        child: _CommentSheet(postId: postId),
      ),
    ),
  );
}

class _CommentSheet extends ConsumerStatefulWidget {
  const _CommentSheet({required this.postId});

  final String postId;

  @override
  ConsumerState<_CommentSheet> createState() => _CommentSheetState();
}

class _CommentSheetState extends ConsumerState<_CommentSheet> {
  final _controller = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    final name = ref.read(myDisplayNameProvider).value ?? 'Foodie';
    setState(() => _sending = true);
    try {
      final myDoc = ref.read(myUserDocProvider).value;
      await FirebaseFirestore.instance
          .collection('feed_posts')
          .doc(widget.postId)
          .collection('comments')
          .add({
        'authorUid': uid,
        'displayName': name,
        'photoUrl': myDoc?['photoUrl'],
        'text': text,
        'createdAt': FieldValue.serverTimestamp(),
      }).timeout(const Duration(seconds: 15));
      _controller.clear();
    } catch (_) {
      if (mounted) {
        final l = AppLocalizations.of(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('📡 ${l.t('postFailed')}')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _maybeDelete(FeedPostData comment) async {
    final l = AppLocalizations.of(context);
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    if (comment.data['authorUid'] != uid) return;
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
      await FirebaseFirestore.instance
          .collection('feed_posts')
          .doc(widget.postId)
          .collection('comments')
          .doc(comment.id)
          .delete();
    }
  }

  String _timeAgo(BuildContext context, dynamic ts) {
    final l = AppLocalizations.of(context);
    if (ts is! Timestamp) return l.t('justNow');
    final diff = DateTime.now().difference(ts.toDate());
    if (diff.inMinutes < 1) return l.t('justNow');
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}j';
    return '${diff.inDays}h';
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final commentsAsync = ref.watch(commentsProvider(widget.postId));

    return Column(
      children: [
        Container(
          height: 4,
          width: 44,
          margin: const EdgeInsets.only(top: 12, bottom: 10),
          decoration: BoxDecoration(
            color: AppColors.threadsBorder,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        Text(
          l.t('commentsTitle'),
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: AppColors.threadsText,
          ),
        ),
        const SizedBox(height: 6),
        const Divider(height: 1, color: AppColors.softBorder),
        Expanded(
          child: commentsAsync.when(
            loading: () =>
                const Center(child: CircularProgressIndicator()),
            error: (e, st) => Center(
                child: Text('😕', style: const TextStyle(fontSize: 30))),
            data: (comments) {
              if (comments.isEmpty) {
                return Center(
                  child: Text(
                    l.t('noComments'),
                    style: const TextStyle(
                      color: AppColors.threadsMuted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                );
              }
              return ListView.builder(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                itemCount: comments.length,
                itemBuilder: (context, i) {
                  final c = comments[i];
                  return GestureDetector(
                    onLongPress: () => _maybeDelete(c),
                    behavior: HitTestBehavior.opaque,
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CircleAvatar(
                            radius: 16,
                            backgroundColor: AppColors.softYellow,
                            backgroundImage: c.data['photoUrl'] != null
                                ? NetworkImage(
                                    c.data['photoUrl'] as String)
                                : null,
                            child: c.data['photoUrl'] == null
                                ? const Text('😋',
                                    style: TextStyle(fontSize: 16))
                                : null,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment:
                                  CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        c.data['displayName']
                                                as String? ??
                                            'Foodie',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 13.5,
                                          color: AppColors.threadsText,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    Text(
                                      _timeAgo(
                                          context, c.data['createdAt']),
                                      style: const TextStyle(
                                        color: AppColors.threadsMuted,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  c.data['text'] as String? ?? '',
                                  style: const TextStyle(
                                    fontSize: 14,
                                    height: 1.35,
                                    color: AppColors.threadsText,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
        // Input komen.
        Container(
          padding: const EdgeInsets.fromLTRB(16, 8, 8, 12),
          decoration: const BoxDecoration(
            color: AppColors.threadsSurface,
            border: Border(
              top: BorderSide(color: AppColors.threadsBorder),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  maxLength: 300,
                  minLines: 1,
                  maxLines: 3,
                  style: const TextStyle(color: AppColors.threadsText),
                  decoration: InputDecoration(
                    hintText: l.t('commentHint'),
                    hintStyle:
                        const TextStyle(color: AppColors.threadsMuted),
                    counterText: '',
                    isDense: true,
                    filled: true,
                    fillColor: AppColors.threadsBg,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(20),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              IconButton(
                onPressed: _sending ? null : _send,
                icon: _sending
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child:
                            CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send_rounded,
                        color: AppColors.primaryRed),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
