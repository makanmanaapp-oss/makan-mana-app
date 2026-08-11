import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/taste/taste_compat.dart';

/// QA ISSUE 003: alias paparan legasi (susu/kacang/melayu...) -> ID kanonik;
/// nilai custom tidak dikenali kekal tidak berubah.
void main() {
  test('alias alahan legasi dipetakan; custom kekal', () {
    expect(canonicalAllergyIdFromLegacy('susu'), 'dairy');
    expect(canonicalAllergyIdFromLegacy('Kacang'), 'peanuts');
    expect(canonicalAllergyIdFromLegacy('telur'), 'eggs');
    expect(canonicalAllergyIdFromLegacy('gluten'), 'gluten');
    expect(canonicalAllergyIdFromLegacy('MSG rumah'), 'MSG rumah');
  });
  test('alias masakan legasi dipetakan; huruf besar dinormalkan', () {
    expect(canonicalCuisineIdFromLegacy('melayu'), 'malay');
    expect(canonicalCuisineIdFromLegacy('jepun'), 'japanese');
    expect(canonicalCuisineIdFromLegacy('Thai'), 'thai');
    expect(canonicalCuisineIdFromLegacy('Mamak'), 'mamak');
    expect(canonicalCuisineIdFromLegacy('kelantanese'), 'kelantan');
    expect(canonicalCuisineIdFromLegacy('indonesianMalay'), 'indonesian');
    expect(canonicalCuisineIdFromLegacy('thaiMalay'), 'thai');
  });

  // Regresi ISSUE 003 (QA emulator): Taste Profile memaparkan ID mentah
  // 'custom:fusion qa' dan bukannya label pengguna 'Fusion QA'.
  test('displayCuisineLabel: custom ID -> label pengguna, bukan ID mentah',
      () {
    final customs = [
      {'id': 'custom:fusion qa', 'label': 'Fusion QA', 'normalized': 'Fusion QA'},
    ];
    expect(displayCuisineLabel('custom:fusion qa', 'ms', customs), 'Fusion QA');
    expect(displayCuisineLabel('custom:fusion qa', 'en', customs), 'Fusion QA');
    // Kanonik menang dahulu; alias legasi masih dipetakan.
    expect(displayCuisineLabel('melayu', 'ms', customs), 'Melayu');
    expect(displayCuisineLabel('japanese', 'ms', customs), 'Jepun');
    // Custom tanpa entri padanan: ID asal dikekalkan (jangan buang data).
    expect(displayCuisineLabel('custom:hilang', 'ms', customs),
        'custom:hilang');
    expect(displayCuisineLabel('kampung_x', 'ms', const []), 'kampung_x');
  });
}
