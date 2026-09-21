// Kelas D — skrin yang boleh dicapai pengguna di luar cawangan shell.
//
// Mekanisme yang sama (`AsyncError.value` MELONTAR, riverpod 2.6.1
// `common.dart:493`), tetapi pembaikannya BUKAN satu corak. Menukar
// `.value ?? const []` kepada `valueOrNull ?? const []` secara buta menukar
// kotak kelabu kepada KOSONG PALSU, dan pada penyunting ia lebih teruk:
// nilai lalai disemai ke dalam medan dan Simpan menulis ganti data sebenar.
//
// Jadi setiap kumpulan di bawah menegaskan perkara yang berbeza:
//   * kandungan utama  -> keadaan RALAT + Cuba Lagi, bukan senarai kosong
//   * penyunting       -> TIDAK disemai daripada bacaan gagal / memuatkan
//   * hiasan           -> skrin tetap dibina, tiada pengecualian
//
// Ujian ini ditulis SEBELUM pembaikan dan dijalankan pada kod lama dahulu.
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
import 'package:makan_mana/features/dm/dm_conversation_screen.dart';
import 'package:makan_mana/features/dm/dm_inbox_screen.dart';
import 'package:makan_mana/features/dm/dm_service.dart';
import 'package:makan_mana/features/fit/fit_models.dart';
import 'package:makan_mana/features/fit/fit_monitor_screen.dart';
import 'package:makan_mana/features/fit/fit_providers.dart';
import 'package:makan_mana/features/fit/fit_today_screen.dart';
import 'package:makan_mana/features/groups/group_hub_screen.dart';
import 'package:makan_mana/features/groups/group_providers.dart';
import 'package:makan_mana/features/groups/group_settings_screen.dart';
import 'package:makan_mana/features/groups/group_status.dart';
import 'package:makan_mana/features/paywall/coupon_screen.dart';
import 'package:makan_mana/features/pro/pro_hub_screen.dart';
import 'package:makan_mana/features/settings/settings_screen.dart';
import 'package:makan_mana/features/social/food_profile.dart';
import 'package:makan_mana/features/social/social_providers.dart';
import 'package:makan_mana/features/taxonomy/taxonomy_data.dart';
import 'package:makan_mana/features/taxonomy/taxonomy_sheet.dart';
import 'package:makan_mana/features/wallet/wallet_models.dart';
import 'package:makan_mana/features/wallet/wallet_providers.dart';
import 'package:makan_mana/features/wallet/wallet_screens.dart';
import 'package:makan_mana/repositories/auth_repository.dart';
import 'package:makan_mana/repositories/event_repository.dart';

/// Bacaan Firestore yang ditolak.
Stream<T> _denied<T>() =>
    Stream<T>.error(Exception('permission-denied'), StackTrace.current);

/// Bacaan yang belum selesai.
Stream<T> _pending<T>() => Stream<T>.fromFuture(Completer<T>().future);

const _gid = 'g1';
const _group = GroupData(id: _gid, data: {
  'name': 'FM Kumpulan',
  'privacy': 'private',
  'ownerUid': 'u-owner',
});

const _profile = FitnessProfile(
  heightCm: 170,
  weightKg: 70,
  age: 28,
  gender: 'male',
  mainGoal: 'fatLoss',
  fitnessLevel: 'beginner',
  selectedSportMood: 'fighterCamp',
);

late SharedPreferences _prefs;

/// Tanpa ini setiap ujian dengan `firebaseReady=true` gagal dengan
/// `core/no-app` - kegagalan HARNESS yang tiada kaitan dengan `.value`, jadi
/// ia akan kelihatan seperti bukti gagal-sebelum padahal bukan.
class _FakeUser implements User {
  @override
  String get uid => 'u-saya';
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

Widget _app(Widget home, List<Override> overrides) => ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(_prefs),
        authRepositoryProvider.overrideWithValue(_FakeAuth()),
        // Log peristiwa dalam initState tidak boleh menyentuh Firebase.
        eventRepositoryProvider
            .overrideWithValue(EventRepository(firebaseReady: false)),
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

/// Pam berbatas. Strim ralat/nilai dihantar pada mikrotugas; beberapa pam
/// memastikan widget melihat keadaan akhir, bukan keadaan memuatkan.
Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 300));
}

