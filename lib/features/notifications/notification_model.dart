/// Front Page Redesign 1 — model notifikasi dalam-app (Notification Center).
///
/// Sumber: Firestore `users/{uid}/notifications/{id}`. Diisi oleh backend
/// (Cloud Functions) sahaja; klien HANYA membaca + mengemas kini keadaan-baca
/// (isRead/readAt) pada notifikasinya sendiri. Tiada data palsu / tiada kiraan
/// belum-baca palsu — semua dari dokumen sebenar.
library;

import 'package:cloud_firestore/cloud_firestore.dart';

/// Kategori notifikasi yang disokong (selaras cadangan spec). `unknown` = jenis
/// tidak dikenali → dipapar selamat sebagai sistem generik (tidak crash).
enum MakanNotificationType {
  socialReaction,
  socialComment,
  socialReply,
  socialMention,
  socialFollow,
  socialRepost,
  socialQuote,
  groupInvite,
  groupInviteAccepted,
  groupUpdate,
  tongtongBillCreated,
  tongtongPaymentRequest,
  tongtongPaymentUpdated,
  fitReminder,
  weeklyReportReady,
  mealReminder,
  subscriptionUpdated,
  trialEnding,
  paymentIssue,
  accountSecurity,
  systemAnnouncement,
  systemMaintenance,
  systemFeatureUpdate,
  marketingCampaign,
  // Legacy presentation types retained so old records remain readable.
  system,
  foodSuggestion,
  reminder,
  social,
  group,
  fitCoach,
  subscription,
  coupon,
  support,
  unknown,
}

enum MakanNotificationCategory {
  social,
  group,
  tongtong,
  food,
  fit,
  report,
  billing,
  account,
  security,
  system,
  marketing,
  unknown,
}

MakanNotificationType _typeFromString(String? raw) {
  switch (raw) {
    case 'social_reaction':
      return MakanNotificationType.socialReaction;
    case 'social_comment':
      return MakanNotificationType.socialComment;
    case 'social_reply':
      return MakanNotificationType.socialReply;
    case 'social_mention':
      return MakanNotificationType.socialMention;
    case 'social_follow':
      return MakanNotificationType.socialFollow;
    case 'social_repost':
      return MakanNotificationType.socialRepost;
    case 'social_quote':
      return MakanNotificationType.socialQuote;
    case 'group_invite':
      return MakanNotificationType.groupInvite;
    case 'group_invite_accepted':
      return MakanNotificationType.groupInviteAccepted;
    case 'group_update':
      return MakanNotificationType.groupUpdate;
    case 'tongtong_bill_created':
      return MakanNotificationType.tongtongBillCreated;
    case 'tongtong_payment_request':
      return MakanNotificationType.tongtongPaymentRequest;
    case 'tongtong_payment_updated':
      return MakanNotificationType.tongtongPaymentUpdated;
    case 'fit_reminder':
      return MakanNotificationType.fitReminder;
    case 'weekly_report_ready':
      return MakanNotificationType.weeklyReportReady;
    case 'meal_reminder':
      return MakanNotificationType.mealReminder;
    case 'subscription_updated':
    case 'subscription_started':
    case 'subscription_renewed':
    case 'subscription_cancelled':
      return MakanNotificationType.subscriptionUpdated;
    case 'trial_ending':
      return MakanNotificationType.trialEnding;
    case 'payment_issue':
      return MakanNotificationType.paymentIssue;
    case 'account_security':
      return MakanNotificationType.accountSecurity;
    case 'system_announcement':
      return MakanNotificationType.systemAnnouncement;
    case 'system_maintenance':
      return MakanNotificationType.systemMaintenance;
    case 'system_feature_update':
      return MakanNotificationType.systemFeatureUpdate;
    case 'marketing_campaign':
      return MakanNotificationType.marketingCampaign;
    case 'system':
      return MakanNotificationType.system;
    case 'food_suggestion':
      return MakanNotificationType.foodSuggestion;
    case 'reminder':
      return MakanNotificationType.reminder;
    case 'social':
      return MakanNotificationType.social;
    case 'group':
      return MakanNotificationType.group;
    case 'fit_coach':
      return MakanNotificationType.fitCoach;
    case 'subscription':
      return MakanNotificationType.subscription;
    case 'coupon':
      return MakanNotificationType.coupon;
    case 'support':
      return MakanNotificationType.support;
    default:
      return MakanNotificationType.unknown;
  }
}

MakanNotificationCategory _categoryFromString(String? raw) {
  return MakanNotificationCategory.values.firstWhere(
    (value) => value.name == raw,
    orElse: () => MakanNotificationCategory.unknown,
  );
}

