import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import '../social/compose_sheet.dart';
import '../social/post_card.dart';
import '../social/social_providers.dart';
import '../social/social_ui.dart';
import 'group_activity.dart';
import 'group_bills_screen.dart';
import 'group_polls.dart';
import 'group_providers.dart';
import 'group_status.dart';

/// Group Hub V5 (Social Prompt 5): hab keputusan makan —
/// header aktiviti + quick actions + Feed/Undian/Bil/Ahli.
class GroupHubScreen extends ConsumerStatefulWidget {
  const GroupHubScreen({super.key, required this.groupId});

  final String groupId;

  @override
  ConsumerState<GroupHubScreen> createState() => _GroupHubScreenState();
}

class _GroupHubScreenState extends ConsumerState<GroupHubScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;
  late final _logger = ref.read(eventLoggerProvider);
  static const _tabNames = ['feed', 'polls', 'bills', 'members'];

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 4, vsync: this);
    _tab.addListener(() {
      if (!_tab.indexIsChanging) {
        _logger.logEvent(
          EventType.groupTabChanged,
          sourceScreen: 'group_hub',
          metadata: {
            'groupId': widget.groupId,
            'tab': _tabNames[_tab.index],
          },
        );
      }
    });
    _logger.logEvent(
      EventType.groupHubViewed,
      sourceScreen: 'group_hub',
      metadata: {'groupId': widget.groupId},
    );
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  void _quickAction(String action) {
    _logger.logEvent(
      EventType.groupQuickActionTapped,
      sourceScreen: 'group_hub',
      metadata: {'groupId': widget.groupId, 'actionType': action},
    );
    switch (action) {
      case 'post':
        showComposeSheet(context, groupId: widget.groupId);
      case 'checkin':
        showComposeSheet(context, groupId: widget.groupId, type: 'checkin');
      case 'poll':
        _logger.logEvent(
          EventType.groupPollCreateTapped,
          sourceScreen: 'group_hub',
          metadata: {'groupId': widget.groupId},
        );
        showCreatePollSheet(context, widget.groupId);
      case 'bill':
        _logger.logEvent(
          EventType.groupBillCreateTapped,
          sourceScreen: 'group_hub',
          metadata: {'groupId': widget.groupId},
        );
        context.push('/groups/${widget.groupId}/bills/create');
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final groupId = widget.groupId;
    final groupAsync = ref.watch(groupProvider(groupId));
    final group = groupAsync.value;
    // HOTFIX 4.3: tentukan keahlian dari SUMBER SELAMAT — collectionGroup
    // `members where uid == me` (myGroupIdsProvider). Ini TIDAK permission-deny
    // untuk bukan-ahli (rule: resource.data.uid == auth.uid). JANGAN guna
    // myGroupRoleProvider (GET langsung groups/{id}/members/{uid}) sebelum
    // keahlian disahkan — GET itu DITOLAK rules untuk non-member (member-doc
    // read = isGroupMember) → itulah punca skrin merah permission-denied bila
    // non-member buka grup awam. Provider member-only hanya di-watch dalam
    // cabang MEMBER di bawah.
    final myIdsAsync = ref.watch(myGroupIdsProvider);
    final isMember =
        (myIdsAsync.value ?? const <String>{}).contains(groupId);

    Scaffold spinner() => Scaffold(
          backgroundColor: AppColors.threadsBg,
          appBar: AppBar(
            backgroundColor: AppColors.threadsBg,
            foregroundColor: AppColors.threadsText,
          ),
          body: const Center(child: CircularProgressIndicator()),
        );

    // Grup belum dimuat → spinner (data awam sahaja, tiada baca terhad).
    if (groupAsync.isLoading && group == null) return spinner();
    // HOTFIX 4.2: grup TAK BOLEH dibaca (private non-member / tiada) ATAU
    // dipadam → keadaan mesra, BUKAN ralat Firebase mentah.
    if (group == null || group.isDeleted) return _GroupUnavailable();
    // HOTFIX 4.3 Part 7: keahlian belum resolve → tunggu selamat (jangan andai
    // ahli, jangan mula baca terhad) untuk elak race permission-denied.
    if (!myIdsAsync.hasValue) return spinner();
    // Grup BOLEH dibaca + BUKAN ahli → mesti AWAM (private non-member tak boleh
    // baca doc → sudah _GroupUnavailable). Papar PRATONTON AWAM selamat; TIADA
    // provider member-only di-watch.
    if (!isMember) return _PublicPreview(group: group);

    // ===== MEMBER — kini SELAMAT baca role + provider member-only. =====
    final role = ref.watch(myGroupRoleProvider(groupId)).value ?? 'member';
    final canPost = role != 'viewer';
    final stats = ref.watch(groupQuickStatsProvider(groupId));

    return Scaffold(
      backgroundColor: AppColors.threadsBg,
      appBar: AppBar(
        backgroundColor: AppColors.threadsBg,
        foregroundColor: AppColors.threadsText,
        surfaceTintColor: Colors.transparent,
        title: Text('${group.emoji} ${group.name}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: AppColors.threadsText)),
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
      ),
      body: Column(
        children: [
          _GroupHeader(
            group: group,
            role: role,
            stats: stats,
            canPost: canPost,
            onQuickAction: _quickAction,
          ),
          TabBar(
            controller: _tab,
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
          Expanded(
            child: TabBarView(
              controller: _tab,
              children: [
                _GroupFeedTab(
                  groupId: groupId,
                  canPost: canPost,
                  stats: stats,
                  onJumpToTab: (i) => _tab.animateTo(i),
                  onQuickAction: _quickAction,
                ),
                _GroupPollsTab(groupId: groupId, canPost: canPost),
                GroupBillsTab(groupId: groupId, canCreate: canPost),
                _GroupMembersTab(groupId: groupId, myRole: role),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Header hab: identiti grup + stats aktiviti + quick actions.
class _GroupHeader extends StatelessWidget {
  const _GroupHeader({
    required this.group,
    required this.role,
    required this.stats,
    required this.canPost,
    required this.onQuickAction,
  });

  final GroupData group;
  final String role;
  final GroupQuickStats stats;
  final bool canPost;
  final void Function(String action) onQuickAction;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF2A1414), Color(0xFF1B1414)],
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.threadsBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // HOTFIX 4.5C: identiti imej/emoji sama seperti kad — resolver
              // signed-GET (GroupAvatarResolved).
              GroupAvatarResolved(
                  groupId: group.id, emoji: group.emoji, size: 46),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(group.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: AppColors.threadsText,
                            fontWeight: FontWeight.w800,
                            fontSize: 16)),
                    if (group.description.isNotEmpty)
                      Text(group.description,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: AppColors.threadsMuted,
                              fontSize: 12.5)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Chips info: ahli · privasi · peranan saya.
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _chip('${group.memberCount} ${l.t('membersLabel')}'),
              // FIX 4 Part 10: privasi = ikon globe/lock + label (bukan teks
              // kosong / emoji).
              GroupPrivacyBadge(isPrivate: group.privacy == 'private'),
              // FIX 4 Part 11: aksen jenama untuk OWNER sahaja; admin restrained.
              _chip(
                switch (role) {
                  'owner' => l.t('roleOwner'),
                  'admin' => l.t('roleAdmin'),
                  'viewer' => l.t('roleViewer'),
                  _ => l.t('roleMember'),
                },
                highlight: role == 'owner',
              ),
              if (stats.activePollCount > 0)
                _chip('${stats.activePollCount} ${l.t('activePollsLabel')}',
                    highlight: true),
              if (stats.unpaidBillCount > 0)
                _chip(
                    '${stats.unpaidBillCount} ${l.t('unpaidBillsLabel')}',
                    highlight: true),
            ],
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              stats.latestActivityText.isNotEmpty
                  ? stats.latestActivityText
                  : l.t('noLatestActivity'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  color: AppColors.threadsMuted,
                  fontSize: 12,
                  fontWeight: FontWeight.w600),
            ),
          ),
          if (canPost) ...[
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _actionChip(
                      l, Icons.edit_outlined, l.t('typePost'), 'post'),
                  _actionChip(l, Icons.place_outlined, l.t('typeCheckin'),
                      'checkin'),
                  _actionChip(
                      l, Icons.poll_outlined, l.t('typePoll'), 'poll'),
                  _actionChip(l, Icons.receipt_long_outlined,
                      l.t('typeBill'), 'bill'),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _chip(String text, {bool highlight = false}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          color: highlight
              ? AppColors.warmYellow.withValues(alpha: 0.18)
              : AppColors.threadsSurface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: highlight
                  ? AppColors.warmYellow.withValues(alpha: 0.6)
                  : AppColors.threadsBorder),
        ),
        child: Text(text,
            style: TextStyle(
                color: highlight
                    ? AppColors.warmYellow
                    : AppColors.threadsText,
                fontSize: 11.5,
                fontWeight: FontWeight.w700)),
      );

  Widget _actionChip(
          AppLocalizations l, IconData icon, String label, String action) =>
      Padding(
        padding: const EdgeInsets.only(right: 8),
        child: InkWell(
          onTap: () => onQuickAction(action),
          borderRadius: BorderRadius.circular(20),
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.primaryRed,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 15, color: Colors.white),
                const SizedBox(width: 5),
                Text(label,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 12.5)),
              ],
            ),
          ),
        ),
      );
}

