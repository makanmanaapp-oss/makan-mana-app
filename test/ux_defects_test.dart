// Empat defek UX yang direkodkan semasa QA peranti tetapi TIDAK dibaiki
// ketika itu. Setiap pembaikan di sini bersifat TAMBAHAN: tiada kandungan
// disembunyikan, tiada aliran diubah, tiada keputusan produk dibuat.
//
//  1. Suka luar talian gagal SENYAP - kemas kini optimistik berbalik dan
//     pengguna tidak diberitahu apa-apa.
//  2. Data cache dipapar di bawah ralat kebenaran TANPA penanda - pengguna
//     melihat senarai lama dan menyangka ia terkini.
//  3. Siaran berstatus 'hidden' kelihatan sama seperti siaran aktif pada
//     profil pemiliknya - pemilik tidak tahu ia tidak dilihat orang lain.
//  4. Skrin Tetapan mencetuskan penegasan mod-debug "ListTile background
//     color or ink splashes may be invisible" - percikan dakwat memang
//     tidak kelihatan pada tiga baris Penampilan.
import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/core/services/social_service.dart';
import 'package:makan_mana/features/groups/group_hub_screen.dart';
import 'package:makan_mana/features/groups/group_providers.dart';
import 'package:makan_mana/features/settings/settings_screen.dart';
import 'package:makan_mana/features/social/post_card.dart';
import 'package:makan_mana/features/social/social_providers.dart';
import 'package:makan_mana/repositories/auth_repository.dart';
import 'package:makan_mana/repositories/event_repository.dart';

const _myUid = 'u-saya';

class _FakeUser implements User {
  @override
  String get uid => _myUid;
  @override
  List<UserInfo> get providerData => const [];
  @override
  dynamic noSuchMethod(Invocation i) => null;
}

class _FakeAuth extends AuthRepository {
  _FakeAuth() : super(firebaseReady: false);
  @override
  User? get currentUser => _FakeUser();
}

/// SocialService yang tidak menyentuh rangkaian. [likeThrows] mensimulasi
/// panggilan callable yang gagal - iaitu apa yang berlaku di luar talian.
class _FakeSocial extends SocialService {
  _FakeSocial({this.likeThrows = false}) : super(firebaseReady: false);
  final bool likeThrows;
  int likeCalls = 0;

  @override
  Future<bool> toggleLike(String postId) async {
    likeCalls++;
    if (likeThrows) throw StateError('unavailable');
    return true;
  }
}

late SharedPreferences _prefs;

Widget _app(Widget home, List<Override> overrides) => ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(_prefs),
        authRepositoryProvider.overrideWithValue(_FakeAuth()),
        eventRepositoryProvider
            .overrideWithValue(EventRepository(firebaseReady: false)),
        socialClockProvider
            .overrideWith((ref) => Stream.value(DateTime(2026, 1, 1))),
        ...overrides,
      ],
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
        home: home,
      ),
    );

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 300));
}

String _t(String key) => AppLocalizations(const Locale('ms')).t(key);

FeedPostData _post({
  String id = 'p1',
  String author = _myUid,
  String status = 'active',
  int likeCount = 4,
}) =>
    FeedPostData(id: id, data: {
      'authorUid': author,
      'displayName': 'FM Ali',
      'text': 'nasi lemak ujian',
      'visibility': 'public',
      'status': status,
      'likeCount': likeCount,
      'commentCount': 0,
    });

const _gid = 'g1';
const _group = GroupData(id: _gid, data: {
  'name': 'FM Kumpulan',
  'privacy': 'private',
  'ownerUid': _myUid,
});

