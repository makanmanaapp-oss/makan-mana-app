import 'package:in_app_purchase/in_app_purchase.dart';

/// An opaque lookup ID, never client-derived entitlement data. The App Store
/// status endpoint accepts a transaction ID or an original transaction ID.
Map<String, String>? applePurchaseRequest(PurchaseDetails purchase) {
  final id = purchase.purchaseID;
  if (id == null || !RegExp(r'^[0-9]{4,64}$').hasMatch(id)) return null;
  if (purchase.productID != 'makanmana_plus_monthly' &&
      purchase.productID != 'makanmana_pro_monthly') {
    return null;
  }
  return {'productId': purchase.productID, 'originalTransactionId': id};
}
