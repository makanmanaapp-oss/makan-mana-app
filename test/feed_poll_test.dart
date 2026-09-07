// QA-DEV17 — Feed/Status Poll client tests.
//
// Covers the pure composer form validation (poll_form.dart) and the interactive
// FeedPollCard rendering: question/options/percentages/total, selected-vote
// state, closed-poll state, and backward-safe decode of a partial poll map.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/features/social/feed_poll_card.dart';
import 'package:makan_mana/features/social/poll_form.dart';
import 'package:makan_mana/features/social/social_providers.dart';

Widget _wrap(Widget child, {List<Override> overrides = const []}) =>
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    );

Map<String, dynamic> _poll({
  String status = 'open',
  int totalVotes = 4,
  List<Map<String, dynamic>>? options,
}) =>
    {
      'question': 'Makan mana?',
      'type': 'general',
      'status': status,
      'totalVotes': totalVotes,
      'options': options ??
          [
            {'key': 'o0', 'label': 'Nasi Lemak', 'votes': 2},
            {'key': 'o1', 'label': 'Roti Canai', 'votes': 2},
          ],
    };

void main() {
  group('poll_form.isFeedPollFormValid', () {
    test('valid question + 2 distinct options', () {
      expect(isFeedPollFormValid('Makan mana?', ['A', 'B']), isTrue);
    });
    test('question length bounds enforced', () {
      expect(isFeedPollFormValid('a', ['A', 'B']), isFalse);
      expect(isFeedPollFormValid('a' * 121, ['A', 'B']), isFalse);
      expect(isFeedPollFormValid('ok', ['A', 'B']), isTrue);
    });
    test('needs >= 2 non-blank options', () {
      expect(isFeedPollFormValid('Q?', ['A']), isFalse);
      expect(isFeedPollFormValid('Q?', ['A', '   ']), isFalse);
      expect(isFeedPollFormValid('Q?', []), isFalse);
    });
    test('case-insensitive duplicates count once', () {
      expect(isFeedPollFormValid('Q?', ['Nasi', 'nasi']), isFalse);
      expect(isFeedPollFormValid('Q?', ['Nasi', 'Roti']), isTrue);
    });
    test('cleanPollOptions trims and drops blanks (order kept)', () {
      expect(cleanPollOptions([' A ', '', 'B', '   ']), ['A', 'B']);
    });
  });

  group('FeedPollCard', () {
    testWidgets('renders question, options, percentages and total',
        (tester) async {
      await tester.pumpWidget(_wrap(
        FeedPollCard(postId: 'p1', poll: _poll()),
        overrides: [
          feedPollVoteProvider('p1').overrideWith((ref) => Stream.value(null)),
        ],
      ));
      await tester.pumpAndSettle();
      expect(find.text('Makan mana?'), findsOneWidget);
      expect(find.text('Nasi Lemak'), findsOneWidget);
      expect(find.text('Roti Canai'), findsOneWidget);
      expect(find.text('50%'), findsNWidgets(2));
      expect(find.textContaining('votes so far'), findsOneWidget);
    });

    testWidgets('selected option shows a check icon', (tester) async {
      await tester.pumpWidget(_wrap(
        FeedPollCard(postId: 'p1', poll: _poll()),
        overrides: [
          feedPollVoteProvider('p1').overrideWith((ref) => Stream.value('o0')),
        ],
      ));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.check_circle), findsOneWidget);
    });

    testWidgets('closed poll shows the Closed label', (tester) async {
      await tester.pumpWidget(_wrap(
        FeedPollCard(postId: 'p1', poll: _poll(status: 'closed')),
        overrides: [
          feedPollVoteProvider('p1').overrideWith((ref) => Stream.value(null)),
        ],
      ));
      await tester.pumpAndSettle();
      expect(find.text('Closed'), findsOneWidget);
    });

    testWidgets('backward-safe: partial poll map renders without crashing',
        (tester) async {
      await tester.pumpWidget(_wrap(
        // Missing totalVotes/votes/type — old/partial docs must not crash.
        FeedPollCard(postId: 'p1', poll: {
          'question': 'Q?',
          'options': [
            {'key': 'o0', 'label': 'X'},
            {'key': 'o1', 'label': 'Y'},
          ],
        }),
        overrides: [
          feedPollVoteProvider('p1').overrideWith((ref) => Stream.value(null)),
        ],
      ));
      await tester.pumpAndSettle();
      expect(find.text('Q?'), findsOneWidget);
      expect(find.text('0%'), findsNWidgets(2));
      expect(tester.takeException(), isNull);
    });
  });
}
