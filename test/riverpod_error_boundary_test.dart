// Laluan kritikal-pelancaran: bacaan yang GAGAL tidak boleh meruntuhkan skrin,
// dan tidak boleh menyamar sebagai jawapan kosong.
//
// Mekanisme yang sama seperti tab Grup. Dalam riverpod 2.6.1
// (`common.dart:493`) `AsyncError.value` MELONTAR:
//
//   T? get value {
//     if (!hasValue) { throwErrorWithCombinedStackTrace(error, stackTrace); }
//     return _value;
//   }
//
// Jadi `ref.watch(p).value ?? fallback` TIDAK PERNAH mencapai fallback pada
// ralat - ia melontar, dan Flutter keluaran melukis kotak kelabu senyap.
// `valueOrNull` ialah bentuk yang tidak melontar.
//
// Setiap kes di bawah menguji EMPAT keadaan secara berasingan: memuatkan,
// berjaya, kosong-sebenar, dan gagal.
import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/core/entitlement/entitlement.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/features/dm/dm_service.dart';
import 'package:makan_mana/repositories/auth_repository.dart';
import 'package:makan_mana/features/social/food_profile.dart';
import 'package:makan_mana/features/social/social_providers.dart';

Stream<T> _denied<T>() =>
    Stream<T>.error(Exception('permission-denied'), StackTrace.current);
Stream<T> _pending<T>() => Stream<T>.fromFuture(Completer<T>().future);

/// AuthRepository palsu: penyedia di bawah membaca `currentUser`, dan tanpa
/// ini ujian gagal dengan `core/no-app` - kegagalan yang TIDAK ada kaitan
/// dengan pembaikan, jadi ia tidak akan membuktikan apa-apa.
class _FakeUser implements User {
  @override
  String get uid => 'uid-saya';
  @override
  dynamic noSuchMethod(Invocation i) => null;
}

class _FakeAuth extends AuthRepository {
  _FakeAuth() : super(firebaseReady: false);
  @override
  User? get currentUser => _FakeUser();
}

ProviderContainer _c(List<Override> o) {
  final c = ProviderContainer(overrides: o);
  addTearDown(c.dispose);
  return c;
}

List<Override> _base(Stream<Set<String>> following) => [
      firebaseReadyProvider.overrideWithValue(true),
      myFollowingIdsProvider.overrideWith((ref) => following),
    ];

