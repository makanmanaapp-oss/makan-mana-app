/// QA-DEV21 — Activity tab classification + time grouping (PURE, testable).
///
/// Classification is driven ONLY by real notification metadata (`type` and
/// `actorUid`) — never by parsing display text. Unknown/system types match ONLY
/// the All tab (never a specialist tab). "People you follow" is derived from the
/// existing following-set (myFollowingIdsProvider) — no per-row Firestore reads.
library;

import 'notification_model.dart';

enum ActivityTab {
  all,
  follows,
  conversations,
  mentions,
  peopleYouFollow,
  reposts,
}

/// l10n key for each tab chip label.
String activityTabKey(ActivityTab tab) => switch (tab) {
      ActivityTab.all => 'actTabAll',
      ActivityTab.follows => 'actTabFollows',
      ActivityTab.conversations => 'actTabConversations',
      ActivityTab.mentions => 'actTabMentions',
      ActivityTab.peopleYouFollow => 'actTabPeopleYouFollow',
      ActivityTab.reposts => 'actTabReposts',
    };

/// True if [n] belongs in [tab]. [following] = uids the current user follows
/// (only consulted for the People-you-follow tab).
bool activityMatches(
  MakanNotification n,
  ActivityTab tab,
  Set<String> following,
) {
  switch (tab) {
    case ActivityTab.all:
      return true;
    case ActivityTab.follows:
      return n.type == MakanNotificationType.socialFollow;
    case ActivityTab.conversations:
      return n.type == MakanNotificationType.socialComment ||
          n.type == MakanNotificationType.socialReply;
    case ActivityTab.mentions:
      return n.type == MakanNotificationType.socialMention;
    case ActivityTab.reposts:
      return n.type == MakanNotificationType.socialRepost ||
          n.type == MakanNotificationType.socialQuote;
    case ActivityTab.peopleYouFollow:
      final a = n.actorUid;
      return a != null && a.isNotEmpty && following.contains(a);
  }
}

/// Filter (order preserved; caller keeps newest-first).
List<MakanNotification> filterActivity(
  List<MakanNotification> all,
  ActivityTab tab,
  Set<String> following,
) =>
    all.where((n) => activityMatches(n, tab, following)).toList(growable: false);

/// Time buckets for section headings. Uses ACTUAL timestamps.
enum ActivityBucket { today, last7, last30, earlier }

String activityBucketKey(ActivityBucket b) => switch (b) {
      ActivityBucket.today => 'notifToday',
      ActivityBucket.last7 => 'notifLast7Days',
      ActivityBucket.last30 => 'notifLast30Days',
      ActivityBucket.earlier => 'notifEarlier',
    };

ActivityBucket activityBucket(DateTime createdAt, DateTime now) {
  final startOfToday = DateTime(now.year, now.month, now.day);
  final created = DateTime(createdAt.year, createdAt.month, createdAt.day);
  final days = startOfToday.difference(created).inDays;
  if (days <= 0) return ActivityBucket.today;
  if (days <= 7) return ActivityBucket.last7;
  if (days <= 30) return ActivityBucket.last30;
  return ActivityBucket.earlier;
}

/// True for social event types that carry a real actor avatar/identity.
bool activityIsSocial(MakanNotificationType t) => switch (t) {
      MakanNotificationType.socialReaction ||
      MakanNotificationType.socialComment ||
      MakanNotificationType.socialReply ||
      MakanNotificationType.socialMention ||
      MakanNotificationType.socialFollow ||
      MakanNotificationType.socialRepost ||
      MakanNotificationType.socialQuote ||
      MakanNotificationType.social =>
        true,
      _ => false,
    };
