import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../../core/widgets/makan_avatar.dart';
import '../social/food_profile.dart';
import 'dm_service.dart';

/// DM V1: Inbox mesej (/dm).
class DmInboxScreen extends ConsumerStatefulWidget {
  const DmInboxScreen({super.key});

  @override
  ConsumerState<DmInboxScreen> createState() => _DmInboxScreenState();
}

class _DmInboxScreenState extends ConsumerState<DmInboxScreen> {
  @override
  void initState() {
    super.initState();
    ref.read(eventLoggerProvider).logEvent(
          EventType.dmInboxViewed,
          sourceScreen: 'dm_inbox',
        );
  }

  String _timeAgo(AppLocalizations l, dynamic ts) {
    if (ts is! Timestamp) return '';
    final diff = DateTime.now().difference(ts.toDate());
    if (diff.inMinutes < 1) return l.t('justNow');
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}j';
    return '${diff.inDays}h';
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final myUid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
    final threadsAsync = ref.watch(myDmThreadsProvider);
    final threads = threadsAsync.value ?? const [];

    return Scaffold(
      backgroundColor: AppColors.threadsBg,
      appBar: AppBar(
        backgroundColor: AppColors.threadsBg,
        foregroundColor: AppColors.threadsText,
        surfaceTintColor: Colors.transparent,
        title: Text(l.t('dmTitle'),
            style: TextStyle(
                color: AppColors.threadsText, fontWeight: FontWeight.w800)),
      ),
      body: threadsAsync.isLoading && threads.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : threads.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text('💬', style: TextStyle(fontSize: 52)),
                        const SizedBox(height: 14),
                        Text(
                          l.t('dmEmpty'),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: AppColors.threadsMuted,
                              fontWeight: FontWeight.w600,
                              fontSize: 14),
                        ),
                      ],
                    ),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 40),
                  itemCount: threads.length,
                  separatorBuilder: (_, __) => Divider(
                      height: 1,
                      thickness: 0.5,
                      color: AppColors.threadsBorder),
                  itemBuilder: (context, i) {
                    final (threadId, data) = threads[i];
                    final otherUid = dmOtherUid(
                        (data['participantUids'] as List?) ?? const [],
                        myUid);
                    final unread = ((data['unreadCounts']
                                as Map?)?[myUid] as num?)
                            ?.toInt() ??
                        0;
                    return _ThreadTile(
                      threadId: threadId,
                      otherUid: otherUid,
                      lastText:
                          data['lastMessageText'] as String? ?? '',
                      lastMine: data['lastMessageSenderId'] == myUid,
                      timeText: _timeAgo(l, data['lastMessageAt']),
                      unread: unread,
                    );
                  },
                ),
    );
  }
}

class _ThreadTile extends ConsumerWidget {
  const _ThreadTile({
    required this.threadId,
    required this.otherUid,
    required this.lastText,
    required this.lastMine,
    required this.timeText,
    required this.unread,
  });

  final String threadId;
  final String otherUid;
  final String lastText;
  final bool lastMine;
  final String timeText;
  final int unread;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    // Nama/avatar dari profil awam; fallback selamat jika tiada.
    final profile = ref.watch(publicProfileProvider(otherUid)).value;
    final name = profile?.displayName ?? 'Foodie';
    final username = profile?.username;

    return ListTile(
      onTap: otherUid.isEmpty
          ? null
          : () {
              ref.read(eventLoggerProvider).logEvent(
                    EventType.dmThreadOpened,
                    sourceScreen: 'dm_inbox',
                    metadata: {
                      'threadId': threadId,
                      'otherUserId': otherUid,
                    },
                  );
              context.push('/dm/chat/$otherUid');
            },
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      leading: MakanAvatar(
        radius: 24,
        photoUrl: profile?.photoUrl,
        presetId: profile?.avatarPreset,
        displayName: profile?.displayName,
      ),
      title: Row(
        children: [
          Flexible(
            child: Text(name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: AppColors.threadsText,
                    fontWeight:
                        unread > 0 ? FontWeight.w800 : FontWeight.w700,
                    fontSize: 15)),
          ),
          if (username != null) ...[
            const SizedBox(width: 6),
            Flexible(
              child: Text('@$username',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: AppColors.threadsMuted, fontSize: 12)),
            ),
          ],
        ],
      ),
      subtitle: Text(
        lastMine && lastText.isNotEmpty
            ? '${l.t('dmYouPrefix')} $lastText'
            : lastText,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
            color: unread > 0
                ? AppColors.threadsText
                : AppColors.threadsMuted,
            fontWeight: unread > 0 ? FontWeight.w600 : FontWeight.w400,
            fontSize: 13),
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(timeText,
              style: TextStyle(
                  color: AppColors.threadsMuted, fontSize: 11.5)),
          const SizedBox(height: 5),
          if (unread > 0)
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.primaryRed,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text('$unread',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w800)),
            )
          else
            const SizedBox(height: 18),
        ],
      ),
    );
  }
}
