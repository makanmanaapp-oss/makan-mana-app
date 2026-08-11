// Threads Fix 2 — feed scroll performance (structural regression guards).
//
// The full _FeedList needs Firebase; its structure is guarded via source
// assertions. The avatar decode-sizing fix IS rendered (MakanAvatar is pure),
// proving full-res photos are no longer decoded for tiny avatars.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/core/widgets/makan_avatar.dart';

void main() {
  group('MakanAvatar — decode at display size (not full-res)', () {
    testWidgets('photo avatar uses ResizeImage capped to ~diameter×dpr',
        (t) async {
      await t.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: Center(
            child: MakanAvatar(radius: 19, photoUrl: 'https://x/y.jpg'),
          ),
        ),
      ));
      final avatar = t.widget<CircleAvatar>(find.byType(CircleAvatar));
      final bg = avatar.backgroundImage;
      expect(bg, isA<ResizeImage>(), reason: 'must decode at display size');
      final resize = bg as ResizeImage;
      // Capped small (never full-res). clamp(48,256).
      expect(resize.width, isNotNull);
      expect(resize.width! >= 48 && resize.width! <= 256, isTrue,
          reason: 'decode width ${resize.width} out of range');
      expect(resize.imageProvider, isA<NetworkImage>());
      expect((resize.imageProvider as NetworkImage).url, 'https://x/y.jpg');
    });

    testWidgets('no-photo avatar (preset/initials) has NO NetworkImage',
        (t) async {
      await t.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: Center(child: MakanAvatar(radius: 19, displayName: 'Ruff')),
        ),
      ));
      expect(t.takeException(), isNull);
      final avatars = find.byType(CircleAvatar);
      if (avatars.evaluate().isNotEmpty) {
        final a = t.widget<CircleAvatar>(avatars.first);
        expect(a.backgroundImage, isNull); // gradient/initials path
      }
    });
  });

  group('source guards — lazy feed + image decode + stable keys', () {
    final feed =
        File('lib/features/social/feed_screen.dart').readAsStringSync();
    final carousel = File(
            'lib/features/social/post_media_carousel.dart')
        .readAsStringSync();
    final avatar =
        File('lib/core/widgets/makan_avatar.dart').readAsStringSync();

    test('feed uses lazy ListView.builder (not eager children list)', () {
      expect(feed.contains('ListView.builder('), isTrue);
      // The eager posts.expand([...]) into ListView(children:) is gone.
      expect(feed.contains('...posts.expand('), isFalse);
    });

    test('feed items keyed by stable post id (identity-stable recycling)', () {
      expect(feed.contains('key: ValueKey(p.id)'), isTrue);
    });

    test('post images decode at display width (memCacheWidth)', () {
      expect(carousel.contains('memCacheWidth: memWidth'), isTrue);
      expect(carousel.contains('CachedNetworkImage('), isTrue); // still cached
    });

    test('avatar decode sizing via ResizeImage + clamp', () {
      expect(avatar.contains('ResizeImage('), isTrue);
      expect(avatar.contains('.clamp(48, 256)'), isTrue);
    });

    test('timestamp Fix 1 formatter untouched (still pure, no Timer)', () {
      final pc =
          File('lib/features/social/post_card.dart').readAsStringSync();
      expect(pc.contains('relativePostTime('), isTrue);
      expect(pc.contains('Timer('), isFalse); // no per-card timer
      final st =
          File('lib/features/social/social_time.dart').readAsStringSync();
      expect(st.contains('Timer'), isFalse);
      expect(st.contains('Stream'), isFalse);
    });
  });
}
