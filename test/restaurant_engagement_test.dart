// WAVE 3D GATE 2 — mobile content & engagement wiring.
//
// The authoritative enforcement is server-side (callables + Firestore rules,
// proven by `npm test` / `npm run test:rules`). These tests guard the CLIENT
// contract that the mobile app must never break:
//
//   * every restaurant mutation goes through an existing Cloud Function;
//   * Flutter NEVER writes restaurant_follows / menu_comments / a
//     restaurant-authored feed_posts document;
//   * restaurant identity is ALWAYS canonicalPlaceId;
//   * the acting merchant Firebase UID is never a public author identity.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/features/restaurant/engagement/restaurant_engagement_providers.dart';
import 'package:makan_mana/features/restaurant/engagement/menu_comment_sheet.dart';
import 'package:makan_mana/features/restaurant/canonical/restaurant_detail_view_model.dart';
import 'package:makan_mana/features/restaurant/canonical/canonical_restaurant_detail_screen.dart';
import 'package:makan_mana/core/services/merchant_service.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:makan_mana/app/theme.dart';

/// Minimal canonical view model — mirrors the fixture in restaurant_detail_test.
RestaurantDetailViewModel _vm() => RestaurantDetailViewModel(
      placeId: 'stable-place-123',
      title: 'Warung Pak Din',
      sourceMode: CardSourceMode.live,
      gallery: const DetailGallery(
          images: [DetailImageItem(image: CardImageModel())]),
      businessState: CardBusinessState.active,
      hours: const DetailHours(model: CardHoursModel(state: CardHoursState.hoursUnknown)),
      rating: const CardRatingModel(rating: 4.3, reviewCount: 12),
      price: const CardPriceModel(state: CardPriceState.estimatedRange, amountLabel: 'RM10'),
      location: const LocationInfo(address: 'Jalan Ampang'),
      contact: ContactInfo.none,
      actions: const DetailActionConfig(),
      freshness: FreshnessSummary.unknown,
      provenance: ProvenanceSummary(sourceMode: CardSourceMode.live),
    );

Widget _host(Widget child) => MaterialApp(
      theme: AppTheme.light(),
      locale: const Locale('en'),
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: MediaQuery(
        data: const MediaQueryData(size: Size(390, 900)),
        child: child,
      ),
    );

String _read(String path) =>
    File(path).readAsStringSync().replaceAll('\r\n', '\n');

