// QA-DEV21 — NotificationScreen (Activity redesign) widget tests (no Firebase).
//
// Overrides notificationsStreamProvider + myFollowingIdsProvider + firebaseReady
// so loading/empty/error/data + time grouping + tab filtering + the compact
// Mark-all-read control can be tested without a backend. No navigation taps.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/features/notifications/notification_model.dart';
import 'package:makan_mana/features/notifications/notification_providers.dart';
import 'package:makan_mana/features/notifications/notification_screen.dart';
import 'package:makan_mana/features/social/food_profile.dart';

MakanNotification _mk({
  required String id,
  required DateTime createdAt,
  bool isRead = false,
  String title = 'Tajuk',
  MakanNotificationType type = MakanNotificationType.system,
  String? actorUid,
  String? bodyKey,
  String? actorDisplaySnapshot,
}) =>
    MakanNotification(
      id: id,
      type: type,
      title: title,
      body: 'Kandungan',
      createdAt: createdAt,
      isRead: isRead,
      actorUid: actorUid,
      bodyKey: bodyKey,
      actorDisplaySnapshot: actorDisplaySnapshot,
    );

Future<void> _pump(WidgetTester tester, Stream<List<MakanNotification>> stream,
    {Set<String>? following,
    Map<String, FoodProfile> profiles = const {}}) async {
  await tester.binding.setSurfaceSize(const Size(800, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(ProviderScope(
    overrides: [
      firebaseReadyProvider.overrideWithValue(false),
      notificationsStreamProvider.overrideWith((ref) => stream),
      myFollowingIdsProvider
          .overrideWith((ref) => Stream.value(following ?? const <String>{})),
      publicProfileProvider.overrideWith((ref, uid) =>
          Stream.value(profiles[uid] ?? FoodProfile.fromMap(uid, null))),
    ],
    child: const MaterialApp(
      locale: Locale('en'),
      localizationsDelegates: [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: [Locale('en')],
      home: NotificationScreen(),
    ),
  ));
}

void main() {
  testWidgets('Activity header + tab rail render', (tester) async {
    await _pump(tester, Stream.value(const <MakanNotification>[]));
    await tester.pumpAndSettle();
    expect(find.text('Activity'), findsOneWidget);
    // All 6 filter chips present.
    for (final t in const [
      'All',
      'Follows',
      'Conversations',
      'Mentions',
      'Following',
      'Reposts',
    ]) {
      expect(find.text(t), findsOneWidget, reason: 'missing chip $t');
    }
  });

  testWidgets('bright Activity canvas is clean white', (tester) async {
    await _pump(tester, Stream.value(const <MakanNotification>[]));
    await tester.pumpAndSettle();
    final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
    expect(scaffold.backgroundColor, Colors.white);
  });

  testWidgets('empty tab shows honest centered message', (tester) async {
    await _pump(tester, Stream.value(const <MakanNotification>[]));
    await tester.pumpAndSettle();
    expect(find.text('Nothing to see here yet'), findsOneWidget);
  });

  testWidgets('loading shows spinner', (tester) async {
    final controller = StreamController<List<MakanNotification>>();
    addTearDown(controller.close);
    await _pump(tester, controller.stream);
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('stream error shows message + retry, tab rail preserved',
      (tester) async {
    await _pump(tester, Stream.error(Exception('boom')));
    await tester.pumpAndSettle();
    expect(find.text('Could not load notifications.'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    expect(find.text('All'), findsOneWidget); // rail still there
  });

  testWidgets('data renders row + Today group; Mark all read in compact menu',
      (tester) async {
    final now = DateTime.now();
    await _pump(
      tester,
      Stream.value([_mk(id: 'a', createdAt: now, title: 'Hari Ini A')]),
    );
    await tester.pumpAndSettle();
    expect(find.text('Hari Ini A'), findsOneWidget);
    expect(find.text('Today'), findsOneWidget);
    // Mark-all-read is NOT a dominant text button; it lives in the overflow.
    expect(find.text('Mark all as read'), findsNothing);
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    expect(find.text('Mark all as read'), findsOneWidget);
  });

  testWidgets('time grouping: Today / Last 7 days / Earlier', (tester) async {
    final now = DateTime.now();
    await _pump(
      tester,
      Stream.value([
        _mk(id: 't', createdAt: now, title: 'Baharu'),
        _mk(
            id: 'w',
            createdAt: now.subtract(const Duration(days: 3)),
            title: 'MingguIni'),
        _mk(
            id: 'e',
            createdAt: now.subtract(const Duration(days: 40)),
            title: 'Lama'),
      ]),
    );
    await tester.pumpAndSettle();
    expect(find.text('Today'), findsOneWidget);
    expect(find.text('Last 7 days'), findsOneWidget);
    expect(find.text('Earlier'), findsOneWidget);
    expect(find.text('Baharu'), findsOneWidget);
    expect(find.text('Lama'), findsOneWidget);
  });

  testWidgets('tab filter: Follows shows only follow events, hides system',
      (tester) async {
    final now = DateTime.now();
    await _pump(
      tester,
      Stream.value([
        _mk(
          id: 'f',
          createdAt: now,
          title: 'X followed you',
          type: MakanNotificationType.socialFollow,
          actorUid: 'actor1',
        ),
        _mk(id: 's', createdAt: now, title: 'System msg'),
      ]),
    );
    await tester.pumpAndSettle();
    // All tab: both present.
    expect(find.text('X followed you'), findsOneWidget);
    expect(find.text('System msg'), findsOneWidget);
    // Switch to Follows → only the follow remains.
    await tester.tap(find.text('Follows'));
    await tester.pumpAndSettle();
    expect(find.text('X followed you'), findsOneWidget);
    expect(find.text('System msg'), findsNothing);
    // A tab with no matching data → honest empty state.
    await tester.tap(find.text('Mentions'));
    await tester.pumpAndSettle();
    expect(find.text('Nothing to see here yet'), findsOneWidget);
  });

  testWidgets('Follow copy uses the live public actor display name',
      (tester) async {
    final now = DateTime.now();
    await _pump(
      tester,
      Stream.value([
        _mk(
          id: 'follow-q',
          createdAt: now,
          type: MakanNotificationType.socialFollow,
          actorUid: 'q',
          bodyKey: 'notificationSocialFollowBody',
        ),
      ]),
      profiles: const {
        'q': FoodProfile(
            uid: 'q', displayName: 'Q', username: 'Qa', exists: true),
      },
    );
    await tester.pumpAndSettle();
    expect(find.text('Q started following you.'), findsOneWidget);
    expect(find.text('Someone started following you.'), findsNothing);
  });

  // QA-DEV29 — actor-aware copy must apply to EVERY actor-based social type,
  // using realistic live fields (type + actorUid + snapshot + generic bodyKey).
  final actorMatrix = <(MakanNotificationType, String, String, String)>[
    (
      MakanNotificationType.socialReaction,
      'notificationSocialReactionBody',
      'Q reacted to your post.',
      'Someone reacted to your post.',
    ),
    (
      MakanNotificationType.socialComment,
      'notificationSocialCommentBody',
      'Q commented on your post.',
      'There is a new comment on your post.',
    ),
    (
      MakanNotificationType.socialReply,
      'notificationSocialReplyBody',
      'Q replied to you.',
      'Someone replied to your comment.',
    ),
    (
      MakanNotificationType.socialMention,
      'notificationSocialMentionBody',
      'Q mentioned you.',
      'Someone mentioned you.',
    ),
    (
      MakanNotificationType.socialRepost,
      'notificationSocialRepostBody',
      'Q reposted your post.',
      'Someone reposted your post.',
    ),
  ];
  for (final (type, bodyKey, actorCopy, genericCopy) in actorMatrix) {
    testWidgets('${type.name} copy names the live actor', (tester) async {
      final now = DateTime.now();
      await _pump(
        tester,
        Stream.value([
          _mk(
              id: type.name,
              createdAt: now,
              type: type,
              actorUid: 'q',
              bodyKey: bodyKey),
        ]),
        profiles: const {
          'q': FoodProfile(
              uid: 'q', displayName: 'Q', username: 'Qa', exists: true),
        },
      );
      await tester.pumpAndSettle();
      expect(find.text(actorCopy), findsOneWidget, reason: type.name);
      expect(find.text(genericCopy), findsNothing, reason: type.name);
    });
  }

  testWidgets('Follow copy falls back to the public username', (tester) async {
    final now = DateTime.now();
    await _pump(
      tester,
      Stream.value([
        _mk(
            id: 'f',
            createdAt: now,
            type: MakanNotificationType.socialFollow,
            actorUid: 'q',
            bodyKey: 'notificationSocialFollowBody'),
      ]),
      profiles: {'q': FoodProfile.fromMap('q', const {'username': 'Qa'})},
    );
    await tester.pumpAndSettle();
    expect(find.text('Qa started following you.'), findsOneWidget);
  });

  testWidgets('Follow copy falls back to the event snapshot when profile is gone',
      (tester) async {
    final now = DateTime.now();
    await _pump(
      tester,
      Stream.value([
        _mk(
            id: 'f',
            createdAt: now,
            type: MakanNotificationType.socialFollow,
            actorUid: 'q',
            actorDisplaySnapshot: 'Q',
            bodyKey: 'notificationSocialFollowBody'),
      ]),
      // No profile override → public profile does not resolve → snapshot wins.
    );
    await tester.pumpAndSettle();
    expect(find.text('Q started following you.'), findsOneWidget);
  });

  testWidgets('Follow copy stays generic when no actor identity resolves',
      (tester) async {
    final now = DateTime.now();
    await _pump(
      tester,
      Stream.value([
        _mk(
            id: 'f',
            createdAt: now,
            type: MakanNotificationType.socialFollow,
            actorUid: 'q',
            bodyKey: 'notificationSocialFollowBody'),
      ]),
      // No profile, no snapshot → generic localized fallback only.
    );
    await tester.pumpAndSettle();
    expect(find.text('Someone started following you.'), findsOneWidget);
  });

  testWidgets('Activity swipes through tabs and keeps chips in sync',
      (tester) async {
    final now = DateTime.now();
    await _pump(
      tester,
      Stream.value([
        _mk(
          id: 'follow',
          createdAt: now,
          title: 'Follow event',
          type: MakanNotificationType.socialFollow,
          actorUid: 'actor1',
        ),
        _mk(
          id: 'conversation',
          createdAt: now,
          title: 'Conversation event',
          type: MakanNotificationType.socialComment,
          actorUid: 'actor2',
        ),
        _mk(
          id: 'mention',
          createdAt: now,
          title: 'Mention event',
          type: MakanNotificationType.socialMention,
          actorUid: 'actor3',
        ),
        _mk(
          id: 'following',
          createdAt: now,
          title: 'Following person event',
          type: MakanNotificationType.socialReaction,
          actorUid: 'actor1',
        ),
        _mk(
          id: 'repost',
          createdAt: now,
          title: 'Repost event',
          type: MakanNotificationType.socialRepost,
          actorUid: 'actor4',
        ),
      ]),
      following: const {'actor1'},
    );
    await tester.pumpAndSettle();

    final pages = find.byType(PageView);
    await tester.drag(pages, const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(find.text('Follow event'), findsOneWidget);

    await tester.drag(pages, const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(find.text('Conversation event'), findsOneWidget);

    await tester.drag(pages, const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(find.text('Mention event'), findsOneWidget);

    await tester.drag(pages, const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(find.text('Following person event'), findsOneWidget);

    await tester.drag(pages, const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(find.text('Repost event'), findsOneWidget);
    expect(find.text('Reposts'), findsOneWidget);
    expect(tester.getCenter(find.text('Reposts')).dx, inInclusiveRange(0, 800));

    await tester.drag(pages, const Offset(500, 0));
    await tester.pumpAndSettle();
    expect(find.text('Following person event'), findsOneWidget);
  });

  testWidgets('tapping a chip moves Activity content without refetching',
      (tester) async {
    final now = DateTime.now();
    await _pump(
      tester,
      Stream.value([
        _mk(
          id: 'repost',
          createdAt: now,
          title: 'Repost event',
          type: MakanNotificationType.socialRepost,
          actorUid: 'actor4',
        ),
      ]),
    );
    await tester.pumpAndSettle();

    await tester.drag(find.byType(ListView).first, const Offset(-400, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reposts'));
    await tester.pumpAndSettle();
    expect(find.text('Repost event'), findsOneWidget);
  });
}
