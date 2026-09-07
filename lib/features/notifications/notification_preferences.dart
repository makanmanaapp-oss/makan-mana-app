/// PROMPT 4 — canonical user notification preferences (client mirror).
///
/// One authoritative record lives at users/{uid}.notificationPreferences and is
/// written ONLY through the setNotificationPreferences callable. This model
/// mirrors the server resolver (master → category → marketing opt-in) so the
/// Settings UI and the delivery engine always agree. Quiet hours are stored as
/// minutes-of-day (0..1439), never localized strings.
library;

import 'notification_model.dart';

/// Categories that default OFF (conservative opt-in). MUST mirror the backend
/// OPT_IN_CATEGORIES so a generic true-fallback never auto-enables promotions.
const Set<MakanNotificationCategory> kOptInCategories = {
  MakanNotificationCategory.marketing,
};

class NotificationChannelPreference {
  const NotificationChannelPreference({
    this.inAppEnabled = true,
    this.pushEnabled = true,
  });

  final bool inAppEnabled;
  final bool pushEnabled;

  factory NotificationChannelPreference.fromMap(Map<String, dynamic>? value) =>
      NotificationChannelPreference(
        inAppEnabled: value?['inAppEnabled'] != false,
        pushEnabled: value?['pushEnabled'] != false,
      );

  NotificationChannelPreference copyWith({bool? inAppEnabled, bool? pushEnabled}) =>
      NotificationChannelPreference(
        inAppEnabled: inAppEnabled ?? this.inAppEnabled,
        pushEnabled: pushEnabled ?? this.pushEnabled,
      );

  Map<String, dynamic> toMap() => {
        'inAppEnabled': inAppEnabled,
        'pushEnabled': pushEnabled,
      };
}

class NotificationPreferences {
  const NotificationPreferences({
    this.master = const NotificationChannelPreference(),
    this.categories = const {},
    this.quietHoursEnabled = false,
    this.quietHoursStartMinutes,
    this.quietHoursEndMinutes,
    this.timezone,
    this.schemaVersion = 2,
  });

  final NotificationChannelPreference master;
  final Map<MakanNotificationCategory, NotificationChannelPreference> categories;
  final bool quietHoursEnabled;
  final int? quietHoursStartMinutes;
  final int? quietHoursEndMinutes;
  final String? timezone;
  final int schemaVersion;

  /// Stored (or defaulted) toggle for a category. Marketing defaults OFF.
  NotificationChannelPreference forCategory(MakanNotificationCategory category) {
    final stored = categories[category];
    if (stored != null) return stored;
    final optIn = kOptInCategories.contains(category);
    return NotificationChannelPreference(inAppEnabled: !optIn, pushEnabled: !optIn);
  }

  /// EFFECTIVE in-app eligibility (master AND category). Mirrors the server.
  bool effectiveInApp(MakanNotificationCategory c) =>
      master.inAppEnabled && forCategory(c).inAppEnabled;

  /// EFFECTIVE push eligibility (master AND category). Mirrors the server.
  bool effectivePush(MakanNotificationCategory c) =>
      master.pushEnabled && forCategory(c).pushEnabled;

  factory NotificationPreferences.fromMap(Map<String, dynamic>? raw) {
    final source = raw ?? const <String, dynamic>{};
    final categories =
        <MakanNotificationCategory, NotificationChannelPreference>{};
    for (final category in MakanNotificationCategory.values) {
      if (category == MakanNotificationCategory.unknown) continue;
      final m = (source[category.name] as Map?)?.cast<String, dynamic>();
      if (m != null) {
        categories[category] = NotificationChannelPreference.fromMap(m);
      }
    }
    // Quiet hours may live under notificationPreferences.quietHours (canonical)
    // or as flat legacy fields — accept both, and minutes OR "HH:mm".
    final quiet =
        (source['quietHours'] as Map?)?.cast<String, dynamic>() ?? source;
    return NotificationPreferences(
      master: NotificationChannelPreference.fromMap(
          (source['master'] as Map?)?.cast<String, dynamic>()),
      categories: categories,
      quietHoursEnabled: quiet['quietHoursEnabled'] == true,
      quietHoursStartMinutes: _asMinutes(quiet['quietHoursStart']),
      quietHoursEndMinutes: _asMinutes(quiet['quietHoursEnd']),
      timezone: quiet['timezone'] as String?,
      schemaVersion: (source['schemaVersion'] as num?)?.toInt() ?? 2,
    );
  }

