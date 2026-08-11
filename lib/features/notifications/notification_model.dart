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

MakanNotificationType _typeFromString(String? raw) {
  switch (raw) {
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

class MakanNotification {
  const MakanNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    required this.isRead,
    this.titleKey,
    this.bodyKey,
    this.destinationType,
    this.destinationId,
    this.imageUrl,
    this.metadata = const {},
    this.priority = 0,
    this.expiresAt,
  });

  final String id;
  final MakanNotificationType type;

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

  final String? imageUrl;
  final Map<String, dynamic> metadata;
  final int priority;
  final DateTime? expiresAt;

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
    return MakanNotification(
      id: id,
      type: _typeFromString(m['type'] as String?),
      title: (m['title'] as String?)?.trim() ?? '',
      body: (m['body'] as String?)?.trim() ?? '',
      titleKey: m['titleKey'] as String?,
      bodyKey: m['bodyKey'] as String?,
      createdAt: _ts(m['createdAt']),
      isRead: isRead,
      destinationType: m['destinationType'] as String?,
      destinationId: m['destinationId'] as String?,
      imageUrl: (m['imageUrl'] as String?)?.trim().isNotEmpty == true
          ? m['imageUrl'] as String
          : null,
      metadata: (m['metadata'] as Map?)?.cast<String, dynamic>() ?? const {},
      priority: (m['priority'] as num?)?.toInt() ?? 0,
      expiresAt: _tsOrNull(m['expiresAt']),
    );
  }
}
