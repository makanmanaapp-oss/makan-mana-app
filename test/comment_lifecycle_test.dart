// WAVE 3D ENTRY GATE 1 — kitaran hayat KOMEN post (klien).
//
// Penguatkuasaan sebenar ada di firestore.rules (dibuktikan oleh functions
// `npm run test:rules` — commentLifecycleRules.test.ts). Ujian ini menjaga
// separuh KLIEN bagi invarian empat bahagian:
//
//   WRITER : setiap komen baharu distem status 'active'
//   QUERY  : thread normal (bukan-pengarang) meminta status == 'active'
//   RULES  : bacaan bukan-pengarang perlu active + induk boleh dibaca
//   LEGACY : backfill sumber-sahaja wujud (TIDAK dijalankan)
//
// KRITIKAL, bukan kosmetik: query senarai Firestore GAGAL SEPENUHNYA jika ia
// boleh memulangkan dokumen yang rules tolak. Satu komen yang dipadam-sendiri
// dahulu mematikan SELURUH thread untuk semua orang kecuali pengarang post.
//
// Tiada kerja UI di sini — kekangan data sahaja.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _read(String path) =>
    File(path).readAsStringSync().replaceAll('\r\n', '\n');

/// Potong badan satu provider daripada sumber (dari namanya hingga `});`).
String _provider(String src, String name) {
  final start = src.indexOf('final $name');
  expect(start, greaterThan(-1), reason: 'provider $name tidak dijumpai');
  final end = src.indexOf('\n});', start);
  expect(end, greaterThan(start), reason: 'hujung $name tidak dijumpai');
  return src.substring(start, end);
}

const _lifecycle = "where('status', isEqualTo: kCommentStatusActive)";

