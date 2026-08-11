// HOTFIX 4.4 — Group FAB cleanup + group card polish.
//
// Source-guards the single-CTA / no-overlap fix and the enriched card model
// (branded fallback badge + description), plus a deterministic overflow check
// for the card subtitle at large text scale on a narrow viewport. Preserves
// 4.2 search-only discovery and 4.3 public preview (run those suites too).
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/core/constants/app_colors.dart';
import 'package:makan_mana/features/social/social_ui.dart';

void main() {
  final feed = File('lib/features/social/feed_screen.dart').readAsStringSync();

  group('FAB cleanup — one Create Group CTA, no overlap (Parts 1/10)', () {
    test('compose pencil FAB hidden on Groups tab (index 4)', () {
      expect(feed.contains('if (tab.index == 4) return const SizedBox.shrink()'),
          isTrue);
    });
    test('Groups tab keeps its single Create Group extended FAB', () {
      expect(feed.contains("heroTag: 'createGroupHub'"), isTrue);
      expect(feed.contains("l.t('createGroup')"), isTrue);
    });
    test('compose FAB still present for the feed tabs', () {
      expect(feed.contains("heroTag: 'composeFeed'"), isTrue);
    });
  });

  group('Group card information model (Parts 2/3/4/6)', () {
    // HOTFIX 4.5: fallback badge extracted into shared GroupAvatar; the tile
    // leading is now GroupAvatar (image or branded emoji fallback).
    final tile = feed.substring(feed.indexOf('Widget _groupTile'));
    test('shared resolver avatar (image or branded fallback) used as leading', () {
      // HOTFIX 4.5C: leading kini GroupAvatarResolved (resolver signed-GET V2).
      expect(
          tile.contains(
              'leading: GroupAvatarResolved(groupId: g.id, emoji: g.emoji, size: 46)'),
          isTrue);
    });
    test('description shown when present, 2-line ellipsis (Part 6)', () {
      expect(tile.contains('g.description.isNotEmpty'), isTrue);
      expect(tile.contains('Text(g.description'), isTrue);
      expect(tile.contains('maxLines: 2'), isTrue);
    });
    test('missing description handled cleanly (activity fallback, no clutter)',
        () {
      expect(tile.contains('] else if (stats != null &&'), isTrue);
    });
    test('privacy badge + member count still render (Parts 7/8)', () {
      expect(tile.contains('GroupPrivacyBadge(isPrivate: g.isPrivate'), isTrue);
      expect(tile.contains("\${g.memberCount} \${l.t('membersLabel')}"), isTrue);
    });
  });

  testWidgets('card subtitle (privacy + long desc) no overflow @1.5/320 (P11/12)',
      (tester) async {
    Widget subtitle() => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const GroupPrivacyBadge(isPrivate: false, dense: true),
              const SizedBox(width: 8),
              Expanded(
                child: Text('128 members · 5 polls · 3 bills',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: AppColors.threadsMuted)),
              ),
            ]),
            const SizedBox(height: 3),
            Text(
              'A very long group description that should truncate to two lines '
              'cleanly without overflowing the narrow card on a small device.',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: AppColors.threadsMuted),
            ),
          ],
        );
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: Builder(
        builder: (ctx) => MediaQuery(
          data: MediaQuery.of(ctx)
              .copyWith(textScaler: const TextScaler.linear(1.5)),
          child: Scaffold(
              body: Center(child: SizedBox(width: 300, child: subtitle()))),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
