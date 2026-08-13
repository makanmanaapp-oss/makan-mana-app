import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';

import '../constants/plan_constants.dart';

/// Hasil percubaan pembelian.
enum PurchaseFlow {
  /// Google Play Billing sebenar berjaya dimulakan.
  storeStarted,

  /// Store/backend tidak tersedia atau produk belum dikonfigurasi.
  /// Production TIDAK akan fallback kepada paid mock entitlement.
  storeUnavailable,
}

/// Langganan Android melalui Google Play Billing dengan backend authority.
///
/// Polisi production:
/// - client tidak pernah menulis plan/planStatus;
/// - purchase token dihantar ke Cloud Function untuk Google Play verification;
/// - entitlement hanya diberi oleh backend selepas state sah;
/// - completePurchase hanya dibuat selepas backend membenarkan penutupan.
class PurchaseService {
  PurchaseService({required this.firebaseReady}) {
    _subscription = InAppPurchase.instance.purchaseStream.listen(
      _onPurchases,
      onError: (Object _) =>
          debugPrint('MakanMana: purchase stream unavailable.'),
    );
  }

  final bool firebaseReady;
  StreamSubscription<List<PurchaseDetails>>? _subscription;

  String currentUid = '';

  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: 'asia-southeast1');

  Future<String?> _prepareOpaqueAccountId(String uid) async {
    if (!firebaseReady || uid.isEmpty) return null;
    try {
      final result = await _functions
          .httpsCallable('prepareGooglePlayBilling')
          .call<void>();
      final data = Map<String, dynamic>.from(result.data as Map);
      final opaque = data['opaqueAccountId'];
      return opaque is String && opaque.isNotEmpty ? opaque : null;
    } catch (_) {
      debugPrint('MakanMana: billing account preparation failed.');
      return null;
    }
  }

  Future<PurchaseFlow> buy({
    required String uid,
    required String plan, // plus | pro
  }) async {
    currentUid = uid;
    if (!firebaseReady || uid.isEmpty) return PurchaseFlow.storeUnavailable;

    final opaqueAccountId = await _prepareOpaqueAccountId(uid);
    if (opaqueAccountId == null) return PurchaseFlow.storeUnavailable;

    final iap = InAppPurchase.instance;
    if (!await iap.isAvailable()) return PurchaseFlow.storeUnavailable;

    final productId = plan == 'pro'
        ? PlanConstants.proSubscriptionId
        : PlanConstants.plusSubscriptionId;
    final response = await iap.queryProductDetails({productId});
    if (response.productDetails.isEmpty) return PurchaseFlow.storeUnavailable;

    await iap.buyNonConsumable(
      purchaseParam: PurchaseParam(
        productDetails: response.productDetails.first,
        applicationUserName: opaqueAccountId,
      ),
    );
    return PurchaseFlow.storeStarted;
  }

  Future<void> restore(String uid) async {
    currentUid = uid;
    if (!firebaseReady || uid.isEmpty) return;
    final opaqueAccountId = await _prepareOpaqueAccountId(uid);
    if (opaqueAccountId == null) return;

    final iap = InAppPurchase.instance;
    if (await iap.isAvailable()) {
      await iap.restorePurchases(applicationUserName: opaqueAccountId);
    }
  }

  Future<bool> _verifyOnBackend(PurchaseDetails purchase) async {
    final uid = currentUid.isNotEmpty
        ? currentUid
        : FirebaseAuth.instance.currentUser?.uid ?? '';
    if (!firebaseReady || uid.isEmpty) return false;

    final allowedProduct =
        purchase.productID == PlanConstants.plusSubscriptionId ||
        purchase.productID == PlanConstants.proSubscriptionId;
    if (!allowedProduct) return false;

    final serverVerificationData =
        purchase.verificationData.serverVerificationData.trim();
    if (serverVerificationData.isEmpty) return false;

    try {
      final result = await _functions
          .httpsCallable('verifyGooglePlaySubscription')
          .call({
        'productId': purchase.productID,
        'purchaseToken': serverVerificationData,
      });
      final data = Map<String, dynamic>.from(result.data as Map);
      return data['verified'] == true &&
          data['allowCompletePurchase'] == true;
    } catch (_) {
      // Do not complete an unverified purchase. The purchase stream/RTDN can
      // safely retry later; no entitlement is granted by the client.
      debugPrint('MakanMana: server purchase verification failed.');
      return false;
    }
  }

  Future<void> _onPurchases(List<PurchaseDetails> purchases) async {
    for (final purchase in purchases) {
      if (purchase.status != PurchaseStatus.purchased &&
          purchase.status != PurchaseStatus.restored) {
        continue;
      }

      final verified = await _verifyOnBackend(purchase);
      if (verified && purchase.pendingCompletePurchase) {
        await InAppPurchase.instance.completePurchase(purchase);
      }
    }
  }

  void dispose() {
    _subscription?.cancel();
  }
}
