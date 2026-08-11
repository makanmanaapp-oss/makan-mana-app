import 'package:flutter/material.dart';

import '../constants/app_colors.dart';
import 'mm_icons.dart';

/// Widget keadaan boleh guna semula (Prompt 13): loading/empty/error/locked.
/// Elak skrin putih kosong / spinner tanpa konteks pada skrin async.

class AppLoadingState extends StatelessWidget {
  const AppLoadingState({super.key, this.message});

  final String? message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          if (message != null) ...[
            const SizedBox(height: 14),
            Text(
              message!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.mutedText, fontSize: 13),
            ),
          ],
        ],
      ),
    );
  }
}

class AppEmptyState extends StatelessWidget {
  const AppEmptyState({
    super.key,
    this.emoji = '',
    this.icon,
    required this.title,
    this.message,
    this.ctaLabel,
    this.onCta,
  });

  /// Warisan lama — TIDAK lagi dipapar (spec Bright Mode: tiada emoji).
  final String emoji;

  /// Ikon proprietary pilihan; lalai ikon kotak masuk neutral.
  final MmIconType? icon;
  final String title;
  final String? message;
  final String? ctaLabel;
  final VoidCallback? onCta;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null)
              MmIcon(icon!, size: 44, color: AppColors.fadedText)
            else
              const Icon(Icons.inbox_outlined,
                  size: 44, color: AppColors.fadedText),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
            ),
            if (message != null) ...[
              const SizedBox(height: 8),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 13, color: AppColors.mutedText, height: 1.4),
              ),
            ],
            if (ctaLabel != null && onCta != null) ...[
              const SizedBox(height: 18),
              ElevatedButton(onPressed: onCta, child: Text(ctaLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

class AppErrorState extends StatelessWidget {
  const AppErrorState({
    super.key,
    required this.message,
    required this.retryLabel,
    required this.onRetry,
  });

  final String message;
  final String retryLabel;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline,
                size: 40, color: AppColors.mutedText),
            const SizedBox(height: 10),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14)),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: 18),
              label: Text(retryLabel),
            ),
          ],
        ),
      ),
    );
  }
}

/// Keadaan preview terkunci (Free/Plus) dengan CTA Unlock Pro.
class AppLockedPreviewState extends StatelessWidget {
  const AppLockedPreviewState({
    super.key,
    required this.title,
    required this.message,
    required this.ctaLabel,
    required this.onUnlock,
    this.emoji = '',
  });

  final String title;
  final String message;
  final String ctaLabel;
  final VoidCallback onUnlock;
  final String emoji;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              height: 56,
              width: 56,
              decoration: BoxDecoration(
                color: AppColors.warmYellow.withValues(alpha: 0.25),
                borderRadius: BorderRadius.circular(18),
              ),
              child: const Center(
                  child: MmIcon(MmIconType.proSeal,
                      size: 28, color: AppColors.darkText)),
            ),
            const SizedBox(height: 14),
            Text(title,
                textAlign: TextAlign.center,
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 13, color: AppColors.mutedText, height: 1.4),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(onPressed: onUnlock, child: Text(ctaLabel)),
            ),
          ],
        ),
      ),
    );
  }
}
