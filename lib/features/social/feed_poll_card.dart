import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import 'social_providers.dart';

/// QA-DEV17 — kad undian FEED interaktif (postType:"poll").
///
/// Berkunci [postId] (BUKAN groupId/pollId) — tiada keperluan grup. Menggunakan
/// gaya visual yang sama seperti kad undian grup, tetapi menghantar undi melalui
/// `voteFeedPoll` dan membaca undi sendiri melalui [feedPollVoteProvider].
/// Kiraan dikemas kini melalui aliran Firestore realtime feed (post induk).
class FeedPollCard extends ConsumerStatefulWidget {
  const FeedPollCard({super.key, required this.postId, required this.poll});

  final String postId;

  /// Peta poll dari dokumen post: {question, options:[{key,label,votes}],
  /// totalVotes, status}. Post lama tanpa poll TIDAK memanggil kad ini.
  final Map<String, dynamic> poll;

  @override
  ConsumerState<FeedPollCard> createState() => _FeedPollCardState();
}

class _FeedPollCardState extends ConsumerState<FeedPollCard> {
  bool _voting = false;

  Future<void> _vote(String optionKey, String? myVote) async {
    // Guard double-tap (elak undi berganda semasa panggilan berjalan).
    if (_voting || optionKey == myVote) return;
    setState(() => _voting = true);
    final l = AppLocalizations.of(context);
    try {
      await ref
          .read(socialServiceProvider)
          .voteFeedPoll(widget.postId, optionKey);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l.t('postFailed'))));
      }
    } finally {
      if (mounted) setState(() => _voting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final options = ((widget.poll['options'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
    final total = (widget.poll['totalVotes'] as num?)?.toInt() ?? 0;
    final isOpen = (widget.poll['status'] as String?) != 'closed';
    final myVote = ref.watch(feedPollVoteProvider(widget.postId)).value;

    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.threadsSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.threadsBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('🗳️', style: TextStyle(fontSize: 15)),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  widget.poll['question'] as String? ?? '',
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: AppColors.threadsText),
                ),
              ),
              if (!isOpen)
                Text(l.t('pollClosed'),
                    style: TextStyle(
                        fontSize: 11.5,
                        color: AppColors.threadsMuted,
                        fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 10),
          for (final opt in options)
            _optionBar(l, opt, total, myVote, isOpen),
          const SizedBox(height: 2),
          Row(
            children: [
              Text('$total ${l.t('votesLabel')}',
                  style: TextStyle(
                      fontSize: 11.5, color: AppColors.threadsMuted)),
              if (_voting) ...[
                const SizedBox(width: 8),
                const SizedBox(
                    height: 11,
                    width: 11,
                    child: CircularProgressIndicator(strokeWidth: 1.6)),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _optionBar(
    AppLocalizations l,
    Map<String, dynamic> opt,
    int total,
    String? myVote,
    bool isOpen,
  ) {
    final key = opt['key'] as String? ?? '';
    final votes = (opt['votes'] as num?)?.toInt() ?? 0;
    final pct = total == 0 ? 0.0 : votes / total;
    final selected = myVote == key;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: (isOpen && !_voting) ? () => _vote(key, myVote) : null,
        borderRadius: BorderRadius.circular(12),
        child: Stack(
          children: [
            Container(
              height: 42,
              decoration: BoxDecoration(
                color: AppColors.threadsBg,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: selected
                        ? AppColors.primaryRed
                        : AppColors.threadsBorder),
              ),
            ),
            FractionallySizedBox(
              widthFactor: pct.clamp(0.0, 1.0),
              child: Container(
                height: 42,
                decoration: BoxDecoration(
                  color: selected
                      ? AppColors.primaryRed.withValues(alpha: 0.22)
                      : AppColors.softYellow.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            Positioned.fill(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: [
                    if (selected)
                      const Padding(
                        padding: EdgeInsets.only(right: 6),
                        child: Icon(Icons.check_circle,
                            size: 16, color: AppColors.primaryRed),
                      ),
                    Expanded(
                      child: Text(opt['label'] as String? ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontWeight: selected
                                  ? FontWeight.w800
                                  : FontWeight.w600,
                              fontSize: 13.5,
                              color: AppColors.threadsText)),
                    ),
                    Text('${(pct * 100).round()}%',
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 12.5,
                            color: AppColors.threadsText)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
