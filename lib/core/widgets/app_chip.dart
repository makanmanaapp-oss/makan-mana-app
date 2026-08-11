import 'package:flutter/material.dart';

import '../../app/theme.dart';
import '../constants/app_colors.dart';
import 'mm_icons.dart';

/// Chip pilihan standard MakanMana (mood, alahan, masakan, dll).
/// BRIGHT MODE spec: tinggi 40px; tidak dipilih = permukaan putih/neutral
/// berbucu; dipilih = kuning dengan TEKS & IKON GELAP (wajib). Guna [icon]
/// (keluarga MmIcon proprietary) untuk UI sistem — [emoji] kekal untuk
/// kandungan kategori lama sahaja.
class AppChip extends StatelessWidget {
  const AppChip({
    super.key,
    required this.label,
    this.icon,
    this.emoji,
    this.selected = false,
    this.locked = false,
    this.badge,
    this.onTap,
  });

  final String label;
  final MmIconType? icon;
  final String? emoji;
  final bool selected;
  final bool locked;
  final String? badge;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    // Kuning dipilih WAJIB teks/ikon gelap (peraturan kontras spec).
    final fg = selected ? AppColors.darkText : mm.chipText;
    final iconColor = selected ? AppColors.darkText : mm.iconMuted;
    return GestureDetector(
      onTap: onTap,
      // QA akhir: TINGGI MINIMUM (bukan tegar) + label Flexible boleh balut
      // 2 baris — label terjemahan panjang (cth. Tamil) pada skala teks 1.30
      // dulunya melimpah keluar Row (RenderFlex overflow).
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        constraints: const BoxConstraints(minHeight: 40),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppColors.selectedYellow : mm.chipBackground,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected ? AppColors.warmYellow : mm.border,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              MmIcon(icon!, size: 20, color: iconColor, accent: iconColor),
              const SizedBox(width: 6),
            ] else if (emoji != null && emoji!.isNotEmpty) ...[
              Text(emoji!, style: const TextStyle(fontSize: 16)),
              const SizedBox(width: 6),
            ],
            Flexible(
              child: Text(
                label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: FontWeight.w600, color: fg),
              ),
            ),
            if (locked) ...[
              const SizedBox(width: 6),
              Icon(Icons.lock, size: 14, color: mm.iconMuted),
            ],
            if (badge != null) ...[
              const SizedBox(width: 6),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.primaryRed,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  badge!,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
