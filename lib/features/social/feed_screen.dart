import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../groups/group_providers.dart';
import 'compose_sheet.dart';
import 'food_profile.dart';
import 'post_card.dart';
import 'social_providers.dart';

/// Feed Makan V4: 5 tab fokus makanan (Threads/X style).
/// Untuk Anda • Mengikuti • Berdekatan • Trending • Grup.
class FeedScreen extends ConsumerWidget {
  const FeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    return DefaultTabController(
      length: 5,
      child: Scaffold(
        backgroundColor: AppColors.threadsBg,
        appBar: AppBar(
          backgroundColor: AppColors.threadsBg,
          foregroundColor: AppColors.threadsText,
          surfaceTintColor: Colors.transparent,
          title: Text(
            l.t('feedTitle'),
            style: const TextStyle(
                color: AppColors.threadsText, fontWeight: FontWeight.w800),
          ),
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            labelColor: AppColors.threadsText,
            unselectedLabelColor: AppColors.threadsMuted,
            indicatorColor: AppColors.primaryRed,
            tabs: [
              Tab(text: l.t('feedForYou')),
              Tab(text: l.t('feedFollowing')),
              Tab(text: l.t('feedNearby')),
              Tab(text: l.t('feedTrending')),
              Tab(text: l.t('groupsTab')),
            ],
          ),
        ),
        floatingActionButton: FloatingActionButton(
          heroTag: 'composeFeed',
          onPressed: () => showComposeSheet(context),
          backgroundColor: AppColors.primaryRed,
          child: const Icon(Icons.edit, color: Colors.white),
        ),
        body: const TabBarView(
          children: [
            _ForYouTab(),
            _FeedList(source: _FeedSource.following),
            _FeedList(source: _FeedSource.nearby),
            _FeedList(source: _FeedSource.trending),
            _GroupsTab(),
          ],
        ),
      ),
    );
  }
}

enum _FeedSource { forYou, following, nearby, trending }

