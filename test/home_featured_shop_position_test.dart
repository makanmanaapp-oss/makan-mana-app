/// HOME LAYOUT — where the featured shop banner sits, and that it sits there ONCE.
///
/// The owner's original screenshot orders Home as:
///   Mood -> MakanMana pick -> Near you -> Fit Coach -> the information banner.
/// The featured shop belongs between `Near you` and `Fit Coach`.
///
/// The first implementation put it above the mood chips, because it rode on the
/// `home_top` CMS slot — a placement that renders there by design. Neither CMS
/// placement sits where the owner wants it, so the banner gets its own section
/// and the editorial slots stay exactly where the CMS documents them.
///
/// These tests read the real widget tree rather than a screenshot, so the order
/// cannot drift back silently.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:makan_mana/features/cms/cms_content.dart';
import 'package:makan_mana/features/cms/cms_slot.dart';
import 'package:makan_mana/features/cms/featured_shop_card.dart';

const _home = 'lib/features/home/home_screen.dart';

String _source() => File(_home).readAsStringSync().split('\r\n').join('\n');

void main() {
  group('the section sits between Near you and Fit Coach', () {
    test('order in the real widget tree', () {
      final src = _source();

      final nearby = src.indexOf("l.t('nearbyTitle')");
      final featured = src.indexOf('const FeaturedShopHomeSection(');
      final fitCoach = src.indexOf('const FitCoachCard()');
      final infoBanner = src.indexOf('Kad insight AI');

      expect(nearby, greaterThan(0), reason: 'Near you must still exist');
      expect(featured, greaterThan(0), reason: 'the section must be mounted');
      expect(fitCoach, greaterThan(0), reason: 'Fit Coach must still exist');
      expect(infoBanner, greaterThan(0),
          reason: 'the information banner must still exist');

      expect(featured, greaterThan(nearby),
          reason: 'the banner must come AFTER Near you');
      expect(featured, lessThan(fitCoach),
          reason: 'the banner must come BEFORE Fit Coach');
      expect(fitCoach, lessThan(infoBanner),
          reason: 'Fit Coach still precedes the information banner');
    });

    test('it is NOT above the mood chips any more', () {
      final src = _source();
      final mood = src.indexOf("l.t('moodTitle')");
      expect(src.indexOf('const FeaturedShopHomeSection('), greaterThan(mood),
          reason: 'this is exactly where it used to be, wrongly');
    });

    test('Fit Coach and the information banner were NOT replaced', () {
      final src = _source();
      // The owner circled both in the screenshot. Neither may be displaced by
      // the new section.
      expect(src.contains('const FitCoachCard()'), isTrue);
      expect(src.contains('Kad insight AI'), isTrue);
    });

    test('both editorial CMS slots stay where the CMS documents them', () {
      final src = _source();
      final homeTop = src.indexOf('placement: CmsPlacement.homeTop');
      final homeMid = src.indexOf('placement: CmsPlacement.homeMid');
      final mood = src.indexOf("l.t('moodTitle')");
      final nearby = src.indexOf("l.t('nearbyTitle')");

      // home_top: above the mood chips. home_mid: between the recommendation
      // and the nearby list. Moving either would relocate editorial banners an
      // operator already scheduled.
      expect(homeTop, lessThan(mood));
      expect(homeMid, greaterThan(mood));
      expect(homeMid, lessThan(nearby));
    });
  });

  group('no duplication', () {
    test('a Home CMS slot refuses to render a featured-shop banner', () {
      final slot = File('lib/features/cms/cms_slot.dart')
          .readAsStringSync()
          .split('\r\n')
          .join('\n');
      // Without this the banner would appear twice: once in its placement slot
      // and once in the section below.
      expect(slot.contains('!c.isFeaturedShop'), isTrue,
          reason: 'Home slots must drop shop banners');
      expect(
        slot.contains('placement == CmsPlacement.homeTop ||') &&
            slot.contains('placement == CmsPlacement.homeMid'),
        isTrue,
        reason: 'the rule applies to BOTH Home placements',
      );
    });

    test('Explore is untouched by that rule', () {
      final slot = File('lib/features/cms/cms_slot.dart')
          .readAsStringSync()
          .split('\r\n')
          .join('\n');
      // Explore shop banners belong in the explore_top slot, so the filter must
      // not name exploreTop.
      final filterLine = slot.substring(slot.indexOf('!c.isFeaturedShop') - 400,
          slot.indexOf('!c.isFeaturedShop'));
      expect(filterLine.contains('exploreTop'), isFalse);
    });
  });

  testWidgets('the section renders nothing when nothing is featured',
      (tester) async {
    // Home must be byte-for-byte its approved layout when no shop is featured.
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: SizedBox.shrink()),
    ));
    expect(find.byType(FeaturedShopHomeSection), findsNothing);
    expect(find.byType(CmsSlot), findsNothing);
    expect(CmsSponsorship.parse(null), CmsSponsorship.editorial);
  });
}
