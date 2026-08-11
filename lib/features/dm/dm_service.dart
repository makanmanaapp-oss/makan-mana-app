import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/events/event_types.dart';
import '../../core/providers.dart';

/// Social Prompt 7: DM V1 — mesej peribadi 1-lawan-1.
///
/// Model: dm_threads/{threadId} + subkoleksi messages.
/// threadId DETERMINISTIK = uid disusun abjad, dicantum '_' — dua
/// pengguna sentiasa kongsi satu thread, tiada duplikasi.
/// PRIVASI: rules Firestore hanya benarkan 2 peserta (uid dalam
/// threadId) baca/tulis; blok dikuatkuasa DI RULES pada penciptaan
/// mesej (semak dokumen blocks/{blocker}_{blocked} dua arah).

/// ID thread deterministik untuk pasangan uid (tulen, diuji unit).
String dmThreadId(String uidA, String uidB) {
  final pair = [uidA, uidB]..sort();
  return pair.join('_');
}

/// Uid rakan sembang dari senarai peserta (tulen).
String dmOtherUid(List<dynamic> participantUids, String myUid) {
  for (final u in participantUids) {
    if (u is String && u != myUid) return u;
  }
  return '';
}

/// Snippet mesej terakhir untuk inbox (dipotong, satu baris).
String dmSnippet(String text) {
  final t = text.trim().replaceAll('\n', ' ');
  return t.length <= 80 ? t : '${t.substring(0, 80)}…';
}

/// Thread DM saya (inbox). Tiada orderBy server (elak indeks komposit
/// arrayContains+orderBy) — susun di client ikut lastMessageAt.
final myDmThreadsProvider =
    StreamProvider.autoDispose<List<(String, Map<String, dynamic>)>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('dm_threads')
      .where('participantUids', arrayContains: uid)
      .limit(100)
      .snapshots()
      .map((snap) {
        final list = snap.docs.map((d) => (d.id, d.data())).toList()
          ..sort((a, b) {
            final ta = a.$2['lastMessageAt'];
            final tb = b.$2['lastMessageAt'];
            final da = ta is Timestamp ? ta.toDate() : DateTime(2000);
            final db = tb is Timestamp ? tb.toDate() : DateTime(2000);
            return db.compareTo(da);
          });
        return list;
      })
      // Ralat (contoh: rules belum aktif) → emit kosong, bukan spinner
      // selamanya; inbox papar empty state jujur.
      .transform(StreamTransformer.fromHandlers(
        handleError: (e, st, sink) =>
            sink.add(const <(String, Map<String, dynamic>)>[]),
      ));
});

/// Satu thread (live) — null jika belum wujud.
final dmThreadProvider = StreamProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, threadId) {
  if (!ref.watch(firebaseReadyProvider) || threadId.isEmpty) {
    return Stream.value(null);
  }
  return FirebaseFirestore.instance
      .collection('dm_threads')
      .doc(threadId)
      .snapshots()
      .map((snap) => snap.data())
      .transform(StreamTransformer.fromHandlers(
        handleError: (e, st, sink) => sink.add(null),
      ));
});

/// Mesej satu thread, kronologi (200 terkini).
final dmMessagesProvider = StreamProvider.autoDispose
    .family<List<(String, Map<String, dynamic>)>, String>((ref, threadId) {
  if (!ref.watch(firebaseReadyProvider) || threadId.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('dm_threads')
      .doc(threadId)
      .collection('messages')
      .orderBy('createdAt', descending: false)
      .limitToLast(200)
      .snapshots()
      .map((snap) => snap.docs.map((d) => (d.id, d.data())).toList());
});

/// Jumlah belum baca saya merentas semua thread (badge inbox).
final dmTotalUnreadProvider = Provider.autoDispose<int>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  final threads = ref.watch(myDmThreadsProvider).value ?? const [];
  var total = 0;
  for (final (_, data) in threads) {
    final counts = (data['unreadCounts'] as Map?) ?? const {};
    total += (counts[uid] as num?)?.toInt() ?? 0;
  }
  return total;
});

/// Hantar mesej teks. Batch atomik: dokumen mesej + metadata thread
/// (last message, unread penerima +1). Melempar jika gagal — UI mesti
/// papar ralat jujur. TIADA teks mesej dilog ke events.
Future<void> sendDmMessage(
  WidgetRef ref, {
  required String myUid,
  required String otherUid,
  required String text,
}) async {
  final trimmed = text.trim();
  if (trimmed.isEmpty || trimmed.length > 1000) {
    throw ArgumentError('bad message');
  }
  if (myUid.isEmpty || otherUid.isEmpty || myUid == otherUid) {
    throw ArgumentError('bad participants');
  }
  final threadId = dmThreadId(myUid, otherUid);
  final db = FirebaseFirestore.instance;
  final threadRef = db.collection('dm_threads').doc(threadId);
  final msgRef = threadRef.collection('messages').doc();
  final batch = db.batch();
  batch.set(msgRef, {
    'threadId': threadId,
    'senderId': myUid,
    'receiverId': otherUid,
    'text': trimmed,
    'type': 'text',
    'status': 'sent',
    'createdAt': FieldValue.serverTimestamp(),
    'clientTs': DateTime.now().millisecondsSinceEpoch,
  });
  batch.set(
    threadRef,
    {
      // Nilai sama setiap kali → tidak dikira "berubah" oleh rules update.
      'participantUids': [myUid, otherUid]..sort(),
      'lastMessageText': dmSnippet(trimmed),
      'lastMessageSenderId': myUid,
      'lastMessageAt': FieldValue.serverTimestamp(),
      'lastMessageType': 'text',
      'updatedAt': FieldValue.serverTimestamp(),
      'unreadCounts': {otherUid: FieldValue.increment(1)},
    },
    SetOptions(merge: true),
  );
  await batch.commit().timeout(const Duration(seconds: 15));
  ref.read(eventLoggerProvider).logEvent(
        EventType.dmMessageSent,
        sourceScreen: 'dm_conversation',
        metadata: {
          'threadId': threadId,
          'otherUserId': otherUid,
          'messageLength': trimmed.length,
        },
      );
}

/// Tanda thread dibaca (unread saya → 0). Hanya bila thread wujud.
Future<void> markDmRead(
  WidgetRef ref, {
  required String threadId,
  required String myUid,
  required int currentUnread,
}) async {
  if (currentUnread <= 0) return;
  try {
    await FirebaseFirestore.instance
        .collection('dm_threads')
        .doc(threadId)
        .set({
      'unreadCounts': {myUid: 0},
    }, SetOptions(merge: true)).timeout(const Duration(seconds: 10));
    ref.read(eventLoggerProvider).logEvent(
          EventType.dmMarkRead,
          sourceScreen: 'dm_conversation',
          metadata: {'threadId': threadId},
        );
  } catch (_) {
    // Bukan kritikal — unread akan cuba ditanda lagi lain kali.
  }
}
