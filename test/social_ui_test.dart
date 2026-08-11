// FIX 4 — Official social visual system tests.
//
// Presentation-only. Verifies the SHARED social primitives (SocialActionButton,
// GroupPrivacyBadge, GroupRoleBadge), their accessibility (semantic labels +
// tap target), 4-language coverage of the new a11y keys, and that the social
// surfaces are wired to the shared system (source guards). No logic under test.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/features/social/social_ui.dart';

Widget _wrap(Widget child, {Locale locale = const Locale('en')}) => MaterialApp(
      locale: locale,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: Center(child: child)),
    );

void main() {
  group('SocialActionButton (Parts 3/4/22/23)', () {
    testWidgets('renders icon + count label, fires onTap', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_wrap(SocialActionButton(
        icon: Icons.favorite_border,
        color: const Color(0xFFFFFFFF),
        semanticLabel: 'Like',
        label: '3',
        onTap: () => taps++,
      )));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.favorite_border), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
      await tester.tap(find.byType(SocialActionButton));
      expect(taps, 1);
    });

    testWidgets('exposes a semantic button label (Part 23)', (tester) async {
      await tester.pumpWidget(_wrap(SocialActionButton(
        icon: Icons.send_outlined,
        color: const Color(0xFFFFFFFF),
        semanticLabel: 'Share',
        onTap: () {},
      )));
      await tester.pumpAndSettle();
      expect(
          find.bySemanticsLabel('Share'), findsOneWidget,
          reason: 'icon-only action needs a screen-reader label');
    });

    testWidgets('icon-only button meets 44px tap target (Part 22)',
        (tester) async {
      await tester.pumpWidget(_wrap(SocialActionButton(
        icon: Icons.bookmark_border,
        color: const Color(0xFFFFFFFF),
        semanticLabel: 'Save',
        onTap: () {},
      )));
      await tester.pumpAndSettle();
      final size = tester.getSize(find.byType(SocialActionButton));
      expect(size.height, greaterThanOrEqualTo(44));
      expect(size.width, greaterThanOrEqualTo(44));
    });
  });

  group('GroupPrivacyBadge (Part 10)', () {
    testWidgets('private → lock icon + localized label', (tester) async {
      await tester.pumpWidget(_wrap(const GroupPrivacyBadge(isPrivate: true)));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.lock_outline), findsOneWidget);
      expect(find.text('Private'), findsOneWidget);
    });

    testWidgets('public → globe icon + localized label', (tester) async {
      await tester.pumpWidget(_wrap(const GroupPrivacyBadge(isPrivate: false)));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.public), findsOneWidget);
      expect(find.text('Public'), findsOneWidget);
    });

    testWidgets('localizes to Malay', (tester) async {
      await tester.pumpWidget(_wrap(const GroupPrivacyBadge(isPrivate: true),
          locale: const Locale('ms')));
      await tester.pumpAndSettle();
      expect(find.text('Peribadi'), findsOneWidget);
    });
  });

  group('GroupRoleBadge (Part 11)', () {
    testWidgets('owner + member render localized labels', (tester) async {
      await tester.pumpWidget(_wrap(const Column(children: [
        GroupRoleBadge(role: 'owner'),
        GroupRoleBadge(role: 'member'),
      ])));
      await tester.pumpAndSettle();
      expect(find.text('Owner'), findsOneWidget);
      expect(find.text('Member'), findsOneWidget);
    });
  });

  group('Localization — new a11y keys in all 4 languages (Part 32)', () {
    const newKeys = [
      'likeAction',
      'unlikeAction',
      'replyAction',
      'removeSavedAction',
    ];
    for (final lang in const ['ms', 'en', 'zh', 'ta']) {
      test('$lang has all new a11y keys', () {
        final keys = AppLocalizations.keysForTesting(Locale(lang));
        for (final k in newKeys) {
          expect(keys.contains(k), isTrue, reason: '$lang missing $k');
        }
      });
    }
  });

  group('source guards — social surfaces wired to shared system', () {
    final postCard =
        File('lib/features/social/post_card.dart').readAsStringSync();
    final hub =
        File('lib/features/groups/group_hub_screen.dart').readAsStringSync();
    final feed =
        File('lib/features/social/feed_screen.dart').readAsStringSync();
    final settings = File('lib/features/groups/group_settings_screen.dart')
        .readAsStringSync();

    test('feed card engagement uses SocialActionButton, not private _ActionIcon',
        () {
      expect(postCard.contains('SocialActionButton('), isTrue);
      expect(postCard.contains('class _ActionIcon'), isFalse);
      // semantic labels wired for like/save toggle states
      expect(postCard.contains("l.t(liked ? 'unlikeAction' : 'likeAction')"),
          isTrue);
      expect(
          postCard
              .contains("l.t(saved ? 'removeSavedAction' : 'saveAction')"),
          isTrue);
    });

    test('media viewer (post detail) adopts SocialActionButton + same icons',
        () {
      final viewer = File('lib/features/social/media_viewer_screen.dart')
          .readAsStringSync();
      expect(viewer.contains('SocialActionButton('), isTrue);
      expect(viewer.contains('class _ViewerAction'), isFalse);
      // Same semantic action → same icon family as Feed.
      for (final icon in const [
        'Icons.favorite',
        'Icons.mode_comment_outlined',
        'Icons.send_outlined',
        'Icons.bookmark',
      ]) {
        expect(viewer.contains(icon), isTrue, reason: 'viewer missing $icon');
        expect(postCard.contains(icon), isTrue, reason: 'feed missing $icon');
      }
    });

    test('group hub uses shared privacy + role badges; owner-only accent', () {
      expect(hub.contains('GroupPrivacyBadge('), isTrue);
      expect(hub.contains('GroupRoleBadge('), isTrue);
      expect(hub.contains("highlight: role == 'owner'"), isTrue);
      expect(hub.contains('Widget _roleBadge('), isFalse);
    });

    test('group cards show privacy badge (Part 10)', () {
      expect(feed.contains('GroupPrivacyBadge(isPrivate: g.isPrivate'), isTrue);
    });

    test('Leave is neutral, Delete stays owner-only destructive (Part 13/14)',
        () {
      // Leave button no longer uses primaryRed (distinct from destructive).
      expect(settings.contains('foregroundColor: context.mm.onCardMuted'),
          isTrue,
          reason: 'Leave button neutral, not destructive red');
      // Danger zone Delete still gated owner-only + red.
      expect(settings.contains('if (isOwner) ...['), isTrue);
      expect(settings.contains("l.t('deleteGroup')"), isTrue);
    });
  });
}
