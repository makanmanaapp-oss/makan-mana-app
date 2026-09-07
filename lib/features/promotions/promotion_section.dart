import 'package:flutter/material.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import 'promotion.dart';

/// WAVE 4 — public offer strip on canonical Restaurant Detail.
///
/// Deliberately small: it is one more section inside the existing Profil tab,
/// not a redesign. A restaurant with no live offer renders NOTHING — an empty
/// promotional card would be a worse answer than silence, and Wave 5 owns
/// discovery, not this screen.
///
/// Every entry here was already filtered server-side (active, inside its
/// window, eligible for this viewer), so this widget never re-decides
/// visibility from the device clock.
class PromotionSection extends StatelessWidget {
  const PromotionSection({super.key, required this.promotions});

  final List<Promotion> promotions;

  @override
  Widget build(BuildContext context) {
    if (promotions.isEmpty) return const SizedBox.shrink();
    final t = AppLocalizations.of(context);
    final mm = context.mm;

    return Padding(
      key: const Key('restaurant-promotions'),
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            t.t('promoPublicTitle'),
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: mm.onCard,
            ),
          ),
          const SizedBox(height: 10),
          for (final promo in promotions) _card(context, t, mm, promo),
        ],
      ),
    );
  }

  Widget _card(
    BuildContext context,
    AppLocalizations t,
    MMColors mm,
    Promotion promo,
  ) {
    final minSpend = formatMinSpend(promo.minSpendSen);
    return Container(
      key: Key('restaurant-promotion-${promo.promotionId}'),
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: mm.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: mm.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.local_offer_outlined, size: 18, color: mm.chipText),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  promo.title,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: mm.onCard,
                  ),
                ),
              ),
              if (promo.offerLabel.isNotEmpty)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: mm.chipBackground,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    promo.offerLabel,
                    style: TextStyle(
                      color: mm.chipText,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
            ],
          ),
          if (promo.description.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                promo.description,
                style: TextStyle(color: mm.onCardMuted, fontSize: 13, height: 1.35),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Wrap(
              spacing: 12,
              runSpacing: 4,
              children: [
                Text(
                  '${t.t('promoPublicUntil')} ${_date(promo.endsAt)}',
                  style: TextStyle(color: mm.onCardMuted, fontSize: 12.5),
                ),
                if (minSpend != null)
                  Text(
                    '${t.t('promoPublicMinSpend')} $minSpend',
                    style: TextStyle(color: mm.onCardMuted, fontSize: 12.5),
                  ),
              ],
            ),
          ),
          if (promo.terms.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                '${t.t('promoPublicTerms')}: ${promo.terms}',
                style: TextStyle(color: mm.onCardMuted, fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }

  static String _date(DateTime value) =>
      '${value.day.toString().padLeft(2, '0')}/'
      '${value.month.toString().padLeft(2, '0')}/${value.year}';
}
