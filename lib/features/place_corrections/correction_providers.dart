/// PART 1 Phase 1.11 — penyedia repository pembetulan.
///
/// Dalam fasa ini penyedia mengembalikan repository TEMPATAN/MOCK. Tiada
/// callable produksi dan tiada tulisan Firestore. Menukar kepada penyesuai
/// dipercayai kemudian hanya menyentuh fail ini.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'correction_repository.dart';

final placeCorrectionRepositoryProvider =
    Provider<PlaceCorrectionRepository>((ref) {
  return LocalPlaceCorrectionRepository();
});