class MakanNotification {
  const MakanNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    required this.isRead,
    this.category = MakanNotificationCategory.unknown,
    this.titleKey,
    this.bodyKey,
    this.destinationType,
    this.destinationId,
    this.imageUrl,
    this.metadata = const {},
    this.priority = 0,
    this.expiresAt,
    this.recipientUid,
    this.actorUid,
    this.actorDisplaySnapshot,
    this.entityType,
    this.entityId,
    this.parentEntityId,
    this.deepLink,
    this.readAt,
    this.openedAt,
    this.isCritical = false,
    this.inAppVisible = true,
    this.schemaVersion = 1,
    this.rawType = '',
  });

  final String id;
  final MakanNotificationType type;

  /// Original validated backend type. Retained to bridge forward-compatible
  /// records to the shared destination resolver without guessing enum names.
  final String rawType;
  final MakanNotificationCategory category;
  final String? recipientUid;
  final String? actorUid;

  /// Nama pelaku yang disimpan oleh backend pada masa peristiwa berlaku.
  /// Ia hanya digunakan sebagai fallback paparan apabila profil awam kini
  /// tidak dapat menyelesaikan identiti pelaku.
  final String? actorDisplaySnapshot;

  /// Teks siap (fallback bila tiada kunci l10n). titleKey/bodyKey diutamakan.
  final String title;
  final String body;

  /// Kunci l10n pilihan (backend boleh hantar kunci, klien terjemah).
  final String? titleKey;
  final String? bodyKey;

  final DateTime createdAt;
  final bool isRead;

  /// Cth. "restaurant" | "suggestion" | "social" | "group" | "fit_coach" |
  /// "coupon" | "subscription" | "support" | "system".
  final String? destinationType;
  final String? destinationId;
  final String? entityType;
  final String? entityId;
  final String? parentEntityId;
  final String? deepLink;

  final String? imageUrl;
  final Map<String, dynamic> metadata;
  final int priority;
  final DateTime? expiresAt;
  final DateTime? readAt;
  final DateTime? openedAt;
  final bool isCritical;

  /// PROMPT 4A: false = push-only canonical record (In-App disabled). It exists
  /// for secure push-tap resolution but is NEVER shown in the Notification
  /// Center nor counted in the unread bell. Missing/legacy ⇒ visible (true).
  final bool inAppVisible;
  final int schemaVersion;

  bool get isExpired =>
      expiresAt != null && expiresAt!.isBefore(DateTime.now());

  static DateTime _ts(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
    return DateTime.fromMillisecondsSinceEpoch(0);
  }

  static DateTime? _tsOrNull(dynamic v) {
    if (v == null) return null;
    return _ts(v);
  }

  /// Bina dari dokumen Firestore. Toleran medan hilang (default selamat).
  factory MakanNotification.fromMap(String id, Map<String, dynamic> m) {
    final readAt = m['readAt'];
    final isRead = m['isRead'] == true || readAt != null;
    final actorDisplaySnapshot = (m['actorDisplaySnapshot'] as String?)?.trim();
    return MakanNotification(
      id: id,
      type: _typeFromString(m['type'] as String?),
      rawType: (m['type'] as String?)?.trim() ?? '',
      category: _categoryFromString(m['category'] as String?),
      title: (m['title'] as String?)?.trim() ?? '',
      body: (m['body'] as String?)?.trim() ?? '',
      titleKey: m['titleKey'] as String?,
      bodyKey: m['bodyKey'] as String?,
      createdAt: _ts(m['createdAt']),
      isRead: isRead,
      destinationType: m['destinationType'] as String?,
      destinationId: m['destinationId'] as String?,
      recipientUid: m['recipientUid'] as String?,
      actorUid: m['actorUid'] as String?,
      actorDisplaySnapshot: actorDisplaySnapshot?.isNotEmpty == true
          ? actorDisplaySnapshot
          : null,
      entityType: m['entityType'] as String?,
      entityId: m['entityId'] as String?,
      parentEntityId: m['parentEntityId'] as String?,
      deepLink: m['deepLink'] as String?,
      imageUrl: (m['imageUrl'] as String?)?.trim().isNotEmpty == true
          ? m['imageUrl'] as String
          : null,
      metadata: (m['metadata'] as Map?)?.cast<String, dynamic>() ?? const {},
      priority: (m['priority'] as num?)?.toInt() ?? 0,
      expiresAt: _tsOrNull(m['expiresAt']),
      readAt: _tsOrNull(m['readAt']),
      openedAt: _tsOrNull(m['openedAt']),
      isCritical: m['isCritical'] == true,
      inAppVisible: m['inAppVisible'] != false, // missing/legacy ⇒ visible

      schemaVersion: (m['schemaVersion'] as num?)?.toInt() ?? 1,
    );
  }
}
