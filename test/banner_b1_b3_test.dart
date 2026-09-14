/// BANNER B1 + B3 — the image actually renders, and region targeting is alive.
///
/// B1: the banner used to draw a flat coloured rectangle where the picture
/// belonged. There was no image widget, the public payload carried no url, and
/// Storage denies client reads of `cms/`. These tests pin the fixed contract:
/// an image when there is a signed url, a clean text card when there is not,
/// and never a broken-image glyph.
///
/// B3: `cmsViewerRegionProvider` returned a hard null, and the server fails
/// closed on an unknown attribute, so EVERY region-targeted banner was
/// invisible to EVERY user. These tests pin that the region the app already
/// knows is the region it sends.
library;

import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/location/malaysia_state_hero_voice.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/providers/makanmana_user_context_provider.dart';
import 'package:makan_mana/core/services/cms_service.dart';
import 'package:makan_mana/features/cms/cms_banner.dart';
import 'package:makan_mana/features/cms/cms_content.dart';
import 'package:makan_mana/features/cms/cms_providers.dart';
import 'package:makan_mana/features/cms/cms_slot.dart';

Map<String, Object?> payload({Object? readUrl = 'https://signed.example/a.webp'}) => {
      'contentId': 'cms-1',
      'placement': 'home_top',
      'title': 'Promosi Raya',
      'subtitle': 'Diskaun sehingga 30%',
      'body': '',
      'ctaLabel': 'Lihat',
      'ctaDestination': '/explore',
      'media': {
        'storagePath': 'cms/banners/raya.webp',
        'contentType': 'image/webp',
        'width': 1200,
        'height': 600,
        'altText': 'Promosi Raya',
        if (readUrl != null) 'readUrl': readUrl,
      },
      'priority': 10,
      'canonicalPlaceId': null,
    };

String _read(String path) => File(path).readAsStringSync();

Widget _host(Widget child, {List<Override> overrides = const []}) => ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('ms'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    );

/// Records what the app actually asked the server for. The B3 bug was entirely
/// in this argument, so this is the regression guard that matters.
class _RecordingCmsService implements CmsService {
  final List<String?> regions = <String?>[];
  int calls = 0;

  @override
  Future<CmsFetchResult> fetch({
    required CmsPlacement placement,
    String? language,
    String? region,
    String? canonicalPlaceId,
    bool includeCollections = false,
  }) async {
    calls += 1;
    regions.add(region);
    return const CmsFetchResult.empty();
  }
}

/// The CMS request provider watches `languageProvider`, which reaches
/// SharedPreferences. Overriding the prefs at the root is how the rest of the
/// suite does it, so the graph under test stays the real one.
Future<ProviderContainer> _container(List<Override> overrides) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  return ProviderContainer(overrides: [
    sharedPreferencesProvider.overrideWithValue(prefs),
    ...overrides,
  ]);
}

