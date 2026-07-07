import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../social/compose_sheet.dart';
import '../social/post_card.dart';
import '../social/social_providers.dart';
import 'group_bills_screen.dart';
import 'group_polls.dart';
import 'group_providers.dart';
import 'group_status.dart';

/// Group Hub V4: feed grup, undian, bil Tong-Tong, ahli + status dikongsi.
class GroupHubScreen extends ConsumerWidget {
  const GroupHubScreen({super.key, required this.groupId});

  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final group = ref.watch(groupProvider(groupId)).value;
    final role = ref.watch(myGroupRoleProvider(groupId)).value;
    final isMember = role != null;
    final canPost = role != null && role != 'viewer';

    if (group == null) {
      return const Scaffold(
        backgroundColor: AppColors.threadsBg,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (!isMember) {
      return _JoinPrompt(groupId: groupId, name: group.name, emoji: group.emoji);
    }

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        backgroundColor: AppColors.threadsBg,
        appBar: AppBar(
          backgroundColor: AppColors.threadsBg,
          foregroundColor: AppColors.threadsText,
          surfaceTintColor: Colors.transparent,
          title: Text('${group.emoji} ${group.name}',
              style: const TextStyle(color: AppColors.threadsText)),
          actions: [
            IconButton(
              tooltip: l.t('shareStatus'),
              icon: const Icon(Icons.mood),
              onPressed: () => showShareStatusSheet(context, groupId),
            ),
            IconButton(
              tooltip: l.t('groupSettings'),
              icon: const Icon(Icons.settings_outlined),
              onPressed: () => context.push('/groups/$groupId/settings'),
            ),
          ],
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            labelColor: AppColors.threadsText,
            unselectedLabelColor: AppColors.threadsMuted,
            indicatorColor: AppColors.primaryRed,
            tabs: [
              Tab(text: l.t('groupTabFeed')),
              Tab(text: l.t('groupTabPolls')),
              Tab(text: l.t('groupTabBills')),
              Tab(text: l.t('groupTabMembers')),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _GroupFeedTab(groupId: groupId, canPost: canPost),
            _GroupPollsTab(groupId: groupId, canPost: canPost),
            GroupBillsTab(groupId: groupId, canCreate: canPost),
            _GroupMembersTab(groupId: groupId),
          ],
        ),
      ),
    );
  }
}

class _JoinPrompt extends ConsumerWidget {
  const _JoinPrompt(
      {required this.groupId, required this.name, required this.emoji});
  final String groupId;
  final String name;
  final String emoji;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.threadsBg,
      appBar: AppBar(
        backgroundColor: AppColors.threadsBg,
        foregroundColor: AppColors.threadsText,
        surfaceTintColor: Colors.transparent,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(emoji, style: const TextStyle(fontSize: 64)),
              const SizedBox(height: 16),
              Text(name,
                  style: const TextStyle(
                      color: AppColors.threadsText,
                      fontWeight: FontWeight.w800,
                      fontSize: 20)),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () =>
                    ref.read(socialServiceProvider).joinGroupV2(groupId),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primaryRed,
                  minimumSize: const Size(200, 48),
                ),
                child: Text(l.t('joinGroup')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GroupFeedTab extends ConsumerWidget {
  const _GroupFeedTab({required this.groupId, required this.canPost});
  final String groupId;
  final bool canPost;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final group = ref.watch(groupProvider(groupId)).value;
    final posts = ref.watch(groupFeedProvider(groupId)).value ?? const [];

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: canPost
          ? FloatingActionButton(
              heroTag: 'composeGroupHub',
              onPressed: () => showComposeSheet(context, groupId: groupId),
              backgroundColor: AppColors.primaryRed,
              child: const Icon(Icons.edit, color: Colors.white),
            )
          : null,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 120),
        children: [
          if (group?.pinnedAnnouncement != null &&
              group!.pinnedAnnouncement!.isNotEmpty)
            _pinnedCard('📌', group.pinnedAnnouncement!),
          if (group?.pinnedPlaceName != null &&
              group!.pinnedPlaceName!.isNotEmpty)
            _pinnedCard('📍', group.pinnedPlaceName!),
          GroupStatusStrip(groupId: groupId),
          if (posts.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 50),
              child: Column(
                children: [
                  Text(group?.emoji ?? '🍜',
                      style: const TextStyle(fontSize: 52)),
                  const SizedBox(height: 12),
                  Text(l.t('feedEmpty'),
                      style: const TextStyle(
                          color: AppColors.threadsMuted,
                          fontWeight: FontWeight.w600)),
                ],
              ),
            )
          else
            ...posts.expand((p) => [
                  PostCard(post: p, key: ValueKey(p.id)),
                  const Divider(
                      height: 1,
                      thickness: 0.6,
                      color: AppColors.threadsBorder),
                ]),
        ],
      ),
    );
  }

  Widget _pinnedCard(String emoji, String text) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.threadsSurface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.warmYellow.withValues(alpha: 0.4)),
        ),
        child: Row(
          children: [
            Text(emoji, style: const TextStyle(fontSize: 18)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(text,
                  style: const TextStyle(
                      color: AppColors.threadsText,
                      fontWeight: FontWeight.w600,
                      fontSize: 13.5)),
            ),
          ],
        ),
      );
}

class _GroupPollsTab extends ConsumerWidget {
  const _GroupPollsTab({required this.groupId, required this.canPost});
  final String groupId;
  final bool canPost;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final polls = ref.watch(groupPollsProvider(groupId)).value ?? const [];

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: canPost
          ? FloatingActionButton.extended(
              heroTag: 'createPoll',
              onPressed: () => showCreatePollSheet(context, groupId),
              backgroundColor: AppColors.primaryRed,
              icon: const Icon(Icons.add_chart, color: Colors.white),
              label: Text(l.t('createPoll'),
                  style: const TextStyle(color: Colors.white)),
            )
          : null,
      body: polls.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text('🗳️', style: TextStyle(fontSize: 52)),
                    const SizedBox(height: 12),
                    Text(l.t('noPolls'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: AppColors.threadsMuted,
                            fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 120),
              children: polls
                  .map((p) => PollCard(groupId: groupId, poll: p))
                  .toList(),
            ),
    );
  }
}

class _GroupMembersTab extends ConsumerWidget {
  const _GroupMembersTab({required this.groupId});
  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final members =
        ref.watch(groupMembersProvider(groupId)).value ?? const [];
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 120),
      children: members.map((m) {
        final role = (m['role'] as String?) ?? 'member';
        return ListTile(
          onTap: () => context.push('/u/${m['uid']}'),
          leading: CircleAvatar(
            radius: 22,
            backgroundColor: AppColors.softYellow,
            backgroundImage: m['photoUrl'] != null
                ? NetworkImage(m['photoUrl'] as String)
                : null,
            child: m['photoUrl'] == null
                ? const Text('😋', style: TextStyle(fontSize: 20))
                : null,
          ),
          title: Text((m['displayName'] as String?) ?? 'Foodie',
              style: const TextStyle(
                  color: AppColors.threadsText, fontWeight: FontWeight.w700)),
          subtitle: Text(_roleLabel(l, role),
              style: const TextStyle(color: AppColors.threadsMuted)),
          trailing: role == 'owner'
              ? const Icon(Icons.star, color: AppColors.warmYellow, size: 18)
              : null,
        );
      }).toList(),
    );
  }

  String _roleLabel(AppLocalizations l, String role) => switch (role) {
        'owner' => l.t('roleOwner'),
        'admin' => l.t('roleAdmin'),
        'viewer' => l.t('roleViewer'),
        _ => l.t('roleMember'),
      };
}
