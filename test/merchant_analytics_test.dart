import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/merchant/merchant_analytics_models.dart';
import 'package:makan_mana/features/merchant/merchant_error_mapper.dart';

/// WAVE 6 — analitik peniaga di sisi klien.
///
/// Dua perkara diuji di sini kerana kedua-duanya boleh gagal secara senyap:
/// nombor yang menipu (0 yang sepatutnya "tidak dijejaki"), dan kod teknikal
/// yang terlepas ke skrin pengguna.
void main() {
  group('MerchantErrorMapper — kod teknikal tidak boleh naik ke skrin', () {
    test('1. kod gRPC yang pernah bocor kini jadi ayat biasa', () {
      // Ini DUA kod sebenar yang dilihat pada telefon semasa kuota CPU projek
      // habis selepas satu deploy besar.
      final unavailable = MerchantErrorMapper.message(
        FirebaseFunctionsException(code: 'unavailable', message: 'UNAVAILABLE'),
      );
      final exhausted = MerchantErrorMapper.message(
        FirebaseFunctionsException(
            code: 'resource-exhausted', message: 'RESOURCE_EXHAUSTED'),
      );

      for (final message in [unavailable, exhausted]) {
        expect(message.toUpperCase(), isNot(contains('UNAVAILABLE')));
        expect(message.toUpperCase(), isNot(contains('RESOURCE')));
        expect(message.toUpperCase(), isNot(contains('EXHAUSTED')));
        expect(message, isNotEmpty);
      }
      expect(unavailable, contains('Cuba lagi'));
      expect(exhausted, contains('sibuk'));
    });

    test('2. tiada mesej pengguna membawa kod, underscore atau HURUF BESAR penuh', () {
      const codes = [
        'unauthenticated',
        'permission-denied',
        'not-found',
        'resource-exhausted',
        'unavailable',
        'deadline-exceeded',
        'failed-precondition',
        'invalid-argument',
        'internal',
        'unknown',
        'data-loss',
        'aborted',
        'cancelled',
        'network-request-failed',
        'merchant_place_access_required',
        'restaurant_not_published',
      ];
      for (final code in codes) {
        final message = MerchantErrorMapper.message(
          FirebaseFunctionsException(code: code, message: code.toUpperCase()),
        );
        expect(message, isNot(contains('_')), reason: '$code bocor underscore');
        expect(message.toUpperCase() == message, isFalse,
            reason: '$code menghasilkan mesej HURUF BESAR seperti kod mentah');
        expect(message.toLowerCase(), isNot(contains(code.toLowerCase())),
            reason: '$code muncul dalam mesej pengguna');
      }
    });

    test('3. ralat yang tidak dikenali jatuh ke ayat selamat, bukan teks mentah', () {
      final message = MerchantErrorMapper.message(
        StateError('SOME_INTERNAL_TOKEN_LEAK sk_live_abc123'),
      );
      expect(message, isNot(contains('sk_live')));
      expect(message, isNot(contains('SOME_INTERNAL_TOKEN_LEAK')));
      expect(message, isNotEmpty);
    });

    test('4. FirebaseException biasa juga dipetakan', () {
      final message = MerchantErrorMapper.message(
        FirebaseException(plugin: 'firestore', code: 'permission-denied'),
      );
      expect(message.toLowerCase(), contains('akses'));
      expect(message, isNot(contains('permission')));
    });

    test('5. kod teknikal masih tersedia untuk log sahaja', () {
      final error =
          FirebaseFunctionsException(code: 'resource-exhausted', message: 'x');
      expect(MerchantErrorMapper.debugCode(error), 'resource-exhausted');
      // ...tetapi tidak sama dengan apa yang pengguna nampak.
      expect(MerchantErrorMapper.message(error),
          isNot(MerchantErrorMapper.debugCode(error)));
    });

    test('6. null tidak meletup', () {
      expect(MerchantErrorMapper.message(null), isNotEmpty);
    });
  });

  group('Merchant Center — punca defek asal sudah tiada', () {
    test('7. fallback tidak lagi mengemakan kod mentah ke skrin', () {
      final source =
          File('lib/features/merchant/merchant_center_screen.dart').readAsStringSync();
      // Baris asal yang menyebabkan "RESOURCE EXHAUSTED" muncul pada telefon.
      expect(source.contains("return raw.replaceAll('_', ' ');"), isFalse,
          reason: 'fallback mentah kembali semula');
      expect(source, contains('MerchantErrorMapper.message('));
    });
  });

  group('MerchantAnalytics — keadaan metrik jujur', () {
    Map<String, dynamic> payload({
      Map<String, dynamic>? metrics,
      Map<String, dynamic>? comparison,
      Map<String, dynamic>? notTracked,
    }) =>
        {
          'restaurantName': 'Kedai Ujian',
          'fromDay': '2026-09-01',
          'toDay': '2026-09-08',
          'timezone': 'Asia/Kuala_Lumpur',
          'metrics': metrics ??
              {
                'profileViews': {'value': 12, 'state': 'recorded'},
                'callTaps': {
                  'value': null,
                  'state': 'not_tracked',
                  'note': 'Butang telefon belum disambungkan.',
                },
              },
          'comparison': comparison ??
              {'available': false, 'changes': {}, 'note': 'Tiada tempoh sebelum ini.'},
          'notTracked': notTracked ?? {'revenue': 'Tiada bayaran diproses.'},
          'series': [
            {'dayKey': '2026-09-08', 'profileViews': 12},
          ],
        };

    test('8. metrik yang diukur dan yang tidak dijejaki dibezakan', () {
      final data = MerchantAnalytics.fromMap(payload());
      expect(data.metric('profileViews').isMeasured, isTrue);
      expect(data.metric('profileViews').value, 12);

      final call = data.metric('callTaps');
      expect(call.isMeasured, isFalse);
      expect(call.state, MetricState.notTracked);
      expect(call.value, isNull,
          reason: '0 di sini bermakna "tiada siapa telefon", padahal tiada siapa boleh');
      expect(call.note, isNotEmpty);
    });

    test('9. metrik yang hilang tidak diada-adakan sebagai sifar', () {
      final data = MerchantAnalytics.fromMap(payload());
      final missing = data.metric('metrikYangTiadaLangsung');
      expect(missing.value, isNull);
      expect(missing.state, MetricState.unavailable);
      expect(missing.isMeasured, isFalse);
    });

    test('10. perbandingan yang tiada dinyatakan, bukan dipalsukan', () {
      final data = MerchantAnalytics.fromMap(payload());
      expect(data.comparisonAvailable, isFalse);
      expect(data.comparisonNote, isNotEmpty);
      expect(data.change('profileViews'), isNull);
    });

    test('11. perubahan peratus dibaca apabila ia benar-benar ada', () {
      final data = MerchantAnalytics.fromMap(payload(comparison: {
        'available': true,
        'changes': {'profileViews': 0.5, 'saves': null},
      }));
      expect(data.comparisonAvailable, isTrue);
      expect(data.change('profileViews'), 0.5);
      expect(data.change('saves'), isNull,
          reason: 'null bermakna pembahagi sifar, bukan 0% perubahan');
    });

    test('12. sebab "tidak dijejaki" sampai kepada peniaga', () {
      final data = MerchantAnalytics.fromMap(payload());
      expect(data.notTracked['revenue'], isNotEmpty);
    });

    test('13. payload kosong tidak meletup', () {
      final data = MerchantAnalytics.fromMap(const {});
      expect(data.hasAnyMeasurement, isFalse);
      expect(data.metrics, isEmpty);
      expect(data.series, isEmpty);
      expect(data.timezone, 'Asia/Kuala_Lumpur');
    });

    test('14. julat yang ditawarkan semuanya berpagar', () {
      for (final range in AnalyticsRange.values) {
        expect(range.days, greaterThan(0));
        expect(range.days, lessThanOrEqualTo(400),
            reason: 'pelayan menolak julat melebihi had');
        expect(range.label, isNotEmpty);
      }
    });
  });

  group('Instrumentasi — hanya isyarat sebenar', () {
    test('15. impression promosi mesti mengaku ia benar-benar kelihatan', () {
      final source =
          File('lib/features/restaurant/restaurant_detail_screen.dart').readAsStringSync();
      expect(source, contains('EventType.promotionImpression'));
      expect(source, contains("'visible': true"),
          reason: 'agregator menolak impression tanpa pengakuan visible');
    });

    test('16. menu dikira daripada ketukan pengguna, bukan daripada build', () {
      final canonical = File(
              'lib/features/restaurant/canonical/canonical_restaurant_detail_screen.dart')
          .readAsStringSync();
      expect(canonical, contains('onMenuTabOpened'));
      expect(canonical, contains('onTap: (index) => widget.callbacks.onMenuTabOpened'),
          reason: 'TabBarView membina anaknya awal; build bukan minat pengguna');
    });

    test('17. tiada butang direka semata-mata untuk mencantikkan analitik', () {
      final promo = File('lib/features/promotions/promotion_section.dart').readAsStringSync();
      // Kad promosi awam masih tiada CTA — jadi ketukan promosi kekal
      // "tidak dijejaki" dan bukan nombor rekaan.
      expect(promo.contains('onTap'), isFalse,
          reason: 'CTA palsu akan menjadikan metrik ketukan satu pembohongan');
    });
  });
}
