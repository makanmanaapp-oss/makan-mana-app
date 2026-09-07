/// QA-DEV21 — Notification → Activity center.
///
/// Presentation redesign ONLY. Data comes from the SAME authoritative providers
/// (`notificationsStreamProvider` + pagination), read-state via the SAME
/// `NotificationRepository`, routing via the SAME `NotificationDestinationResolver`.
/// Six real filter tabs classify by notification `type`/`actorUid` — never by
/// parsing text. System / meal-reminder / broadcast events are preserved and
/// shown under All. Colours follow the normal MakanMana theme; the Activity
/// layout itself remains screen-local.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/notifications/notification_destination.dart';
import '../../core/providers.dart';
import '../../core/services/notification_qa_fixture_service.dart';
import '../../core/widgets/makan_avatar.dart';
import '../social/food_profile.dart';
import '../social/social_time.dart';
import 'activity_filter.dart';
import 'notification_model.dart';
import 'notification_providers.dart';

/// Bright Activity uses a clean white canvas. Dark mode, when enabled for the
/// whole app, continues to use the app's own tokens rather than a local theme.
Color _canvas(BuildContext context) =>
    context.isDarkMode ? context.mm.appBackground : Colors.white;

String? _identityText(String? value) {
  final text = value?.trim();
  return text == null || text.isEmpty ? null : text;
}

/// Resolves an actor from public data only. A live public display name wins;
/// then its public username; then the server-stored event snapshot. The
/// localized generic wording remains the final fallback when all are absent.
String? resolveNotificationActorName(
  MakanNotification notification,
  FoodProfile? profile,
) {
  if (profile?.exists ?? false) {
    if (profile!.hasDisplayName) {
      final displayName = _identityText(profile.displayName);
      if (displayName != null) return displayName;
    }
    final username = _identityText(profile.username);
    if (username != null) return username;
  }
  return _identityText(notification.actorDisplaySnapshot);
}

class NotificationScreen extends ConsumerStatefulWidget {
  const NotificationScreen({super.key});

