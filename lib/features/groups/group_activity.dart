import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../social/social_providers.dart';
import 'group_providers.dart';

/// Social Prompt 5: ringkasan aktiviti grup dikira CLIENT-side daripada
/// data sedia ada (post/undian/bil yang sudah dimuat) — tiada Cloud
/// Function baharu, tiada kiraan palsu.
class GroupQuickStats {
  const GroupQuickStats({
    this.activePollCount = 0,
    this.unpaidBillCount = 0,
    this.latestActivityText = '',
    this.latestPostTime,
    this.unavailable = false,
  });

  final int activePollCount;
  final int unpaidBillCount;

  /// Snippet aktiviti terkini ('' = tiada; UI papar teks lalai).
  final String latestActivityText;
  final DateTime? latestPostTime;

  /// Sekurang-kurangnya satu bacaan asas GAGAL (contohnya ditolak oleh rules).
  /// Statistik di bawah TIDAK boleh dipercayai dan UI mesti berhenti daripada
  /// mendakwa "tiada aktiviti" - bacaan yang gagal bukan jawapan sifar.
  final bool unavailable;
}

/// Kira stats daripada senarai mentah. Tulen — boleh diuji unit.
GroupQuickStats computeGroupStats({
  required List<Map<String, dynamic>> polls,
  required List<Map<String, dynamic>> bills,
  required List<Map<String, dynamic>> posts,
}) {
  final activePolls =
      polls.where((p) => (p['status'] as String?) == 'open').length;
  // Bil "belum selesai" = status bukan settled. KIRAAN sahaja didedahkan —
  // tiada butiran siapa belum bayar (privasi; butiran kekal dalam bil).
  final unpaidBills =
      bills.where((b) => (b['status'] as String?) != 'settled').length;

  String latest = '';
  DateTime? latestTime;
  for (final p in posts) {
    if (p['status'] == 'deleted') continue;
    final ts = p['createdAt'];
    final t = ts is Timestamp ? ts.toDate() : null;
    if (latestTime != null && (t == null || !t.isAfter(latestTime))) {
      continue;
    }
    latestTime = t ?? latestTime;
    final name = p['displayName'] as String? ?? 'Foodie';
    final place = p['placeName'] as String? ?? '';
    final text = (p['text'] as String? ?? '').trim();
    if (p['type'] == 'checkin' && place.isNotEmpty) {
      latest = '$name · $place';
    } else if (text.isNotEmpty) {
      latest = '$name: ${text.length > 40 ? '${text.substring(0, 40)}…' : text}';
    } else {
      latest = name;
    }
    if (t == null) break; // tiada masa — ambil yang pertama sahaja
  }
  return GroupQuickStats(
    activePollCount: activePolls,
    unpaidBillCount: unpaidBills,
    latestActivityText: latest,
    latestPostTime: latestTime,
  );
}

/// Stats live satu grup — gabung provider sedia ada (autoDispose,
/// stream dikongsi dengan tab hub jadi tiada bacaan tambahan besar).
final groupQuickStatsProvider = Provider.autoDispose
    .family<GroupQuickStats, String>((ref, groupId) {
  // `AsyncValue.value` MELONTAR pada keadaan ralat (riverpod 2.6.1,
  // common.dart:493) - jadi `.value ?? const []` ialah penjaga PALSU dan
  // melontar semula bacaan yang ditolak. Satu bacaan grup yang ditolak
  // meruntuhkan keseluruhan tab Grup menjadi kotak ralat kelabu Flutter.
  final pollsA = ref.watch(groupPollsProvider(groupId));
  final billsA = ref.watch(groupBillsProvider(groupId));
  final postsA = ref.watch(groupFeedProvider(groupId));

  final polls = pollsA.valueOrNull ?? const [];
  final bills = billsA.valueOrNull ?? const [];
  final posts = postsA.valueOrNull ?? const [];

  // Bacaan yang GAGAL bukan jawapan sifar.
  if (pollsA.hasError || billsA.hasError || postsA.hasError) {
    return const GroupQuickStats(unavailable: true);
  }

  return computeGroupStats(
    polls: polls,
    bills: bills.map((b) => b.$2).toList(),
    posts: posts.map((p) => p.data).toList(),
  );
});
