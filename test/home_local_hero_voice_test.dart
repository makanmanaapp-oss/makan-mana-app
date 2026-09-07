import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/features/home/home_local_hero.dart';

String _languageHero(String code) {
  final l = AppLocalizations(Locale(code));
  final joiner = code == 'zh' ? '' : ' ';
  return '${l.t('homeHeroLead')}$joiner${l.t('homeHeroAccent')}'
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

Widget _hero(LocalHeroPhrasePlan plan) => MaterialApp(
      home: Scaffold(
        body: MediaQuery(
          data: const MediaQueryData(size: Size(360, 300)),
          child: DynamicLocalHero(
            plan: plan,
            style: const TextStyle(fontSize: 27, height: 1.12),
            languageSpan: TextSpan(text: plan.appLanguagePhrase),
          ),
        ),
      ),
    );

void main() {
  group('MalaysiaStateHeroVoice approved mapping', () {
    const expected = {
      'Kelantan': 'Demo nak make mano?',
      'Terengganu': 'Mung nok makang mane?',
      'Kedah': 'Hang nak makan tang mana?',
      'Perlis': 'Hang nak makan tang mana?',
      'Pulau Pinang': 'Chek nak makan tang mana?',
      'Perak': 'Mike nak makan mana?',
      'Selangor': 'Nak makan mana?',
      'Kuala Lumpur': 'Nak makan mana weh?',
      'Putrajaya': 'Nak makan mana?',
      'Negeri Sembilan': 'Ekau nak makan mano?',
      'Melaka': 'Nak makan mana hawau?',
      'Johor': 'Nak makan mana seyy?',
      'Pahang': 'Aok nak makan mana?',
      'Sabah': 'Bah, mau makan di mana?',
      'Sarawak': 'Kitak mok makan sine?',
      'Labuan': 'Bah, mau makan di mana?',
    };

    for (final entry in expected.entries) {
      test('${entry.key} uses the approved phrase exactly', () {
        expect(MalaysiaStateHeroVoice.phraseFor(entry.key), entry.value);
      });
    }
  });

  group('MalaysiaStateHeroVoice aliases', () {
    const aliases = {
      'Penang': 'Pulau Pinang',
      'Pulau Pinang': 'Pulau Pinang',
      'Kuala Lumpur': 'Kuala Lumpur',
      'Wilayah Persekutuan Kuala Lumpur': 'Kuala Lumpur',
      'Federal Territory of Kuala Lumpur': 'Kuala Lumpur',
      'Putrajaya': 'Putrajaya',
      'Wilayah Persekutuan Putrajaya': 'Putrajaya',
      'Labuan': 'Labuan',
      'Wilayah Persekutuan Labuan': 'Labuan',
      'Negri Sembilan': 'Negeri Sembilan',
    };

    for (final entry in aliases.entries) {
      test('${entry.key} normalizes safely', () {
        expect(
            MalaysiaStateHeroVoice.normalize('  ${entry.key}  '), entry.value);
      });
    }

    test('unknown/null never guesses a state phrase', () {
      expect(MalaysiaStateHeroVoice.normalize(null), isNull);
      expect(MalaysiaStateHeroVoice.phraseFor('Kota Bharu, Kelantan'), isNull);
      expect(MalaysiaStateHeroVoice.phraseFor('Singapore'), isNull);
    });
  });

  group('language and state plan', () {
    test('BM + Kelantan alternates approved language and local phrases', () {
      final plan = LocalHeroPhrasePlan(
        appLanguagePhrase: _languageHero('ms'),
        localStatePhrase: MalaysiaStateHeroVoice.phraseFor('Kelantan'),
      );
      expect(plan.visiblePhrases, ['Nak makan mana?', 'Demo nak make mano?']);
      expect(plan.shouldRotate, isTrue);
    });

    test('English + Kelantan alternates English and the same local phrase', () {
      final plan = LocalHeroPhrasePlan(
        appLanguagePhrase: _languageHero('en'),
        localStatePhrase: MalaysiaStateHeroVoice.phraseFor('Kelantan'),
      );
      expect(
          plan.visiblePhrases, ['What to eat today?', 'Demo nak make mano?']);
    });

    test('English + Perak and BM + Pulau Pinang use exact local voice', () {
      final perak = LocalHeroPhrasePlan(
        appLanguagePhrase: _languageHero('en'),
        localStatePhrase: MalaysiaStateHeroVoice.phraseFor('Perak'),
      );
      final penang = LocalHeroPhrasePlan(
        appLanguagePhrase: _languageHero('ms'),
        localStatePhrase: MalaysiaStateHeroVoice.phraseFor('Pulau Pinang'),
      );
      expect(
          perak.visiblePhrases, ['What to eat today?', 'Mike nak makan mana?']);
      expect(penang.visiblePhrases,
          ['Nak makan mana?', 'Chek nak makan tang mana?']);
    });

    test('Chinese + Sarawak and Tamil + Sabah retain approved language hero',
        () {
      final chinese = LocalHeroPhrasePlan(
        appLanguagePhrase: _languageHero('zh'),
        localStatePhrase: MalaysiaStateHeroVoice.phraseFor('Sarawak'),
      );
      final tamil = LocalHeroPhrasePlan(
        appLanguagePhrase: _languageHero('ta'),
        localStatePhrase: MalaysiaStateHeroVoice.phraseFor('Sabah'),
      );
      expect(chinese.visiblePhrases, ['今天吃什么？', 'Kitak mok makan sine?']);
      expect(tamil.visiblePhrases,
          ['இன்று என்ன சாப்பிடலாம்?', 'Bah, mau makan di mana?']);
    });

    test('BM + Selangor is static while English + Selangor rotates', () {
      final bm = LocalHeroPhrasePlan(
        appLanguagePhrase: _languageHero('ms'),
        localStatePhrase: MalaysiaStateHeroVoice.phraseFor('Selangor'),
      );
      final english = LocalHeroPhrasePlan(
        appLanguagePhrase: _languageHero('en'),
        localStatePhrase: MalaysiaStateHeroVoice.phraseFor('Selangor'),
      );
      expect(bm.shouldRotate, isFalse);
      expect(bm.visiblePhrases, ['Nak makan mana?']);
      expect(english.shouldRotate, isTrue);
    });

    test('unknown state keeps only the app-language hero', () {
      final plan = LocalHeroPhrasePlan(
          appLanguagePhrase: _languageHero('en'), localStatePhrase: null);
      expect(plan.visiblePhrases, ['What to eat today?']);
    });
  });

  testWidgets(
      'visual text rotates once and fixed semantics remain app language',
      (tester) async {
    const language = 'What to eat today?';
    const local = 'Demo nak make mano?';
    await tester.pumpWidget(_hero(const LocalHeroPhrasePlan(
        appLanguagePhrase: language, localStatePhrase: local)));

    expect(find.text(language), findsOneWidget);
    expect(find.bySemanticsLabel(language), findsOneWidget);
    await tester.pump(const Duration(seconds: 4));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text(local), findsOneWidget);
    expect(find.bySemanticsLabel(language), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('language/state changes restart on app-language slide cleanly',
      (tester) async {
    await tester.pumpWidget(_hero(const LocalHeroPhrasePlan(
      appLanguagePhrase: 'Nak makan mana?',
      localStatePhrase: 'Demo nak make mano?',
    )));
    await tester.pump(const Duration(seconds: 4));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Demo nak make mano?'), findsOneWidget);

    await tester.pumpWidget(_hero(const LocalHeroPhrasePlan(
      appLanguagePhrase: 'What to eat today?',
      localStatePhrase: 'Mung nok makang mane?',
    )));
    expect(find.text('What to eat today?'), findsOneWidget);
    await tester.pump(const Duration(seconds: 4));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Mung nok makang mane?'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('pause cancels rotation and resume starts one clean cycle',
      (tester) async {
    const appLanguage = 'What to eat today?';
    const local = 'Demo nak make mano?';
    await tester.pumpWidget(_hero(const LocalHeroPhrasePlan(
        appLanguagePhrase: appLanguage, localStatePhrase: local)));

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(const Duration(seconds: 5));
    expect(find.text(appLanguage), findsOneWidget);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump(const Duration(seconds: 4));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text(local), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      '#26 rotation is presentation-only: no ProviderScope / no recommendation '
      'coupling', (tester) async {
    // DynamicLocalHero's API is only (languageSpan, plan, style) — no WidgetRef
    // and no provider reads. Pumped WITHOUT any ProviderScope, it rotates across
    // several 4s cycles with no error, proving the text rotation cannot trigger
    // getSuggestions / nextSuggestion / provider discovery / GPS / the food
    // carousel. (Structural guarantee reinforced by runtime.)
    await tester.pumpWidget(_hero(const LocalHeroPhrasePlan(
      appLanguagePhrase: 'Nak makan mana?',
      localStatePhrase: 'Demo nak make mano?',
    )));
    for (var i = 0; i < 3; i++) {
      await tester.pump(const Duration(seconds: 4));
      await tester.pump(const Duration(milliseconds: 400));
    }
    expect(tester.takeException(), isNull);
    expect(find.byType(DynamicLocalHero), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  group('Part 12 — hero + carousel-box layout never overflows', () {
    // Kotak carousel sebenar mengikut lebar (compact<340:150, small<360:168,
    // selainnya 197) supaya hero (Expanded) diuji dengan ruang sebenar.
    double boxW(double w) => w < 340 ? 150.0 : (w < 360 ? 168.0 : 197.0);
    const widths = [320.0, 360.0, 390.0, 412.0, 430.0];
    const scales = [1.0, 1.3, 1.5];
    // Frasa app-language BM + dialek Pulau Pinang (antara yang terpanjang).
    final plan = LocalHeroPhrasePlan(
      appLanguagePhrase: _languageHero('ms'),
      localStatePhrase: MalaysiaStateHeroVoice.phraseFor('Pulau Pinang'),
    );
    for (final w in widths) {
      for (final s in scales) {
        testWidgets('${w.toInt()}dp @${s}x — app + local phrase, no overflow',
            (tester) async {
          await tester.binding.setSurfaceSize(Size(w, 900));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          await tester.pumpWidget(MaterialApp(
            home: Scaffold(
              body: MediaQuery(
                data: MediaQueryData(
                    size: Size(w, 900), textScaler: TextScaler.linear(s)),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 16, 0),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
                        child: DynamicLocalHero(
                          plan: plan,
                          style: const TextStyle(
                              fontSize: 27,
                              height: 1.12,
                              fontWeight: FontWeight.w800),
                          languageSpan:
                              TextSpan(text: plan.appLanguagePhrase),
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(width: boxW(w), height: 175),
                    ],
                  ),
                ),
              ),
            ),
          ));
          await tester.pump();
          expect(tester.takeException(), isNull,
              reason: 'app phrase ${w.toInt()}dp @${s}x');
          // Putar ke frasa dialek (lebih panjang) — masih tiada overflow.
          await tester.pump(const Duration(seconds: 4));
          await tester.pump(const Duration(milliseconds: 400));
          expect(tester.takeException(), isNull,
              reason: 'local phrase ${w.toInt()}dp @${s}x');
          await tester.pumpWidget(const SizedBox());
        });
      }
    }
  });
}
