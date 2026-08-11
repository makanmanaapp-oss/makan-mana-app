/// PART 1 Phase 1.10 — skrin Butiran Kedai KANONIKAL (paparan jujur).
///
/// Widget paparan tulen (tiada Riverpod) supaya mudah diuji. Skrin legasi
/// membina view model melalui adapter dan menyuntik callback ke handler legasi
/// sedia ada. Peraturan kejujuran diwarisi daripada primitif kad Phase 1.9.
library;

import 'package:flutter/material.dart';

import '../../../app/localization/app_localizations.dart';
import '../../../app/theme.dart';
import '../../place_cards/place_card_primitives.dart';
import '../../place_corrections/place_correction_flags.dart';
import 'restaurant_detail_view_model.dart';

/// Callback tindakan butiran (dipetakan ke handler legasi oleh pemanggil).
class RestaurantDetailCallbacks {
  const RestaurantDetailCallbacks({
    this.onBack,
    this.onOpenMaps,
    this.onSave,
    this.onShare,
    this.onCall,
    this.onOpenWebsite,
    this.onLogMeal,
    this.onRate,
    this.onAccept,
    this.onReject,
    this.onReportIncorrectInformation,
  });

  final VoidCallback? onBack;
  final VoidCallback? onOpenMaps;
  final VoidCallback? onSave;
  final VoidCallback? onShare;
  final VoidCallback? onCall;
  final VoidCallback? onOpenWebsite;
  final VoidCallback? onLogMeal;
  final VoidCallback? onRate;
  final VoidCallback? onAccept;
  final VoidCallback? onReject;

  /// PART 1 Phase 1.11 — titik masuk laporan/pembetulan. Dipapar HANYA bila
  /// PlaceCorrectionFlags.placeCorrectionEnabled ON dan data bukan sample.
  final VoidCallback? onReportIncorrectInformation;
}

/// Skrin butiran kanonikal lengkap dengan AppBar + badan boleh skrol.
class CanonicalRestaurantDetailScreen extends StatelessWidget {
  const CanonicalRestaurantDetailScreen({
    super.key,
    required this.vm,
    this.callbacks = const RestaurantDetailCallbacks(),
  });

  final RestaurantDetailViewModel vm;
  final RestaurantDetailCallbacks callbacks;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(vm.title)),
      body: CanonicalRestaurantDetailBody(vm: vm, callbacks: callbacks),
    );
  }
}

/// Badan butiran (tanpa Scaffold) — boleh disemat dalam skrin lain / ujian.
class CanonicalRestaurantDetailBody extends StatefulWidget {
  const CanonicalRestaurantDetailBody({
    super.key,
    required this.vm,
    this.callbacks = const RestaurantDetailCallbacks(),
  });

  final RestaurantDetailViewModel vm;
  final RestaurantDetailCallbacks callbacks;

  @override
  State<CanonicalRestaurantDetailBody> createState() =>
      _CanonicalRestaurantDetailBodyState();
}

