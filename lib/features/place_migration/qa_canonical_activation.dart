/// WAVE 3 GATE 3F-A — pengaktifan Butiran Kedai KANONIKAL untuk binaan QA.
///
/// PUNCA (ditemui oleh QA peranti sebenar): keupayaan kanonikal Wave 2/Wave 3
/// sudah dibina, tetapi satu-satunya laluan pengaktifan runtime
/// (`evaluateInternalCohort` + `applyInternalCohortActivation`) hanya dipanggil
/// dari skrin LOG MASUK/DAFTAR. Pada pelancaran biasa dengan sesi sedia ada, ia
/// TIDAK PERNAH berjalan, jadi `canonicalRestaurantDetailEnabled` kekal `false`
/// dan skrin legasi dipaparkan — betul-betul seperti yang dilihat pada telefon.
/// Kelayakannya juga terikat kepada SATU UID keras, jadi walaupun selepas log
/// masuk semula ia tidak akan aktif untuk akaun QA biasa.
///
/// Modul ini menambah pengaktifan TERKECIL yang selamat, dinilai pada
/// permulaan app (bukan pada peristiwa log masuk):
///
///     kDebugMode && appFlavor == "qa"
///
/// Kenapa syarat ini selamat:
/// - `com.makanmana.apps.qa` ialah pakej dalaman BERASINGAN daripada produksi;
/// - `appFlavor` ialah pemalar masa-kompil daripada `--flavor qa`, jadi binaan
///   `--flavor prod` tidak boleh melaporkan "qa";
/// - `kDebugMode` FALSE dalam sebarang binaan keluaran, jadi keluaran produksi
///   sentiasa litar-pintas kepada FALSE walaupun flavor entah bagaimana "qa".
///
/// Ia TIDAK menukar lalai global: `RestaurantDetailFlags
/// .canonicalRestaurantDetailEnabled` kekal `false` dalam sumber.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show appFlavor;

import 'place_migration_flags.dart';

/// Nama flavor QA — mesti sepadan dengan productFlavors "qa" dalam
/// android/app/build.gradle.kts (applicationIdSuffix ".qa").
const String kQaFlavorName = 'qa';

/// Penilaian TULEN (tiada kesan sampingan, boleh diuji tanpa binaan sebenar).
///
/// Sengaja TIDAK menerima mana-mana rahsia/UID keras: satu-satunya isyarat ialah
/// jenis binaan + flavor, kedua-duanya pemalar masa-kompil.
bool qaCanonicalDetailAllowed({
  required bool isDebugBuild,
  required String? flavor,
}) {
  if (!isDebugBuild) return false;
  return flavor == kQaFlavorName;
}

/// Terapkan keupayaan kanonikal untuk binaan QA sahaja.
///
/// Mengembalikan `true` HANYA apabila ia benar-benar mengaktifkan sesuatu.
/// Dalam produksi/keluaran ia no-op dan mengembalikan `false`.
///
/// Nota: laluan baca kekal `canonicalPreferredWithLegacyFallback`, jadi apabila
/// tiada penerbitan kanonikal AKTIF, skrin legasi yang selamat masih digunakan —
/// tiada data menu direka.
bool applyQaCanonicalActivation({bool? isDebugBuild, String? flavor}) {
  final allowed = qaCanonicalDetailAllowed(
    isDebugBuild: isDebugBuild ?? kDebugMode,
    flavor: flavor ?? appFlavor,
  );
  if (!allowed) return false;

  PlaceMigrationFeatureFlags.enableInternalCohortCanonical();
  final result = PlaceMigrationFeatureFlags.apply(
    readMode: PlaceReadMode.canonicalPreferredWithLegacyFallback,
    shadowRead: false,
    diagnostics: false,
    canonicalCards: true,
    canonicalDetail: true,
    correctionEnabled: true,
    releaseMode: false,
    migrationCompleted: true,
    adapterAvailable: true,
    trustedCallableAvailable: true,
  );
  return result.ok;
}
