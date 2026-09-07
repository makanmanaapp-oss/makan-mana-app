// PROMPT 4 — notification settings: canonical model + screen widget tests.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/features/notifications/notification_model.dart';
import 'package:makan_mana/features/notifications/notification_preferences.dart';
import 'package:makan_mana/features/notifications/notification_settings_provider.dart';
import 'package:makan_mana/features/notifications/notification_settings_screen.dart';

class _FakeService extends NotificationSettingsService {
  _FakeService({this.fail = false, this.allowed = true});
  final bool fail;
  final bool allowed;
  final List<NotificationPreferences> saved = [];

  @override
  Future<void> save(NotificationPreferences prefs) async {
    if (fail) throw Exception('save failed');
    saved.add(prefs);
  }

  @override
  Future<bool> osPermissionAllowed() async => allowed;

  @override
  Future<void> openOsSettings() async {}

  @override
  Future<String?> platformTimezone() async => 'Asia/Kuala_Lumpur';
}

Widget _host(
  NotificationPreferences prefs,
  NotificationSettingsService service, {
  bool dark = false,
  String locale = 'en',
  double scale = 1.0,
}) {
  return ProviderScope(
    overrides: [
      notificationPreferencesProvider.overrideWith((ref) => Stream.value(prefs)),
      notificationSettingsServiceProvider.overrideWithValue(service),
    ],
    child: MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: dark ? AppTheme.dark() : AppTheme.light(),
      locale: Locale(locale),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: TextScaler.linear(scale)),
        child: child!,
      ),
      home: const NotificationSettingsScreen(),
    ),
  );
}

/// Sizes the render surface tall/narrow so the whole scrolling list builds.
Future<void> _pump(WidgetTester tester, Widget host,
    {Size size = const Size(430, 2400)}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  await tester.pumpWidget(host);
  await tester.pumpAndSettle();
}

