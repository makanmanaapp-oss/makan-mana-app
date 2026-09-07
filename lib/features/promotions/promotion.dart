/// WAVE 4 — Commercial Tools: promotion model + PURE display helpers.
///
/// The client is deliberately not the authority on whether an offer may be
/// shown. The server already filtered the public list by its own clock and by
/// the viewer's plan; a device with a wrong clock must not be able to reveal an
/// offer, so nothing here re-derives visibility from local time.
///
/// [status] on a merchant row IS server-derived and therefore trustworthy to
/// render — it is what the merchant must act on.
library;

/// Stored intent. The server also sends the derived truth in [status].
enum PromotionStatus {
  draft,
  scheduled,
  active,
  paused,
  expired,
  archived;

  static PromotionStatus parse(Object? value) {
    switch (value) {
      case 'scheduled':
        return PromotionStatus.scheduled;
      case 'active':
        return PromotionStatus.active;
      case 'paused':
        return PromotionStatus.paused;
      case 'expired':
        return PromotionStatus.expired;
      case 'archived':
        return PromotionStatus.archived;
      default:
        // Unknown values fail toward the least-visible state rather than
        // toward 'active' — an unrecognised status must never look live.
        return PromotionStatus.draft;
    }
  }

  String get wire => name;
}

/// Offer shape. Descriptive only — MakanMana processes no redemption in Wave 4.
enum OfferType {
  percentOff('percent_off'),
  amountOff('amount_off'),
  bundle('bundle'),
  freeItem('free_item'),
  other('other');

  const OfferType(this.wire);
  final String wire;

  static OfferType parse(Object? value) => OfferType.values.firstWhere(
        (t) => t.wire == value,
        orElse: () => OfferType.other,
      );
}

class PromotionEligibility {
  const PromotionEligibility({required this.audience, required this.plans});

  final String audience; // 'all' | 'plan'
  final List<String> plans;

  static const all = PromotionEligibility(audience: 'all', plans: []);

  bool get isPlanGated => audience == 'plan' && plans.isNotEmpty;

  static PromotionEligibility fromMap(Object? value) {
    if (value is! Map) return all;
    final plans = (value['plans'] as List?)
            ?.whereType<String>()
            .toList(growable: false) ??
        const <String>[];
    if (value['audience'] == 'plan' && plans.isNotEmpty) {
      return PromotionEligibility(audience: 'plan', plans: plans);
    }
    return all;
  }

  Map<String, dynamic> toMap() => {'audience': audience, 'plans': plans};
}

class Promotion {
  const Promotion({
    required this.promotionId,
    required this.canonicalPlaceId,
    required this.title,
    required this.description,
    required this.terms,
    required this.offerType,
    required this.offerLabel,
    required this.minSpendSen,
    required this.eligibility,
    required this.startsAtMs,
    required this.endsAtMs,
    this.status,
    this.storedStatus,
  });

  final String promotionId;
  final String canonicalPlaceId;
  final String title;
  final String description;
  final String terms;
  final OfferType offerType;
  final String offerLabel;
  final int? minSpendSen;
  final PromotionEligibility eligibility;
  final int startsAtMs;
  final int endsAtMs;

  /// Server-derived truth. Null on the public projection, where every returned
  /// offer is active by construction.
  final PromotionStatus? status;

  /// What the merchant last asked for. Null on the public projection.
  final PromotionStatus? storedStatus;

  DateTime get startsAt => DateTime.fromMillisecondsSinceEpoch(startsAtMs);
  DateTime get endsAt => DateTime.fromMillisecondsSinceEpoch(endsAtMs);

  static Promotion? fromMap(Object? value) {
    if (value is! Map) return null;
    final id = (value['promotionId'] as String?)?.trim() ?? '';
    final place = (value['canonicalPlaceId'] as String?)?.trim() ?? '';
    final title = (value['title'] as String?)?.trim() ?? '';
    final starts = (value['startsAtMs'] as num?)?.toInt();
    final ends = (value['endsAtMs'] as num?)?.toInt();
    if (id.isEmpty || place.isEmpty || title.isEmpty || starts == null || ends == null) {
      return null;
    }
    return Promotion(
      promotionId: id,
      canonicalPlaceId: place,
      title: title,
      description: (value['description'] as String?) ?? '',
      terms: (value['terms'] as String?) ?? '',
      offerType: OfferType.parse(value['offerType']),
      offerLabel: (value['offerLabel'] as String?) ?? '',
      minSpendSen: (value['minSpendSen'] as num?)?.toInt(),
      eligibility: PromotionEligibility.fromMap(value['eligibility']),
      startsAtMs: starts,
      endsAtMs: ends,
      status: value.containsKey('status')
          ? PromotionStatus.parse(value['status'])
          : null,
      storedStatus: value.containsKey('storedStatus')
          ? PromotionStatus.parse(value['storedStatus'])
          : null,
    );
  }

  static List<Promotion> listFromMap(Object? value) {
    if (value is! List) return const [];
    return value
        .map(Promotion.fromMap)
        .whereType<Promotion>()
        .toList(growable: false);
  }
}

/// "RM12.00" from sen. Returns null when there is no minimum, so callers can
/// omit the line rather than print a misleading "RM0".
String? formatMinSpend(int? sen) {
  if (sen == null || sen <= 0) return null;
  return 'RM${(sen / 100).toStringAsFixed(2)}';
}

/// Localisation key for a status chip. Keeps status wording in one place.
String promotionStatusKey(PromotionStatus status) {
  switch (status) {
    case PromotionStatus.draft:
      return 'promoStatusDraft';
    case PromotionStatus.scheduled:
      return 'promoStatusScheduled';
    case PromotionStatus.active:
      return 'promoStatusActive';
    case PromotionStatus.paused:
      return 'promoStatusPaused';
    case PromotionStatus.expired:
      return 'promoStatusExpired';
    case PromotionStatus.archived:
      return 'promoStatusArchived';
  }
}

/// Actions a merchant may request from a given server-derived status.
///
/// Mirrors the server transition table. It is a UX affordance ONLY: the server
/// re-decides every request, so a stale client can ask but cannot succeed.
List<PromotionStatus> allowedNextStatuses(PromotionStatus current) {
  switch (current) {
    case PromotionStatus.draft:
      return const [
        PromotionStatus.scheduled,
        PromotionStatus.active,
        PromotionStatus.archived,
      ];
    case PromotionStatus.scheduled:
      return const [
        PromotionStatus.active,
        PromotionStatus.paused,
        PromotionStatus.draft,
        PromotionStatus.archived,
      ];
    case PromotionStatus.active:
      return const [PromotionStatus.paused, PromotionStatus.archived];
    case PromotionStatus.paused:
      return const [PromotionStatus.active, PromotionStatus.archived];
    case PromotionStatus.expired:
      return const [PromotionStatus.archived];
    case PromotionStatus.archived:
      return const [];
  }
}
