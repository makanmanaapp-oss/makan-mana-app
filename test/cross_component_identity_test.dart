import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/core/qa/platform_configuration.dart';
import 'package:makan_mana/core/qa/qa_isolation.dart' show kQaIsolatedProjectId;
import 'package:makan_mana/firebase_options.dart';

/// WAVE 3C — Flutter, Functions dan iOS natif mesti BERSETUJU tentang identiti.
///
/// Setiap komponen mengekod identiti projek Firebase secara berasingan:
///
///   Flutter klien   lib/firebase_options.dart, lib/core/qa/qa_isolation.dart
///   Functions       functions/src/domain/security/egressGuard.ts
///   iOS natif       ios/scripts/select_firebase_plist.sh
///
/// Ia tidak boleh berkongsi pemalar — bahasa berbeza, proses binaan berbeza.
/// Jadi ia boleh MENYIMPANG, dan penyimpangan itu senyap: satu komponen
/// menganggap sesuatu QA sementara yang lain menganggapnya produksi. Ujian ini
/// ialah satu-satunya tempat ketiga-tiganya dibandingkan.
void main() {
  String read(String path) => File(path).readAsStringSync();

  /// Nilai pemalar TypeScript yang dieksport.
  String tsConst(String name) {
    final source = read('functions/src/domain/security/egressGuard.ts');
    final m = RegExp('export const $name(?::[^=]*)? = "([^"]*)";').firstMatch(source);
    expect(m, isNotNull, reason: '$name tidak dijumpai dalam egressGuard.ts');
    return m!.group(1)!;
  }

  /// Nilai pemboleh ubah shell.
  String shConst(String name) {
    final source = read('ios/scripts/select_firebase_plist.sh');
    final m = RegExp('^$name="([^"]*)"', multiLine: true).firstMatch(source);
    expect(m, isNotNull, reason: '$name tidak dijumpai dalam skrip');
    return m!.group(1)!;
  }

  group('identiti produksi', () {
    test('ketiga-tiga komponen menamakan projek produksi yang SAMA', () {
      final dart = DefaultFirebaseOptions.android.projectId;
      final functions = tsConst('PRODUCTION_PROJECT_ID');
      final native = shConst('MM_PRODUCTION_PROJECT_ID');

      expect(functions, dart,
          reason: 'Functions dan klien Flutter tidak bersetuju');
      expect(native, dart,
          reason: 'skrip binaan iOS dan klien Flutter tidak bersetuju');
    });

    test('identiti produksi bukan pemegang tempat', () {
      final id = tsConst('PRODUCTION_PROJECT_ID');
      expect(id, isNotEmpty);
      // "makanmana-prod" ialah nama rekaan yang digunakan oleh ujian lama.
      // Ia tidak pernah wujud, dan pagar tidak boleh dikunci kepadanya.
      expect(id, isNot('makanmana-prod'));
      expect(id, isNot('example'));
    });
  });

  group('identiti QA', () {
    test('QA emulator tempatan sepadan antara klien dan Functions', () {
      expect(tsConst('APPROVED_QA_PROJECT_ID'), kQaIsolatedProjectId);
    });

    test('QA tidak boleh sama dengan produksi', () {
      final qa = tsConst('APPROVED_QA_PROJECT_ID');
      final prod = tsConst('PRODUCTION_PROJECT_ID');
      expect(qa, isNot(prod));
      expect(qa.startsWith('demo-'), isTrue,
          reason: 'awalan demo- ialah yang menjadikannya tidak dapat dicapai');
      expect(prod.startsWith('demo-'), isFalse);
    });

    test('projek QA sebenar BELUM diumpukkan, dan itu disengajakan', () {
      // Pemilik meluluskan pendekatan projek QA Firebase sebenar. Projek itu
      // belum wujud. Sehingga ia wujud, pemalar mesti kekal null supaya tiada
      // identiti boleh diklasifikasikan sebagai REAL_QA.
      final source = read('functions/src/domain/security/egressGuard.ts');
      expect(
        source,
        contains('export const APPROVED_REAL_QA_PROJECT_ID: string | null = null;'),
        reason: 'ID yang direka akan membuka laluan egress REAL_QA',
      );
    });
  });

  group('identiti bundle', () {
    test('bundle iOS sepadan antara gerbang Dart dan xcconfig', () {
      for (final entry in {
        'prod': kIosProductionBundleId,
        'qa': kIosQaBundleId,
      }.entries) {
        for (final config in ['Debug', 'Profile', 'Release']) {
          expect(
            read('ios/Flutter/$config-${entry.key}.xcconfig'),
            contains('PRODUCT_BUNDLE_IDENTIFIER = ${entry.value}'),
            reason: '$config-${entry.key}',
          );
        }
      }
    });

    test('bundle QA tidak boleh sama dengan produksi', () {
      expect(kIosQaBundleId, isNot(kIosProductionBundleId));
    });
  });

  group('gabungan terlarang tidak boleh dinyatakan', () {
    test('bundle QA terikat kepada direktori plist QA sahaja', () {
      // Bundle QA + projek Firebase produksi ialah gabungan yang dilarang.
      // Skrip mengikatnya: plist flavour qa mesti BUKAN projek produksi.
      final script = read('ios/scripts/select_firebase_plist.sh');
      expect(script, contains(r'MM_FIREBASE_PLIST_DIR'));
      expect(script, contains('PLIST_PROJECT_ID'));
      expect(
        script,
        contains(r'"${PLIST_PROJECT_ID}" = "${MM_PRODUCTION_PROJECT_ID}"'),
        reason: 'flavour bukan-prod dengan plist produksi mesti disekat',
      );
    });

    test('flavour Dart QA terikat kepada flavour natif QA', () {
      final script = read('ios/scripts/select_firebase_plist.sh');
      expect(script, contains(r'"${DART_FLAVOR}" != "${MM_FLAVOR}"'));
    });

    test('WAVE 3E: domain jemputan backend sepadan hos App Links produksi', () {
      // Lalai jemputan produksi hidup dalam backend (qaSurfaces.ts) dan dalam
      // manifest Android (hos App Links). Jika ia menyimpang, pautan jemputan
      // produksi tidak lagi membuka aplikasi.
      final surfaces = read('functions/src/domain/security/qaSurfaces.ts');
      expect(
        surfaces,
        contains(r'PRODUCTION_INVITE_BASE_URL = `https://${PRODUCTION_PROJECT_ID}.web.app`'),
      );
      final prodHost = '${tsConst('PRODUCTION_PROJECT_ID')}.web.app';
      expect(
        read('android/app/src/main/AndroidManifest.xml'),
        contains('android:host="$prodHost"'),
      );
      // Callable tidak lagi membawa sandaran produksi berkod-keras sendiri.
      expect(
        read('functions/src/callable/groupInviteLinkControl.ts')
            .contains('?? "https://makanmana-c59f3.web.app"'),
        isFalse,
      );
    });

    test('binaan QA iOS tidak boleh mencapai laluan produksi Dart', () {
      // Gerbang tulen ini disemak sepenuhnya dalam platform_configuration_test.
      // Di sini kita hanya menegaskan ia masih terpasang pada ketiga-tiga
      // paksi identiti.
      final decision = decideProductionConfiguration(
        isApplePlatform: true,
        firebaseOptionsAvailable: true,
        flavor: 'qa',
      );
      expect(decision.isAllowed, isFalse);
    });
  });
}
