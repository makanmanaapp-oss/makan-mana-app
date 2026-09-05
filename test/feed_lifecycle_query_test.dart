// WAVE 3C — sempadan bacaan kitaran hayat siaran (feed_posts.status).
//
// Penguatkuasaan sebenar ada di firestore.rules (dibuktikan oleh
// functions `npm run test:rules` — postLifecycleRules.test.ts). Ujian ini
// menjaga separuh KLIEN bagi invarian empat bahagian:
//
//   RULES   : bukan-pemilik perlu status == 'active'
//   QUERY   : setiap query senarai bukan-pemilik MEMINTA status == 'active'
//   WRITERS : setiap siaran baharu menerima status 'active'
//   LEGACY  : normalisasi sumber-sahaja wujud
//
// Ini KRITIKAL, bukan kosmetik: query senarai Firestore GAGAL SEPENUHNYA
// (permission-denied) jika ia boleh memulangkan dokumen yang rules tolak.
// Query senarai tanpa kekangan ini akan mematikan feed selepas rules deploy.
//
// Tiada kerja UI di sini — kekangan data sahaja.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/social/post_visibility_rules.dart';

/// Baca sumber dengan hujung baris dinormalkan (repo ini CRLF).
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

const _lifecycleConstraint = "where('status', isEqualTo: kPostStatusActive)";

