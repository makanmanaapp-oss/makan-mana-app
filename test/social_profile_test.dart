import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/constants/app_colors.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/features/social/food_profile.dart';
import 'package:makan_mana/features/social/food_profile_screen.dart';
import 'package:makan_mana/features/social/live_identity.dart';
import 'package:makan_mana/features/social/post_card.dart';
import 'package:makan_mana/features/social/saved_posts.dart';
import 'package:makan_mana/features/social/social_providers.dart';
import 'package:makan_mana/repositories/auth_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// REGRESI ISSUE 004 (identiti live) + ISSUE 005 (profil gaya Threads).

const _myUid = 'me-uid';

class _FakeUser implements User {
  _FakeUser(this._uid);
  final String _uid;
  @override
  String get uid => _uid;
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _FakeAuth extends AuthRepository {
  _FakeAuth() : super(firebaseReady: false);
  @override
  User? get currentUser => _FakeUser(_myUid);
}

/// Profil live per-uid untuk override family.
final Map<String, FoodProfile> _profiles = {};
int _profileStreamCount = 0;

FoodProfile _mkProfile(
  String uid, {
  String name = 'Foodie',
  String? username,
  String? photoUrl,
  String bio = '',
  bool exists = true,
  int followers = 0,
  int following = 0,
  int posts = 0,
  int reviews = 0,
  String cuisine = '',
  String food = '',
}) =>
    FoodProfile(
      uid: uid,
      displayName: name,
      username: username,
      photoUrl: photoUrl,
      bio: bio,
      exists: exists,
      followersCount: followers,
      followingCount: following,
      postsCount: posts,
      reviewsCount: reviews,
      favouriteCuisine: cuisine,
      favouriteFood: food,
    );

FeedPostData _mkPost(
  String id,
  String authorUid, {
  String? snapshotName,
  String text = 'sedap',
  String? postType,
  String? type,
  String? repostOf,
  List<String> media = const [],
}) =>
    FeedPostData(id: id, data: {
      'authorUid': authorUid,
      if (snapshotName != null) 'displayName': snapshotName,
      'text': text,
      'visibility': 'public',
      if (postType != null) 'postType': postType,
      if (type != null) 'type': type,
      if (repostOf != null) 'repostOfPostId': repostOf,
      if (media.isNotEmpty) 'imageUrls': media,
    });

late SharedPreferences _prefs;

List<Override> _overrides({
  List<FeedPostData> posts = const [],
  List<FeedPostData> myComments = const [],
  Set<String> blocked = const {},
  bool amFollowing = false,
  Map<String, FeedPostData?> postById = const {},
}) =>
    [
      sharedPreferencesProvider.overrideWithValue(_prefs),
      authRepositoryProvider.overrideWithValue(_FakeAuth()),
      publicProfileProvider.overrideWith((ref, uid) {
        _profileStreamCount++;
        return Stream.value(
            _profiles[uid] ?? FoodProfile.fromMap(uid, null));
      }),
      userPublicPostsProvider.overrideWith((ref, uid) => Stream.value(
          posts.where((p) => p.data['authorUid'] == uid).toList())),
      myCommentsProvider.overrideWith((ref) => Stream.value(myComments)),
      userPublicRepliesProvider.overrideWith((ref, uid) => Stream.value(
          myComments
              .where((c) => c.data['authorUid'] == uid)
              .toList())),
      myBlockedIdsProvider.overrideWith((ref) => Stream.value(blocked)),
      myMutedIdsProvider.overrideWith((ref) => Stream.value(const {})),
      mySavedPostIdsProvider.overrideWith((ref) => Stream.value(const {})),
      isFollowingProvider
          .overrideWith((ref, uid) => Stream.value(amFollowing)),
      postByIdProvider
          .overrideWith((ref, id) => Stream.value(postById[id])),
    ];

Widget _app(Widget home,
    {List<Override> overrides = const [],
    String language = 'ms',
    ThemeData? theme,
    GoRouter? router}) {
  final content = router != null
      ? MaterialApp.router(
          theme: theme ?? AppTheme.light(),
          locale: Locale(language),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          routerConfig: router,
        )
      : MaterialApp(
          theme: theme ?? AppTheme.light(),
          locale: Locale(language),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: home,
        );
  return ProviderScope(key: UniqueKey(), overrides: overrides, child: content);
}

GoRouter _router(String initial) => GoRouter(
      initialLocation: initial,
      routes: [
        GoRoute(path: '/', builder: (c, s) => const Scaffold(body: SizedBox())),
        GoRoute(
            path: '/u/:uid',
            builder: (c, s) =>
                FoodProfileScreen(uid: s.pathParameters['uid']!)),
        GoRoute(
            path: '/u/:uid/followers',
            builder: (c, s) =>
                const Scaffold(body: Center(child: Text('FOLLOWERS_STUB')))),
        GoRoute(
            path: '/u/:uid/following',
            builder: (c, s) =>
                const Scaffold(body: Center(child: Text('FOLLOWING_STUB')))),
        GoRoute(
            path: '/edit-food-profile',
            builder: (c, s) =>
                const Scaffold(body: Center(child: Text('EDIT_STUB')))),
        GoRoute(
            path: '/dm/chat/:uid',
            builder: (c, s) =>
                const Scaffold(body: Center(child: Text('DM_STUB')))),
        GoRoute(
            path: '/post/:id/media',
            builder: (c, s) =>
                const Scaffold(body: Center(child: Text('MEDIA_STUB')))),
      ],
    );

void _ignoreNetworkImageErrors() {
  final orig = FlutterError.onError;
  FlutterError.onError = (d) {
    if (d.exception is NetworkImageLoadException) return;
    orig?.call(d);
  };
}

Future<void> _pump(WidgetTester tester, Widget w) async {
  await tester.pumpWidget(w);
  // Router + delegasi l10n + strim = beberapa bingkai sebelum data sampai.
  await _settle(tester);
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 150));
  }
}

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    _prefs = await SharedPreferences.getInstance();
  });

  FlutterExceptionHandler? origOnError;
  setUp(() {
    _profiles.clear();
    _profileStreamCount = 0;
    // Persekitaran ujian memulangkan HTTP 400 untuk semua imej rangkaian -
    // ralat imej BUKAN kegagalan ujian (errorBuilder/fallback mengendalikan
    // paparan). Ralat lain kekal dilaporkan seperti biasa.
    origOnError = FlutterError.onError;
    FlutterError.onError = (details) {
      if (details.exception is NetworkImageLoadException) return;
      origOnError?.call(details);
    };
  });
  tearDown(() => FlutterError.onError = origOnError);

  // ============================================================
  // ISSUE 004: identiti live
  // ============================================================
  group('ISSUE 004 identiti live', () {
    testWidgets('post lama papar nama & avatar TERKINI', (tester) async {
      _ignoreNetworkImageErrors();
      _profiles['u1'] = _mkProfile('u1',
          name: 'Nama Baru', photoUrl: 'https://x/new.jpg');
      final post = _mkPost('p1', 'u1', snapshotName: 'Nama Lama');
      AuthorIdentity? captured;
      await _pump(
        tester,
        _app(
          Scaffold(
            body: Consumer(builder: (context, ref, _) {
              captured = resolveAuthorIdentity(
                ref,
                AppLocalizations.of(context),
                uid: 'u1',
                snapshotName: post.data['displayName'] as String?,
                snapshotPhotoUrl: 'https://x/old.jpg',
              );
              return ListView(children: [PostCard(post: post)]);
            }),
          ),
          overrides: _overrides(),
        ),
      );
      expect(find.text('Nama Baru'), findsWidgets,
          reason: 'nama live tidak dipaparkan pada post lama');
      expect(find.text('Nama Lama'), findsNothing);
      expect(captured!.isLive, isTrue);
      expect(captured!.photoUrl, 'https://x/new.jpg',
          reason: 'avatar live mesti diutamakan');
      expect(tester.takeException(), isNull);
    });

    testWidgets('snapshot digunakan bila profil live tiada', (tester) async {
      // Tiada profil dalam _profiles -> exists:false.
      final post = _mkPost('p2', 'u9', snapshotName: 'Snapshot Sahaja');
      AuthorIdentity? captured;
      await _pump(
        tester,
        _app(
          Scaffold(
            body: Consumer(builder: (context, ref, _) {
              captured = resolveAuthorIdentity(
                ref,
                AppLocalizations.of(context),
                uid: 'u9',
                snapshotName: 'Snapshot Sahaja',
                snapshotPhotoUrl: 'https://x/snap.jpg',
              );
              return ListView(children: [PostCard(post: post)]);
            }),
          ),
          overrides: _overrides(),
        ),
      );
      expect(find.text('Snapshot Sahaja'), findsWidgets);
      expect(captured!.isLive, isFalse);
      expect(captured!.photoUrl, 'https://x/snap.jpg',
          reason: 'avatar snapshot mesti kekal sebagai fallback');
      expect(tester.takeException(), isNull);
    });

    testWidgets('akaun dipadam guna label selamat dilokalkan',
        (tester) async {
      final post = _mkPost('p3', 'u-gone');
      await _pump(
        tester,
        _app(
          Scaffold(body: ListView(children: [PostCard(post: post)])),
          overrides: _overrides(),
        ),
      );
      final l = AppLocalizations(const Locale('ms'));
      expect(find.text(l.t('deletedUser')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('pengarang berulang berkongsi SATU strim profil',
        (tester) async {
      _profiles['u1'] = _mkProfile('u1', name: 'Sama');
      await _pump(
        tester,
        _app(
          Scaffold(
            body: ListView(children: [
              PostCard(post: _mkPost('a', 'u1', snapshotName: 'x')),
              PostCard(post: _mkPost('b', 'u1', snapshotName: 'y')),
              PostCard(post: _mkPost('c', 'u1', snapshotName: 'z')),
            ]),
          ),
          overrides: _overrides(),
        ),
      );
      expect(_profileStreamCount, 1,
          reason: 'family provider mesti dedup pengarang sama');
      expect(find.text('Sama'), findsNWidgets(3));
    });

    testWidgets('kemas kini profil menyegar nama post TANPA restart',
        (tester) async {
      final controller = StreamController<FoodProfile>.broadcast();
      await _pump(
        tester,
        _app(
          Scaffold(
              body: ListView(children: [
            PostCard(post: _mkPost('p', 'u1', snapshotName: 'Lama'))
          ])),
          overrides: [
            ..._overrides(),
            publicProfileProvider
                .overrideWith((ref, uid) => controller.stream),
          ],
        ),
      );
      // Sebelum strim memancar: snapshot.
      expect(find.text('Lama'), findsOneWidget);
      controller.add(_mkProfile('u1', name: 'Baru Live'));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Baru Live'), findsOneWidget);
      expect(find.text('Lama'), findsNothing);
      await controller.close();
    });

    test('snapshot legasi kekal boleh dinyahsiri', () {
      final p = FoodProfile.fromMap('u', {
        'displayName': 'Legasi',
        'followersCount': 5,
      });
      expect(p.displayName, 'Legasi');
      expect(p.exists, isTrue);
      final missing = FoodProfile.fromMap('u', null);
      expect(missing.exists, isFalse);
      expect(missing.displayName, 'Foodie');
    });
  });

  // ============================================================
  // ISSUE 005: profil gaya Threads
  // ============================================================
  group('ISSUE 005 profil Threads', () {
    testWidgets('profil sendiri: Edit + Kongsi, TIADA Follow',
        (tester) async {
      _profiles[_myUid] =
          _mkProfile(_myUid, name: 'Saya', username: 'saya');
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(), router: _router('/u/$_myUid')),
      );
      final l = AppLocalizations(const Locale('ms'));
      expect(find.text(l.t('editFoodProfile')), findsOneWidget);
      expect(find.text(l.t('shareProfileAction')), findsWidgets);
      expect(find.text(l.t('follow')), findsNothing);
      expect(find.byType(FollowButton), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('profil orang lain: Follow + DM, tiada Edit',
        (tester) async {
      _profiles['u2'] = _mkProfile('u2', name: 'Kawan', username: 'kawan');
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(), router: _router('/u/u2')),
      );
      final l = AppLocalizations(const Locale('ms'));
      expect(find.byType(FollowButton), findsOneWidget);
      expect(find.text(l.t('follow')), findsOneWidget);
      expect(find.text('DM'), findsOneWidget);
      expect(find.text(l.t('editFoodProfile')), findsNothing);
    });

    testWidgets('keadaan Following dipaparkan; profil disekat papar nota',
        (tester) async {
      _profiles['u2'] = _mkProfile('u2', name: 'Kawan');
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(amFollowing: true),
            router: _router('/u/u2')),
      );
      final l = AppLocalizations(const Locale('ms'));
      expect(find.text(l.t('following')), findsOneWidget);

      // Profil DISEKAT.
      _profiles['u3'] = _mkProfile('u3', name: 'Disekat');
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(blocked: {'u3'}),
            router: _router('/u/u3')),
      );
      expect(find.text(l.t('blockedProfileNote')), findsOneWidget);
      expect(find.text(l.t('unblock')), findsOneWidget);
      expect(find.byType(FollowButton), findsNothing,
          reason: 'blok mesti menghalang Follow');
      expect(find.text('DM'), findsNothing,
          reason: 'blok mesti menyembunyikan DM');
    });

    testWidgets('profil hilang -> keadaan tidak tersedia', (tester) async {
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(), router: _router('/u/tiada')),
      );
      final l = AppLocalizations(const Locale('ms'));
      expect(find.text(l.t('userNotFound')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('4 tab utama render; Posts tapis repost; Reposts papar '
        'repost+quote', (tester) async {
      _profiles['u2'] = _mkProfile('u2', name: 'Kawan');
      _profiles['u1'] = _mkProfile('u1', name: 'Asal');
      final posts = [
        _mkPost('n1', 'u2', text: 'post biasa'),
        _mkPost('c1', 'u2', text: 'checkin sini', type: 'checkin'),
        _mkPost('r1', 'u2',
            text: '', postType: 'repost', repostOf: 'orig1'),
        _mkPost('q1', 'u2',
            text: 'quote saya', postType: 'quote_repost', repostOf: 'orig1'),
      ];
      final orig = _mkPost('orig1', 'u1', text: 'kandungan asal');
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides:
                _overrides(posts: posts, postById: {'orig1': orig}),
            router: _router('/u/u2')),
      );
      final l = AppLocalizations(const Locale('ms'));
      for (final k in ['tabPosts', 'tabReplies', 'tabMedia', 'tabReposts']) {
        expect(find.text(l.t(k)), findsWidgets, reason: 'tab $k hilang');
      }
      // Posts: post biasa + checkin sahaja.
      expect(find.text('post biasa'), findsOneWidget);
      expect(find.text('quote saya'), findsNothing);

      // Reposts tab.
      await tester.tap(find.text(l.t('tabReposts')));
      await _settle(tester);
      expect(find.text('quote saya'), findsOneWidget,
          reason: 'quote repost tidak dipaparkan');
      expect(find.text('post biasa'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('tab Media: grid + buka viewer; kosong bila tiada media',
        (tester) async {
      _ignoreNetworkImageErrors();
      _profiles['u2'] = _mkProfile('u2', name: 'Kawan');
      final posts = [
        _mkPost('m1', 'u2', media: ['https://x/1.jpg', 'https://x/2.jpg']),
      ];
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(posts: posts), router: _router('/u/u2')),
      );
      final l = AppLocalizations(const Locale('ms'));
      await tester.tap(find.text(l.t('tabMedia')));
      await _settle(tester);
      expect(find.byType(Image), findsNWidgets(2));
      await tester.tap(find.byType(Image).first);
      await _settle(tester);
      expect(find.text('MEDIA_STUB'), findsOneWidget,
          reason: 'tap media tidak membuka viewer');
    });

    testWidgets('tab Balasan: sendiri papar balasan + induk; orang lain '
        'papar nota privasi; induk dipadam selamat', (tester) async {
      _profiles[_myUid] = _mkProfile(_myUid, name: 'Saya');
      _profiles['u1'] = _mkProfile('u1', name: 'Asal');
      final myComments = [
        FeedPostData(id: 'c1', data: {
          'authorUid': _myUid,
          'text': 'balasan saya',
          'postId': 'parent1',
        }),
        FeedPostData(id: 'c2', data: {
          'authorUid': _myUid,
          'text': 'balasan yatim',
          'postId': 'gone',
        }),
      ];
      final parent = _mkPost('parent1', 'u1', text: 'post induk');
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(
                myComments: myComments,
                postById: {'parent1': parent, 'gone': null}),
            router: _router('/u/$_myUid')),
      );
      final l = AppLocalizations(const Locale('ms'));
      await tester.tap(find.text(l.t('tabReplies')));
      await _settle(tester);
      expect(find.text('balasan saya'), findsOneWidget);
      expect(find.textContaining(l.t('replyToLabel')), findsWidgets);
      expect(find.text('post induk'), findsOneWidget,
          reason: 'pratonton induk hilang');
      expect(find.text(l.t('postUnavailable')), findsOneWidget,
          reason: 'induk dipadam mesti keadaan selamat');

      // Profil ORANG LAIN -> nota privasi.
      _profiles['u2'] = _mkProfile('u2', name: 'Kawan');
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(), router: _router('/u/u2')),
      );
      await tester.tap(find.text(l.t('tabReplies')));
      await _settle(tester);
      // Closeout: orang lain kini dapat balasan awam sebenar - profil
      // tanpa balasan menunjukkan keadaan kosong, BUKAN nota privasi.
      expect(find.text(l.t('noRepliesYet')), findsOneWidget);
      expect(find.text(l.t('repliesOwnerOnly')), findsNothing);
    });

    testWidgets('pemapar avatar dibuka & ditutup dengan avatar SEMASA',
        (tester) async {
      _profiles['u2'] = _mkProfile('u2', name: 'Kawan');
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(), router: _router('/u/u2')),
      );
      // Avatar header = satu-satunya MakanAvatar (tiada post dalam ujian).
      final avatarFinder = find.byWidgetPredicate(
          (w) => w.runtimeType.toString() == 'MakanAvatar');
      expect(avatarFinder, findsOneWidget);
      await tester.tap(avatarFinder);
      await _settle(tester);
      expect(find.byIcon(Icons.close), findsOneWidget,
          reason: 'pemapar avatar tidak dibuka');
      await tester.tap(find.byIcon(Icons.close));
      await _settle(tester);
      expect(find.byIcon(Icons.close), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('statistik tidak pernah negatif; stat pengikut buka senarai',
        (tester) async {
      _profiles['u2'] =
          _mkProfile('u2', name: 'Kawan', followers: -5, posts: 3);
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(), router: _router('/u/u2')),
      );
      final l = AppLocalizations(const Locale('ms'));
      expect(find.textContaining('-5'), findsNothing,
          reason: 'kiraan negatif bocor ke UI');
      expect(find.textContaining('0 ${l.t('statFollowers')}'),
          findsOneWidget);
      await tester
          .tap(find.textContaining('0 ${l.t('statFollowers')}'));
      await _settle(tester);
      expect(find.text('FOLLOWERS_STUB'), findsOneWidget);
    });

    testWidgets('tema hitam kekal dari Bright DAN Dark; tiada sepanduk merah',
        (tester) async {
      _profiles['u2'] = _mkProfile('u2', name: 'Kawan', bio: 'bio saya');
      for (final theme in [AppTheme.light(), AppTheme.dark()]) {
        await _pump(
          tester,
          _app(const SizedBox(),
              overrides: _overrides(),
              theme: theme,
              router: _router('/u/u2')),
        );
        final scaffold = tester.widget<Scaffold>(find
            .descendant(
                of: find.byType(FoodProfileScreen),
                matching: find.byType(Scaffold))
            .first);
        expect(scaffold.backgroundColor, AppColors.threadsBg,
            reason: 'profil sosial mesti kekal hitam');
      }
    });

    testWidgets('Tamil 360dp @1.30: 4 tab muat tanpa overflow',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 800));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      _profiles['u2'] = _mkProfile('u2',
          name: 'பெயர் மிக நீளமான சோதனை பயனர்',
          username: 'longusername_tamil',
          bio: 'சாப்பாட்டை நேசிப்பவர். ' * 6,
          cuisine: 'மலாய் · ஜப்பானிய',
          food: 'நாசி கந்தார்');
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(),
            language: 'ta',
            router: _router('/u/u2')),
      );
      // MediaQuery textScale dalam router harness: guna builder global.
      expect(tester.takeException(), isNull,
          reason: 'overflow pada profil Tamil');
      final l = AppLocalizations(const Locale('ta'));
      for (final k in ['tabPosts', 'tabReplies', 'tabMedia', 'tabReposts']) {
        expect(find.text(l.t(k)), findsWidgets);
      }
    });

    testWidgets('zh: bio + tab render tanpa ralat', (tester) async {
      _profiles['u2'] = _mkProfile('u2',
          name: '美食用户', username: 'zh_user', bio: '爱吃辣，常选马来菜和日本菜。');
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(),
            language: 'zh',
            router: _router('/u/u2')),
      );
      expect(find.text('美食用户'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('balasan AWAM orang lain dipaparkan; induk tak boleh '
        'dibaca DISKIP senyap', (tester) async {
      _profiles['u2'] = _mkProfile('u2', name: 'Kawan');
      _profiles['u1'] = _mkProfile('u1', name: 'Asal');
      final replies = [
        FeedPostData(id: 'r1', data: {
          'authorUid': 'u2',
          'text': 'balasan awam kawan',
          'postId': 'pub1',
          'parentVisibility': 'public',
        }),
        FeedPostData(id: 'r2', data: {
          'authorUid': 'u2',
          'text': 'balasan induk privat',
          'postId': 'priv1',
          'parentVisibility': 'public', // snapshot lama; induk kini privat
        }),
      ];
      final pub = _mkPost('pub1', 'u1', text: 'post awam');
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(
                myComments: replies,
                postById: {'pub1': pub, 'priv1': null}),
            router: _router('/u/u2')),
      );
      final l = AppLocalizations(const Locale('ms'));
      await tester.tap(find.text(l.t('tabReplies')));
      await _settle(tester);
      expect(find.text('balasan awam kawan'), findsOneWidget,
          reason: 'balasan awam orang lain tidak dipaparkan');
      expect(find.text('post awam'), findsOneWidget,
          reason: 'pratonton induk hilang');
      // Induk tidak boleh dibaca -> baris DISKIP (tiada teks, tiada
      // "tidak tersedia" yang mendedahkan kewujudan post privat).
      expect(find.text('balasan induk privat'), findsNothing);
      expect(find.text(l.t('postUnavailable')), findsNothing);
      // Nota privasi TIDAK lagi menjadi kandungan lalai.
      expect(find.text(l.t('repliesOwnerOnly')), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('zh: pratonton balasan render; statistik 360dp @1.30 tiada '
        'overflow atau elipsis', (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 800));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      _profiles['u2'] = _mkProfile('u2',
          name: 'Kawan', followers: 12, following: 3, posts: 7, reviews: 2);
      _profiles['u1'] = _mkProfile('u1', name: '原作者');
      final replies = [
        FeedPostData(id: 'r1', data: {
          'authorUid': 'u2',
          'text': '这家店的辣度刚刚好',
          'postId': 'pub1',
          'parentVisibility': 'public',
        }),
      ];
      final pub = _mkPost('pub1', 'u1', text: '推荐这家马来餐厅');
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(
                myComments: replies, postById: {'pub1': pub}),
            language: 'zh',
            router: _router('/u/u2')),
      );
      final zh = AppLocalizations(const Locale('zh'));
      // Statistik penuh kelihatan (Wrap membalut, tiada elipsis).
      expect(find.text('12 ${zh.t('statFollowers')}'), findsOneWidget);
      expect(find.text('7 ${zh.t('statPosts')}'), findsOneWidget);
      await tester.tap(find.text(zh.t('tabReplies')));
      await _settle(tester);
      expect(find.text('这家店的辣度刚刚好'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('penapis Check-in dalam Posts berfungsi', (tester) async {
      _profiles['u2'] = _mkProfile('u2', name: 'Kawan');
      final posts = [
        _mkPost('n1', 'u2', text: 'post biasa'),
        _mkPost('c1', 'u2', text: 'checkin sini', type: 'checkin'),
      ];
      await _pump(
        tester,
        _app(const SizedBox(),
            overrides: _overrides(posts: posts), router: _router('/u/u2')),
      );
      final l = AppLocalizations(const Locale('ms'));
      await tester.tap(find.text(l.t('tabCheckins')));
      await _settle(tester);
      expect(find.text('checkin sini'), findsOneWidget);
      expect(find.text('post biasa'), findsNothing);
    });
  });
}
