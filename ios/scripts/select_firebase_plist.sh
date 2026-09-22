#!/bin/sh
# MAKANMANA iOS WAVE 3A — pilih GoogleService-Info.plist mengikut flavour.
#
# Dijalankan sebagai Run Script build phase dalam Runner.xcodeproj, SELEPAS
# fasa "Resources" (Copy Bundle Resources) dan sebelum Embed Frameworks.
#
# PEMBETULAN WAVE 3B: Wave 3A berkata "SEBELUM Copy Bundle Resources". Itu
# salah. Bundle .app belum dipasang pada ketika itu, dan apa-apa yang
# diletakkan di sana boleh ditulis ganti oleh fasa Resources itu sendiri.
#
# MENGAPA IA WUJUD
# ----------------
# Satu bundle iOS hanya boleh membawa SATU GoogleService-Info.plist. Tanpa
# pemilihan eksplisit, cara biasa ialah meletakkan plist PRODUKSI dalam projek
# dan menggunakannya untuk semua binaan — termasuk QA. Itu tepat perkara yang
# pengasingan QA wujud untuk menghalang.
#
# IA GAGAL-TERTUTUP. Plist yang hilang MENGHENTIKAN binaan. Ia tidak pernah
# jatuh balik kepada plist flavour lain, dan ia tidak pernah membenarkan binaan
# diteruskan tanpa konfigurasi.

set -eu

if [ -z "${MM_FLAVOR:-}" ]; then
  echo "error: MM_FLAVOR tidak ditetapkan. Konfigurasi binaan ini tidak memetakan kepada flavour, jadi plist Firebase yang betul tidak dapat dipilih." >&2
  exit 1
fi

SOURCE_DIR="${MM_FIREBASE_PLIST_DIR:-${SRCROOT}/Firebase/${MM_FLAVOR}}"
SOURCE_PLIST="${SOURCE_DIR}/GoogleService-Info.plist"

if [ ! -f "${SOURCE_PLIST}" ]; then
  echo "error: ${SOURCE_PLIST} tiada." >&2
  echo "note: muat turun GoogleService-Info.plist untuk flavour '${MM_FLAVOR}' dari konsol Firebase dan letakkannya di sana. Binaan DISEKAT — ia tidak akan menggunakan plist flavour lain." >&2
  exit 1
fi


# ---------------------------------------------------------------------------
# PENGAWAL SILANG-PERSEKITARAN
# ---------------------------------------------------------------------------
# Menyalin plist sahaja tidak membuktikan plist yang BETUL disalin. Seseorang
# boleh meletakkan plist produksi dalam ios/Firebase/qa/ dan setiap semakan di
# atas masih lulus. Pengawal ini membandingkan kandungan plist dengan identiti
# binaan, jadi plist yang salah letak menghentikan binaan dan bukan diam-diam
# menghantar QA kepada Firebase produksi.

plist_value() {
  # Plist Firebase ialah XML rata: <key>K</key><string>V</string>.
  sed -n "/<key>$1<\/key>/,/<\/string>/p" "$2" \
    | sed -n 's:.*<string>\(.*\)</string>.*:\1:p' \
    | head -1
}

PLIST_BUNDLE_ID="$(plist_value BUNDLE_ID "${SOURCE_PLIST}")"

if [ -z "${PLIST_BUNDLE_ID}" ]; then
  echo "error: ${SOURCE_PLIST} tiada BUNDLE_ID. Ia bukan GoogleService-Info.plist yang sah." >&2
  exit 1
fi

if [ -z "${PRODUCT_BUNDLE_IDENTIFIER:-}" ]; then
  echo "error: PRODUCT_BUNDLE_IDENTIFIER tidak ditetapkan, jadi plist tidak dapat disemak terhadap identiti binaan." >&2
  exit 1
fi

