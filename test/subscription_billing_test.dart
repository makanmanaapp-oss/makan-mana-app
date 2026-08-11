// MAKANMANA FINAL PRE-AAB — ujian pengawal-sumber langganan (client + rules).
//
// Pembelian Play/IAP sebenar TIDAK boleh dijalankan dalam CI (perlu peranti +
// akaun Play + produk diluluskan). Jadi ujian ini MENGUATKAN invarian
// KESELAMATAN secara statik terhadap sumber sebenar — sama gaya dengan
// group_card_test.dart. Ia menangkap regresi yang paling merbahaya:
// klien menulis plan sendiri, atau melangkau verifikasi pelayan.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final purchase =
      File('lib/core/services/purchase_service.dart').readAsStringSync();
  final paywall =
      File('lib/features/paywall/paywall_screen.dart').readAsStringSync();
  final rules = File('firestore.rules').readAsStringSync();
  final plan =
      File('lib/core/constants/plan_constants.dart').readAsStringSync();
  final coupon =
      File('lib/core/services/coupon_service.dart').readAsStringSync();

  group('Client NEVER self-grants plan (server-authoritative)', () {
    test('purchase_service does NOT write plan to Firestore', () {
      expect(purchase.contains('cloud_firestore'), isFalse,
          reason: 'Klien tak boleh sentuh Firestore untuk plan.');
      expect(purchase.contains("'plan':"), isFalse);
      expect(purchase.contains('FirebaseFirestore'), isFalse);
    });

    test('purchase_service routes to verify callable', () {
      expect(purchase.contains("httpsCallable('verifyGooglePlaySubscription')"),
          isTrue);
    });

    test('sends productId + purchaseToken (token = authoritative id)', () {
      expect(purchase.contains("'productId': productId"), isTrue);
      expect(purchase.contains("'purchaseToken': token"), isTrue);
      expect(
          purchase.contains('verificationData.serverVerificationData'), isTrue);
    });
  });

  group('Purchase lifecycle handled honestly (pending != success)', () {
    test('handles pending status', () {
      expect(purchase.contains('PurchaseStatus.pending'), isTrue);
      expect(purchase.contains('PurchaseOutcome.pending'), isTrue);
    });
    test('handles cancelled status', () {
      expect(purchase.contains('PurchaseStatus.canceled'), isTrue);
      expect(purchase.contains('PurchaseOutcome.cancelled'), isTrue);
    });
    test('handles error status', () {
      expect(purchase.contains('PurchaseStatus.error'), isTrue);
      expect(purchase.contains('PurchaseOutcome.error'), isTrue);
    });
    test('verifies on purchased AND restored', () {
      expect(purchase.contains('PurchaseStatus.purchased'), isTrue);
      expect(purchase.contains('PurchaseStatus.restored'), isTrue);
      expect(purchase.contains('_verifyOnServer'), isTrue);
    });
    test('acknowledge only after verify attempt (completePurchase gated)', () {
      expect(purchase.contains('pendingCompletePurchase'), isTrue);
      expect(purchase.contains('completePurchase(p)'), isTrue);
      expect(purchase.contains('localCompletionAllowed'), isTrue,
          reason: 'SDK queue hanya lengkap selepas backend menyatakan selamat.');
      expect(purchase.contains('GooglePlayPurchaseParam'), isTrue);
      expect(purchase.contains('applicationUserName: _obfuscatedAccountId(uid)'),
          isTrue);
    });
    test('exposes a results stream for honest UX', () {
      expect(purchase.contains('Stream<PurchaseResult> get results'), isTrue);
    });
  });

  group('buy/restore use the real (frozen) product IDs', () {
    test('product IDs unchanged', () {
      expect(plan.contains('makanmana_plus_monthly'), isTrue);
      expect(plan.contains('makanmana_pro_monthly'), isTrue);
    });
    test('buy picks pro vs plus product', () {
      expect(purchase.contains('PlanConstants.proSubscriptionId'), isTrue);
      expect(purchase.contains('PlanConstants.plusSubscriptionId'), isTrue);
    });
    test('restore calls restorePurchases', () {
      expect(purchase.contains('restorePurchases('), isTrue);
      expect(purchase.contains('applicationUserName: _obfuscatedAccountId(uid)'),
          isTrue);
    });
  });

  group('Paywall wiring (restore / manage / honest result messages)', () {
    test('listens to server-authoritative result stream', () {
      expect(paywall.contains('purchaseResultsProvider'), isTrue);
    });
    test('has Restore + Manage Subscription actions', () {
      expect(paywall.contains("l.t('restorePurchase')"), isTrue);
      expect(paywall.contains("l.t('manageSubscription')"), isTrue);
    });
    test('Manage Subscription opens Play with the frozen package', () {
      expect(paywall.contains('play.google.com/store/account/subscriptions'),
          isTrue);
      expect(paywall.contains('PlanConstants.androidPackageName'), isTrue);
    });
  });

  group('Firestore rules protect entitlement fields (PAY-01 + FINAL)', () {
    test('plan fields protected from client writes', () {
      expect(rules.contains("'plan', 'planStatus', 'planSource'"), isTrue);
      expect(rules.contains('protectedUserFieldsUnchanged()'), isTrue);
    });
    test('subscription fields protected from client writes', () {
      expect(rules.contains("'subscriptionProductId'"), isTrue);
      expect(rules.contains("'subscriptionExpiryMillis'"), isTrue);
      expect(rules.contains("'subscriptionAutoRenewing'"), isTrue);
    });
    test('new server-only billing collections remain under the catch-all deny', () {
      expect(rules.contains('match /{document=**}'), isTrue);
      expect(rules.contains('allow read, write: if false;'), isTrue);
    });
  });

  group('Billing regressions outside the purchase callback', () {
    test('coupon status still refreshes through its server callable', () {
      expect(coupon.contains("httpsCallable('refreshMyPlanStatus')"), isTrue);
    });
    test('PurchaseService has no mutable current-account attribution', () {
      expect(purchase.contains('currentUid'), isFalse);
    });
  });
}
