import 'dart:io';

/// Select the approved baseline for the renderer's host, not the app platform.
/// Each host still uses Flutter's unchanged strict pixel comparator.
String goldenPathForHost(String filename, {required String host}) =>
    host == 'macos' ? 'goldens/macos/$filename' : 'goldens/$filename';

String goldenHostPath(String filename) =>
    goldenPathForHost(filename, host: Platform.operatingSystem);