class _CanonicalRestaurantDetailBodyState
    extends State<CanonicalRestaurantDetailBody> {
  bool _tagsExpanded = false;
  bool _weeklyExpanded = false;
  bool _submitting = false;

  RestaurantDetailViewModel get vm => widget.vm;

  /// Bungkus tindakan supaya hantar-dua-kali dicegah + tindakan sample disekat.
  VoidCallback? _guard(VoidCallback? cb, {required bool allowed}) {
    if (cb == null || !allowed || vm.isSample) return null;
    return () {
      if (_submitting) return;
      setState(() => _submitting = true);
      cb();
      // Lepaskan kunci pada frame seterusnya (cukup untuk cegah dua-kali pantas).
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _submitting = false);
      });
    };
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 20. Amaran sample/mock (paling atas supaya jujur & jelas).
          if (vm.isSample) _sampleBanner(t, mm),
          // 1. Hero / galeri.
          _hero(t, mm),
          const SizedBox(height: 14),
          // 2. Identiti & status.
          _identity(t, mm),
          _businessBanner(t, mm),
          const SizedBox(height: 12),
          // 3. Fakta ringkas.
          _quickFacts(),
          const SizedBox(height: 16),
          // 4. Waktu operasi.
          _section(t.t('hoursTitle'), _hours(t, mm)),
          // 5. Harga.
          _section(t.t('priceTitle'), _price(t, mm)),
          // 6. Penilaian & ulasan.
          _section(t.t('ratingReviewsTitle'), _ratingSummary(t, mm)),
          // 7. Masakan & jenis + 13. tag lain.
          if (_hasAnyTag) _section(t.t('cuisineTypeTitle'), _tags(t, mm)),
          // 8. Hidangan pilihan.
          if (vm.dishHighlights.isNotEmpty)
            _section(t.t('dishHighlights'), _dishes(mm)),
          // 9. Perkhidmatan & suasana.
          if (vm.serviceLabels.isNotEmpty || vm.ambienceLabels.isNotEmpty)
            _section(t.t('servicesLabel'), _serviceAmbience()),
          // 10. Halal.
          _section(t.t('halalInfo'), _halal()),
          // 11. Pemakanan.
          if (vm.dietaryStates.isNotEmpty)
            _section(t.t('dietaryInfo'), _dietary(t, mm)),
          // 12. Alahan.
          _section(t.t('allergenInfo'), _allergen(t, mm)),
          // 14. Lokasi.
          _section(t.t('locationLabel'), _location(t, mm)),
          // 15. Hubungan.
          _section(t.t('contactLabel'), _contact(t, mm)),
          // 16-18. Pengesahan, kesegaran & asal data.
          _section(t.t('sourceInformation'), _provenance(t, mm)),
          const SizedBox(height: 8),
          // 19. Tindakan.
          _actions(t, mm),
        ],
      ),
    );
  }

  // --- Pembantu susun atur -------------------------------------------------

  Widget _section(String title, Widget child) {
    final mm = context.mm;
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: mm.onCard)),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }

  Widget _card(Widget child) {
    final mm = context.mm;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: mm.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: mm.border),
      ),
      child: child,
    );
  }

  Widget _muted(String text) => Text(text,
      style: TextStyle(color: context.mm.onCardMuted, fontSize: 13.5));

  bool get _hasAnyTag =>
      vm.cuisineLabels.isNotEmpty ||
      vm.placeTypeLabels.isNotEmpty ||
      vm.healthTagIds.isNotEmpty ||
      vm.spiceTagIds.isNotEmpty ||
      vm.portionTagIds.isNotEmpty ||
      vm.speedTagIds.isNotEmpty;

  // --- Seksyen -------------------------------------------------------------

  Widget _sampleBanner(AppLocalizations t, MMColors mm) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: MMColors.accentYellow.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            const Icon(Icons.science_outlined, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '${t.t('sampleDataLabel')} — ${t.t('sampleActionBlocked')}',
                style: TextStyle(
                    color: mm.onCard,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      );

  Widget _hero(AppLocalizations t, MMColors mm) {
    final hero = vm.gallery.hero;
    return Stack(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: PlaceCardImage(
            model: hero?.image ?? const CardImageModel(),
            title: vm.title,
            width: double.infinity,
            height: 210,
            borderRadius: 20,
          ),
        ),
        if (vm.isSample)
          const Positioned(
            left: 10,
            top: 10,
            child: PlaceCardSampleBadge(sourceMode: CardSourceMode.sample),
          ),
        if (vm.gallery.count > 1)
          Positioned(
            right: 10,
            bottom: 10,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.55),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text('${vm.gallery.count} ${t.t('galleryCountLabel')}',
                  style: const TextStyle(color: Colors.white, fontSize: 11.5)),
            ),
          ),
      ],
    );
  }

  Widget _identity(AppLocalizations t, MMColors mm) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(vm.title,
                  style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: mm.onCard)),
              if (vm.subtitle != null && vm.subtitle!.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(vm.subtitle!,
                    style: TextStyle(color: mm.onCardMuted, fontSize: 13.5)),
              ],
            ],
          ),
        ),
        const SizedBox(width: 8),
        PlaceStatusChip(hours: vm.hours.model, business: vm.businessState),
      ],
    );
  }

  Widget _businessBanner(AppLocalizations t, MMColors mm) {
    IconData? icon;
    String? label;
    Color? color;
    bool strong = false;
    switch (vm.businessState) {
      case CardBusinessState.temporarilyClosed:
        icon = Icons.pause_circle_outline;
        label = t.t('tempClosed');
        color = MMColors.accentYellow;
        break;
      case CardBusinessState.permanentlyClosed:
      case CardBusinessState.blocked:
        icon = Icons.do_not_disturb_on_outlined;
        label = t.t('permClosed');
        color = MMColors.danger;
        strong = true;
        break;
      case CardBusinessState.moved:
        icon = Icons.moving_outlined;
        label = t.t('movedWarning');
        color = MMColors.accentYellow;
        break;
      case CardBusinessState.hidden:
        icon = Icons.visibility_off_outlined;
        label = t.t('statusUnknown');
        color = mm.onCardFaint;
        break;
      case CardBusinessState.active:
      case CardBusinessState.unknown:
        return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: color.withValues(alpha: strong ? 0.18 : 0.14),
          borderRadius: BorderRadius.circular(12),
          border: strong ? Border.all(color: color) : null,
        ),
        // Status tidak bergantung pada warna sahaja — ikon + teks jelas.
        child: Row(
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 8),
            Expanded(
              child: Text(label,
                  style: TextStyle(
                      color: mm.onCard,
                      fontSize: 13,
                      fontWeight:
                          strong ? FontWeight.w800 : FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _quickFacts() => Wrap(
        spacing: 10,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          PlaceRatingLabel(model: vm.rating),
          if (vm.location.distanceKm != null)
            _muted('${vm.location.distanceKm!.toStringAsFixed(1)} km'),
          PlacePriceLabel(model: vm.price),
        ],
      );

  Widget _hours(AppLocalizations t, MMColors mm) {
    final h = vm.hours;
    final children = <Widget>[
      Row(
        children: [
          PlaceStatusChip(hours: h.model, business: vm.businessState),
          if (h.todayLabel != null) ...[
            const SizedBox(width: 10),
            Flexible(
                child: Text('${t.t('todayHours')}: ${h.todayLabel}',
                    style: TextStyle(color: mm.onCard, fontSize: 13))),
          ],
        ],
      ),
    ];
    if (h.model.state == CardHoursState.hoursExpired) {
      children.add(Padding(
        padding: const EdgeInsets.only(top: 6),
        child: _recheck(t.t('hoursExpired'), mm),
      ));
    }
    if (!h.hasWeekly && h.todayLabel == null) {
      children.add(Padding(
        padding: const EdgeInsets.only(top: 6),
        child: _muted(t.t('hoursUnknown')),
      ));
    }
    if (h.hasWeekly) {
      children.add(_expandRow(
        label: _weeklyExpanded ? t.t('showLess') : t.t('weeklyHours'),
        expanded: _weeklyExpanded,
        onTap: () => setState(() => _weeklyExpanded = !_weeklyExpanded),
      ));
      if (_weeklyExpanded) {
        for (final d in h.weeklySchedule) {
          children.add(Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(t.t(d.dayLabelKey),
                    style: TextStyle(color: mm.onCardMuted, fontSize: 12.5)),
                Text(d.hoursLabel,
                    style: TextStyle(color: mm.onCard, fontSize: 12.5)),
              ],
            ),
          ));
        }
      }
    }
    if (h.lastVerifiedLabel != null) {
      children.add(Padding(
        padding: const EdgeInsets.only(top: 6),
        child: _muted('${t.t('lastVerified')}: ${h.lastVerifiedLabel}'),
      ));
    }
    return _card(Column(
        crossAxisAlignment: CrossAxisAlignment.start, children: children));
  }

  Widget _price(AppLocalizations t, MMColors mm) =>
      _card(Align(alignment: Alignment.centerLeft, child: PlacePriceLabel(model: vm.price)));

  Widget _ratingSummary(AppLocalizations t, MMColors mm) {
    if (!vm.hasRating) {
      return _card(_muted(t.t('ratingUnavailable')));
    }
    return _card(Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PlaceRatingLabel(model: vm.rating),
        if (!vm.hasReviewCount) ...[
          const SizedBox(height: 4),
          _muted(t.t('notEnoughReviews')),
        ],
      ],
    ));
  }

  Widget _tags(AppLocalizations t, MMColors mm) {
    final labels = <String>[
      ...vm.cuisineLabels,
      ...vm.placeTypeLabels,
    ];
    final extra = <String>[
      ...vm.healthTagIds,
      ...vm.spiceTagIds,
      ...vm.portionTagIds,
      ...vm.speedTagIds,
    ];
    final all = <String>{...labels, ...extra}.toList(); // buang pendua
    final shown = _tagsExpanded ? all : all.take(6).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PlaceTagChips(labels: shown, max: shown.length),
        if (all.length > 6)
          _expandRow(
            label: _tagsExpanded ? t.t('showLess') : t.t('showMore'),
            expanded: _tagsExpanded,
            onTap: () => setState(() => _tagsExpanded = !_tagsExpanded),
          ),
      ],
    );
  }

  Widget _dishes(MMColors mm) => Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final d in vm.dishHighlights)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: mm.chipBackground,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: mm.border),
              ),
              child: Text(d.name,
                  style: TextStyle(color: mm.chipText, fontSize: 12.5)),
            ),
        ],
      );

  Widget _serviceAmbience() =>
      PlaceTagChips(labels: [...vm.serviceLabels, ...vm.ambienceLabels], max: 8);

  Widget _halal() =>
      _card(PlaceVerificationBadges(halal: vm.halalState, badges: vm.verificationBadges));

  Widget _dietary(AppLocalizations t, MMColors mm) {
    return _card(Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [
        for (final d in vm.dietaryStates)
          _evidenceChip(mm, d.tagId, _evidenceKey(d.evidence), t),
      ],
    ));
  }

  String _evidenceKey(EvidenceLevel e) {
    switch (e) {
      case EvidenceLevel.verified:
        return 'dietVerified';
      case EvidenceLevel.reported:
        return 'dietReported';
      case EvidenceLevel.inferred:
        return 'dietInferred';
      case EvidenceLevel.unknown:
        return 'statusUnknown';
    }
  }

  Widget _evidenceChip(
      MMColors mm, String label, String evidenceKey, AppLocalizations t) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: mm.chipBackground,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: mm.border),
      ),
      child: Text('$label · ${t.t(evidenceKey)}',
          style: TextStyle(color: mm.chipText, fontSize: 11.5)),
    );
  }

  Widget _allergen(AppLocalizations t, MMColors mm) {
    // Ketiadaan data TIDAK PERNAH dipapar "selamat".
    final known = vm.allergenStates.where((a) => a.isKnownPresent).toList();
    final provenAbsent = vm.allergenStates.where((a) => a.provesAbsent).toList();
    final incomplete = known.isEmpty && provenAbsent.isEmpty;
    if (incomplete) {
      return _card(Row(
        children: [
          Icon(Icons.info_outline_rounded, size: 16, color: mm.onCardMuted),
          const SizedBox(width: 6),
          Expanded(child: _muted(t.t('allergenCaution'))),
        ],
      ));
    }
    return _card(Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final a in known)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(children: [
              Icon(Icons.warning_amber_rounded,
                  size: 16, color: MMColors.danger),
              const SizedBox(width: 6),
              Expanded(
                  child: Text(a.allergenId,
                      style: TextStyle(color: mm.onCard, fontSize: 13))),
            ]),
          ),
        if (provenAbsent.isEmpty) _muted(t.t('allergenCaution')),
      ],
    ));
  }

  Widget _location(AppLocalizations t, MMColors mm) {
    final loc = vm.location;
    return _card(Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.location_on_outlined, size: 18, color: MMColors.danger),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                loc.address.isNotEmpty ? loc.address : t.t('noInfoAvailable'),
                style: TextStyle(color: mm.onCard, fontSize: 13.5),
              ),
            ),
          ],
        ),
        if (loc.movedWarningKey != null) ...[
          const SizedBox(height: 6),
          _recheck(t.t(loc.movedWarningKey!), mm),
        ],
        if (vm.actions.canOpenMaps) ...[
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _guard(widget.callbacks.onOpenMaps,
                allowed: vm.actions.canOpenMaps),
            icon: const Icon(Icons.map_outlined, size: 18),
            label: Text(t.t('openMap')),
          ),
        ],
      ],
    ));
  }

  Widget _contact(AppLocalizations t, MMColors mm) {
    final c = vm.contact;
    if (!c.hasPhone && !c.hasWebsite) {
      return _card(_muted(t.t('contactUnavailable')));
    }
    return _card(Wrap(
      spacing: 10,
      runSpacing: 8,
      children: [
        if (c.hasPhone)
          OutlinedButton.icon(
            onPressed:
                _guard(widget.callbacks.onCall, allowed: vm.actions.canCall),
            icon: const Icon(Icons.call_outlined, size: 18),
            label: Text(t.t('callAction')),
          ),
        if (c.hasWebsite)
          OutlinedButton.icon(
            onPressed: _guard(widget.callbacks.onOpenWebsite,
                allowed: vm.actions.canOpenWebsite),
            icon: const Icon(Icons.public_outlined, size: 18),
            label: Text(t.t('websiteAction')),
          ),
      ],
    ));
  }

  Widget _provenance(AppLocalizations t, MMColors mm) {
    final p = vm.provenance;
    final rows = <Widget>[];
    // Label sumber selamat-pengguna (TIADA UID/audit/payload dalaman).
    rows.add(_provRow(mm, t.t('provenanceTitle'), _sourceLabel(t, p.sourceMode)));
    if (p.lastUpdatedLabel != null) {
      rows.add(_provRow(mm, t.t('lastUpdated'), p.lastUpdatedLabel!));
    }
    if (p.lastVerifiedLabel != null) {
      rows.add(_provRow(mm, t.t('lastVerified'), p.lastVerifiedLabel!));
    }
    if (vm.freshness.needsRecheck) {
      rows.add(Padding(
        padding: const EdgeInsets.only(top: 6),
        child: _recheck(
            vm.freshness.state == FreshnessState.expired
                ? t.t('freshnessExpired')
                : t.t('freshnessStale'),
            mm),
      ));
    }
    if (vm.warnings.isNotEmpty) {
      rows.add(Padding(
        padding: const EdgeInsets.only(top: 4),
        child: PlaceWarnings(warnings: vm.warnings, max: 3),
      ));
    }
    return _card(Column(
        crossAxisAlignment: CrossAxisAlignment.start, children: rows));
  }

  String _sourceLabel(AppLocalizations t, CardSourceMode m) {
    switch (m) {
      case CardSourceMode.approvedCache:
        return t.t('cachedApprovedLabel');
      case CardSourceMode.community:
        return t.t('communityReportedLabel');
      case CardSourceMode.sample:
        return t.t('sampleDataLabel');
      case CardSourceMode.live:
        return t.t('sourceInformation');
    }
  }

  Widget _provRow(MMColors mm, String k, String v) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(k, style: TextStyle(color: mm.onCardMuted, fontSize: 12.5)),
            const SizedBox(width: 12),
            Flexible(
                child: Text(v,
                    textAlign: TextAlign.right,
                    style: TextStyle(color: mm.onCard, fontSize: 12.5))),
          ],
        ),
      );

  Widget _recheck(String text, MMColors mm) => Row(
        children: [
          Icon(Icons.update_rounded, size: 15, color: MMColors.accentYellow),
          const SizedBox(width: 6),
          Flexible(
              child: Text(text,
                  style: TextStyle(color: mm.onCardMuted, fontSize: 12.5))),
        ],
      );

  Widget _expandRow(
      {required String label,
      required bool expanded,
      required VoidCallback onTap}) {
    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(label,
                  style: TextStyle(
                      color: MMColors.danger,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600)),
              Icon(expanded ? Icons.expand_less : Icons.expand_more,
                  size: 18, color: MMColors.danger),
            ],
          ),
        ),
      ),
    );
  }

  Widget _actions(AppLocalizations t, MMColors mm) {
    final a = vm.actions;
    final buttons = <Widget>[
      if (a.canOpenMaps)
        _actionBtn(t.t('openMap'), Icons.map_outlined,
            _guard(widget.callbacks.onOpenMaps, allowed: a.canOpenMaps),
            primary: true),
      if (a.canRate)
        _actionBtn(t.t('logMealAction'), Icons.restaurant_rounded,
            _guard(widget.callbacks.onRate, allowed: a.canRate)),
      if (a.canSave)
        _actionBtn(t.t('save'), Icons.bookmark_border_rounded,
            _guard(widget.callbacks.onSave, allowed: a.canSave)),
      if (a.canShare)
        // Kongsi dibenarkan walau untuk sample (tiada kesan live berbahaya).
        _actionBtn(t.t('share'), Icons.share_outlined,
            _submitting ? null : widget.callbacks.onShare),
      if (a.canLogMeal)
        _actionBtn(t.t('logMealAction'), Icons.account_balance_wallet_outlined,
            _guard(widget.callbacks.onLogMeal, allowed: a.canLogMeal)),
      if (a.canAccept)
        _actionBtn(t.t('save'), Icons.check_rounded,
            _guard(widget.callbacks.onAccept, allowed: a.canAccept)),
      if (a.canReject)
        _actionBtn(t.t('showLess'), Icons.close_rounded,
            _guard(widget.callbacks.onReject, allowed: a.canReject)),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(spacing: 10, runSpacing: 10, children: buttons),
        // Phase 1.11: laporan adalah tindakan sekunder yang tenang, bukan CTA.
        if (_showReportEntry)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Semantics(
              button: true,
              label: t.t('reportIncorrectInformation'),
              child: TextButton.icon(
                key: const Key('detail-report-entry'),
                onPressed: widget.callbacks.onReportIncorrectInformation,
                icon: Icon(Icons.flag_outlined, size: 18, color: mm.onCardMuted),
                label: Text(t.t('reportIncorrectInformation'),
                    style: TextStyle(color: mm.onCardMuted, fontSize: 13.5)),
              ),
            ),
          ),
      ],
    );
  }

  /// Sample tidak boleh dilaporkan — tiada rekod sebenar untuk dibetulkan.
  bool get _showReportEntry =>
      PlaceCorrectionFlags.placeCorrectionEnabled &&
      widget.callbacks.onReportIncorrectInformation != null &&
      !vm.isSample;

  Widget _actionBtn(String label, IconData icon, VoidCallback? cb,
      {bool primary = false}) {
    if (primary) {
      return FilledButton.icon(
        onPressed: cb,
        icon: Icon(icon, size: 18),
        label: Text(label),
        style: FilledButton.styleFrom(
          backgroundColor: MMColors.danger,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 46),
        ),
      );
    }
    return OutlinedButton.icon(
      onPressed: cb,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 46)),
    );
  }
}

