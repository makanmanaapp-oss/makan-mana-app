import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/events/event_types.dart';
import '../../core/providers.dart';
import 'group_providers.dart';

/// Social Prompt 6: Tong-Tong Bill ↔ post/check-in grup.
///
/// Model selamat: bil ialah dokumen KANONIK (group_bills.linkedPostId).
/// Kad feed hanya DERIVE ringkasan live dari stream bil sedia ada —
/// tiada tulisan ke feed_posts (rules melarang, dan tiada snapshot basi),
/// tiada butiran hutang individu didedahkan di feed.

/// Kiraan (dibayar, jumlah peserta) — kiraan SAHAJA, tiada nama.
(int paid, int total) billPaidCounts(Map<String, dynamic> bill) {
  final participants =
      ((bill['participants'] as List?) ?? const []).whereType<Map>();
  final paid = participants
      .where((p) =>
          p['paymentStatus'] == 'paid' || p['paymentStatus'] == 'waived')
      .length;
  return (paid, participants.length);
}

/// Baris ringkasan selamat-feed: "RM86.50 · 3/4 dah bayar".
/// TIADA nama penghutang / bukti bayaran / rujukan.
String billSummaryLine(Map<String, dynamic> bill, String paidLabel) {
  final total = (bill['totalAmount'] as num?)?.toDouble() ?? 0;
  final (paid, count) = billPaidCounts(bill);
  final parts = <String>[
    'RM${total.toStringAsFixed(2)}',
    if (count > 0) '$paid/$count $paidLabel',
  ];
  return parts.join(' · ');
}

/// Bil grup yang dipaut ke satu post ((id, data) atau null).
/// Derive dari groupBillsProvider — bacaan tertakluk rules sedia ada
/// (hanya peserta bil boleh baca), tiada query tambahan.
final billForPostProvider = Provider.autoDispose
    .family<(String, Map<String, dynamic>)?,
        ({String groupId, String postId})>((ref, arg) {
  final bills = ref.watch(groupBillsProvider(arg.groupId)).value ?? const [];
  for (final b in bills) {
    if (b.$2['linkedPostId'] == arg.postId) return b;
  }
  return null;
});

/// Lekatkan bil sedia ada pada post grup. Rules Firestore sedia ada
/// membenarkan peserta kemas kini bil selagi hostId/totalAmount kekal —
/// kita hanya tulis linkedPostId + updatedAt. Guard sama-grup di UI.
Future<void> attachBillToPost(
  WidgetRef ref, {
  required String billId,
  required String postId,
  required String groupId,
}) async {
  await FirebaseFirestore.instance
      .collection('group_bills')
      .doc(billId)
      .update({
    'linkedPostId': postId,
    'updatedAt': FieldValue.serverTimestamp(),
  }).timeout(const Duration(seconds: 10));
  ref.read(eventLoggerProvider).logEvent(
        EventType.billAttachedToPost,
        sourceScreen: 'bill_attach',
        metadata: {'groupId': groupId, 'postId': postId, 'billId': billId},
      );
}

/// Sheet pilih bil grup untuk dilekat pada post/check-in.
/// HANYA bil grup yang sama disenaraikan (guard cross-group).
Future<void> showAttachBillSheet(
  BuildContext context,
  WidgetRef ref, {
  required String groupId,
  required String postId,
}) {
  ref.read(eventLoggerProvider).logEvent(
        EventType.billAttachOpened,
        sourceScreen: 'bill_attach',
        metadata: {'groupId': groupId, 'postId': postId},
      );
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.threadsBg,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (sheetContext) => _AttachBillSheet(
      groupId: groupId,
      postId: postId,
      parentRef: ref,
    ),
  );
}

class _AttachBillSheet extends ConsumerWidget {
  const _AttachBillSheet({
    required this.groupId,
    required this.postId,
    required this.parentRef,
  });

