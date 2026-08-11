// HOTFIX 4.5C — Server-mediated group image V2 (client).
//
// Replaces the 4.5 direct-upload tests. Proves: canonical metadata is imagePath
// (not a permanent URL); GroupAvatar fallback; GroupAvatarResolved renders the
// resolved signed URL (or emoji while loading/none/unauthorized); create/replace/
// remove flows call the V2 service; generic updateGroupSettings no longer mutates
// image metadata; Storage rules are server-mediated (read,write:false, no
// cross-service). Server authz/validation is emulator-tested separately
// (functions/src/domain/groupImage/__tests__/emulator).
import 'dart:async';
import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/groups/group_providers.dart';
import 'package:makan_mana/features/social/social_ui.dart';

Widget _wrap(Widget child, {List<Override> overrides = const []}) =>
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(home: Scaffold(body: Center(child: child))),
    );

void main() {
  group('GroupData canonical metadata (Part 2)', () {
    test('legacy group (no imagePath) → hasImage false, imagePath null', () {
      const g = GroupData(id: 'g', data: {'name': 'x'});
      expect(g.imagePath, isNull);
      expect(g.hasImage, isFalse);
    });
    test('empty imagePath → null (fallback)', () {
      const g = GroupData(id: 'g', data: {'imagePath': ''});
      expect(g.imagePath, isNull);
      expect(g.hasImage, isFalse);
    });
    test('valid imagePath + version exposed', () {
      const g = GroupData(id: 'g', data: {
        'imagePath': 'group_images/g/asset1.jpg',
        'imageVersion': 'asset1',
      });
      expect(g.imagePath, 'group_images/g/asset1.jpg');
      expect(g.hasImage, isTrue);
      expect(g.imageVersion, 'asset1');
    });
  });

  group('GroupAvatar fallback + image (pure)', () {
    testWidgets('no image → branded emoji fallback', (tester) async {
      await tester.pumpWidget(_wrap(const GroupAvatar(emoji: '🍜')));
      expect(find.text('🍜'), findsOneWidget);
      expect(find.byType(CachedNetworkImage), findsNothing);
    });
    testWidgets('empty emoji → default 🍜', (tester) async {
      await tester.pumpWidget(_wrap(const GroupAvatar(emoji: '')));
      expect(find.text('🍜'), findsOneWidget);
    });
    testWidgets('resolved url → CachedNetworkImage w/ decode sizing + cover',
        (tester) async {
      await tester.pumpWidget(_wrap(const GroupAvatar(
          emoji: '🍜', imageUrl: 'https://example.com/g.jpg', size: 46)));
      final cni =
          tester.widget<CachedNetworkImage>(find.byType(CachedNetworkImage));
      expect(cni.imageUrl, 'https://example.com/g.jpg');
      expect(cni.memCacheWidth, isNotNull);
      expect(cni.fit, BoxFit.cover);
      expect(cni.placeholder, isNotNull);
      expect(cni.errorWidget, isNotNull);
    });
  });

  group('GroupAvatarResolved — resolver drives image vs emoji (Part 12)', () {
    testWidgets('resolved url → image', (tester) async {
      await tester.pumpWidget(_wrap(
        const GroupAvatarResolved(groupId: 'g1', emoji: '🍜', size: 46),
        overrides: [
          groupImageUrlProvider('g1')
              .overrideWith((ref) async => 'https://example.com/g.jpg'),
        ],
      ));
      await tester.pump(); // let the future resolve
      expect(find.byType(CachedNetworkImage), findsOneWidget);
    });

    testWidgets('resolver null (no image / unauthorized) → emoji fallback',
        (tester) async {
      await tester.pumpWidget(_wrap(
        const GroupAvatarResolved(groupId: 'g1', emoji: '🍜', size: 46),
        overrides: [
          groupImageUrlProvider('g1').overrideWith((ref) async => null),
        ],
      ));
      await tester.pump();
      expect(find.text('🍜'), findsOneWidget);
      expect(find.byType(CachedNetworkImage), findsNothing);
    });

    testWidgets('loading → emoji fallback (never broken-image)', (tester) async {
      final never = Completer<String?>();
      await tester.pumpWidget(_wrap(
        const GroupAvatarResolved(groupId: 'g1', emoji: '🍜', size: 46),
        overrides: [
          groupImageUrlProvider('g1').overrideWith((ref) => never.future),
        ],
      ));
      await tester.pump();
      expect(find.text('🍜'), findsOneWidget);
      expect(find.byType(CachedNetworkImage), findsNothing);
    });
  });

  group('source guards — V2 wiring', () {
    final feed = File('lib/features/social/feed_screen.dart').readAsStringSync();
    final hub =
        File('lib/features/groups/group_hub_screen.dart').readAsStringSync();
    final settings = File('lib/features/groups/group_settings_screen.dart')
        .readAsStringSync();
    final service =
        File('lib/core/services/social_service.dart').readAsStringSync();
    final providers =
        File('lib/features/groups/group_providers.dart').readAsStringSync();
    final ui = File('lib/features/social/social_ui.dart').readAsStringSync();
    final groupCtl =
        File('functions/src/callable/groupControl.ts').readAsStringSync();
    final imgCtl =
        File('functions/src/callable/groupImageControl.ts').readAsStringSync();
    final rules = File('storage.rules').readAsStringSync();

    test('card / hub / preview / settings use GroupAvatarResolved', () {
      expect(
          feed.contains(
              'GroupAvatarResolved(groupId: g.id, emoji: g.emoji, size: 46)'),
          isTrue);
      expect(hub.contains('groupId: group.id, emoji: group.emoji, size: 46'),
          isTrue);
      expect(
          hub.contains('GroupAvatarResolved(groupId: g.id, emoji: g.emoji, size: 72)'),
          isTrue);
      expect(settings.contains('GroupAvatarResolved('), isTrue);
    });

    test('GroupAvatarResolved watches resolver + emoji-fallback (Part 12/21)', () {
      expect(ui.contains('class GroupAvatarResolved extends ConsumerWidget'),
          isTrue);
      expect(ui.contains('ref.watch(groupImageUrlProvider(groupId)).value'),
          isTrue);
    });

    test('resolver provider caches + re-resolves on account switch (Part 26/21)',
        () {
      expect(providers.contains('final groupImageUrlProvider ='), isTrue);
      expect(providers.contains('ref.watch(currentUidProvider)'), isTrue);
      expect(providers.contains('ref.keepAlive()'), isTrue);
    });

    test('service exposes server-mediated V2 (prepare→PUT→finalize + resolve)',
        () {
      expect(service.contains("_fn('prepareGroupImageUploadV2'"), isTrue);
      expect(service.contains("_fn('finalizeGroupImageUploadV2'"), isTrue);
      expect(service.contains("_fn('getGroupImageUrlV2'"), isTrue);
      expect(service.contains("_fn('getGroupImageUrlsV2'"), isTrue);
      expect(service.contains("_fn('removeGroupImageV2'"), isTrue);
      expect(service.contains('putBytesToSignedUrl'), isTrue);
      // No direct client Storage write for group images anymore.
      expect(service.contains("ref('group_images"), isFalse);
    });

    test('create flow uploads via V2 after create, no orphan (Part 18)', () {
      expect(feed.contains('await service.uploadGroupImageV2(id, result.image!)'),
          isTrue);
      expect(
          feed.indexOf('createGroupV2(name: result.name') <
              feed.indexOf('uploadGroupImageV2(id,'),
          isTrue);
    });

    test('settings replace via V2 + remove via V2 + invalidate (Part 15/19)', () {
      expect(settings.contains('service.uploadGroupImageV2(widget.groupId'),
          isTrue);
      expect(settings.contains('service.removeGroupImageV2(widget.groupId'),
          isTrue);
      expect(settings.contains('ref.invalidate(groupImageUrlProvider('), isTrue);
    });

    test('generic updateGroupSettings no longer mutates image metadata (Part 16)',
        () {
      // The callable must not read or assign imageUrl/imagePath.
      final fn = groupCtl.substring(groupCtl.indexOf('updateGroupSettings'));
      final block = fn.substring(0, fn.indexOf('pinGroupItem'));
      expect(block.contains('imageUrl'), isFalse);
      expect(block.contains('imagePath'), isFalse);
    });

    test('dedicated V2 callables exist server-side', () {
      for (final f in const [
        'prepareGroupImageUploadV2',
        'finalizeGroupImageUploadV2',
        'getGroupImageUrlV2',
        'getGroupImageUrlsV2',
        'removeGroupImageV2',
      ]) {
        expect(imgCtl.contains('export const $f'), isTrue, reason: f);
      }
    });

    test('storage.rules: group_images server-mediated, no cross-service (Part 17/24)',
        () {
      expect(rules.contains('match /group_images/{groupId}/{allPaths=**}'),
          isTrue);
      expect(rules.contains('allow read, write: if false'), isTrue);
      expect(rules.contains('firestore.get'), isFalse);
      expect(rules.contains('firestore.exists'), isFalse);
      // unrelated paths preserved
      expect(rules.contains('match /feed_images/{uid}/{fileName}'), isTrue);
      expect(rules.contains('match /wallet_images/{uid}/{fileName}'), isTrue);
    });
  });
}
