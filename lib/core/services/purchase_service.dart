import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:in_app_purchase_android/in_app_purchase_android.dart';

import '../constants/app_constants.dart';
import '../constants/plan_constants.dart';

enum PurchaseFlow {
  storeStarted,
  storeUnavailable,
}

enum PurchaseOutcome {
  verifiedActive,
  verifiedNotEntitled,
  pending,
  cancelled,
  error,
}

class PurchaseResult {
  const PurchaseResult(
    this.outcome, {
    this.plan,
    this.planStatus,
    this.message,
  });

  final PurchaseOutcome outcome;
  final String? plan;
  final String? planStatus;
  final String? message;
}

/// Google Play Billing dengan backend sebagai authority.
///
/// Client:
/// - tidak menulis plan/planStatus;
/// - minta opaque account ID daripada backend;
/// - hantar purchase token kepada backend;
/// - hanya completePurchase selepas backend verify + acknowledge.
class PurchaseService {
  PurchaseService({required this.firebaseReady}) {
    _subscription = InAppPurchase.instance.purchaseStream.listen(
      _onPurchases,
      onError: (Object e) {
        debugPrint('MakanMana: purchaseStream: $e');
        _results.add(const PurchaseResult(PurchaseOutcome.error));
      },
    );
  }

  final bool firebaseReady;

  StreamSubscription<List<PurchaseDetails>>? _subscription;

  final StreamController<PurchaseResult> _results =
      StreamController<PurchaseResult>.broadcast();

  Stream<PurchaseResult> get results => _results.stream;

  FirebaseFunctions get _fns =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  /// Backend mencipta opaque account ID yang mesti digunakan oleh Google Play.
  /// Client tidak generate/hash ID ini sendiri.
  Future<String?> _prepareOpaqueAccountId(String uid) async {
    if (!firebaseReady || uid.isEmpty) return null;

    try {
      final result = await _fns
          .httpsCallable('prepareGooglePlayBilling')
          .call<Map<dynamic, dynamic>>();

      final data = result.data;
      final opaque = data['opaqueAccountId'];

      if (opaque is String && opaque.isNotEmpty) {
        return opaque;
      }

      return null;
    } on FirebaseFunctionsException catch (e) {
      debugPrint('MakanMana: prepareGooglePlayBilling: ${e.code}');
      return null;
    } catch (_) {
      debugPrint('MakanMana: billing account preparation failed.');
      return null;
    }
  }

  Future<PurchaseFlow> buy({
    required String uid,
    required String plan,
  }) async {
    if (!firebaseReady || uid.isEmpty) {
      return PurchaseFlow.storeUnavailable;
    }

    final iap = InAppPurchase.instance;

    if (!await iap.isAvailable()) {
      return PurchaseFlow.storeUnavailable;
    }

    final productId = plan == 'pro'
        ? PlanConstants.proSubscriptionId
        : PlanConstants.plusSubscriptionId;

    final response = await iap.queryProductDetails({productId});

    if (response.productDetails.isEmpty) {
      return PurchaseFlow.storeUnavailable;
    }

    final opaqueAccountId = await _prepareOpaqueAccountId(uid);

    if (opaqueAccountId == null) {
      return PurchaseFlow.storeUnavailable;
    }

    await iap.buyNonConsumable(
      purchaseParam: GooglePlayPurchaseParam(
        productDetails: response.productDetails.first,
        applicationUserName: opaqueAccountId,
      ),
    );

    return PurchaseFlow.storeStarted;
  }

  Future<void> restore(String uid) async {
    if (!firebaseReady || uid.isEmpty) return;

    final iap = InAppPurchase.instance;

    if (!await iap.isAvailable()) return;

    final opaqueAccountId = await _prepareOpaqueAccountId(uid);

    if (opaqueAccountId == null) return;

    await iap.restorePurchases(
      applicationUserName: opaqueAccountId,
    );
  }

  Future<void> _onPurchases(List<PurchaseDetails> purchases) async {
    for (final purchase in purchases) {
      switch (purchase.status) {
        case PurchaseStatus.pending:
          _results.add(
            const PurchaseResult(PurchaseOutcome.pending),
          );
          break;

        case PurchaseStatus.canceled:
          _results.add(
            const PurchaseResult(PurchaseOutcome.cancelled),
          );
          break;

        case PurchaseStatus.error:
          _results.add(
            PurchaseResult(
              PurchaseOutcome.error,
              message: purchase.error?.message,
            ),
          );
          break;

        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          final localCompletionAllowed = await _verifyOnServer(purchase);

          if (purchase.pendingCompletePurchase && localCompletionAllowed) {
            await InAppPurchase.instance.completePurchase(purchase);
          }
          break;
      }
    }
  }

  Future<bool> _verifyOnServer(PurchaseDetails purchase) async {
    final productId = purchase.productID;
    final token = purchase.verificationData.serverVerificationData.trim();

    if (!firebaseReady || productId.isEmpty || token.isEmpty) {
      _results.add(
        const PurchaseResult(PurchaseOutcome.error),
      );
      return false;
    }

    try {
      final result = await _fns
          .httpsCallable('verifyGooglePlaySubscription')
          .call<Map<dynamic, dynamic>>({
        'productId': productId,
        'purchaseToken': token,
      });

      final data = result.data;

      final entitled = data['entitled'] == true;
      final plan = data['plan'] as String?;
      final planStatus = data['planStatus'] as String?;

      // Nama field mesti sama dengan backend production.
      final localCompletionAllowed =
          data['localCompletionAllowed'] == true ||
          data['allowCompletePurchase'] == true;

      _results.add(
        PurchaseResult(
          entitled
              ? PurchaseOutcome.verifiedActive
              : PurchaseOutcome.verifiedNotEntitled,
          plan: plan,
          planStatus: planStatus,
        ),
      );

      return localCompletionAllowed;
    } on FirebaseFunctionsException catch (e) {
      debugPrint(
        'MakanMana: verifyGooglePlaySubscription: ${e.code}',
      );

      _results.add(
        PurchaseResult(
          PurchaseOutcome.error,
          message: e.message,
        ),
      );

      return false;
    } catch (e) {
      debugPrint(
        'MakanMana: verify subscription ralat: $e',
      );

      _results.add(
        const PurchaseResult(PurchaseOutcome.error),
      );

      return false;
    }
  }

  void dispose() {
    _subscription?.cancel();
    _results.close();
  }
}
