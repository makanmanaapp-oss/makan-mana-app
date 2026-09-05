// WAVE 3C FINAL SECURITY CLOSURE — repost copy safety (client half).
//
// Sebuah repost dahulu menyimpan SALINAN kandungan post asal
// (`originalSnapshot`: teks, gambar pertama, tempat/menu/belanja/rating).
// Dokumen repost itu sendiri `status: "active"` dan awam, dan firestore.rules
// hanya menilai kitaran hayat dokumen ITU SENDIRI — ia tidak pernah membaca
// `repostOfPostId` / `quotedPostId`. Jadi selepas post asal disorok/dipadam,
// bacaan mentah repost masih memulangkan kandungan asal.
//
// Penyelesaian (bukan moderation cascade): repost menyimpan HANYA kandungan
// miliknya sendiri + pautan, dan kandungan asal dibaca LIVE.
//
// Ujian ini menjaga separuh KLIEN: tiada laluan kod yang boleh memaparkan
// kandungan snapshot — termasuk dokumen LEGASI yang masih menyimpannya
// sebelum scrubber dijalankan.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _read(String path) =>
    File(path).readAsStringSync().replaceAll('\r\n', '\n');

void main() {
  final embed = _read('lib/features/social/repost.dart');
  final postCard = _read('lib/features/social/post_card.dart');
  final compose = _read('lib/features/social/compose_sheet.dart');
  final writer = _read('functions/src/callable/repostFeedPost.ts');

  group('penulis repost tidak lagi menyalin kandungan asal', () {
    final created =
        writer.split('collection("feed_posts").add({')[1].split('});')[0];

    test('tiada medan originalSnapshot ditulis', () {
      expect(writer.contains('originalSnapshot:'), isFalse);
      expect(writer.contains('buildOriginalSnapshot'), isFalse);
    });

    test('tiada teks/gambar/menu/belanja/rating asal disalin', () {
      for (final key in [
        'menuName',
        'totalSpend',
        'userRating',
        'placeName',
        'imageUrls',
        'mediaCount',
      ]) {
        expect(created.contains(key), isFalse, reason: key);
      }
      expect(created.contains('imageUrl: null'), isTrue);
    });

    test('pautan + kitaran hayat kekal', () {
      expect(created.contains('...newPostLifecycleFields(),'), isTrue);
      expect(created.contains('repostOfPostId:'), isTrue);
      expect(created.contains('quotedPostId:'), isTrue);
      // teks milik pengguna yang quote kekal
      expect(created.contains('\n    text,\n'), isTrue);
      expect(created.contains('authorUid: uid'), isTrue);
    });
  });

  group('kad terbenam membaca asal LIVE sahaja', () {
    test('tiada medan/parameter snapshot pada widget', () {
      expect(embed.contains('final Map<String, dynamic>? snapshot;'), isFalse);
      expect(embed.contains('this.snapshot,'), isFalse);
      expect(RegExp(r'snapshot:').hasMatch(embed), isFalse);
    });

    test('memuat -> skeleton, BUKAN kandungan basi', () {
      expect(embed.contains('data = null; // skeleton sahaja'), isTrue);
      expect(embed.contains('CircularProgressIndicator'), isTrue);
    });

    test('asal disorok/dipadam/ditolak -> "tidak tersedia"', () {
      expect(embed.contains('if (liveAsync.hasError) {'), isTrue);
      expect(embed.contains('unavailable = true'), isTrue);
      expect(embed.contains("l.t('postUnavailable')"), isTrue);
    });

    test('asal hidup -> kandungan LIVE dipapar', () {
      expect(embed.contains('data = live.data;'), isTrue);
      expect(embed.contains("d['text']"), isTrue);
    });
  });

  group('tiada pemanggil boleh menyuntik kandungan basi', () {
    test('semua tapak panggilan tidak menghantar snapshot', () {
      for (final entry in {'post_card': postCard, 'compose_sheet': compose}.entries) {
        final calls = entry.value.split('EmbeddedOriginalCard(').skip(1);
        expect(calls, isNotEmpty, reason: entry.key);
        for (final call in calls) {
          final args = call.split(')')[0];
          expect(args.contains('snapshot:'), isFalse, reason: entry.key);
        }
      }
    });

    test('lapisan Flutter tidak membaca originalSnapshot langsung', () {
      expect(postCard.contains('originalSnapshot'), isFalse);
      expect(compose.contains('originalSnapshot'), isFalse);
      // satu-satunya sebutan yang tinggal ialah komen penjelasan
      final codeOnly = embed
          .split('\n')
          .where((l) => !l.trimLeft().startsWith('///') && !l.trimLeft().startsWith('//'))
          .join('\n');
      expect(codeOnly.contains('originalSnapshot'), isFalse);
    });
  });

  group('scrubber legasi wujud sebagai sumber sahaja', () {
    test('modul tulen + CLI hadir dan tidak dieksport', () {
      expect(
          File('functions/src/domain/feed/repostSnapshotSanitizer.ts').existsSync(),
          isTrue);
      final cli = _read('functions/scripts/repostSnapshotSanitizer.ts');
      expect(cli.contains('--mode=dry-run'), isTrue);
      expect(cli.contains('assertSafeScrubInvocation'), isTrue);
      expect(cli.contains('{lastUpdateTime: doc.updateTime}'), isTrue);
      expect(cli.contains('admin.firestore.FieldValue.delete()'), isTrue);
      expect(_read('functions/src/index.ts').contains('repostSnapshotSanitizer'),
          isFalse);
    });
  });
}