void main() {
  // ── B1 · 6. the image renders when a signed url is present ───────────────

  testWidgets('B1-6. a banner with a signed url renders a real image', (tester) async {
    final content = CmsContent.fromMap(payload())!;
    await tester.pumpWidget(_host(CmsBannerCard(content: content)));
    await tester.pumpAndSettle();

    expect(find.byType(CachedNetworkImage), findsOneWidget,
        reason: 'the picture must be loaded, not drawn as a coloured box');
    expect(find.byKey(const Key('cms-banner-image-cms-1')), findsOneWidget);

    final image = tester.widget<CachedNetworkImage>(find.byType(CachedNetworkImage));
    expect(image.imageUrl, 'https://signed.example/a.webp');
    // Keyed on the stable object path, because the signed url rotates on every
    // fetch and would otherwise defeat the cache entirely.
    expect(image.cacheKey, 'cms/banners/raya.webp');
    expect(image.fit, BoxFit.cover, reason: 'cover, so the image is never stretched');
  });

  testWidgets('B1-6b. the aspect box comes from the real dimensions', (tester) async {
    final content = CmsContent.fromMap(payload())!;
    await tester.pumpWidget(_host(CmsBannerCard(content: content)));
    await tester.pumpAndSettle();

    final box = tester.widget<AspectRatio>(find.ancestor(
      of: find.byType(CachedNetworkImage),
      matching: find.byType(AspectRatio),
    ));
    expect(box.aspectRatio, 1200 / 600);
  });

  // ── B1 · 7 + 8. loading and error states are calm, never a fault ─────────

  testWidgets('B1-7/8. loading and error both render the neutral fill', (tester) async {
    final content = CmsContent.fromMap(payload())!;
    await tester.pumpWidget(_host(CmsBannerCard(content: content)));
    await tester.pumpAndSettle();

    final image = tester.widget<CachedNetworkImage>(find.byType(CachedNetworkImage));
    final context = tester.element(find.byType(CachedNetworkImage));

    // Invoked directly so both states are asserted deterministically rather
    // than by racing a real network fetch.
    final loading = image.placeholder!(context, 'https://signed.example/a.webp');
    final failed = image.errorWidget!(
        context, 'https://signed.example/a.webp', Exception('403'));

    for (final widget in [loading, failed]) {
      expect(widget, isA<Container>());
      final decorationless = widget as Container;
      expect(decorationless.color, isNotNull,
          reason: 'a flat brand fill, not a transparent hole');
    }

    await tester.pumpWidget(_host(
      Column(children: [loading, failed]),
    ));
    await tester.pumpAndSettle();
    // The one thing a promotional slot must never show the customer.
    expect(find.byIcon(Icons.broken_image), findsNothing);
    expect(find.byIcon(Icons.error), findsNothing);
    expect(find.byIcon(Icons.error_outline), findsNothing);
  });

  // ── B1 · 9. no usable image still renders a correct banner ──────────────

  testWidgets('B1-9. media with no signed url collapses to a clean text card',
      (tester) async {
    final content = CmsContent.fromMap(payload(readUrl: null))!;
    expect(content.media, isNotNull, reason: 'the media record still exists');
    expect(content.media!.hasImage, isFalse);

    await tester.pumpWidget(_host(CmsBannerCard(content: content)));
    await tester.pumpAndSettle();

    expect(find.byType(CachedNetworkImage), findsNothing);
    // The whole point of B1: no reserved empty rectangle when there is nothing
    // to put in it. That blank box WAS the bug.
    expect(find.byType(AspectRatio), findsNothing);
    expect(find.text('Promosi Raya'), findsOneWidget);
    expect(find.text('Lihat'), findsOneWidget);
  });

  testWidgets('B1-9b. a banner with no media at all is unchanged', (tester) async {
    final raw = Map<String, Object?>.from(payload())..remove('media');
    final content = CmsContent.fromMap(raw)!;
    await tester.pumpWidget(_host(CmsBannerCard(content: content)));
    await tester.pumpAndSettle();

    expect(content.media, isNull);
    expect(find.byType(CachedNetworkImage), findsNothing);
    expect(find.text('Promosi Raya'), findsOneWidget);
  });

  test('B1-9c. a blank or whitespace url is treated as no image', () {
    for (final blank in ['', '   ']) {
      final content = CmsContent.fromMap(payload(readUrl: blank))!;
      expect(content.media!.readUrl, isNull, reason: 'blank url: "$blank"');
      expect(content.media!.hasImage, isFalse);
    }
  });

  // ── B1 · 10. layout stays safe ──────────────────────────────────────────

  testWidgets('B1-10. an image banner does not overflow at 320dp, large text',
      (tester) async {
    tester.view.physicalSize = const Size(320 * 3, 900 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    final content = CmsContent.fromMap(payload())!;
    await tester.pumpWidget(_host(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(1.3)),
        child: CmsBannerList(items: [content], sponsored: true),
      ),
    ));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.byType(CachedNetworkImage), findsOneWidget);
    expect(find.byKey(const Key('cms-sponsored-label')), findsOneWidget);
  });

  testWidgets('B1-10b. an empty slot still renders absolutely nothing',
      (tester) async {
    await tester.pumpWidget(_host(
      const CmsSlot(placement: CmsPlacement.homeTop),
      overrides: [
        cmsContentProvider.overrideWith((ref, arg) async => const CmsFetchResult.empty()),
      ],
    ));
    await tester.pump();
    expect(find.byType(CmsBannerList), findsNothing);
    expect(find.byType(CachedNetworkImage), findsNothing);
  });

  // ── B3 · 5. normalisation is deterministic ──────────────────────────────

  test('B3-5. region normalisation is deterministic and case-insensitive', () {
    for (final raw in ['Selangor', 'selangor', 'SELANGOR', '  Selangor  ']) {
      expect(MalaysiaStateHeroVoice.normalize(raw), 'Selangor', reason: raw);
    }
    // Geocoder long forms resolve to the same canonical value the server
    // allowlists, so KL cannot arrive under three different spellings.
    for (final raw in [
      'Kuala Lumpur',
      'wilayah persekutuan kuala lumpur',
      'Federal Territory of Kuala Lumpur',
    ]) {
      expect(MalaysiaStateHeroVoice.normalize(raw), 'Kuala Lumpur', reason: raw);
    }
    expect(MalaysiaStateHeroVoice.normalize('Penang'), 'Pulau Pinang');
  });

  test('B3-3. an unknown or absent region resolves to null, never a guess', () {
    for (final raw in [null, '', '   ', 'Singapore', 'Jakarta', 'Selangorr', 'x']) {
      expect(MalaysiaStateHeroVoice.normalize(raw), isNull,
          reason: 'must not invent a region from: ${raw ?? "null"}');
    }
  });

  // ── B3 · 1-4. the resolved region is what the app actually sends ─────────

  test('B3-1. the viewer region provider reads the resolved app state', () async {
    final container = await _container([
      firebaseReadyProvider.overrideWithValue(false),
    ]);
    addTearDown(container.dispose);

    expect(container.read(cmsViewerRegionProvider), isNull,
        reason: 'unresolved location must stay null');

    container
        .read(makanManaUserContextProvider.notifier)
        .updateDebugLocationStateForQa('Selangor');
    expect(container.read(cmsViewerRegionProvider), 'Selangor');

    container
        .read(makanManaUserContextProvider.notifier)
        .updateDebugLocationStateForQa('Kuala Lumpur');
    expect(container.read(cmsViewerRegionProvider), 'Kuala Lumpur');
  });

  test('B3-2. an unnormalised injected state is still normalised before use', () async {
    final container = await _container([
      firebaseReadyProvider.overrideWithValue(false),
    ]);
    addTearDown(container.dispose);

    // The QA debug-state path bypasses the resolver's own normalisation, so
    // without normalising here "selangor" would silently miss "Selangor".
    container
        .read(makanManaUserContextProvider.notifier)
        .updateDebugLocationStateForQa('selangor');
    expect(container.read(cmsViewerRegionProvider), 'Selangor');
  });

  test('B3-4. a non-Malaysian state yields null so nothing is targeted', () async {
    final container = await _container([
      firebaseReadyProvider.overrideWithValue(false),
    ]);
    addTearDown(container.dispose);

    container
        .read(makanManaUserContextProvider.notifier)
        .updateDebugLocationStateForQa('Singapore');
    expect(container.read(cmsViewerRegionProvider), isNull);
  });

  // ── B3 · the regression guard for the original bug ──────────────────────

  test('B3-1b. the resolved region is SENT to the server, not dropped', () async {
    final service = _RecordingCmsService();
    final container = await _container([
      firebaseReadyProvider.overrideWithValue(true),
      cmsServiceProvider.overrideWithValue(service),
      cmsViewerRegionProvider.overrideWithValue('Selangor'),
    ]);
    addTearDown(container.dispose);

    await container.read(
      cmsContentProvider(const CmsRequest(placement: CmsPlacement.homeTop)).future,
    );

    expect(service.regions, ['Selangor'],
        reason: 'this argument was hard-null before B3 — the whole bug');
  });

  test('B3-3b. an unknown region sends null and stays fail-closed', () async {
    final service = _RecordingCmsService();
    final container = await _container([
      firebaseReadyProvider.overrideWithValue(true),
      cmsServiceProvider.overrideWithValue(service),
      cmsViewerRegionProvider.overrideWithValue(null),
    ]);
    addTearDown(container.dispose);

    await container.read(
      cmsContentProvider(const CmsRequest(placement: CmsPlacement.homeTop)).future,
    );
    expect(service.regions, [null]);
  });

  // ── B3 · 6. a region change refetches, and only a region change does ─────

  test('B3-6. changing region refetches; unrelated context churn does not',
      () async {
    final service = _RecordingCmsService();
    final container = await _container([
      firebaseReadyProvider.overrideWithValue(true),
      cmsServiceProvider.overrideWithValue(service),
    ]);
    addTearDown(container.dispose);

    final request = const CmsRequest(placement: CmsPlacement.homeTop);
    // Keep the autoDispose provider alive across the whole test.
    final sub = container.listen(cmsContentProvider(request), (_, __) {});
    addTearDown(sub.close);

    await container.read(cmsContentProvider(request).future);
    expect(service.calls, 1);
    expect(service.regions.last, isNull);

    final notifier = container.read(makanManaUserContextProvider.notifier);
    notifier.updateDebugLocationStateForQa('Selangor');
    await container.read(cmsContentProvider(request).future);
    expect(service.calls, 2, reason: 'a real region change must refetch');
    expect(service.regions.last, 'Selangor');

    // Moving within the same state must NOT refetch: `.select` on the state
    // alone is what stops every GPS tick becoming a callable invocation.
    notifier.updateLocation(3.2, 101.4);
    await container.read(cmsContentProvider(request).future);
    expect(service.calls, 2,
        reason: 'coordinates changed but the region did not — no refetch');

    // And the same state re-resolved is not a change either.
    notifier.updateDebugLocationStateForQa('Selangor');
    await container.read(cmsContentProvider(request).future);
    expect(service.calls, 2, reason: 'identical region must not loop');
  });

  // ── B3 · 7-8. the existing location stack is untouched ──────────────────

  test('B3-7. Home hero phrasing still reads the same resolved state', () {
    // Home renders its local hero from exactly this value, so wiring CMS to it
    // cannot introduce a second, disagreeing notion of "where the user is".
    expect(MalaysiaStateHeroVoice.phraseFor('Selangor'), isNotNull);
    expect(MalaysiaStateHeroVoice.phraseFor('Singapore'), isNull);
  });

  test('B3-8. CMS never requests location itself', () {
    final source = _read('lib/features/cms/cms_providers.dart');
    for (final forbidden in [
      'Geolocator',
      'requestPermission',
      'getCurrentPosition',
      'locationServiceProvider',
    ]) {
      expect(source.contains(forbidden), isFalse,
          reason: 'CMS must consume the resolved state, never ask for location: '
              '$forbidden');
    }
    expect(source.contains('makanManaUserContextProvider'), isTrue);
  });
}
