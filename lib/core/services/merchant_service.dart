import 'package:cloud_functions/cloud_functions.dart';

import '../../features/merchant/restaurant_profile_proposal.dart';
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
      return value.map((key, item) => MapEntry(key.toString(), item));
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
        // WAVE 3D Gate 2 corrective — read-only engagement projection carrying
        // the CANONICAL restaurant identity. Never derived from registry_id.
        engagementRestaurants: _list(state['engagementRestaurants'])
            .map(MerchantEngagementRestaurant.fromMap)
            .whereType<MerchantEngagementRestaurant>()
            .toList(growable: false),
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

  /// New-place flow only. Existing claimed restaurant profile edits must use
  /// [submitProfileUpdate], which has a strict Wave 2 proposal allow-list.
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

  /// Submit a review-gated change proposal for an existing merchant place.
  ///
  /// This callable cannot approve, apply or publish. The registry ID is required
  /// and the proposal is validated again by Cloud Functions before bridging to
  /// Control Center.
  Future<String> submitProfileUpdate({
    required String registryId,
    required String submissionType,
    required Map<String, dynamic> data,
    String? claimId,
  }) async {
    final cleanRegistryId = registryId.trim();
    if (cleanRegistryId.isEmpty) {
      throw const MerchantException('registry_id_required');
    }

    final cleanType = submissionType.trim();
    final cleanData = RestaurantProfileProposal.validate(cleanType, data);

    try {
      final result = await _functions
          .httpsCallable('submitMerchantProfileUpdate')
          .call<Map<dynamic, dynamic>>({
        'requestId': _requestId('profile-update'),
        'registryId': cleanRegistryId,
        'submissionType': cleanType,
        'data': cleanData,
        if (claimId?.trim().isNotEmpty == true) 'claimId': claimId!.trim(),
      });
      final response = _map(result.data);
      final id = response['submissionId'];
      if (id is String && id.isNotEmpty) return id;
      throw const MerchantException('merchant_submission_id_missing');
    } on FirebaseFunctionsException catch (error) {
      throw _error(error);
    } on ArgumentError catch (error) {
      throw MerchantException(error.message?.toString() ?? 'restaurant_profile_proposal_invalid');
    }
  }
}

/// WAVE 3D Gate 2 corrective — one restaurant the merchant may act AS.
///
/// IDENTITY LOCK: [registryId] is a MASTER REGISTRY ROW id and [canonicalPlaceId]
/// is the PUBLIC restaurant identity. They are different values and must stay
/// distinct. Only [canonicalPlaceId] may ever be used for engagement; the
/// Control Center resolves it from `place_registry_master.canonical_place_id`
/// and omits any membership whose canonical mapping is missing or ambiguous.
class MerchantEngagementRestaurant {
  const MerchantEngagementRestaurant({
    required this.registryId,
    required this.canonicalPlaceId,
    required this.displayName,
    required this.role,
  });

  /// Returns null when the payload carries no usable canonical identity, so a
  /// malformed row can never become an engagement capability.
  static MerchantEngagementRestaurant? fromMap(Map<String, dynamic> map) {
    String text(String key) => (map[key] is String ? map[key] as String : '').trim();
    final canonicalPlaceId = text('canonicalPlaceId');
    if (canonicalPlaceId.isEmpty) return null;
    return MerchantEngagementRestaurant(
      registryId: text('registryId'),
      canonicalPlaceId: canonicalPlaceId,
      displayName: text('displayName'),
      role: text('role'),
    );
  }

  final String registryId;
  final String canonicalPlaceId;
  final String displayName;

  /// Server-provided, DISPLAY ONLY. The callable re-authorizes every request.
  final String role;

  /// Human label — never the registry UUID.
  String get label => displayName.isNotEmpty ? displayName : canonicalPlaceId;
}

class MerchantState {
  const MerchantState({
    required this.account,
    required this.claims,
    required this.submissions,
    required this.memberships,
    this.engagementRestaurants = const [],
  });

  final Map<String, dynamic>? account;
  final List<Map<String, dynamic>> claims;
  final List<Map<String, dynamic>> submissions;

  /// RAW membership rows — unchanged contract for Merchant Center history.
  /// `registry_id` here is NOT a canonicalPlaceId.
  final List<Map<String, dynamic>> memberships;

  /// Restaurants this merchant may act AS, with an explicit canonical identity.
  final List<MerchantEngagementRestaurant> engagementRestaurants;

  bool get hasAccount => account != null;
  String get accountStatus =>
      (account?['status'] ?? 'not_registered').toString();
  String get verificationStatus =>
      (account?['verification_status'] ?? 'unverified').toString();

  List<Map<String, dynamic>> get activeMemberships => memberships
      .where((membership) => membership['status']?.toString() == 'active')
      .toList(growable: false);

  List<Map<String, dynamic>> get restaurantProfileSubmissions => submissions
      .where((submission) => RestaurantProfileProposal.isProfileSubmission(
            submission['submission_type']?.toString(),
          ))
      .toList(growable: false);
}

class MerchantException implements Exception {
  const MerchantException(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => message;
}
