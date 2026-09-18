// B5 — a long CTA label must never overflow the banner.
//
// The CTA row was `Row(min, [Text(label), SizedBox(3), Icon(chevron)])` with no
// width limit, so a long operator-written label on a narrow phone or with large
// system text pushed the chevron out and threw "A RenderFlex overflowed ... on
// the right".
//
// Real CmsBannerCard, real layout at real device geometry (tester.view), real
// GoRouter navigation. Asserted for Malay and English labels at 320/360 dp and
// text scale 1.0/1.3/2.0:
//  - no layout exception;
//  - the chevron stays fully inside the card and is not covered by the text;
//  - the label is truncated with an ellipsis on ONE line when it does not fit;
//  - screen readers still get the FULL label;
//  - tapping the CTA still navigates and logs exactly one cms_cta_tapped;
//  - a normal short label lays out exactly as before (no redesign).
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/events/event_types.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/services/event_logger.dart';
import 'package:makan_mana/features/cms/cms_banner.dart';
import 'package:makan_mana/features/cms/cms_content.dart';

const _longMalay =
    'Tebus tawaran istimewa Minggu Makanan Laut Selangor sekarang juga sebelum '
    'tamat tempoh';
const _longEnglish =
    'Redeem the exclusive Selangor Seafood Week family platter offer before it '
    'ends tonight';
const _short = 'Lihat tawaran';

class _RecordingLogger extends EventLogger {
  _RecordingLogger(super.ref, this.events);
  final List<(String, Map<String, dynamic>?)> events;

  @override
  void logEvent(
    String eventType, {
    String? sourceScreen,
    String? sessionId,
    String? suggestionId,
    String? placeId,
    String? placeNameSnapshot,
    String? sourceMode,
    String? resultSource,
    bool isSample = false,
    bool isPreview = false,
    double? matchScore,
    List<String>? negativeSignals,
    Map<String, dynamic>? metadata,
  }) {
    events.add((eventType, metadata));
  }
}

CmsContent _content(String label) => CmsContent(
      contentId: 'cta-regression',
      placement: CmsPlacement.exploreTop,
      title: 'Minggu Makanan Laut',
      subtitle: 'Restoran terpilih berhampiran Selangor',
      body: '',
      ctaLabel: label,
      ctaDestination: '/restaurant/cta-target',
      media: null,
      priority: 10,
      canonicalPlaceId: null,
    );

void _device(WidgetTester t, {required double width, required double scale}) {
  t.view.devicePixelRatio = 2;
  t.view.physicalSize = Size(width * 2, 800 * 2);
  t.platformDispatcher.textScaleFactorTestValue = scale;
  addTearDown(t.view.reset);
  addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
}

Future<List<(String, Map<String, dynamic>?)>> _pump(
    WidgetTester t, String label) async {
  final events = <(String, Map<String, dynamic>?)>[];
  final router = GoRouter(
    initialLocation: '/banner',
    routes: [
      GoRoute(
        path: '/banner',
        builder: (_, __) => Scaffold(
          body: SingleChildScrollView(
            // Same horizontal inset as the Explore / Home slots.
            padding: const EdgeInsets.fromLTRB(20, 40, 20, 0),
            child: CmsBannerCard(
              content: _content(label),
              sponsored: true,
              sourceScreen: 'explore',
            ),
          ),
        ),
      ),
      GoRoute(
        path: '/restaurant/:id',
        builder: (_, s) =>
            Scaffold(body: Text('ROUTE restaurant ${s.pathParameters['id']}')),
      ),
    ],
  );
  await t.pumpWidget(ProviderScope(
    overrides: [
      eventLoggerProvider.overrideWith((ref) => _RecordingLogger(ref, events)),
    ],
    child: MaterialApp.router(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: router,
    ),
  ));
  await t.pump();
  return events;
}

void _expectNoLayoutError(WidgetTester t, String where) {
  final e = t.takeException();
  expect(e, isNull, reason: '$where: ${e.toString().split('\n').first}');
}

