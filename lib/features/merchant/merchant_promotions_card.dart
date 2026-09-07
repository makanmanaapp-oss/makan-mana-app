import 'package:flutter/material.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/services/merchant_service.dart';
import '../../core/services/promotion_service.dart';
import '../../features/home/home_palette.dart';
import '../promotions/promotion.dart';

/// WAVE 4 — Commercial Tools: merchant promotions inside Merchant Center.
///
/// Deliberately shaped like [RestaurantEngagementCard]: pick a restaurant the
/// merchant is authorized for, then act. The restaurant is addressed by
/// `canonicalPlaceId` taken from the merchant state's engagement projection —
/// never typed, never derived from a registry id.
///
/// The card shows the SERVER-derived status, and the action buttons mirror the
/// server's transition table. They are an affordance only: every request is
/// re-decided server-side against the server clock, so a screen left open
/// overnight can ask for something stale but cannot make it happen.
class MerchantPromotionsCard extends StatefulWidget {
  const MerchantPromotionsCard({super.key, required this.state});

  final MerchantState state;

  @override
  State<MerchantPromotionsCard> createState() => _MerchantPromotionsCardState();
}

class _MerchantPromotionsCardState extends State<MerchantPromotionsCard> {
  final PromotionService _service = PromotionService();

  String? _selectedCanonicalPlaceId;
  List<Promotion> _promotions = const [];
  bool _loading = false;
  bool _busy = false;
  String? _error;
  bool _composing = false;

  final _title = TextEditingController();
  final _description = TextEditingController();
  final _terms = TextEditingController();
  final _offerLabel = TextEditingController();
  final _minSpend = TextEditingController();
  OfferType _offerType = OfferType.percentOff;
  DateTime? _startsAt;
  DateTime? _endsAt;

