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
  });

  final int activePollCount;
  final int unpaidBillCount;

  /// Snippet aktiviti terkini ('' = tiada; UI papar teks lalai).
  final String latestActivityText;
  final DateTime? latestPostTime;
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
  final polls = ref.watch(groupPollsProvider(groupId)).value ?? const [];
  final bills = ref.watch(groupBillsProvider(groupId)).value ?? const [];
  final posts = ref.watch(groupFeedProvider(groupId)).value ?? const [];
  return computeGroupStats(
    polls: polls,
    bills: bills.map((b) => b.$2).toList(),
    posts: posts.map((p) => p.data).toList(),
  );
});
