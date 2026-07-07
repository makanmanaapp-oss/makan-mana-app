import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';

import '../constants/plan_constants.dart';

/// Hasil percubaan pembelian.
enum PurchaseFlow {
  /// Google Play Billing sebenar berjaya dimulakan.
  storeStarted,

  /// Store tidak tersedia (app belum di Play Store / produk belum dicipta)
  /// -> caller patut fallback ke mock.
  storeUnavailable,
}

/// Langganan sebenar melalui Google Play Billing (M6).
///
/// POLISI PENTING: langganan digital Android WAJIB guna Play Billing —
/// gateway luar (Billplz dll) tidak dibenarkan untuk unlock ciri app.
/// Pengguna Malaysia boleh bayar kad/TnG/GrabPay/telco melalui Play.
///
/// Sehingga app di Play Console + produk langganan dicipta
/// (makanmana_plus_monthly / makanmana_pro_monthly), store akan
/// unavailable dan paywall fallback ke mock purchase.
class PurchaseService {
  PurchaseService({required this.firebaseReady}) {
    _subscription = InAppPurchase.instance.purchaseStream.listen(
      _onPurchases,
      onError: (Object e) => debugPrint('MakanMana: purchaseStream: $e'),
    );
  }

  final bool firebaseReady;
  StreamSubscription<List<PurchaseDetails>>? _subscription;

  /// uid pengguna semasa - diset oleh caller sebelum beli.
  String currentUid = '';

  Future<PurchaseFlow> buy({
    required String uid,
    required String plan, // plus | pro
  }) async {
    currentUid = uid;
    final iap = InAppPurchase.instance;
    if (!await iap.isAvailable()) return PurchaseFlow.storeUnavailable;

    final productId = plan == 'pro'
        ? PlanConstants.proSubscriptionId
        : PlanConstants.plusSubscriptionId;
    final response = await iap.queryProductDetails({productId});
    if (response.productDetails.isEmpty) {
      // Produk belum dicipta di Play Console.
      return PurchaseFlow.storeUnavailable;
    }
    await iap.buyNonConsumable(
      purchaseParam:
          PurchaseParam(productDetails: response.productDetails.first),
    );
    return PurchaseFlow.storeStarted;
  }

  Future<void> restore(String uid) async {
    currentUid = uid;
    final iap = InAppPurchase.instance;
    if (await iap.isAvailable()) {
      await iap.restorePurchases();
    }
  }

  /// Kemas kini pelan bila Play sahkan pembelian.
  /// (Fasa akan datang: sahkan resit di pelayan / RevenueCat.)
  Future<void> _onPurchases(List<PurchaseDetails> purchases) async {
    for (final p in purchases) {
      if (p.status == PurchaseStatus.purchased ||
          p.status == PurchaseStatus.restored) {
        final plan = p.productID == PlanConstants.proSubscriptionId
            ? 'pro'
            : p.productID == PlanConstants.plusSubscriptionId
                ? 'plus'
                : null;
        if (plan != null && firebaseReady && currentUid.isNotEmpty) {
          await FirebaseFirestore.instance
              .collection('users')
              .doc(currentUid)
              .set({
            'plan': plan,
            'planStatus': 'active',
            'planSource': 'google_play',
            'updatedAt': FieldValue.serverTimestamp(),
          }, SetOptions(merge: true));
        }
      }
      if (p.pendingCompletePurchase) {
        await InAppPurchase.instance.completePurchase(p);
      }
    }
  }

  void dispose() {
    _subscription?.cancel();
  }
}
