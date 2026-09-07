import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';

import '../../app/localization/app_localizations.dart';

/// Authoritative timestamp resolution for a social record.
///
/// `createdAt` is always preferred. Older documents are read safely from a
/// trusted, historical field only; this resolver never substitutes the current
/// time for missing or malformed data.
class PostTimestampResolution {
  const PostTimestampResolution({required this.value, required this.source});

  final DateTime? value;
  final String? source;

  bool get isKnown => value != null;
  bool get isLegacyFallback => source != null && source != 'createdAt';
}

/// Parse a Firestore timestamp or one of the supported legacy encodings.
DateTime? parsePostCreatedAt(dynamic value) {
  if (value is Timestamp) {
    return value.toDate();
  }
  if (value is DateTime) {
    return value;
  }
  if (value is int) {
    final milliseconds = value.abs() > 100000000000 ? value : value * 1000;
    return DateTime.fromMillisecondsSinceEpoch(milliseconds);
  }
  if (value is String) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : DateTime.tryParse(trimmed);
  }
  return null;
}

/// Resolve the publication instant without fabricating history.
///
/// Alternate fields are deliberately limited to fields that historically held
/// a publication instant. `updatedAt` and `editedAt` are excluded: using either
/// would reset a post's displayed age after an interaction or an edit.
PostTimestampResolution resolvePostCreatedAt(Map<String, dynamic> data) {
  const historicalFields = [
    'createdAt',
    'postedAt',
    'publishedAt',
    'timestamp'
  ];
  for (final field in historicalFields) {
    final parsed = parsePostCreatedAt(data[field]);
    if (parsed != null) {
      return PostTimestampResolution(value: parsed, source: field);
    }
  }
  return const PostTimestampResolution(value: null, source: null);
}

String _relativeUnit(AppLocalizations l, String key, int value) =>
    l.t(key).replaceAll('{count}', '$value');

/// Facebook-style social age ladder, shared by every social surface.
///
/// Calendar labels use the user's locale, while relative labels use MakanMana's
/// existing localization catalogue. [now] is injectable for deterministic QA.
String relativePostTime(
  AppLocalizations l,
  dynamic timestamp, {
  bool pending = false,
  DateTime? now,
}) {
  final date = parsePostCreatedAt(timestamp);
  if (date == null) {
    return pending ? l.t('socialTimeNow') : l.t('timeUnavailable');
  }

  final localDate = date.isUtc ? date.toLocal() : date;
  final reference = now ?? DateTime.now();
  final difference = reference.difference(localDate);

  // A future value can happen while a device clock is behind the server. It is
  // shown as new, never as a negative age.
  if (difference.isNegative || difference.inSeconds < 60) {
    return l.t('socialTimeNow');
  }
  if (difference.inMinutes < 60) {
    return _relativeUnit(l, 'socialTimeMinutes', difference.inMinutes);
  }
  if (difference.inHours < 24) {
    return _relativeUnit(l, 'socialTimeHours', difference.inHours);
  }
  if (difference.inHours < 48) return l.t('socialTimeDayOne');
  if (difference.inDays < 7) {
    return _relativeUnit(l, 'socialTimeDays', difference.inDays);
  }
  if (difference.inDays < 28) {
    final weeks = difference.inDays ~/ 7;
    return weeks == 1
        ? l.t('socialTimeWeekOne')
        : _relativeUnit(l, 'socialTimeWeeks', weeks);
  }

  final locale = l.locale.toLanguageTag();
  return localDate.year == reference.year
      ? DateFormat.MMMd(locale).format(localDate)
      : DateFormat.yMMMd(locale).format(localDate);
}

/// Full, exact publication date for the timestamp tap / details affordance.
/// Returns null rather than inventing a date for an unknown legacy document.
String? exactPostPublicationTime(AppLocalizations l, dynamic timestamp) {
  final date = parsePostCreatedAt(timestamp);
  if (date == null) return null;
  final localDate = date.isUtc ? date.toLocal() : date;
  return DateFormat('d MMMM y, h:mm a', l.locale.toLanguageTag())
      .format(localDate);
}

/// Comparator for client-side profile/reply lists. Unknown values sort last.
int comparePostRecencyDesc(dynamic a, dynamic b) {
  final da = parsePostCreatedAt(a);
  final db = parsePostCreatedAt(b);
  if (da == null && db == null) return 0;
  if (da == null) return 1;
  if (db == null) return -1;
  return db.compareTo(da);
}
