import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/core/providers.dart';
import 'package:makan_mana/features/profile/extras_screens.dart';
import 'package:makan_mana/models/user_profile.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Regresi ISSUE 003 (QA emulator): baris "Jarak pilihan" Taste Profile
/// memaparkan radius carian Home sesi (3 km lalai) dan BUKAN jarak citarasa
/// tersimpan (preferredDistanceKm) yang dipilih pengguna semasa onboarding.
Widget _host(UserProfile profile, SharedPreferences prefs,
        {double scale = 1.0}) =>
    ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        loadedUserProfileProvider.overrideWith((ref) async => profile),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('ms'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(scale)),
            child: const TasteProfileScreen(),
          ),
        ),
      ),
    );

void main() {
  // Regresi ISSUE 003 (QA emulator, 360dp @ 1.30): label baris tidak
  // dibataskan + Spacer menyebabkan lajur nilai dimampatkan sehingga teks
  // pecah satu aksara setiap baris ("Ter/ok/ai/ma/ka/na/n/bar/u").
  testWidgets('baris ringkasan: lajur nilai kekal boleh dibaca 360dp @ 1.30',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    const profile = UserProfile(
      uid: 'qa',
      primaryFoodGoal: 'discover_new',
      preferredDistanceKm: 5.0,
    );
    await tester.binding.setSurfaceSize(const Size(360, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(_host(profile, prefs, scale: 1.30));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    // Nilai matlamat makanan ("Terokai makanan baru") mesti mendapat lebar
    // yang munasabah - sekurang-kurangnya 30% lebar skrin, bukan ~1 aksara.
    final valueSize = tester.getSize(find.text('Terokai makanan baru'));
    expect(valueSize.width, greaterThan(360 * 0.30),
        reason: 'lajur nilai dimampatkan (regresi 360dp@1.30)');
    expect(tester.takeException(), isNull);
  });

  testWidgets('Jarak pilihan papar preferredDistanceKm tersimpan (5 km)',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    const profile = UserProfile(
      uid: 'qa',
      preferredDistanceKm: 5.0,
      customCuisineEntries: [
        {'id': 'custom:fusion qa', 'label': 'Fusion QA'},
      ],
    );
    // Permukaan tinggi supaya semua baris ringkasan dibina tanpa skrol.
    await tester.binding.setSurfaceSize(const Size(800, 2600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        loadedUserProfileProvider.overrideWith((ref) async => profile),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('ms'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: const TasteProfileScreen(),
      ),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    // Jarak citarasa tersimpan menang; radius sesi (3 km) tidak dipaparkan
    // pada baris ini.
    expect(find.text('5 km'), findsOneWidget);
    expect(find.text('3 km'), findsNothing);
    // ID custom mentah tidak boleh sampai ke UI.
    expect(find.textContaining('custom:'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
