import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/core/qa/platform_configuration.dart';

/// iOS WAVE 3A — kontrak konfigurasi sumber iOS.
///
/// Ujian ini membaca fail konfigurasi sebenar. Ia tidak boleh membuktikan
/// Xcode menerimanya — itu MACOS REQUIRED — tetapi ia menghalang fail daripada
/// menyimpang secara senyap daripada satu sama lain, dan ia menghalang plist
/// Firebase palsu daripada masuk ke repo.
void main() {
  String read(String path) => File(path).readAsStringSync();
  bool exists(String path) => File(path).existsSync();

  group('Podfile', () {
    test('wujud dan berasal daripada templat Flutter', () {
      expect(exists('ios/Podfile'), isTrue, reason: 'pod install TIDAK menjananya');
      final podfile = read('ios/Podfile');
      expect(podfile, contains('flutter_ios_podfile_setup'));
      expect(podfile, contains('flutter_install_all_ios_pods'));
      expect(podfile, contains("target 'Runner' do"));
      expect(podfile, contains("target 'RunnerTests' do"));
    });

    test('peta konfigurasi sepadan DENGAN TEPAT konfigurasi pbxproj', () {
      // Jika kedua-duanya menyimpang, `pod install` gagal. Ujian ini menangkap
      // penyimpangan itu sebelum sesiapa sampai ke macOS.
      // Buang baris komen dahulu: Podfile membawa peta CONTOH yang dikomen
      // untuk masa hadapan, dan ia bukan konfigurasi aktif.
      final podfile = read('ios/Podfile')
          .split('\n')
          .where((line) => !line.trimLeft().startsWith('#'))
          .join('\n');
      final pbxproj = read('ios/Runner.xcodeproj/project.pbxproj');

      final mapBlock = RegExp(r"project 'Runner', \{([^}]*)\}").firstMatch(podfile);
      expect(mapBlock, isNotNull, reason: 'peta konfigurasi tidak dijumpai');
      final mapped = RegExp(r"'([^']+)' =>")
          .allMatches(mapBlock!.group(1)!)
          .map((m) => m.group(1)!)
          .toSet();

      final declared = RegExp(r'name = (Debug|Profile|Release)(-[A-Za-z0-9]+)?;')
          .allMatches(pbxproj)
          .map((m) => '${m.group(1)}${m.group(2) ?? ''}')
          .toSet();

      // Bukan hampa: kedua-dua sisi mesti benar-benar menghurai sesuatu.
      expect(declared, contains('Release'));
      expect(mapped, contains('Release'));

      expect(
        mapped,
        equals(declared),
        reason: 'Podfile memetakan $mapped tetapi pbxproj mengisytiharkan $declared',
      );
    });
  });

  group('xcconfig flavour', () {
    test('ketiga-tiga konfigurasi wujud untuk kedua-dua flavour', () {
      for (final flavor in ['prod', 'qa']) {
        for (final config in ['Debug', 'Profile', 'Release']) {
          expect(
            exists('ios/Flutter/$config-$flavor.xcconfig'),
            isTrue,
            reason: '$config-$flavor tiada',
          );
        }
      }
    });

    test('bundle identifier sepadan keputusan pemilik yang dikunci', () {
      for (final config in ['Debug', 'Profile', 'Release']) {
        expect(
          read('ios/Flutter/$config-prod.xcconfig'),
          contains('PRODUCT_BUNDLE_IDENTIFIER = $kIosProductionBundleId'),
        );
        expect(
          read('ios/Flutter/$config-qa.xcconfig'),
          contains('PRODUCT_BUNDLE_IDENTIFIER = $kIosQaBundleId'),
        );
      }
    });

    test('QA dan produksi menunjuk direktori Firebase yang BERBEZA', () {
      final qa = read('ios/Flutter/Release-qa.xcconfig');
      final prod = read('ios/Flutter/Release-prod.xcconfig');
      expect(qa, contains('MM_FLAVOR = qa'));
      expect(prod, contains('MM_FLAVOR = prod'));
      expect(qa, contains('Firebase/qa'));
      expect(prod, contains('Firebase/prod'));
      // QA tidak boleh menunjuk kepada konfigurasi produksi.
      expect(qa.contains('Firebase/prod'), isFalse);
    });

    test('setiap xcconfig flavour mewarisi Generated.xcconfig', () {
      for (final flavor in ['prod', 'qa']) {
        for (final config in ['Debug', 'Profile', 'Release']) {
          expect(
            read('ios/Flutter/$config-$flavor.xcconfig'),
            contains('#include "Generated.xcconfig"'),
            reason: '$config-$flavor kehilangan tetapan Flutter',
          );
        }
      }
    });
  });

  group('pemilihan plist Firebase gagal-tertutup', () {
    test('skrip wujud dan berhenti pada ralat', () {
      expect(exists('ios/scripts/select_firebase_plist.sh'), isTrue);
      final script = read('ios/scripts/select_firebase_plist.sh');
      expect(script, contains('set -eu'));
    });

    test('flavour tiada dan plist tiada kedua-duanya keluar bukan-sifar', () {
      final script = read('ios/scripts/select_firebase_plist.sh');
      // Dua semakan, kedua-duanya diikuti exit 1.
      expect(
        RegExp(r'exit 1').allMatches(script).length,
        greaterThanOrEqualTo(2),
        reason: 'flavour tiada DAN plist tiada mesti menghentikan binaan',
      );
      expect(script, contains(r'if [ -z "${MM_FLAVOR:-}" ]'));
      expect(script, contains(r'if [ ! -f "${SOURCE_PLIST}" ]'));
    });

    test('TIADA sandaran kepada plist flavour lain', () {
      final script = read('ios/scripts/select_firebase_plist.sh');
      // Satu sandaran akan kelihatan seperti laluan kedua kepada plist.
      expect(script.contains('Firebase/prod'), isFalse);
      expect(script.contains('|| cp'), isFalse);
    });
  });

  group('kontrak Google Sign-In', () {
    test('skim URL datang dari flavour, tidak dikodkan keras', () {
      final info = read('ios/Runner/Info.plist');
      expect(info, contains('CFBundleURLSchemes'));
      expect(
        info,
        contains(r'$(MM_GOOGLE_REVERSED_CLIENT_ID)'),
        reason: 'QA dan produksi mempunyai REVERSED_CLIENT_ID yang berbeza',
      );
      // Skim sebenar bermula dengan com.googleusercontent.apps. — jika satu
      // muncul di sini, seseorang telah mengekalkannya dalam sumber.
      expect(
        info.contains('com.googleusercontent.apps'),
        isFalse,
        reason: 'skim satu-persekitaran dikodkan keras dalam Info.plist',
      );
    });

    test('setiap xcconfig flavour mengisytiharkan pemboleh ubah itu', () {
      for (final flavor in ['prod', 'qa']) {
        for (final config in ['Debug', 'Profile', 'Release']) {
          expect(
            read('ios/Flutter/$config-$flavor.xcconfig'),
            contains('MM_GOOGLE_REVERSED_CLIENT_ID'),
            reason: '$config-$flavor',
          );
        }
      }
    });
  });

  group('pengawal silang-persekitaran', () {
    test('plist disemak terhadap identiti binaan sebelum disalin', () {
      final script = read('ios/scripts/select_firebase_plist.sh');
      final guard = script.indexOf(r'${PLIST_BUNDLE_ID}" != "${PRODUCT_BUNDLE_IDENTIFIER}');
      final copy = script.indexOf(r'cp "${SOURCE_PLIST}"');
      expect(guard, greaterThan(-1), reason: 'pengawal BUNDLE_ID tiada');
      expect(copy, greaterThan(-1));
      expect(
        guard,
        lessThan(copy),
        reason: 'plist yang salah tidak sepatutnya pernah masuk ke dalam bundle',
      );
    });

    test('identiti binaan yang tiada menyekat, bukan melangkau semakan', () {
      final script = read('ios/scripts/select_firebase_plist.sh');
      expect(script, contains(r'if [ -z "${PRODUCT_BUNDLE_IDENTIFIER:-}" ]'));
    });

    test('skim URL kosong atau menyimpang menghentikan binaan', () {
      final script = read('ios/scripts/select_firebase_plist.sh');
      expect(script, contains(r'if [ -z "${MM_GOOGLE_REVERSED_CLIENT_ID:-}" ]'));
      expect(
        script,
        contains(r'"${MM_GOOGLE_REVERSED_CLIENT_ID}" != "${PLIST_REVERSED}"'),
      );
    });
  });

  group('tiada konfigurasi Firebase palsu dalam repo', () {
    test('tiada GoogleService-Info.plist dicommit di mana-mana', () {
      final offenders = Directory('ios')
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.replaceAll(r'\', '/').endsWith('GoogleService-Info.plist'))
          .map((f) => f.path)
          .toList();
      expect(
        offenders,
        isEmpty,
        reason: 'plist hanya boleh datang daripada konsol Firebase: $offenders',
      );
    });

    test('direktori Firebase didokumenkan untuk kedua-dua flavour', () {
      expect(Directory('ios/Firebase/prod').existsSync(), isTrue);
      expect(Directory('ios/Firebase/qa').existsSync(), isTrue);
      final readme = read('ios/Firebase/README.md');
      expect(readme, contains(kIosProductionBundleId));
      expect(readme, contains(kIosQaBundleId));
    });
  });
}
