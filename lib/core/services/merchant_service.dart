import 'package:cloud_functions/cloud_functions.dart';

import '../constants/app_constants.dart';

/// Thin Firebase callable client for Merchant & Business Foundation.
///
/// The mobile app never writes merchant operational rows, the Master Place
/// Registry or Firebase runtime place data directly. Every mutation is routed
/// through authenticated Cloud Functions and the controlled merchant bridge.
class MerchantService {
  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion);

  String _requestId(String action) =>
      'merchant-$action-${DateTime.now().microsecondsSinceEpoch}';

  Map<String, dynamic> _map(dynamic value) {
    if (value is Map) {
      return value.map((key, item) => MapEntry(String(key), item));
    }
    return <String, dynamic>{};
  }

  List<Map<String, dynamic>> _list(dynamic value) {
    if (value is! List) return const <Map<String, dynamic>>[];
    return value.whereType<Map>().map(_map).toList(growable: false);
  }

  MerchantException _error(FirebaseFunctionsException error) {
    final message = error.message?.trim();
    return MerchantException(
      message?.isNotEmpty == true ? message! : 'merchant_operation_failed',
      code: error.code,
    );
  }

  Future<MerchantState> getState() async {
    try {
      final result = await _functions
          .httpsCallable('getMyMerchantState')
          .call<Map<dynamic, dynamic>>({
        'requestId': _requestId('state'),
      });
      final root = _map(result.data);
      final state = _map(root['state']);
      final accountRaw = state['account'];
      return MerchantState(
        account: accountRaw is Map ? _map(accountRaw) : null,
        claims: _list(state['claims']),
        submissions: _list(state['submissions']),
        memberships: _list(state['memberships']),
      );
    } on FirebaseFunctionsException catch (error) {
      throw _error(error);
    } catch (_) {
      throw const MerchantException('Ada masalah rangkaian. Cuba lagi.');
    }
  }

  Future<String> registerAccount({
    required String contactName,
    required String contactPhone,
    String? displayName,
    String? contactEmail,
    String? legalName,
    String? registrationNumber,
  }) async {
    try {
      final result = await _functions
          .httpsCallable('registerMerchantAccount')
          .call<Map<dynamic, dynamic>>({
        'requestId': _requestId('register'),
        'contactName': contactName.trim(),
        'contactPhone': contactPhone.trim(),
        if (displayName?.trim().isNotEmpty == true)
          'displayName': displayName!.trim(),
        if (contactEmail?.trim().isNotEmpty == true)
          'contactEmail': contactEmail!.trim(),
        if (legalName?.trim().isNotEmpty == true)
          'legalName': legalName!.trim(),
        if (registrationNumber?.trim().isNotEmpty == true)
          'registrationNumber': registrationNumber!.trim(),
      });
      final data = _map(result.data);
      final id = data['merchantAccountId'];
      if (id is String && id.isNotEmpty) return id;
      throw const MerchantException('merchant_account_id_missing');
    } on FirebaseFunctionsException catch (error) {
      throw _error(error);
    }
  }

  Future<String> submitClaim({
    required String claimedPlaceName,
    String? registryId,
    String? firebasePlaceId,
    String? verificationMethod,
  }) async {
    try {
      final result = await _functions
          .httpsCallable('submitMerchantPlaceClaim')
          .call<Map<dynamic, dynamic>>({
        'requestId': _requestId('claim'),
        'claimedPlaceName': claimedPlaceName.trim(),
        if (registryId?.trim().isNotEmpty == true)
          'registryId': registryId!.trim(),
        if (firebasePlaceId?.trim().isNotEmpty == true)
          'firebasePlaceId': firebasePlaceId!.trim(),
        if (verificationMethod?.trim().isNotEmpty == true)
          'verificationMethod': verificationMethod!.trim(),
      });
      final data = _map(result.data);
      final id = data['claimId'];
      if (id is String && id.isNotEmpty) return id;
      throw const MerchantException('merchant_claim_id_missing');
    } on FirebaseFunctionsException catch (error) {
      throw _error(error);
    }
  }

  Future<String> submitPlace({
    required String submissionType,
    required Map<String, dynamic> data,
    String? claimId,
    String? registryId,
  }) async {
    try {
      final result = await _functions
          .httpsCallable('submitMerchantPlace')
          .call<Map<dynamic, dynamic>>({
        'requestId': _requestId('submission'),
        'submissionType': submissionType.trim(),
        'data': data,
        if (claimId?.trim().isNotEmpty == true) 'claimId': claimId!.trim(),
        if (registryId?.trim().isNotEmpty == true)
          'registryId': registryId!.trim(),
      });
      final response = _map(result.data);
      final id = response['submissionId'];
      if (id is String && id.isNotEmpty) return id;
      throw const MerchantException('merchant_submission_id_missing');
    } on FirebaseFunctionsException catch (error) {
      throw _error(error);
    }
  }
}

class MerchantState {
  const MerchantState({
    required this.account,
    required this.claims,
    required this.submissions,
    required this.memberships,
  });

  final Map<String, dynamic>? account;
  final List<Map<String, dynamic>> claims;
  final List<Map<String, dynamic>> submissions;
  final List<Map<String, dynamic>> memberships;

  bool get hasAccount => account != null;
  String get accountStatus => String(account?['status'] ?? 'not_registered');
  String get verificationStatus =>
      String(account?['verification_status'] ?? 'unverified');
}

class MerchantException implements Exception {
  const MerchantException(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => message;
}