void main() {
  final providers = _read('lib/features/social/social_providers.dart');
  final sheet = _read('lib/features/social/comment_sheet.dart');
  final rules = _read('firestore.rules');

  group('WRITER — komen baharu dilahirkan aktif', () {
    test('payload create mengandungi status active', () {
      final add = sheet.split('.add({')[1].split('})')[0];
      expect(add, contains("'status': kCommentStatusActive,"));
      expect(add, contains("'authorUid': uid"));
      expect(add, contains("'text': text"));
      // medan denormalisasi sedia ada kekal (rules mengesahkannya)
      expect(add, contains("'postId': widget.postId"));
      expect(add, contains("'parentVisibility': parentVis"));
    });

    test('hanya SATU laluan cipta komen dalam Flutter', () {
      final adds = RegExp(r"\.collection\('comments'\)\s*\n\s*\.add\(")
          .allMatches(sheet)
          .length;
      expect(adds, 1, reason: 'satu writer sahaja');
      // tiada laluan cipta komen lain di seluruh lib/
      final dir = Directory('lib');
      var others = 0;
      for (final f in dir.listSync(recursive: true).whereType<File>()) {
        if (!f.path.endsWith('.dart')) continue;
        if (f.path.endsWith('comment_sheet.dart')) continue;
        final s = f.readAsStringSync().replaceAll('\r\n', '\n');
        if (RegExp(r"\.collection\('comments'\)[\s\S]{0,80}\.add\(").hasMatch(s)) {
          others++;
        }
      }
      expect(others, 0, reason: 'tiada writer komen lain di lib/');
    });

    test('pemanggil TIDAK boleh memilih status melalui API biasa', () {
      // status ialah pemalar sisi-klien, bukan input borang/perkhidmatan
      expect(providers, contains("const kCommentStatusActive = 'active';"));
      expect(sheet.contains("'status':"), isTrue);
      // tiada parameter status yang diterima daripada UI
      expect(RegExp(r'status\s*:\s*_\w+|status\s*:\s*widget\.').hasMatch(sheet),
          isFalse);
      // dan rules turut menguatkuasakannya di pelayan
      expect(rules, contains("request.resource.data.status == 'active'"));
    });

    test('BALASAN: tiada laluan cipta balasan berasingan hari ini', () {
      // Trigger menyokong parentCommentId secara defensif, tetapi tiada
      // penulis (Flutter atau backend) yang mencipta komen post dengan
      // medan itu. Jika satu ditambah kelak, ia MESTI guna laluan create
      // yang sama (yang sudah distem aktif) atau ujian ini gagal.
      final dir = Directory('lib');
      var writers = 0;
      for (final f in dir.listSync(recursive: true).whereType<File>()) {
        if (!f.path.endsWith('.dart')) continue;
        final s = f.readAsStringSync();
        if (s.contains("'parentCommentId'")) writers++;
      }
      expect(writers, 0, reason: 'tiada penulis parentCommentId dalam lib/');
    });
  });

  group('QUERY — thread normal meminta active sahaja', () {
    test('commentsProvider ada kekangan kitaran hayat', () {
      final q = _provider(providers, 'commentsProvider');
      expect(q, contains("collection('comments')"));
      expect(q, contains(_lifecycle));
    });

    test('susunan dan had kekal', () {
      final q = _provider(providers, 'commentsProvider');
      expect(q, contains("orderBy('createdAt', descending: false)"));
      expect(q, contains('.limit(100)'));
      // kekangan diletak SEBELUM orderBy (kesetaraan dahulu)
      expect(q.indexOf(_lifecycle), lessThan(q.indexOf("orderBy('createdAt'")));
    });

    test('bentuk denylist yang lemah TIDAK digunakan', () {
      final q = _provider(providers, 'commentsProvider');
      expect(q.contains('isNotEqualTo'), isFalse,
          reason: 'status != deleted akan tetap membuang komen legasi');
    });

    test('komen dipadam bukan sebahagian query thread normal', () {
      final q = _provider(providers, 'commentsProvider');
      // kekangan pelayan menutupnya; penapis klien kekal sebagai lapisan kedua
      expect(q, contains(_lifecycle));
      expect(q, contains("c.data['status'] != 'deleted'"));
    });
  });

  group('PEMILIK — sejarah sendiri tidak dikekang secara buta', () {
    test('myCommentsProvider (komen sendiri) kekal tanpa kekangan', () {
      final q = _provider(providers, 'myCommentsProvider');
      expect(q, contains("collectionGroup('comments')"));
      expect(q, contains("where('authorUid', isEqualTo: uid)"));
      expect(q.contains(_lifecycle), isFalse,
          reason: 'pengarang berhak melihat komen legasi/dipadam sendiri');
    });

    test('userPublicRepliesProvider kekal GET per-item + try/catch', () {
      final q = _provider(providers, 'userPublicRepliesProvider');
      expect(q, contains("collection('public_reply_activity')"));
      expect(q, contains('} catch (_) {'));
      expect(q.contains(_lifecycle), isFalse);
    });
  });

  group('RULES + LEGACY', () {
    test('rules: bukan-pengarang perlu status TEPAT active', () {
      expect(rules, contains('function commentLifecycleActive(c)'));
      expect(rules, contains("return c.get('status', '') == 'active';"));
      expect(rules, contains('commentLifecycleActive(resource.data)'));
      // induk hidden/deleted kekal menutup komen
      expect(rules, contains("get('status', 'active') != 'hidden'"));
      expect(rules, contains('canReadCurrentParent'));
    });

    test('backfill sumber-sahaja wujud dan tidak dieksport', () {
      expect(
          File('functions/src/domain/feed/commentLifecycle.ts').existsSync(),
          isTrue);
      expect(
          File('functions/src/domain/feed/legacyCommentStatusBackfill.ts')
              .existsSync(),
          isTrue);
      final cli =
          _read('functions/scripts/feedPostCommentStatusBackfill.ts');
      expect(cli, contains('--mode=dry-run'));
      expect(cli, contains('assertSafeCommentBackfillInvocation'));
      expect(cli, contains('{lastUpdateTime: doc.updateTime}'));
      expect(_read('functions/src/index.ts')
          .contains('feedPostCommentStatusBackfill'), isFalse);
    });

    test('INDEX: query status-aware ada indeks komposit komen', () {
      final idx = _read('firestore.indexes.json');
      expect(idx, contains('"collectionGroup": "comments"'));
      expect(
          idx.contains('"fieldPath": "status"') &&
              idx.contains('"fieldPath": "createdAt"'),
          isTrue);
    });
  });
}