/// Tab "Untuk Anda" dengan bar karang di atas.
class _ForYouTab extends ConsumerWidget {
  const _ForYouTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    return _FeedList(
      source: _FeedSource.forYou,
      header: InkWell(
        onTap: () => showComposeSheet(context),
        borderRadius: BorderRadius.circular(18),
        child: Container(
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: AppColors.threadsSurface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.threadsBorder),
          ),
          child: Row(
            children: [
              const Text('📝', style: TextStyle(fontSize: 20)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(l.t('composeHint'),
                    style: const TextStyle(
                        color: AppColors.threadsMuted,
                        fontWeight: FontWeight.w600)),
              ),
              const Icon(Icons.add_a_photo_outlined,
                  color: AppColors.primaryRed, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

/// Senarai feed generik + penapisan blok/mute.
class _FeedList extends ConsumerWidget {
  const _FeedList({required this.source, this.header});

  final _FeedSource source;
  final Widget? header;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final asyncPosts = switch (source) {
      _FeedSource.forYou => ref.watch(publicFeedProvider),
      _FeedSource.following => ref.watch(followingFeedProvider),
      _FeedSource.trending => ref.watch(trendingFeedProvider),
      _FeedSource.nearby => ref.watch(publicFeedProvider),
    };
    final blocked = ref.watch(myBlockedIdsProvider).value ?? const {};
    final muted = ref.watch(myMutedIdsProvider).value ?? const {};

    return asyncPosts.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) =>
          Center(child: Text('😕 $e', style: const TextStyle(fontSize: 13))),
      data: (all) {
        var posts = all
            .where((p) =>
                !blocked.contains(p.data['authorUid']) &&
                !muted.contains(p.data['authorUid']))
            .toList();
        if (source == _FeedSource.nearby) {
          posts = posts
              .where((p) =>
                  (p.data['placeName'] as String?)?.isNotEmpty ?? false)
              .toList();
        }
        if (posts.isEmpty) {
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
            children: [
              if (header != null) header!,
              Padding(
                padding: const EdgeInsets.only(top: 60),
                child: Column(
                  children: [
                    Text(_emptyEmoji(), style: const TextStyle(fontSize: 52)),
                    const SizedBox(height: 14),
                    Text(_emptyText(l),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: AppColors.threadsMuted,
                            fontSize: 14.5,
                            fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ],
          );
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
          children: [
            if (header != null) header!,
            ...posts.expand((p) => [
                  PostCard(post: p, key: ValueKey(p.id)),
                  const Divider(
                      height: 1,
                      thickness: 0.6,
                      color: AppColors.threadsBorder),
                ]),
          ],
        );
      },
    );
  }

  String _emptyEmoji() => switch (source) {
        _FeedSource.following => '👥',
        _FeedSource.nearby => '📍',
        _FeedSource.trending => '🔥',
        _FeedSource.forYou => '🍽️',
      };

  String _emptyText(AppLocalizations l) => switch (source) {
        _FeedSource.following => l.t('followingEmpty'),
        _FeedSource.nearby => l.t('nearbyEmpty'),
        _FeedSource.trending => l.t('trendingEmpty'),
        _FeedSource.forYou => l.t('feedEmpty'),
      };
}

/// Tab Grup: grup saya + teroka + cipta grup baharu (Group Hub).
class _GroupsTab extends ConsumerWidget {
  const _GroupsTab();

  Future<void> _createGroup(BuildContext context, WidgetRef ref) async {
    final l = AppLocalizations.of(context);
    final nameController = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l.t('createGroup')),
        content: TextField(
          controller: nameController,
          autofocus: true,
          maxLength: 40,
          decoration: InputDecoration(hintText: l.t('groupName')),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(l.t('cancelAction')),
          ),
          ElevatedButton(
            onPressed: () =>
                Navigator.pop(dialogContext, nameController.text.trim()),
            style: ElevatedButton.styleFrom(minimumSize: const Size(88, 40)),
            child: Text(l.t('createGroup')),
          ),
        ],
      ),
    );
    if (name == null || name.length < 2) return;
    final id = await ref.read(socialServiceProvider).createGroupV2(name: name);
    if (id != null && context.mounted) context.push('/groups/$id');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final groupsAsync = ref.watch(discoverGroupsProvider);
    final myGroups = ref.watch(myGroupIdsProvider).value ?? const {};

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'createGroupHub',
        onPressed: () => _createGroup(context, ref),
        backgroundColor: AppColors.primaryRed,
        icon: const Icon(Icons.group_add, color: Colors.white),
        label: Text(l.t('createGroup'),
            style: const TextStyle(color: Colors.white)),
      ),
      body: groupsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('😕 $e')),
        data: (groups) {
          if (groups.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text('👥', style: TextStyle(fontSize: 56)),
                    const SizedBox(height: 16),
                    Text(l.t('noGroups'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: AppColors.threadsMuted,
                            fontSize: 15,
                            fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            );
          }
          // Grup saya dahulu.
          final mine = groups.where((g) => myGroups.contains(g.id)).toList();
          final others =
              groups.where((g) => !myGroups.contains(g.id)).toList();
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
            children: [
              if (mine.isNotEmpty) ...[
                _sectionLabel(l.t('myGroups')),
                ...mine.map((g) => _groupTile(context, ref, g, true)),
                const SizedBox(height: 16),
              ],
              if (others.isNotEmpty) ...[
                _sectionLabel(l.t('discoverGroups')),
                ...others.map((g) => _groupTile(context, ref, g, false)),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4),
        child: Text(text,
            style: const TextStyle(
                color: AppColors.threadsMuted,
                fontWeight: FontWeight.w800,
                fontSize: 12.5)),
      );

  Widget _groupTile(
      BuildContext context, WidgetRef ref, GroupData g, bool isMember) {
    final l = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: () => context.push('/groups/${g.id}'),
        tileColor: AppColors.threadsSurface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: AppColors.threadsBorder),
        ),
        leading: Text(g.emoji, style: const TextStyle(fontSize: 30)),
        title: Text(g.name,
            style: const TextStyle(
                fontWeight: FontWeight.w700, color: AppColors.threadsText)),
        subtitle: Text('${g.memberCount} ${l.t('membersLabel')}',
            style: const TextStyle(color: AppColors.threadsMuted, fontSize: 12)),
        trailing: isMember
            ? const Icon(Icons.chevron_right, color: AppColors.threadsMuted)
            : OutlinedButton(
                onPressed: () async {
                  await ref.read(socialServiceProvider).joinGroupV2(g.id);
                  if (context.mounted) context.push('/groups/${g.id}');
                },
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(72, 38),
                  foregroundColor: AppColors.threadsText,
                  side: const BorderSide(color: AppColors.threadsBorder),
                ),
                child: Text(l.t('join')),
              ),
      ),
    );
  }
}
