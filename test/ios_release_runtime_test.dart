import 'package:flutter_test/flutter_test.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:makan_mana/core/services/apple_purchase_request.dart';
import 'package:makan_mana/core/security/ios_firebase_configuration.dart';

void main() {
  PurchaseDetails purchase(String? id, String product) => PurchaseDetails(
        purchaseID: id,
        productID: product,
        status: PurchaseStatus.purchased,
        verificationData: PurchaseVerificationData(
            localVerificationData: '',
            serverVerificationData: '',
            source: 'app_store'),
        transactionDate: null,
      );

  test('StoreKit purchase and restore lookup does not require a Play token',
      () {
    expect(
        applePurchaseRequest(purchase('10000001234', 'makanmana_plus_monthly')),
        {
          'productId': 'makanmana_plus_monthly',
          'originalTransactionId': '10000001234'
        });
    expect(
        applePurchaseRequest(purchase('10000005678', 'makanmana_pro_monthly')),
        {
          'productId': 'makanmana_pro_monthly',
          'originalTransactionId': '10000005678'
        });
  });

  test('missing/malformed lookup IDs and unlisted products fail closed', () {
    for (final id in [null, '', 'receipt-content', '../12345', '123']) {
      expect(
          applePurchaseRequest(purchase(id, 'makanmana_plus_monthly')), isNull);
    }
    expect(applePurchaseRequest(purchase('10000001234', 'unlisted')), isNull);
  });

  test('missing or cross-project iOS Firebase inputs block startup', () {
    for (final project in ['', 'other-project', 'makanmana-c59f3']) {
      expect(
          () => productionIosFirebaseOptions(
              apiKey: '',
              appId: '',
              messagingSenderId: '',
              projectId: project,
              bundleId: 'com.makanmana.apps',
              storageBucket: '',
              clientId: ''),
          throwsUnsupportedError);
    }
    expect(
        () => productionIosFirebaseOptions(
            apiKey: 'test-only',
            appId: '1:123:android:abc',
            messagingSenderId: '123',
            projectId: 'makanmana-c59f3',
            bundleId: 'com.makanmana.apps',
            storageBucket: '',
            clientId: 'test-only'),
        throwsUnsupportedError);
  });
}
