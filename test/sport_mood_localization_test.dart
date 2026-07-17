import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/features/fit/fit_models.dart';
import 'package:makan_mana/features/fit/sport_mood_display.dart';
import 'package:makan_mana/features/fit/sport_moods_data.dart';

const _languages = ['ms', 'en', 'zh', 'ta'];

/// Baseline dikunci oleh ISSUE 001.2 - kiraan ini tidak boleh berubah tanpa
/// keputusan produk yang jelas.
const _expectedMoodCount = 30;
const _expectedBlockCount = 108;

AppLocalizations _l(String code) => AppLocalizations(Locale(code));

/// Semua blok senaman yang dipaparkan, termasuk warm-up/cool-down kongsi.
List<WorkoutBlock> _allMoodBlocks() =>
    kSportMoods.expand((m) => m.mainWork).toList();

void main() {
  group('Sport Mood - data stabil', () {
    test('bilangan Sport Mood kekal 30', () {
      expect(kSportMoods, hasLength(_expectedMoodCount));
    });

    test('bilangan blok senaman kekal pada baseline yang diaudit (108)', () {
      expect(_allMoodBlocks(), hasLength(_expectedBlockCount));
    });

    test('ID stabil kekal tidak berubah', () {
      // Senarai ini dikunci: perubahan bermakna rekod Firestore sedia ada
      // tidak lagi dapat dipadankan dengan mood.
      const expectedIds = [
        'fighterCamp',
        'boxingConditioning',
        'muayThai',
        'mmaHybrid',
        'selfDefence',
        'easyRun',
        'speedRun',
        'prep5km',
        'prep10km',
        'trailRun',
        'marathonBase',
        'muscleGain',
        'fatLoss',
        'bodyRecomp',
        'strengthDay',
        'upperBody',
        'lowerBody',
        'coreAbs',
        'homeWorkout',
        'busy20min',
        'footballMatchday',
        'badmintonAgility',
        'basketballEnergy',
        'tennisMode',
        'cyclistEndurance',
        'swimmerMode',
        'hikingMode',
        'courtGame',
        'mobilityRecovery',
        'restDayNutrition',
      ];
      expect(kSportMoods.map((m) => m.id).toList(), equals(expectedIds));
    });

    test('ID mood unik', () {
      final ids = kSportMoods.map((m) => m.id).toList();
      expect(ids.toSet(), hasLength(ids.length));
    });

    test('nilai berangka dan fungsian dikekalkan', () {
      // Sampel merentas kategori - mengesan pelarasan tidak sengaja.
      final fighter = sportMoodById('fighterCamp');
      expect(fighter.intensity, 'high');
      expect(fighter.baseDuration, 60);
      expect(fighter.category, 'combat');
      expect(fighter.isRecovery, isFalse);
      expect(fighter.mainWork, hasLength(5));

      final rest = sportMoodById('restDayNutrition');
      expect(rest.intensity, 'low');
      expect(rest.baseDuration, 0);
      expect(rest.isRecovery, isTrue);

      final busy = sportMoodById('busy20min');
      expect(busy.baseDuration, 20);
      expect(busy.mainWork, hasLength(1));
    });

    test('tiada rentetan tajuk/tujuan/fokus-makanan langsung dalam definisi',
        () {
      // Definisi hanya boleh mendedahkan kunci - bukan salinan paparan.
      for (final mood in kSportMoods) {
        expect(mood.titleKey, startsWith('sportMood'));
        expect(mood.titleKey, endsWith('Title'));
        expect(mood.purposeKey, endsWith('Purpose'));
        expect(mood.foodFocusKey, endsWith('FoodFocus'));
        // Kunci mesti diterbitkan daripada ID stabil.
        expect(mood.titleKey.toLowerCase(),
            contains(mood.id.toLowerCase()));
      }
    });
  });

  group('Sport Mood - resolusi kunci merentas 4 bahasa', () {
    test('setiap kunci tajuk mood diselesaikan dalam semua bahasa', () {
      for (final mood in kSportMoods) {
        for (final lang in _languages) {
          final value = _l(lang).t(mood.titleKey);
          expect(value, isNot(mood.titleKey),
              reason: '${mood.titleKey} tidak diselesaikan untuk $lang');
          expect(value.trim(), isNotEmpty);
        }
      }
    });

    test('setiap kunci tujuan mood diselesaikan dalam semua bahasa', () {
      for (final mood in kSportMoods) {
        for (final lang in _languages) {
          final value = _l(lang).t(mood.purposeKey);
          expect(value, isNot(mood.purposeKey),
              reason: '${mood.purposeKey} tidak diselesaikan untuk $lang');
          expect(value.trim(), isNotEmpty);
        }
      }
    });

    test('setiap kunci fokus makanan diselesaikan dalam semua bahasa', () {
      for (final mood in kSportMoods) {
        for (final lang in _languages) {
          final value = _l(lang).t(mood.foodFocusKey);
          expect(value, isNot(mood.foodFocusKey),
              reason: '${mood.foodFocusKey} tidak diselesaikan untuk $lang');
          expect(value.trim(), isNotEmpty);
        }
      }
    });

    test('setiap kunci paparan blok senaman diselesaikan dalam semua bahasa',
        () {
      for (final block in _allMoodBlocks()) {
        for (final lang in _languages) {
          final l = _l(lang);
          final name = resolveWorkoutBlockName(l, block);
          final detail = resolveWorkoutBlockDetail(l, block);
          expect(name, isNot(block.nameKey),
              reason: '${block.nameKey} tidak diselesaikan untuk $lang');
          expect(detail, isNot(block.detailKey),
              reason: '${block.detailKey} tidak diselesaikan untuk $lang');
          expect(name.trim(), isNotEmpty);
          expect(detail.trim(), isNotEmpty);
        }
      }
    });

    test('label kategori diselesaikan dalam semua bahasa', () {
      for (final category in SportMoodCategories.order) {
        for (final lang in _languages) {
          final value = resolveSportMoodCategoryLabel(_l(lang), category);
          expect(value, isNot(category));
          expect(value.trim(), isNotEmpty);
        }
      }
    });
  });

  group('Sport Mood - kualiti terjemahan zh / ta', () {
    // Ayat penuh tidak boleh diam-diam guna sandaran English. Tajuk dan nama
    // blok dikecualikan kerana istilah teknikal/jenama sengaja dikekalkan.
    test('ayat penuh zh untuk tujuan bukan sandaran English', () {
      final en = _l('en');
      final zh = _l('zh');
      for (final mood in kSportMoods) {
        expect(zh.t(mood.purposeKey), isNot(en.t(mood.purposeKey)),
            reason: '${mood.purposeKey} masih sama dengan English dalam zh');
        expect(zh.t(mood.foodFocusKey), isNot(en.t(mood.foodFocusKey)),
            reason: '${mood.foodFocusKey} masih sama dengan English dalam zh');
      }
    });

    test('ayat penuh ta untuk tujuan bukan sandaran English', () {
      final en = _l('en');
      final ta = _l('ta');
      for (final mood in kSportMoods) {
        expect(ta.t(mood.purposeKey), isNot(en.t(mood.purposeKey)),
            reason: '${mood.purposeKey} masih sama dengan English dalam ta');
        expect(ta.t(mood.foodFocusKey), isNot(en.t(mood.foodFocusKey)),
            reason: '${mood.foodFocusKey} masih sama dengan English dalam ta');
      }
    });

    test('teks Cina tiada aksara pengganti', () {
      final zh = AppLocalizations.valuesForTesting(const Locale('zh'));
      for (final entry in zh.entries) {
        expect(entry.value, isNot(contains('�')),
            reason: '${entry.key} mengandungi aksara pengganti');
        expect(entry.value, isNot(contains('?????')),
            reason: '${entry.key} kelihatan seperti teks rosak');
      }
    });

    test('nama jenama / istilah teknikal kekal tidak berubah', () {
      // Istilah ini sengaja dikekalkan dalam semua bahasa.
      for (final lang in _languages) {
        final l = _l(lang);
        expect(l.t('sportMoodMmaHybridTitle'), contains('MMA'));
        expect(l.t('sportWorkoutBusy20minEmom20Name'), contains('EMOM'));
        expect(l.t('sportMoodPrep5kmTitle'), contains('5KM'));
        expect(l.t('sportMoodPrep10kmTitle'), contains('10KM'));
      }
    });
  });

  group('Keserasian persistence + rekod legasi', () {
    test('muatan bersiri WorkoutBlock kekal {name, detail} sahaja', () {
      // Kunci localization ialah masa-jalan sahaja dan MESTI dikecualikan
      // daripada muatan tersimpan.
      for (final block in _allMoodBlocks()) {
        final map = block.toMap();
        expect(map.keys.toSet(), equals({'name', 'detail'}),
            reason: 'muatan berubah untuk ${block.id}');
        expect(map['name'], block.name);
        expect(map['detail'], block.detail);
      }
    });

    test('nama kanonik kekal stabil dan bebas bahasa', () {
      // workout_sessions.workoutName ditulis daripada canonicalName - ia tidak
      // boleh menjadi label terjemahan.
      expect(sportMoodById('fighterCamp').canonicalName, 'Fighter Camp');
      expect(sportMoodById('homeWorkout').canonicalName, 'Home Workout');
      expect(sportMoodById('easyRun').canonicalName, 'Easy Run');
      expect(sportMoodById('prep5km').canonicalName, '5KM Prep');
    });

    test('alias legasi English yang diketahui diselesaikan', () {
      final zh = _l('zh');
      // Petikan English tersimpan, ID mood hilang -> alias mesti padan.
      expect(
        resolveSportMoodTitle(zh, legacyName: 'Fighter Camp'),
        zh.t('sportMoodFighterCampTitle'),
      );
      expect(
        resolveSportMoodTitle(zh, legacyName: 'Home Workout'),
        zh.t('sportMoodHomeWorkoutTitle'),
      );
      // Padanan tidak mengira huruf besar/kecil dan ruang hujung.
      expect(
        resolveSportMoodTitle(zh, legacyName: '  easy run  '),
        zh.t('sportMoodEasyRunTitle'),
      );
    });

    test('setiap nama kanonik boleh dipadankan semula melalui alias', () {
      final ta = _l('ta');
      for (final mood in kSportMoods) {
        expect(
          resolveSportMoodTitle(ta, legacyName: mood.canonicalName),
          ta.t(mood.titleKey),
          reason: 'alias legasi gagal untuk ${mood.id}',
        );
      }
    });

    test('ID stabil diutamakan berbanding petikan legasi yang bercanggah', () {
      final ms = _l('ms');
      // Keutamaan 1 mesti menang walaupun teks legasi menunjuk mood lain.
      expect(
        resolveSportMoodTitle(ms,
            moodId: 'easyRun', legacyName: 'Fighter Camp'),
        ms.t('sportMoodEasyRunTitle'),
      );
    });

    test('nilai legasi tidak dikenali jatuh balik ke teks asalnya', () {
      final zh = _l('zh');
      // TIDAK PERNAH dibuang, walaupun tiada pemetaan selamat wujud.
      expect(
        resolveSportMoodTitle(zh, legacyName: 'Mod Lama Saya'),
        'Mod Lama Saya',
      );
      // ID tidak dikenali + petikan tidak dikenali -> masih kekalkan teks.
      expect(
        resolveSportMoodTitle(zh,
            moodId: 'moodYangDibuang', legacyName: 'Sesi Custom 2023'),
        'Sesi Custom 2023',
      );
    });

    test('sandaran generik hanya bila nilai asal null atau kosong', () {
      for (final lang in _languages) {
        final l = _l(lang);
        expect(resolveSportMoodTitle(l), l.t('fitWorkoutFallback'));
        expect(resolveSportMoodTitle(l, legacyName: ''),
            l.t('fitWorkoutFallback'));
        expect(resolveSportMoodTitle(l, legacyName: '   '),
            l.t('fitWorkoutFallback'));
      }
    });

    test('blok tanpa kunci jatuh balik ke teks kanonik', () {
      // Mensimulasikan blok legasi yang dibina tanpa metadata localization.
      const legacy = WorkoutBlock(name: 'Latihan Lama', detail: '3 x 9');
      final l = _l('zh');
      expect(resolveWorkoutBlockName(l, legacy), 'Latihan Lama');
      expect(resolveWorkoutBlockDetail(l, legacy), '3 x 9');
    });

    test('kunci tidak dikenali dalam blok jatuh balik ke teks kanonik', () {
      const stale = WorkoutBlock(
        name: 'Blok Usang',
        detail: '1 x 1',
        nameKey: 'sportWorkoutKunciTidakWujudName',
        detailKey: 'sportWorkoutKunciTidakWujudDetail',
      );
      final l = _l('en');
      expect(resolveWorkoutBlockName(l, stale), 'Blok Usang');
      expect(resolveWorkoutBlockDetail(l, stale), '1 x 1');
    });
  });

  group('Label intensiti', () {
    test('intensiti diselesaikan dalam semua bahasa', () {
      for (final lang in _languages) {
        final l = _l(lang);
        for (final intensity in ['low', 'medium', 'high']) {
          final value = resolveIntensityLabel(l, intensity);
          expect(value.trim(), isNotEmpty);
          expect(value, isNot(startsWith('fitIntensity')));
        }
      }
    });

    test('intensiti tidak dikenali dikembalikan apa adanya', () {
      expect(resolveIntensityLabel(_l('ms'), 'extreme'), 'extreme');
    });
  });
}
