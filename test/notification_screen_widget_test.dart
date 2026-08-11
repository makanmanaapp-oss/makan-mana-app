// Front Page Redesign 1 — ujian widget NotificationScreen (tanpa Firebase).
//
// notificationsStreamProvider di-override supaya keadaan loading/kosong/ralat/
// data + pengumpulan Hari ini/Terdahulu + keterlihatan "Tanda semua dibaca"
// boleh diuji tanpa backend. Tiada tekan navigasi (elak keperluan GoRouter).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/notifications/notification_model.dart';
import 'package:makan_mana/features/notifications/notification_providers.dart';
import 'package:makan_mana/features/notifications/notification_screen.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';

MakanNotification _mk({
  required String id,
  required DateTime createdAt,
  bool isRead = false,
  String title = 'Tajuk',
}) =>
    MakanNotification(
      id: id,
      type: MakanNotificationType.system,
      title: title,
      body: 'Kandungan',
      createdAt: createdAt,
      isRead: isRead,
    );

Future<void> _pump(
  WidgetTester tester,
  Stream<List<MakanNotification>> stream,
) async {
  await tester.binding.setSurfaceSize(const Size(800, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(ProviderScope(
    overrides: [
      notificationsStreamProvider.overrideWith((ref) => stream),
    ],
    child: const MaterialApp(
      locale: Locale('en'),
      localizationsDelegates: [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: [Locale('en')],
      home: NotificationScreen(),
    ),
  ));
}

void main() {
  testWidgets('keadaan kosong papar "No notifications"', (tester) async {
    await _pump(tester, Stream.value(const <MakanNotification>[]));
    await tester.pumpAndSettle();
    expect(find.text('No notifications'), findsOneWidget);
    expect(find.text('Mark all as read'), findsNothing);
  });

  testWidgets('keadaan loading papar spinner', (tester) async {
    final controller = StreamController<List<MakanNotification>>();
    addTearDown(controller.close);
    await _pump(tester, controller.stream);
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('ralat strim papar mesej ralat + retry', (tester) async {
    await _pump(tester, Stream.error(Exception('boom')));
    await tester.pumpAndSettle();
    expect(find.text('Could not load notifications.'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('data: papar tajuk + "Mark all as read" bila ada belum-baca',
      (tester) async {
    final now = DateTime.now();
    await _pump(
      tester,
      Stream.value([
        _mk(id: 'a', createdAt: now, title: 'Hari Ini A'),
      ]),
    );
    await tester.pumpAndSettle();
    expect(find.text('Hari Ini A'), findsOneWidget);
    expect(find.text('Today'), findsOneWidget);
    expect(find.text('Mark all as read'), findsOneWidget);
  });

  testWidgets('semua dibaca → "Mark all as read" tersembunyi', (tester) async {
    final now = DateTime.now();
    await _pump(
      tester,
      Stream.value([
        _mk(id: 'a', createdAt: now, isRead: true, title: 'Sudah Baca'),
      ]),
    );
    await tester.pumpAndSettle();
    expect(find.text('Sudah Baca'), findsOneWidget);
    expect(find.text('Mark all as read'), findsNothing);
  });

  testWidgets('pengumpulan Today / Earlier', (tester) async {
    final now = DateTime.now();
    final old = now.subtract(const Duration(days: 3));
    await _pump(
      tester,
      Stream.value([
        _mk(id: 'today', createdAt: now, title: 'Baharu'),
        _mk(id: 'old', createdAt: old, title: 'Lama'),
      ]),
    );
    await tester.pumpAndSettle();
    expect(find.text('Today'), findsOneWidget);
    expect(find.text('Earlier'), findsOneWidget);
    expect(find.text('Baharu'), findsOneWidget);
    expect(find.text('Lama'), findsOneWidget);
  });
}
