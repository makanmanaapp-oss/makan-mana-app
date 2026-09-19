import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// WAVE 3D GATE 3D (QA path) — pengawal konfigurasi flavor QA.
///
/// Kenapa ujian ini wujud: binaan QA MESTI dipasang BERSEBELAHAN pengeluaran.
/// Jika suffix `.qa` hilang, APK QA akan berkongsi applicationId dengan
/// pengeluaran (`com.makanmana.apps`) — memaksa nyahpasang aplikasi Play yang
/// hidup pada telefon ujian dan memadam datanya. Ujian ini menghalang regresi
/// itu, dan juga menghalang sesiapa menambah suffix pada flavor `prod`.
///
/// Ini ujian ASERSI SUMBER (bukan widget): ia membaca fail binaan sebenar.
void main() {
  String read(String path) =>
      File(path).readAsStringSync().replaceAll('\r\n', '\n');

  group('QA flavor build configuration', () {
    late String gradle;

    setUp(() => gradle = read('android/app/build.gradle.kts'));

    test('applicationId asas kekal pengeluaran', () {
      expect(gradle, contains('applicationId = "com.makanmana.apps"'));
    });

    test('dimensi flavor "env" wujud dengan prod + qa', () {
      expect(gradle, contains('flavorDimensions += "env"'));
      expect(gradle, contains('create("prod")'));
      expect(gradle, contains('create("qa")'));
    });

    test('flavor qa MESTI menambah suffix .qa (pasang bersebelahan)', () {
      final qaBlock = gradle.substring(gradle.indexOf('create("qa")'));
      expect(qaBlock, contains('applicationIdSuffix = ".qa"'));
      expect(qaBlock, contains('manifestPlaceholders["appLabel"] = "MakanMana QA"'));
    });

    test('flavor prod MESTI TIADA suffix — pakej pengeluaran tidak berubah', () {
      final prodStart = gradle.indexOf('create("prod")');
      final qaStart = gradle.indexOf('create("qa")');
      expect(prodStart, greaterThan(-1));
      expect(qaStart, greaterThan(prodStart));
      final prodBlock = gradle.substring(prodStart, qaStart);
      expect(prodBlock.contains('applicationIdSuffix'), isFalse,
          reason: 'flavor prod mesti kekal com.makanmana.apps');
      expect(prodBlock, contains('manifestPlaceholders["appLabel"] = "MakanMana"'));
    });

    test('manifest menggunakan placeholder appLabel (bukan label tetap)', () {
      final manifest = read('android/app/src/main/AndroidManifest.xml');
      expect(manifest, contains(r'android:label="${appLabel}"'));
      expect(manifest.contains('android:label="MakanMana"'), isFalse,
          reason: 'label tetap akan menamakan binaan QA sebagai pengeluaran');
    });

    test('google-services QA mengandungi klien com.makanmana.apps.qa', () {
      final file = File('android/app/src/qa/google-services.json');
      expect(file.existsSync(), isTrue,
          reason: 'binaan flavor qa memerlukan konfigurasi Firebase sendiri');
      final json = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
      final packages = (json['client'] as List)
          .map((c) => ((c as Map)['client_info'] as Map)['android_client_info'])
          .map((i) => (i as Map)['package_name'] as String)
          .toSet();
      expect(packages, contains('com.makanmana.apps.qa'));
    });

    // PEMBALIKAN DISENGAJAKAN (pengasingan backend QA).
    //
    // Ujian ini DAHULUNYA menuntut `project_id == 'makanmana-c59f3'`, iaitu ia
    // MENGUATKUASAKAN binaan QA berkongsi projek Firebase pengeluaran. Itulah
    // punca sebenar: `com.makanmana.apps.qa` ialah app Android BERDAFTAR di
    // dalam projek pengeluaran, jadi sesi QA menulis dokumen sebenar ke koleksi
    // `events` pengeluaran.
    //
    // Nilai jangkaan tidak "dilonggarkan" untuk melepaskan ujian — invarian yang
    // dikehendaki sudah bertukar arah, dan ujian ini kini menguatkuasakan arah
    // yang baharu. Sejarah penuh fail lama ada pada komit de200b6.
    test('google-services QA MESTI BUKAN projek pengeluaran', () {
      final json = jsonDecode(
              File('android/app/src/qa/google-services.json').readAsStringSync())
          as Map<String, dynamic>;
      final info = json['project_info'] as Map<String, dynamic>;
      final projectId = info['project_id'] as String;

      expect(projectId, 'demo-makanmana-qa');
      expect(projectId, startsWith('demo-'),
          reason: 'awalan demo- menjadikan projek mustahil dicapai di hulu');
      expect(projectId, isNot('makanmana-c59f3'));

      // Tiada pengecam pengeluaran boleh tinggal dalam APK QA.
      final raw = File('android/app/src/qa/google-services.json')
          .readAsStringSync();
      final prod = jsonDecode(
              File('android/app/google-services.json').readAsStringSync())
          as Map<String, dynamic>;
      final prodInfo = prod['project_info'] as Map<String, dynamic>;
      expect(raw.contains(prodInfo['project_id'] as String), isFalse);
      expect(raw.contains(prodInfo['project_number'] as String), isFalse);
      final prodKey = (((prod['client'] as List).first as Map)['api_key']
          as List).first as Map;
      expect(raw.contains(prodKey['current_key'] as String), isFalse,
          reason: 'kunci API pengeluaran tidak boleh dihantar dalam binaan QA');
    });
  });
}