/// HOTFIX 4.3: PRATONTON AWAM untuk bukan-ahli grup AWAM. Render HANYA data
/// yang boleh dibaca dari dokumen grup awam (nama/emoji/privasi/penerangan/
/// kiraan ahli). TIDAK melanggan mana-mana sumber member-only (members,
/// group_only posts, polls, status, Tong-Tong) sehingga keahlian wujud.
class _PublicPreview extends ConsumerStatefulWidget {
  const _PublicPreview({required this.group});
  final GroupData group;

  @override
  ConsumerState<_PublicPreview> createState() => _PublicPreviewState();
}

class _PublicPreviewState extends ConsumerState<_PublicPreview> {
  bool _joining = false;

  @override
  void initState() {
    super.initState();
    ref.read(eventLoggerProvider).logEvent(
          EventType.groupAccessDeniedViewed,
          sourceScreen: 'group_public_preview',
          metadata: {'groupId': widget.group.id},
        );
  }

  Future<void> _join() async {
    setState(() => _joining = true);
    try {
      // HOTFIX 4.3 Part 5: laluan JOIN autoritatif kekal joinGroupV2. Selepas
      // berjaya, strim myGroupIdsProvider (collectionGroup live) auto-emit doc
      // keahlian baharu → Group Hub bina semula ke mod MEMBER. Tiada tulisan
      // manual, tiada restart, tiada navigate-away.
      await ref.read(socialServiceProvider).joinGroupV2(widget.group.id);
      ref.invalidate(groupProvider(widget.group.id)); // segarkan memberCount
    } catch (_) {
      if (mounted) {
        final l = AppLocalizations.of(context);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('postFailed'))));
      }
    } finally {
      if (mounted) setState(() => _joining = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final g = widget.group;
    return Scaffold(
      backgroundColor: AppColors.threadsBg,
      appBar: AppBar(
        backgroundColor: AppColors.threadsBg,
        foregroundColor: AppColors.threadsText,
        surfaceTintColor: Colors.transparent,
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // HOTFIX 4.5C: pratonton awam papar imej grup (resolver signed-GET
              // untuk grup AWAM — mana-mana authed) atau fallback emoji. TIADA
              // baca member-only.
              GroupAvatarResolved(groupId: g.id, emoji: g.emoji, size: 72),
              const SizedBox(height: 16),
              Text(g.name,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: AppColors.threadsText,
                      fontWeight: FontWeight.w800,
                      fontSize: 20)),
              const SizedBox(height: 10),
              GroupPrivacyBadge(isPrivate: g.isPrivate),
              if (g.description.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(g.description,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: AppColors.threadsMuted,
                        fontSize: 13.5,
                        height: 1.4)),
              ],
              const SizedBox(height: 10),
              Text('${g.memberCount} ${l.t('membersLabel')}',
                  style: TextStyle(
                      color: AppColors.threadsMuted, fontSize: 13)),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _joining ? null : _join,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primaryRed,
                  minimumSize: const Size(200, 48),
                ),
                child: _joining
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : Text(l.t('joinGroup')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// HOTFIX 4.2: keadaan "Grup tidak tersedia" mesra — ganti skrin ralat
/// Firebase mentah bila grup tak boleh dibaca/tiada/dipadam.
class _GroupUnavailable extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
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
              Icon(Icons.lock_outline,
                  size: 56, color: AppColors.threadsMuted),
              const SizedBox(height: 16),
              Text(l.t('groupUnavailable'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: AppColors.threadsText,
                      fontWeight: FontWeight.w800,
                      fontSize: 18)),
              const SizedBox(height: 8),
              Text(l.t('groupUnavailableBody'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: AppColors.threadsMuted,
                      fontSize: 13.5,
                      height: 1.4)),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () {
                  if (context.canPop()) {
                    context.pop();
                  } else {
                    context.go('/social');
                  }
                },
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primaryRed,
                  minimumSize: const Size(200, 48),
                ),
                child: Text(l.t('backToGroups')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GroupFeedTab extends ConsumerWidget {
  const _GroupFeedTab({
    required this.groupId,
    required this.canPost,
    required this.stats,
    required this.onJumpToTab,
    required this.onQuickAction,
  });
  final String groupId;
  final bool canPost;
  final GroupQuickStats stats;
  final void Function(int tabIndex) onJumpToTab;
  final void Function(String action) onQuickAction;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final group = ref.watch(groupProvider(groupId)).value;
    final postsAsync = ref.watch(groupFeedProvider(groupId));
    final posts = postsAsync.value ?? const [];
    final polls = ref.watch(groupPollsProvider(groupId)).value ?? const [];
    final bills = ref.watch(groupBillsProvider(groupId)).value ?? const [];
    final activePoll = polls
        .where((p) => (p['status'] as String?) == 'open')
        .toList();
    final unsettledBills =
        bills.where((b) => (b.$2['status'] as String?) != 'settled').toList();

    if (postsAsync.isLoading && posts.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
      children: [
        if (group?.pinnedAnnouncement != null &&
            group!.pinnedAnnouncement!.isNotEmpty)
          _pinnedCard(Icons.push_pin_outlined, group.pinnedAnnouncement!),
        if (group?.pinnedPlaceName != null &&
            group!.pinnedPlaceName!.isNotEmpty)
          _pinnedCard(Icons.place_outlined, group.pinnedPlaceName!),
        GroupStatusStrip(groupId: groupId),
        // SP5: kad ringkasan undian aktif (CTA → tab Undian).
        if (activePoll.isNotEmpty)
          _summaryCard(
            icon: Icons.poll_outlined,
            title: activePoll.first['question'] as String? ?? '',
            subtitle:
                '${(activePoll.first['totalVotes'] as num?)?.toInt() ?? 0} '
                '${l.t('votesLabel')}'
                '${activePoll.length > 1 ? ' · +${activePoll.length - 1}' : ''}',
            cta: l.t('votePollCta'),
            onTap: () => onJumpToTab(1),
          ),
        // SP5: kad ringkasan bil belum selesai (KIRAAN sahaja — butiran
        // siapa belum bayar kekal dalam halaman bil, bukan feed).
        if (unsettledBills.isNotEmpty)
          _summaryCard(
            icon: Icons.receipt_long_outlined,
            title:
                unsettledBills.first.$2['placeNameSnapshot'] as String? ??
                    l.t('groupTabBills'),
            subtitle:
                '${unsettledBills.length} ${l.t('unpaidBillsLabel')}',
            cta: l.t('openBillCta'),
            onTap: () => onJumpToTab(2),
          ),
        if (posts.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 40),
            child: Column(
              children: [
                Text(group?.emoji ?? '🍜',
                    style: const TextStyle(fontSize: 52)),
                const SizedBox(height: 12),
                Text(l.t('groupFeedEmpty'),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: AppColors.threadsMuted,
                        fontWeight: FontWeight.w600)),
                if (canPost) ...[
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    alignment: WrapAlignment.center,
                    children: [
                      for (final (icon, label, action) in [
                        (Icons.edit_outlined, l.t('typePost'), 'post'),
                        (
                          Icons.place_outlined,
                          l.t('typeCheckin'),
                          'checkin'
                        ),
                        (Icons.poll_outlined, l.t('typePoll'), 'poll'),
                        (
                          Icons.receipt_long_outlined,
                          l.t('typeBill'),
                          'bill'
                        ),
                      ])
                        OutlinedButton(
                          onPressed: () => onQuickAction(action),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(90, 40),
                            foregroundColor: AppColors.threadsText,
                            side: BorderSide(
                                color: AppColors.threadsBorder),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(icon, size: 15),
                              const SizedBox(width: 5),
                              Text(label,
                                  style:
                                      const TextStyle(fontSize: 12.5)),
                            ],
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          )
        else
          ...posts.expand((p) => [
                PostCard(post: p, key: ValueKey(p.id)),
                Divider(
                    height: 1,
                    thickness: 0.6,
                    color: AppColors.threadsBorder),
              ]),
      ],
    );
  }

  Widget _summaryCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required String cta,
    required VoidCallback onTap,
  }) =>
      Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: AppColors.threadsSurface,
          borderRadius: BorderRadius.circular(14),
          border:
              Border.all(color: AppColors.warmYellow.withValues(alpha: 0.4)),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Icon(icon, size: 22, color: AppColors.warmYellow),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: AppColors.threadsText,
                              fontWeight: FontWeight.w800,
                              fontSize: 13.5)),
                      Text(subtitle,
                          style: TextStyle(
                              color: AppColors.threadsMuted,
                              fontSize: 12)),
                    ],
                  ),
                ),
                Text(cta,
                    style: const TextStyle(
                        color: AppColors.warmYellow,
                        fontWeight: FontWeight.w800,
                        fontSize: 12.5)),
              ],
            ),
          ),
        ),
      );

  Widget _pinnedCard(IconData icon, String text) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.threadsSurface,
          borderRadius: BorderRadius.circular(14),
          border:
              Border.all(color: AppColors.warmYellow.withValues(alpha: 0.4)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: AppColors.warmYellow),
            const SizedBox(width: 10),
            Expanded(
              child: Text(text,
                  style: TextStyle(
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
    final pollsAsync = ref.watch(groupPollsProvider(groupId));
    final polls = pollsAsync.value ?? const [];
    final active =
        polls.where((p) => (p['status'] as String?) == 'open').toList();
    final closed =
        polls.where((p) => (p['status'] as String?) != 'open').toList();

    if (pollsAsync.isLoading && polls.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: canPost
          ? FloatingActionButton.extended(
              heroTag: 'createPoll',
              onPressed: () {
                ref.read(eventLoggerProvider).logEvent(
                      EventType.groupPollCreateTapped,
                      sourceScreen: 'group_polls',
                      metadata: {'groupId': groupId},
                    );
                showCreatePollSheet(context, groupId);
              },
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
                    Icon(Icons.poll_outlined,
                        size: 52, color: AppColors.threadsMuted),
                    const SizedBox(height: 12),
                    Text(l.t('noPolls'),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            color: AppColors.threadsMuted,
                            fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 120),
              children: [
                if (active.isNotEmpty) ...[
                  _sectionLabel(l.t('pollsActiveSection')),
                  ...active
                      .map((p) => PollCard(groupId: groupId, poll: p)),
                ],
                if (closed.isNotEmpty) ...[
                  _sectionLabel(l.t('pollsClosedSection')),
                  ...closed
                      .map((p) => PollCard(groupId: groupId, poll: p)),
                ],
              ],
            ),
    );
  }

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4),
        child: Text(text,
            style: TextStyle(
                color: AppColors.threadsMuted,
                fontWeight: FontWeight.w800,
                fontSize: 12.5)),
      );
}

