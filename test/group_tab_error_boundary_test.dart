// Tab Grup — bacaan yang GAGAL mesti menjadi keadaan ralat yang boleh dibaca,
// bukan kotak kelabu senyap.
//
// Punca yang disiasat pada app produksi: bacaan `feed_posts` yang ditolak di
// dalam tab Grup dilontar sebagai pengecualian TIDAK DITANGKAP semasa build.
// Flutter keluaran melukis RenderErrorBox — segi empat kelabu polos
// (#C4C4C4) tanpa mesej — dan `main.dart` menghalakan FlutterError.onError ke
// Crashlytics apabila !kDebugMode, jadi tiada apa-apa muncul dalam logcat.
//
// Mekanismenya bukan penjaga yang hilang; ia penjaga PALSU. Dalam Riverpod
// 2.6.1 (`common.dart:493`) `AsyncError.value` MELONTAR:
//
//   T? get value {
//     if (!hasValue) { throwErrorWithCombinedStackTrace(error, stackTrace); }
//     return _value;
//   }
//
// jadi idiom `ref.watch(p).value ?? const []` yang kelihatan defensif
// sebenarnya melontar semula ralat. `valueOrNull` ialah yang selamat.
//
// Ujian ini mengunci tiga perkara:
//   1. groupQuickStatsProvider tidak melontar apabila bacaan asasnya gagal.
//   2. Ia tidak memalsukan data: statistik ditanda TIDAK TERSEDIA, bukan sifar.
//   3. Senarai grup UTAMA yang gagal menghasilkan mesej + Cuba Lagi yang
//      berfungsi — bukan senarai kosong palsu.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/features/dm/dm_service.dart';
import 'package:makan_mana/features/groups/group_activity.dart';
import 'package:makan_mana/features/groups/group_providers.dart';
import 'package:makan_mana/features/social/feed_screen.dart';
import 'package:makan_mana/features/social/food_profile.dart';
import 'package:makan_mana/features/social/social_providers.dart';

/// Strim yang gagal serta-merta, seperti bacaan Firestore yang ditolak.
Stream<T> _denied<T>() =>
    Stream<T>.error(Exception('permission-denied'), StackTrace.current);

/// Strim yang tidak pernah selesai — keadaan "masih memuatkan".
Stream<T> _pending<T>() => Stream<T>.fromFuture(Completer<T>().future);

ProviderContainer _container(List<Override> overrides) {
  final c = ProviderContainer(overrides: overrides);
  addTearDown(c.dispose);
  return c;
}

Widget _app(List<Override> overrides) => ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('ms'),
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: const FeedScreen(initialTab: 4),
      ),
    );

/// Override minimum supaya FeedScreen boleh dibina tanpa Firebase.
List<Override> _screen({
  required Stream<Set<String>> myGroupIds,
}) =>
    [
      firebaseReadyProvider.overrideWithValue(true),
      dmTotalUnreadProvider.overrideWith((ref) => 0),
      myBlockedIdsProvider.overrideWith((ref) => Stream.value(const <String>{})),
      myMutedIdsProvider.overrideWith((ref) => Stream.value(const <String>{})),
      publicFeedProvider.overrideWith((ref) => Stream.value(const [])),
      myGroupIdsProvider.overrideWith((ref) => myGroupIds),
      myGroupInvitesProvider.overrideWith((ref) => Stream.value(const [])),
    ];

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 16));
}