  List<MerchantEngagementRestaurant> get _restaurants =>
      widget.state.engagementRestaurants;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _terms.dispose();
    _offerLabel.dispose();
    _minSpend.dispose();
    super.dispose();
  }

  Future<void> _load(String canonicalPlaceId) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _service.listForPlace(canonicalPlaceId);
      if (!mounted) return;
      setState(() {
        _promotions = list;
        _loading = false;
      });
    } on MerchantException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    }
  }

  Future<void> _create() async {
    final l = AppLocalizations.of(context);
    final place = _selectedCanonicalPlaceId;
    if (place == null || _startsAt == null || _endsAt == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final sen = int.tryParse(_minSpend.text.trim());
      await _service.create(
        canonicalPlaceId: place,
        title: _title.text.trim(),
        description: _description.text.trim(),
        terms: _terms.text.trim(),
        offerType: _offerType,
        offerLabel: _offerLabel.text.trim(),
        minSpendSen: sen == null ? null : sen * 100,
        startsAt: _startsAt!,
        endsAt: _endsAt!,
      );
      if (!mounted) return;
      _title.clear();
      _description.clear();
      _terms.clear();
      _offerLabel.clear();
      _minSpend.clear();
      setState(() {
        _composing = false;
        _busy = false;
        _startsAt = null;
        _endsAt = null;
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(l.t('promoSaved'))));
      await _load(place);
    } on MerchantException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  Future<void> _setStatus(Promotion promo, PromotionStatus status) async {
    final l = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _service.setStatus(promotionId: promo.promotionId, status: status);
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(l.t('promoStatusChanged'))));
      final place = _selectedCanonicalPlaceId;
      if (place != null) await _load(place);
    } on MerchantException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  Future<void> _pickDate(bool isStart) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: isStart ? now : now.add(const Duration(days: 7)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (isStart) {
        _startsAt = picked;
      } else {
        // End of the chosen day, so "ends 12 Sep" means through 12 Sep.
        _endsAt = DateTime(picked.year, picked.month, picked.day, 23, 59, 59);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final palette = HomePalette.of(context);

    return Container(
      key: const Key('merchant-promotions-card'),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.t('promoSectionTitle'),
              style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  color: palette.text)),
          const SizedBox(height: 6),
          Text(l.t('promoSectionSubtitle'),
              style: TextStyle(color: palette.subtext, height: 1.4)),
          const SizedBox(height: 16),
          if (_restaurants.isEmpty)
            Text(l.t('promoSelectRestaurant'),
                key: const Key('merchant-promotions-no-place'),
                style: TextStyle(color: palette.subtext))
          else ...[
            DropdownButtonFormField<String>(
              key: const Key('merchant-promotions-place'),
              initialValue: _selectedCanonicalPlaceId,
              decoration: InputDecoration(labelText: l.t('promoSelectRestaurant')),
              // Labels are the restaurant NAME, never a canonical id.
              items: _restaurants
                  .map((r) => DropdownMenuItem(
                        value: r.canonicalPlaceId,
                        child: Text('${r.label} · ${r.role}'),
                      ))
                  .toList(growable: false),
              onChanged: _busy
                  ? null
                  : (value) {
                      setState(() {
                        _selectedCanonicalPlaceId = value;
                        _promotions = const [];
                      });
                      if (value != null) _load(value);
                    },
            ),
            const SizedBox(height: 14),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(l.t('promoLoadError'),
                    key: const Key('merchant-promotions-error'),
                    style: const TextStyle(
                        color: Colors.redAccent, fontWeight: FontWeight.w600)),
              ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(
                    key: Key('merchant-promotions-loading'),
                    child: CircularProgressIndicator(strokeWidth: 2)),
              )
            else if (_selectedCanonicalPlaceId != null && _promotions.isEmpty)
              Column(
                key: const Key('merchant-promotions-empty'),
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l.t('promoEmpty'),
                      style: TextStyle(
                          color: palette.text, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(l.t('promoEmptyHint'),
                      style: TextStyle(color: palette.subtext)),
                ],
              )
            else
              for (final promo in _promotions) _row(palette, l, promo),
            if (_selectedCanonicalPlaceId != null) ...[
              const SizedBox(height: 14),
              if (!_composing)
                OutlinedButton.icon(
                  key: const Key('merchant-promotions-create'),
                  onPressed: _busy ? null : () => setState(() => _composing = true),
                  icon: const Icon(Icons.add),
                  label: Text(l.t('promoCreate')),
                )
              else
                _composer(palette, l),
            ],
          ],
        ],
      ),
    );
  }

  Widget _row(HomePalette palette, AppLocalizations l, Promotion promo) {
    final status = promo.status ?? PromotionStatus.draft;
    final next = allowedNextStatuses(status);
    final minSpend = formatMinSpend(promo.minSpendSen);
    return Padding(
      key: Key('merchant-promotion-${promo.promotionId}'),
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(promo.title,
                    style: TextStyle(
                        fontWeight: FontWeight.w700, color: palette.text)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: palette.primary.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(l.t(promotionStatusKey(status)),
                    style: TextStyle(
                        color: palette.primary,
                        fontSize: 12,
                        fontWeight: FontWeight.w800)),
              ),
            ],
          ),
          if (promo.offerLabel.isNotEmpty || minSpend != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                [
                  if (promo.offerLabel.isNotEmpty) promo.offerLabel,
                  if (minSpend != null) '${l.t('promoPublicMinSpend')} $minSpend',
                ].join(' · '),
                style: TextStyle(color: palette.subtext, fontSize: 13),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              '${_date(promo.startsAt)} — ${_date(promo.endsAt)}',
              style: TextStyle(color: palette.subtext, fontSize: 12.5),
            ),
          ),
          if (next.isNotEmpty)
            Wrap(
              spacing: 8,
              children: [
                for (final target in next)
                  TextButton(
                    key: Key('promo-${promo.promotionId}-${target.wire}'),
                    onPressed: _busy ? null : () => _setStatus(promo, target),
                    child: Text(l.t(_actionKey(target))),
                  ),
              ],
            ),
          Divider(color: palette.border.withValues(alpha: 0.6)),
        ],
      ),
    );
  }

  Widget _composer(HomePalette palette, AppLocalizations l) {
    final ready = _title.text.trim().isNotEmpty &&
        _startsAt != null &&
        _endsAt != null;
    return Column(
      key: const Key('merchant-promotions-composer'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _title,
          decoration: InputDecoration(labelText: l.t('promoTitleLabel')),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _description,
          decoration: InputDecoration(labelText: l.t('promoDescriptionLabel')),
        ),
        const SizedBox(height: 10),
        DropdownButtonFormField<OfferType>(
          initialValue: _offerType,
          decoration: InputDecoration(labelText: l.t('promoOfferTypeLabel')),
          items: OfferType.values
              .map((t) => DropdownMenuItem(
                    value: t,
                    child: Text(l.t(_offerTypeKey(t))),
                  ))
              .toList(growable: false),
          onChanged: _busy ? null : (v) => setState(() => _offerType = v ?? _offerType),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _offerLabel,
          decoration: InputDecoration(labelText: l.t('promoOfferLabelLabel')),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _minSpend,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(labelText: l.t('promoMinSpendLabel')),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _terms,
          maxLines: 2,
          decoration: InputDecoration(labelText: l.t('promoTermsLabel')),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                key: const Key('promo-pick-start'),
                onPressed: _busy ? null : () => _pickDate(true),
                child: Text(_startsAt == null
                    ? '${l.t('promoStartsLabel')} · ${l.t('promoPickDate')}'
                    : '${l.t('promoStartsLabel')} · ${_date(_startsAt!)}'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton(
                key: const Key('promo-pick-end'),
                onPressed: _busy ? null : () => _pickDate(false),
                child: Text(_endsAt == null
                    ? '${l.t('promoEndsLabel')} · ${l.t('promoPickDate')}'
                    : '${l.t('promoEndsLabel')} · ${_date(_endsAt!)}'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            FilledButton(
              key: const Key('merchant-promotions-save'),
              onPressed: (_busy || !ready) ? null : _create,
              child: Text(l.t('promoSave')),
            ),
            const SizedBox(width: 10),
            TextButton(
              onPressed: _busy ? null : () => setState(() => _composing = false),
              child: Text(l.t('promoCancel')),
            ),
          ],
        ),
      ],
    );
  }

  static String _date(DateTime value) =>
      '${value.day.toString().padLeft(2, '0')}/'
      '${value.month.toString().padLeft(2, '0')}/${value.year}';

  static String _actionKey(PromotionStatus target) {
    switch (target) {
      case PromotionStatus.active:
        return 'promoActionPublish';
      case PromotionStatus.scheduled:
        return 'promoActionSchedule';
      case PromotionStatus.paused:
        return 'promoActionPause';
      case PromotionStatus.archived:
        return 'promoActionArchive';
      case PromotionStatus.draft:
      case PromotionStatus.expired:
        return 'promoActionSchedule';
    }
  }

  static String _offerTypeKey(OfferType type) {
    switch (type) {
      case OfferType.percentOff:
        return 'promoTypePercentOff';
      case OfferType.amountOff:
        return 'promoTypeAmountOff';
      case OfferType.bundle:
        return 'promoTypeBundle';
      case OfferType.freeItem:
        return 'promoTypeFreeItem';
      case OfferType.other:
        return 'promoTypeOther';
    }
  }
}
