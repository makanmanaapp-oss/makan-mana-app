/// PART 1 Phase 1.9 — primitif kad kedai kanonikal (boleh guna semula).
///
/// SEMUA kad kanonikal dibina daripada primitif ini supaya peraturan JUJUR
/// dikuatkuasa di satu tempat:
/// - rating tiada  -> tidak dipapar (JANGAN 0.0)
/// - harga unknown -> label l10n "Harga belum diketahui" (JANGAN reka RM)
/// - waktu unknown -> "Waktu belum disahkan" (JANGAN "Buka")
/// - halal/alahan ikut BUKTI sahaja
/// - sample DILABEL dengan jelas & tiada tindakan live
///
/// TIADA logik skor di sini — hanya paparan payload dari PlaceCardViewModel.
library;

import 'package:flutter/material.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/widgets/place_image.dart';
import 'place_card_view_model.dart';

/// Radius standard kad.
const double kPlaceCardRadius = 16;

// ---------------------------------------------------------------------------
// GAMBAR
// ---------------------------------------------------------------------------

/// Imej kad: foto diluluskan jika ada, jika tidak fallback monogram
/// deterministik (guna PlaceImage sedia ada). Tiada emoji.
class PlaceCardImage extends StatelessWidget {
  const PlaceCardImage({
    super.key,
    required this.model,
    required this.title,
    this.width,
    this.height,
    this.borderRadius = kPlaceCardRadius,
  });

  final CardImageModel model;
  final String title;
  final double? width;
  final double? height;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Semantics(
      label: t.t(model.semanticLabelKey),
      image: true,
      child: PlaceImage(
        name: title,
        photoUrl: model.hasApprovedImage ? model.url : null,
        width: width,
        height: height,
        borderRadius: borderRadius,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// TAJUK + FAKTA RINGKAS
// ---------------------------------------------------------------------------

/// Tajuk + sari kata kad (guna token tema; jangan hardcode warna).
class PlaceCardHeader extends StatelessWidget {
  const PlaceCardHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.maxTitleLines = 1,
    this.dense = false,
  });

  final String title;
  final String? subtitle;
  final int maxTitleLines;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          title,
          maxLines: maxTitleLines,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: mm.onCard,
            fontSize: dense ? 14.5 : 16,
            fontWeight: FontWeight.w700,
            height: 1.15,
          ),
        ),
        if (subtitle != null && subtitle!.isNotEmpty) ...[
          const SizedBox(height: 2),
          Text(
            subtitle!,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: mm.onCardMuted, fontSize: 12.5),
          ),
        ],
      ],
    );
  }
}

/// Baris fakta ringkas: rating • harga • jarak • status waktu.
/// Setiap bahagian hanya muncul bila data JUJUR wujud.
class PlaceQuickFacts extends StatelessWidget {
  const PlaceQuickFacts({super.key, required this.vm, this.dense = false});

  final PlaceCardViewModel vm;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    final parts = <Widget>[];

    final rating = PlaceRatingLabel(model: vm.rating, dense: dense);
    if (vm.rating.hasRating) parts.add(rating);

    if (vm.distanceKm != null) {
      parts.add(_fact(mm, '${vm.distanceKm!.toStringAsFixed(1)} km'));
    }

    parts.add(PlacePriceLabel(model: vm.price, dense: dense));

    if (parts.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 8,
      runSpacing: 4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: _withDots(parts, mm),
    );
  }

  List<Widget> _withDots(List<Widget> items, MMColors mm) {
    final out = <Widget>[];
    for (var i = 0; i < items.length; i++) {
      if (i > 0) {
        out.add(Text('·', style: TextStyle(color: mm.onCardFaint)));
      }
      out.add(items[i]);
    }
    return out;
  }

  Widget _fact(MMColors mm, String text) => Text(
        text,
        style: TextStyle(
          color: mm.onCardMuted,
          fontSize: dense ? 12 : 12.5,
          fontWeight: FontWeight.w500,
        ),
      );
}

