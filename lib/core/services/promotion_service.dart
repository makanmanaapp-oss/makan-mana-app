import 'package:cloud_functions/cloud_functions.dart';

import '../../features/promotions/promotion.dart';
import '../constants/app_constants.dart';
import 'merchant_service.dart' show MerchantException;

/// WAVE 4 — Commercial Tools: thin callable client for merchant promotions.
///
/// Mirrors [MerchantService] deliberately: the app never touches
/// `restaurant_promotions` directly (rules keep it server-only), so every read
/// and write here is a Cloud Function call that re-authorizes membership.
///
/// Reuses [MerchantException] rather than inventing a parallel error type, so
/// existing merchant error handling keeps working unchanged.
class PromotionService {
  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  String _requestId(String action) =>
      'promotion-$action-${DateTime.now().microsecondsSinceEpoch}';

  Map<String, dynamic> _map(dynamic value) {
    if (value is Map) {
      return value.map((key, item) => MapEntry(key.toString(), item));
    }
    return <String, dynamic>{};
  }

  MerchantException _error(FirebaseFunctionsException error) {
    final message = error.message?.trim();
    return MerchantException(
      message?.isNotEmpty == true ? message! : 'promotion_operation_failed',
      code: error.code,
    );
  }

  Future<T> _call<T>(String name, Map<String, dynamic> payload,
      T Function(Map<String, dynamic> root) parse) async {
    try {
      final result =
          await _functions.httpsCallable(name).call<Map<dynamic, dynamic>>(payload);
      return parse(_map(result.data));
    } on FirebaseFunctionsException catch (error) {
      throw _error(error);
    } catch (_) {
      throw const MerchantException('Ada masalah rangkaian. Cuba lagi.');
    }
  }

  /// Every promotion for one restaurant, with the SERVER-derived status.
  Future<List<Promotion>> listForPlace(String canonicalPlaceId) {
    return _call(
      'listMerchantPromotions',
      {
        'canonicalPlaceId': canonicalPlaceId,
        'requestId': _requestId('list'),
      },
      (root) => Promotion.listFromMap(root['promotions']),
    );
  }

  /// Create a promotion. Born draft or scheduled — going live is a separate,
  /// audited act, never a side effect of creation.
  Future<String> create({
    required String canonicalPlaceId,
    required String title,
    required OfferType offerType,
    required DateTime startsAt,
    required DateTime endsAt,
    String description = '',
    String terms = '',
    String offerLabel = '',
    int? minSpendSen,
    PromotionEligibility eligibility = PromotionEligibility.all,
    PromotionStatus status = PromotionStatus.draft,
  }) {
    return _call(
      'createPromotion',
      {
        'canonicalPlaceId': canonicalPlaceId,
        'title': title,
        'description': description,
        'terms': terms,
        'offerType': offerType.wire,
        'offerLabel': offerLabel,
        if (minSpendSen != null) 'minSpendSen': minSpendSen,
        'eligibility': eligibility.toMap(),
        'startsAt': startsAt.millisecondsSinceEpoch,
        'endsAt': endsAt.millisecondsSinceEpoch,
        'status': status.wire,
        'requestId': _requestId('create'),
      },
      (root) => (root['promotionId'] as String?) ?? '',
    );
  }

  /// Patch a promotion. Only fields actually supplied are sent, so an edit
  /// never silently rewrites a field the merchant did not touch.
  Future<void> update({
    required String promotionId,
    String? title,
    String? description,
    String? terms,
    OfferType? offerType,
    String? offerLabel,
    int? minSpendSen,
    PromotionEligibility? eligibility,
    DateTime? startsAt,
    DateTime? endsAt,
  }) {
    return _call(
      'updatePromotion',
      {
        'promotionId': promotionId,
        if (title != null) 'title': title,
        if (description != null) 'description': description,
        if (terms != null) 'terms': terms,
        if (offerType != null) 'offerType': offerType.wire,
        if (offerLabel != null) 'offerLabel': offerLabel,
        if (minSpendSen != null) 'minSpendSen': minSpendSen,
        if (eligibility != null) 'eligibility': eligibility.toMap(),
        if (startsAt != null) 'startsAt': startsAt.millisecondsSinceEpoch,
        if (endsAt != null) 'endsAt': endsAt.millisecondsSinceEpoch,
        'requestId': _requestId('update'),
      },
      (_) {},
    );
  }

  /// Request a status change. The server re-decides against its own clock, so
  /// a stale screen can ask for something invalid but cannot make it happen.
  Future<PromotionStatus> setStatus({
    required String promotionId,
    required PromotionStatus status,
  }) {
    return _call(
      'setPromotionStatus',
      {
        'promotionId': promotionId,
        'status': status.wire,
        'requestId': _requestId('status'),
      },
      (root) => PromotionStatus.parse(root['status']),
    );
  }
}
