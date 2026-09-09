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
/// Laluan biasa kekal:
///
///     kDebugMode && appFlavor == "qa"
///
/// Untuk SATU gate peranti Wave 2 sahaja, binaan QA release bertandatangan boleh
/// mengaktifkan canonical melalui dart-define eksplisit
/// `MM_MENU_SCROLL_DEVICE_QA=true`. Ia masih WAJIB flavor `qa`; flavor `prod`
/// tidak boleh mengaktifkan override ini. Tujuannya hanya membolehkan APK QA
/// bertandatangan yang serasi dengan app sedia ada diuji tanpa uninstall/data
/// loss. Branch diagnosis ini tidak boleh digabungkan sebagai perubahan produk.
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

/// Override compile-time yang HANYA digunakan oleh real-device diagnostic gate.
/// Default FALSE dalam semua binaan biasa.
const bool kMenuScrollDeviceQaOverride = bool.fromEnvironment(
  'MM_MENU_SCROLL_DEVICE_QA',
  defaultValue: false,
);

/// Penilaian TULEN (tiada kesan sampingan, boleh diuji tanpa binaan sebenar).
bool qaCanonicalDetailAllowed({
  required bool isDebugBuild,
  required String? flavor,
  bool? deviceQaOverride,
}) {
  if (flavor != kQaFlavorName) return false;
  final diagnosticOverride =
      deviceQaOverride ?? kMenuScrollDeviceQaOverride;
  return isDebugBuild || diagnosticOverride;
}

/// Terapkan keupayaan kanonikal untuk binaan QA sahaja.
///
/// Binaan biasa: hanya debug + qa. Binaan release QA hanya boleh masuk melalui
/// override diagnostic eksplisit di atas. Prod sentiasa gagal syarat flavor.
///
/// Nota: laluan baca kekal `canonicalPreferredWithLegacyFallback`, jadi apabila
/// tiada penerbitan kanonikal AKTIF, skrin legasi yang selamat masih digunakan —
/// tiada data menu direka.
bool applyQaCanonicalActivation({
  bool? isDebugBuild,
  String? flavor,
  bool? deviceQaOverride,
}) {
  final allowed = qaCanonicalDetailAllowed(
    isDebugBuild: isDebugBuild ?? kDebugMode,
    flavor: flavor ?? appFlavor,
    deviceQaOverride: deviceQaOverride,
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
