import 'dart:async';
import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:in_app_purchase_android/in_app_purchase_android.dart';

import '../constants/app_constants.dart';
import '../constants/plan_constants.dart';

/// Hasil percubaan memulakan pembelian.
enum PurchaseFlow {
  /// Google Play Billing sebenar berjaya dimulakan.
  storeStarted,

  /// Store tidak tersedia (app belum di Play Store / produk belum dicipta)
  /// -> caller patut fallback ke mock/mesej jujur.
  storeUnavailable,
}

/// Keadaan hasil pembelian yang dipancarkan ke UI (Part 24) — JUJUR:
/// pending ≠ berjaya ≠ gagal.
enum PurchaseOutcome {
  /// Callable pelayan mengesahkan langganan aktif → pelan dinaik taraf.
  verifiedActive,

  /// Pelayan sahkan tetapi belum entitled (cth. PENDING/ON_HOLD) — jangan
  /// pura-pura jaya.
  verifiedNotEntitled,

  /// Play melaporkan pembelian tertangguh (kaedah bayaran belum selesai).
  pending,

  /// Pengguna batalkan aliran bayaran.
  cancelled,

  /// Ralat (rangkaian / verifikasi belum dikonfigur owner / Play).
  error,
}

/// Muatan hasil pembelian untuk UI.
class PurchaseResult {
  const PurchaseResult(this.outcome, {this.plan, this.planStatus, this.message});
  final PurchaseOutcome outcome;
  final String? plan;
  final String? planStatus;
  final String? message;
}

/// Langganan sebenar melalui Google Play Billing (server-authoritative).
///
/// KESELAMATAN (FINAL PRE-AAB): klien TIDAK PERNAH menulis users/{uid}.plan.
/// Bila Play sahkan pembelian, klien hantar {productId, purchaseToken} kepada
/// callable `verifyGooglePlaySubscription`; pelayan sahkan dengan Google Play
/// Developer API dan menulis kelayakan. Token = pengenal autoritatif. Akaun
/// ditentukan oleh request.auth.uid di pelayan (selamat semasa tukar akaun).
///
/// Pelayan juga ialah autoriti pengakuan Google Play. `completePurchase` di
/// bawah dikekalkan hanya untuk menutup giliran SDK Android selepas pelayan
/// mengesahkan pengakuan itu; ia tidak pernah memberi kelayakan atau plan.
///
/// Sehingga app di Play Console + produk langganan + Play Developer API
/// dikonfigur owner, store akan unavailable / callable pulangkan
/// failed-precondition dan UI papar mesej jujur (bukan bayaran palsu).
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

  /// Aliran hasil pembelian untuk UI (pending/berjaya/gagal/batal).
  Stream<PurchaseResult> get results => _results.stream;

  FirebaseFunctions get _fns =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  /// Mesti sepadan tepat dengan `obfuscatedAccountId` sisi-pelayan. Plugin
  /// Android menghantarnya ke BillingClient sebagai obfuscated account ID.
  static String _obfuscatedAccountId(String uid) =>
      sha256.convert(utf8.encode('mm_obfuscated_account_v1:$uid'))
          .toString()
          .substring(0, 32);

  Future<PurchaseFlow> buy({
    required String uid,
    required String plan, // plus | pro
  }) async {
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
      purchaseParam: GooglePlayPurchaseParam(
        productDetails: response.productDetails.first,
        applicationUserName: _obfuscatedAccountId(uid),
      ),
    );
    return PurchaseFlow.storeStarted;
  }

  /// Pulihkan langganan sedia ada (Part 22). Play akan pancarkan semula
  /// pembelian aktif melalui purchaseStream → disahkan semula di pelayan.
  Future<void> restore(String uid) async {
    final iap = InAppPurchase.instance;
    if (await iap.isAvailable()) {
      await iap.restorePurchases(
        applicationUserName: _obfuscatedAccountId(uid),
      );
    }
  }

  /// Uruskan kemas kini dari Play. TIADA tulisan Firestore di sini — hanya
  /// hantar purchaseToken ke callable pelayan (server-authoritative).
  Future<void> _onPurchases(List<PurchaseDetails> purchases) async {
    for (final p in purchases) {
      switch (p.status) {
        case PurchaseStatus.pending:
          _results.add(const PurchaseResult(PurchaseOutcome.pending));
          break;

        case PurchaseStatus.canceled:
          _results.add(const PurchaseResult(PurchaseOutcome.cancelled));
          break;

        case PurchaseStatus.error:
          _results.add(PurchaseResult(
            PurchaseOutcome.error,
            message: p.error?.message,
          ));
          break;

        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          final localCompletionAllowed = await _verifyOnServer(p);
          if (p.pendingCompletePurchase && localCompletionAllowed) {
            // Android plugin maps this to BillingClient acknowledgement. This
            // only runs after the backend's authoritative acknowledgement has
            // succeeded/already existed, so it is safe as local queue cleanup.
            await InAppPurchase.instance.completePurchase(p);
          }
          break;
      }
    }
  }

  /// Returns true only when the backend has durably verified and acknowledged
  /// the purchase, making Android's local queue completion safe.
  Future<bool> _verifyOnServer(PurchaseDetails p) async {
    final productId = p.productID;
    // Token pembelian = pengenal autoritatif (server sahkan dengan Play).
    final token = p.verificationData.serverVerificationData;
    if (!firebaseReady || productId.isEmpty || token.isEmpty) {
      _results.add(const PurchaseResult(PurchaseOutcome.error));
      return false;
    }
    try {
      final res =
          await _fns.httpsCallable('verifyGooglePlaySubscription').call<
              Map<dynamic, dynamic>>({
        'productId': productId,
        'purchaseToken': token,
      });
      final data = res.data;
      final entitled = data['entitled'] == true;
      final plan = data['plan'] as String?;
      final planStatus = data['planStatus'] as String?;
      final localCompletionAllowed = data['localCompletionAllowed'] == true;
      _results.add(PurchaseResult(
        entitled
            ? PurchaseOutcome.verifiedActive
            : PurchaseOutcome.verifiedNotEntitled,
        plan: plan,
        planStatus: planStatus,
      ));
      return localCompletionAllowed;
    } on FirebaseFunctionsException catch (e) {
      debugPrint('MakanMana: verifyGooglePlaySubscription: ${e.code}');
      _results.add(PurchaseResult(PurchaseOutcome.error, message: e.message));
      return false;
    } catch (e) {
      debugPrint('MakanMana: verify subscription ralat: $e');
      _results.add(const PurchaseResult(PurchaseOutcome.error));
      return false;
    }
  }

  void dispose() {
    _subscription?.cancel();
    _results.close();
  }
}
