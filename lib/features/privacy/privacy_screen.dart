import 'package:flutter/material.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';

/// PROMPT 11: Polisi Privasi penuh in-app (kandungan BM — pasaran
/// utama; terjemahan selepas beta). Kandungan sama akan dihoskan di
/// URL polisi awam untuk Play Store.
class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  static const _sections = <(String, String)>[
    (
      '',
      'Polisi ini menerangkan data yang MakanMana kumpul, kenapa, dan '
          'hak anda. Versi: Julai 2026 (beta awam). Data anda TIDAK '
          'dijual kepada pihak ketiga.'
    ),
    (
      '1. Data yang kami kumpul',
      '• Akaun: email / nombor telefon / profil Google (nama, gambar), '
          'nama paparan dan avatar.\n'
          '• Keutamaan makanan: diet, halal, alahan, bajet, masakan '
          'kegemaran, tahap pedas, waktu makan.\n'
          '• Aktiviti aplikasi: spin, terima/tolak cadangan, sejarah '
          'makan, log belanja, log kecergasan yang anda masukkan.\n'
          '• Lokasi (dengan kebenaran): untuk cari kedai berdekatan.\n'
          '• Kandungan sosial: post, gambar, komen, mesej DM, grup dan '
          'bil Tong-Tong yang anda cipta.'
    ),
    (
      '2. Kegunaan data',
      'Data digunakan untuk memberi cadangan makanan yang lebih tepat, '
          'menjana skor/laporan kecergasan anda, menjalankan ciri sosial, '
          'dan menambah baik aplikasi (analitik agregat). Kami TIDAK '
          'menjual data anda dan TIDAK menyiarkan data sensitif anda '
          'kepada pengguna lain.'
    ),
    (
      '3. Apa yang pengguna lain nampak',
      'Profil awam hanya memaparkan: nama paparan, @username, avatar, '
          'bio makanan, dan post yang anda tetapkan Awam. TIDAK '
          'dipaparkan: alahan, data kesihatan/badan, lokasi tepat, '
          'bajet peribadi (melainkan anda hidupkan sendiri), resit dan '
          'bukti perbelanjaan.'
    ),
    (
      '4. Storan & keselamatan',
      'Data disimpan di Google Firebase (Firestore, Storage, '
          'Authentication) di rantau Asia Tenggara dengan peraturan '
          'akses ketat (setiap pengguna hanya boleh akses data sendiri; '
          'kandungan sosial ikut tetapan privasi post). Gambar yang anda '
          'muat naik disimpan di Firebase Storage.'
    ),
    (
      '5. Lokasi',
      'Lokasi hanya digunakan semasa mencari kedai berdekatan dan '
          'check-in yang anda lakukan sendiri. Aplikasi berfungsi tanpa '
          'lokasi (guna kawasan lalai). Kebenaran boleh ditarik balik di '
          'tetapan telefon bila-bila masa.'
    ),
    (
      '6. Pihak ketiga',
      '• Google Places: data kedai dan gambar kedai.\n'
          '• Google Play Billing: pemprosesan langganan (bila '
          'diaktifkan) — kami tidak menyimpan maklumat kad anda.\n'
          '• Firebase/Google: infrastruktur, analitik dan log ranap '
          '(crashlytics).\n'
          '• Vertex AI (Google): imbasan kalori gambar — gambar dihantar '
          'untuk analisis apabila anda guna ciri Calorie Scan sahaja.'
    ),
    (
      '7. Pemadaman akaun & data',
      'Anda boleh hantar permintaan pemadaman akaun melalui Tetapan → '
          'Akaun → Padam Akaun, atau email makanmana.app@gmail.com. '
          'Permintaan disemak dan data anda (akaun, profil, keutamaan, '
          'log) akan dipadam; kandungan dalam konteks kumpulan/bil '
          'bersama diproses secara selamat supaya tidak merosakkan data '
          'pengguna lain.'
    ),
    (
      '8. Kanak-kanak',
      'MakanMana tidak ditujukan kepada kanak-kanak bawah 13 tahun dan '
          'kami tidak mengumpul data mereka dengan sengaja.'
    ),
    (
      '9. Hubungi',
      'Soalan privasi: makanmana.app@gmail.com. Polisi boleh dikemas '
          'kini; perubahan besar akan dimaklumkan dalam aplikasi.'
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final mm = context.mm;
    return Scaffold(
      appBar: AppBar(title: Text(l.t('privacyLabel'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          Text(
            l.t('privacyHeading'),
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: mm.onCard,
            ),
          ),
          // ISSUE 001.3: hanya teks Melayu diluluskan secara rasmi. UI bukan
          // Melayu mesti diberitahu secara jelas, bukan diam-diam paparkan BM.
          if (Localizations.localeOf(context).languageCode != 'ms')
            Container(
              margin: const EdgeInsets.only(top: 12),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.softYellow,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                l.t('legalMalayOnlyNotice'),
                style: const TextStyle(
                  fontSize: 13,
                  height: 1.45,
                  fontWeight: FontWeight.w700,
                  color: AppColors.darkText,
                ),
              ),
            ),
          for (final s in _sections) ...[
            if (s.$1.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 14, bottom: 6),
                child: Text(
                  s.$1,
                  style: TextStyle(
                    fontSize: 15.5,
                    fontWeight: FontWeight.w800,
                    color: mm.onCard,
                  ),
                ),
              )
            else
              const SizedBox(height: 12),
            Text(
              s.$2,
              style: TextStyle(
                fontSize: 13.5,
                height: 1.55,
                color: mm.onCardMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