void main() {
  for (final label in const [_longMalay, _longEnglish]) {
    final lang = identical(label, _longMalay) ? 'Malay' : 'English';
    for (final width in const [320.0, 360.0]) {
      for (final scale in const [1.0, 1.3, 2.0]) {
        testWidgets(
            'long $lang CTA at ${width.toInt()} dp, text x$scale: no overflow, '
            'ellipsis, chevron visible', (t) async {
          _device(t, width: width, scale: scale);
          await _pump(t, label);
          _expectNoLayoutError(t, 'layout');

          final card = t.getRect(find.byType(CmsBannerCard));
          final text = t.getRect(find.text(label));
          final chevron = t.getRect(find.byIcon(Icons.chevron_right));

          expect(chevron.left, greaterThanOrEqualTo(card.left));
          expect(chevron.right, lessThanOrEqualTo(card.right),
              reason: 'chevron pushed out of the card');
          expect(text.right, lessThanOrEqualTo(chevron.left + 0.5),
              reason: 'label runs underneath the chevron');

          final paragraph = t.renderObject<RenderParagraph>(find.text(label));
          expect(paragraph.maxLines, 1, reason: 'CTA must stay one line');
          expect(paragraph.overflow, TextOverflow.ellipsis);
          expect(paragraph.didExceedMaxLines, isTrue,
              reason: 'this label is too long and must be truncated');
        });
      }
    }
  }

  testWidgets('screen readers get the FULL label even when it is truncated',
      (t) async {
    final semantics = t.ensureSemantics();
    _device(t, width: 320, scale: 1.3);
    await _pump(t, _longMalay);
    _expectNoLayoutError(t, 'layout');
    expect(
        t
            .renderObject<RenderParagraph>(find.text(_longMalay))
            .didExceedMaxLines,
        isTrue);
    expect(find.bySemanticsLabel(RegExp(RegExp.escape(_longMalay))),
        findsOneWidget);
    semantics.dispose();
  });

  testWidgets('tapping a truncated CTA still navigates and logs once',
      (t) async {
    _device(t, width: 320, scale: 2.0);
    final events = await _pump(t, _longEnglish);
    _expectNoLayoutError(t, 'layout');

    await t.tap(find.text(_longEnglish));
    await t.pumpAndSettle();
    expect(find.text('ROUTE restaurant cta-target'), findsOneWidget);
    final taps = events.where((e) => e.$1 == EventType.cmsCtaTapped).toList();
    expect(taps, hasLength(1));
    expect(taps.single.$2, {
      'contentId': 'cta-regression',
      'placement': 'explore_top',
      'ctaKind': 'internal_route',
    });
  });

  testWidgets('tapping the chevron itself also opens the CTA', (t) async {
    _device(t, width: 320, scale: 2.0);
    final events = await _pump(t, _longMalay);
    await t.tap(find.byIcon(Icons.chevron_right));
    await t.pumpAndSettle();
    expect(find.text('ROUTE restaurant cta-target'), findsOneWidget);
    expect(events.where((e) => e.$1 == EventType.cmsCtaTapped), hasLength(1));
  });

  testWidgets(
      'a short label is laid out exactly as before: full text, chevron '
      '3 px after it', (t) async {
    _device(t, width: 360, scale: 1.0);
    await _pump(t, _short);
    _expectNoLayoutError(t, 'layout');

    final paragraph = t.renderObject<RenderParagraph>(find.text(_short));
    expect(paragraph.didExceedMaxLines, isFalse);
    final text = t.getRect(find.text(_short));
    final chevron = t.getRect(find.byIcon(Icons.chevron_right));
    expect(chevron.left, moreOrLessEquals(text.right + 3, epsilon: 0.01));
    // Its natural single-line width, not stretched and not squeezed.
    final natural = TextPainter(
      text: TextSpan(text: _short, style: paragraph.text.style),
      textDirection: TextDirection.ltr,
      textScaler: paragraph.textScaler,
      maxLines: 1,
    )..layout();
    expect(text.width, moreOrLessEquals(natural.width, epsilon: 0.01));
    natural.dispose();
  });
}