void main() {
  final service = _read('lib/core/services/restaurant_engagement_service.dart');
  final providers = _read(
      'lib/features/restaurant/engagement/restaurant_engagement_providers.dart');
  final followButton = _read(
      'lib/features/restaurant/engagement/restaurant_follow_button.dart');
  final sheet =
      _read('lib/features/restaurant/engagement/menu_comment_sheet.dart');
  final merchantCard =
      _read('lib/features/merchant/restaurant_engagement_card.dart');
  final postCard = _read('lib/features/social/post_card.dart');
  final route = _read('lib/features/restaurant/restaurant_detail_screen.dart');
  final rules = _read('firestore.rules');
  final indexes = _read('firestore.indexes.json');

  // Every Dart source file, for repo-wide "no direct write" proofs.
  final allDart = Directory('lib')
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'))
      .map((f) => MapEntry(f.path, f.readAsStringSync()))
      .toList(growable: false);

  /// True when some Dart file writes DIRECTLY to [collection].
  ///
  /// A hop into a SUBcollection (`collection('feed_posts').doc(x)
  /// .collection('comments').add(...)`) is a write to the subcollection, not to
  /// [collection], so any span containing a nested `.collection(` is excluded.
  bool anyDirectWrite(String collection) {
    final pattern = RegExp(
      r"collection\('" + collection + r"'\)([\s\S]{0,160}?)\.(add|set|update|delete)\(",
    );
    for (final entry in allDart) {
      for (final m in pattern.allMatches(entry.value)) {
        if (!m.group(1)!.contains('.collection(')) return true;
      }
    }
    return false;
  }

  // ── RESTAURANT FOLLOW ───────────────────────────────────────────────────

  group('restaurant follow', () {
    test('follow/unfollow use the EXISTING callables with canonicalPlaceId', () {
      expect(service, contains("_call('followRestaurant', {"));
      expect(service, contains("_call('unfollowRestaurant', {"));
      // canonicalPlaceId is the ONLY restaurant identity in each payload
      final follow =
          service.split("_call('followRestaurant', {")[1].split('});')[0];
      expect(follow, contains("'canonicalPlaceId': canonicalPlaceId"));
      final unfollow =
          service.split("_call('unfollowRestaurant', {")[1].split('});')[0];
      expect(unfollow, contains("'canonicalPlaceId': canonicalPlaceId"));
      // no placeId / registryId aliasing is smuggled in
      expect(service.contains("'placeId':"), isFalse);
    });

    test('NO direct client write to restaurant_follows anywhere in lib/', () {
      expect(anyDirectWrite('restaurant_follows'), isFalse);
      // and the rules deny it outright
      expect(rules, contains('match /restaurant_follows/{followId}'));
      final block = rules
          .split('match /restaurant_follows/{followId}')[1]
          .split('}')[0];
      expect(block, contains('allow write: if false;'));
    });

    test('follow state is per-user and cannot leak across logout/login', () {
      final provider = providers
          .split('final myRestaurantFollowProvider')[1]
          .split('\n});')[0];
      // the uid is watched, so a different user is a different provider value
      expect(provider, contains('authRepositoryProvider'));
      expect(provider, contains("currentUser?.uid ?? ''"));
      // an empty uid short-circuits to false WITHOUT touching Firestore
      expect(provider, contains('uid.isEmpty'));
      expect(provider, contains('Stream.value(false)'));
      // the query can only ever match the caller's own follow document
      expect(provider, contains("where('followerUid', isEqualTo: uid)"));
    });

    test('follower COUNT is public; the follower UID LIST is not', () {
      final counter = providers
          .split('final restaurantFollowerCountProvider')[1]
          .split('\n});')[0];
      expect(counter, contains("collection('restaurant_public')"));
      expect(counter, contains('followerCount'));
      // no provider ever lists restaurant_follows for other users
      expect(providers.contains("collection('restaurant_follows')\n      .where('followerUid'"),
          isTrue);
    });

    test('duplicate action is blocked while in flight, and errors roll back',
        () {
      expect(followButton, contains('bool _busy = false;'));
      expect(followButton, contains('if (_busy || widget.canonicalPlaceId.isEmpty) return;'));
      expect(followButton, contains('onPressed: _busy ? null : () => _toggle(following)'));
      // optimistic update...
      expect(followButton, contains('_override = !currentlyFollowing; // optimistic'));
      // ...restored on failure
      expect(followButton, contains('_override = previous;'));
      expect(followButton, contains('widget.onError?.call('));
    });

    test('the button never writes Firestore directly', () {
      expect(followButton.contains('FirebaseFirestore'), isFalse);
      expect(followButton, contains('restaurantEngagementServiceProvider'));
    });
  });

  // ── MENU COMMENTS ───────────────────────────────────────────────────────

  group('menu comments', () {
    test('query is scoped to the EXACT canonicalPlaceId + menuItemId', () {
      final q =
          providers.split('final menuCommentsProvider')[1].split('\n});')[0];
      expect(q, contains("where('canonicalPlaceId', isEqualTo: target.canonicalPlaceId)"));
      expect(q, contains("where('menuItemId', isEqualTo: target.menuItemId)"));
    });

    test('only VISIBLE comments are queried — hidden/removed never render', () {
      final q =
          providers.split('final menuCommentsProvider')[1].split('\n});')[0];
      expect(q, contains("where('status', isEqualTo: kMenuCommentStatusVisible)"));
      expect(kMenuCommentStatusVisible, 'visible');
      // rules agree: a non-visible menu comment is not readable at all
      final block =
          rules.split('match /menu_comments/{commentId}')[1].split('}')[0];
      expect(block, contains("resource.data.status == 'visible'"));
      expect(block, contains('allow write: if false;'));
    });

    test('deterministic ordering and a bounded page', () {
      final q =
          providers.split('final menuCommentsProvider')[1].split('\n});')[0];
      expect(q, contains("orderBy('createdAt', descending: false)"));
      expect(q, contains('.limit(100)'));
    });

    test('create uses the createMenuComment callable, never a direct write',
        () {
      expect(service, contains("_call('createMenuComment', {"));
      expect(sheet, contains('createMenuComment('));
      expect(sheet.contains('FirebaseFirestore'), isFalse);
      expect(anyDirectWrite('menu_comments'), isFalse);
    });

    test('loading / empty / error states all exist', () {
      expect(sheet, contains("Key('menu-comment-loading')"));
      expect(sheet, contains("Key('menu-comment-empty')"));
      expect(sheet, contains("Key('menu-comment-error')"));
    });

    test('client-side max length matches the backend contract', () {
      expect(kMenuCommentTextMax, 300);
      expect(sheet, contains('const int kMenuCommentTextMax = 300;'));
      final identity =
          _read('functions/src/domain/restaurantEngagement/identity.ts');
      expect(identity, contains('export const MENU_COMMENT_TEXT_MAX = 300;'));
      // and the merchant-side limits match their backend constants too
      expect(identity, contains('export const RESTAURANT_POST_TEXT_MAX = 500;'));
      expect(identity,
          contains('export const RESTAURANT_REPLY_TEXT_MAX = 300;'));
      expect(merchantCard, contains('const int kRestaurantPostTextMax = 500;'));
      expect(merchantCard, contains('const int kRestaurantReplyTextMax = 300;'));
    });

    test('official restaurant reply is visually distinct from a user comment',
        () {
      expect(sheet, contains("Key('menu-comment-official-badge')"));
      // GATE 3F: the badge now names the RESTAURANT ("Kedai rasmi") rather
      // than a generic "Rasmi".
      expect(sheet, contains("t.t('restaurantOfficialBadge')"));
      // and the model distinguishes them by authorType, not by uid
      const reply = MenuCommentData(id: 'r1', data: {
        'authorType': 'restaurant',
        'displayNameSnapshot': 'Warung Pak Din',
        'text': 'Terima kasih!',
        'parentCommentId': 'c1',
      });
      expect(reply.isRestaurantReply, isTrue);
      expect(reply.displayName, 'Warung Pak Din');
      expect(reply.isRootComment, isFalse);

      const user = MenuCommentData(id: 'c1', data: {
        'authorType': 'user',
        'displayNameSnapshot': 'Aiman',
        'text': 'Sedap',
      });
      expect(user.isRestaurantReply, isFalse);
      expect(user.isRootComment, isTrue);
    });

    test('a restaurant reply carries NO merchant identity to render', () {
      // The stored reply document has authorUid = null by backend contract.
      const reply = MenuCommentData(id: 'r1', data: {
        'authorType': 'restaurant',
        'authorUid': null,
        'restaurantId': 'canon-1',
        'displayNameSnapshot': 'Warung Pak Din',
        'text': 'Terima kasih!',
      });
      expect(reply.data['authorUid'], isNull);
      expect(reply.displayName, 'Warung Pak Din');
      // neither the sheet nor the comment model ever reads an author uid
      expect(sheet.contains('authorUid'), isFalse);
      expect(providers.contains("data['authorUid']"), isFalse);
      expect(sheet.contains('actingMerchantUid'), isFalse);
    });

    test('flat threading only — no invented deep nesting', () {
      expect(sheet, contains('parentCommentId'));
      expect(sheet.contains('_ThreadEntry'), isTrue);
      // one reply level: an entry is either a root or a reply
      expect(sheet, contains('isReply: false'));
      expect(sheet, contains('isReply: true'));
    });
  });

  // ── RESTAURANT AUTHOR RENDERING ─────────────────────────────────────────

  group('restaurant author rendering', () {
    test('restaurant posts are detected by authorType, not by uid', () {
      expect(postCard,
          contains("bool get _isRestaurantAuthor => data['authorType'] == 'restaurant';"));
    });

    test('author identity never resolves a restaurant through a user profile',
        () {
      expect(postCard,
          contains("uid: _isRestaurantAuthor ? '' : (data['authorUid'] as String? ?? '')"));
    });

    test('tapping a restaurant author opens the canonical Restaurant Detail',
        () {
      expect(postCard, contains("context.push('/restaurant/\$canonicalId')"));
      expect(postCard, contains("for (final key in const ['canonicalPlaceId', 'restaurantId'])"));
      // the canonical route really is /restaurant/:placeId
      final constants = _read('lib/core/constants/app_constants.dart');
      expect(constants, contains("static const restaurant = '/restaurant/:placeId';"));
    });

    test('ordinary user post rendering is unchanged', () {
      // the user branch still pushes the public profile route
      expect(postCard, contains("context.push('/u/\$authorUid')"));
    });

    test('an official restaurant badge is rendered', () {
      expect(postCard, contains("Key('post-restaurant-badge')"));
    });

    test('the feed query already includes restaurant posts — no second feed',
        () {
      final social = _read('lib/features/social/social_providers.dart');
      // restaurant posts are visibility public + status active + groupId null,
      // so the existing public feed returns them with no change at all.
      expect(social, contains("where('visibility', isEqualTo: 'public')"));
      expect(social, contains("where('status', isEqualTo: kPostStatusActive)"));
      expect(social.contains("postType', isEqualTo: 'restaurant_post"), isFalse,
          reason: 'no separate restaurant feed query was created');
      // and the backend builds restaurant posts exactly that way
      final builder = _read(
          'functions/src/domain/restaurantEngagement/restaurantPost.ts');
      expect(builder, contains('visibility: "public"'));
      expect(builder, contains('status: NEW_POST_STATUS'));
      expect(builder, contains('groupId: null'));
      expect(builder, contains('authorUid: null'));
    });
  });

  // ── MERCHANT COMPOSER + OFFICIAL REPLY ──────────────────────────────────

  group('merchant restaurant workflows', () {
    const registryId = '11111111-1111-4111-8111-111111111111';
    const canonicalId = 'mm_restaurant_warung_pak_din';

    MerchantState stateWith(List<MerchantEngagementRestaurant> restaurants) =>
        MerchantState(
          account: const {'id': 'acc-1', 'status': 'active'},
          claims: const [],
          submissions: const [],
          // RAW memberships keep carrying registry_id — unchanged contract.
          memberships: const [
            {'registry_id': registryId, 'role': 'owner', 'status': 'active'},
          ],
          engagementRestaurants: restaurants,
        );

    // Required identity test 1 + 2.
    test('registryId and canonicalPlaceId are DIFFERENT and both preserved', () {
      final r = MerchantEngagementRestaurant.fromMap(const {
        'registryId': registryId,
        'canonicalPlaceId': canonicalId,
        'displayName': 'Warung Pak Din',
        'role': 'owner',
      })!;
      expect(r.registryId, registryId);
      expect(r.canonicalPlaceId, canonicalId);
      expect(r.registryId, isNot(r.canonicalPlaceId));
      expect(r.label, 'Warung Pak Din');

      final state = stateWith([r]);
      // BOTH representations survive independently.
      expect(state.memberships.single['registry_id'], registryId);
      expect(state.engagementRestaurants.single.canonicalPlaceId, canonicalId);
      expect(state.engagementRestaurants.single.registryId, registryId);
    });

    // Required identity test 3 — the card sends the CANONICAL id.
    test('the card uses engagementRestaurants, never membership registry_id', () {
      expect(merchantCard, contains('widget.state.engagementRestaurants'));
      expect(merchantCard, contains('canonicalPlaceId: restaurant.canonicalPlaceId'));
      // the registry id is never read as an identity anywhere in the card.
      // Prose in the docblock may NAME it; code may not touch it.
      final cardCode = merchantCard
          .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), '')
          .split('\n')
          .where((l) => !l.trimLeft().startsWith('///') && !l.trimLeft().startsWith('//'))
          .join('\n');
      expect(cardCode.contains('registry_id'), isFalse);
      expect(cardCode.contains('registryId'), isFalse,
          reason: 'the card must not even read the registry id');
      expect(cardCode.contains('activeMemberships'), isFalse);
      // Every canonical-id use site: createRestaurantPost, replyToMenuComment
      // and the menu-comment query target — all three take it from the
      // engagement projection, never from a membership row.
      expect(
        RegExp('canonicalPlaceId: restaurant.canonicalPlaceId')
            .allMatches(merchantCard)
            .length,
        3,
      );
    });

    // Required identity test 4 — no code path renames one id into the other.
    test('no code path maps registry_id -> canonicalPlaceId', () {
      final service = _read('lib/core/services/merchant_service.dart');
      expect(RegExp(r'canonicalPlaceId[:=]\s*.*registryId').hasMatch(service), isFalse);
      expect(RegExp(r'canonicalPlaceId[:=]\s*.*registry_id').hasMatch(service), isFalse);
      // the model REFUSES a row with no canonical id rather than substituting
      expect(
        MerchantEngagementRestaurant.fromMap(const {
          'registryId': registryId,
          'displayName': 'Warung',
          'role': 'owner',
        }),
        isNull,
      );
      expect(
        MerchantEngagementRestaurant.fromMap(const {
          'registryId': registryId,
          'canonicalPlaceId': '   ',
          'role': 'owner',
        }),
        isNull,
      );
    });

    // Required identity test 5 — no canonical mapping means no capability.
    test('a restaurant with no canonical mapping cannot be used', () {
      final empty = stateWith(const []);
      expect(empty.engagementRestaurants, isEmpty);
      // ...even though a raw active membership still exists for history
      expect(empty.memberships, hasLength(1));
      // and the card renders an honest unavailable state
      expect(merchantCard, contains("Key('merchant-engagement-no-restaurant')"));
    });

    // Required identity test 6 — role is display-only.
    test('role is server-provided and display-only', () {
      expect(merchantCard, contains(r'${selected.label} · ${selected.role}'));
      // the card never gates on role itself; the server re-authorizes
      expect(RegExp(r"role\s*==\s*'owner'").hasMatch(merchantCard), isFalse);
      expect(merchantCard.contains('ALLOWED_MEMBERSHIP_ROLES'), isFalse);
    });

    // Required identity test 7 — existing memberships/history flow intact.
    test('raw memberships/history flow remains intact', () {
      final service = _read('lib/core/services/merchant_service.dart');
      expect(service, contains("memberships: _list(state['memberships'])"));
      expect(service, contains('List<Map<String, dynamic>> get activeMemberships'));
      final center = _read('lib/features/merchant/merchant_center_screen.dart');
      expect(center, contains("membership['registry_id']"));
      // the profile editor still selects by registry id (its own contract)
      final editor =
          _read('lib/features/merchant/restaurant_profile_editor_card.dart');
      expect(editor, contains("membership['registry_id']"));
    });

    test('post composer uses createRestaurantPost with the canonical id', () {
      expect(service, contains("_call('createRestaurantPost', {"));
      expect(merchantCard, contains('createRestaurantPost('));
      expect(anyDirectWrite('feed_posts'), isFalse);
      expect(merchantCard.contains('FirebaseFirestore'), isFalse);
    });

    test('restaurant DISPLAY NAME is shown before publishing, not a UUID', () {
      expect(merchantCard, contains("Key('merchant-engagement-identity')"));
      expect(merchantCard, contains(r"'Menerbit sebagai ${selected.label}"));
      // dropdown labels use the name too
      expect(merchantCard, contains(r"Text('${r.label} · ${r.role}')"));
      expect(merchantCard, contains('value: r.canonicalPlaceId'));
    });

    test('single-restaurant merchants get no invented selector', () {
      expect(merchantCard, contains('if (list.length == 1) return list.first;'));
      expect(merchantCard, contains('if (restaurants.length > 1)'));
    });

    test('official reply IDs all come from SELECTED data, never typed', () {
      // menuItemId comes from the published profile menu selector
      expect(merchantCard, contains("Key('merchant-reply-menu-item')"));
      expect(merchantCard, contains("final id = item['id'].toString();"));
      // parentCommentId comes from a real MenuCommentData
      expect(merchantCard, contains('parentCommentId: target.id'));
      expect(merchantCard, contains('MenuCommentData? _replyTarget;'));
      // and the manual-id text fields are GONE
      expect(merchantCard.contains("Key('merchant-reply-parent-comment')"), isFalse);
      expect(merchantCard.contains('_menuItemController'), isFalse);
      expect(merchantCard.contains('_parentCommentController'), isFalse);
      expect(merchantCard.contains("labelText: 'ID item menu'"), isFalse);
      expect(merchantCard.contains("labelText: 'ID komen yang dibalas'"), isFalse);
    });

    test('menu items come from the published Restaurant Profile V2 read path', () {
      expect(merchantCard, contains('RestaurantProfileV2Service()'));
      expect(merchantCard, contains('getPublishedProfile(canonicalPlaceId)'));
      expect(merchantCard, contains('profile.menuItems'));
      // Flutter never reads the Master Registry directly
      expect(merchantCard.contains('place_registry_master'), isFalse);
    });

    test('eligible comments reuse the exact visible-only query contract', () {
      expect(merchantCard, contains('menuCommentsProvider(MenuCommentTarget('));
      expect(merchantCard, contains('canonicalPlaceId: restaurant.canonicalPlaceId'));
      expect(merchantCard, contains('menuItemId: menuItemId'));
      // official replies are context, not reply targets (no deep threading)
      expect(merchantCard, contains('comments.where((c) => !c.isRestaurantReply)'));
    });

    test('all required reply UI states exist', () {
      for (final key in [
        'merchant-reply-profile-loading',
        'merchant-reply-profile-unavailable',
        'merchant-reply-no-menu',
        'merchant-reply-menu-item',
        'merchant-reply-comments-loading',
        'merchant-reply-comments-error',
        'merchant-reply-no-comments',
        'merchant-reply-comment-list',
        'merchant-reply-target',
        'merchant-reply-text',
        'merchant-reply-submit',
        'merchant-engagement-error',
        'merchant-engagement-success',
      ]) {
        expect(merchantCard, contains("Key('$key')"), reason: key);
      }
      expect(merchantCard, contains('bool _busy = false;'));
    });

    test('merchant gets no moderation powers', () {
      for (final marker in ['hide', 'remove', 'restore']) {
        expect(merchantCard.toLowerCase().contains('social.post.$marker'), isFalse);
      }
      expect(merchantCard.contains('social.menu_comment.'), isFalse);
    });

    test('the acting merchant UID is never sent as public author identity', () {
      expect(service.contains('actingMerchantUid'), isFalse);
      expect(service.contains("'authorUid'"), isFalse);
      expect(merchantCard.contains('authorUid'), isFalse);
      expect(merchantCard.contains('currentUser'), isFalse);
    });
  });

  // ── ENTRY POINTS + PURE-WIDGET SAFETY ───────────────────────────────────

  group('entry points anchor to the existing canonical Restaurant Detail', () {
    test('engagement mounts only after the canonical publication resolved', () {
      expect(route, contains('String? _resolvedCanonicalPlaceId;'));
      expect(route, contains('_resolvedCanonicalPlaceId = profile.canonicalPlaceId;'));
      expect(route,
          contains('publishedVm != null ? _resolvedCanonicalPlaceId : null'));
      // an alias/provider id never reaches an engagement action
      expect(route, contains('canonicalId == null || canonicalId.isEmpty'));
    });

    test('no parallel restaurant profile screen or id model was created', () {
      for (final banned in [
        'RestaurantProfileV3',
        'RestaurantSocialProfile',
      ]) {
        expect(allDart.any((e) => e.value.contains(banned)), isFalse,
            reason: banned);
      }
      expect(File('lib/features/restaurant/canonical/'
              'canonical_restaurant_detail_screen.dart')
          .existsSync(), isTrue);
    });

    testWidgets('the canonical screen stays PURE when engagement is absent',
        (tester) async {
      // No Riverpod scope: proves the existing pure-widget tests still work
      // and that engagement is strictly opt-in.
      await tester.pumpWidget(_host(CanonicalRestaurantDetailScreen(vm: _vm())));
      await tester.pump(); // async localization delegate
      expect(find.text('Warung Pak Din'), findsWidgets);
      expect(find.byKey(const Key('restaurant-engagement-strip')), findsNothing);
    });

    testWidgets('the engagement slot renders when supplied', (tester) async {
      await tester.pumpWidget(_host(CanonicalRestaurantDetailScreen(
        vm: _vm(),
        engagement: const Text('ENGAGE'),
      )));
      await tester.pump(); // async localization delegate
      expect(find.byKey(const Key('restaurant-engagement-strip')), findsOneWidget);
      expect(find.text('ENGAGE'), findsOneWidget);
    });
  });

  // ── INDEXES ─────────────────────────────────────────────────────────────

  group('firestore indexes', () {
    test('exactly the two indexes the new queries require', () {
      expect(indexes, contains('"collectionGroup": "menu_comments"'));
      expect(indexes, contains('"collectionGroup": "restaurant_follows"'));
      final menu =
          indexes.split('"collectionGroup": "menu_comments"')[1].split('      ]')[0];
      for (final field in ['canonicalPlaceId', 'menuItemId', 'status', 'createdAt']) {
        expect(menu, contains('"fieldPath": "$field"'), reason: field);
      }
      final follows = indexes
          .split('"collectionGroup": "restaurant_follows"')[1]
          .split('      ]')[0];
      for (final field in ['followerUid', 'canonicalPlaceId']) {
        expect(follows, contains('"fieldPath": "$field"'), reason: field);
      }
    });
  });
}
