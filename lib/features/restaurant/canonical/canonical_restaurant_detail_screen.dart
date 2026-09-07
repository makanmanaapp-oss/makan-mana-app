library;

import 'package:flutter/material.dart';

import '../../../app/localization/app_localizations.dart';
import '../../../app/theme.dart';
import '../../place_cards/place_card_primitives.dart';
import '../../place_corrections/place_correction_flags.dart';
import 'restaurant_detail_view_model.dart';

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
  final VoidCallback? onReportIncorrectInformation;
}

/// GATE 3F — REAL MakanMana community review data for the Ulasan tab.
///
/// Built by the live route from the EXISTING `placeReviewsProvider`
/// (`place_reviews`, approved only). [average] is null whenever it cannot be
/// derived honestly from the approved reviews — it is never invented, and the
/// external/general rating is never reused here.
class CommunityReviewsData {
  const CommunityReviewsData({
    required this.count,
    this.average,
    this.list,
  });

  final int count;
  final double? average;
  final Widget? list;

  bool get hasReviews => count > 0 && list != null;
}

class CanonicalRestaurantDetailScreen extends StatelessWidget {
  const CanonicalRestaurantDetailScreen({
    super.key,
    required this.vm,
    this.callbacks = const RestaurantDetailCallbacks(),
    this.engagement,
    this.onOpenMenuItemComments,
    this.communityReviews,
  });

  final RestaurantDetailViewModel vm;
  final RestaurantDetailCallbacks callbacks;

  /// WAVE 3D Gate 2 — optional engagement strip (restaurant follow).
  ///
  /// Injected by the live route ONLY once the canonical Restaurant Profile V2
  /// publication has resolved, so this screen stays a pure presentational
  /// widget with no Riverpod dependency and no knowledge of the canonical id.
  /// Null (the default) renders nothing.
  final Widget? engagement;

  /// WAVE 3D Gate 2 — optional per-menu-item comment affordance. Null renders
  /// nothing, so the menu is unchanged wherever engagement is not wired.
  final void Function(DetailMenuItem item)? onOpenMenuItemComments;

  /// GATE 3F — real MakanMana community review data for the Ulasan tab.
  /// This screen stays presentational and never queries reviews itself.
  final CommunityReviewsData? communityReviews;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(vm.title)),
      body: CanonicalRestaurantDetailBody(
        vm: vm,
        callbacks: callbacks,
        engagement: engagement,
        onOpenMenuItemComments: onOpenMenuItemComments,
        communityReviews: communityReviews,
      ),
    );
  }
}

class CanonicalRestaurantDetailBody extends StatefulWidget {
  const CanonicalRestaurantDetailBody({
    super.key,
    required this.vm,
    this.callbacks = const RestaurantDetailCallbacks(),
    this.engagement,
    this.onOpenMenuItemComments,
    this.communityReviews,
  });

  final RestaurantDetailViewModel vm;
  final RestaurantDetailCallbacks callbacks;

  /// See [CanonicalRestaurantDetailScreen.engagement].
  final Widget? engagement;

  /// See [CanonicalRestaurantDetailScreen.onOpenMenuItemComments].
  final void Function(DetailMenuItem item)? onOpenMenuItemComments;

  /// See [CanonicalRestaurantDetailScreen.communityReviews].
  final CommunityReviewsData? communityReviews;

  @override
  State<CanonicalRestaurantDetailBody> createState() =>
      _CanonicalRestaurantDetailBodyState();
}

