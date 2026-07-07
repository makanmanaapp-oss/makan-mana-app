import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// Visual kedai profesional: foto sebenar Google Places jika ada,
/// fallback monogram gradient (gaya merchant placeholder Grab/UberEats).
/// Menggantikan emoji supaya app nampak matang, bukan "AI-made".
class PlaceImage extends StatelessWidget {
  const PlaceImage({
    super.key,
    required this.name,
    this.photoUrl,
    this.width,
    this.height,
    this.borderRadius = 16,
    this.monogramFontSize,
  });

  final String name;
  final String? photoUrl;
  final double? width;
  final double? height;
  final double borderRadius;
  final double? monogramFontSize;

  /// Palet gradient kurasi - warna korporat matang, dipilih stabil
  /// ikut hash nama supaya kedai sama sentiasa warna sama.
  static const List<List<Color>> _gradients = [
    [Color(0xFFB91C1C), Color(0xFFE7352C)], // sambal merah
    [Color(0xFF9A3412), Color(0xFFEA580C)], // oren rempah
    [Color(0xFF92400E), Color(0xFFD97706)], // kunyit
    [Color(0xFF166534), Color(0xFF16A34A)], // pandan
    [Color(0xFF155E75), Color(0xFF0891B2)], // teal
    [Color(0xFF3730A3), Color(0xFF6366F1)], // indigo
    [Color(0xFF701A75), Color(0xFFA21CAF)], // ungu manggis
    [Color(0xFF1F2937), Color(0xFF4B5563)], // arang
  ];

  String get _initials {
    final words = name
        .replaceAll(RegExp(r'[^\w\s]'), '')
        .trim()
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .toList();
    if (words.isEmpty) return 'M';
    if (words.length == 1) {
      return words.first.substring(0, 1).toUpperCase();
    }
    return (words[0].substring(0, 1) + words[1].substring(0, 1))
        .toUpperCase();
  }

  Widget _monogram(BoxConstraints constraints) {
    final colors = _gradients[name.hashCode.abs() % _gradients.length];
    final h = height ?? constraints.maxHeight;
    final fontSize = monogramFontSize ??
        ((h.isFinite ? h : 96) * 0.32).clamp(14.0, 44.0);
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: colors,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Stack(
        children: [
          // Corak lengkung halus supaya tidak nampak kosong.
          Positioned(
            right: -20,
            bottom: -26,
            child: Container(
              height: 110,
              width: 110,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.07),
              ),
            ),
          ),
          Positioned(
            left: -30,
            top: -34,
            child: Container(
              height: 90,
              width: 90,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.05),
              ),
            ),
          ),
          Center(
            child: Text(
              _initials,
              style: TextStyle(
                fontSize: fontSize,
                fontWeight: FontWeight.w800,
                letterSpacing: 1,
                color: Colors.white.withValues(alpha: 0.95),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: LayoutBuilder(
        builder: (layoutContext, constraints) {
          final url = photoUrl;
          if (url == null || url.isEmpty) return _monogram(constraints);
          return CachedNetworkImage(
            imageUrl: url,
            width: width,
            height: height,
            fit: BoxFit.cover,
            fadeInDuration: const Duration(milliseconds: 200),
            placeholder: (c, u) => _monogram(constraints),
            errorWidget: (c, u, e) => _monogram(constraints),
          );
        },
      ),
    );
  }
}