String _t(WidgetTester tester, String key) =>
    AppLocalizations.of(tester.element(find.byType(Scaffold).first)).t(key);

/// Keadaan ralat mesti kelihatan DAN tidak boleh ada pengecualian build.
void _expectLoadFailed(WidgetTester tester, String key,
    {bool retry = true}) {
  expect(tester.takeException(), isNull,
      reason: 'bacaan yang gagal tidak boleh menjadi kotak kelabu');
  expect(find.text(_t(tester, key)), findsOneWidget,
      reason: 'pengguna mesti diberitahu bacaan gagal ($key)');
  if (retry) {
    expect(find.text(_t(tester, 'retryAction')), findsOneWidget,
        reason: 'keadaan ralat tanpa jalan keluar meninggalkan pengguna buntu');
  }
}

/// Ahli grup: keahlian + dokumen grup berjaya dibaca.
List<Override> _member({List<Override> extra = const []}) => [
      firebaseReadyProvider.overrideWithValue(true),
      myGroupIdsProvider.overrideWith((ref) => Stream.value(const {_gid})),
      groupProvider.overrideWith((ref, id) => Stream.value(_group)),
      myGroupRoleProvider.overrideWith((ref, id) => Stream.value('owner')),
      groupFeedProvider.overrideWith((ref, id) => Stream.value(const [])),
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

  // ------------------------------------------------------------------ GRUP
  group('Hub grup', () {
    testWidgets(
        'dokumen grup DITOLAK (bukan ahli grup peribadi) -> "Grup tidak '
        'tersedia", bukan kotak kelabu', (tester) async {
      // HOTFIX 4.2 sudah membina _GroupUnavailable untuk kes tepat ini,
      // tetapi `groupAsync.value` melontar sebelum ia dicapai.
      await tester.pumpWidget(_app(const GroupHubScreen(groupId: _gid), [
        firebaseReadyProvider.overrideWithValue(true),
        myGroupIdsProvider.overrideWith((ref) => Stream.value(const {})),
        groupProvider.overrideWith((ref, id) => _denied()),
      ]));
      await _settle(tester);
      _expectLoadFailed(tester, 'groupUnavailable', retry: false);
    });

    testWidgets('keahlian DITOLAK -> tidak tersedia, bukan spinner selamanya',
        (tester) async {
      await tester.pumpWidget(_app(const GroupHubScreen(groupId: _gid), [
        firebaseReadyProvider.overrideWithValue(true),
        myGroupIdsProvider.overrideWith((ref) => _denied()),
        groupProvider.overrideWith((ref, id) => Stream.value(_group)),
      ]));
      await _settle(tester);
      _expectLoadFailed(tester, 'groupUnavailable', retry: false);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('tab Feed: feed grup DITOLAK -> ralat + Cuba Lagi',
        (tester) async {
      await tester.pumpWidget(_app(
          const GroupHubScreen(groupId: _gid),
          _member(extra: [
            groupFeedProvider.overrideWith((ref, id) => _denied()),
          ])));
      await _settle(tester);
      _expectLoadFailed(tester, 'feedUnavailable');
    });

    testWidgets('tab Feed: feed grup BENAR-BENAR kosong -> tiada ralat',
        (tester) async {
      await tester.pumpWidget(
          _app(const GroupHubScreen(groupId: _gid), _member()));
      await _settle(tester);
      expect(tester.takeException(), isNull);
      expect(find.text(_t(tester, 'feedUnavailable')), findsNothing,
          reason: 'kosong yang berjaya bukan ralat');
    });

    testWidgets('tab Undian: undian DITOLAK -> ralat, bukan "tiada undian"',
        (tester) async {
      await tester.pumpWidget(_app(
          const GroupHubScreen(groupId: _gid),
          _member(extra: [
            groupPollsProvider.overrideWith((ref, id) => _denied()),
            // statistik pantas juga membaca undian; pastikan ia tidak
            // menyembunyikan kegagalan tab.
          ])));
      await _settle(tester);
      await tester.tap(find.widgetWithText(Tab, _t(tester, 'groupTabPolls')));
      await _settle(tester);
      _expectLoadFailed(tester, 'sectionLoadFailed');
    });

    testWidgets(
        'tab Ahli: ahli DITOLAK -> mesej bahagian, BUKAN "Profile tak dapat '
        'dibuka"', (tester) async {
      await tester.pumpWidget(_app(
          const GroupHubScreen(groupId: _gid),
          _member(extra: [
            groupMembersProvider.overrideWith((ref, id) => _denied()),
          ])));
      await _settle(tester);
      await tester.tap(find.widgetWithText(Tab, _t(tester, 'groupTabMembers')));
      await _settle(tester);
      _expectLoadFailed(tester, 'sectionLoadFailed');
      expect(find.text(_t(tester, 'profileError')), findsNothing,
          reason: 'kegagalan senarai ahli bukan kegagalan profil');
    });

    testWidgets('jalur status grup DITOLAK -> jalur disembunyikan, tiada ralat',
        (tester) async {
      // Diuji BERSENDIRIAN. Dalam hub, jalur ini ialah anak bersaiz sifar
      // dalam senarai sliver dan ujian berasaskan hub lulus walaupun pada kod
      // lama - ia vakum. Bersendirian, kod lama melontar permission-denied.
      await tester.pumpWidget(_app(
          const Scaffold(body: GroupStatusStrip(groupId: _gid)), [
        firebaseReadyProvider.overrideWithValue(true),
        groupStatusProvider.overrideWith((ref, id) => _denied()),
      ]));
      await _settle(tester);
      expect(tester.takeException(), isNull,
          reason: 'jalur hiasan tidak boleh meruntuhkan tab Feed grup');
      expect(find.byType(GroupStatusStrip, skipOffstage: false),
          findsOneWidget);
    });
  });

  group('Tetapan grup', () {
    testWidgets(
        'dokumen grup DITOLAK -> ralat, dan TIADA borang kosong yang boleh '
        'disimpan menulis ganti nama grup', (tester) async {
      await tester.pumpWidget(_app(const GroupSettingsScreen(groupId: _gid), [
        firebaseReadyProvider.overrideWithValue(true),
        groupProvider.overrideWith((ref, id) => _denied()),
        myGroupRoleProvider.overrideWith((ref, id) => Stream.value('owner')),
        groupMembersProvider.overrideWith((ref, id) => Stream.value(const [])),
      ]));
      await _settle(tester);
      _expectLoadFailed(tester, 'sectionLoadFailed');
      expect(find.byType(TextField), findsNothing,
          reason: 'borang kosong + Simpan = nama grup dipadam');
    });
  });

  // -------------------------------------------------------------------- DM
  group('DM', () {
    testWidgets(
        'inbox DITOLAK -> "Gagal memuat mesej" + Cuba Lagi (pembaikan '
        'fbb6046 yang tidak pernah berfungsi)', (tester) async {
      await tester.pumpWidget(_app(const DmInboxScreen(), [
        firebaseReadyProvider.overrideWithValue(true),
        myDmThreadsProvider.overrideWith((ref) => _denied()),
      ]));
      await _settle(tester);
      _expectLoadFailed(tester, 'dmLoadError');
    });

    testWidgets('inbox BENAR-BENAR kosong -> bukan ralat', (tester) async {
      await tester.pumpWidget(_app(const DmInboxScreen(), [
        firebaseReadyProvider.overrideWithValue(true),
        myDmThreadsProvider.overrideWith((ref) => Stream.value(const [])),
      ]));
      await _settle(tester);
      expect(tester.takeException(), isNull);
      expect(find.text(_t(tester, 'dmLoadError')), findsNothing);
    });

    testWidgets('perbualan: mesej DITOLAK -> ralat, bukan "tiada mesej"',
        (tester) async {
      await tester.pumpWidget(_app(const DmConversationScreen(otherUid: 'u-b'), [
        firebaseReadyProvider.overrideWithValue(true),
        dmMessagesProvider.overrideWith((ref, id) => _denied()),
        dmThreadProvider.overrideWith((ref, id) => Stream.value(null)),
        publicProfileProvider.overrideWith((ref, id) => _pending()),
        myBlockedIdsProvider.overrideWith((ref) => Stream.value(const {})),
      ]));
      await _settle(tester);
      _expectLoadFailed(tester, 'dmLoadError');
    });

    testWidgets('perbualan: profil & senarai blok DITOLAK -> tetap dibina',
        (tester) async {
      await tester.pumpWidget(_app(const DmConversationScreen(otherUid: 'u-b'), [
        firebaseReadyProvider.overrideWithValue(true),
        dmMessagesProvider.overrideWith((ref, id) => Stream.value(const [])),
        dmThreadProvider.overrideWith((ref, id) => Stream.value(null)),
        publicProfileProvider.overrideWith((ref, id) => _denied()),
        myBlockedIdsProvider.overrideWith((ref) => _denied()),
      ]));
      await _settle(tester);
      expect(tester.takeException(), isNull);
    });
  });

  // ---------------------------------------------------------------- WALLET
  group('Meal Wallet', () {
    testWidgets('perbelanjaan DITOLAK -> ralat, bukan "RM0 dibelanjakan"',
        (tester) async {
      await tester.pumpWidget(_app(const MealWalletScreen(), [
        firebaseReadyProvider.overrideWithValue(true),
        walletAccessProvider.overrideWithValue(WalletAccess.pro),
        monthExpensesProvider.overrideWith((ref) => _denied()),
        budgetProfileProvider
            .overrideWith((ref) => Stream.value(const BudgetProfile())),
      ]));
      await _settle(tester);
      _expectLoadFailed(tester, 'sectionLoadFailed');
    });

    testWidgets(
        'penyunting bajet: bacaan DITOLAK -> ralat, TIADA medan disemai '
        'dengan nilai lalai', (tester) async {
      await tester.pumpWidget(_app(const BudgetSettingsScreen(), [
        firebaseReadyProvider.overrideWithValue(true),
        walletAccessProvider.overrideWithValue(WalletAccess.pro),
        budgetProfileProvider.overrideWith((ref) => _denied()),
      ]));
      await _settle(tester);
      _expectLoadFailed(tester, 'sectionLoadFailed');
      expect(find.byType(TextField), findsNothing,
          reason: 'lalai + Simpan = bajet sebenar ditulis ganti');
    });

    testWidgets(
        'penyunting bajet: nilai SEBENAR tiba selepas memuatkan -> medan '
        'menunjukkan nilai itu, bukan lalai', (tester) async {
      final ctl = StreamController<BudgetProfile>();
      addTearDown(ctl.close);
      await tester.pumpWidget(_app(const BudgetSettingsScreen(), [
        firebaseReadyProvider.overrideWithValue(true),
        walletAccessProvider.overrideWithValue(WalletAccess.pro),
        budgetProfileProvider.overrideWith((ref) => ctl.stream),
      ]));
      await tester.pump();
      ctl.add(const BudgetProfile(dailyBudget: 47));
      await _settle(tester);
      expect(tester.takeException(), isNull);
      expect(find.widgetWithText(TextField, '47'), findsOneWidget,
          reason: 'bingkai memuatkan tidak boleh mengunci nilai lalai');
    });
  });

  // -------------------------------------------------------------- TAXONOMY
  group('Sheet taxonomy', () {
    Widget opener() => Consumer(
          builder: (context, ref, _) => Scaffold(
            body: TextButton(
              onPressed: () => showTaxonomySheet(context, ref,
                  type: TaxonomyType.cuisine, title: 'Masakan'),
              child: const Text('buka'),
            ),
          ),
        );

    testWidgets(
        'pilihan DITOLAK -> ralat, bukan senarai kosong yang Simpan akan '
        'tulis ganti', (tester) async {
      await tester.pumpWidget(_app(opener(), [
        firebaseReadyProvider.overrideWithValue(true),
        userTaxonomyProvider.overrideWith((ref, type) => _denied()),
        userPlanProvider.overrideWith((ref) => Stream.value('free')),
      ]));
      await _settle(tester); // delegasi lokalisasi dimuat secara async
      await tester.tap(find.text('buka'));
      await _settle(tester);
      _expectLoadFailed(tester, 'sectionLoadFailed');
    });

    testWidgets('pilihan MEMUATKAN -> tidak dimulakan kosong', (tester) async {
      await tester.pumpWidget(_app(opener(), [
        firebaseReadyProvider.overrideWithValue(true),
        userTaxonomyProvider.overrideWith((ref, type) => _pending()),
        userPlanProvider.overrideWith((ref) => Stream.value('free')),
      ]));
      await _settle(tester); // delegasi lokalisasi dimuat secara async
      await tester.tap(find.text('buka'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(tester.takeException(), isNull);
      expect(find.byType(CircularProgressIndicator), findsOneWidget,
          reason: 'memuatkan mesti kelihatan sebagai memuatkan');
    });
  });

  // ------------------------------------------------------------------- FIT
  group('Fit (laluan Pro)', () {
    List<Override> pro(List<Override> extra) => [
          fitAccessProvider.overrideWithValue(FitAccess.full),
          fitProfileProvider.overrideWith((ref) => Stream.value(_profile)),
          nearbyPlacesProvider.overrideWith((ref) async => const []),
          ...extra,
        ];

    testWidgets(
        'Monitor: metrik mingguan DITOLAK -> ralat, bukan carta kosong '
        '(laluan Pro tidak boleh memalsukan data)', (tester) async {
      await tester.pumpWidget(_app(
          const FitMonitorScreen(),
          pro([
            weeklyMetricsProvider.overrideWith((ref) async =>
                throw Exception('permission-denied')),
          ])));
      await _settle(tester);
      _expectLoadFailed(tester, 'sectionLoadFailed');
    });

    testWidgets('Today: metrik hari ini DITOLAK -> ralat, bukan sifar',
        (tester) async {
      await tester.pumpWidget(_app(
          const FitTodayScreen(),
          pro([
            todayMetricsProvider.overrideWith((ref) => _denied()),
          ])));
      await _settle(tester);
      _expectLoadFailed(tester, 'sectionLoadFailed');
    });
  });

  // --------------------------------------------------- HIASAN / GAGAL-TUTUP
  group('Skrin tetap dibina apabila bacaan hiasan ditolak', () {
    testWidgets('Tetapan: dokumen pengguna DITOLAK', (tester) async {
      // Skrin Tetapan DAHULU mencetuskan penegasan mod-debug "ListTile
      // background color or ink splashes may be invisible" (6x) walaupun
      // dokumen pengguna BERJAYA dibaca. Itu kini dibaiki (lihat
      // ux_defects_test.dart), jadi ujian ini menuntut SIFAR ralat - bukan
      // lagi "hanya penegasan ListTile yang dibenarkan".
      final errors = <FlutterErrorDetails>[];
      final previous = FlutterError.onError;
      FlutterError.onError = errors.add;
      try {
        await tester.pumpWidget(_app(const SettingsScreen(), [
          firebaseReadyProvider.overrideWithValue(true),
          myUserDocProvider.overrideWith((ref) => _denied()),
        ]));
        await _settle(tester);
      } finally {
        FlutterError.onError = previous;
      }
      final fromDeniedRead = errors
          .where((e) => e.exceptionAsString().contains('permission-denied'));
      expect(fromDeniedRead, isEmpty,
          reason: 'bacaan dokumen pengguna yang ditolak meruntuhkan Tetapan');
      expect(errors, isEmpty,
          reason: 'Tetapan mesti bersih daripada sebarang ralat build');
    });

    testWidgets('Kupon: dokumen pengguna DITOLAK', (tester) async {
      await tester.pumpWidget(_app(const CouponScreen(), [
        firebaseReadyProvider.overrideWithValue(true),
        myUserDocProvider.overrideWith((ref) => _denied()),
      ]));
      await _settle(tester);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Pro hub: pelan DITOLAK -> dibina, dan gagal-TERTUTUP',
        (tester) async {
      await tester.pumpWidget(_app(const ProHubScreen(), [
        firebaseReadyProvider.overrideWithValue(true),
        userPlanProvider.overrideWith((ref) => _denied()),
      ]));
      await _settle(tester);
      expect(tester.takeException(), isNull);
    });
  });

  group('currentUidProvider (Provider segerak, dibaca di merata tempat)', () {
    test('strim auth RALAT -> "" (log keluar), tidak melontar', () async {
      final c = ProviderContainer(overrides: [
        firebaseReadyProvider.overrideWithValue(true),
        authStateChangesProvider.overrideWith((ref) => _denied()),
      ]);
      addTearDown(c.dispose);
      await expectLater(
          c.read(authStateChangesProvider.future), throwsA(anything));
      expect(() => c.read(currentUidProvider), returnsNormally);
      expect(c.read(currentUidProvider), '');
    });
  });
}