class _CanonicalRestaurantDetailBodyState
    extends State<CanonicalRestaurantDetailBody> {
  bool _tagsExpanded = false;
  bool _weeklyExpanded = false;
  bool _submitting = false;

  /// GATE 3F — selected menu category. Null == "Semua".
  String? _menuCategory;

  RestaurantDetailViewModel get vm => widget.vm;

  VoidCallback? _guard(VoidCallback? cb, {required bool allowed}) {
    if (cb == null || !allowed || vm.isSample) return null;
    return () {
      if (_submitting) return;
      setState(() => _submitting = true);
      cb();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _submitting = false);
      });
    };
  }

  /// GATE 3F — Restaurant Detail is a shared identity header plus THREE tabs:
  /// "Profil", "Ulasan" and "Menu". The header scrolls away while the tab bar
  /// pins, so both tabs keep their own vertical scroll without nesting
  /// conflicts, and horizontal swipe stays in sync with the indicator.
  ///
  /// The Menu tab ALWAYS exists — an empty menu renders an honest empty state
  /// instead of removing the tab.
  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    return DefaultTabController(
      length: 3,
      child: NestedScrollView(
        headerSliverBuilder: (context, innerScrolled) => [
          SliverToBoxAdapter(child: _header(t, mm)),
          SliverPersistentHeader(
            pinned: true,
            delegate: _TabBarHeader(
              background: mm.appBackground,
              child: TabBar(
                key: const Key('restaurant-detail-tabs'),
                labelColor: MMColors.danger,
                unselectedLabelColor: mm.onCardMuted,
                indicatorColor: MMColors.danger,
                indicatorSize: TabBarIndicatorSize.tab,
                labelStyle:
                    const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
                unselectedLabelStyle:
                    const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
                tabs: [
                  Tab(key: const Key('tab-profile'), text: t.t('profileTab')),
                  Tab(key: const Key('tab-reviews'), text: t.t('reviewsTab')),
                  Tab(key: const Key('tab-menu'), text: t.t('menuTab')),
                ],
              ),
            ),
          ),
        ],
        body: TabBarView(
          key: const Key('restaurant-detail-tabviews'),
          children: [
            _profileTab(t, mm),
            _reviewsTab(t, mm),
            _menuTab(t, mm),
          ],
        ),
      ),
    );
  }

  /// Shared header: identity, hero, follow and the compact key facts.
  Widget _header(AppLocalizations t, MMColors mm) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (vm.isSample) _sampleBanner(t, mm),
            _hero(t, mm),
            const SizedBox(height: 14),
            _identity(t, mm),
            if (widget.engagement != null) ...[
              const SizedBox(height: 10),
              KeyedSubtree(
                key: const Key('restaurant-engagement-strip'),
                child: widget.engagement!,
              ),
            ],
            _businessBanner(t, mm),
            const SizedBox(height: 12),
            _quickFacts(),
            const SizedBox(height: 4),
          ],
        ),
      );

  /// TAB 1 — Profil & Ulasan, ordered by what a diner actually needs first.
  ///
  /// Deliberately a SingleChildScrollView + Column rather than a lazy ListView:
  /// the profile has a small, bounded set of sections, and building them all
  /// keeps semantics/accessibility traversal (and screen-level assertions)
  /// working for content below the fold. The MENU tab stays lazy, because it
  /// can legitimately hold up to 200 items.
  Widget _profileTab(AppLocalizations t, MMColors mm) => SingleChildScrollView(
        key: const Key('restaurant-profile-tab'),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Restaurant INFORMATION only — community reviews live in their
            // own tab so the two are never visually conflated.
            if (_hasSummary)
              _section(t.t('restaurantSummaryTitle'), _summary(t, mm)),
            _section(t.t('hoursTitle'), _hours(t, mm)),
            _section(t.t('halalInfo'), _halal(t, mm)),
            if (vm.dietaryStates.isNotEmpty)
              _section(t.t('dietaryInfo'), _dietary(t, mm)),
            _section(t.t('allergenInfo'), _allergen(t, mm)),
            _section(t.t('locationLabel'), _location(t, mm)),
            _section(t.t('contactLabel'), _contact(t)),
            _section(t.t('sourceInformation'), _provenance(t, mm)),
            const SizedBox(height: 8),
            _actions(t, mm),
          ],
        ),
      );

  bool get _hasSummary =>
      _hasAnyTag ||
      vm.dishHighlights.isNotEmpty ||
      vm.serviceLabels.isNotEmpty ||
      vm.ambienceLabels.isNotEmpty ||
      vm.price.state != CardPriceState.unknown;

  /// Summary merges price, cuisine tags, dish highlights and service/ambience
  /// into ONE block instead of four separately-carded sections.
  Widget _summary(AppLocalizations t, MMColors mm) => _plain(Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _infoRowWidget(
              mm, t.t('priceTitle'), PlacePriceLabel(model: vm.price)),
          if (vm.subtitle != null && vm.subtitle!.trim().isNotEmpty)
            _infoRow(mm, t.t('cuisineTypeTitle'), vm.subtitle!.trim()),
          if (_hasAnyTag) ...[
            const SizedBox(height: 6),
            _tags(t),
          ],
          if (vm.dishHighlights.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(t.t('dishHighlights'),
                style: TextStyle(
                    color: mm.onCard,
                    fontSize: 13,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            _dishes(mm),
          ],
          if (vm.serviceLabels.isNotEmpty || vm.ambienceLabels.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(t.t('servicesLabel'),
                style: TextStyle(
                    color: mm.onCard,
                    fontSize: 13,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            _serviceAmbience(),
          ],
        ],
      ));

  Widget _section(String title, Widget child) => Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: context.mm.onCard)),
            const SizedBox(height: 8),
            child,
          ],
        ),
      );

  Widget _card(Widget child) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.mm.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.mm.border),
        ),
        child: child,
      );

  /// GATE 3F polish — lightweight section body: no border, no fill, just the
  /// content followed by a subtle divider. Large bordered cards are now
  /// RESERVED for the two places where grouping genuinely helps: the location
  /// block (address + map CTA) and the allergen safety warning.
  Widget _plain(Widget child) => Container(
        key: const Key('restaurant-plain-section'),
        width: double.infinity,
        padding: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          border: Border(
              bottom: BorderSide(color: context.mm.border, width: 0.6)),
        ),
        child: child,
      );

  /// Compact `label ....... value-widget` row for values that are not plain text.
  Widget _infoRowWidget(MMColors mm, String label, Widget value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 9),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(label,
                  style: TextStyle(color: mm.onCardMuted, fontSize: 13.5)),
            ),
            const SizedBox(width: 12),
            Flexible(child: Align(alignment: Alignment.centerRight, child: value)),
          ],
        ),
      );

  Widget _muted(String text) => Text(text,
      style: TextStyle(color: context.mm.onCardMuted, fontSize: 13.5));

  bool get _hasAnyTag =>
      vm.cuisineLabels.isNotEmpty ||
      vm.placeTypeLabels.isNotEmpty ||
      vm.healthTagIds.isNotEmpty ||
      vm.spiceTagIds.isNotEmpty ||
      vm.portionTagIds.isNotEmpty ||
      vm.speedTagIds.isNotEmpty;

  Widget _sampleBanner(AppLocalizations t, MMColors mm) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: MMColors.accentYellow.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(children: [
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
        ]),
      );

  Widget _hero(AppLocalizations t, MMColors mm) {
    final hero = vm.gallery.hero;
    final image = hero?.image ?? const CardImageModel();
    // GATE 3F: a monogram fallback used to occupy the same 210dp as a real
    // photo and dominated the screen. Only a REAL image earns the full height;
    // no photo is ever invented to fill the space.
    final height = image.hasApprovedImage ? 210.0 : 116.0;
    return Stack(children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: PlaceCardImage(
          model: image,
          title: vm.title,
          width: double.infinity,
          height: height,
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
    ]);
  }

  Widget _identity(AppLocalizations t, MMColors mm) => Row(
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
          Flexible(
            child: PlaceStatusChip(hours: vm.hours.model, business: vm.businessState),
          ),
        ],
      );

  Widget _businessBanner(AppLocalizations t, MMColors mm) {
    IconData? icon;
    String? label;
    Color? color;
    var strong = false;
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
        child: Row(children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(label,
                style: TextStyle(
                    color: mm.onCard,
                    fontSize: 13,
                    fontWeight: strong ? FontWeight.w800 : FontWeight.w600)),
          ),
        ]),
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

  String _localizedHoursLabel(AppLocalizations t, String raw) {
    if (raw == '__closed__') return t.t('closedAllDay');
    if (raw == '__24h__') return t.t('open24Hours');
    final sessions = raw.split('||').where((item) => item.trim().isNotEmpty).toList();
    if (sessions.length <= 1) return sessions.isEmpty ? raw : sessions.first;
    return '${sessions.first} · ${t.t('breakLabel')} · ${sessions[1]}';
  }

  Widget _hours(AppLocalizations t, MMColors mm) {
    final h = vm.hours;
    final children = <Widget>[
      Wrap(
        spacing: 10,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          PlaceStatusChip(hours: h.model, business: vm.businessState),
          if (h.todayLabel != null)
            Text('${t.t('todayHours')}: ${h.todayLabel}',
                style: TextStyle(color: mm.onCard, fontSize: 13)),
        ],
      ),
    ];
    if (h.model.state == CardHoursState.hoursExpired) {
      children.add(Padding(
          padding: const EdgeInsets.only(top: 6),
          child: _recheck(t.t('hoursExpired'), mm)));
    }
    if (!h.hasWeekly && h.todayLabel == null) {
      // Compact single row instead of a tall unknown-hours block.
      children.add(_infoRow(mm, t.t('todayHours'), t.t('hoursUnknown')));
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
            padding: const EdgeInsets.only(top: 5),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 92,
                  child: Text(t.t(d.dayLabelKey),
                      style: TextStyle(color: mm.onCardMuted, fontSize: 12.5)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(_localizedHoursLabel(t, d.hoursLabel),
                      textAlign: TextAlign.right,
                      style: TextStyle(color: mm.onCard, fontSize: 12.5)),
                ),
              ],
            ),
          ));
        }
      }
    }
    if (h.lastVerifiedLabel != null) {
      children.add(Padding(
          padding: const EdgeInsets.only(top: 6),
          child: _muted('${t.t('lastVerified')}: ${h.lastVerifiedLabel}')));
    }
    return _plain(Column(
        crossAxisAlignment: CrossAxisAlignment.start, children: children));
  }

  /// TAB 2 — ULASAN: MakanMana community reviews ONLY.
  ///
  /// The general/external rating stays as compact metadata at the top and is
  /// explicitly labelled as external, so its count can never be read as a
  /// MakanMana review count. Everything below it is real approved
  /// `place_reviews` data supplied by the route — nothing is invented.
  Widget _reviewsTab(AppLocalizations t, MMColors mm) {
    final data = widget.communityReviews;
    final canWrite = vm.actions.canRate && widget.callbacks.onRate != null;
    return SingleChildScrollView(
      key: const Key('restaurant-reviews-tab'),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _generalRatingStrip(t, mm),
          const SizedBox(height: 18),
          Text(t.t('communityReviewsTitle'),
              style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w800, color: mm.onCard)),
          const SizedBox(height: 10),
          if (data != null && data.hasReviews) ...[
            Row(
              key: const Key('restaurant-community-summary'),
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                if (data.average != null) ...[
                  const Icon(Icons.star_rounded,
                      size: 22, color: MMColors.accentYellow),
                  const SizedBox(width: 4),
                  Text(data.average!.toStringAsFixed(1),
                      style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: mm.onCard)),
                  const SizedBox(width: 10),
                ],
                Text('${data.count} ${t.t('communityReviewsCountSuffix')}',
                    style: TextStyle(color: mm.onCardMuted, fontSize: 13.5)),
              ],
            ),
            const SizedBox(height: 14),
            if (canWrite) _writeReviewButton(t),
            if (canWrite) const SizedBox(height: 14),
            KeyedSubtree(
              key: const Key('restaurant-community-reviews'),
              child: data.list!,
            ),
          ] else ...[
            Column(
              key: const Key('restaurant-community-reviews-empty'),
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(t.t('noMakanManaReviews'),
                    style: TextStyle(
                        color: mm.onCard,
                        fontSize: 14,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(t.t('beFirstReviewer'),
                    style: TextStyle(color: mm.onCardMuted, fontSize: 13.5)),
                if (canWrite) ...[
                  const SizedBox(height: 14),
                  _writeReviewButton(t),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }

  /// Reuses the EXISTING rating/review callback and route — no second submit
  /// path and no change to place_reviews write semantics or eligibility.
  Widget _writeReviewButton(AppLocalizations t) => Align(
        alignment: Alignment.centerLeft,
        child: FilledButton.icon(
          key: const Key('restaurant-write-review'),
          onPressed: _guard(widget.callbacks.onRate, allowed: vm.actions.canRate),
          icon: const Icon(Icons.rate_review_outlined, size: 18),
          label: Text(t.t('writeReview')),
        ),
      );

  /// Compact EXTERNAL rating metadata. Labelled and counted as external.
  Widget _generalRatingStrip(AppLocalizations t, MMColors mm) {
    if (!vm.hasRating) {
      return _infoRow(mm, t.t('generalRatingTitle'), t.t('ratingUnavailable'));
    }
    return Column(
      key: const Key('restaurant-general-rating'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(t.t('generalRatingTitle'),
            style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: mm.onCardMuted)),
        const SizedBox(height: 4),
        Row(children: [
          PlaceRatingLabel(model: vm.rating),
          if (vm.hasReviewCount) ...[
            const SizedBox(width: 8),
            Text('${vm.reviewCount} ${t.t('generalRatingCountSuffix')}',
                style: TextStyle(color: mm.onCardMuted, fontSize: 13)),
          ],
        ]),
        if (!vm.hasReviewCount) ...[
          const SizedBox(height: 2),
          _muted(t.t('notEnoughReviews')),
        ],
        const SizedBox(height: 4),
        Text(t.t('generalRatingSourceNote'),
            style: TextStyle(color: mm.onCardMuted, fontSize: 11.5)),
      ],
    );
  }

  /// Minimalist "label ....... value" row — replaces a bordered card per field.
  Widget _infoRow(MMColors mm, String label, String value, {IconData? icon}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 9),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 16, color: mm.iconMuted),
              const SizedBox(width: 8),
            ],
            Expanded(
              child: Text(label,
                  style: TextStyle(color: mm.onCardMuted, fontSize: 13.5)),
            ),
            const SizedBox(width: 12),
            Flexible(
              child: Text(value,
                  textAlign: TextAlign.right,
                  style: TextStyle(
                      color: mm.onCard,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      );

  Widget _tags(AppLocalizations t) {
    final all = <String>{
      ...vm.cuisineLabels,
      ...vm.placeTypeLabels,
      ...vm.healthTagIds,
      ...vm.spiceTagIds,
      ...vm.portionTagIds,
      ...vm.speedTagIds,
    }.toList();
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

  /// Categories derived from the ACTUAL menu data — never hard-coded.
  List<String> get _menuCategories {
    final seen = <String>[];
    for (final item in vm.menuItems) {
      final category = item.category?.trim();
      if (category == null || category.isEmpty) continue;
      if (!seen.contains(category)) seen.add(category);
    }
    return seen;
  }

  /// TAB 2 — always present. An empty menu shows an honest empty state rather
  /// than removing the tab, and never manufactures an item or comment target.
  Widget _menuTab(AppLocalizations t, MMColors mm) {
    if (!vm.hasMenu) {
      return ListView(
        key: const Key('restaurant-menu-tab'),
        padding: const EdgeInsets.fromLTRB(16, 28, 16, 32),
        children: [
          Column(
            key: const Key('restaurant-menu-empty'),
            children: [
              Icon(Icons.restaurant_menu_outlined, size: 40, color: mm.iconMuted),
              const SizedBox(height: 12),
              Text(t.t('emptyMenuTitle'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: mm.onCard,
                      fontSize: 15,
                      fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              Text(t.t('emptyMenuSubtitle'),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: mm.onCardMuted, fontSize: 13.5)),
            ],
          ),
        ],
      );
    }

    final categories = _menuCategories;
    final selected = _menuCategory;
    final visible = selected == null
        ? vm.menuItems
        : vm.menuItems
            .where((item) => (item.category ?? '').trim() == selected)
            .toList();
    final foods = visible.where((item) => item.isFood).toList();
    final drinks = visible.where((item) => item.isDrink).toList();

    return ListView(
      key: const Key('restaurant-menu-tab'),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 32),
      children: [
        if (categories.length > 1) ...[
          SizedBox(
            height: 38,
            child: ListView(
              key: const Key('restaurant-menu-categories'),
              scrollDirection: Axis.horizontal,
              children: [
                _categoryChip(t.t('menuCategoryAll'), selected == null,
                    () => setState(() => _menuCategory = null), mm),
                for (final category in categories)
                  _categoryChip(category, selected == category,
                      () => setState(() => _menuCategory = category), mm),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        if (foods.isNotEmpty) ...[
          Text(t.t('foodMenu'),
              style: TextStyle(
                  color: mm.onCard, fontSize: 15, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          for (final item in foods) _menuItem(t, mm, item),
        ],
        if (foods.isNotEmpty && drinks.isNotEmpty) const SizedBox(height: 18),
        if (drinks.isNotEmpty) ...[
          Text(t.t('drinkMenu'),
              style: TextStyle(
                  color: mm.onCard, fontSize: 15, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          for (final item in drinks) _menuItem(t, mm, item),
        ],
      ],
    );
  }

  Widget _categoryChip(
      String label, bool active, VoidCallback onTap, MMColors mm) {
    return Padding(
      key: ValueKey('menu-category-$label'),
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: active ? MMColors.danger : mm.card,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: active ? MMColors.danger : mm.border),
          ),
          child: Text(label,
              style: TextStyle(
                  color: active ? Colors.white : mm.onCardMuted,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700)),
        ),
      ),
    );
  }

  /// Clean menu row: name, description, price + availability, and a plain
  /// "Komen" affordance. Thin divider instead of a bordered card per item.
  ///
  /// The row key and the comment key both carry the STABLE DetailMenuItem.id —
  /// the exact menuItemId the Wave 3 callable expects. It is never regenerated.
  Widget _menuItem(AppLocalizations t, MMColors mm, DetailMenuItem item) {
    final subtitle = [item.category, item.description]
        .whereType<String>()
        .where((value) => value.trim().isNotEmpty)
        .join(' · ');
    final canComment = widget.onOpenMenuItemComments != null;
    return Container(
      key: ValueKey('restaurant-menu-${item.id}'),
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: mm.border, width: 0.6)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (item.imageUrl != null && item.imageUrl!.trim().isNotEmpty) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: PlaceCardImage(
                model: CardImageModel(url: item.imageUrl),
                title: item.name,
                width: 56,
                height: 56,
                borderRadius: 10,
              ),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.name,
                    style: TextStyle(
                        color: item.available ? mm.onCard : mm.onCardMuted,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700)),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(subtitle,
                      style: TextStyle(color: mm.onCardMuted, fontSize: 12.5)),
                ],
                const SizedBox(height: 6),
                Row(children: [
                  if (item.priceLabel != null) ...[
                    Text(item.priceLabel!,
                        style: TextStyle(
                            color: mm.onCard,
                            fontSize: 14,
                            fontWeight: FontWeight.w800)),
                    const SizedBox(width: 10),
                  ],
                  Text(
                    item.available
                        ? t.t('menuAvailable')
                        : t.t('menuUnavailable'),
                    style: TextStyle(
                        color: item.available
                            ? MMColors.successGreen
                            : mm.onCardMuted,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700),
                  ),
                ]),
                // WAVE 3 — comments for THIS exact menu item. The canonical
                // restaurant identity is supplied by the live route, so this
                // widget never has to know or guess it. No real comment count
                // is available cheaply, so the label stays a plain "Komen"
                // rather than inventing a number.
                if (canComment) ...[
                  const SizedBox(height: 2),
                  InkWell(
                    key: ValueKey('restaurant-menu-comments-${item.id}'),
                    onTap: () => widget.onOpenMenuItemComments!(item),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.mode_comment_outlined,
                            size: 15, color: MMColors.danger),
                        const SizedBox(width: 5),
                        Text(t.t('menuCommentOpen'),
                            style: const TextStyle(
                                color: MMColors.danger,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700)),
                      ]),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _serviceAmbience() =>
      PlaceTagChips(labels: [...vm.serviceLabels, ...vm.ambienceLabels], max: 8);

  Widget _halal(AppLocalizations t, MMColors mm) {
    final (String label, IconData icon, Color color) = switch (vm.halalState) {
      HalalDisplayState.certified =>
        (t.t('halalCertified'), Icons.verified_rounded, MMColors.successGreen),
      HalalDisplayState.merchantClaimed =>
        (t.t('halalMerchantClaim'), Icons.storefront_outlined, mm.onCardMuted),
      HalalDisplayState.communityReported =>
        (t.t('halalCommunityReport'), Icons.groups_outlined, mm.onCardMuted),
      HalalDisplayState.recheckRequired =>
        (t.t('halalRecheck'), Icons.update_rounded, MMColors.accentYellow),
      HalalDisplayState.possibleNonHalal =>
        (t.t('warnPossibleNonHalal'), Icons.help_outline_rounded, MMColors.danger),
      HalalDisplayState.unknown =>
        (t.t('halalUnknown'), Icons.help_outline_rounded, mm.onCardFaint),
      HalalDisplayState.none =>
        (t.t('noInfoAvailable'), Icons.info_outline_rounded, mm.onCardFaint),
    };
    return _plain(Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 17, color: color),
        const SizedBox(width: 7),
        Expanded(
          child: Text(label,
              softWrap: true,
              style: TextStyle(
                  color: color, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ),
      ],
    ));
  }

  Widget _dietary(AppLocalizations t, MMColors mm) => Align(
        alignment: Alignment.centerLeft,
        child: Wrap(
        spacing: 8,
        runSpacing: 6,
        children: [
          for (final d in vm.dietaryStates)
            _evidenceChip(mm, d.tagId, _evidenceKey(d.evidence), t),
        ],
      ));

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
          MMColors mm, String label, String evidenceKey, AppLocalizations t) =>
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: mm.chipBackground,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: mm.border),
        ),
        child: Text('$label · ${t.t(evidenceKey)}',
            style: TextStyle(color: mm.chipText, fontSize: 11.5)),
      );

  Widget _allergen(AppLocalizations t, MMColors mm) {
    final known = vm.allergenStates.where((a) => a.isKnownPresent).toList();
    final provenAbsent = vm.allergenStates.where((a) => a.provesAbsent).toList();
    if (known.isEmpty && provenAbsent.isEmpty) {
      return _card(Row(children: [
        Icon(Icons.info_outline_rounded, size: 16, color: mm.onCardMuted),
        const SizedBox(width: 6),
        Expanded(child: _muted(t.t('allergenCaution'))),
      ]));
    }
    return _card(Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final a in known)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(children: [
              Icon(Icons.warning_amber_rounded, size: 16, color: MMColors.danger),
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
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.location_on_outlined, size: 18, color: MMColors.danger),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              loc.address.isNotEmpty ? loc.address : t.t('noInfoAvailable'),
              style: TextStyle(color: mm.onCard, fontSize: 13.5),
            ),
          ),
        ]),
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

  Widget _contact(AppLocalizations t) {
    final c = vm.contact;
    if (!c.hasPhone && !c.hasWebsite) {
      return _plain(_infoRow(
          context.mm, t.t('callAction'), t.t('contactUnavailable')));
    }
    return _plain(Wrap(
      spacing: 10,
      runSpacing: 8,
      children: [
        if (c.hasPhone)
          OutlinedButton.icon(
            onPressed: _guard(widget.callbacks.onCall, allowed: vm.actions.canCall),
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
    final rows = <Widget>[
      _provRow(mm, t.t('provenanceTitle'), _sourceLabel(t, p.sourceMode)),
    ];
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
    return _plain(Column(
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
        child: Row(children: [
          Text(k, style: TextStyle(color: mm.onCardMuted, fontSize: 12.5)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(v,
                textAlign: TextAlign.right,
                style: TextStyle(color: mm.onCard, fontSize: 12.5)),
          ),
        ]),
      );

  Widget _recheck(String text, MMColors mm) => Row(children: [
        Icon(Icons.update_rounded, size: 15, color: MMColors.accentYellow),
        const SizedBox(width: 6),
        Flexible(
          child: Text(text,
              style: TextStyle(color: mm.onCardMuted, fontSize: 12.5)),
        ),
      ]);

  Widget _expandRow({
    required String label,
    required bool expanded,
    required VoidCallback onTap,
  }) =>
      Semantics(
        button: true,
        label: label,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(label,
                  style: TextStyle(
                      color: MMColors.danger,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600)),
              Icon(expanded ? Icons.expand_less : Icons.expand_more,
                  size: 18, color: MMColors.danger),
            ]),
          ),
        ),
      );

  Widget _actions(AppLocalizations t, MMColors mm) {
    final a = vm.actions;
    final buttons = <Widget>[
      // GATE 3F: compact utility actions only. The RATING/REVIEW action moved
      // to the Ulasan tab, so it no longer appears here at all.
      if (a.canOpenMaps)
        _compactAction(mm, 'maps', t.t('openMap'), Icons.map_outlined,
            _guard(widget.callbacks.onOpenMaps, allowed: a.canOpenMaps)),
      if (a.canSave)
        _compactAction(mm, 'save', t.t('save'), Icons.bookmark_border_rounded,
            _guard(widget.callbacks.onSave, allowed: a.canSave)),
      if (a.canShare)
        _compactAction(mm, 'share', t.t('share'), Icons.share_outlined,
            _submitting ? null : widget.callbacks.onShare),
      if (a.canLogMeal)
        _compactAction(mm, 'logmeal', t.t('logMealAction'), Icons.restaurant_rounded,
            _guard(widget.callbacks.onLogMeal, allowed: a.canLogMeal)),
      if (a.canAccept)
        _compactAction(mm, 'accept', t.t('save'), Icons.check_rounded,
            _guard(widget.callbacks.onAccept, allowed: a.canAccept)),
      if (a.canReject)
        _compactAction(mm, 'reject', t.t('showLess'), Icons.close_rounded,
            _guard(widget.callbacks.onReject, allowed: a.canReject)),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(spacing: 10, runSpacing: 10, children: buttons),
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

  bool get _showReportEntry =>
      PlaceCorrectionFlags.placeCorrectionEnabled &&
      widget.callbacks.onReportIncorrectInformation != null &&
      !vm.isSample;

  /// Small icon+label tile. Replaces the oversized filled buttons that used to
  /// dominate the profile.
  Widget _compactAction(MMColors mm, String keyId, String label, IconData icon,
      VoidCallback? cb) {
    final enabled = cb != null;
    return SizedBox(
      width: 78,
      child: InkWell(
        key: ValueKey('detail-action-$keyId'),
        onTap: cb,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Column(
            children: [
              Icon(icon,
                  size: 22,
                  color: enabled ? MMColors.danger : mm.iconMuted),
              const SizedBox(height: 6),
              Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: enabled ? mm.onCard : mm.onCardMuted)),
            ],
          ),
        ),
      ),
    );
  }
}

class RestaurantDetailLoading extends StatelessWidget {
  const RestaurantDetailLoading({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(),
        body: const Padding(
          padding: EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
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

class RestaurantDetailMissingId extends StatelessWidget {
  const RestaurantDetailMissingId({super.key, this.onBack});
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) =>
      _stateScaffold(context, 'missingPlaceId', onBack);
}

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


/// GATE 3F — pins the two-tab bar under the shared restaurant header.
class _TabBarHeader extends SliverPersistentHeaderDelegate {
  const _TabBarHeader({required this.child, required this.background});

  final TabBar child;
  final Color background;

  @override
  double get minExtent => child.preferredSize.height;

  @override
  double get maxExtent => child.preferredSize.height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(color: background, child: child);
  }

  @override
  bool shouldRebuild(_TabBarHeader oldDelegate) =>
      oldDelegate.child != child || oldDelegate.background != background;
}