void main() {
  group('canonical preference model', () {
    test('defaults: everything enabled except marketing (opt-in)', () {
      const p = NotificationPreferences();
      expect(p.effectiveInApp(MakanNotificationCategory.social), isTrue);
      expect(p.effectivePush(MakanNotificationCategory.group), isTrue);
      expect(p.effectiveInApp(MakanNotificationCategory.marketing), isFalse);
      expect(p.effectivePush(MakanNotificationCategory.marketing), isFalse);
    });

    test('master push OFF suppresses push but keeps in-app', () {
      const p = NotificationPreferences(
          master: NotificationChannelPreference(pushEnabled: false));
      expect(p.effectivePush(MakanNotificationCategory.social), isFalse);
      expect(p.effectiveInApp(MakanNotificationCategory.social), isTrue);
    });

    test('master OFF preserves stored child values (restored when master ON)',
        () {
      final off = const NotificationPreferences(
              master: NotificationChannelPreference(pushEnabled: false))
          .withCategory(MakanNotificationCategory.group, pushEnabled: true)
          .withCategory(MakanNotificationCategory.social, pushEnabled: false);
      expect(off.effectivePush(MakanNotificationCategory.group), isFalse);
      // Stored child values remain intact.
      expect(off.forCategory(MakanNotificationCategory.group).pushEnabled, isTrue);
      expect(
          off.forCategory(MakanNotificationCategory.social).pushEnabled, isFalse);
    });

    test('withCategory preserves the other axis', () {
      final p = const NotificationPreferences()
          .withCategory(MakanNotificationCategory.social, pushEnabled: false);
      expect(p.forCategory(MakanNotificationCategory.social).inAppEnabled, isTrue);
      expect(p.forCategory(MakanNotificationCategory.social).pushEnabled, isFalse);
    });

    test('quiet hours parse minutes AND legacy "HH:mm" strings', () {
      final ints = NotificationPreferences.fromMap({
        'quietHours': {
          'quietHoursEnabled': true,
          'quietHoursStart': 1320,
          'quietHoursEnd': 420,
          'timezone': 'Asia/Kuala_Lumpur',
        }
      });
      expect(ints.quietHoursEnabled, isTrue);
      expect(ints.quietHoursStartMinutes, 1320);
      expect(ints.quietHoursEndMinutes, 420);
      final legacy = NotificationPreferences.fromMap({
        'quietHoursStart': '22:00',
        'quietHoursEnd': '07:00',
      });
      expect(legacy.quietHoursStartMinutes, 1320);
      expect(legacy.quietHoursEndMinutes, 420);
    });

    test('toPreferenceMap emits canonical keys + numeric quiet hours', () {
      final p = const NotificationPreferences(
        quietHoursEnabled: true,
        quietHoursStartMinutes: 1320,
        quietHoursEndMinutes: 420,
        timezone: 'Asia/Kuala_Lumpur',
      ).withCategory(MakanNotificationCategory.social, pushEnabled: false);
      final map = p.toPreferenceMap();
      expect(map['master'], isA<Map>());
      expect((map['social'] as Map)['pushEnabled'], isFalse);
      final quiet = map['quietHours'] as Map;
      expect(quiet['quietHoursStart'], 1320);
      expect(quiet['quietHoursEnd'], 420);
    });

    test('inAppVisible parses: false=push-only, missing=visible (legacy)', () {
      expect(
          MakanNotification.fromMap('a', {'type': 'social_reaction', 'inAppVisible': false})
              .inAppVisible,
          isFalse);
      expect(MakanNotification.fromMap('b', {'type': 'social_reaction'}).inAppVisible,
          isTrue); // legacy/missing ⇒ visible
      expect(
          MakanNotification.fromMap('c', {'type': 'social_reaction', 'inAppVisible': true})
              .inAppVisible,
          isTrue);
    });

    test('7 controllable sections; marketing + fit span mapping correct', () {
      expect(kNotificationSections.length, 7);
      final fit = kNotificationSections
          .firstWhere((s) => s.titleKey == 'notifCatFit');
      expect(fit.categories,
          containsAll([MakanNotificationCategory.fit, MakanNotificationCategory.report]));
      final billing = kNotificationSections
          .firstWhere((s) => s.titleKey == 'notifCatBilling');
      expect(billing.subtitleKey, 'notifCriticalNote');
    });
  });

  group('settings screen widget', () {
    testWidgets('renders masters, all 7 sections, OS card', (tester) async {
      await _pump(tester, _host(const NotificationPreferences(), _FakeService()));
      await tester.pumpAndSettle();
      expect(find.text('Push notifications'), findsWidgets);
      expect(find.text('In-app notifications'), findsOneWidget);
      expect(find.text('Social'), findsOneWidget);
      expect(find.text('Billing & Account'), findsOneWidget);
      expect(find.text('Marketing'), findsOneWidget);
      expect(find.text('Device notifications'), findsOneWidget);
      expect(find.text('Allowed'), findsOneWidget);
    });

    testWidgets('toggling master push saves via callable', (tester) async {
      final svc = _FakeService();
      await _pump(tester, _host(const NotificationPreferences(), svc));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(Switch).first);
      await tester.pumpAndSettle();
      expect(svc.saved, isNotEmpty);
      expect(svc.saved.last.master.pushEnabled, isFalse);
    });

    testWidgets('save failure shows error + reverts', (tester) async {
      await _pump(tester, 
          _host(const NotificationPreferences(), _FakeService(fail: true)));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(Switch).first);
      await tester.pumpAndSettle();
      expect(find.textContaining("Couldn't save"), findsOneWidget);
    });

    testWidgets('quiet hours enable reveals From/Until + resolved IANA tz',
        (tester) async {
      await _pump(tester, _host(
          const NotificationPreferences(quietHoursEnabled: true), _FakeService()));
      await tester.pumpAndSettle();
      expect(find.text('From'), findsOneWidget);
      expect(find.text('Until'), findsOneWidget);
      // Part 16/22: canonical IANA zone (not an abbreviation) is displayed.
      expect(find.textContaining('Asia/Kuala_Lumpur'), findsOneWidget);
    });

    testWidgets('OS permission disabled state shows Open Settings',
        (tester) async {
      await _pump(tester, _host(
          const NotificationPreferences(), _FakeService(allowed: false)));
      await tester.pumpAndSettle();
      expect(find.text('Disabled in Android settings'), findsOneWidget);
      expect(find.text('Open Settings'), findsWidgets);
    });

    testWidgets('renders in Dark mode + 1.3 text scale without overflow',
        (tester) async {
      await _pump(tester, _host(const NotificationPreferences(), _FakeService(),
          dark: true, scale: 1.3), size: const Size(320, 2600));
      expect(tester.takeException(), isNull);
      expect(find.text('Social'), findsOneWidget);
    });

    testWidgets('localizes to BM', (tester) async {
      await _pump(tester, 
          _host(const NotificationPreferences(), _FakeService(), locale: 'ms'));
      await tester.pumpAndSettle();
      expect(find.text('Sosial'), findsOneWidget);
      expect(find.text('Waktu Senyap'), findsOneWidget);
    });
  });
}
