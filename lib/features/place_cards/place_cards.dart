/// PART 1 Phase 1.9 — kad kedai KANONIKAL (dikarang dari primitif).
///
/// Satu keluarga kad untuk SEMUA konteks. Semua peraturan jujur diwarisi
/// daripada place_card_primitives.dart. TIADA logik skor di sini.
///
/// Varian:
/// - [CanonicalNearbyCard]   : kad mendatar (Home "Berdekatan")
/// - [CanonicalAiPickCard]   : kad hero (Home "Pilihan AI")
/// - [CanonicalSuggestionCard]: kad cadangan (Terima/Tolak/Seterusnya)
/// - [CanonicalExploreListCard]: baris senarai Explore
/// - [CanonicalExploreGridCard]: sel grid Explore
/// - [CanonicalMapPreviewCard]: pratonton peta padat
library;

import 'package:flutter/material.dart';

import '../../app/theme.dart';
import 'place_card_primitives.dart';
import 'place_card_view_model.dart';

/// Pembalut kad standard (background token, sempadan, radius).
class _CardShell extends StatelessWidget {
  const _CardShell({
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(12),
    this.elevated = false,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;
  final bool elevated;

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    return Material(
      color: elevated ? mm.elevatedCard : mm.card,
      borderRadius: BorderRadius.circular(kPlaceCardRadius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(kPlaceCardRadius),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(kPlaceCardRadius),
            border: Border.all(color: mm.border),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Panggilan balik tindakan bersama semua kad.
class PlaceCardCallbacks {
  const PlaceCardCallbacks({
    this.onTap,
    this.onViewDetails,
    this.onOpenMaps,
    this.onSave,
    this.onShare,
    this.onAccept,
    this.onReject,
    this.onNext,
    this.onLogMeal,
  });

  final VoidCallback? onTap;
  final VoidCallback? onViewDetails;
  final VoidCallback? onOpenMaps;
  final VoidCallback? onSave;
  final VoidCallback? onShare;
  final VoidCallback? onAccept;
  final VoidCallback? onReject;
  final VoidCallback? onNext;
  final VoidCallback? onLogMeal;
}

Widget _actions(PlaceCardViewModel vm, PlaceCardCallbacks cb) {
  return PlaceCardActions(
    vm: vm,
    onViewDetails: cb.onViewDetails,
    onOpenMaps: cb.onOpenMaps,
    onSave: cb.onSave,
    onShare: cb.onShare,
    onAccept: cb.onAccept,
    onReject: cb.onReject,
    onNext: cb.onNext,
    onLogMeal: cb.onLogMeal,
  );
}

// ---------------------------------------------------------------------------
// HOME — BERDEKATAN (mendatar)
// ---------------------------------------------------------------------------

class CanonicalNearbyCard extends StatelessWidget {
  const CanonicalNearbyCard({
    super.key,
    required this.vm,
    this.callbacks = const PlaceCardCallbacks(),
    this.width = 260,
  });

  final PlaceCardViewModel vm;
  final PlaceCardCallbacks callbacks;
  final double width;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      child: _CardShell(
        onTap: callbacks.onTap,
        padding: EdgeInsets.zero,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              children: [
                ClipRRect(
                  borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(kPlaceCardRadius)),
                  child: PlaceCardImage(
                    model: vm.image,
                    title: vm.title,
                    height: 120,
                    width: width,
                    borderRadius: 0,
                  ),
                ),
                Positioned(
                  left: 8,
                  top: 8,
                  child: PlaceCardSampleBadge(sourceMode: vm.sourceMode),
                ),
                if (vm.hasMatchScore)
                  Positioned(
                      right: 8, top: 8, child: PlaceMatchScoreBadge(vm: vm)),
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Expanded(
                          child: PlaceCardHeader(
                              title: vm.title, subtitle: vm.subtitle)),
                      const SizedBox(width: 6),
                      PlaceStatusChip(
                          hours: vm.hours, business: vm.businessState),
                    ],
                  ),
                  const SizedBox(height: 6),
                  PlaceQuickFacts(vm: vm, dense: true),
                  if (vm.warnings.isNotEmpty)
                    PlaceWarnings(warnings: vm.warnings, max: 1),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// HOME — PILIHAN AI (hero)
// ---------------------------------------------------------------------------

class CanonicalAiPickCard extends StatelessWidget {
  const CanonicalAiPickCard({
    super.key,
    required this.vm,
    this.callbacks = const PlaceCardCallbacks(),
  });

  final PlaceCardViewModel vm;
  final PlaceCardCallbacks callbacks;

  @override
  Widget build(BuildContext context) {
    return _CardShell(
      onTap: callbacks.onTap,
      padding: EdgeInsets.zero,
      elevated: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            children: [
              ClipRRect(
                borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(kPlaceCardRadius)),
                child: PlaceCardImage(
                  model: vm.image,
                  title: vm.title,
                  height: 170,
                  width: double.infinity,
                  borderRadius: 0,
                ),
              ),
              Positioned(
                left: 10,
                top: 10,
                child: PlaceCardSampleBadge(sourceMode: vm.sourceMode),
              ),
              if (vm.hasMatchScore)
                Positioned(
                    right: 10, top: 10, child: PlaceMatchScoreBadge(vm: vm)),
            ],
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                PlaceCardHeader(
                    title: vm.title, subtitle: vm.subtitle, maxTitleLines: 2),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    PlaceStatusChip(
                        hours: vm.hours, business: vm.businessState),
                    PlaceQuickFacts(vm: vm),
                  ],
                ),
                if (vm.cuisineLabels.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  PlaceTagChips(labels: vm.cuisineLabels),
                ],
                if (vm.matchReasons.isNotEmpty)
                  PlaceMatchReasons(reasons: vm.matchReasons),
                if (vm.halal != HalalDisplayState.none ||
                    vm.verificationBadges.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  PlaceVerificationBadges(
                      halal: vm.halal, badges: vm.verificationBadges),
                ],
                if (vm.warnings.isNotEmpty)
                  PlaceWarnings(warnings: vm.warnings),
                const SizedBox(height: 12),
                _actions(vm, callbacks),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// CADANGAN (Terima / Tolak / Seterusnya)
// ---------------------------------------------------------------------------

class CanonicalSuggestionCard extends StatelessWidget {
  const CanonicalSuggestionCard({
    super.key,
    required this.vm,
    this.callbacks = const PlaceCardCallbacks(),
  });

  final PlaceCardViewModel vm;
  final PlaceCardCallbacks callbacks;

  @override
  Widget build(BuildContext context) {
    // Struktur mirip AI Pick tetapi menonjolkan tindakan cadangan.
    return CanonicalAiPickCard(vm: vm, callbacks: callbacks);
  }
}

// ---------------------------------------------------------------------------
// EXPLORE — BARIS SENARAI
// ---------------------------------------------------------------------------

class CanonicalExploreListCard extends StatelessWidget {
  const CanonicalExploreListCard({
    super.key,
    required this.vm,
    this.callbacks = const PlaceCardCallbacks(),
  });

  final PlaceCardViewModel vm;
  final PlaceCardCallbacks callbacks;

  @override
  Widget build(BuildContext context) {
    return _CardShell(
      onTap: callbacks.onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: PlaceCardImage(
              model: vm.image,
              title: vm.title,
              width: 72,
              height: 72,
              borderRadius: 12,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(
                        child: PlaceCardHeader(
                            title: vm.title, subtitle: vm.subtitle)),
                    const SizedBox(width: 6),
                    PlaceCardSampleBadge(sourceMode: vm.sourceMode),
                  ],
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    PlaceStatusChip(
                        hours: vm.hours, business: vm.businessState),
                    PlaceQuickFacts(vm: vm, dense: true),
                  ],
                ),
                if (vm.warnings.isNotEmpty)
                  PlaceWarnings(warnings: vm.warnings, max: 1),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// EXPLORE — SEL GRID
// ---------------------------------------------------------------------------

class CanonicalExploreGridCard extends StatelessWidget {
  const CanonicalExploreGridCard({
    super.key,
    required this.vm,
    this.callbacks = const PlaceCardCallbacks(),
  });

  final PlaceCardViewModel vm;
  final PlaceCardCallbacks callbacks;

  @override
  Widget build(BuildContext context) {
    return _CardShell(
      onTap: callbacks.onTap,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            children: [
              ClipRRect(
                borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(kPlaceCardRadius)),
                child: AspectRatio(
                  aspectRatio: 1.4,
                  child: PlaceCardImage(
                    model: vm.image,
                    title: vm.title,
                    width: double.infinity,
                    borderRadius: 0,
                  ),
                ),
              ),
              Positioned(
                left: 6,
                top: 6,
                child: PlaceCardSampleBadge(sourceMode: vm.sourceMode),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                PlaceCardHeader(title: vm.title, dense: true),
                const SizedBox(height: 4),
                PlaceQuickFacts(vm: vm, dense: true),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// PRATONTON PETA (padat)
// ---------------------------------------------------------------------------

class CanonicalMapPreviewCard extends StatelessWidget {
  const CanonicalMapPreviewCard({
    super.key,
    required this.vm,
    this.callbacks = const PlaceCardCallbacks(),
  });

  final PlaceCardViewModel vm;
  final PlaceCardCallbacks callbacks;

  @override
  Widget build(BuildContext context) {
    return _CardShell(
      onTap: callbacks.onTap,
      elevated: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: PlaceCardImage(
              model: vm.image,
              title: vm.title,
              width: 56,
              height: 56,
              borderRadius: 10,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                PlaceCardHeader(
                    title: vm.title, subtitle: vm.subtitle, dense: true),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    PlaceStatusChip(
                        hours: vm.hours, business: vm.businessState),
                    PlaceQuickFacts(vm: vm, dense: true),
                  ],
                ),
              ],
            ),
          ),
          if (vm.actions.canOpenMaps)
            IconButton(
              onPressed: callbacks.onOpenMaps,
              icon: Icon(Icons.directions_rounded,
                  color: context.mm.onCardMuted),
            ),
        ],
      ),
    );
  }
}
