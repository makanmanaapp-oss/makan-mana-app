/// Front Page Redesign 1 — providers Notification Center (berskop UID).
///
/// KESELAMATAN AKAUN: setiap provider `watch(currentUidProvider)`. Bila UID
/// bertukar (tukar akaun) atau log keluar, provider di-rebuild → senarai lama
/// & kiraan belum-baca lama DIBUANG, listener lama berhenti, listener baharu
/// bermula. Tiada data akaun terdahulu bocor. Kiraan belum-baca SENTIASA dari
/// dokumen sebenar (tiada kiraan palsu).
library;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'notification_model.dart';

/// Strim notifikasi pengguna semasa (users/{uid}/notifications, terbaru dulu).
/// Kosong bila belum log masuk / Firebase belum sedia (fail-safe).
final notificationsStreamProvider =
    StreamProvider.autoDispose<List<MakanNotification>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const <MakanNotification>[]);
  }
  final q = FirebaseFirestore.instance
      .collection('users')
      .doc(uid)
      .collection('notifications')
      .orderBy('createdAt', descending: true)
      .limit(30);
  return q.snapshots().map((snap) {
    final now = DateTime.now();
    final out = <MakanNotification>[];
    for (final d in snap.docs) {
      final n = MakanNotification.fromMap(d.id, d.data());
      // Sembunyi notifikasi luput (tidak dipapar, tidak dikira).
      if (n.expiresAt != null && n.expiresAt!.isBefore(now)) continue;
      // PROMPT 4A: rekod push-sahaja (In-App OFF) TIDAK dipapar & TIDAK dikira
      // dalam badge belum-baca; ia wujud hanya untuk resolusi ketuk push.
      if (!n.inAppVisible) continue;
      out.add(n);
    }
    return out;
  });
});

/// Fetches one historical page after the live first page. This is intentionally
/// a one-shot query: only the newest 30 notifications need a realtime listener.
final olderNotificationsProvider = FutureProvider.autoDispose
    .family<List<MakanNotification>, NotificationPageCursor>(
  (ref, cursor) => ref.read(notificationRepositoryProvider).fetchOlder(cursor),
);

/// Kiraan belum-baca AUTHORITATIF (diterbit dari strim sebenar). 0 = tiada badge.
final unreadNotificationCountProvider = Provider.autoDispose<int>((ref) {
  final async = ref.watch(notificationsStreamProvider);
  return async.maybeWhen(
    data: (list) => list.where((n) => !n.isRead).length,
    orElse: () => 0,
  );
});

/// Label badge loceng dari kiraan sebenar: 0 → null (tiada badge); 1–99 →
/// nombor; 100+ → "99+". Diasingkan supaya boleh diuji unit.
String? notificationBadgeLabel(int count) {
  if (count <= 0) return null;
  if (count > 99) return '99+';
  return count.toString();
}

/// Repo tindakan keadaan-baca (hanya medan selamat pada notifikasi sendiri).
class NotificationRepository {
  NotificationRepository({required this.uid, required this.firebaseReady});
  final String uid;
  final bool firebaseReady;

  CollectionReference<Map<String, dynamic>>? get _col {
    if (!firebaseReady || uid.isEmpty) return null;
    return FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('notifications');
  }

  /// Tanda satu notifikasi dibuka/dibaca. Rules membenarkan hanya state milik
  /// penerima; kandungan/destinasi tidak pernah boleh ditulis klien.
  Future<void> markOpened(String id) async {
    final col = _col;
    if (col == null || id.isEmpty) return;
    try {
      await col.doc(id).set(
        {
          'isRead': true,
          'readAt': FieldValue.serverTimestamp(),
          'openedAt': FieldValue.serverTimestamp(),
          'status': 'read',
        },
        SetOptions(merge: true),
      );
    } catch (e) {
      debugPrint('MakanMana: markOpened gagal: $e');
    }
  }

  /// Tanda semua belum-baca sebagai dibaca (batch, medan keadaan-baca sahaja).
  Future<void> markAllRead(Iterable<String> unreadIds) async {
    final col = _col;
    if (col == null) return;
    try {
      final batch = FirebaseFirestore.instance.batch();
      var n = 0;
      for (final id in unreadIds) {
        if (id.isEmpty) continue;
        batch.set(
          col.doc(id),
          {
            'isRead': true,
            'readAt': FieldValue.serverTimestamp(),
            'status': 'read',
          },
          SetOptions(merge: true),
        );
        n++;
        if (n >= 400) break; // had selamat batch
      }
      if (n > 0) await batch.commit();
    } catch (e) {
      debugPrint('MakanMana: markAllRead gagal: $e');
    }
  }

  /// Loads one bounded page after [cursor], preserving Firestore's stable
  /// createdAt + document-id ordering. It never subscribes to old history.
  Future<List<MakanNotification>> fetchOlder(
      NotificationPageCursor cursor) async {
    final col = _col;
    if (col == null) return const [];
    try {
      final snap = await col
          .orderBy('createdAt', descending: true)
          .orderBy(FieldPath.documentId)
          .startAfter([
            Timestamp.fromDate(cursor.createdAt),
            cursor.id,
          ])
          .limit(30)
          .get();
      final now = DateTime.now();
      return snap.docs
          .map((doc) => MakanNotification.fromMap(doc.id, doc.data()))
          .where((n) => n.expiresAt == null || !n.expiresAt!.isBefore(now))
          .where((n) => n.inAppVisible) // PROMPT 4A: hide push-only records
          .toList(growable: false);
    } catch (e) {
      debugPrint('MakanMana: load older notifications gagal: $e');
      return const [];
    }
  }
}

/// Cursor contract for a later "load more" button. The live Home badge and
/// first Notification Center page intentionally share one 30-document stream;
/// no unbounded history listener is created.
class NotificationPageCursor {
  const NotificationPageCursor(this.createdAt, this.id);
  final DateTime createdAt;
  final String id;
}

NotificationPageCursor? notificationNextPageCursor(
  List<MakanNotification> notifications,
) {
  if (notifications.isEmpty) return null;
  final oldest = notifications.reduce(
    (a, b) => a.createdAt.isBefore(b.createdAt) ? a : b,
  );
  return NotificationPageCursor(oldest.createdAt, oldest.id);
}

final notificationRepositoryProvider =
    Provider.autoDispose<NotificationRepository>((ref) {
  return NotificationRepository(
    uid: ref.watch(currentUidProvider),
    firebaseReady: ref.watch(firebaseReadyProvider),
  );
});