List<Override> _groupMember(List<Override> extra) => [
      firebaseReadyProvider.overrideWithValue(true),
      myGroupIdsProvider.overrideWith((ref) => Stream.value(const {_gid})),
      groupProvider.overrideWith((ref, id) => Stream.value(_group)),
      myGroupRoleProvider.overrideWith((ref, id) => Stream.value('owner')),
      groupPollsProvider.overrideWith((ref, id) => Stream.value(const [])),
      groupBillsProvider.overrideWith((ref, id) => Stream.value(const [])),
      groupMembersProvider.overrideWith((ref, id) => Stream.value(const [])),
      groupStatusProvider.overrideWith((ref, id) => Stream.value(const [])),
      ...extra,
    ];

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    _prefs = await SharedPreferences.getInstance();
  });

  // ------------------------------------------------- 1. suka luar talian
  group('suka yang gagal memberitahu pengguna', () {
    testWidgets('kegagalan -> mesej, dan kiraan berbalik', (tester) async {
      final social = _FakeSocial(likeThrows: true);
      await tester.pumpWidget(_app(
        Scaffold(body: ListView(children: [PostCard(post: _post())])),
        [socialServiceProvider.overrideWithValue(social)],
      ));
      await _settle(tester);

      // find.bySemanticsLabel memerlukan semantik diaktifkan; ikon hati
      // ialah sasaran sentuh yang sama.
      await tester.tap(find.byIcon(Icons.favorite_border));
      await _settle(tester);

      expect(social.likeCalls, 1);
      expect(find.text(_t('actionFailed')), findsOneWidget,
          reason: 'kegagalan senyap meninggalkan pengguna menyangka ia berjaya');
      // Tingkah laku sedia ada MESTI kekal: kiraan berbalik ke nilai asal.
      expect(find.text('4'), findsOneWidget);
    });

    testWidgets('kejayaan -> tiada mesej, kiraan kekal naik', (tester) async {
      final social = _FakeSocial();
      await tester.pumpWidget(_app(
        Scaffold(body: ListView(children: [PostCard(post: _post())])),
        [socialServiceProvider.overrideWithValue(social)],
      ));
      await _settle(tester);

      // find.bySemanticsLabel memerlukan semantik diaktifkan; ikon hati
      // ialah sasaran sentuh yang sama.
      await tester.tap(find.byIcon(Icons.favorite_border));
      await _settle(tester);

      expect(social.likeCalls, 1);
      expect(find.text(_t('actionFailed')), findsNothing);
      expect(find.text('5'), findsOneWidget);
    });
  });

  // ------------------------------------------------ 2. data cache basi
  group('data cache di bawah ralat ditanda', () {
    testWidgets('feed grup: data lama KEKAL dipapar, dengan penanda',
        (tester) async {
      final ctl = StreamController<List<FeedPostData>>();
      addTearDown(ctl.close);
      await tester.pumpWidget(_app(
        const GroupHubScreen(groupId: _gid),
        _groupMember([groupFeedProvider.overrideWith((ref, id) => ctl.stream)]),
      ));
      ctl.add([_post(id: 'g-p1')]);
      await _settle(tester);
      expect(find.text('nasi lemak ujian'), findsOneWidget);

      // Bacaan seterusnya DITOLAK, tetapi data lama masih dalam cache.
      ctl.addError(Exception('permission-denied'), StackTrace.current);
      await _settle(tester);

      expect(tester.takeException(), isNull);
      expect(find.text('nasi lemak ujian'), findsOneWidget,
          reason: 'menyembunyikan kandungan yang ada adalah regresi');
      expect(find.text(_t('staleDataNotice')), findsOneWidget,
          reason: 'pengguna mesti tahu senarai ini gagal dikemas kini');
    });

    testWidgets('tiada ralat -> tiada penanda', (tester) async {
      await tester.pumpWidget(_app(
        const GroupHubScreen(groupId: _gid),
        _groupMember([
          groupFeedProvider
              .overrideWith((ref, id) => Stream.value([_post(id: 'g-p1')])),
        ]),
      ));
      await _settle(tester);
      expect(find.text('nasi lemak ujian'), findsOneWidget);
      expect(find.text(_t('staleDataNotice')), findsNothing);
    });
  });

  // ------------------------------------------- 3. label siaran tersorok
  group('siaran tersorok ditanda untuk pemiliknya', () {
    testWidgets('status hidden + saya pengarang -> label', (tester) async {
      await tester.pumpWidget(_app(
        Scaffold(
            body: ListView(
                children: [PostCard(post: _post(status: 'hidden'))])),
        const [],
      ));
      await _settle(tester);
      expect(find.text(_t('postStatusHidden')), findsOneWidget);
    });

    testWidgets('status active -> tiada label', (tester) async {
      await tester.pumpWidget(_app(
        Scaffold(body: ListView(children: [PostCard(post: _post())])),
        const [],
      ));
      await _settle(tester);
      expect(find.text(_t('postStatusHidden')), findsNothing);
    });

    testWidgets('hidden tetapi BUKAN pengarang -> tiada label', (tester) async {
      // Rules tidak membenarkan ini, tetapi label itu ialah dakwaan tentang
      // keterlihatan SAYA; jangan buat dakwaan itu untuk siaran orang lain.
      await tester.pumpWidget(_app(
        Scaffold(
            body: ListView(children: [
          PostCard(post: _post(author: 'u-lain', status: 'hidden'))
        ])),
        const [],
      ));
      await _settle(tester);
      expect(find.text(_t('postStatusHidden')), findsNothing);
    });
  });

  // --------------------------------------- 4. penegasan debug Tetapan
  group('Tetapan tidak mencetuskan penegasan Material', () {
    testWidgets('percikan dakwat kelihatan (tiada penegasan ListTile)',
        (tester) async {
      final errors = <FlutterErrorDetails>[];
      final previous = FlutterError.onError;
      FlutterError.onError = errors.add;
      try {
        await tester.pumpWidget(_app(const SettingsScreen(), [
          firebaseReadyProvider.overrideWithValue(true),
          myUserDocProvider.overrideWith((ref) => Stream.value(const {})),
        ]));
        await _settle(tester);
      } finally {
        FlutterError.onError = previous;
      }
      expect(errors.map((e) => e.exceptionAsString()).toList(), isEmpty,
          reason: 'Tetapan mesti bersih daripada penegasan Material');
    });
  });
}
