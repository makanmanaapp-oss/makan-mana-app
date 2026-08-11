// HOTFIX 4.2 — My Groups default + search-only public discovery + legacy
// permission-denied safe handling.
//
// Security enforcement stays server-side (group_privacy_test + rules). These
// tests lock the CLIENT access/UX model: default view shows only My Groups,
// public discovery is search-only, private/deleted never leak into search, one
// unreadable group never crashes the list, and stale routes render a friendly
// state instead of a raw Firebase error.
import 'dart:io';
import 'dart:ui' show Locale;

import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';

void main() {
  final feed = File('lib/features/social/feed_screen.dart').readAsStringSync();
  final hub =
      File('lib/features/groups/group_hub_screen.dart').readAsStringSync();
  final providers =
      File('lib/features/groups/group_providers.dart').readAsStringSync();

  group('Localization — 4.2 keys in all 4 languages', () {
    const keys = [
      'searchGroupHint',
      'searchResultsLabel',
      'noJoinedGroups',
      'noJoinedGroupsBody',
      'noGroupSearchResults',
      'clearAction',
      'joined',
      'groupUnavailable',
      'groupUnavailableBody',
      'backToGroups',
    ];
    for (final lang in const ['ms', 'en', 'zh', 'ta']) {
      test('$lang has all 4.2 keys', () {
        final have = AppLocalizations.keysForTesting(Locale(lang));
        for (final k in keys) {
          expect(have.contains(k), isTrue, reason: '$lang missing $k');
        }
      });
    }
    test('unavailable body is generic (no private-existence leak)', () {
      final en = AppLocalizations.valuesForTesting(const Locale('en'));
      final body = en['groupUnavailableBody']!;
      // Must not confirm a specific private group exists.
      expect(body.toLowerCase().contains('removed'), isTrue);
      expect(body.toLowerCase().contains('no longer have access'), isTrue);
    });
  });

  group('Default view = My Groups only, discovery is search-only (1-3)', () {
    test('build branches on search: My Groups when empty, search otherwise', () {
      expect(feed.contains('_searchBar(l)'), isTrue);
      expect(
          feed.contains('searching\n                ? _searchResults(') ||
              feed.contains('? _searchResults('),
          isTrue);
      expect(feed.contains(': _myGroupsView('), isTrue);
    });
    test('discoverGroupsProvider is used ONLY inside search (not default view)',
        () {
      // Everything before the search method (build + _myGroupsView) must not
      // read the public discovery provider.
      final beforeSearch =
          feed.substring(0, feed.indexOf('Widget _searchResults('));
      // The actual read (ref.watch) of the public provider must not appear
      // before the search method (comments referencing it by name are fine).
      expect(beforeSearch.contains('ref.watch(discoverGroupsProvider)'),
          isFalse,
          reason: 'no public/discover read in the default view');
    });
  });

  group('Search = public-only, matching, no private/deleted (4-6)', () {
    test('search reads bounded public provider + name match + not deleted', () {
      final sr = feed.substring(feed.indexOf('Widget _searchResults('));
      expect(sr.contains('ref.watch(discoverGroupsProvider)'), isTrue);
      expect(sr.contains('g.name.toLowerCase().contains(query)'), isTrue);
      expect(sr.contains('!g.isDeleted'), isTrue);
    });
    test('discovery provider is PUBLIC-only (private never in search set)', () {
      expect(
          providers.contains("where('privacy', isEqualTo: 'public')"), isTrue);
      expect(providers.contains("g.data['status'] != 'deleted'"), isTrue);
    });
  });

  group('My Groups source + per-group isolation (7-9)', () {
    test('My Groups from real membership + readable group doc', () {
      expect(feed.contains('ref.watch(myGroupIdsProvider)'), isTrue);
      expect(feed.contains('ref.watch(groupProvider(id)).value'), isTrue);
      expect(feed.contains('if (g != null && !g.isDeleted) mine.add(g)'),
          isTrue);
    });
    test('one permission-denied group is skipped, not crashed (no .when error)',
        () {
      // The My Groups loop must read .value (null-skip), never .when(error).
      final loop = feed.substring(feed.indexOf('for (final id in myIds)'),
          feed.indexOf('final query = _query'));
      expect(loop.contains('.when('), isFalse);
      expect(loop.contains('.value'), isTrue);
    });
  });

  group('Friendly unavailable + no raw Firebase error (10-11)', () {
    test('group hub renders friendly unavailable on unreadable/deleted', () {
      expect(hub.contains('class _GroupUnavailable'), isTrue);
      expect(hub.contains('if (group == null || group.isDeleted)'), isTrue);
      expect(hub.contains('return _GroupUnavailable();'), isTrue);
      expect(hub.contains("l.t('groupUnavailable')"), isTrue);
      expect(hub.contains("l.t('backToGroups')"), isTrue);
    });
    test('no raw Firebase exception string RENDERED in groups UI', () {
      // No exception object interpolated into a visible Text widget.
      for (final src in [feed, hub]) {
        expect(src.contains(r"Text('$e"), isFalse);
        expect(src.contains(r'Text("$e'), isFalse);
        expect(src.contains(r'😕 $e'), isFalse);
        expect(src.contains(r"Text('${e"), isFalse);
      }
    });
  });

  group('Account switch scoping + secure join preserved (12-13)', () {
    test('discovery + membership providers scoped to current auth (3.1R)', () {
      expect(providers.contains('ref.watch(currentUidProvider)'), isTrue);
      expect(providers.contains('.handleError('), isTrue);
    });
    test('search-result Join uses existing secure joinGroupV2 flow', () {
      expect(feed.contains('joinGroupV2('), isTrue);
    });
  });
}
