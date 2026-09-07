/// PRIVASI PENIAGA — tiada pengecam dalaman pada permukaan pengguna.
///
/// Regresi peranti sebenar: Merchant Center memaparkan
/// `ID akaun: 8bc70ae2-19b5-45ed-a984-d56d14de7f04` kepada peniaga. UUID itu
/// ialah kunci pangkalan data: peniaga tidak boleh bertindak atasnya, dan ia
/// mendedahkan bentuk storan dalaman kepada sesiapa yang membuka skrin.
///
/// Kebocoran kedua ditemui pada masa yang sama: pemilih item menu jatuh balik
/// kepada `item['id']` mentah apabila item diterbitkan tanpa nama.
///
/// Ujian ini membaca SUMBER dan bukan merender: yang dijaga ialah "tiada
/// pengecam mentah pernah sampai ke widget teks", dan itu kelihatan secara
/// tekstual. Ia juga mengesahkan maklumat perniagaan yang BERGUNA kekal — supaya
/// pembetulan privasi tidak boleh "lulus" dengan mengosongkan skrin.
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _read(String path) =>
    File(path).readAsStringSync().replaceAll('\r\n', '\n');

/// Baris yang benar-benar merender teks kepada pengguna.
///
/// `key:`/`ValueKey(...)` dan `value:` pada DropdownMenuItem membawa id secara
/// sah — ia tidak pernah dipapar. Hanya `Text(...)` penting di sini.
List<String> _textRenders(String source) => source
    .split('\n')
    .where((line) {
      final t = line.trim();
      if (t.startsWith('//')) return false;
      return t.contains('Text(') || t.contains('_statusRow(');
    })
    .toList(growable: false);

void main() {
  const center = 'lib/features/merchant/merchant_center_screen.dart';
  const engagement = 'lib/features/merchant/restaurant_engagement_card.dart';
  const editor = 'lib/features/merchant/restaurant_profile_editor_card.dart';

  group('A. pengecam akaun dalaman tidak dipapar', () {
    test('1. baris "ID akaun" telah dibuang', () {
      final src = _read(center);
      expect(src.contains("'ID akaun'"), isFalse,
          reason: 'UUID akaun dalaman tidak boleh dipapar kepada peniaga');
      expect(src.contains("account['id']"), isFalse,
          reason: 'id akaun mentah tidak boleh mencapai widget');
    });

    test('2. tiada baris status merender pengecam mentah', () {
      for (final path in const [center, engagement, editor]) {
        for (final line in _textRenders(_read(path))) {
          for (final leak in const [
            "['id']",
            "['uid']",
            "['uuid']",
            'memberId',
            'businessId',
            'merchantMemberId',
            'documentId',
          ]) {
            expect(line.contains(leak), isFalse,
                reason: '$path merender pengecam dalaman: ${line.trim()}');
          }
        }
      }
    });

    test('3. canonicalPlaceId tidak pernah menjadi label yang dipapar', () {
      // Ia sah sebagai `value:` dropdown dan sebagai hujah perkhidmatan;
      // yang dilarang ialah ia menjadi teks yang dibaca pengguna.
      for (final line in _textRenders(_read(engagement))) {
        expect(line.contains('canonicalPlaceId'), isFalse,
            reason: 'label kedai mesti nama, bukan id kanonikal');
      }
    });

    test('3b. keahlian dipapar sebagai NAMA kedai, bukan registry_id', () {
      // Ditemui pada peranti selepas pembetulan pertama: senarai "Akses kedai
      // diluluskan" merender registry_id mentah sebagai tajuk tile.
      final src = _read(center);
      expect(src.contains("(membership['registry_id'] ?? 'Kedai').toString()"),
          isFalse,
          reason: 'registry_id ialah kunci pangkalan data, bukan nama kedai');
      expect(src, contains('_membershipPlaceName(state, membership)'));
      expect(src, contains("return 'Kedai diluluskan';"),
          reason: 'nama tak dapat diselesaikan mesti jadi label jujur, '
              'bukan sandaran kepada id');
    });

    test('3c. tiada medan bernama *_id sampai ke tajuk tile sejarah', () {
      final src = _read(center);
      final tileTitles = RegExp(r'title:\s*([^\n]*)')
          .allMatches(src)
          .map((m) => m.group(1)!)
          .toList(growable: false);
      for (final title in tileTitles) {
        for (final leak in const ['registry_id', 'account_id', 'place_id', "['id']"]) {
          expect(title.contains(leak), isFalse,
              reason: 'tajuk merender pengecam dalaman: $title');
        }
      }
    });

    test('4. item menu tanpa nama mendapat label jujur, bukan id', () {
      final src = _read(engagement);
      expect(src.contains('name.isNotEmpty ? name : id'), isFalse,
          reason: 'sandaran lama membocorkan id item menu mentah');
      expect(src, contains("name.isNotEmpty ? name : 'Item menu tanpa nama'"));
    });
  });

  group('B. maklumat perniagaan berguna kekal', () {
    test('5. status akaun dan pengesahan masih dipapar', () {
      final src = _read(center);
      expect(src, contains("_statusRow('Akaun', state.accountStatus)"));
      expect(src, contains("_statusRow('Pengesahan', state.verificationStatus)"));
      expect(src, contains("_statusRow('Disahkan'"),
          reason: 'tarikh pengesahan ialah fakta perniagaan yang boleh ditindak');
      expect(src, contains('Status akaun peniaga'));
    });

    test('6. aliran tuntutan dan pendaftaran tidak disentuh', () {
      final src = _read(center);
      expect(src, contains('Tuntut kedai sedia ada'));
      expect(src, contains('Master Registry ID (jika diketahui)'),
          reason: 'ini INPUT yang dimiliki peniaga, bukan id dalaman bocor');
    });

    test('7. pemilih kedai masih memaparkan nama + peranan', () {
      expect(_read(engagement), contains("Text('\${r.label} · \${r.role}')"));
    });
  });
}
