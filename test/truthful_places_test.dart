import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/core/services/dummy_suggestion_service.dart';
import 'package:makan_mana/core/utils/real_place.dart';
import 'package:makan_mana/models/place_summary.dart';
import 'package:makan_mana/models/places_outcome.dart';

/// WAVE 4A — restoran REKAAN dibuang daripada pengalaman produksi
/// (kelulusan pemilik).
///
/// Audit Wave 3F mendapati 14 tapak memaparkan sepuluh restoran rekaan kepada
/// pengguna sebenar apabila Places gagal, kunci hilang, atau kawasan kosong —
/// dan hanya 2 daripadanya dilabel. Ujian ini mengunci kelakuan baharu.
void main() {
  PlaceSummary place(String id, {String? source}) => PlaceSummary(
        placeId: id,
        name: 'Tempat $id',
        cuisine: 'Melayu',
        emoji: '🍛',
        rating: 4.2,
        userRatingCount: 12,
        priceLevel: 1,
        distanceKm: 0.4,
        isOpen: true,
        address: 'Alamat',
        matchScore: 50,
        matchReasonKeys: const [],
        priceEstimate: 'RM5 - RM10',
        source: source,
      );

  group('identiti tempat', () {
    test('ID rekaan dan sintetik bukan tempat sebenar', () {
      expect(isRealPlaceId('ChIJ_sebenar'), isTrue);
      expect(isRealPlaceId('dummy_nasi_lemak_bonda'), isFalse);
      expect(isRealPlaceId('qa_synthetic_01'), isFalse);
      expect(isRealPlaceId(null), isFalse);
      expect(isRealPlaceId(''), isFalse);
    });

    test('SETIAP contoh terbina dalam dikenal pasti bukan-sebenar', () {
      for (final p in DummySuggestionService.places) {
        expect(isRealPlaceId(p.placeId), isFalse, reason: p.placeId);
      }
    });

    test('tempat sampel tidak boleh dinavigasi walaupun ID kelihatan sebenar', () {
      expect(isNavigablePlace(place('ChIJ_sebenar')), isTrue);
      expect(
          isNavigablePlace(place('ChIJ_sebenar', source: 'demo_preview')), isFalse);
      expect(
          isNavigablePlace(place('ChIJ_sebenar', source: 'offline_fallback')),
          isFalse);
      expect(isNavigablePlace(place('dummy_x')), isFalse);
      expect(isLearningEligiblePlace(place('qa_synthetic_01')), isFalse);
    });
  });

  group('label sampel', () {
    test('sintetik QA dan dummy pelayan kini DILABEL sampel', () {
      expect(place('qa_synthetic_01', source: 'qa_synthetic').isSample, isTrue);
      expect(place('dummy_x', source: 'dummy').isSample, isTrue);
      expect(place('ChIJ_a', source: 'google_places').isSample, isFalse);
    });

    test('setiap contoh yang keluar daripada perkhidmatan demo dilabel', () {
      final demo = DummySuggestionService();
      expect(demo.heroPick().isSample, isTrue);
      expect(demo.randomPick().isSample, isTrue);
      expect(demo.nearby(limit: 12).every((p) => p.isSample), isTrue);
      expect(demo.byId('dummy_nasi_lemak_bonda')!.isSample, isTrue);
      expect(demo.byId('tiada-id-ini'), isNull);
    });
  });

  group('hasil tempat jujur', () {
    test('OK membawa tempat', () {
      final o = PlacesOutcome.fromMap({
        'status': 'OK',
        'places': [
          {'placeId': 'ChIJ_a', 'name': 'A'},
        ],
      });
      expect(o.hasPlaces, isTrue);
      expect(o.isEmptyArea, isFalse);
      expect(o.isUnavailable, isFalse);
    });

    test('OK_EMPTY ialah kawasan kosong, BUKAN gangguan', () {
      final o = PlacesOutcome.fromMap({'status': 'OK_EMPTY', 'places': []});
      expect(o.isEmptyArea, isTrue);
      expect(o.isUnavailable, isFalse);
      expect(o.places, isEmpty);
    });

    test('PLACES_UNAVAILABLE membawa sebab dan kebolehcubaan', () {
      final retryable = PlacesOutcome.fromMap({
        'status': 'PLACES_UNAVAILABLE',
        'places': [],
        'retryable': true,
        'reason': 'provider_error',
      });
      expect(retryable.isUnavailable, isTrue);
      expect(retryable.retryable, isTrue);
      expect(retryable.reason, PlacesUnavailableReason.providerError);

      final misconfigured = PlacesOutcome.fromMap({
        'status': 'PLACES_UNAVAILABLE',
        'places': [],
        'retryable': false,
        'reason': 'not_configured',
      });
      expect(misconfigured.retryable, isFalse);
      expect(misconfigured.reason, PlacesUnavailableReason.notConfigured);
    });

    test('muatan pelayan lama (tiada status) kekal berfungsi', () {
      final withPlaces = PlacesOutcome.fromMap({
        'places': [
          {'placeId': 'ChIJ_a', 'name': 'A'},
        ],
      });
      expect(withPlaces.hasPlaces, isTrue);
      final empty = PlacesOutcome.fromMap({'places': []});
      expect(empty.isEmptyArea, isTrue);
      expect(empty.isUnavailable, isFalse);
    });

    test('TIADA hasil pernah menghasilkan tempat apabila kosong', () {
      for (final o in [
        const PlacesOutcome.emptyArea(),
        const PlacesOutcome.unavailable(
            reason: PlacesUnavailableReason.network),
      ]) {
        expect(o.places, isEmpty);
        expect(o.hasPlaces, isFalse);
      }
    });
  });

  group('pendawaian sumber — 7 tapak klien daripada audit Wave 3F', () {
    String read(String path) => File(path).readAsStringSync();

    test('tiada laluan produksi jatuh ke contoh demo', () {
      // Hanya mod demo eksplisit (!firebaseReady) dan skrin Explore demo
      // dibenarkan menyentuh perkhidmatan contoh.
      final allowed = {
        'lib/core/providers.dart', // takrif penyedia sahaja
        'lib/features/explore/explore_screen.dart',
        'lib/features/suggestions/suggestion_repository.dart',
        'lib/features/restaurant/restaurant_detail_screen.dart',
      };
      final offenders = <String>[];
      for (final entity in Directory('lib')
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))) {
        final path = entity.path.replaceAll(r'\', '/');
        if (path.endsWith('dummy_suggestion_service.dart')) continue;
        if (!read(entity.path).contains('dummySuggestionServiceProvider')) {
          continue;
        }
        if (!allowed.contains(path)) offenders.add(path);
      }
      expect(offenders, isEmpty,
          reason: 'laluan produksi masih menggunakan contoh: $offenders');
    });

    test('Home, Spin dan skrin cadangan tidak merujuk contoh langsung', () {
      for (final path in const [
        'lib/features/home/home_screen.dart',
        'lib/features/suggestions/spin_controller.dart',
        'lib/features/suggestions/suggestion_screen.dart',
      ]) {
        expect(read(path).contains('dummySuggestionServiceProvider'), isFalse,
            reason: '$path masih jatuh ke restoran rekaan');
      }
    });

    test('buka-peta disekat untuk tempat bukan-sebenar', () {
      final src = read('lib/core/utils/place_actions.dart');
      expect(src.contains('isNavigablePlace(place)'), isTrue);
      // Pagar mesti mendahului kedua-dua log event dan launchUrl.
      final guard = src.indexOf('isNavigablePlace(place)');
      expect(guard, greaterThan(0));
      expect(guard, lessThan(src.indexOf('logEvent(')));
      expect(guard, lessThan(src.indexOf('launchUrl(')));
      // Tiada lagi laluan carian khas untuk ID rekaan.
      expect(src.contains("startsWith('dummy_')"), isFalse);
    });

    test('pembalak event melangkau tempat bukan-sebenar sebelum menulis', () {
      final src = read('lib/core/services/event_logger.dart');
      final guard = src.indexOf('!isRealPlaceId(placeId)');
      expect(guard, greaterThan(0));
      expect(guard, lessThan(src.indexOf('eventRepositoryProvider')));
    });

    test('mod demo restoran hanya apabila Firebase tiada', () {
      final src = read('lib/features/restaurant/restaurant_detail_screen.dart');
      expect(src.contains('final demoMode = !ref.watch(firebaseReadyProvider)'),
          isTrue);
      final demo = src.indexOf('demoMode');
      final lookup = src.indexOf('dummySuggestionServiceProvider');
      expect(demo, lessThan(lookup));
    });
  });
}
