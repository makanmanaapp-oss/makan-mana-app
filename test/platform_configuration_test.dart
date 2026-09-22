import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/core/qa/platform_configuration.dart';
import 'package:makan_mana/core/qa/qa_isolation.dart' show kQaFlavorName;

/// iOS WAVE 3A — iOS mesti gagal-TERTUTUP apabila konfigurasi tiada.
///
/// Sebelum ini `DefaultFirebaseOptions.currentPlatform` melontar untuk iOS,
/// `main.dart` menangkapnya, dan app BERJALAN dengan data tiruan. Itu
/// kegagalan-terbuka: binaan yang tidak pernah dikonfigurasikan kelihatan
/// seperti aplikasi sebenar.
void main() {
  group('Android tidak berubah', () {
    test('Android dibenarkan walaupun tanpa konfigurasi Firebase', () {
      // Mod pembangunan tempatan Android ialah keputusan lama yang sah.
      // Gelombang iOS ini tidak boleh mengubahnya sebagai kesan sampingan.
      final d = decideProductionConfiguration(
        isApplePlatform: false,
        firebaseOptionsAvailable: false,
        flavor: null,
      );
      expect(d.isAllowed, isTrue);
      expect(d.blockedReason, isNull);
    });

    test('Android dibenarkan untuk setiap gabungan flavour', () {
      for (final flavor in <String?>[null, '', 'qa', 'prod']) {
        expect(
          decideProductionConfiguration(
            isApplePlatform: false,
            firebaseOptionsAvailable: true,
            flavor: flavor,
          ).isAllowed,
          isTrue,
          reason: 'flavor=$flavor',
        );
      }
    });
  });

  group('iOS gagal-tertutup', () {
    test('binaan QA TIDAK PERNAH boleh masuk laluan produksi', () {
      final d = decideProductionConfiguration(
        isApplePlatform: true,
        firebaseOptionsAvailable: true,
        flavor: kQaFlavorName,
      );
      expect(d.isAllowed, isFalse);
      expect(d.blockedReason, contains('QA'));
      expect(d.blockedReason, contains('produksi'));
    });

    test('flavour tiada → disekat, kerana QA dan produksi tidak dapat dibeza',
        () {
      for (final flavor in <String?>[null, '']) {
        final d = decideProductionConfiguration(
          isApplePlatform: true,
          firebaseOptionsAvailable: true,
          flavor: flavor,
        );
        expect(d.isAllowed, isFalse, reason: 'flavor=$flavor');
        expect(d.blockedReason, contains('Flavour iOS'));
      }
    });

    test('konfigurasi Firebase tiada → disekat, BUKAN data tiruan', () {
      final d = decideProductionConfiguration(
        isApplePlatform: true,
        firebaseOptionsAvailable: false,
        flavor: 'prod',
      );
      expect(d.isAllowed, isFalse);
      expect(d.blockedReason, contains('Firebase iOS'));
      // Sebab mesti menyatakan ia tidak akan berjalan dengan data tiruan.
      expect(d.blockedReason, contains('tiruan'));
    });

    test('produksi yang dikonfigurasikan sepenuhnya dibenarkan', () {
      final d = decideProductionConfiguration(
        isApplePlatform: true,
        firebaseOptionsAvailable: true,
        flavor: 'prod',
      );
      expect(d.isAllowed, isTrue);
    });

    test('keutamaan: QA disekat walaupun Firebase juga tiada', () {
      final d = decideProductionConfiguration(
        isApplePlatform: true,
        firebaseOptionsAvailable: false,
        flavor: kQaFlavorName,
      );
      expect(d.isAllowed, isFalse);
      // Sebab QA mesti menang — ia yang berbahaya.
      expect(d.blockedReason, contains('QA'));
    });
  });

  group('pemetaan bundle', () {
    test('bundle sepadan keputusan pemilik yang dikunci', () {
      expect(kIosProductionBundleId, 'com.makanmana.apps');
      expect(kIosQaBundleId, 'com.makanmana.apps.qa');
      expect(expectedBundleIdFor(kQaFlavorName), kIosQaBundleId);
      expect(expectedBundleIdFor('prod'), kIosProductionBundleId);
      expect(expectedBundleIdFor(null), kIosProductionBundleId);
    });

    test('bundle QA ialah bundle produksi dengan akhiran .qa', () {
      // Sama seperti `applicationIdSuffix = ".qa"` pada Android.
      expect(kIosQaBundleId, '$kIosProductionBundleId.qa');
    });
  });
}
