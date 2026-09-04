/// Mobile-side Restaurant Profile V2 proposal contract.
///
/// This mirrors the server allow-list defensively. The Firebase callable remains
/// authoritative and validates every proposal again before it reaches the
/// merchant bridge. Mobile never exposes review/apply/publish mutations.
class RestaurantProfileProposal {
  const RestaurantProfileProposal._();

  static const profileUpdate = 'profile_update';
  static const contactUpdate = 'contact_update';
  static const hoursUpdate = 'hours_update';
  static const menuUpdate = 'menu_update';

  static const submissionTypes = <String>{
    profileUpdate,
    contactUpdate,
    hoursUpdate,
    menuUpdate,
  };

  static const _profileFields = <String>{
    'official_name',
    'display_name',
    'branch_name',
    'address_line1',
    'address_line2',
    'state',
    'district',
    'city',
    'locality',
    'postcode',
    'country',
    'latitude',
    'longitude',
    'phone',
    'whatsapp',
    'website',
    'instagram',
    'facebook',
    'tiktok',
    'primary_category',
    'cuisine_tags',
    'food_tags',
    'signature_dishes',
    'price_range',
    'service_modes',
    'amenities',
    'short_description',
    'business_status',
    'opening_hours',
    'special_hours',
    'temporary_closed_from',
    'temporary_closed_until',
  };

  static const _contactFields = <String>{
    'phone',
    'whatsapp',
    'website',
    'instagram',
    'facebook',
    'tiktok',
  };

  static const _hoursFields = <String>{
    'business_status',
    'opening_hours',
    'special_hours',
    'temporary_closed_from',
    'temporary_closed_until',
  };

  static const _menuFields = <String>{
    'cuisine_tags',
    'food_tags',
    'signature_dishes',
    'price_range',
  };

  static const forbiddenFields = <String>{
    'halal_status',
    'halal_source',
    'halal_verified_at',
    'allergen_verified',
    'allergen_status',
    'allergens',
    'allergy_verified',
    'dietary_verified',
    'dietary_verification',
    'dietary_certification',
    'registry_status',
    'firebase_id',
    'canonical_place_id',
    'source_snapshot',
    'source_updated_at',
    'source_update_available',
    'data_quality_score',
    'data_quality_flags',
    'published_at',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
    'curated_at',
    'apply_status',
    'applied_registry_version',
    'applied_at',
    'applied_by',
    'applied_request_id',
    'apply_reason',
    'apply_conflict_code',
    'reviewed_by',
    'reviewed_registry_version',
    'reviewed_registry_updated_at',
    'publication_status',
    'publish_status',
    'publish_requested',
    'publication_requested',
  };

  static Set<String> allowedFields(String submissionType) {
    switch (submissionType) {
      case profileUpdate:
        return _profileFields;
      case contactUpdate:
        return _contactFields;
      case hoursUpdate:
        return _hoursFields;
      case menuUpdate:
        return _menuFields;
      default:
        throw ArgumentError.value(
          submissionType,
          'submissionType',
          'restaurant_profile_submission_type_invalid',
        );
    }
  }

  static Map<String, dynamic> validate(
    String submissionType,
    Map<String, dynamic> data,
  ) {
    final allowed = allowedFields(submissionType);
    if (data.isEmpty) {
      throw ArgumentError('restaurant_profile_data_empty');
    }

    for (final key in data.keys) {
      if (forbiddenFields.contains(key)) {
        throw ArgumentError('restaurant_profile_field_forbidden:$key');
      }
      if (!allowed.contains(key)) {
        throw ArgumentError('restaurant_profile_field_not_allowed:$key');
      }
    }
    return Map<String, dynamic>.unmodifiable(data);
  }

  static bool isProfileSubmission(String? value) =>
      value != null && submissionTypes.contains(value);

  static String reviewLabel(String status) {
    switch (status) {
      case 'draft':
        return 'Draf';
      case 'submitted':
        return 'Dihantar';
      case 'under_review':
        return 'Dalam semakan';
      case 'approved':
        return 'Diluluskan untuk apply';
      case 'rejected':
        return 'Ditolak';
      case 'withdrawn':
        return 'Ditarik balik';
      default:
        return status.replaceAll('_', ' ');
    }
  }

  static String applyLabel(String status) {
    switch (status) {
      case 'not_applied':
        return 'Belum apply ke Master Registry';
      case 'applied':
        return 'Sudah apply ke Master Registry';
      case 'conflict':
        return 'Perlu semakan semula';
      default:
        return status.replaceAll('_', ' ');
    }
  }
}
