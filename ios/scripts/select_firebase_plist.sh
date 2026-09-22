#!/bin/sh
# MAKANMANA iOS WAVE 3A — pilih GoogleService-Info.plist mengikut flavour.
#
# Ditambah sebagai Run Script build phase dalam Xcode (MACOS REQUIRED),
# SEBELUM fasa "Copy Bundle Resources".
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

echo "note: BUNDLE_ID dan REVERSED_CLIENT_ID disahkan untuk flavour '${MM_FLAVOR}'."

# Sahkan DAHULU, salin kemudian: plist yang salah tidak sepatutnya pernah masuk
# ke dalam bundle, walaupun binaan kemudiannya gagal.
DEST="${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app/GoogleService-Info.plist"
mkdir -p "$(dirname "${DEST}")"
cp "${SOURCE_PLIST}" "${DEST}"
echo "note: GoogleService-Info.plist flavour '${MM_FLAVOR}' disalin."
