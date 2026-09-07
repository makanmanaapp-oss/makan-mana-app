/// Pemetaan persembahan Home yang terkawal. Ia tidak membuat GPS, geocoding,
/// atau menyimpan lokasi; pemanggil hanya boleh memberi nilai lokasi sedia ada.
class MalaysiaStateHeroVoice {
  const MalaysiaStateHeroVoice._();

  static const Map<String, String> _phrases = {
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

  static const Map<String, String> _aliases = {
    'kelantan': 'Kelantan',
    'terengganu': 'Terengganu',
    'kedah': 'Kedah',
    'perlis': 'Perlis',
    'pulau pinang': 'Pulau Pinang',
    'penang': 'Pulau Pinang',
    'perak': 'Perak',
    'selangor': 'Selangor',
    'kuala lumpur': 'Kuala Lumpur',
    'wilayah persekutuan kuala lumpur': 'Kuala Lumpur',
    'federal territory of kuala lumpur': 'Kuala Lumpur',
    'putrajaya': 'Putrajaya',
    'wilayah persekutuan putrajaya': 'Putrajaya',
    'federal territory of putrajaya': 'Putrajaya',
    'negeri sembilan': 'Negeri Sembilan',
    'negri sembilan': 'Negeri Sembilan',
    'melaka': 'Melaka',
    'johor': 'Johor',
    'pahang': 'Pahang',
    'sabah': 'Sabah',
    'sarawak': 'Sarawak',
    'labuan': 'Labuan',
    'wilayah persekutuan labuan': 'Labuan',
    'federal territory of labuan': 'Labuan',
  };

  /// Hanya alias yang diluluskan. Tiada fuzzy matching atau tekaan lokasi.
  static String? normalize(String? stateOrAdministrativeArea) {
    var normalized = stateOrAdministrativeArea?.trim().toLowerCase();
    if (normalized == null || normalized.isEmpty) return null;
    // Bentuk biasa daripada geocoder masih selamat kerana baki teks wajib
    // sepadan tepat dengan satu negeri yang diluluskan.
    if (normalized.startsWith('state of ')) {
      normalized = normalized.substring('state of '.length).trim();
    }
    return _aliases[normalized];
  }

  static String? phraseFor(String? stateOrAdministrativeArea) {
    final state = normalize(stateOrAdministrativeArea);
    return state == null ? null : _phrases[state];
  }
}
