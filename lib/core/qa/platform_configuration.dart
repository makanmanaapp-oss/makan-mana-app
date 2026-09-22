// MAKANMANA iOS WAVE 3A — gerbang konfigurasi khusus-platform. TULEN.
//
// MASALAH YANG DIBAIKI
// --------------------
// `DefaultFirebaseOptions.currentPlatform` MELONTAR `UnsupportedError` untuk
// iOS sehingga `flutterfire configure` dijalankan dan
// `GoogleService-Info.plist` wujud. `main.dart` membungkus
// `Firebase.initializeApp` dalam try/catch yang menetapkan
// `firebaseReady = false` dan MENERUSKAN.
//
// Pada Android itu laluan pembangunan yang disengajakan: app berjalan dengan
// data tempatan supaya seseorang boleh bekerja tanpa Firebase. Pada iOS ia
// bermakna sesuatu yang berbeza sama sekali — binaan yang tidak pernah
// dikonfigurasikan akan **berjalan dengan senyap memaparkan data tiruan**,
// kelihatan seperti aplikasi sebenar. Itu kegagalan-TERBUKA, dan ia jenis
// ketidakjujuran senyap yang sama seperti pemutar Explore yang tidak pernah
// berhenti.
//
// Modul ini menjadikan kes iOS EKSPLISIT. Ia tidak mengubah tingkah laku
// Android.

import 'qa_isolation.dart' show kQaFlavorName;

/// Keputusan sama ada laluan produksi boleh dipercayai pada platform ini.
class PlatformConfigurationDecision {
  const PlatformConfigurationDecision.allowed()
      : isAllowed = true,
        blockedReason = null;

  const PlatformConfigurationDecision.blocked(String reason)
      : isAllowed = false,
        blockedReason = reason;

  final bool isAllowed;
  final String? blockedReason;
}

/// Bundle identifier yang DILULUSKAN pemilik.
const String kIosProductionBundleId = 'com.makanmana.apps';
const String kIosQaBundleId = 'com.makanmana.apps.qa';

/// Bolehkah laluan PRODUKSI dipercayai pada binaan ini.
///
/// Dipanggil HANYA selepas gerbang flavour QA menolak — binaan QA tidak pernah
/// sampai ke sini.
///
/// Android kekal tidak berubah dengan sengaja: mod pembangunan tempatannya
/// ialah keputusan lama yang sah, dan gelombang ini tidak akan mengubahnya
/// sebagai kesan sampingan kerja iOS.
PlatformConfigurationDecision decideProductionConfiguration({
  required bool isApplePlatform,
  required bool firebaseOptionsAvailable,
  required String? flavor,
}) {
  if (!isApplePlatform) {
    return const PlatformConfigurationDecision.allowed();
  }

  // Binaan `.qa` TIDAK PERNAH dibenarkan masuk ke laluan produksi. Jika ia
  // sampai ke sini, gerbang pengasingan tidak menuntutnya, dan meneruskan akan
  // menyambungkan binaan QA kepada Firebase produksi.
  if (flavor == kQaFlavorName) {
    return const PlatformConfigurationDecision.blocked(
      'Binaan QA iOS sampai ke laluan produksi. Ia disekat: binaan QA mesti '
      'melalui gerbang pengasingan dan TIDAK boleh menggunakan projek Firebase '
      'produksi.',
    );
  }

  // Flavour belum didawai dalam Xcode, jadi kita tidak boleh membezakan binaan
  // QA daripada produksi. Meneruskan bermakna meneka, dan tekaan yang salah di
  // sini menyambungkan QA kepada produksi.
  if (flavor == null || flavor.isEmpty) {
    return const PlatformConfigurationDecision.blocked(
      'Flavour iOS belum dikonfigurasikan, jadi binaan ini tidak boleh '
      'membuktikan ia produksi dan bukan QA. Tambah konfigurasi binaan '
      'flavour dalam Xcode sebelum menjalankannya.',
    );
  }

  // Konfigurasi Firebase iOS tidak wujud. Tanpa gerbang ini, app berjalan
  // dengan data tiruan dan kelihatan berfungsi.
  if (!firebaseOptionsAvailable) {
    return const PlatformConfigurationDecision.blocked(
      'Konfigurasi Firebase iOS tiada. Jalankan `flutterfire configure` dan '
      'tambah GoogleService-Info.plist untuk bundle yang betul. Binaan ini '
      'TIDAK akan berjalan dengan data tiruan.',
    );
  }

  return const PlatformConfigurationDecision.allowed();
}

/// Bundle yang dijangka untuk satu flavour. Digunakan oleh dokumentasi dan
/// ujian supaya pemetaan hidup di satu tempat sahaja.
String expectedBundleIdFor(String? flavor) =>
    flavor == kQaFlavorName ? kIosQaBundleId : kIosProductionBundleId;