  final String groupId;
  final String postId;
  final WidgetRef parentRef;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final billsAsync = ref.watch(groupBillsProvider(groupId));
    final bills = billsAsync.value ?? const [];
    // Belum selesai dahulu, kemudian selesai (spec SP6).
    final sorted = [
      ...bills.where((b) => (b.$2['status'] as String?) != 'settled'),
      ...bills.where((b) => (b.$2['status'] as String?) == 'settled'),
    ];

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l.t('attachBillTitle'),
              style: TextStyle(
                  color: AppColors.threadsText,
                  fontWeight: FontWeight.w800,
                  fontSize: 16),
            ),
            const SizedBox(height: 12),
            if (billsAsync.isLoading && bills.isEmpty)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (sorted.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      l.t('attachBillEmpty'),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: AppColors.threadsMuted,
                          fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 14),
                    FilledButton(
                      onPressed: () {
                        Navigator.pop(context);
                        context.push('/groups/$groupId/bills/create',
                            extra: {'postId': postId});
                      },
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primaryRed,
                        minimumSize: const Size(0, 46),
                      ),
                      child: Text(l.t('newBill')),
                    ),
                  ],
                ),
              )
            else
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 380),
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final (id, data) in sorted)
                      ListTile(
                        onTap: () async {
                          try {
                            await attachBillToPost(
                              parentRef,
                              billId: id,
                              postId: postId,
                              groupId: groupId,
                            );
                            if (context.mounted) {
                              Navigator.pop(context);
                              ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                      content:
                                          Text(l.t('billAttachedOk'))));
                            }
                          } catch (_) {
                            parentRef.read(eventLoggerProvider).logEvent(
                                  EventType.billAttachFailed,
                                  sourceScreen: 'bill_attach',
                                  metadata: {
                                    'groupId': groupId,
                                    'postId': postId,
                                    'billId': id,
                                  },
                                );
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                      content: Text(
                                          l.t('billAttachFailedMsg'))));
                            }
                          }
                        },
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 4, vertical: 2),
                        leading: Icon(
                            (data['status'] as String?) == 'settled'
                                ? Icons.check_circle_outline
                                : Icons.receipt_long_outlined,
                            size: 24,
                            color: (data['status'] as String?) == 'settled'
                                ? AppColors.openGreen
                                : AppColors.warmYellow),
                        title: Text(
                          data['placeNameSnapshot'] as String? ?? '-',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: AppColors.threadsText,
                              fontWeight: FontWeight.w700,
                              fontSize: 14),
                        ),
                        subtitle: Text(
                          '${billSummaryLine(data, l.t('paidOfLabel'))}'
                          '${data['linkedPostId'] != null ? ' · ${l.t('billLinkedBadge')}' : ''}',
                          style: TextStyle(
                              color: AppColors.threadsMuted,
                              fontSize: 12),
                        ),
                        trailing: const Icon(Icons.add_link,
                            color: AppColors.warmYellow, size: 20),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Kad ringkasan bil dalam PostCard grup (kompak, selamat-feed).
class PostBillSummaryCard extends ConsumerWidget {
  const PostBillSummaryCard({
    super.key,
    required this.groupId,
    required this.postId,
  });

  final String groupId;
  final String postId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final bill =
        ref.watch(billForPostProvider((groupId: groupId, postId: postId)));
    if (bill == null) return const SizedBox.shrink();
    final (id, data) = bill;
    final settled = (data['status'] as String?) == 'settled';

    return Container(
      margin: const EdgeInsets.only(top: 8),
      decoration: BoxDecoration(
        color: AppColors.threadsSurface,
        borderRadius: BorderRadius.circular(12),
        border:
            Border.all(color: AppColors.warmYellow.withValues(alpha: 0.4)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () {
          ref.read(eventLoggerProvider).logEvent(
                EventType.billOpenedFromPost,
                sourceScreen: 'group_feed',
                metadata: {
                  'groupId': groupId,
                  'postId': postId,
                  'billId': id,
                  'billStatus': data['status'],
                },
              );
          context.push('/tong-tong/$id');
        },
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Icon(
                  settled
                      ? Icons.check_circle_outline
                      : Icons.receipt_long_outlined,
                  size: 20,
                  color:
                      settled ? AppColors.openGreen : AppColors.warmYellow),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${l.t('billAttachAction')} · '
                      '${data['placeNameSnapshot'] as String? ?? '-'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: AppColors.threadsText,
                          fontWeight: FontWeight.w800,
                          fontSize: 12.5),
                    ),
                    Text(
                      '${billSummaryLine(data, l.t('paidOfLabel'))} · '
                      '${settled ? l.t('billSettled') : l.t('billActive')}',
                      style: TextStyle(
                          color: AppColors.threadsMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              Text(l.t('openBillCta'),
                  style: const TextStyle(
                      color: AppColors.warmYellow,
                      fontWeight: FontWeight.w800,
                      fontSize: 12.5)),
            ],
          ),
        ),
      ),
    );
  }
}
