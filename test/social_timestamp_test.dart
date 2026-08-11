// Threads Fix 1 — POST TIMESTAMP INTEGRITY (regression).
//
// Covers the PDF's required cases against the single source of truth
// (social_time.dart). The bug was `if (ts is! Timestamp) return justNow`, which
// turned any non-Timestamp createdAt (null pending, legacy String/int, missing)
// into "just now"/today — so old posts looked like they were posted today.
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/features/social/social_time.dart';

AppLocalizations _l(String lang) => AppLocalizations(Locale(lang));
final _en = _l('en');

// A fixed "now" so every assertion is deterministic.
final _now = DateTime(2026, 8, 10, 12, 0, 0);
Timestamp _tsDaysAgo(int d) =>
    Timestamp.fromDate(_now.subtract(Duration(days: d)));

void main() {
  group('parsePostCreatedAt — formats', () {
    test('Firestore Timestamp → correct instant (TEST 6)', () {
      final dt = DateTime(2026, 8, 3, 9, 30);
      expect(parsePostCreatedAt(Timestamp.fromDate(dt)), dt);
    });
    test('DateTime passthrough', () {
      final dt = DateTime(2026, 8, 3);
      expect(parsePostCreatedAt(dt), dt);
    });
    test('legacy epoch millis int', () {
      final dt = DateTime(2026, 8, 3, 9, 30);
      expect(parsePostCreatedAt(dt.millisecondsSinceEpoch), dt);
    });
    test('legacy epoch seconds int', () {
      final dt = DateTime(2026, 8, 3, 9, 30);
      final secs = dt.millisecondsSinceEpoch ~/ 1000;
      expect(parsePostCreatedAt(secs), dt);
    });
    test('legacy ISO string', () {
      expect(parsePostCreatedAt('2026-08-03T09:30:00'),
          DateTime(2026, 8, 3, 9, 30));
    });
    test('null / junk → null (never fabricated)', () {
      expect(parsePostCreatedAt(null), isNull);
      expect(parsePostCreatedAt(''), isNull);
      expect(parsePostCreatedAt('not-a-date'), isNull);
      expect(parsePostCreatedAt(const {}), isNull);
    });
  });

  group('relativePostTime — honest relative time', () {
    test('TEST 1: post from 7 days ago stays "7h" (h=hari), not Today', () {
      expect(relativePostTime(_en, _tsDaysAgo(7), now: _now), '7h');
    });

    test('TEST 2/3: repeated parsing preserves age (no drift/reset)', () {
      final ts = _tsDaysAgo(7);
      for (var i = 0; i < 5; i++) {
        expect(relativePostTime(_en, ts, now: _now), '7h');
      }
    });

    test('TEST 5: MISSING timestamp is NOT "now"/today → Time unavailable', () {
      expect(relativePostTime(_en, null, now: _now), _en.t('timeUnavailable'));
      expect(relativePostTime(_en, null, now: _now),
          isNot(_en.t('justNow')));
      // And never a numeric "today-ish" age.
      expect(relativePostTime(_en, null, now: _now), isNot('0m'));
    });

    test('TEST 9: genuinely new post (pending server ts) → just now', () {
      expect(relativePostTime(_en, null, pending: true, now: _now),
          _en.t('justNow'));
    });

    test('recent (<1 min) → just now', () {
      final ts = Timestamp.fromDate(_now.subtract(const Duration(seconds: 20)));
      expect(relativePostTime(_en, ts, now: _now), _en.t('justNow'));
    });

    test('minutes / hours / days buckets', () {
      expect(
          relativePostTime(
              _en, Timestamp.fromDate(_now.subtract(const Duration(minutes: 5))),
              now: _now),
          '5m');
      expect(
          relativePostTime(
              _en, Timestamp.fromDate(_now.subtract(const Duration(hours: 3))),
              now: _now),
          '3j');
      expect(relativePostTime(_en, _tsDaysAgo(30), now: _now), '30h');
    });

    test('TEST 7: UTC ISO near local midnight does NOT become "Today"', () {
      // Malaysia is UTC+8. A post 7 days old stored as a UTC ISO string must
      // still read as ~7 days regardless of local midnight boundaries.
      final localNow = DateTime(2026, 8, 10, 0, 30); // just after midnight local
      final utcSevenDaysAgo =
          localNow.toUtc().subtract(const Duration(days: 7));
      final iso = utcSevenDaysAgo.toIso8601String(); // ...Z
      final out = relativePostTime(_en, iso, now: localNow);
      expect(out, isNot(_en.t('justNow')));
      expect(out, isNot(_en.t('timeUnavailable')));
      expect(out, anyOf('6h', '7h')); // ~7 days, never "today"
    });

    test('future timestamp (device clock behind) → just now, not negative', () {
      final ts = Timestamp.fromDate(_now.add(const Duration(hours: 2)));
      expect(relativePostTime(_en, ts, now: _now), _en.t('justNow'));
    });
  });

  test('localization: timeUnavailable + justNow exist in all 4 languages', () {
    for (final lang in const ['ms', 'en', 'zh', 'ta']) {
      final l = _l(lang);
      expect(l.t('timeUnavailable'), isNotEmpty);
      expect(l.t('timeUnavailable'), isNot('timeUnavailable')); // not raw key
      expect(l.t('justNow'), isNotEmpty);
    }
    // Not hardcoded to one language.
    expect(_l('ms').t('timeUnavailable'), isNot(_l('en').t('timeUnavailable')));
    expect(_l('zh').t('timeUnavailable'), isNot(_l('en').t('timeUnavailable')));
  });

  // TEST 8: feed ordering is server-side orderBy('createdAt'); a fallback in the
  // formatter must never influence sort. Prove parse is pure (no now-fallback)
  // so an old post cannot acquire a "now" key that would reorder it.
  test('TEST 8: parser is pure — old post keeps its instant (no now-jump)', () {
    final old = _tsDaysAgo(30);
    final a = parsePostCreatedAt(old);
    final b = parsePostCreatedAt(old);
    expect(a, b);
    expect(a!.isBefore(_now), isTrue);
    // A missing timestamp resolves to null (sorted last by callers), NOT now.
    expect(parsePostCreatedAt(null), isNull);
  });

  // Fix 1.1 — profile replies sort uses canonical instant (type-agnostic).
  group('comparePostRecencyDesc — chronological, type-agnostic', () {
    List<dynamic> sortDesc(List<dynamic> xs) =>
        [...xs]..sort(comparePostRecencyDesc);

    test('Timestamp vs Timestamp — newest first', () {
      final older = _tsDaysAgo(5);
      final newer = _tsDaysAgo(1);
      expect(sortDesc([older, newer]), [newer, older]);
    });

    test('Timestamp vs ISO String — ordered by instant, not type', () {
      final tsAug5 = Timestamp.fromDate(DateTime(2026, 8, 5));
      const isoAug3 = '2026-08-03T00:00:00';
      // 5 Aug must come before 3 Aug regardless of runtime type.
      expect(sortDesc([isoAug3, tsAug5]), [tsAug5, isoAug3]);
      expect(sortDesc([tsAug5, isoAug3]), [tsAug5, isoAug3]);
    });

    test('Timestamp vs epoch int — ordered by instant', () {
      final tsAug5 = Timestamp.fromDate(DateTime(2026, 8, 5));
      final intAug3 = DateTime(2026, 8, 3).millisecondsSinceEpoch;
      expect(sortDesc([intAug3, tsAug5]), [tsAug5, intAug3]);
    });

    test('unknown timestamp goes LAST (never treated as now)', () {
      final ts = _tsDaysAgo(3);
      expect(sortDesc([null, ts]), [ts, null]);
      expect(sortDesc([ts, null]), [ts, null]);
      expect(sortDesc(['garbage', ts]), [ts, 'garbage']);
    });

    test('full chronological ordering across mixed types', () {
      final tsAug8 = Timestamp.fromDate(DateTime(2026, 8, 8));
      const isoAug5 = '2026-08-05T00:00:00';
      final intAug3 = DateTime(2026, 8, 3).millisecondsSinceEpoch;
      final out = sortDesc([intAug3, tsAug8, null, isoAug5]);
      expect(out, [tsAug8, isoAug5, intAug3, null]); // 8 > 5 > 3 > unknown
    });
  });

  // TEST 10: multiple surfaces share ONE formatter → same input, same output.
  test('TEST 10: same createdAt → identical age across surfaces', () {
    final ts = _tsDaysAgo(7);
    final feed = relativePostTime(_en, ts, now: _now);
    final profile = relativePostTime(_en, ts, now: _now);
    final detail = relativePostTime(_en, ts, now: _now);
    expect(feed, profile);
    expect(profile, detail);
    expect(feed, '7h');
  });
}
