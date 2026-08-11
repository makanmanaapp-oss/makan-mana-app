import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../dm/dm_service.dart';
import '../groups/group_activity.dart';
import '../groups/group_providers.dart';
import 'compose_sheet.dart';
import 'food_profile.dart';
import 'post_card.dart';
import 'social_providers.dart';
import 'social_ui.dart';

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
            style: TextStyle(
                color: AppColors.threadsText, fontWeight: FontWeight.w800),
          ),
          actions: [
            // SP7: pintu masuk DM inbox + badge belum baca.
            Consumer(builder: (context, ref, _) {
              final unread = ref.watch(dmTotalUnreadProvider);
              return IconButton(
                tooltip: l.t('dmTitle'),
                onPressed: () => context.push('/dm'),
                icon: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    const Icon(Icons.send_outlined),
                    if (unread > 0)
                      Positioned(
                        right: -5,
                        top: -5,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 4, vertical: 1),
                          decoration: BoxDecoration(
                            color: AppColors.primaryRed,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text('$unread',
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.w800)),
                        ),
                      ),
                  ],
                ),
              );
            }),
          ],
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
        // HOTFIX 4.4: compose FAB (pensel) HANYA pada tab feed. Pada tab GRUP,
        // sembunyikan — tab Grup ada CTA "Create Group" sendiri; elak DUA FAB
        // bertindih di sudut bawah kanan.
        floatingActionButton: Builder(
          builder: (context) {
            final tab = DefaultTabController.of(context);
            return AnimatedBuilder(
              animation: tab,
              builder: (context, _) {
                if (tab.index == 4) return const SizedBox.shrink();
                return FloatingActionButton(
                  heroTag: 'composeFeed',
                  onPressed: () => showComposeSheet(context),
                  backgroundColor: AppColors.primaryRed,
                  tooltip: l.t('typePost'),
                  child: const Icon(Icons.edit, color: Colors.white),
                );
              },
            );
          },
        ),
        // THREADS REDESIGN: inline "What are you eating today?" composer bar
        // REMOVED — For You now begins directly with feed content (compose via
        // the pencil FAB only). No placeholder, no dead space.
        body: const TabBarView(
          children: [
            _FeedList(source: _FeedSource.forYou),
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

/// Senarai feed generik + penapisan blok/mute.
class _FeedList extends ConsumerWidget {
  const _FeedList({required this.source});

  final _FeedSource source;

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
      // HOTFIX 4.2: JANGAN papar ralat Firestore mentah ($e) kepada pengguna.
      error: (e, _) => Center(
          child: Text('😕 ${l.t('profileError')}',
              style: const TextStyle(fontSize: 13))),
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
              Padding(
                padding: const EdgeInsets.only(top: 60),
                child: Column(
                  children: [
                    Text(_emptyEmoji(), style: const TextStyle(fontSize: 52)),
                    const SizedBox(height: 14),
                    Text(_emptyText(l),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            color: AppColors.threadsMuted,
                            fontSize: 14.5,
                            fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ],
          );
        }
        // FIX 2 (Part 3): senarai MALAS — ListView.builder membina hanya kad
        // KELIHATAN (dulu ListView(children:) membina KESEMUA ~50 kad + imej +
        // strim pengarang + carousel serentak, dan membina semula semuanya
        // setiap kali stream feed memancar semula, cth. satu 'like'). Kunci
        // stabil ValueKey(post.id) pada item — identiti kad kekal betul apabila
        // senarai berubah (elak kitar-semula salah / lompat kad).
        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
          itemCount: posts.length,
          itemBuilder: (context, index) {
            final p = posts[index];
            return Column(
              key: ValueKey(p.id),
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                PostCard(post: p),
                Divider(
                    height: 1,
                    thickness: 0.6,
                    color: AppColors.threadsBorder),
              ],
            );
          },
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

/// Tab Grup: grup saya (dengan aktiviti) + teroka + cipta grup baharu.
class _GroupsTab extends ConsumerStatefulWidget {
  const _GroupsTab();

  @override
  ConsumerState<_GroupsTab> createState() => _GroupsTabState();
}

class _GroupsTabState extends ConsumerState<_GroupsTab> {
  // HOTFIX 4.2: carian grup. Query kosong = My Groups sahaja (tiada Discover
  // auto). Query bermakna = HANYA grup awam sepadan (client-side match atas
  // set awam terbatas — lihat discoverGroupsProvider). Grup peribadi bukan-ahli
  // & grup dipadam TIDAK muncul.
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    ref.read(eventLoggerProvider).logEvent(
          EventType.groupListViewed,
          sourceScreen: 'group_list',
        );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _createGroup(BuildContext context, WidgetRef ref) async {
    final l = AppLocalizations.of(context);
    final nameController = TextEditingController();
    File? pickedImage; // HOTFIX 4.5: foto grup opsyenal (upload SELEPAS cipta).
    // FIX 3: pilih Awam / Peribadi semasa cipta grup.
    final result =
        await showDialog<({String name, String privacy, File? image})>(
      context: context,
      builder: (dialogContext) {
        var privacy = 'public';
        return StatefulBuilder(
          builder: (ctx, setLocal) => AlertDialog(
            title: Text(l.t('createGroup')),
            // FIX 3.1: boleh-skrol supaya papan kekunci (autofocus) tidak
            // menyebabkan RenderFlex overflow pada dialog pendek.
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // HOTFIX 4.5: pratonton + pilih foto grup (opsyenal). Emoji
                  // kekal fallback jika tiada foto.
                  Row(
                    children: [
                      pickedImage != null
                          ? ClipRRect(
                              borderRadius: BorderRadius.circular(16),
                              child: Image.file(pickedImage!,
                                  width: 56, height: 56, fit: BoxFit.cover))
                          : const GroupAvatar(emoji: '🍜', size: 56),
                      const SizedBox(width: 12),
                      TextButton.icon(
                        onPressed: () async {
                          final p = await ImagePicker().pickImage(
                              source: ImageSource.gallery,
                              maxWidth: 1024,
                              imageQuality: 85);
                          if (p != null) {
                            setLocal(() => pickedImage = File(p.path));
                          }
                        },
                        icon: const Icon(Icons.photo_camera_outlined),
                        label: Text(pickedImage == null
                            ? l.t('uploadPhoto')
                            : l.t('changePhoto')),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    controller: nameController,
                    autofocus: true,
                    maxLength: 40,
                    decoration: InputDecoration(hintText: l.t('groupName')),
                  ),
                  const SizedBox(height: 8),
                  _privacyOption(l, setLocal, current: privacy, value: 'public',
                      icon: Icons.public, onPick: () => privacy = 'public'),
                  const SizedBox(height: 6),
                  _privacyOption(l, setLocal, current: privacy, value: 'private',
                      icon: Icons.lock_outline,
                      onPick: () => privacy = 'private'),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: Text(l.t('cancelAction')),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(
                    dialogContext,
                    (
                      name: nameController.text.trim(),
                      privacy: privacy,
                      image: pickedImage
                    )),
                style:
                    ElevatedButton.styleFrom(minimumSize: const Size(88, 40)),
                child: Text(l.t('createGroup')),
              ),
            ],
          ),
        );
      },
    );
    if (result == null || result.name.length < 2) return;
    final service = ref.read(socialServiceProvider);
    final id =
        await service.createGroupV2(name: result.name, privacy: result.privacy);
    if (id == null) return;
    // HOTFIX 4.5C Part 18: upload imej SELEPAS grup dicipta (groupId sah) —
    // server-mediated (prepare→PUT→finalize), tiada objek orphan kanonik. Jika
    // mana-mana langkah gagal, grup KEKAL sah (fallback emoji); owner boleh
    // cuba lagi via Tetapan.
    if (result.image != null) {
      try {
        await service.uploadGroupImageV2(id, result.image!);
      } catch (_) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(l.t('photoUploadFailed'))));
        }
      }
    }
    if (context.mounted) context.push('/groups/$id');
  }

  /// Pilihan keterlihatan (ganti RadioListTile terdeprecate) — tile boleh tap.
  Widget _privacyOption(
    AppLocalizations l,
    void Function(void Function()) setLocal, {
    required String current,
    required String value,
    required IconData icon,
    required VoidCallback onPick,
  }) {
    final selected = current == value;
    final isPublic = value == 'public';
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => setLocal(onPick),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? AppColors.primaryRed : AppColors.threadsBorder,
            width: selected ? 1.6 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(icon,
                size: 20,
                color: selected ? AppColors.primaryRed : AppColors.threadsMuted),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l.t(isPublic ? 'groupPublic' : 'groupPrivate'),
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(l.t(isPublic ? 'groupPublicDesc' : 'groupPrivateDesc'),
                      style: const TextStyle(fontSize: 11.5)),
                ],
              ),
            ),
            Icon(
              selected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              size: 20,
              color: selected ? AppColors.primaryRed : AppColors.threadsMuted,
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);

    // FIX 3.1R: "My Groups" MESTI termasuk grup PERIBADI yang saya milik/sertai.
    // Dulu `mine` diterbitkan dari discoverGroups (query public-sahaja) → grup
    // peribadi tak pernah masuk senarai, jadi HILANG dari My Groups (owner pun
    // tak boleh capai grup peribadi sendiri dari hub). Kini My Groups dibina
    // dari keahlian SEBENAR (myGroupIds) + doc grup (groupProvider — boleh
    // dibaca ahli walau peribadi), bebas sepenuhnya dari senarai discovery.
    // My Groups = keahlian SEBENAR (FIX 3.1R) + doc grup yang BOLEH dibaca.
    // Grup yang permission-denied (groupProvider error → .value null) atau
    // dipadam DIKECUALIKAN di sini — satu grup rosak TIDAK meruntuhkan skrin
    // (isolasi per-grup, HOTFIX 4.2).
    final myIdsAsync = ref.watch(myGroupIdsProvider);
    final myIds = myIdsAsync.value ?? const <String>{};
    final mine = <GroupData>[];
    for (final id in myIds) {
      final g = ref.watch(groupProvider(id)).value;
      if (g != null && !g.isDeleted) mine.add(g);
    }
    final query = _query.trim().toLowerCase();
    final searching = query.isNotEmpty;

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
      body: Column(
        children: [
          _searchBar(l),
          Expanded(
            child: searching
                ? _searchResults(context, ref, l, query, myIds)
                : _myGroupsView(context, ref, l, mine, myIdsAsync.isLoading),
          ),
        ],
      ),
    );
  }

  /// HOTFIX 4.2: bar carian — pintu tunggal ke penemuan grup awam.
  Widget _searchBar(AppLocalizations l) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
        child: TextField(
          controller: _searchController,
          onChanged: (v) => setState(() => _query = v),
          style: TextStyle(color: AppColors.threadsText, fontSize: 14.5),
          decoration: InputDecoration(
            isDense: true,
            prefixIcon: Icon(Icons.search,
                color: AppColors.threadsMuted, size: 20),
            suffixIcon: _query.isEmpty
                ? null
                : IconButton(
                    icon: Icon(Icons.close,
                        color: AppColors.threadsMuted, size: 18),
                    tooltip: l.t('clearAction'),
                    onPressed: () {
                      _searchController.clear();
                      setState(() => _query = '');
                    },
                  ),
            hintText: l.t('searchGroupHint'),
            hintStyle:
                TextStyle(color: AppColors.threadsMuted, fontSize: 14),
            filled: true,
            fillColor: AppColors.threadsSurface,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: AppColors.threadsBorder),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.primaryRed),
            ),
          ),
        ),
      );

  /// Query kosong: HANYA My Groups (+ jemputan tertunda). TIADA Discover auto.
  Widget _myGroupsView(BuildContext context, WidgetRef ref, AppLocalizations l,
      List<GroupData> mine, bool loading) {
    final invites = ref.watch(myGroupInvitesProvider).value ?? const [];
    if (mine.isEmpty && invites.isEmpty) {
      if (loading) return const Center(child: CircularProgressIndicator());
      return _emptyState(l.t('noJoinedGroups'), l.t('noJoinedGroupsBody'));
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
      children: [
        ..._pendingInvites(context, ref, l),
        if (mine.isNotEmpty) ...[
          _sectionLabel(l.t('myGroups')),
          ...mine.map((g) => _groupTile(context, ref, g, true)),
        ],
      ],
    );
  }

  /// Query bermakna: HANYA grup AWAM sepadan (client-side match atas set awam
  /// terbatas dari discoverGroupsProvider — bounded, tiada indeks/deploy baharu).
  /// Grup PERIBADI bukan-ahli tak pernah masuk set ini; grup dipadam ditapis.
  Widget _searchResults(BuildContext context, WidgetRef ref,
      AppLocalizations l, String query, Set<String> myIds) {
    final discoverAsync = ref.watch(discoverGroupsProvider);
    if (discoverAsync.isLoading && !discoverAsync.hasValue) {
      return const Center(child: CircularProgressIndicator());
    }
    final results = (discoverAsync.value ?? const <GroupData>[])
        .where((g) =>
            !g.isDeleted && g.name.toLowerCase().contains(query))
        .toList();
    if (results.isEmpty) {
      return _emptyState(l.t('noGroupSearchResults'), null);
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
      children: [
        _sectionLabel(l.t('searchResultsLabel')),
        ...results.map(
            (g) => _groupTile(context, ref, g, myIds.contains(g.id))),
      ],
    );
  }

  Widget _emptyState(String title, String? body) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('👥', style: TextStyle(fontSize: 56)),
              const SizedBox(height: 16),
              Text(title,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: AppColors.threadsText,
                      fontSize: 15,
                      fontWeight: FontWeight.w700)),
              if (body != null) ...[
                const SizedBox(height: 8),
                Text(body,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: AppColors.threadsMuted,
                        fontSize: 13,
                        height: 1.4)),
              ],
            ],
          ),
        ),
      );

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4),
        child: Text(text,
            style: TextStyle(
                color: AppColors.threadsMuted,
                fontWeight: FontWeight.w800,
                fontSize: 12.5)),
      );

  /// FIX 3: senarai jemputan grup tertunda saya (terima/tolak melalui pelayan).
  List<Widget> _pendingInvites(
      BuildContext context, WidgetRef ref, AppLocalizations l) {
    final invites = ref.watch(myGroupInvitesProvider).value ?? const [];
    if (invites.isEmpty) return const [];
    final service = ref.read(socialServiceProvider);
    return [
      _sectionLabel(l.t('pendingInvites')),
      ...invites.map((inv) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.threadsSurface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.threadsBorder),
              ),
              child: Row(
                children: [
                  Text(inv.groupEmoji, style: const TextStyle(fontSize: 26)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${l.t('invitedToGroup')} ${inv.groupName}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: AppColors.threadsText,
                                fontSize: 13.5)),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: () async {
                      await service.respondGroupInvite(inv.id, accept: false);
                    },
                    child: Text(l.t('declineAction'),
                        style:
                            TextStyle(color: AppColors.threadsMuted)),
                  ),
                  FilledButton(
                    onPressed: () async {
                      await service.respondGroupInvite(inv.id, accept: true);
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                            content: Text(l.t('inviteAccepted'))));
                        context.push('/groups/${inv.groupId}');
                      }
                    },
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primaryRed,
                        visualDensity: VisualDensity.compact),
                    child: Text(l.t('acceptAction')),
                  ),
                ],
              ),
            ),
          )),
      const SizedBox(height: 16),
    ];
  }

  Widget _groupTile(
      BuildContext context, WidgetRef ref, GroupData g, bool isMember) {
    final l = AppLocalizations.of(context);
    // SP5: grup SAYA papar aktiviti (undian aktif / bil belum selesai /
    // snippet terkini) — dikira dari stream sedia ada, tiada kiraan palsu.
    // Grup teroka kekal ringkas (elak banyak listener).
    final stats =
        isMember ? ref.watch(groupQuickStatsProvider(g.id)) : null;
    final infoParts = <String>[
      '${g.memberCount} ${l.t('membersLabel')}',
      if (stats != null && stats.activePollCount > 0)
        '🗳️ ${stats.activePollCount} ${l.t('activePollsLabel')}',
      if (stats != null && stats.unpaidBillCount > 0)
        '🧾 ${stats.unpaidBillCount} ${l.t('unpaidBillsLabel')}',
    ];
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: () => context.push('/groups/${g.id}'),
        tileColor: AppColors.threadsSurface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: AppColors.threadsBorder),
        ),
        // HOTFIX 4.4/4.5: imej grup jika ada, jika tidak lencana emoji
        // berjenama — via GroupAvatar DIKONGSI.
        leading: GroupAvatarResolved(groupId: g.id, emoji: g.emoji, size: 46),
        // HOTFIX 4.4: penerangan grup (jika ada) → beri ruang 3-baris.
        isThreeLine: g.description.isNotEmpty,
        title: Text(g.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
                fontWeight: FontWeight.w700, color: AppColors.threadsText)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 3),
            // FIX 4 Part 10: lencana privasi (globe/lock) + kiraan ahli.
            Row(
              children: [
                GroupPrivacyBadge(isPrivate: g.isPrivate, dense: true),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(infoParts.join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: AppColors.threadsMuted, fontSize: 12)),
                ),
              ],
            ),
            // HOTFIX 4.4: penerangan pendek (1-2 baris, ellipsis). Jika tiada,
            // jatuh balik ke snippet aktiviti (grup ahli sahaja) — bukan clutter.
            if (g.description.isNotEmpty) ...[
              const SizedBox(height: 3),
              Text(g.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: AppColors.threadsMuted,
                      fontSize: 12.5,
                      height: 1.3)),
            ] else if (stats != null &&
                stats.latestActivityText.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text('💬 ${stats.latestActivityText}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: AppColors.threadsMuted,
                      fontSize: 11.5,
                      fontStyle: FontStyle.italic)),
            ],
          ],
        ),
        trailing: isMember
            ? Icon(Icons.chevron_right, color: AppColors.threadsMuted)
            : OutlinedButton(
                onPressed: () async {
                  await ref.read(socialServiceProvider).joinGroupV2(g.id);
                  if (context.mounted) context.push('/groups/${g.id}');
                },
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(72, 38),
                  foregroundColor: AppColors.threadsText,
                  side: BorderSide(color: AppColors.threadsBorder),
                ),
                child: Text(l.t('join')),
              ),
      ),
    );
  }

}
