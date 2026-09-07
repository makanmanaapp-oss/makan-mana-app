import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/core/services/restaurant_profile_v2_service.dart';

/// WAVE 3 GATE 3F — Follow identity is decoupled from profile publication.
///
/// LOCKED INVARIANT:
///   profile publication resolution  !=  canonical restaurant identity
///
/// `profile == null` means "no published content", never "identity unknown".
void main() {
  String read(String path) =>
      File(path).readAsStringSync().replaceAll('\r\n', '\n');

  String code(String source) => source
      .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), ' ')
      .replaceAll(RegExp(r'^[ \t]*//.*$', multiLine: true), ' ');

  const canonicalId = 'PLC-c5e469d3efed12ef3a51089d';

  group('lookup result contract', () {
    test('1. published profile + canonical id -> Follow may mount', () {
      final profile = PublicRestaurantProfileV2.fromMap({
        'canonicalPlaceId': canonicalId,
        'name': 'Nasi Kandar Pelita',
      });
      final result = RestaurantProfileLookupResult(
        canonicalPlaceId: canonicalId,
        profile: profile,
      );
      expect(result.hasCanonicalIdentity, isTrue);
      expect(result.canonicalPlaceId, canonicalId);
      expect(result.profile, isNotNull);
    });

    test('2. canonical id + NO profile -> identity survives, Follow may mount', () {
      const result = RestaurantProfileLookupResult(canonicalPlaceId: canonicalId);
      expect(result.hasCanonicalIdentity, isTrue,
          reason: 'a missing publication must not erase a proven identity');
      expect(result.profile, isNull);
    });

    test('3. no canonical id + no profile -> Follow hidden', () {
      const result = RestaurantProfileLookupResult();
      expect(result.hasCanonicalIdentity, isFalse);
      expect(result.canonicalPlaceId, isNull);
      expect(result.profile, isNull);
    });

    test('4. blank/whitespace canonical id is not an identity (fail closed)', () {
      expect(
        const RestaurantProfileLookupResult(canonicalPlaceId: '   ')
            .hasCanonicalIdentity,
        isFalse,
      );
      expect(
        const RestaurantProfileLookupResult(canonicalPlaceId: '')
            .hasCanonicalIdentity,
        isFalse,
      );
    });

    test('6. published-profile parsing stays backward compatible', () {
      final profile = PublicRestaurantProfileV2.fromMap({
        'canonicalPlaceId': canonicalId,
        'name': 'Nasi Kandar Pelita',
        'menuItems': [
          {'id': 'm-1', 'section': 'makanan', 'name': 'Nasi', 'price': 8.5},
        ],
        'priceState': 'price_estimated',
      });
      expect(profile.canonicalPlaceId, canonicalId);
      expect(profile.name, 'Nasi Kandar Pelita');
      expect(profile.menuItems.length, 1);
      expect(profile.priceState, 'price_estimated');
      // A payload without the new field still parses.
      expect(
        () => PublicRestaurantProfileV2.fromMap(
            {'canonicalPlaceId': canonicalId, 'name': 'X'}),
        returnsNormally,
      );
    });
  });

  group('client never invents identity', () {
    late String service;
    setUp(() => service =
        read('lib/core/services/restaurant_profile_v2_service.dart'));

    test('5. the requested/provider id is never promoted to canonical', () {
      final body = code(service);
      // Identity comes from the server field (or the profile the server built),
      // never from the caller's own `clean`/placeId string.
      expect(body, contains("root['canonicalPlaceId']"));
      expect(body.contains('canonicalPlaceId: clean'), isFalse);
      expect(body.contains('canonicalPlaceId = clean'), isFalse);
      expect(body.contains('canonicalPlaceId: placeId'), isFalse);
    });

    test('errors fail closed to no identity', () {
      final body = code(service);
      expect(body, contains('on FirebaseFunctionsException'));
      expect(body, contains('const RestaurantProfileLookupResult()'));
    });

    test('7. the old profile-only entry point still exists', () {
      expect(service, contains('getPublishedProfile'));
      expect(service, contains('(await lookup(placeId)).profile'));
    });
  });

  group('detail screen wiring', () {
    late String screen;
    setUp(() =>
        screen = read('lib/features/restaurant/restaurant_detail_screen.dart'));

    test('identity is recorded independently of the published profile', () {
      final body = code(screen);
      // The canonical id is assigned from the lookup BEFORE the profile null
      // check, so an absent publication cannot clear it.
      expect(body, contains('lookup.hasCanonicalIdentity'));
      final assignIndex = body.indexOf('_resolvedCanonicalPlaceId =');
      final profileNullIndex = body.indexOf('if (profile == null) return null;');
      expect(assignIndex, greaterThan(-1));
      expect(profileNullIndex, greaterThan(-1));
      expect(assignIndex, lessThan(profileNullIndex),
          reason: 'identity must be captured before the profile is discarded');
    });

    test('Follow is no longer gated on publishedVm', () {
      final body = code(screen);
      expect(body.contains('publishedVm != null ? _resolvedCanonicalPlaceId'),
          isFalse,
          reason: 'the old publication gate must be gone');
      expect(body, contains('_resolvedCanonicalPlaceId'));
      expect(body, contains('RestaurantFollowButton'));
    });

    test('10. no direct restaurant_follows write was introduced', () {
      final body = code(screen);
      expect(body.contains('restaurant_follows'), isFalse);
      final service = code(read('lib/core/services/restaurant_engagement_service.dart'));
      // Follow/unfollow stay server-mediated through the existing callables.
      expect(service, contains('followRestaurant'));
      expect(service, contains('unfollowRestaurant'));
      expect(
        RegExp(r"collection\('restaurant_follows'\)[\s\S]{0,120}\.(set|add|update|delete)\(")
            .hasMatch(service),
        isFalse,
        reason: 'client must never write restaurant_follows directly',
      );
    });
  });

  group('backend contract', () {
    test('callable returns canonicalPlaceId additively', () {
      final callable =
          read('functions/src/callable/getRestaurantProfileV2.ts');
      expect(callable, contains('resolveProvenCanonicalRestaurantPlaceId'));
      expect(callable, contains('canonicalPlaceId,'));
      // Existing fields untouched -> old clients keep working.
      expect(callable, contains('profile,'));
      expect(callable, contains('dataSource:'));
      expect(callable, contains('ok: true'));
    });

    test('the strict resolver never echoes the caller id', () {
      final resolver = read(
          'functions/src/domain/restaurantEngagement/canonicalResolution.ts');
      final strict = resolver
          .substring(resolver.indexOf('export async function resolveProvenCanonicalPlaceIdWith'));
      expect(strict, contains('return mapped;'));
      expect(strict.contains('?? clean'), isFalse,
          reason: 'the public resolver must not fall back to the requested id');
    });
  });

  group('safety invariants', () {
    test('8. production canonical UI default remains false', () {
      final flags = read(
          'lib/features/restaurant/canonical/restaurant_detail_flags.dart');
      expect(flags, contains('canonicalRestaurantDetailEnabled = false'));
      final qa =
          read('lib/features/place_migration/qa_canonical_activation.dart');
      expect(qa, contains('isDebugBuild'));
      expect(qa, contains('appFlavor'));
    });

    test('9. qa keeps the .qa suffix and prod has none', () {
      final gradle = read('android/app/build.gradle.kts');
      expect(gradle, contains('applicationId = "com.makanmana.apps"'));
      final qaBlock = gradle.substring(gradle.indexOf('create("qa")'));
      expect(qaBlock, contains('applicationIdSuffix = ".qa"'));
      final prodBlock = gradle.substring(
          gradle.indexOf('create("prod")'), gradle.indexOf('create("qa")'));
      expect(prodBlock.contains('applicationIdSuffix'), isFalse);
    });
  });
}
