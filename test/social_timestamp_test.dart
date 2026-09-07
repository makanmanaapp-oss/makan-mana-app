import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/features/social/social_time.dart';

final _now = DateTime(2026, 8, 10, 12);
final _bm = AppLocalizations(const Locale('ms'));
final _en = AppLocalizations(const Locale('en'));

Timestamp _at(Duration age) => Timestamp.fromDate(_now.subtract(age));

void main() {
  setUpAll(() async {
    // Production initializes these through Flutter localizations. Unit tests use
    // the formatter directly, so initialize the same locale data explicitly.
    await initializeDateFormatting('ms');
    await initializeDateFormatting('en');
  });

  group('social timestamp parsing and legacy resolution', () {
    test('parses Timestamp, DateTime, epoch seconds/milliseconds and ISO', () {
      final date = DateTime(2026, 8, 3, 9, 30);
      expect(parsePostCreatedAt(Timestamp.fromDate(date)), date);
      expect(parsePostCreatedAt(date), date);
      expect(parsePostCreatedAt(date.millisecondsSinceEpoch), date);
      expect(parsePostCreatedAt(date.millisecondsSinceEpoch ~/ 1000), date);
      expect(parsePostCreatedAt('2026-08-03T09:30:00'), date);
    });

    test('does not fabricate a time for missing or malformed legacy data', () {
      expect(parsePostCreatedAt(null), isNull);
      expect(parsePostCreatedAt('not-a-date'), isNull);
      expect(parsePostCreatedAt(const {}), isNull);
      expect(resolvePostCreatedAt(const {}).isKnown, isFalse);
      expect(relativePostTime(_bm, null, now: _now), 'Masa tidak diketahui');
    });

    test('keeps authoritative createdAt ahead of every legacy fallback', () {
      final created = DateTime(2026, 7, 1);
      final legacy = DateTime(2026, 8, 9);
      final result = resolvePostCreatedAt({
        'createdAt': Timestamp.fromDate(created),
        'postedAt': Timestamp.fromDate(legacy),
        'updatedAt': Timestamp.fromDate(_now),
      });
      expect(result.value, created);
      expect(result.source, 'createdAt');
    });

    test('uses only a trusted historical fallback, never updatedAt or editedAt',
        () {
      final published = DateTime(2026, 7, 1);
      expect(
          resolvePostCreatedAt({
            'createdAt': 'malformed',
            'publishedAt': published.toIso8601String(),
            'updatedAt': _now,
          }).value,
          published);
      expect(
          resolvePostCreatedAt({
            'updatedAt': _now,
            'editedAt': _now,
          }).isKnown,
          isFalse);
    });
  });

  group('Facebook-style relative-time ladder (BM)', () {
    test('covers every required boundary deterministically', () {
      final cases = <Duration, String>{
        const Duration(seconds: 59): 'Sekarang',
        const Duration(seconds: 60): '1 min',
        const Duration(minutes: 59, seconds: 59): '59 min',
        const Duration(hours: 1): '1j',
        const Duration(hours: 23, minutes: 59): '23j',
        const Duration(hours: 24): '1 hari',
        const Duration(hours: 47, minutes: 59): '1 hari',
        const Duration(hours: 48): '2 hari',
        const Duration(days: 6, hours: 23, minutes: 59): '6 hari',
        const Duration(days: 7): '1 minggu',
        const Duration(days: 13, hours: 23, minutes: 59): '1 minggu',
        const Duration(days: 14): '2 minggu',
        const Duration(days: 20, hours: 23, minutes: 59): '2 minggu',
        const Duration(days: 21): '3 minggu',
        const Duration(days: 27, hours: 23, minutes: 59): '3 minggu',
      };
      for (final entry in cases.entries) {
        expect(relativePostTime(_bm, _at(entry.key), now: _now), entry.value,
            reason: 'age ${entry.key}');
      }
    });

    test('never leaks accumulated hours after 24 hours', () {
      expect(relativePostTime(_bm, _at(const Duration(hours: 37)), now: _now),
          '1 hari');
      expect(relativePostTime(_bm, _at(const Duration(hours: 52)), now: _now),
          '2 hari');
      expect(relativePostTime(_bm, _at(const Duration(days: 15)), now: _now),
          '2 minggu');
    });

    test('uses a calendar date at 28 days and beyond', () {
      expect(relativePostTime(_bm, _at(const Duration(days: 28)), now: _now),
          '13 Jul');
      expect(relativePostTime(_bm, _at(const Duration(days: 40)), now: _now),
          '1 Jul');
      expect(
          relativePostTime(
            _bm,
            Timestamp.fromDate(DateTime(2025, 8, 14, 4, 6)),
            now: _now,
          ),
          '14 Ogo 2025');
    });
  });

  test('English follows English relative pluralization', () {
    expect(relativePostTime(_en, _at(const Duration(hours: 24)), now: _now),
        '1 day');
    expect(relativePostTime(_en, _at(const Duration(days: 3)), now: _now),
        '3 days');
    expect(relativePostTime(_en, _at(const Duration(days: 8)), now: _now),
        '1 week');
    expect(relativePostTime(_en, _at(const Duration(days: 16)), now: _now),
        '2 weeks');
  });

  test('pending server timestamp is new, clock skew is never negative', () {
    expect(relativePostTime(_bm, null, pending: true, now: _now), 'Sekarang');
    expect(
        relativePostTime(
          _bm,
          Timestamp.fromDate(_now.add(const Duration(hours: 2))),
          now: _now,
        ),
        'Sekarang');
  });

  test('recency ordering is type-agnostic and unknown documents sort last', () {
    final newest = _at(const Duration(days: 1));
    final middle = '2026-08-05T00:00:00';
    final oldest = DateTime(2026, 8, 3).millisecondsSinceEpoch;
    final values = [null, oldest, newest, middle]..sort(comparePostRecencyDesc);
    expect(values, [newest, middle, oldest, null]);
  });
}
