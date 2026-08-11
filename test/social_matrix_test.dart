// FIX 4.1 — Deterministic visual matrix for the shared social system.
//
// Covers what a device screenshot can't do reliably: text-scale 1.0/1.3/1.5,
// narrow viewport, Bright + Dark rendering, and long content — asserting NO
// RenderFlex overflow and no exceptions for the shared primitives and the
// composed engagement / group rows. Presentation only.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/core/constants/app_colors.dart';
import 'package:makan_mana/features/social/social_ui.dart';

Widget _host(
  Widget child, {
  double scale = 1.0,
  Brightness brightness = Brightness.dark,
  double width = 360,
  Locale locale = const Locale('en'),
}) =>
    MaterialApp(
      locale: locale,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      theme: ThemeData(brightness: brightness),
      home: Builder(
        builder: (ctx) => MediaQuery(
          data: MediaQuery.of(ctx)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: Scaffold(
            backgroundColor: AppColors.threadsBg,
            body: Center(
              child: SizedBox(width: width, child: child),
            ),
          ),
        ),
      ),
    );

/// Representative feed/media engagement row (5 shared actions).
Widget _engagementRow() => Row(
      children: [
        SocialActionButton(
            icon: Icons.favorite_border,
            color: AppColors.threadsText,
            semanticLabel: 'Like',
            label: '128',
            onTap: () {}),
        const SizedBox(width: 10),
        SocialActionButton(
            icon: Icons.mode_comment_outlined,
            color: AppColors.threadsText,
            semanticLabel: 'Reply',
            label: '64',
            onTap: () {}),
        const SizedBox(width: 10),
        SocialActionButton(
            icon: Icons.repeat,
            color: AppColors.threadsText,
            semanticLabel: 'Repost',
            label: '32',
            onTap: () {}),
        const SizedBox(width: 10),
        SocialActionButton(
            icon: Icons.send_outlined,
            color: AppColors.threadsText,
            semanticLabel: 'Share',
            onTap: () {}),
        const Spacer(),
        SocialActionButton(
            icon: Icons.bookmark_border,
            color: AppColors.threadsText,
            semanticLabel: 'Save',
            onTap: () {}),
      ],
    );

/// Representative group card subtitle row (privacy badge + long info text).
Widget _groupCardRow() => Row(
      children: [
        const GroupPrivacyBadge(isPrivate: true, dense: true),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            'Public · 128 members · 5 active polls · 3 unpaid bills',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: AppColors.threadsMuted),
          ),
        ),
      ],
    );

void main() {
  const scales = [1.0, 1.3, 1.5];

  group('Engagement row — no overflow across text scale + narrow (Parts 10-12)',
      () {
    for (final s in scales) {
      testWidgets('scale $s @ 360px (SM-A055F logical width)', (tester) async {
        await tester.pumpWidget(_host(_engagementRow(), scale: s, width: 360));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.byType(SocialActionButton), findsNWidgets(5));
      });
    }
  });

  group('Group card row — no overflow across text scale (Parts 10-12)', () {
    for (final s in scales) {
      testWidgets('scale $s @ 320px', (tester) async {
        await tester.pumpWidget(_host(_groupCardRow(), scale: s, width: 320));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.byType(GroupPrivacyBadge), findsOneWidget);
      });
    }
  });

  group('Bright + Dark render without throwing (Parts 8-9)', () {
    for (final b in Brightness.values) {
      testWidgets('engagement row — $b', (tester) async {
        await tester.pumpWidget(_host(_engagementRow(), brightness: b));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
      testWidgets('privacy + role badges — $b', (tester) async {
        await tester.pumpWidget(_host(
            const Wrap(spacing: 6, children: [
              GroupPrivacyBadge(isPrivate: false),
              GroupPrivacyBadge(isPrivate: true),
              GroupRoleBadge(role: 'owner'),
              GroupRoleBadge(role: 'admin'),
              GroupRoleBadge(role: 'member'),
            ]),
            brightness: b));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  });

  group('Long content — badges + long labels at scale 1.5 (Part 11)', () {
    testWidgets('role badge tolerates scale 1.5 narrow', (tester) async {
      await tester.pumpWidget(_host(
          const Wrap(children: [
            GroupRoleBadge(role: 'owner'),
            GroupRoleBadge(role: 'viewer'),
          ]),
          scale: 1.5,
          width: 300));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets('privacy badge localizes (Mandarin) at scale 1.5',
        (tester) async {
      await tester.pumpWidget(_host(const GroupPrivacyBadge(isPrivate: true),
          scale: 1.5, locale: const Locale('zh')));
      await tester.pumpAndSettle();
      expect(find.text('私密'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
