import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';

/// Semakan admin: luluskan/tolak ulasan delivery yang pending.
/// Tile hanya kelihatan untuk users/{uid}.isAdmin == true;
/// kuatkuasa sebenar di pelayan (adminReviewAction).
class AdminScreen extends ConsumerWidget {
  const AdminScreen({super.key});

  Future<void> _act(
    BuildContext context,
    String reviewId,
    String action,
  ) async {
    final l = AppLocalizations.of(context);
    try {
      await FirebaseFunctions.instanceFor(
        region: AppConstants.functionsRegion,
      )
          .httpsCallable(
        'adminReviewAction',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 15)),
      )
          .call<Map>({'reviewId': reviewId, 'action': action});
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('postFailed'))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final pendingStream = FirebaseFirestore.instance
        .collection('place_reviews')
        .where('status', isEqualTo: 'pending')
        .orderBy('updatedAt', descending: true)
        .limit(50)
        .snapshots();

    return Scaffold(
      appBar: AppBar(title: Text(l.t('adminTitle'))),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: pendingStream,
        builder: (context, snap) {
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final docs = snap.data!.docs;
          if (docs.isEmpty) {
            return Center(
              child: Text(
                l.t('noPending'),
                style: const TextStyle(
                  color: AppColors.mutedText,
                  fontWeight: FontWeight.w600,
                ),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            itemCount: docs.length,
            separatorBuilder: (context, i) => const SizedBox(height: 12),
            itemBuilder: (context, i) {
              final d = docs[i].data();
              final rating = (d['rating'] as num?)?.toInt() ?? 0;
              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.cardWhite,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.softBorder),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            d['placeName'] as String? ?? '-',
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        Text('★' * rating,
                            style: const TextStyle(fontSize: 12)),
                      ],
                    ),
                    Text(
                      d['displayName'] as String? ?? '-',
                      style: const TextStyle(
                        color: AppColors.mutedText,
                        fontSize: 12.5,
                      ),
                    ),
                    if ((d['text'] as String?)?.isNotEmpty ?? false)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(
                          d['text'] as String,
                          style: const TextStyle(fontSize: 13.5),
                        ),
                      ),
                    if (d['imageUrl'] != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Image.network(
                            d['imageUrl'] as String,
                            height: 140,
                            width: double.infinity,
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () =>
                                _act(context, docs[i].id, 'approve'),
                            style: ElevatedButton.styleFrom(
                              minimumSize: const Size(0, 42),
                              backgroundColor: AppColors.openGreen,
                            ),
                            child: Text(l.t('approveAction')),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () =>
                                _act(context, docs[i].id, 'reject'),
                            style: OutlinedButton.styleFrom(
                                minimumSize: const Size(0, 42)),
                            child: Text(l.t('rejectAction')),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
