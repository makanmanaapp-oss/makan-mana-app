import 'package:flutter/material.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';

class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.t('privacyLabel'))),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: const [
          Text(
            'Privasi MakanMana',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.darkText,
            ),
          ),
          SizedBox(height: 14),
          Text(
            'MakanMana menggunakan data akaun, lokasi, keutamaan makanan, '
            'dan corak pilihan anda untuk memberikan cadangan makanan yang '
            'lebih tepat. Data anda tidak dijual kepada pihak ketiga.\n\n'
            'Butiran penuh polisi privasi akan tersedia di URL polisi rasmi '
            'sebelum pelancaran Play Store.',
            style: TextStyle(fontSize: 15, height: 1.5),
          ),
        ],
      ),
    );
  }
}