// ---------------------------------------------------------------------------
// STATUS WAKTU
// ---------------------------------------------------------------------------

/// Cip status waktu — JUJUR. "Buka sekarang" HANYA dari openNow.
class PlaceStatusChip extends StatelessWidget {
  const PlaceStatusChip({super.key, required this.hours, this.business});

  final CardHoursModel hours;
  final CardBusinessState? business;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;

    // Status perniagaan menang ke atas waktu (tutup kekal/pindah).
    if (business == CardBusinessState.permanentlyClosed) {
      return _chip(MMColors.danger, t.t('permClosed'));
    }
    if (business == CardBusinessState.temporarilyClosed) {
      return _chip(MMColors.accentYellow, t.t('tempClosed'), darkText: true);
    }

    switch (hours.state) {
      case CardHoursState.openNow:
        return _chip(MMColors.successGreen, t.t('openNow'));
      case CardHoursState.closedNow:
        return _chip(MMColors.danger, t.t('closedNow'));
      case CardHoursState.temporarilyClosed:
        return _chip(MMColors.accentYellow, t.t('tempClosed'), darkText: true);
      case CardHoursState.permanentlyClosed:
        return _chip(MMColors.danger, t.t('permClosed'));
      case CardHoursState.hoursExpired:
        return _chip(mm.onCardFaint, t.t('hoursExpired'), muted: true);
      case CardHoursState.hoursUnknown:
      case CardHoursState.statusUnknown:
      case CardHoursState.blocked:
        return _chip(mm.onCardFaint, t.t('hoursUnknown'), muted: true);
    }
  }

  Widget _chip(Color color, String label,
      {bool darkText = false, bool muted = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: muted ? color.withValues(alpha: 0.14) : color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: darkText ? MMColors.selectedDarkText : color,
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// HARGA
// ---------------------------------------------------------------------------

/// Label harga JUJUR. Unknown -> teks l10n; estimasi -> berlabel "Anggaran".
class PlacePriceLabel extends StatelessWidget {
  const PlacePriceLabel({super.key, required this.model, this.dense = false});

  final CardPriceModel model;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    final size = dense ? 12.0 : 12.5;

    switch (model.state) {
      case CardPriceState.verifiedAverage:
      case CardPriceState.verifiedRange:
      case CardPriceState.menuFromPrice:
        return Text(
          model.amountLabel ?? t.t('priceUnavailable'),
          style: TextStyle(
              color: mm.onCard, fontSize: size, fontWeight: FontWeight.w600),
        );
      case CardPriceState.providerBand:
      case CardPriceState.estimatedRange:
        return Text(
          model.amountLabel != null
              ? '${model.amountLabel} · ${t.t('estimatedPrice')}'
              : t.t('estimatedPrice'),
          style: TextStyle(
              color: mm.onCardMuted,
              fontSize: size,
              fontStyle: FontStyle.italic),
        );
      case CardPriceState.expired:
        return Text(t.t('priceRecheck'),
            style: TextStyle(color: mm.onCardFaint, fontSize: size));
      case CardPriceState.unknown:
        return Text(t.t('priceUnavailable'),
            style: TextStyle(color: mm.onCardFaint, fontSize: size));
    }
  }
}

// ---------------------------------------------------------------------------
// RATING
// ---------------------------------------------------------------------------

/// Label rating — hanya bila hasRating (rating > 0). Menyembunyi 0.0 palsu.
class PlaceRatingLabel extends StatelessWidget {
  const PlaceRatingLabel({super.key, required this.model, this.dense = false});

  final CardRatingModel model;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    if (!model.hasRating) {
      return Text(t.t('ratingUnavailable'),
          style: TextStyle(color: mm.onCardFaint, fontSize: dense ? 12 : 12.5));
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.star_rounded,
            size: dense ? 14 : 15, color: MMColors.accentYellow),
        const SizedBox(width: 2),
        Text(
          model.rating!.toStringAsFixed(1),
          style: TextStyle(
              color: mm.onCard,
              fontSize: dense ? 12 : 12.5,
              fontWeight: FontWeight.w700),
        ),
        if (model.hasReviewCount) ...[
          const SizedBox(width: 3),
          Text('(${model.reviewCount})',
              style: TextStyle(color: mm.onCardMuted, fontSize: 11.5)),
        ] else if (model.lowEvidence) ...[
          const SizedBox(width: 4),
          Text(t.t('notEnoughReviews'),
              style: TextStyle(color: mm.onCardFaint, fontSize: 10.5)),
        ],
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// TAG
// ---------------------------------------------------------------------------

/// Cip tag cuisine/jenis tempat (label paparan; ID canonical dari registri).
class PlaceTagChips extends StatelessWidget {
  const PlaceTagChips({super.key, required this.labels, this.max = 3});

  final List<String> labels;
  final int max;

  @override
  Widget build(BuildContext context) {
    if (labels.isEmpty) return const SizedBox.shrink();
    final mm = context.mm;
    final shown = labels.take(max).toList();
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final l in shown)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: mm.chipBackground,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: mm.border),
            ),
            child: Text(l,
                style: TextStyle(color: mm.chipText, fontSize: 11.5)),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// AMARAN (keselamatan-dahulu)
// ---------------------------------------------------------------------------

/// Amaran jujur (alahan/halal/harga). Severiti important = merah aksen.
class PlaceWarnings extends StatelessWidget {
  const PlaceWarnings({super.key, required this.warnings, this.max = 2});

  final List<CardWarning> warnings;
  final int max;

  @override
  Widget build(BuildContext context) {
    if (warnings.isEmpty) return const SizedBox.shrink();
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    final shown = warnings.take(max).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final w in shown)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  w.severity == 'important'
                      ? Icons.warning_amber_rounded
                      : Icons.info_outline_rounded,
                  size: 14,
                  color: w.severity == 'important'
                      ? MMColors.danger
                      : mm.onCardMuted,
                ),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(
                    t.t(w.labelKey),
                    style: TextStyle(
                      color: w.severity == 'important'
                          ? MMColors.danger
                          : mm.onCardMuted,
                      fontSize: 11.5,
                      fontWeight: w.severity == 'important'
                          ? FontWeight.w600
                          : FontWeight.w400,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// SEBAB PADANAN (hanya bila dibekalkan)
// ---------------------------------------------------------------------------

/// Sebab padanan cadangan. Kosong = tiada paparan (JANGAN reka sebab).
class PlaceMatchReasons extends StatelessWidget {
  const PlaceMatchReasons({super.key, required this.reasons, this.max = 2});

  final List<CardReason> reasons;
  final int max;

  @override
  Widget build(BuildContext context) {
    if (reasons.isEmpty) return const SizedBox.shrink();
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    final shown = reasons.take(max).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final r in shown)
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.check_circle_outline_rounded,
                    size: 13, color: MMColors.successGreen),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(
                    // labelKey mungkin kunci l10n atau teks apa adanya.
                    AppLocalizations.hasKey(r.labelKey)
                        ? t.t(r.labelKey)
                        : r.labelKey,
                    style: TextStyle(color: mm.onCardMuted, fontSize: 11.5),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// BADGE PENGESAHAN + HALAL
// ---------------------------------------------------------------------------

/// Badge pengesahan (cth. halal disahkan). Ikut BUKTI sahaja.
class PlaceVerificationBadges extends StatelessWidget {
  const PlaceVerificationBadges({
    super.key,
    required this.halal,
    this.badges = const [],
  });

  final HalalDisplayState halal;
  final List<CardBadge> badges;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    final chips = <Widget>[];

    final halalChip = _halalChip(t, mm);
    if (halalChip != null) chips.add(halalChip);

    for (final b in badges) {
      chips.add(_badge(mm, mm.onCardMuted, t.t(b.labelKey), Icons.verified_outlined));
    }

    if (chips.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 6, runSpacing: 6, children: chips);
  }

  Widget? _halalChip(AppLocalizations t, MMColors mm) {
    switch (halal) {
      case HalalDisplayState.certified:
        return _badge(mm, MMColors.successGreen, t.t('halalCertified'),
            Icons.verified_rounded);
      case HalalDisplayState.merchantClaimed:
        return _badge(mm, mm.onCardMuted, t.t('halalMerchantClaim'),
            Icons.storefront_outlined);
      case HalalDisplayState.communityReported:
        return _badge(mm, mm.onCardMuted, t.t('halalCommunityReport'),
            Icons.groups_outlined);
      case HalalDisplayState.recheckRequired:
        return _badge(mm, MMColors.accentYellow, t.t('halalRecheck'),
            Icons.update_rounded);
      case HalalDisplayState.possibleNonHalal:
        return _badge(
            mm, MMColors.danger, t.t('warnPossibleNonHalal'), Icons.help_outline_rounded);
      case HalalDisplayState.unknown:
        return _badge(
            mm, mm.onCardFaint, t.t('halalUnknown'), Icons.help_outline_rounded);
      case HalalDisplayState.none:
        return null; // Tiada bukti -> tiada dakwaan.
    }
  }

  Widget _badge(MMColors mm, Color color, String label, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 3),
          Text(label,
              style: TextStyle(
                  color: color, fontSize: 11, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// SKOR PADANAN (rozet)
// ---------------------------------------------------------------------------

/// Rozet skor padanan — HANYA bila hasMatchScore (dibekalkan Part 2).
class PlaceMatchScoreBadge extends StatelessWidget {
  const PlaceMatchScoreBadge({super.key, required this.vm});

  final PlaceCardViewModel vm;

  @override
  Widget build(BuildContext context) {
    if (!vm.hasMatchScore) return const SizedBox.shrink();
    final t = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: MMColors.danger,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '${vm.matchScore}% ${t.t('matchLabel')}',
        style: const TextStyle(
            color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// TINDAKAN
// ---------------------------------------------------------------------------

/// Panel tindakan kad. Kad sample -> tiada tindakan live.
class PlaceCardActions extends StatelessWidget {
  const PlaceCardActions({
    super.key,
    required this.vm,
    this.onViewDetails,
    this.onOpenMaps,
    this.onSave,
    this.onShare,
    this.onAccept,
    this.onReject,
    this.onNext,
    this.onLogMeal,
  });

  final PlaceCardViewModel vm;
  final VoidCallback? onViewDetails;
  final VoidCallback? onOpenMaps;
  final VoidCallback? onSave;
  final VoidCallback? onShare;
  final VoidCallback? onAccept;
  final VoidCallback? onReject;
  final VoidCallback? onNext;
  final VoidCallback? onLogMeal;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    final a = vm.actions;
    final buttons = <Widget>[];

    if (a.canAccept) {
      buttons.add(_primary(mm, t.t('accept'), Icons.check_rounded, onAccept));
    }
    if (a.canReject) {
      buttons.add(_ghost(mm, t.t('reject'), Icons.close_rounded, onReject));
    }
    if (a.canNext) {
      buttons.add(_ghost(mm, t.t('next'), Icons.skip_next_rounded, onNext));
    }
    if (a.canViewDetails) {
      buttons.add(_ghost(
          mm, t.t('viewDetails'), Icons.chevron_right_rounded, onViewDetails));
    }
    if (a.canOpenMaps) {
      buttons.add(_iconBtn(mm, t.t('openMap'), Icons.map_outlined, onOpenMaps));
    }
    if (a.canSave) {
      buttons.add(_iconBtn(mm, t.t('save'), Icons.bookmark_border_rounded, onSave));
    }
    if (a.canShare) {
      buttons.add(_iconBtn(mm, t.t('share'), Icons.share_outlined, onShare));
    }
    if (a.canLogMeal) {
      buttons.add(_ghost(mm, t.t('viewDetails'), Icons.restaurant_rounded, onLogMeal));
    }

    if (buttons.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 8, runSpacing: 8, children: buttons);
  }

  Widget _primary(MMColors mm, String label, IconData icon, VoidCallback? cb) {
    return FilledButton.icon(
      onPressed: cb,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: FilledButton.styleFrom(
        backgroundColor: MMColors.danger,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      ),
    );
  }

  Widget _ghost(MMColors mm, String label, IconData icon, VoidCallback? cb) {
    return OutlinedButton.icon(
      onPressed: cb,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        foregroundColor: mm.onCard,
        side: BorderSide(color: mm.border),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
    );
  }

  Widget _iconBtn(MMColors mm, String tooltip, IconData icon, VoidCallback? cb) {
    return IconButton(
      onPressed: cb,
      tooltip: tooltip,
      icon: Icon(icon, size: 20, color: mm.onCardMuted),
      style: IconButton.styleFrom(
        side: BorderSide(color: mm.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// LABEL SAMPLE / SUMBER
// ---------------------------------------------------------------------------

/// Badge sumber JUJUR: sample dilabel jelas; cache diluluskan ditanda.
class PlaceCardSampleBadge extends StatelessWidget {
  const PlaceCardSampleBadge({super.key, required this.sourceMode});

  final CardSourceMode sourceMode;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    switch (sourceMode) {
      case CardSourceMode.sample:
        return _tag(MMColors.accentYellow, t.t('samplePreview'), darkText: true);
      case CardSourceMode.approvedCache:
        return _tag(mm.onCardFaint, t.t('cachedApprovedLabel'), muted: true);
      case CardSourceMode.community:
        return _tag(mm.onCardMuted, t.t('halalCommunityReport'), muted: true);
      case CardSourceMode.live:
        return const SizedBox.shrink();
    }
  }

  Widget _tag(Color color, String label,
      {bool darkText = false, bool muted = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: muted ? color.withValues(alpha: 0.16) : color,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: darkText
              ? MMColors.selectedDarkText
              : (muted ? color : Colors.white),
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// KEADAAN: SKELETON / KOSONG / RALAT
// ---------------------------------------------------------------------------

/// Rangka pemuatan (shimmer ringkas, tiada data palsu).
class PlaceCardSkeleton extends StatelessWidget {
  const PlaceCardSkeleton({super.key, this.height = 96});

  final double height;

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    return Semantics(
      label: AppLocalizations.of(context).t('loadingLabel'),
      child: Container(
        height: height,
        decoration: BoxDecoration(
          color: mm.card,
          borderRadius: BorderRadius.circular(kPlaceCardRadius),
          border: Border.all(color: mm.border),
        ),
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            _box(mm, height - 24, height - 24),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _box(mm, double.infinity, 14),
                  const SizedBox(height: 8),
                  _box(mm, 120, 12),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _box(MMColors mm, double w, double h) => Container(
        width: w,
        height: h,
        decoration: BoxDecoration(
          color: mm.softFill,
          borderRadius: BorderRadius.circular(6),
        ),
      );
}

/// Keadaan kosong (tiada tempat). Guna kunci l10n sedia ada.
class PlaceCardEmptyState extends StatelessWidget {
  const PlaceCardEmptyState({super.key, this.messageKey = 'noNearbyTitle'});

  final String messageKey;

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.storefront_outlined, size: 40, color: mm.iconMuted),
          const SizedBox(height: 8),
          Text(
            AppLocalizations.of(context).t(messageKey),
            textAlign: TextAlign.center,
            style: TextStyle(color: mm.onCardMuted, fontSize: 13.5),
          ),
        ],
      ),
    );
  }
}

/// Keadaan ralat + retry.
class PlaceCardErrorState extends StatelessWidget {
  const PlaceCardErrorState({super.key, this.onRetry});

  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.error_outline_rounded, size: 40, color: MMColors.danger),
          const SizedBox(height: 8),
          Text(t.t('cardErrorTitle'),
              textAlign: TextAlign.center,
              style: TextStyle(color: mm.onCard, fontSize: 13.5)),
          if (onRetry != null) ...[
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: Text(t.t('retryAction'))),
          ],
        ],
      ),
    );
  }
}
