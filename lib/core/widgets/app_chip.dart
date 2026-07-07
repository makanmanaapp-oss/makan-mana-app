import 'package:flutter/material.dart';

import '../constants/app_colors.dart';

/// Chip pilihan standard MakanMana (mood, alahan, masakan, dll).
class AppChip extends StatelessWidget {
  const AppChip({
    super.key,
    required this.label,
    this.emoji,
    this.selected = false,
    this.locked = false,
    this.badge,
    this.onTap,
  });

  final String label;
  final String? emoji;
  final bool selected;
  final bool locked;
  final String? badge;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppColors.softYellow : AppColors.cardWhite,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: selected ? AppColors.warmYellow : AppColors.softBorder,
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (emoji != null) ...[
              Text(emoji!, style: const TextStyle(fontSize: 16)),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                color: AppColors.darkText,
              ),
            ),
            if (locked) ...[
              const SizedBox(width: 6),
              const Icon(Icons.lock, size: 14, color: AppColors.mutedText),
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