// ---------------------------------------------------------------------------
// KEADAAN UI PERINGKAT SKRIN (loading / not-found / missing-id)
// ---------------------------------------------------------------------------

/// Keadaan memuat (skeleton butiran).
class RestaurantDetailLoading extends StatelessWidget {
  const RestaurantDetailLoading({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            PlaceCardSkeleton(height: 210),
            SizedBox(height: 16),
            PlaceCardSkeleton(height: 90),
            SizedBox(height: 12),
            PlaceCardSkeleton(height: 90),
          ],
        ),
      ),
    );
  }
}

/// Keadaan ID tiada.
class RestaurantDetailMissingId extends StatelessWidget {
  const RestaurantDetailMissingId({super.key, this.onBack});
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) =>
      _stateScaffold(context, 'missingPlaceId', onBack);
}

/// Keadaan kedai tidak dijumpai.
class RestaurantDetailNotFound extends StatelessWidget {
  const RestaurantDetailNotFound({super.key, this.onBack});
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) =>
      _stateScaffold(context, 'detailNotFound', onBack);
}

Widget _stateScaffold(BuildContext context, String key, VoidCallback? onBack) {
  final t = AppLocalizations.of(context);
  final mm = context.mm;
  return Scaffold(
    appBar: AppBar(),
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.storefront_outlined, size: 44, color: mm.iconMuted),
            const SizedBox(height: 10),
            Text(t.t(key),
                textAlign: TextAlign.center,
                style: TextStyle(color: mm.onCard, fontSize: 15)),
            if (onBack != null) ...[
              const SizedBox(height: 14),
              OutlinedButton(onPressed: onBack, child: Text(t.t('retryAction'))),
            ],
          ],
        ),
      ),
    ),
  );
}