if [ "${PLIST_BUNDLE_ID}" != "${PRODUCT_BUNDLE_IDENTIFIER}" ]; then
  echo "error: plist flavour '${MM_FLAVOR}' adalah untuk ${PLIST_BUNDLE_ID}, tetapi binaan ini ialah ${PRODUCT_BUNDLE_IDENTIFIER}." >&2
  echo "note: plist berkemungkinan disalin dari projek Firebase yang salah. Binaan DISEKAT sebelum QA menyentuh produksi." >&2
  exit 1
fi

# Semakan BUNDLE_ID sahaja tidak mencukupi. Dua projek Firebase boleh
# mendaftarkan bundle id yang SAMA, jadi plist produksi untuk
# com.makanmana.apps.qa boleh wujud dan lulus semakan di atas. Ikatan kepada
# identiti PROJEK ialah yang benar-benar memisahkan QA daripada produksi.
MM_PRODUCTION_PROJECT_ID="makanmana-c59f3"
PLIST_PROJECT_ID="$(plist_value PROJECT_ID "${SOURCE_PLIST}")"

if [ -z "${PLIST_PROJECT_ID}" ]; then
  echo "error: ${SOURCE_PLIST} tiada PROJECT_ID. Identiti projek Firebasenya tidak dapat disahkan." >&2
  exit 1
fi

if [ "${MM_FLAVOR}" = "prod" ]; then
  if [ "${PLIST_PROJECT_ID}" != "${MM_PRODUCTION_PROJECT_ID}" ]; then
    echo "error: binaan produksi, tetapi plist adalah untuk projek '${PLIST_PROJECT_ID}'." >&2
    exit 1
  fi
else
  if [ "${PLIST_PROJECT_ID}" = "${MM_PRODUCTION_PROJECT_ID}" ]; then
    echo "error: flavour '${MM_FLAVOR}' membawa plist projek PRODUKSI ('${PLIST_PROJECT_ID}')." >&2
    echo "note: QA mesti mempunyai projek Firebase tersendiri. Binaan DISEKAT." >&2
    exit 1
  fi
fi

# Google Sign-In iOS memerlukan skim URL panggil-balik REVERSED_CLIENT_ID, dan
# nilainya BERBEZA antara QA dan produksi. Ia hidup dalam Info.plist melalui
# $(MM_GOOGLE_REVERSED_CLIENT_ID), jadi ia boleh menyimpang daripada plist yang
# sebenarnya dibundel. Nilai yang menyimpang bermakna log masuk Google senyap
# gagal, atau lebih teruk, menunjuk ke persekitaran yang salah.
PLIST_REVERSED="$(plist_value REVERSED_CLIENT_ID "${SOURCE_PLIST}")"

if [ -z "${MM_GOOGLE_REVERSED_CLIENT_ID:-}" ]; then
  echo "error: MM_GOOGLE_REVERSED_CLIENT_ID tidak ditetapkan untuk flavour '${MM_FLAVOR}'." >&2
  echo "note: salin REVERSED_CLIENT_ID dari ${SOURCE_PLIST} ke ios/Flutter/*-${MM_FLAVOR}.xcconfig. Tanpanya, log masuk Google iOS akan gagal semasa jalanan." >&2
  exit 1
fi

if [ "${MM_GOOGLE_REVERSED_CLIENT_ID}" != "${PLIST_REVERSED}" ]; then
  echo "error: MM_GOOGLE_REVERSED_CLIENT_ID tidak sepadan REVERSED_CLIENT_ID dalam plist flavour '${MM_FLAVOR}'." >&2
  echo "note: skim URL panggil-balik mesti datang dari plist yang SAMA yang dibundel." >&2
  exit 1
fi