void main() {
  group('followingFeedProvider membezakan keempat-empat keadaan', () {
    test('GAGAL -> ralat, bukan "tidak mengikut sesiapa"', () async {
      final c = _c(_base(_denied()));
      await expectLater(
          c.read(myFollowingIdsProvider.future), throwsA(anything));
      await expectLater(
        c.read(followingFeedProvider.future),
        throwsA(predicate<Object>(
            (e) => e.toString().toLowerCase().contains('unavailable'),
            'kegagalan "unavailable"')),
      );
    });

    test('MEMUATKAN -> kekal memuatkan, bukan kosong', () async {
      final c = _c(_base(_pending()));
      // Beri masa kepada gelung peristiwa; penyedia mesti TIDAK selesai
      // dengan senarai kosong.
      final state = c.read(followingFeedProvider);
      expect(state.isLoading, isTrue);
      expect(state.valueOrNull, isNull,
          reason: 'loading bukan jawapan "tiada siaran"');
    });

    test('KOSONG SEBENAR (tidak mengikut sesiapa) -> senarai kosong', () async {
      final c = _c(_base(Stream.value(const <String>{})));
      await c.read(myFollowingIdsProvider.future);
      await expectLater(
          c.read(followingFeedProvider.future), completion(isEmpty));
    });
  });

  group('penyedia kritikal tidak melontar apabila bacaan ditolak', () {
    // Corak yang dibaiki: setiap satu dahulu memakai `.value ??`, yang melontar.
    test('myBlockedIdsProvider yang ditolak boleh dibaca dengan valueOrNull',
        () async {
      final c = _c([
        firebaseReadyProvider.overrideWithValue(true),
        myBlockedIdsProvider.overrideWith((ref) => _denied()),
      ]);
      await expectLater(
          c.read(myBlockedIdsProvider.future), throwsA(anything));
      // Bentuk yang digunakan pada laluan kritikal selepas pembaikan.
      expect(() => c.read(myBlockedIdsProvider).valueOrNull ?? const {},
          returnsNormally);
      // Bentuk lama, untuk menunjukkan ia MEMANG melontar.
      expect(() => c.read(myBlockedIdsProvider).value ?? const {},
          throwsA(anything),
          reason: 'inilah sebab kotak kelabu muncul');
    });

    test('myMutedIdsProvider yang ditolak: sama', () async {
      final c = _c([
        firebaseReadyProvider.overrideWithValue(true),
        myMutedIdsProvider.overrideWith((ref) => _denied()),
      ]);
      await expectLater(c.read(myMutedIdsProvider.future), throwsA(anything));
      expect(() => c.read(myMutedIdsProvider).valueOrNull ?? const {},
          returnsNormally);
    });
  });

  group('sumber yang dibaiki masih melaporkan kejayaan dengan betul', () {
    test('bacaan berjaya memulangkan datanya', () async {
      final c = _c([
        firebaseReadyProvider.overrideWithValue(true),
        myBlockedIdsProvider
            .overrideWith((ref) => Stream.value(const {'uid-a'})),
      ]);
      expect(await c.read(myBlockedIdsProvider.future), {'uid-a'});
    });
  });

// ---------------------------------------------------------------------------
// Tapak yang didedahkan oleh audit penuh: `Provider` SEGERAK.
//
// Dibuktikan secara eksperimen dalam sesi ini:
//   * `Provider` segerak yang badannya melontar -> MELONTAR pada setiap
//     pembaca. Tiada pembaca boleh menangkapnya. Dibaca dalam build =
//     kotak kelabu.
//   * `FutureProvider`/`StreamProvider` -> riverpod mengurungnya jadi
//     AsyncError. Terkurung, bukan runtuh.
//
// `entitlementProvider` ialah yang paling luas: Home, Sejarah, Fit, Pro,
// paywall, pemilih tema dan shell semuanya membacanya.

  group('entitlementProvider bertahan apabila bacaan pelan ditolak', () {
    test('tidak melontar, dan jatuh balik kepada pelan konteks', () async {
      final c = ProviderContainer(overrides: [
        firebaseReadyProvider.overrideWithValue(true),
        userPlanProvider.overrideWith(
            (ref) => Stream<String>.error(Exception('permission-denied'))),
      ]);
      addTearDown(c.dispose);
      await expectLater(c.read(userPlanProvider.future), throwsA(anything));

      // SEBELUM PEMBAIKAN baris ini melontar, dan kerana Home membacanya
      // dalam build (home_screen.dart:833) Home menjadi kotak kelabu.
      late final Entitlement ent;
      expect(() => ent = c.read(entitlementProvider), returnsNormally);
      // Gagal-tertutup: bacaan pelan yang ditolak TIDAK memberi akses Pro.
      expect(ent.isPro, isFalse);
      expect(ent.isPlusOrAbove, isFalse);
    });

    test('bacaan pelan yang BERJAYA masih memberi kelayakan betul', () async {
      final c = ProviderContainer(overrides: [
        firebaseReadyProvider.overrideWithValue(true),
        userPlanProvider.overrideWith((ref) => Stream.value('pro')),
      ]);
      addTearDown(c.dispose);
      await c.read(userPlanProvider.future);
      expect(c.read(entitlementProvider).isPro, isTrue);
    });
  });

  group('lencana DM tidak meruntuhkan AppBar Feed Makan', () {
    test('dmTotalUnreadProvider selamat apabila thread DM ditolak', () async {
      final c = ProviderContainer(overrides: [
        firebaseReadyProvider.overrideWithValue(true),
        authRepositoryProvider.overrideWithValue(_FakeAuth()),
        myDmThreadsProvider.overrideWith((ref) =>
            Stream<List<(String, Map<String, dynamic>)>>.error(
                Exception('permission-denied'))),
      ]);
      addTearDown(c.dispose);
      await expectLater(c.read(myDmThreadsProvider.future), throwsA(anything));
      // feed_screen.dart:67 membacanya di dalam Consumer pada AppBar.
      expect(() => c.read(dmTotalUnreadProvider), returnsNormally);
      expect(c.read(dmTotalUnreadProvider), 0,
          reason: 'tiada kiraan = tiada lencana, bukan runtuh');
    });
  });
}
