import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/localization/app_localizations.dart';
import '../../../app/theme.dart';
import '../../../core/services/restaurant_engagement_service.dart';
import 'restaurant_engagement_providers.dart';

/// Backend limit for a customer menu comment (identity.ts MENU_COMMENT_TEXT_MAX).
/// The server remains the final validator; this only avoids a doomed round trip.
const int kMenuCommentTextMax = 300;

/// WAVE 3D Gate 2 — comment surface for ONE exact menu item.
///
/// Identity is always `canonicalPlaceId + menuItemId`. Reads are constrained to
/// `status == 'visible'`, so a moderator-hidden or removed comment is neither
/// rendered nor even returned. Writes go through `createMenuComment`; the client
/// never writes `menu_comments`.
Future<void> showMenuCommentSheet(
  BuildContext context, {
  required String canonicalPlaceId,
  required String menuItemId,
  required String menuItemName,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => MenuCommentSheet(
      canonicalPlaceId: canonicalPlaceId,
      menuItemId: menuItemId,
      menuItemName: menuItemName,
    ),
  );
}

class MenuCommentSheet extends ConsumerStatefulWidget {
  const MenuCommentSheet({
    super.key,
    required this.canonicalPlaceId,
    required this.menuItemId,
    required this.menuItemName,
  });

  final String canonicalPlaceId;
  final String menuItemId;
  final String menuItemName;

  @override
  ConsumerState<MenuCommentSheet> createState() => _MenuCommentSheetState();
}

class _MenuCommentSheetState extends ConsumerState<MenuCommentSheet> {
  final _controller = TextEditingController();
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    // Rebuild as the user types so Send can stay disabled while the field is
    // blank or whitespace-only.
    _controller.addListener(() => setState(() {}));
  }

  bool get _canSend => _controller.text.trim().isNotEmpty && !_sending;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(restaurantEngagementServiceProvider).createMenuComment(
            canonicalPlaceId: widget.canonicalPlaceId,
            menuItemId: widget.menuItemId,
            text: text,
          );
      _controller.clear();
      // The thread is a live snapshot stream, so a successful create refreshes
      // itself; nothing is optimistically inserted.
    } on RestaurantEngagementException catch (error) {
      if (mounted) _toast(error.message);
    } catch (_) {
      if (mounted) _toast(AppLocalizations.of(context).t('menuCommentFailed'));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    final target = MenuCommentTarget(
      canonicalPlaceId: widget.canonicalPlaceId,
      menuItemId: widget.menuItemId,
    );
    final async = ref.watch(menuCommentsProvider(target));

    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.menuItemName,
            key: const Key('menu-comment-item-name'),
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 2),
          Text(
            t.t('menuCommentsTitle'),
            style: TextStyle(fontSize: 12.5, color: mm.onCardMuted),
          ),
          const SizedBox(height: 14),
          ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.45,
            ),
            child: async.when(
              loading: () => const Padding(
                key: Key('menu-comment-loading'),
                padding: EdgeInsets.symmetric(vertical: 28),
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              ),
              error: (error, stack) => Padding(
                key: const Key('menu-comment-error'),
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text(t.t('menuCommentFailed'),
                    style: TextStyle(color: mm.onCardMuted)),
              ),
              data: (comments) => comments.isEmpty
                  ? Padding(
                      key: const Key('menu-comment-empty'),
                      padding: const EdgeInsets.symmetric(vertical: 22),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(t.t('menuCommentEmptyTitle'),
                              style: TextStyle(
                                  color: mm.onCard,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700)),
                          const SizedBox(height: 4),
                          Text(t.t('menuCommentEmptySubtitle'),
                              style: TextStyle(
                                  color: mm.onCardMuted, fontSize: 13)),
                        ],
                      ),
                    )
                  : ListView(
                      key: const Key('menu-comment-list'),
                      shrinkWrap: true,
                      children: _thread(comments)
                          .map((entry) => _tile(mm, t, entry))
                          .toList(growable: false),
                    ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  key: const Key('menu-comment-input'),
                  controller: _controller,
                  maxLength: kMenuCommentTextMax,
                  minLines: 1,
                  maxLines: 3,
                  decoration: InputDecoration(
                    hintText: t.t('menuCommentAdd'),
                    counterText: '',
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                key: const Key('menu-comment-send'),
                onPressed: _canSend ? _send : null,
                icon: _sending
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.send_rounded),
                tooltip: t.t('menuCommentSend'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Flat threading exactly as the backend stores it: root comments in order,
  /// each followed by its direct replies. One level only — the collection
  /// contract is a single `parentCommentId` link, so no deeper nesting is
  /// invented here.
  List<_ThreadEntry> _thread(List<MenuCommentData> comments) {
    final roots = comments.where((c) => c.isRootComment).toList();
    final byParent = <String, List<MenuCommentData>>{};
    for (final c in comments) {
      final parent = c.parentCommentId;
      if (parent != null) {
        byParent.putIfAbsent(parent, () => <MenuCommentData>[]).add(c);
      }
    }
    final out = <_ThreadEntry>[];
    for (final root in roots) {
      out.add(_ThreadEntry(root, isReply: false));
      for (final reply in byParent[root.id] ?? const <MenuCommentData>[]) {
        out.add(_ThreadEntry(reply, isReply: true));
      }
    }
    // A reply whose parent is not in this visible page still renders, flat, so
    // a moderated parent never silently swallows an official reply.
    final rendered = out.map((e) => e.comment.id).toSet();
    for (final c in comments) {
      if (!rendered.contains(c.id)) out.add(_ThreadEntry(c, isReply: true));
    }
    return out;
  }

  Widget _tile(MMColors mm, AppLocalizations t, _ThreadEntry entry) {
    final c = entry.comment;
    final official = c.isRestaurantReply;
    return Padding(
      padding: EdgeInsets.only(
        left: entry.isReply ? 20 : 0,
        top: 6,
        bottom: 6,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Flexible(
                child: Text(
                  c.displayName,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 14),
                ),
              ),
              if (official) ...[
                const SizedBox(width: 6),
                // Official restaurant reply is visually distinct from a user
                // comment. The label names the RESTAURANT; the acting merchant
                // identity is never present in the document.
                Container(
                  key: const Key('menu-comment-official-badge'),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: mm.chipSelectedBackground,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.verified_rounded, size: 12),
                      const SizedBox(width: 3),
                      Text(
                        t.t('restaurantOfficialBadge'),
                        style: const TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 2),
          Text(c.text, style: TextStyle(fontSize: 14, color: mm.onCard)),
        ],
      ),
    );
  }
}

class _ThreadEntry {
  const _ThreadEntry(this.comment, {required this.isReply});

  final MenuCommentData comment;
  final bool isReply;
}