# ---------------------------------------------------------------------------
# PENJAJARAN FLAVOUR NATIF LWN DART
# ---------------------------------------------------------------------------
# Flavour NATIF (bundle id, plist ini, MM_FLAVOR) datang dari konfigurasi binaan
# Xcode. Flavour DART (`appFlavor`, yang memacu gerbang pengasingan QA) datang
# dari String.fromEnvironment('FLUTTER_APP_FLAVOR'), yang ditetapkan oleh alat
# Flutter.
#
# Itu dua mekanisme. Membina dari butang Run Xcode menjalankan xcode_backend.sh
# terhadap Generated.xcconfig yang ditulis oleh perintah `flutter` TERAKHIR.
# Jika perintah itu bukan --flavor qa, binaan mendapat bundle QA dan plist QA
# sementara lapisan Dart menyangka ia produksi — lalu memuatkan pilihan
# Firebase PRODUKSI ke dalam aplikasi bertanda QA.
#
# PENGEKODAN, disahkan dalam sumber SDK Flutter yang dipasang dan bukan diteka:
#   flutter_tools/lib/src/build_info.dart
#     kAppFlavor = 'FLUTTER_APP_FLAVOR'
#     _defineEncoder = utf8.encoder.fuse(base64.encoder)
#     encodeDartDefines() -> defines.map(encode).join(',')
#     toEnvironmentConfig() -> { 'DART_DEFINES': encodeDartDefines(...) }
#   flutter_tools/lib/src/ios/xcode_build_settings.dart
#     setiap entri toEnvironmentConfig ditulis sebagai tetapan binaan Xcode
#
# Jadi DART_DEFINES ialah senarai dipisah-koma, setiap entri base64 bagi
# "KUNCI=NILAI" UTF-8, dan ia sampai ke sini sebagai pemboleh ubah persekitaran.

b64_decode() {
  # GNU coreutils guna -d; base64 BSD/macOS yang lebih lama guna -D.
  printf '%s' "$1" | base64 -d 2>/dev/null || printf '%s' "$1" | base64 -D 2>/dev/null || true
}

DART_FLAVOR=""
if [ -n "${DART_DEFINES:-}" ]; then
  OLD_IFS="${IFS}"
  IFS=','
  for entry in ${DART_DEFINES}; do
    decoded="$(b64_decode "${entry}")"
    case "${decoded}" in
      FLUTTER_APP_FLAVOR=*) DART_FLAVOR="${decoded#FLUTTER_APP_FLAVOR=}" ;;
    esac
  done
  IFS="${OLD_IFS}"
fi

if [ -z "${DART_FLAVOR}" ]; then
  echo "error: binaan natif ialah flavour '${MM_FLAVOR}', tetapi lapisan Dart tiada flavour." >&2
  echo "note: Generated.xcconfig basi atau dibina tanpa --flavor. Aplikasi akan memuatkan konfigurasi Firebase yang SALAH." >&2
  echo "note: bina melalui \`flutter build ios --flavor ${MM_FLAVOR}\` atau \`flutter run --flavor ${MM_FLAVOR}\`, bukan butang Run Xcode." >&2
  exit 1
fi

if [ "${DART_FLAVOR}" != "${MM_FLAVOR}" ]; then
  echo "error: flavour natif '${MM_FLAVOR}' tidak sepadan flavour Dart '${DART_FLAVOR}'." >&2
  echo "note: bundle dan plist akan menjadi ${MM_FLAVOR} sementara kod Dart berkelakuan sebagai ${DART_FLAVOR}. Binaan DISEKAT." >&2
  exit 1
fi

echo "note: flavour Dart, PROJECT_ID, BUNDLE_ID dan REVERSED_CLIENT_ID disahkan untuk flavour '${MM_FLAVOR}'."

# Sahkan DAHULU, salin kemudian: plist yang salah tidak sepatutnya pernah masuk
# ke dalam bundle, walaupun binaan kemudiannya gagal.
# FULL_PRODUCT_NAME sudah termasuk sambungan .app dan menghormati
# WRAPPER_EXTENSION; ${PRODUCT_NAME}.app meneka nama itu.
APP_DIR="${BUILT_PRODUCTS_DIR}/${FULL_PRODUCT_NAME:-${PRODUCT_NAME}.app}"
DEST="${APP_DIR}/GoogleService-Info.plist"
mkdir -p "$(dirname "${DEST}")"
cp "${SOURCE_PLIST}" "${DEST}"
echo "note: GoogleService-Info.plist flavour '${MM_FLAVOR}' disalin."