class _GroupMembersTab extends ConsumerWidget {
  const _GroupMembersTab({required this.groupId, required this.myRole});
  final String groupId;
  final String myRole;

  bool get _canManage => myRole == 'owner' || myRole == 'admin';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final myUid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
    final membersAsync = ref.watch(groupMembersProvider(groupId));
    final members = membersAsync.value ?? const [];

    if (membersAsync.isLoading && members.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (membersAsync.hasError && members.isEmpty) {
      return Center(
        child: Text(l.t('profileError'),
            style: TextStyle(color: AppColors.threadsMuted)),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 120),
      children: members.map((m) {
        final uid = m['uid'] as String? ?? '';
        final role = (m['role'] as String?) ?? 'member';
        final joined = m['joinedAt'];
        final joinedText = joined is Timestamp
            ? '${l.t('joinedLabel')} '
                '${joined.toDate().day}/${joined.toDate().month}/${joined.toDate().year}'
            : null;
        return ListTile(
          minVerticalPadding: 10,
          onTap: uid.isEmpty
              ? null
              : () {
                  ref.read(eventLoggerProvider).logEvent(
                        EventType.groupMemberProfileOpened,
                        sourceScreen: 'group_members',
                        metadata: {'groupId': groupId},
                      );
                  context.push('/u/$uid');
                },
          leading: CircleAvatar(
            radius: 22,
            backgroundColor: AppColors.softYellow,
            backgroundImage: m['photoUrl'] != null
                ? NetworkImage(m['photoUrl'] as String)
                : null,
            child: m['photoUrl'] == null
                ? const Icon(Icons.person_outline,
                    size: 20, color: AppColors.darkText)
                : null,
          ),
          title: Row(
            children: [
              Flexible(
                child: Text((m['displayName'] as String?) ?? 'Foodie',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: AppColors.threadsText,
                        fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 8),
              GroupRoleBadge(role: role),
            ],
          ),
          subtitle: joinedText != null
              ? Text(joinedText,
                  style: TextStyle(
                      color: AppColors.threadsMuted, fontSize: 12))
              : null,
          // Urus ahli: owner/admin sahaja; owner & diri sendiri dilindungi.
          trailing: _canManage && uid != myUid && role != 'owner'
              ? PopupMenuButton<String>(
                  icon: Icon(Icons.more_vert,
                      color: AppColors.threadsMuted, size: 20),
                  onSelected: (v) async {
                    final service = ref.read(socialServiceProvider);
                    try {
                      switch (v) {
                        case 'promote':
                          await service.changeGroupRole(
                              groupId, uid, 'admin');
                        case 'demote':
                          await service.changeGroupRole(
                              groupId, uid, 'member');
                        case 'remove':
                          await service.removeGroupMember(groupId, uid);
                      }
                    } catch (_) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(l.t('postFailed'))));
                      }
                    }
                  },
                  itemBuilder: (menuContext) => [
                    if (myRole == 'owner' && role != 'admin')
                      PopupMenuItem(
                          value: 'promote',
                          child: Text(l.t('makeAdmin'))),
                    if (myRole == 'owner' && role == 'admin')
                      PopupMenuItem(
                          value: 'demote',
                          child: Text(l.t('makeMember'))),
                    PopupMenuItem(
                        value: 'remove',
                        child: Text(l.t('removeMember'),
                            style: const TextStyle(
                                color: AppColors.primaryRed))),
                  ],
                )
              : null,
        );
      }).toList(),
    );
  }

}
