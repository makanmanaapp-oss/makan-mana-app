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

      final declared = RegExp(r'name = "?(Debug|Profile|Release)(-[A-Za-z0-9]+)?"?;')
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

  group('WAVE 3B: konfigurasi flavour Xcode', () {
    test('kesembilan-sembilan konfigurasi diisytiharkan dalam ketiga-tiga senarai',
        () {
      final pbxproj = read('ios/Runner.xcodeproj/project.pbxproj');
      final lists = RegExp(
        r'isa = XCConfigurationList;\s*buildConfigurations = \(([^)]*)\)',
      ).allMatches(pbxproj).toList();
      expect(lists.length, 3, reason: 'projek + Runner + RunnerTests');
      for (final list in lists) {
        final names = RegExp(r'/\* ([\w-]+) \*/,')
            .allMatches(list.group(1)!)
            .map((m) => m.group(1)!)
            .toSet();
        // Xcode jatuh balik secara SENYAP kepada konfigurasi lalai apabila satu
        // sasaran kehilangan satu — binaan flavour kemudian menjadi bukan-flavour.
        expect(names.length, 9, reason: 'jumpa $names');
        for (final flavor in ['prod', 'qa']) {
          for (final base in ['Debug', 'Profile', 'Release']) {
            expect(names, contains('$base-$flavor'));
          }
        }
      }
    });

    test('konfigurasi flavour TIDAK menetapkan bundle id dalam pbxproj', () {
      // Nilai peringkat-sasaran mengatasi xcconfig. Jika satu muncul semula di
      // sini, keenam-enam fail xcconfig menjadi mati secara senyap.
      final pbxproj = read('ios/Runner.xcodeproj/project.pbxproj');
      var checked = 0;
      for (final m in RegExp(
        r'isa = XCBuildConfiguration;\s*baseConfigurationReference = '
        r'\w{24} /\* ([\w-]+)\.xcconfig \*/;(.*?)name = "([\w-]+)";',
        dotAll: true,
      ).allMatches(pbxproj)) {
        final base = m.group(1)!;
        if (!base.contains('-')) continue; // Debug.xcconfig/Release.xcconfig legasi
        checked++;
        expect(
          m.group(2)!.contains('PRODUCT_BUNDLE_IDENTIFIER'),
          isFalse,
          reason: '${m.group(3)} menetapkannya dalam pbxproj, mengatasi $base',
        );
        expect(m.group(3), base, reason: 'konfigurasi mesti guna xcconfig senamanya');
      }
      // Bukan hampa: gelung yang memadankan sifar konfigurasi akan lulus senyap.
      expect(checked, 6, reason: 'jangka 6 konfigurasi flavour, semak $checked');
    });

    test('xcconfig flavour tidak menetapkan PRODUCT_NAME', () {
      // Menetapkannya menamakan semula Runner.app dan memecahkan TEST_HOST.
      for (final flavor in ['prod', 'qa']) {
        for (final config in ['Debug', 'Profile', 'Release']) {
          final body = read('ios/Flutter/$config-$flavor.xcconfig')
              .split('\n')
              .where((l) => !l.trimLeft().startsWith('//'))
              .join('\n');
          expect(body.contains('PRODUCT_NAME'), isFalse, reason: '$config-$flavor');
        }
      }
      expect(
        read('ios/Runner.xcodeproj/project.pbxproj'),
        contains(r'TEST_HOST = "$(BUILT_PRODUCTS_DIR)/Runner.app/'),
        reason: 'TEST_HOST masih menjangka Runner.app',
      );
    });

    test('skema flavour wujud dan menunjuk konfigurasinya sendiri', () {
      for (final flavor in ['prod', 'qa']) {
        final scheme =
            read('ios/Runner.xcodeproj/xcshareddata/xcschemes/$flavor.xcscheme');
        for (final entry in {
          'Test': 'Debug',
          'Launch': 'Debug',
          'Profile': 'Profile',
          'Analyze': 'Debug',
          'Archive': 'Release',
        }.entries) {
          expect(
            RegExp('<${entry.key}Action[^>]*?buildConfiguration = '
                    '"${entry.value}-$flavor"', dotAll: true)
                .hasMatch(scheme),
            isTrue,
            reason: '$flavor: ${entry.key}Action bukan ${entry.value}-$flavor',
          );
        }
      }
    });
  });

  group('WAVE 3B: fasa binaan plist', () {
    test('fasa Run Script wujud dan memanggil skrip pemilihan', () {
      final pbxproj = read('ios/Runner.xcodeproj/project.pbxproj');
      expect(pbxproj, contains('isa = PBXShellScriptBuildPhase'));
      expect(pbxproj, contains(r'scripts/select_firebase_plist.sh'));
      expect(pbxproj, contains('alwaysOutOfDate = 1'),
          reason: 'pemilihan plist mesti berjalan pada SETIAP binaan');
    });

    test('ia berjalan SELEPAS Copy Bundle Resources', () {
      // Sebelum fasa itu, bundle .app belum dipasang dan fasa Resources boleh
      // menulis ganti apa sahaja yang diletakkan di sana.
      final pbxproj = read('ios/Runner.xcodeproj/project.pbxproj');
      final phases = RegExp(r'buildPhases = \(([^)]*)\)', dotAll: true)
          .allMatches(pbxproj)
          .map((m) => m.group(1)!)
          .firstWhere((b) => b.contains('select_firebase_plist') || b.contains('MakanMana:'));
      final resources = phases.indexOf('/* Resources */');
      final select = phases.indexOf('MakanMana:');
      expect(resources, greaterThan(-1));
      expect(select, greaterThan(resources),
          reason: 'fasa pemilihan plist mesti selepas Resources');
    });

    test('skrip mengikat identiti PROJEK, bukan hanya bundle id', () {
      // Dua projek Firebase boleh mendaftarkan bundle id yang SAMA, jadi
      // semakan bundle sahaja tidak memisahkan QA daripada produksi.
      final script = read('ios/scripts/select_firebase_plist.sh');
      expect(script, contains('PLIST_PROJECT_ID'));
      expect(script, contains('MM_PRODUCTION_PROJECT_ID'));
      expect(script, contains(r'plist_value PROJECT_ID'));
    });
  });

  group('WAVE 3B: sasaran penempatan konsisten', () {
    test('pbxproj dan Podfile kedua-duanya iOS 15.0', () {
      final pbxproj = read('ios/Runner.xcodeproj/project.pbxproj');
      expect(pbxproj.contains('IPHONEOS_DEPLOYMENT_TARGET = 13.0'), isFalse);
      expect(pbxproj, contains('IPHONEOS_DEPLOYMENT_TARGET = 15.0'));
      final podfile = read('ios/Podfile');
      expect(
        RegExp(r"^platform :ios, '15\.0'", multiLine: true).hasMatch(podfile),
        isTrue,
        reason: 'platform dikomen atau tidak sepadan projek → pod install gagal',
      );
    });
  });


  // ---------------------------------------------------------------------
  // WAVE 3C — nama paparan
  // ---------------------------------------------------------------------

  /// Blok penuh bagi satu objek pbxproj, mengira kurungan.
  String objectBody(String pbxproj, String id) {
    final start = pbxproj.indexOf(RegExp(id + r' /\* [\w-]+ \*/ = \{'));
    if (start < 0) return '';
    var depth = 0;
    var i = pbxproj.indexOf('{', start);
    for (; i < pbxproj.length; i++) {
      if (pbxproj[i] == '{') depth++;
      if (pbxproj[i] == '}') {
        depth--;
        if (depth == 0) break;
      }
    }
    return pbxproj.substring(start, i + 1);
  }

  /// Id konfigurasi bagi satu senarai, dikunci mengikut nama konfigurasi.
  Map<String, String> configsOf(String pbxproj, String isa) {
    final list = RegExp(
      'Build configuration list for $isa "Runner" '
      r'\*/ = \{.*?buildConfigurations = \((.*?)\);',
      dotAll: true,
    ).firstMatch(pbxproj);
    final out = <String, String>{};
    for (final m
        in RegExp(r'(\w{24}) /\* ([\w-]+) \*/,').allMatches(list!.group(1)!)) {
      out[m.group(2)!] = m.group(1)!;
    }
    return out;
  }

  String? settingIn(String body, String key) {
    final m = RegExp('\n\t+$key = ([^;]+);').firstMatch(body);
    return m?.group(1)!.trim().replaceAll('"', '');
  }

  /// Keutamaan Xcode: tetapan sasaran > xcconfig sasaran > tetapan projek.
  String resolveSetting(String configName, String key) {
    final pbxproj = read('ios/Runner.xcodeproj/project.pbxproj');
    final targetBody =
        objectBody(pbxproj, configsOf(pbxproj, 'PBXNativeTarget')[configName]!);

    final fromTarget = settingIn(targetBody, key);
    if (fromTarget != null) return fromTarget;

    final base = RegExp(r'baseConfigurationReference = \w{24} /\* ([\w.-]+) \*/')
        .firstMatch(targetBody);
    if (base != null) {
      final file = 'ios/Flutter/${base.group(1)!.trim()}';
      if (File(file).existsSync()) {
        final body = read(file)
            .split('\n')
            .where((l) => !l.trimLeft().startsWith('//'))
            .join('\n');
        final m = RegExp('^$key = (.*)\$', multiLine: true).firstMatch(body);
        if (m != null) return m.group(1)!.trim();
      }
    }

    final projectBody =
        objectBody(pbxproj, configsOf(pbxproj, 'PBXProject')[configName]!);
    return settingIn(projectBody, key) ?? '';
  }

  group('WAVE 3C: nama paparan diselesaikan', () {
    test('produksi diselesaikan kepada MakanMana', () {
      for (final config in ['Debug-prod', 'Profile-prod', 'Release-prod']) {
        expect(resolveSetting(config, 'MM_DISPLAY_NAME'), 'MakanMana',
            reason: config);
      }
    });

    test('QA diselesaikan kepada MakanMana QA', () {
      for (final config in ['Debug-qa', 'Profile-qa', 'Release-qa']) {
        expect(resolveSetting(config, 'MM_DISPLAY_NAME'), 'MakanMana QA',
            reason: config);
      }
    });

    test('tiada konfigurasi QA mewarisi nama produksi secara senyap', () {
      // Kegagalan yang ditakuti: xcconfig QA kehilangan tetapan itu dan
      // lalai peringkat-projek mengambil alih, memberi QA nama produksi.
      for (final config in ['Debug-qa', 'Profile-qa', 'Release-qa']) {
        expect(resolveSetting(config, 'MM_DISPLAY_NAME'),
            isNot('MakanMana'), reason: config);
      }
    });

    test('konfigurasi asal mengekalkan nama produksi TEPAT', () {
      for (final config in ['Debug', 'Profile', 'Release']) {
        expect(resolveSetting(config, 'MM_DISPLAY_NAME'), 'MakanMana',
            reason: '$config ialah laluan produksi lama');
      }
    });

    test('Info.plist merujuk tetapan binaan, bukan nama literal', () {
      final info = read('ios/Runner/Info.plist');
      expect(info, contains(r'<string>$(MM_DISPLAY_NAME)</string>'));
      expect(
        RegExp(r'<key>CFBundleDisplayName</key>\s*<string>MakanMana</string>')
            .hasMatch(info),
        isFalse,
        reason: 'nama berkod-keras akan mengatasi flavour',
      );
    });

    test('tiada nilai kosong boleh diselesaikan', () {
      for (final config in [
        'Debug', 'Profile', 'Release',
        'Debug-prod', 'Profile-prod', 'Release-prod',
        'Debug-qa', 'Profile-qa', 'Release-qa',
      ]) {
        expect(resolveSetting(config, 'MM_DISPLAY_NAME'), isNotEmpty,
            reason: '$config diselesaikan menjadi kosong');
      }
    });

    test('InfoPlist.strings setempat tidak mengatasi identiti QA', () {
      // CFBundleDisplayName dalam mana-mana .lproj akan MENANG ke atas tetapan
      // binaan, jadi peranti bukan-Inggeris akan kehilangan penanda QA.
      final offenders = Directory('ios/Runner')
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('InfoPlist.strings'))
          .where((f) => f.readAsStringSync().contains('CFBundleDisplayName'))
          .map((f) => f.path)
          .toList();
      expect(offenders, isEmpty,
          reason: 'penyetempatan akan mengatasi nama flavour: $offenders');
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
