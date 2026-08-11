/// Front Page Redesign 1 — Notification Center (skrin senarai).
///
/// Guna sistem warna rasmi MakanMana + localization sedia ada. Data sebenar dari
/// `notificationsStreamProvider` (berskop UID). Tap → tanda dibaca + navigasi
/// selamat (fallback: kekal di skrin jika destinasi tiada/tak sah).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import 'notification_model.dart';
import 'notification_providers.dart';

class NotificationScreen extends ConsumerWidget {
  const NotificationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final async = ref.watch(notificationsStreamProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l.t('notificationsTitle')),
        actions: [
          async.maybeWhen(
            data: (list) {
              final hasUnread = list.any((n) => !n.isRead);
              if (!hasUnread) return const SizedBox.shrink();
              return TextButton(
                onPressed: () => ref
                    .read(notificationRepositoryProvider)
                    .markAllRead(
                        list.where((n) => !n.isRead).map((n) => n.id)),
                child: Text(l.t('markAllRead')),
              );
            },
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorState(
          message: l.t('notifLoadError'),
          onRetry: () => ref.invalidate(notificationsStreamProvider),
          retryLabel: l.t('retryAction'),
        ),
        data: (list) {
          if (list.isEmpty) return _EmptyState(l: l);
          final now = DateTime.now();
          final today = <MakanNotification>[];
          final earlier = <MakanNotification>[];
          for (final n in list) {
            final sameDay = n.createdAt.year == now.year &&
                n.createdAt.month == now.month &&
                n.createdAt.day == now.day;
            (sameDay ? today : earlier).add(n);
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              if (today.isNotEmpty) ...[
                _SectionHeader(label: l.t('notifToday')),
                ...today.map((n) => _NotificationTile(notification: n)),
              ],
              if (earlier.isNotEmpty) ...[
                if (today.isNotEmpty) const SizedBox(height: 12),
                _SectionHeader(label: l.t('notifEarlier')),
                ...earlier.map((n) => _NotificationTile(notification: n)),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// Peta destinasi notifikasi → laluan aplikasi (selamat). null = kekal.
String? notificationRoute(MakanNotification n) {
  final id = n.destinationId?.trim() ?? '';
  switch (n.type) {
    case MakanNotificationType.foodSuggestion:
      return id.isNotEmpty ? '/restaurant/$id' : null;
    case MakanNotificationType.social:
      return id.isNotEmpty ? '/u/$id' : RoutePaths.social;
    case MakanNotificationType.group:
      return id.isNotEmpty ? '/groups/$id' : RoutePaths.group;
    case MakanNotificationType.fitCoach:
      return RoutePaths.fitToday;
    case MakanNotificationType.subscription:
      return RoutePaths.paywall;
    case MakanNotificationType.coupon:
      return '/coupon';
    case MakanNotificationType.support:
      return '/support';
    case MakanNotificationType.reminder:
      return id.isNotEmpty ? '/restaurant/$id' : null;
    case MakanNotificationType.system:
      // Sistem: destinationId ialah laluan dalaman eksplisit (mesti mula '/').
      return id.startsWith('/') ? id : null;
    case MakanNotificationType.unknown:
      return null;
  }
}

IconData _iconFor(MakanNotificationType t) {
  switch (t) {
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

class _NotificationTile extends ConsumerWidget {
  const _NotificationTile({required this.notification});
  final MakanNotification notification;

  String _title(AppLocalizations l) {
    final k = notification.titleKey;
    if (k != null && k.isNotEmpty) {
      final t = l.t(k);
      if (t != k) return t;
    }
    return notification.title;
  }

  String _body(AppLocalizations l) {
    final k = notification.bodyKey;
    if (k != null && k.isNotEmpty) {
      final t = l.t(k);
      if (t != k) return t;
    }
    return notification.body;
  }

  String _timeLabel() {
    final d = notification.createdAt;
    final now = DateTime.now();
    final sameDay = d.year == now.year && d.month == now.month && d.day == now.day;
    if (sameDay) {
      final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
      final m = d.minute.toString().padLeft(2, '0');
      final ap = d.hour < 12 ? 'AM' : 'PM';
      return '$h:$m $ap';
    }
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final unread = !notification.isRead;
    final mm = context.mm;
    final title = _title(l);
    final body = _body(l);

    return Semantics(
      button: true,
      label: '${unread ? l.t('newNotification') : ''} $title'.trim(),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Material(
          // Front Page Redesign 1A — permukaan belum-baca off-white rasmi
          // (#F6E9E3) dalam Bright; token tema (softFill) dalam Dark.
          color: unread
              ? (context.isDarkMode ? mm.softFill : const Color(0xFFF6E9E3))
              : mm.card,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () async {
              // 1. Tanda dibaca (kemas kini kiraan belum-baca secara reaktif).
              if (unread) {
                await ref
                    .read(notificationRepositoryProvider)
                    .markRead(notification.id);
              }
              if (!context.mounted) return;
              // 2/3. Navigasi selamat; 4. gagal-selamat kekal di skrin.
              final route = notificationRoute(notification);
              if (route != null) {
                try {
                  context.push(route);
                } catch (_) {
                  /* kekal di skrin notifikasi */
                }
              }
            },
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: mm.border),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 40,
                    width: 40,
                    decoration: BoxDecoration(
                      color: AppColors.primaryRed.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(_iconFor(notification.type),
                        size: 20, color: AppColors.primaryRed),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 14.5,
                                  color: mm.onCard,
                                ),
                              ),
                            ),
                            if (unread)
                              Container(
                                width: 9,
                                height: 9,
                                margin: const EdgeInsets.only(left: 6, top: 2),
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
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 13, color: mm.onCardMuted),
                          ),
                        ],
                        const SizedBox(height: 5),
                        Text(
                          _timeLabel(),
                          style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                              color: mm.onCardMuted),
                        ),
                      ],
                    ),
                  ),
                  if (notification.imageUrl != null) ...[
                    const SizedBox(width: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.network(
                        notification.imageUrl!,
                        height: 44,
                        width: 44,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 4, 4, 10),
        child: Text(
          label,
          style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
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
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.notifications_none_rounded,
                  size: 56, color: context.mm.iconMuted),
              const SizedBox(height: 14),
              Text(l.t('noNotifications'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: context.mm.onCard)),
              const SizedBox(height: 6),
              Text(l.t('allCaughtUp'),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.mm.onCardMuted)),
            ],
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
                  size: 48, color: context.mm.iconMuted),
              const SizedBox(height: 12),
              Text(message,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontWeight: FontWeight.w700, color: context.mm.onCard)),
              const SizedBox(height: 12),
              OutlinedButton(onPressed: onRetry, child: Text(retryLabel)),
            ],
          ),
        ),
      );
}
