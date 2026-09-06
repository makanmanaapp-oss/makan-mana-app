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
      // Projek Firebase mesti sama dengan pengeluaran (makanmana-c59f3).
      final projectId =
          ((json['project_info'] as Map)['project_id'] as String);
      expect(projectId, 'makanmana-c59f3');
    });
  });
}