  @override
  ConsumerState<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends ConsumerState<NotificationScreen> {
  static const _copyQaIdentity = '__copy_qa_identity__';
  final List<MakanNotification> _older = [];
  bool _loadingMore = false;
  bool _hasMore = true;
  String? _lastUid;
  ActivityTab _tab = ActivityTab.all;
  late final PageController _tabController;
  final _chipKeys =
      List<GlobalKey>.generate(ActivityTab.values.length, (_) => GlobalKey());

  @override
  void initState() {
    super.initState();
    _tabController = PageController(initialPage: _tab.index);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _selectTab(ActivityTab tab, {bool animatePage = true}) {
    if (_tab != tab) setState(() => _tab = tab);
    if (animatePage && _tabController.hasClients) {
      _tabController.animateToPage(
        tab.index,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
      );
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final target = _chipKeys[tab.index].currentContext;
      if (target == null) return;
      Scrollable.ensureVisible(
        target,
        alignment: 0.5,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOutCubic,
      );
    });
  }

  Future<void> _createQaFixture(String fixture) async {
    if (fixture == _copyQaIdentity) {
      final mask = await const NotificationQaFixtureService()
          .copyCurrentUidForTrustedSetup();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(mask == null
                ? 'No authenticated QA identity.'
                : 'QA identity copied: $mask')),
      );
      return;
    }
    try {
      final status = await const NotificationQaFixtureService().create(fixture);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('QA fixture: $status')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('QA fixture could not be created.')),
      );
    }
  }

  Future<void> _loadMore(List<MakanNotification> current) async {
    if (_loadingMore || !_hasMore) return;
    final cursor = notificationNextPageCursor([...current, ..._older]);
    if (cursor == null) return;
    setState(() => _loadingMore = true);
    final page = await ref.read(olderNotificationsProvider(cursor).future);
    if (!mounted) return;
    final ids = {...current.map((n) => n.id), ..._older.map((n) => n.id)};
    setState(() {
      _older.addAll(page.where((n) => ids.add(n.id)));
      _hasMore = page.length == 30;
      _loadingMore = false;
    });
  }

  void _markAllRead() {
    final live = ref.read(notificationsStreamProvider).valueOrNull ?? const [];
    final unread = [...live, ..._older]
        .where((n) => !n.isRead)
        .map((n) => n.id)
        .toList(growable: false);
    if (unread.isEmpty) return;
    ref.read(notificationRepositoryProvider).markAllRead(unread);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final uid = ref.watch(currentUidProvider);
    // Account switch: clear stateful history pages so a prior account cannot
    // flash (the realtime provider itself is UID-scoped).
    if (_lastUid != uid) {
      _lastUid = uid;
      _older.clear();
      _hasMore = true;
      _loadingMore = false;
      _tab = ActivityTab.all;
      if (_tabController.hasClients) _tabController.jumpToPage(_tab.index);
    }
    final following = ref.watch(myFollowingIdsProvider).valueOrNull ?? const {};
    final async = ref.watch(notificationsStreamProvider);
    final hasUnread = async.valueOrNull?.any((n) => !n.isRead) ?? false;

    return Scaffold(
      backgroundColor: _canvas(context),
      appBar: AppBar(
        backgroundColor: _canvas(context),
        foregroundColor: context.mm.onCard,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleSpacing: 4,
        title: Text(
          l.t('activityTitle'),
          style: TextStyle(
              color: context.mm.onCard,
              fontWeight: FontWeight.w800,
              fontSize: 22),
        ),
        actions: [
          if (kDebugMode)
            PopupMenuButton<String>(
              tooltip: 'Create QA notification',
              icon: Icon(Icons.science_outlined, color: context.mm.iconMuted),
              color: context.mm.card,
              onSelected: _createQaFixture,
              itemBuilder: (_) => NotificationQaFixtureService.fixtures
                  .map((fixture) => PopupMenuItem<String>(
                        value: fixture,
                        child: Text(fixture,
                            style: TextStyle(color: context.mm.onCard)),
                      ))
                  .followedBy([
                PopupMenuItem<String>(
                  value: _copyQaIdentity,
                  child: Text('Copy QA identity for trusted setup',
                      style: TextStyle(color: context.mm.onCard)),
                ),
              ]).toList(growable: false),
            ),
          // Compact control: Mark-all-read + notification settings (real
          // destinations). Replaces the dominant "Tanda semua dibaca" text.
          PopupMenuButton<String>(
            tooltip: l.t('markAllRead'),
            icon: Icon(Icons.more_horiz, color: context.mm.onCard),
            color: context.mm.card,
            onSelected: (v) {
              if (v == 'mark') {
                _markAllRead();
              } else if (v == 'settings') {
                context.push(RoutePaths.notificationSettings);
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem<String>(
                value: 'mark',
                enabled: hasUnread,
                child: Text(l.t('markAllRead'),
                    style: TextStyle(
                        color: hasUnread
                            ? context.mm.onCard
                            : context.mm.onCardFaint)),
              ),
              PopupMenuItem<String>(
                value: 'settings',
                child: Text(l.t('activityNotifSettings'),
                    style: TextStyle(color: context.mm.onCard)),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          _TabRail(
            selected: _tab,
            chipKeys: _chipKeys,
            onSelect: _selectTab,
          ),
          Expanded(
            child: async.when(
              loading: () => const Center(
                child: SizedBox(
                  height: 22,
                  width: 22,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppColors.primaryRed),
                ),
              ),
              error: (e, _) => _ErrorState(
                message: l.t('notifLoadError'),
                onRetry: () => ref.invalidate(notificationsStreamProvider),
                retryLabel: l.t('retryAction'),
              ),
              data: (live) {
                final all = [...live, ..._older]
                  ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
                return PageView.builder(
                  controller: _tabController,
                  itemCount: ActivityTab.values.length,
                  onPageChanged: (index) =>
                      _selectTab(ActivityTab.values[index], animatePage: false),
                  itemBuilder: (_, index) {
                    final tab = ActivityTab.values[index];
                    final filtered = filterActivity(all, tab, following);
                    if (filtered.isEmpty) return _EmptyState(l: l);
                    return _buildList(l, live, filtered, tab);
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildList(
    AppLocalizations l,
    List<MakanNotification> live,
    List<MakanNotification> filtered,
    ActivityTab tab,
  ) {
    final now = DateTime.now();
    final buckets = <ActivityBucket, List<MakanNotification>>{};
    for (final n in filtered) {
      buckets.putIfAbsent(activityBucket(n.createdAt, now), () => []).add(n);
    }
    final children = <Widget>[];
    for (final b in ActivityBucket.values) {
      final items = buckets[b];
      if (items == null || items.isEmpty) continue;
      children.add(_SectionHeader(label: l.t(activityBucketKey(b))));
      for (var i = 0; i < items.length; i++) {
        children.add(_ActivityRow(notification: items[i]));
        if (i != items.length - 1) {
          children.add(Divider(
              height: 1, thickness: 0.5, color: context.mm.border, indent: 64));
        }
      }
      children.add(const SizedBox(height: 6));
    }
    // Older pages may still contain more of this type — keep load-more honest.
    if (_hasMore) {
      children.add(Center(
        child: TextButton(
          onPressed: _loadingMore ? null : () => _loadMore(live),
          child: _loadingMore
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppColors.primaryRed))
              : Text(l.t('notificationLoadMore'),
                  style: TextStyle(color: context.mm.onCardMuted)),
        ),
      ));
    }
    return ListView(
      key: PageStorageKey('activity-tab-${tab.name}'),
      padding: const EdgeInsets.only(top: 4, bottom: 28),
      children: children,
    );
  }
}

/// Peta destinasi notifikasi → laluan aplikasi (selamat). null = kekal.
String? notificationRoute(MakanNotification n) {
  return NotificationDestinationResolver.resolve(
    type: n.rawType.isEmpty ? n.type.name : n.rawType,
    destinationId: n.destinationId ?? n.entityId,
    deepLink: n.deepLink,
  );
}

IconData _iconFor(MakanNotificationType t) {
  switch (t) {
    case MakanNotificationType.socialReaction:
    case MakanNotificationType.socialComment:
    case MakanNotificationType.socialReply:
    case MakanNotificationType.socialMention:
    case MakanNotificationType.socialFollow:
    case MakanNotificationType.socialRepost:
    case MakanNotificationType.socialQuote:
      return Icons.people_alt_rounded;
    case MakanNotificationType.groupInvite:
    case MakanNotificationType.groupInviteAccepted:
    case MakanNotificationType.groupUpdate:
      return Icons.groups_rounded;
    case MakanNotificationType.tongtongBillCreated:
    case MakanNotificationType.tongtongPaymentRequest:
    case MakanNotificationType.tongtongPaymentUpdated:
      return Icons.receipt_long_rounded;
    case MakanNotificationType.fitReminder:
    case MakanNotificationType.weeklyReportReady:
      return Icons.monitor_heart_rounded;
    case MakanNotificationType.mealReminder:
      return Icons.restaurant_rounded;
    case MakanNotificationType.subscriptionUpdated:
    case MakanNotificationType.trialEnding:
    case MakanNotificationType.paymentIssue:
      return Icons.workspace_premium_rounded;
    case MakanNotificationType.accountSecurity:
      return Icons.security_rounded;
    case MakanNotificationType.systemAnnouncement:
    case MakanNotificationType.systemMaintenance:
    case MakanNotificationType.systemFeatureUpdate:
    case MakanNotificationType.marketingCampaign:
      return Icons.campaign_rounded;
    case MakanNotificationType.foodSuggestion:
      return Icons.restaurant_rounded;
    case MakanNotificationType.reminder:
      return Icons.alarm_rounded;
    case MakanNotificationType.social:
      return Icons.people_alt_rounded;
    case MakanNotificationType.group:
      return Icons.groups_rounded;
    case MakanNotificationType.fitCoach:
      return Icons.monitor_heart_rounded;
    case MakanNotificationType.subscription:
      return Icons.workspace_premium_rounded;
    case MakanNotificationType.coupon:
      return Icons.confirmation_number_rounded;
    case MakanNotificationType.support:
      return Icons.support_agent_rounded;
    case MakanNotificationType.system:
    case MakanNotificationType.unknown:
      return Icons.notifications_rounded;
  }
}

/// Small event-badge (icon) overlaid on social avatars. null = no badge.
IconData? _eventBadge(MakanNotificationType t) => switch (t) {
      MakanNotificationType.socialFollow => Icons.person_add_alt_1,
      MakanNotificationType.socialComment ||
      MakanNotificationType.socialReply =>
        Icons.mode_comment,
      MakanNotificationType.socialMention => Icons.alternate_email,
      MakanNotificationType.socialRepost ||
      MakanNotificationType.socialQuote =>
        Icons.repeat_rounded,
      MakanNotificationType.socialReaction => Icons.favorite,
      _ => null,
    };

class _TabRail extends StatelessWidget {
  const _TabRail({
    required this.selected,
    required this.chipKeys,
    required this.onSelect,
  });
  final ActivityTab selected;
  final List<GlobalKey> chipKeys;
  final ValueChanged<ActivityTab> onSelect;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return SizedBox(
      height: 50,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        children: [
          for (final tab in ActivityTab.values)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(right: 8),
                child: KeyedSubtree(
                  key: chipKeys[tab.index],
                  child: _Chip(
                    label: l.t(activityTabKey(tab)),
                    selected: selected == tab,
                    onTap: () => onSelect(tab),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(
      {required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.primaryRed.withValues(alpha: 0.10)
                : context.mm.card,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
                color: selected ? AppColors.primaryRed : context.mm.border,
                width: 1),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? AppColors.primaryRed : context.mm.onCardMuted,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

class _ActivityRow extends ConsumerWidget {
  const _ActivityRow({required this.notification});
  final MakanNotification notification;

  String _title(AppLocalizations l) {
    final k = notification.titleKey;
    if (k != null && k.isNotEmpty) {
      final t = l.t(k);
      if (t != k) return t;
    }
    return notification.title;
  }

  /// Maps an actor-based social notification type to its localized actor-first
  /// body key. null → the type has no actor-aware form (keep generic copy).
  static String? _actorBodyKey(MakanNotificationType t) => switch (t) {
        MakanNotificationType.socialFollow =>
          'notificationSocialFollowBodyWithActor',
        MakanNotificationType.socialReaction =>
          'notificationSocialReactionBodyWithActor',
        MakanNotificationType.socialComment =>
          'notificationSocialCommentBodyWithActor',
        MakanNotificationType.socialReply =>
          'notificationSocialReplyBodyWithActor',
        MakanNotificationType.socialMention =>
          'notificationSocialMentionBodyWithActor',
        MakanNotificationType.socialRepost =>
          'notificationSocialRepostBodyWithActor',
        MakanNotificationType.socialQuote =>
          'notificationSocialQuoteBodyWithActor',
        _ => null,
      };

  String _body(AppLocalizations l, String? actorName) {
    // QA-DEV29 — actor-aware social copy for EVERY actor-based social type.
    // When the event carries an authentic, resolvable public actor identity,
    // render the localized actor-first wording; unresolved/deleted actors and
    // all non-social types retain the existing generic wording (fallback).
    if (actorName != null && actorName.isNotEmpty) {
      final actorKey = _actorBodyKey(notification.type);
      if (actorKey != null) {
        final t = l.t(actorKey);
        if (t != actorKey) {
          return t.replaceAll('{actorName}', actorName);
        }
      }
    }
    final k = notification.bodyKey;
    if (k != null && k.isNotEmpty) {
      final t = l.t(k);
      if (t != k) return t;
    }
    return notification.body;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final n = notification;
    final unread = !n.isRead;
    final actorUid = n.actorUid;
    final profile =
        activityIsSocial(n.type) && actorUid != null && actorUid.isNotEmpty
            ? ref.watch(publicProfileProvider(actorUid)).valueOrNull
            : null;
    final actorName = resolveNotificationActorName(n, profile);
    final title = _title(l);
    final body = _body(l, actorName);

    return Semantics(
      button: true,
      label: '${unread ? l.t('newNotification') : ''} $title'.trim(),
      child: InkWell(
        onTap: () async {
          if (unread) {
            await ref
                .read(notificationRepositoryProvider)
                .markOpened(notification.id);
          }
          if (!context.mounted) return;
          final route = notificationRoute(notification);
          if (route != null) {
            try {
              context.push(route);
            } catch (_) {/* stay on Activity */}
          } else if ((notification.entityId ?? notification.destinationId)
                  ?.isNotEmpty ==
              true) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(l.t('notificationTargetUnavailable'))),
            );
          }
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _leadingVisual(context, profile, actorName),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontWeight:
                                  unread ? FontWeight.w800 : FontWeight.w600,
                              fontSize: 14,
                              height: 1.25,
                              color: context.mm.onCard,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          relativePostTime(l, n.createdAt),
                          style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                              color: context.mm.onCardMuted),
                        ),
                        if (unread)
                          Container(
                            width: 8,
                            height: 8,
                            margin: const EdgeInsets.only(left: 8, top: 4),
                            decoration: const BoxDecoration(
                              color: AppColors.primaryRed,
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                    if (body.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        body,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 13,
                            height: 1.3,
                            color: context.mm.onCardMuted),
                      ),
                    ],
                  ],
                ),
              ),
              if (n.imageUrl != null) ...[
                const SizedBox(width: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(
                    n.imageUrl!,
                    height: 42,
                    width: 42,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _leadingVisual(
    BuildContext context,
    FoodProfile? profile,
    String? actorName,
  ) {
    final n = notification;
    final actor = n.actorUid;
    final badge = _eventBadge(n.type);
    // Social events with a real actor → live avatar + optional event badge.
    if (activityIsSocial(n.type) && actor != null && actor.isNotEmpty) {
      return SizedBox(
        width: 44,
        height: 44,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            MakanAvatar(
              radius: 22,
              photoUrl: profile?.photoUrl,
              presetId: profile?.avatarPreset,
              displayName: actorName,
            ),
            if (badge != null)
              Positioned(
                right: -2,
                bottom: -2,
                child: Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    color: AppColors.primaryRed,
                    shape: BoxShape.circle,
                    border: Border.all(color: _canvas(context), width: 1.5),
                  ),
                  child: Icon(badge, size: 10, color: Colors.white),
                ),
              ),
          ],
        ),
      );
    }
    // System / reminder / broadcast → themed icon tile.
    return Container(
      height: 44,
      width: 44,
      decoration: BoxDecoration(
        color: AppColors.primaryRed.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(_iconFor(n.type), size: 20, color: AppColors.primaryRed),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
        child: Text(
          label,
          style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: context.mm.onCardMuted),
        ),
      );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.l});
  final AppLocalizations l;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            l.t('activityEmpty'),
            textAlign: TextAlign.center,
            style: TextStyle(
                color: context.mm.onCardMuted,
                fontSize: 14.5,
                fontWeight: FontWeight.w500),
          ),
        ),
      );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState(
      {required this.message, required this.onRetry, required this.retryLabel});
  final String message;
  final VoidCallback onRetry;
  final String retryLabel;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off_rounded,
                  size: 44, color: context.mm.iconMuted),
              const SizedBox(height: 12),
              Text(message,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontWeight: FontWeight.w700, color: context.mm.onCard)),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: onRetry,
                style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primaryRed,
                    side: BorderSide(color: context.mm.border)),
                child: Text(retryLabel),
              ),
            ],
          ),
        ),
      );
}
