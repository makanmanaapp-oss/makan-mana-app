// WAVE 3 GATE 3F — a FAILED read is not a negative answer.
//
// Root cause of the "Follow button does nothing" report: the live production
// ruleset has no rule for `restaurant_follows` / `restaurant_public`, so both
// client streams terminate in PERMISSION_DENIED. The widget used to flatten
// that with `valueOrNull ?? false` / `?? 0`, so a denied read was rendered as
// the authoritative claims "you are not following" and "0 followers" — even
// though the server had really stored the follow and the aggregate said 1.
//
// These tests lock the corrective: an errored provider renders an explicit
// UNAVAILABLE state, an unresolved provider renders a loading state, and
// neither ever renders a fabricated 0 or raw Firebase error text.
import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/features/restaurant/engagement/restaurant_engagement_providers.dart';
import 'package:makan_mana/features/restaurant/engagement/restaurant_follow_button.dart';

const _target = 'PLC-379343ea37954e00ac22293c';

/// A stream that never emits and never errors — the "still resolving" case.
Stream<T> _pending<T>() => Stream<T>.fromFuture(Completer<T>().future);

Future<void> _pump(
  WidgetTester tester, {
  required Stream<bool> follow,
  required Stream<int> count,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        myRestaurantFollowProvider.overrideWith((ref, id) => follow),
        restaurantFollowerCountProvider.overrideWith((ref, id) => count),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('en'),
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: const Scaffold(
          body: Center(
            child: RestaurantFollowButton(canonicalPlaceId: _target),
          ),
        ),
      ),
    ),
  );
  // Two frames: the first mounts, the second lands the stream's first event
  // (or its error). `pumpAndSettle` cannot be used — the loading case holds a
  // CircularProgressIndicator that never stops animating.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 16));
}

final _unavailable = find.byKey(const Key('restaurant-followers-unavailable'));
final _loading = find.byKey(const Key('restaurant-followers-loading'));
final _countLabel = find.byKey(const Key('restaurant-follower-count'));