void main() {
  group('statistik grup tidak melontar apabila bacaan asas ditolak', () {
    test('groupQuickStatsProvider selamat apabila feed grup ditolak',
        () async {
      final c = _container([
        firebaseReadyProvider.overrideWithValue(true),
        groupPollsProvider.overrideWith((ref, id) => Stream.value(const [])),
        groupBillsProvider.overrideWith((ref, id) => Stream.value(const [])),
        groupFeedProvider.overrideWith((ref, id) => _denied()),
      ]);
      // Tunggu strim benar-benar GAGAL. Membaca semasa loading adalah vakum:
      // AsyncLoading.value memulangkan null tanpa melontar.
      await expectLater(
          c.read(groupFeedProvider('g1').future), throwsA(anything));
      // SEBELUM PEMBAIKAN: `.value` melontar, jadi baris ini melontar.
      expect(() => c.read(groupQuickStatsProvider('g1')), returnsNormally);
    });

    test('statistik yang gagal ditanda TIDAK TERSEDIA, bukan sifar palsu',
        () async {
      final c = _container([
        firebaseReadyProvider.overrideWithValue(true),
        groupPollsProvider.overrideWith((ref, id) => _denied()),
        groupBillsProvider.overrideWith((ref, id) => _denied()),
        groupFeedProvider.overrideWith((ref, id) => _denied()),
      ]);
      for (final f in [
        c.read(groupPollsProvider('g1').future),
        c.read(groupBillsProvider('g1').future),
        c.read(groupFeedProvider('g1').future),
      ]) {
        await expectLater(f, throwsA(anything));
      }
      final stats = c.read(groupQuickStatsProvider('g1'));
      expect(stats.unavailable, isTrue,
          reason: 'bacaan gagal bukan jawapan "tiada aktiviti"');
    });

    test('bacaan berjaya yang benar-benar kosong TIDAK ditanda tidak tersedia',
        () async {
      final c = _container([
        firebaseReadyProvider.overrideWithValue(true),
        groupPollsProvider.overrideWith((ref, id) => Stream.value(const [])),
        groupBillsProvider.overrideWith((ref, id) => Stream.value(const [])),
        groupFeedProvider.overrideWith((ref, id) => Stream.value(const [])),
      ]);
      for (final f in [
        c.read(groupPollsProvider('g1').future),
        c.read(groupBillsProvider('g1').future),
        c.read(groupFeedProvider('g1').future),
      ]) {
        await f;
      }
      final stats = c.read(groupQuickStatsProvider('g1'));
      expect(stats.unavailable, isFalse);
      expect(stats.activePollCount, 0);
    });
  });

  group('tab Grup memisahkan RALAT daripada KOSONG', () {
    testWidgets('senarai grup yang gagal menunjukkan mesej boleh difahami',
        (tester) async {
      await tester.pumpWidget(_app(_screen(myGroupIds: _denied())));
      await _settle(tester);

      final l =
          AppLocalizations.of(tester.element(find.byType(FeedScreen)));
      expect(find.textContaining(l.t('groupsUnavailable')), findsOneWidget,
          reason: 'pengguna mesti diberitahu senarai grup gagal dimuatkan');
    });

    testWidgets('senarai grup yang gagal menawarkan Cuba Lagi',
        (tester) async {
      await tester.pumpWidget(_app(_screen(myGroupIds: _denied())));
      await _settle(tester);

      final l =
          AppLocalizations.of(tester.element(find.byType(FeedScreen)));
      expect(find.widgetWithText(TextButton, l.t('retryAction')), findsOneWidget,
          reason: 'keadaan ralat tanpa jalan keluar meninggalkan pengguna buntu');
    });

    testWidgets('senarai grup yang gagal TIDAK berpura-pura kosong',
        (tester) async {
      await tester.pumpWidget(_app(_screen(myGroupIds: _denied())));
      await _settle(tester);

      final l =
          AppLocalizations.of(tester.element(find.byType(FeedScreen)));
      expect(find.textContaining(l.t('noJoinedGroups')), findsNothing,
          reason: 'bacaan gagal bukan jawapan "anda tiada grup"');
    });

    testWidgets('senarai grup yang benar-benar kosong kekal menunjukkan kosong',
        (tester) async {
      await tester
          .pumpWidget(_app(_screen(myGroupIds: Stream.value(const <String>{}))));
      await _settle(tester);

      final l =
          AppLocalizations.of(tester.element(find.byType(FeedScreen)));
      expect(find.textContaining(l.t('groupsUnavailable')), findsNothing,
          reason: 'kosong yang berjaya bukan ralat');
    });

    testWidgets('senarai grup yang masih memuatkan tidak menunjukkan ralat',
        (tester) async {
      await tester.pumpWidget(_app(_screen(myGroupIds: _pending())));
      await tester.pump();

      final l =
          AppLocalizations.of(tester.element(find.byType(FeedScreen)));
      expect(find.textContaining(l.t('groupsUnavailable')), findsNothing);
    });
  });
}
