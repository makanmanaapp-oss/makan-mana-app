import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:in_app_purchase_android/in_app_purchase_android.dart';
import 'package:in_app_purchase_storekit/in_app_purchase_storekit.dart';
import 'package:in_app_purchase_storekit/store_kit_wrappers.dart';

import '../constants/app_constants.dart';
import '../constants/plan_constants.dart';
import 'apple_purchase_request.dart';

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

/// TEMP Build 5 diagnostic: kegagalan SEBELUM purchase sheet StoreKit muncul.
/// Tidak membawa UID, appAccountToken, receipt atau transaction token.
class PurchaseStartDiagnosticException implements Exception {
  const PurchaseStartDiagnosticException({
    required this.stage,
    required this.code,
    required this.productId,
    this.message = '',
  });

  final String stage;
  final String code;
  final String productId;
  final String message;

  String get safeDisplay {
    final suffix = message.isEmpty ? '' : ' · $message';
    return '$stage/$code · $productId$suffix';
  }

  @override
  String toString() => 'PurchaseStartDiagnosticException($safeDisplay)';
}

String _safePurchaseDiagnosticText(Object? value, {int maxLength = 180}) {
  if (value == null) return '';
  final normalized = value
      .toString()
      .replaceAll(RegExp(r'[\r\n\t]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  if (normalized.length <= maxLength) return normalized;
  return '${normalized.substring(0, maxLength)}…';
}

String _platformPurchaseMessage(PlatformException error) {
  final parts = <String>[];
  final msg = _safePurchaseDiagnosticText(error.message);
  if (msg.isNotEmpty) parts.add(msg);

  final details = error.details;
  if (details is Map) {
    for (final key in const [
      'domain',
      'code',
      'message',
      'NSLocalizedDescription',
      'NSLocalizedFailureReason',
    ]) {
      final value = _safePurchaseDiagnosticText(details[key]);
      if (value.isNotEmpty && !parts.contains(value)) {
        parts.add('$key=$value');
      }
    }
  }

  return _safePurchaseDiagnosticText(parts.join(' | '));
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
        debugPrint('MakanMana: purchase stream failed.');
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

  /// iOS WAVE 2 — Apple MENGHENDAKI `appAccountToken` menjadi UUID RFC 4122,
  /// jadi ID legap Play (32 hex) tidak boleh digunakan semula di sini. Backend
  /// menerbitkan UUID yang stabil daripada UID; klien tidak pernah menciptanya.
  Future<String?> _prepareAppleAccountToken(String uid) async {
    if (!firebaseReady || uid.isEmpty) return null;

    try {
      final result = await _fns
          .httpsCallable('prepareAppleBilling')
          .call<Map<dynamic, dynamic>>();

      final token = result.data['appAccountToken'];

      if (token is String && token.isNotEmpty) {
        return token;
      }

      return null;
    } on FirebaseFunctionsException catch (e) {
      debugPrint('MakanMana: prepareAppleBilling: ${e.code}');
      return null;
    } catch (_) {
      debugPrint('MakanMana: Apple billing preparation failed.');
      return null;
    }
  }

  /// Betul untuk platform semasa. Android guna ID legap Play; iOS guna UUID.
  Future<String?> _prepareStoreAccountId(String uid) =>
      defaultTargetPlatform == TargetPlatform.iOS
          ? _prepareAppleAccountToken(uid)
          : _prepareOpaqueAccountId(uid);


  /// iOS recovery: transaksi StoreKit yang GAGAL/DI-BATALKAN mesti dibuang
  /// daripada SKPaymentQueue. Jika tidak, plugin menolak cubaan baharu untuk
  /// productId yang sama dengan `storekit_duplicate_product_object`.
  ///
  /// Keselamatan: hanya state `failed` dibersihkan. Jangan sekali-kali
  /// finish `purchasing`, `deferred`, `purchased` atau `restored`
  /// di sini kerana pembelian berjaya masih perlu disahkan backend dahulu.
  Future<int> _finishFailedIosTransactions(String productId) async {
    if (defaultTargetPlatform != TargetPlatform.iOS || productId.isEmpty) {
      return 0;
    }

    try {
      final queue = SKPaymentQueueWrapper();
      final transactions = await queue.transactions();
      var finished = 0;

      for (final transaction in transactions) {
        if (transaction.payment.productIdentifier != productId) continue;
        if (transaction.transactionState !=
            SKPaymentTransactionStateWrapper.failed) {
          continue;
        }

        await queue.finishTransaction(transaction);
        finished += 1;
      }

      if (finished > 0) {
        debugPrint(
          'MakanMana: cleared $finished failed StoreKit transaction(s) '
          'for $productId before purchase.',
        );
      }
      return finished;
    } catch (_) {
      // Best-effort recovery sahaja. Cubaan pembelian masih diteruskan supaya
      // StoreKit boleh memberi diagnostic sebenar jika queue masih tersekat.
      debugPrint('MakanMana: failed StoreKit queue cleanup unavailable.');
      return 0;
    }
  }

  Future<void> _completeFailedOrCancelledPurchase(
    PurchaseDetails purchase,
  ) async {
    if (defaultTargetPlatform != TargetPlatform.iOS ||
        !purchase.pendingCompletePurchase) {
      return;
    }

    try {
      await InAppPurchase.instance.completePurchase(purchase);
      debugPrint(
        'MakanMana: completed terminal StoreKit transaction '
        'for ${purchase.productID}.',
      );
    } catch (_) {
      debugPrint('MakanMana: terminal StoreKit completion failed.');
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
      debugPrint(
        'MakanMana: store product unavailable. '
        'requested=$productId notFound=${response.notFoundIDs.join(',')} '
        'error=${response.error?.code ?? 'none'}',
      );
      return PurchaseFlow.storeUnavailable;
    }

    final storeAccountId = await _prepareStoreAccountId(uid);

    if (storeAccountId == null) {
      return PurchaseFlow.storeUnavailable;
    }

    final product = response.productDetails.first;

    // Clear only FAILED StoreKit transactions left by a cancelled/failed
    // attempt. Successful/pending transactions are never finished here.
    await _finishFailedIosTransactions(productId);

    try {
      final started = await iap.buyNonConsumable(
        // StoreKit 2 memetakan `applicationUserName` kepada `appAccountToken`,
        // iaitu medan yang App Store Server API pulangkan dan yang pelayan
        // gunakan untuk membuktikan pemilikan.
        purchaseParam: defaultTargetPlatform == TargetPlatform.iOS
            ? Sk2PurchaseParam(
                productDetails: product,
                applicationUserName: storeAccountId,
              )
            : GooglePlayPurchaseParam(
                productDetails: product,
                applicationUserName: storeAccountId,
              ),
      );

      // Plugin boleh memulangkan false jika permintaan tidak berjaya
      // diserahkan kepada store walaupun tiada exception dilemparkan.
      if (!started) {
        throw PurchaseStartDiagnosticException(
          stage: defaultTargetPlatform == TargetPlatform.iOS
              ? 'IOS_START'
              : 'PLAY_START',
          code: 'RETURNED_FALSE',
          productId: productId,
        );
      }
    } on PurchaseStartDiagnosticException {
      rethrow;
    } on PlatformException catch (e, st) {
      final diagnostic = PurchaseStartDiagnosticException(
        stage: defaultTargetPlatform == TargetPlatform.iOS
            ? 'IOS_START'
            : 'PLAY_START',
        code: _safePurchaseDiagnosticText(e.code, maxLength: 80),
        productId: productId,
        message: _platformPurchaseMessage(e),
      );
      debugPrint('MakanMana: purchase start failed: ${diagnostic.safeDisplay}');
      Error.throwWithStackTrace(diagnostic, st);
    } catch (e, st) {
      final diagnostic = PurchaseStartDiagnosticException(
        stage: defaultTargetPlatform == TargetPlatform.iOS
            ? 'IOS_START'
            : 'PLAY_START',
        code: _safePurchaseDiagnosticText(e.runtimeType, maxLength: 80),
        productId: productId,
        message: _safePurchaseDiagnosticText(e),
      );
      debugPrint('MakanMana: purchase start failed: ${diagnostic.safeDisplay}');
      Error.throwWithStackTrace(diagnostic, st);
    }

    return PurchaseFlow.storeStarted;
  }

  Future<void> restore(String uid) async {
    if (!firebaseReady || uid.isEmpty) return;

    final iap = InAppPurchase.instance;

    if (!await iap.isAvailable()) return;

    final storeAccountId = await _prepareStoreAccountId(uid);

    if (storeAccountId == null) return;

    await iap.restorePurchases(
      applicationUserName: storeAccountId,
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
          // StoreKit menandakan transaksi batal sebagai terminal dan ia masih
          // boleh pendingCompletePurchase. Finish supaya cubaan seterusnya
          // untuk productId sama tidak tersekat sebagai duplicate.
          await _completeFailedOrCancelledPurchase(purchase);
          _results.add(
            const PurchaseResult(PurchaseOutcome.cancelled),
          );
          break;

        case PurchaseStatus.error:
          // Ralat terminal juga perlu dikeluarkan daripada queue. Ini TIDAK
          // memberi entitlement dan TIDAK memintas verification backend.
          await _completeFailedOrCancelledPurchase(purchase);
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

    final isApple = defaultTargetPlatform == TargetPlatform.iOS;
    final appleRequest = isApple ? applePurchaseRequest(purchase) : null;
    if (!firebaseReady ||
        productId.isEmpty ||
        (isApple ? appleRequest == null : token.isEmpty)) {
      _results.add(
        const PurchaseResult(PurchaseOutcome.error),
      );
      return false;
    }

    try {
      final result = isApple
          ? await _fns
              .httpsCallable('verifyAppleSubscription')
              .call<Map<dynamic, dynamic>>(appleRequest)
          : await _fns
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
      final localCompletionAllowed = data['localCompletionAllowed'] == true ||
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
        'MakanMana: subscription verification: ${e.code}',
      );

      _results.add(
        PurchaseResult(
          PurchaseOutcome.error,
          message: e.message,
        ),
      );

      return false;
    } catch (_) {
      debugPrint('MakanMana: subscription verification failed.');

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
