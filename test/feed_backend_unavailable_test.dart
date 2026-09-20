// Feed Makan — a backend that never answered is NOT "nobody has posted yet".
//
// Reported symptom: Feed Makan → Untuk Anda shows
//   "Belum ada siaran lagi. Jadi yang pertama — spin dan jom makan!"
// while eligible posts exist on the server.
//
// Two client defects are locked here. Both reproduce on the commit under test
// and both are independent of the production ruleset skew (that one is a
// release gate, not a code defect on this branch):
//
//  1. PROVIDER — when Firebase never initialised, `firebaseReadyProvider` stays
//     false and the feed providers returned `Stream.value(const [])`. Riverpod
//     then reports AsyncData([]), so the screen renders the EMPTY state. An
//     unreachable backend has NO answer; it must not be rendered as the
//     answer "no posts". Same principle already established for the follow
//     button in WAVE 3 GATE 3F — see restaurant_follow_error_state_test.dart:
//     a FAILED read is not a negative answer.
//
//  2. UI — the feed's error branch rendered l.t('profileError')
//     ("Profile tak dapat dibuka.") for a FEED failure and offered no way to
//     retry. That is the string the shipped production build shows today while
//     the live WAVE 3C ruleset denies its un-constrained query.
//
// The matchers below deliberately avoid naming any new type, so this file
// COMPILES against the pre-fix source and fails at runtime — a real
// reproduction, not a compile error.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/features/dm/dm_service.dart';
import 'package:makan_mana/features/social/feed_screen.dart';
import 'package:makan_mana/features/social/food_profile.dart';
import 'package:makan_mana/features/social/social_providers.dart';

/// The feed providers must report unavailability as an ERROR carrying a
/// recognisable name — never as data. `.future` completes with the first
/// value, or throws when the stream fails first, so it distinguishes the two.
final _unavailable = predicate<Object>(
  (e) => e.toString().toLowerCase().contains('unavailable'),
  'an "unavailable" failure',
);

ProviderContainer _backendDown() => ProviderContainer(
      overrides: [firebaseReadyProvider.overrideWithValue(false)],
    );

/// One pump leaves the stream unresolved, so the screen is still LOADING and
/// every findsNothing below would pass without ever seeing the error state.
/// Settle, then assert the loading indicator is gone.
Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 16));
  expect(find.byType(CircularProgressIndicator), findsNothing,
      reason: 'still loading - the assertions below would be vacuous');
}

Widget _app(List<Override> overrides) => ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('ms'),
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: const FeedScreen(),
      ),
    );

/// Overrides that let FeedScreen build without touching Firebase. The feed
/// stream itself is supplied by each test.
List<Override> _screen(Stream<List<FeedPostData>> forYou) => [
      firebaseReadyProvider.overrideWithValue(true),
      dmTotalUnreadProvider.overrideWith((ref) => 0),
      myBlockedIdsProvider.overrideWith((ref) => Stream.value(const <String>{})),
      myMutedIdsProvider.overrideWith((ref) => Stream.value(const <String>{})),
      publicFeedProvider.overrideWith((ref) => forYou),
    ];

void main() {
  group('an unreachable backend is not an empty feed', () {
    test('publicFeedProvider reports the failure instead of an empty list',
        () async {
      final container = _backendDown();
      addTearDown(container.dispose);

      await expectLater(
        container.read(publicFeedProvider.future),
        throwsA(_unavailable),
      );
    });

    test('trendingFeedProvider reports the failure instead of an empty list',
        () async {
      final container = _backendDown();
      addTearDown(container.dispose);

      await expectLater(
        container.read(trendingFeedProvider.future),
        throwsA(_unavailable),
      );
    });

    test('followingFeedProvider reports the failure instead of an empty list',
        () async {
      final container = _backendDown();
      addTearDown(container.dispose);

      await expectLater(
        container.read(followingFeedProvider.future),
        throwsA(_unavailable),
      );
    });

    test('a reachable backend that really has nothing still reports empty',
        () async {
      // The corrective must not turn a genuine empty result into an error:
      // "no eligible posts" is still a valid answer when the read succeeded.
      final container = ProviderContainer(overrides: [
        firebaseReadyProvider.overrideWithValue(true),
        publicFeedProvider
            .overrideWith((ref) => Stream.value(const <FeedPostData>[])),
      ]);
      addTearDown(container.dispose);

      await expectLater(
        container.read(publicFeedProvider.future),
        completion(isEmpty),
      );
    });
  });

  group('the Feed Makan screen separates ERROR from EMPTY', () {
    testWidgets('a failed feed read never shows the "no posts yet" copy',
        (tester) async {
      await tester.pumpWidget(_app(_screen(
        Stream<List<FeedPostData>>.error(
            Exception('permission-denied'), StackTrace.current),
      )));
      await _settle(tester);

      final l = AppLocalizations.of(
          tester.element(find.byType(FeedScreen)));
      expect(find.text(l.t('feedEmpty')), findsNothing,
          reason: 'a failed read must not be reported as "no posts yet"');
      expect(find.textContaining(l.t('feedUnavailable')), findsOneWidget,
          reason: 'the user must be told the feed could not be loaded');
    });

    testWidgets('a failed feed read does not blame the profile',
        (tester) async {
      await tester.pumpWidget(_app(_screen(
        Stream<List<FeedPostData>>.error(
            Exception('permission-denied'), StackTrace.current),
      )));
      await _settle(tester);

      final l = AppLocalizations.of(
          tester.element(find.byType(FeedScreen)));
      expect(find.textContaining(l.t('profileError')), findsNothing,
          reason: 'a FEED failure must not be reported as a PROFILE failure');
    });

    testWidgets('a failed feed read offers a retry the user can actually press',
        (tester) async {
      await tester.pumpWidget(_app(_screen(
        Stream<List<FeedPostData>>.error(
            Exception('permission-denied'), StackTrace.current),
      )));
      await _settle(tester);

      final l = AppLocalizations.of(
          tester.element(find.byType(FeedScreen)));
      expect(find.widgetWithText(TextButton, l.t('retryAction')), findsOneWidget,
          reason: 'an error state without a retry leaves the user stuck');
    });

    testWidgets('a feed that is genuinely empty still shows the empty copy',
        (tester) async {
      await tester.pumpWidget(_app(_screen(
        Stream<List<FeedPostData>>.value(const <FeedPostData>[]),
      )));
      await _settle(tester);

      final l = AppLocalizations.of(
          tester.element(find.byType(FeedScreen)));
      expect(find.text(l.t('feedEmpty')), findsOneWidget,
          reason: 'the empty state must survive for a successful empty read');
    });

    testWidgets('a feed that is still loading shows a loading indicator',
        (tester) async {
      await tester.pumpWidget(_app(_screen(
        Stream<List<FeedPostData>>.fromFuture(
            Completer<List<FeedPostData>>().future),
      )));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}
