import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'helpers/golden_host_path.dart';

void main() {
  const filename = 'profile_small360_s10_bright.png';

  test('macOS selects the authoritative macOS baseline', () {
    expect(
        goldenPathForHost(filename, host: 'macos'), 'goldens/macos/$filename');
  });

  test('other hosts retain the approved default baseline', () {
    for (final host in ['windows', 'linux', 'android', 'ios', 'fuchsia']) {
      expect(goldenPathForHost(filename, host: host), 'goldens/$filename');
    }
  });

  test('runtime host resolves all 25 baseline pairs to existing files', () {
    final files = Directory('test/goldens/macos')
        .listSync()
        .whereType<File>()
        .where((file) => file.path.endsWith('.png'))
        .toList();
    expect(files, hasLength(25));
    for (final file in files) {
      final name = file.uri.pathSegments.last;
      final actualPath = goldenHostPath(name);
      expect(
          actualPath, goldenPathForHost(name, host: Platform.operatingSystem));
      expect(File('test/$actualPath').existsSync(), isTrue);
      expect(
          File('test/${goldenPathForHost(name, host: 'macos')}').existsSync(),
          isTrue);
      expect(
          File('test/${goldenPathForHost(name, host: 'windows')}').existsSync(),
          isTrue);
    }
  });
}