  /// Legacy-safe minute parser: accepts int minutes or "HH:mm".
  static int? _asMinutes(dynamic value) {
    if (value is int) return value.clamp(0, 1439);
    if (value is num) return value.toInt().clamp(0, 1439);
    if (value is String && value.contains(':')) {
      final parts = value.split(':');
      final h = int.tryParse(parts[0]) ?? 0;
      final m = int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0;
      return ((h * 60 + m) % 1440);
    }
    return null;
  }

  NotificationPreferences copyWith({
    NotificationChannelPreference? master,
    Map<MakanNotificationCategory, NotificationChannelPreference>? categories,
    bool? quietHoursEnabled,
    int? quietHoursStartMinutes,
    int? quietHoursEndMinutes,
    String? timezone,
  }) =>
      NotificationPreferences(
        master: master ?? this.master,
        categories: categories ?? this.categories,
        quietHoursEnabled: quietHoursEnabled ?? this.quietHoursEnabled,
        quietHoursStartMinutes:
            quietHoursStartMinutes ?? this.quietHoursStartMinutes,
        quietHoursEndMinutes: quietHoursEndMinutes ?? this.quietHoursEndMinutes,
        timezone: timezone ?? this.timezone,
        schemaVersion: schemaVersion,
      );

  /// Immutable update of a single category (preserves the other axis + master).
  NotificationPreferences withCategory(
    MakanNotificationCategory category, {
    bool? inAppEnabled,
    bool? pushEnabled,
  }) {
    final next = Map<MakanNotificationCategory, NotificationChannelPreference>.from(
        categories);
    next[category] = forCategory(category)
        .copyWith(inAppEnabled: inAppEnabled, pushEnabled: pushEnabled);
    return copyWith(categories: next);
  }

  /// Full desired state for the setNotificationPreferences callable. Category
  /// keys use the canonical backend names; quiet hours are minutes.
  Map<String, dynamic> toPreferenceMap() {
    final out = <String, dynamic>{'master': master.toMap()};
    for (final entry in categories.entries) {
      out[entry.key.name] = entry.value.toMap();
    }
    out['quietHours'] = <String, dynamic>{
      'quietHoursEnabled': quietHoursEnabled,
      if (quietHoursStartMinutes != null)
        'quietHoursStart': quietHoursStartMinutes,
      if (quietHoursEndMinutes != null) 'quietHoursEnd': quietHoursEndMinutes,
      if (timezone != null && timezone!.isNotEmpty) 'timezone': timezone,
    };
    return out;
  }
}

/// A user-facing settings section, possibly spanning several backend categories
/// (e.g. Fit Coach = fit + report; Billing & Account = billing + account +
/// security). Toggling the section writes ALL member categories together.
class NotificationSettingsSection {
  const NotificationSettingsSection({
    required this.titleKey,
    required this.categories,
    this.subtitleKey,
  });

  final String titleKey;
  final String? subtitleKey;
  final List<MakanNotificationCategory> categories;

  MakanNotificationCategory get primary => categories.first;
}

/// The 7 controllable sections (Part 4/5). Tong-Tong is frozen (excluded).
const List<NotificationSettingsSection> kNotificationSections = [
  NotificationSettingsSection(
      titleKey: 'notifCatSocial', categories: [MakanNotificationCategory.social]),
  NotificationSettingsSection(
      titleKey: 'notifCatGroups', categories: [MakanNotificationCategory.group]),
  NotificationSettingsSection(
      titleKey: 'notifCatFood', categories: [MakanNotificationCategory.food]),
  NotificationSettingsSection(
      titleKey: 'notifCatFit',
      categories: [MakanNotificationCategory.fit, MakanNotificationCategory.report]),
  NotificationSettingsSection(
      titleKey: 'notifCatBilling',
      subtitleKey: 'notifCriticalNote',
      categories: [
        MakanNotificationCategory.billing,
        MakanNotificationCategory.account,
        MakanNotificationCategory.security,
      ]),
  NotificationSettingsSection(
      titleKey: 'notifCatSystem', categories: [MakanNotificationCategory.system]),
  NotificationSettingsSection(
      titleKey: 'notifCatMarketing',
      categories: [MakanNotificationCategory.marketing]),
];
