import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../../core/widgets/makan_avatar.dart';
import '../social/food_profile.dart';
import '../social/social_providers.dart';
import 'dm_service.dart';

/// DM V1: perbualan 1-lawan-1 (/dm/chat/:otherUid).
class DmConversationScreen extends ConsumerStatefulWidget {
  const DmConversationScreen({super.key, required this.otherUid});

  final String otherUid;

  @override
  ConsumerState<DmConversationScreen> createState() =>
      _DmConversationScreenState();
}

class _DmConversationScreenState
    extends ConsumerState<DmConversationScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _sending = false;
  late final _logger = ref.read(eventLoggerProvider);

  String get _myUid =>
      ref.read(authRepositoryProvider).currentUser?.uid ?? '';
  String get _threadId => dmThreadId(_myUid, widget.otherUid);

  @override
  void initState() {
    super.initState();
    _logger.logEvent(
      EventType.dmThreadOpened,
      sourceScreen: 'dm_conversation',
      metadata: {'threadId': _threadId, 'otherUserId': widget.otherUid},
    );
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _jumpToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  Future<void> _send() async {
    final l = AppLocalizations.of(context);
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    // Blok (arah saya → dia) disemak client; arah dia → saya dan
    // penguatkuasaan muktamad ada di RULES Firestore (dua arah).
    final blocked =
        ref.read(myBlockedIdsProvider).value ?? const <String>{};
    if (blocked.contains(widget.otherUid)) {
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('dmCannotMessage'))));
      return;
    }
    setState(() => _sending = true);
    try {
      await sendDmMessage(ref,
          myUid: _myUid, otherUid: widget.otherUid, text: text);
      _input.clear();
      _jumpToBottom();
    } catch (_) {
      _logger.logEvent(
        EventType.dmSendFailed,
        sourceScreen: 'dm_conversation',
        metadata: {'threadId': _threadId, 'otherUserId': widget.otherUid},
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('📡 ${l.t('dmSendFailed')}')));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _menu(FoodProfile? profile) async {
    final l = AppLocalizations.of(context);
    final thread = ref.read(dmThreadProvider(_threadId)).value;
    final mutedFor = (thread?['mutedFor'] as Map?) ?? const {};
    final muted = mutedFor[_myUid] == true;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.mm.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (thread != null)
              ListTile(
                leading: Icon(muted
                    ? Icons.notifications_active_outlined
                    : Icons.notifications_off_outlined),
                title: Text(muted ? l.t('unmute') : l.t('mute')),
                onTap: () async {
                  Navigator.pop(ctx);
                  try {
                    await FirebaseFirestore.instance
                        .collection('dm_threads')
                        .doc(_threadId)
                        .set({
                      'mutedFor': {_myUid: !muted},
                    }, SetOptions(merge: true));
                    _logger.logEvent(
                      EventType.dmMuteToggled,
                      sourceScreen: 'dm_conversation',
                      metadata: {'threadId': _threadId, 'muted': !muted},
                    );
                  } catch (_) {}
                },
              ),
            ListTile(
              leading: const Icon(Icons.flag_outlined),
              title: Text(l.t('report')),
              onTap: () {
                _logger.logEvent(
                  EventType.dmReportTapped,
                  sourceScreen: 'dm_conversation',
                  metadata: {
                    'threadId': _threadId,
                    'otherUserId': widget.otherUid,
                  },
                );
                ref.read(socialServiceProvider).reportContent(
                      targetType: 'user',
                      targetUid: widget.otherUid,
                      reason: 'dm',
                    );
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(l.t('reportSent'))));
              },
            ),
            ListTile(
              leading: const Icon(Icons.block_outlined,
                  color: AppColors.primaryRed),
              title: Text(l.t('block'),
                  style: const TextStyle(color: AppColors.primaryRed)),
              onTap: () {
                _logger.logEvent(
                  EventType.dmBlockTapped,
                  sourceScreen: 'dm_conversation',
                  metadata: {
                    'threadId': _threadId,
                    'otherUserId': widget.otherUid,
                  },
                );
                ref
                    .read(socialServiceProvider)
                    .blockUser(widget.otherUid);
                Navigator.pop(ctx);
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  String _bubbleTime(dynamic ts) {
    final t = ts is Timestamp ? ts.toDate() : null;
    if (t == null) return '…';
    final h = t.hour.toString().padLeft(2, '0');
    final m = t.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final myUid = _myUid;
    final profile =
        ref.watch(publicProfileProvider(widget.otherUid)).value;
    final messagesAsync = ref.watch(dmMessagesProvider(_threadId));
    final messages = messagesAsync.value ?? const [];
    final blocked =
        (ref.watch(myBlockedIdsProvider).value ?? const <String>{})
            .contains(widget.otherUid);

    // Tanda dibaca bila thread dibuka / mesej baharu tiba.
    final thread = ref.watch(dmThreadProvider(_threadId)).value;
    final myUnread =
        ((thread?['unreadCounts'] as Map?)?[myUid] as num?)?.toInt() ?? 0;
    if (myUnread > 0) {
      markDmRead(ref,
          threadId: _threadId, myUid: myUid, currentUnread: myUnread);
    }
    if (messages.isNotEmpty) _jumpToBottom();

    return Scaffold(
      backgroundColor: AppColors.threadsBg,
      appBar: AppBar(
        backgroundColor: AppColors.threadsBg,
        foregroundColor: AppColors.threadsText,
        surfaceTintColor: Colors.transparent,
        titleSpacing: 0,
        title: InkWell(
          onTap: () => context.push('/u/${widget.otherUid}'),
          child: Row(
            children: [
              MakanAvatar(
                radius: 17,
                photoUrl: profile?.photoUrl,
                presetId: profile?.avatarPreset,
                displayName: profile?.displayName,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(profile?.displayName ?? 'Foodie',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: AppColors.threadsText,
                            fontWeight: FontWeight.w800,
                            fontSize: 15)),
                    if (profile?.username != null)
                      Text('@${profile!.username}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: AppColors.threadsMuted,
                              fontSize: 11.5)),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.more_vert),
            onPressed: () => _menu(profile),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: messagesAsync.isLoading && messages.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : messages.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(32),
                          child: Text(
                            l.t('dmStartHint'),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                                color: AppColors.threadsMuted,
                                fontWeight: FontWeight.w600,
                                fontSize: 14),
                          ),
                        ),
                      )
                    : ListView.builder(
                        controller: _scroll,
                        padding:
                            const EdgeInsets.fromLTRB(16, 12, 16, 8),
                        itemCount: messages.length,
                        itemBuilder: (context, i) {
                          final (_, m) = messages[i];
                          final mine = m['senderId'] == myUid;
                          return Align(
                            alignment: mine
                                ? Alignment.centerRight
                                : Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 13, vertical: 9),
                              constraints: BoxConstraints(
                                maxWidth: MediaQuery.of(context)
                                        .size
                                        .width *
                                    0.75,
                              ),
                              decoration: BoxDecoration(
                                color: mine
                                    ? AppColors.primaryRed
                                    : AppColors.threadsSurface,
                                borderRadius: BorderRadius.only(
                                  topLeft: const Radius.circular(16),
                                  topRight: const Radius.circular(16),
                                  bottomLeft: Radius.circular(
                                      mine ? 16 : 4),
                                  bottomRight: Radius.circular(
                                      mine ? 4 : 16),
                                ),
                                border: mine
                                    ? null
                                    : Border.all(
                                        color: AppColors.threadsBorder),
                              ),
                              child: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.end,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    m['text'] as String? ?? '',
                                    style: TextStyle(
                                      color: mine
                                          ? Colors.white
                                          : AppColors.threadsText,
                                      fontSize: 14.5,
                                      height: 1.3,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    _bubbleTime(m['createdAt']),
                                    style: TextStyle(
                                      color: mine
                                          ? Colors.white70
                                          : AppColors.threadsMuted,
                                      fontSize: 10.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
          ),
          // Input mesej.
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(14, 8, 8, 10),
              decoration: BoxDecoration(
                color: AppColors.threadsSurface,
                border: Border(
                    top: BorderSide(color: AppColors.threadsBorder)),
              ),
              child: blocked
                  ? Padding(
                      padding: const EdgeInsets.all(8),
                      child: Text(
                        '🚫 ${l.t('dmCannotMessage')}',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            color: AppColors.threadsMuted,
                            fontWeight: FontWeight.w600),
                      ),
                    )
                  : Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _input,
                            maxLength: 1000,
                            minLines: 1,
                            maxLines: 4,
                            textInputAction: TextInputAction.send,
                            onSubmitted: (_) => _send(),
                            style: TextStyle(
                                color: AppColors.threadsText),
                            decoration: InputDecoration(
                              hintText: l.t('dmInputHint'),
                              hintStyle: TextStyle(
                                  color: AppColors.threadsMuted),
                              counterText: '',
                              isDense: true,
                              filled: true,
                              fillColor: AppColors.threadsBg,
                              contentPadding:
                                  const EdgeInsets.symmetric(
                                      horizontal: 14, vertical: 10),
                              border: OutlineInputBorder(
                                borderRadius:
                                    BorderRadius.circular(20),
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
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2),
                                )
                              : const Icon(Icons.send_rounded,
                                  color: AppColors.primaryRed),
                        ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