void main() {
  group('denied reads are never answered with a lie', () {
    testWidgets('1. both streams denied -> UNAVAILABLE, never "0 followers"',
        (tester) async {
      await _pump(
        tester,
        follow: Stream<bool>.error(Exception('permission-denied')),
        count: Stream<int>.error(Exception('permission-denied')),
      );

      expect(_unavailable, findsOneWidget);
      expect(_countLabel, findsNothing);
      expect(find.textContaining('0 followers'), findsNothing);
      expect(find.text('0'), findsNothing);
      // and no raw Firebase/technical error text is exposed to the user
      expect(find.textContaining('permission'), findsNothing);
      expect(find.textContaining('Exception'), findsNothing);
      expect(find.textContaining('PERMISSION_DENIED'), findsNothing);
    });

    testWidgets('2. follow stream denied alone still marks state UNAVAILABLE',
        (tester) async {
      await _pump(
        tester,
        follow: Stream<bool>.error(Exception('permission-denied')),
        count: Stream<int>.value(1),
      );
      // The count read succeeded, but "am I following" did NOT — so the
      // follower slot must not present the surviving number as a complete
      // answer about this user's own state.
      expect(_unavailable, findsOneWidget);
      expect(_countLabel, findsNothing);
    });

    testWidgets('3. count stream denied alone -> UNAVAILABLE, follow state kept',
        (tester) async {
      await _pump(
        tester,
        follow: Stream<bool>.value(true),
        count: Stream<int>.error(Exception('permission-denied')),
      );
      expect(_unavailable, findsOneWidget);
      expect(_countLabel, findsNothing);
      // The follow read succeeded, so the button keeps telling the truth.
      expect(find.text('Following'), findsOneWidget);
      expect(find.text('Follow'), findsNothing);
    });
  });

  group('unresolved is loading, not zero', () {
    testWidgets('4. a pending count renders a spinner, not 0', (tester) async {
      await _pump(tester, follow: _pending<bool>(), count: _pending<int>());
      expect(_loading, findsOneWidget);
      expect(_countLabel, findsNothing);
      expect(_unavailable, findsNothing);
      expect(find.textContaining('0 followers'), findsNothing);
    });
  });

  group('healthy reads are unchanged', () {
    testWidgets('5. real values still render the real count and state',
        (tester) async {
      await _pump(
        tester,
        follow: Stream<bool>.value(true),
        count: Stream<int>.value(1),
      );
      expect(_countLabel, findsOneWidget);
      expect(find.text('1 followers'), findsOneWidget);
      expect(find.text('Following'), findsOneWidget);
      expect(_unavailable, findsNothing);
      expect(_loading, findsNothing);
    });

    testWidgets('6. a genuine 0 from a SUCCESSFUL read is still shown',
        (tester) async {
      await _pump(
        tester,
        follow: Stream<bool>.value(false),
        count: Stream<int>.value(0),
      );
      expect(find.text('0 followers'), findsOneWidget);
      expect(find.text('Follow'), findsOneWidget);
      expect(_unavailable, findsNothing);
    });
  });

  group('the providers themselves never fabricate an answer', () {
    ProviderContainer container({required bool ready, String target = _target}) {
      final c = ProviderContainer(
        overrides: [firebaseReadyProvider.overrideWithValue(ready)],
      );
      addTearDown(c.dispose);
      return c;
    }

    test('11. an UNINITIALISED Firebase leaves both providers unresolved', () {
      final c = container(ready: false);
      // Not `0` and not `false`: nothing is known yet, so nothing is claimed.
      final count = c.read(restaurantFollowerCountProvider(_target));
      final follow = c.read(myRestaurantFollowProvider(_target));
      expect(count.hasValue, isFalse);
      expect(count.hasError, isFalse);
      expect(count.isLoading, isTrue);
      expect(follow.hasValue, isFalse);
      expect(follow.isLoading, isTrue);
    });

    test('12. an UNRESOLVED restaurant leaves both providers unresolved', () {
      final c = container(ready: true, target: '');
      expect(c.read(restaurantFollowerCountProvider('')).hasValue, isFalse);
      expect(c.read(myRestaurantFollowProvider('')).hasValue, isFalse);
    });

    test('13. the empty stream never resolves to a value', () async {
      final c = container(ready: false);
      // Give the empty stream a turn to close; the state must still be loading
      // rather than having settled on a fabricated default.
      await Future<void>.delayed(Duration.zero);
      expect(c.read(restaurantFollowerCountProvider(_target)).hasValue, isFalse);
      expect(c.read(myRestaurantFollowProvider(_target)).hasValue, isFalse);
    });
  });

  group('source contract', () {
    final source = File(
            'lib/features/restaurant/engagement/restaurant_follow_button.dart')
        .readAsStringSync()
        .replaceAll('\r\n', '\n');
    final body = source
        .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), ' ')
        .replaceAll(RegExp(r'^[ \t]*//.*$', multiLine: true), ' ')
        .replaceAll(RegExp(r'^[ \t]*///.*$', multiLine: true), ' ');

    test('7. the error-flattening defaults are gone', () {
      expect(body.contains('valueOrNull ?? false'), isFalse,
          reason: 'a denied read must not become "not following"');
      expect(body.contains('valueOrNull ?? 0'), isFalse,
          reason: 'a denied read must not become "0 followers"');
    });

    test('8. the widget reasons over AsyncValue state, not a flattened value',
        () {
      expect(body, contains('hasError'));
      expect(body, contains('hasValue'));
      expect(body, contains("t.t('restaurantFollowersUnavailable')"));
    });

    test('9. the optimistic override is only cleared on a SUCCESSFUL read', () {
      // `hasValue` guards the clear, so an error can never "confirm" a state.
      expect(body, contains('followAsync.hasValue'));
      expect(body, contains('_override == serverFollowing'));
    });

    test('10. the unavailable string exists in every supported locale', () {
      final strings =
          File('lib/app/localization/restaurant_detail_strings.dart')
              .readAsStringSync();
      expect(
        "'restaurantFollowersUnavailable'".allMatches(strings).length,
        AppLocalizations.supportedLocales.length,
        reason: 'ms / en / zh / ta must all have a translation',
      );
    });
  });
}
