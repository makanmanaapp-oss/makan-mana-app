import 'package:flutter/material.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';

/// PROMPT 11: halaman legal in-app (WAJIB sebelum public beta — tiada
/// "akan datang" untuk kandungan legal). Kandungan Bahasa Melayu
/// (pasaran utama); terjemahan penuh EN/ZH/TA selepas beta.
/// URL polisi awam (Play Store) akan menghoskan kandungan yang sama.

class _LegalPage extends StatelessWidget {
  const _LegalPage({required this.title, required this.sections});

  final String title;
  final List<(String, String)> sections; // (tajuk, isi)

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          // ISSUE 001.3: kandungan legal hanya wujud dalam BM buat masa ini.
          // Locale lain diberi notis jelas dalam bahasa UI mereka.
          if (Localizations.localeOf(context).languageCode != 'ms')
            Container(
              margin: const EdgeInsets.only(top: 4, bottom: 6),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.softYellow,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                AppLocalizations.of(context).t('legalMalayOnlyNotice'),
                style: const TextStyle(
                  fontSize: 13,
                  height: 1.45,
                  fontWeight: FontWeight.w700,
                  color: AppColors.darkText,
                ),
              ),
            ),
          for (final s in sections) ...[
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
              ),
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

/// /terms — Terma Penggunaan.
class TermsScreen extends StatelessWidget {
  const TermsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _LegalPage(
      title: AppLocalizations.of(context).t('termsLabel'),
      sections: [
        (
          '',
          'Dengan menggunakan MakanMana, anda bersetuju dengan terma di '
              'bawah. Jika anda tidak bersetuju, sila berhenti menggunakan '
              'aplikasi ini. Terma ini terpakai untuk versi beta awam.'
        ),
        (
          '1. Akaun',
          'Anda bertanggungjawab ke atas keselamatan akaun anda '
              '(email/Google/nombor telefon). Satu akaun untuk kegunaan '
              'peribadi. Kami boleh menggantung akaun yang melanggar terma '
              'atau garis panduan komuniti.'
        ),
        (
          '2. Cadangan AI — penafian',
          'Cadangan makanan MakanMana dijana secara automatik berdasarkan '
              'keutamaan dan lokasi anda. Ia adalah CADANGAN sahaja dan '
              'mungkin tidak tepat. Sentiasa semak sendiri (contoh: status '
              'halal, alahan, harga) sebelum membuat keputusan.'
        ),
        (
          '3. Nutrisi & kecergasan — bukan nasihat perubatan',
          'Ciri Fit Coach, kalori, makro dan skor kesihatan adalah '
              'anggaran automatik untuk rujukan gaya hidup sahaja. Ia BUKAN '
              'nasihat perubatan, diagnosis atau rawatan. Rujuk profesional '
              'kesihatan untuk keperluan perubatan atau diet khusus.'
        ),
        (
          '4. Data restoran — mungkin tidak tepat',
          'Maklumat kedai (waktu buka, harga, lokasi, rating) datang dari '
              'sumber pihak ketiga dan komuniti; ia mungkin lapuk atau '
              'tidak tepat. Sahkan dengan kedai sebelum bergerak.'
        ),
        (
          '5. Tong-Tong — bukan gerbang pembayaran',
          'Tong-Tong Bill hanya KALKULATOR pembahagian bil dan penjejak '
              'status "siapa dah bayar". MakanMana TIDAK memproses, '
              'memegang atau memindahkan wang antara pengguna. Sebarang '
              'pembayaran sebenar berlaku di luar aplikasi atas '
              'tanggungjawab anda sendiri.'
        ),
        (
          '6. Kandungan pengguna (UGC)',
          'Anda memiliki kandungan yang anda siarkan (post, gambar, ulasan, '
              'mesej) dan memberi MakanMana lesen untuk memaparkannya dalam '
              'aplikasi. Anda bertanggungjawab ke atas kandungan anda. '
              'Kandungan yang melanggar Garis Panduan Komuniti boleh '
              'dipadam dan akaun boleh digantung.'
        ),
        (
          '7. Langganan',
          'Pelan Plus (RM9.99/bulan) dan Pro (RM29.90/bulan) akan '
              'diproses melalui Google Play Billing apabila diaktifkan. '
              'Semasa beta, pembayaran belum diaktifkan — tiada caj dibuat.'
        ),
        (
          '8. Had tanggungan',
          'MakanMana disediakan "seadanya" semasa beta. Setakat yang '
              'dibenarkan undang-undang Malaysia, kami tidak '
              'bertanggungjawab atas kerugian tidak langsung akibat '
              'penggunaan aplikasi, termasuk keputusan makan, kesihatan '
              'atau kewangan berdasarkan maklumat dalam aplikasi.'
        ),
        (
          '9. Perubahan terma',
          'Terma boleh dikemas kini dari semasa ke semasa. Penggunaan '
              'berterusan selepas kemas kini bermakna anda menerima terma '
              'baharu. Versi ini: Julai 2026 (beta).'
        ),
      ],
    );
  }
}