void main() {
  final providers =
      _read('lib/features/social/social_providers.dart');
  final rules = _read('firestore.rules');
  final visibility =
      _read('lib/features/social/post_visibility_rules.dart');

  group('query bukan-pemilik WAJIB minta status active', () {
    test('publicFeedProvider', () {
      final q = _provider(providers, 'publicFeedProvider');
      expect(q, contains("collection('feed_posts')"));
      expect(q, contains("where('visibility', isEqualTo: 'public')"));
      expect(q, contains(_lifecycleConstraint));
    });

    test('followingFeedProvider', () {
      final q = _provider(providers, 'followingFeedProvider');
      expect(q, contains("where('authorUid', whereIn: slice)"));
      expect(q, contains(_lifecycleConstraint));
    });

    test('trendingFeedProvider', () {
      final q = _provider(providers, 'trendingFeedProvider');
      expect(q, contains("orderBy('likeCount', descending: true)"));
      expect(q, contains(_lifecycleConstraint));
    });

    test('groupFeedProvider — senarai grup memulangkan siaran ahli lain', () {
      final q = _provider(providers, 'groupFeedProvider');
      expect(q, contains("where('groupId', isEqualTo: groupId)"));
      expect(q, contains(_lifecycleConstraint));
    });

    test('userPublicPostsProvider — HANYA cabang profil orang lain', () {
      final q = _provider(providers, 'userPublicPostsProvider');
      // cabang bukan-pemilik: public + kitaran hayat
      expect(
          q,
          contains('base\n'
              "          .where('visibility', isEqualTo: 'public')\n"
              "          .where('status', isEqualTo: kPostStatusActive)"));
      // cabang PROFIL SENDIRI kekal tanpa kekangan kitaran hayat
      expect(q, contains("base.where('groupId', isNull: true)"));
      expect(
          q,
          isNot(contains(
              "base.where('groupId', isNull: true)\n          .where('status'")),
          reason: 'pemilik mesti kekal nampak sejarahnya sendiri');
    });
  });

  group('query PEMILIK-SAHAJA tidak boleh dikekang', () {
    test('myPostsProvider tiada kekangan status di pelayan', () {
      final q = _provider(providers, 'myPostsProvider');
      expect(q, contains("where('authorUid', isEqualTo: uid)"));
      expect(q, isNot(contains(_lifecycleConstraint)),
          reason: 'pemilik berhak melihat siaran sendiri yang disorok/dipadam');
      // penapis UI sedia ada kekal (deleted tidak dipapar)
      expect(q, contains("p.data['status'] != 'deleted'"));
    });

    test('myCommentsProvider (komen sendiri) tidak dikekang', () {
      final q = _provider(providers, 'myCommentsProvider');
      expect(q, contains("collectionGroup('comments')"));
      expect(q, isNot(contains(_lifecycleConstraint)));
    });
  });

  group('bacaan dokumen tunggal bergantung pada rules, bukan query', () {
    test('postByIdProvider ialah doc-get (rules yang menutup sempadan)', () {
      final saved =
          _read('lib/features/social/saved_posts.dart');
      expect(saved, contains("collection('feed_posts')"));
      expect(saved, contains('.doc(postId)'));
      // tiada kekangan query pada doc-get; rules menolak hidden/deleted
      expect(saved, isNot(contains(_lifecycleConstraint)));
    });

    test('userPublicRepliesProvider guna GET per-item + try/catch', () {
      final q = _provider(providers, 'userPublicRepliesProvider');
      expect(q, contains("collection('public_reply_activity')"));
      expect(q, contains('} catch (_) {'));
    });
  });

  group('cermin klien selari dengan firestore.rules', () {
    test('rules: bukan-pemilik perlu status TEPAT active', () {
      expect(rules, contains('function postLifecycleActive(p)'));
      expect(rules, contains("p.get('status', '') == 'active'"));
      expect(rules, contains('postLifecycleActive(p)'));
    });

    test('canReadPost menolak hidden/deleted/tiada/tidak-dikenali', () {
      expect(visibility, contains("post['status'] != postStatusActive"));
      const stranger = ViewerContext(uid: 'B');
      const owner = ViewerContext(uid: 'A');
      Map<String, dynamic> p(Object? status) => {
            'authorUid': 'A',
            'visibility': 'public',
            if (status != null) 'status': status,
          };
      expect(canReadPost(p('active'), stranger), isTrue);
      expect(canReadPost(p('hidden'), stranger), isFalse);
      expect(canReadPost(p('deleted'), stranger), isFalse);
      expect(canReadPost(p('quarantined'), stranger), isFalse);
      expect(canReadPost(p(null), stranger), isFalse, reason: 'legasi tanpa status');
      // pengarang kekal nampak semuanya
      for (final s in [null, 'active', 'hidden', 'deleted', 'quarantined']) {
        expect(canReadPost(p(s), owner), isTrue, reason: 'pemilik: $s');
      }
    });

    test('pemalar klien dan pelayan sepadan', () {
      expect(postStatusActive, 'active');
      expect(providers, contains("const kPostStatusActive = 'active';"));
      final backend =
          _read('functions/src/domain/feed/postLifecycle.ts');
      expect(backend, contains('export const NEW_POST_STATUS'));
      expect(backend, contains('POST_STATUS_ACTIVE'));
    });
  });

  group('invarian empat bahagian lengkap', () {
    test('WRITERS: setiap pencipta feed_posts melahirkan status active', () {
      for (final f in const [
        'functions/src/callable/createFeedPost.ts',
        'functions/src/callable/repostFeedPost.ts',
        'functions/src/callable/submitReview.ts',
        'functions/src/triggers/onReviewApproved.ts',
      ]) {
        expect(_read(f), contains('newPostLifecycleFields()'),
            reason: f);
      }
      expect(
          _read('functions/src/domain/restaurantEngagement/restaurantPost.ts'),
          contains('status: NEW_POST_STATUS'));
    });

    test('LEGACY: mekanisme normalisasi sumber-sahaja wujud (tidak dijalankan)',
        () {
      final cli =
          _read('functions/scripts/feedPostStatusBackfill.ts');
      expect(cli, contains('--mode=dry-run'));
      expect(cli, contains('assertSafeBackfillInvocation'));
      // tulisan per-dokumen BERSYARAT pada versi yang dibaca — moderasi yang
      // berlaku antara imbasan dan tulisan TIDAK boleh ditulis ganti
      expect(cli, contains('{lastUpdateTime: doc.updateTime}'));
      // imbasan terpotong mesti dibuktikan, bukan diandaikan
      expect(cli, contains('truncated = !probe.empty;'));
      expect(File('functions/src/domain/feed/legacyStatusBackfill.ts').existsSync(),
          isTrue);
      // ia BUKAN sebahagian permukaan fungsi yang di-deploy
      expect(_read('functions/src/index.ts'),
          isNot(contains('feedPostStatusBackfill')));
    });

    test('INDEXES: setiap query status-aware ada indeks komposit', () {
      final idx = _read('firestore.indexes.json');
      // status muncul untuk feed_posts sebanyak 4 kali (4 indeks baharu)
      final feedStatus = RegExp(r'"fieldPath": "status"').allMatches(idx).length;
      expect(feedStatus, greaterThanOrEqualTo(4));
    });
  });
}
