import 'package:flutter/material.dart';

import '../../app/theme.dart';

/// Skrin placeholder untuk laluan masa depan (/nutrition, /social, /group).
/// BRIGHT MODE spec: ikon universal, bukan emoji sistem.
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({
    super.key,
    required this.title,
    this.emoji = '',
    this.message = 'Akan datang!',
  });

  final String title;

  /// Warisan lama — tidak lagi dipapar.
  final String emoji;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.construction_outlined,
                size: 64, color: context.mm.iconMuted),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                color: context.mm.onCardMuted,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