/// /guidelines — Garis Panduan Komuniti.
class CommunityGuidelinesScreen extends StatelessWidget {
  const CommunityGuidelinesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _LegalPage(
      title: AppLocalizations.of(context).t('guidelinesLabel'),
      sections: [
        (
          '',
          'Feed Makan, komen, grup dan DM adalah ruang komuniti untuk '
              'berkongsi makanan. Peraturan mudah: hormat orang lain.'
        ),
        (
          'Dibenarkan',
          '• Kongsi makan, resipi, check-in kedai dan ulasan jujur.\n'
              '• Kritik makanan/kedai secara berhemah.\n'
              '• Gambar makanan dan suasana kedai.'
        ),
        (
          'Dilarang',
          '• Kebencian, buli, ancaman atau gangguan.\n'
              '• Kandungan lucah, keganasan atau menyalahi undang-undang.\n'
              '• Spam, scam, iklan menyeleweng atau pautan berbahaya.\n'
              '• Menyamar sebagai orang lain.\n'
              '• Mendedahkan maklumat peribadi orang lain tanpa izin.'
        ),
        (
          'Lapor & sekat',
          'Gunakan menu ⋯ pada post untuk melaporkan kandungan, dan '
              'fungsi sekat (block) untuk menghentikan interaksi dengan '
              'pengguna lain. Laporan disemak dan kandungan yang melanggar '
              'akan dipadam; pelanggaran berulang = akaun digantung.'
        ),
        (
          'Privasi anda',
          'Profil awam TIDAK memaparkan alahan, data kesihatan, lokasi '
              'tepat atau bukti pembayaran anda. Post "Peribadi" hanya '
              'untuk anda; post grup hanya untuk ahli grup.'
        ),
      ],
    );
  }
}

/// /support — Sokongan & hubungi kami.
class SupportScreen extends StatelessWidget {
  const SupportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _LegalPage(
      title: AppLocalizations.of(context).t('supportLabel'),
      sections: [
        (
          'Hubungi kami',
          'Email: makanmana.app@gmail.com\n\n'
              'Sertakan email/nombor akaun anda dan tangkapan skrin jika '
              'melaporkan masalah. Kami balas secepat mungkin (beta: '
              'dalam beberapa hari bekerja).'
        ),
        (
          'Soalan lazim',
          'Lihat halaman Bantuan dalam Profil untuk FAQ (cara rating, '
              'beza pelan, keselamatan data, batal langganan).'
        ),
        (
          'Padam akaun',
          'Pergi ke Tetapan → Akaun → Padam Akaun untuk menghantar '
              'permintaan pemadaman. Data sosial/kumpulan akan diproses '
              'secara selamat dan permintaan disemak oleh pasukan kami. '
              'Anda juga boleh email kami secara terus.'
        ),
        (
          'Kebenaran aplikasi',
          '• Lokasi: untuk cadangan kedai berdekatan sahaja — tidak '
              'dipaparkan kepada pengguna lain.\n'
              '• Kamera/galeri: untuk muat naik gambar makanan/resit yang '
              'anda pilih sahaja.\n'
              '• Notifikasi: peringatan makan dan aktiviti sosial (boleh '
              'dimatikan di tetapan telefon).'
        ),
      ],
    );
  }
}
