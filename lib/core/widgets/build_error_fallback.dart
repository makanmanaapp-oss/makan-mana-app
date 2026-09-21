import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import '../../app/localization/app_localizations.dart';

/// Builder [ErrorWidget] untuk binaan keluaran/profil SAHAJA.
///
/// Dipasang dalam `main.dart` apabila `!kDebugMode`. Debug kekal dengan skrin
/// merah Flutter supaya pembangun nampak pengecualian penuh.
///
/// [details] SENGAJA diabaikan: butiran pengecualian (uid, laluan dokumen,
/// kod ralat pelayan) tidak boleh sampai kepada pengguna. Ralat itu sudah
/// dilaporkan melalui `FlutterError.onError` (Crashlytics) SEBELUM builder
/// ini dipanggil, jadi tiada pelaporan hilang.
Widget releaseErrorWidgetBuilder(FlutterErrorDetails details) =>
    const BuildErrorFallback();

/// Pengganti `RenderErrorBox` dalam keluaran.
///
/// Tanpa ini, pengecualian build dilukis sebagai segi empat kelabu
/// `Color(0xF0C0C0C0)` tanpa mesej - itulah tab Grup yang "hilang" pada app
/// produksi 0.1.8 (13).
///
/// Ini JARING KESELAMATAN, bukan pengendalian ralat. Kegagalan yang dijangka
/// (bacaan ditolak, rangkaian) mesti dikendalikan di tempatnya dengan keadaan
/// ralat + Cuba Lagi yang memang boleh memulihkan bahagian itu. Tiada Cuba
/// Lagi di sini: widget ini tidak tahu apa yang perlu dicuba semula, dan
/// membina semula pokok yang sama hanya akan gagal semula.
///
/// MENGAPA OBJEK RENDER DAUN, BUKAN WIDGET KOMPOSIT. Jika fallback ini
/// sendiri gagal semasa build, Flutter memanggil ErrorWidget.builder SEKALI
/// LAGI untuk kegagalan itu - yang memulangkan fallback ini lagi, yang gagal
/// lagi. Itu rekursi tanpa henti: app membeku, lebih teruk daripada kotak
/// kelabu. Versi komposit awal (Text/Icon/Column) dibuktikan tergantung
/// sebaik pengawal Directionality dibuang. Seperti RenderErrorBox Flutter,
/// widget ini tiada anak widget langsung, dan createRenderObject hanya
/// menggunakan bacaan `maybeOf` yang tidak boleh melontar.
class BuildErrorFallback extends LeafRenderObjectWidget {
  const BuildErrorFallback({super.key});

  /// Bila ralat berlaku di atas MaterialApp tiada AppLocalizations. Bahasa
  /// Melayu ialah bahasa lalai app.
  static const fallbackMessage = 'Bahagian ini tidak dapat dimuatkan sekarang.';

  static String _message(BuildContext context) =>
      Localizations.of<AppLocalizations>(context, AppLocalizations)
          ?.t('sectionLoadFailed') ??
      fallbackMessage;

  @override
  RenderBuildErrorFallback createRenderObject(BuildContext context) =>
      RenderBuildErrorFallback(
        message: _message(context),
        // Theme.of tidak melontar: tanpa Theme ia memulangkan ThemeData lalai.
        color: Theme.of(context).colorScheme.onSurfaceVariant,
        textDirection: Directionality.maybeOf(context) ?? TextDirection.ltr,
        textScaler:
            MediaQuery.maybeTextScalerOf(context) ?? TextScaler.noScaling,
      );

  @override
  void updateRenderObject(
      BuildContext context, RenderBuildErrorFallback renderObject) {
    renderObject
      ..message = _message(context)
      ..color = Theme.of(context).colorScheme.onSurfaceVariant
      ..textDirection = Directionality.maybeOf(context) ?? TextDirection.ltr
      ..textScaler =
          MediaQuery.maybeTextScalerOf(context) ?? TextScaler.noScaling;
  }
}

/// Melukis ikon + mesej tanpa sebarang anak.
///
/// Saiz: memenuhi paksi yang TERBATAS (mengambil ruang widget yang gagal,
/// seperti RenderErrorBox) dan menggunakan saiz semula jadi pada paksi TAK
/// TERBATAS - jadi ia tidak pernah menjadi tak terhingga dalam Column/ListView.
/// Kandungan dikecilkan untuk muat slot kecil, dan sentiasa dipotong pada
/// batasnya.
class RenderBuildErrorFallback extends RenderBox {
  RenderBuildErrorFallback({
    required String message,
    required Color color,
    required TextDirection textDirection,
    required TextScaler textScaler,
  })  : _message = message,
        _color = color,
        _textDirection = textDirection,
        _textScaler = textScaler;

  static const double _pad = 12;
  static const double _gap = 6;
  static const double _iconSize = 22;
  static const double _fontSize = 13;

  String _message;
  String get message => _message;
  set message(String v) {
    if (v == _message) return;
    _message = v;
    markNeedsLayout();
    markNeedsSemanticsUpdate();
  }

  Color _color;
  set color(Color v) {
    if (v == _color) return;
    _color = v;
    markNeedsLayout();
  }

  TextDirection _textDirection;
  set textDirection(TextDirection v) {
    if (v == _textDirection) return;
    _textDirection = v;
    markNeedsLayout();
    markNeedsSemanticsUpdate();
  }

  TextScaler _textScaler;
  set textScaler(TextScaler v) {
    if (v == _textScaler) return;
    _textScaler = v;
    markNeedsLayout();
  }

  final TextPainter _icon = TextPainter();
  final TextPainter _text = TextPainter(textAlign: TextAlign.center);

  /// Susun atur kandungan pada lebar dalaman [innerWidth]; pulangkan saiz
  /// semula jadi keseluruhan (termasuk padding).
  Size _layoutContent(double innerWidth) {
    const glyph = Icons.error_outline;
    _icon
      ..textDirection = _textDirection
      ..text = TextSpan(
        text: String.fromCharCode(glyph.codePoint),
        style: TextStyle(
          fontFamily: glyph.fontFamily,
          package: glyph.fontPackage,
          fontSize: _iconSize,
          color: _color,
        ),
      )
      ..layout();
    _text
      ..textDirection = _textDirection
      ..textScaler = _textScaler
      ..text = TextSpan(
        text: _message,
        style: TextStyle(
          fontSize: _fontSize,
          height: 1.3,
          color: _color,
          fontWeight: FontWeight.w500,
        ),
      )
      ..layout(maxWidth: innerWidth);
    return Size(
      math.max(_icon.width, _text.width) + _pad * 2,
      _icon.height + _gap + _text.height + _pad * 2,
    );
  }

  double _innerWidthFor(double outerMaxWidth) => outerMaxWidth.isFinite
      ? math.max(0, outerMaxWidth - _pad * 2)
      : double.infinity;

  Size _sizeFor(BoxConstraints constraints) {
    final natural = _layoutContent(_innerWidthFor(constraints.maxWidth));
    return constraints.constrain(Size(
      constraints.hasBoundedWidth ? constraints.maxWidth : natural.width,
      constraints.hasBoundedHeight ? constraints.maxHeight : natural.height,
    ));
  }

  @override
  Size computeDryLayout(covariant BoxConstraints constraints) =>
      _sizeFor(constraints);

  @override
  void performLayout() {
    size = _sizeFor(constraints);
  }

  @override
  double computeMinIntrinsicWidth(double height) => 0;

  @override
  double computeMaxIntrinsicWidth(double height) =>
      _layoutContent(double.infinity).width;

  @override
  double computeMinIntrinsicHeight(double width) =>
      _layoutContent(_innerWidthFor(width)).height;

  @override
  double computeMaxIntrinsicHeight(double width) =>
      computeMinIntrinsicHeight(width);

  /// Slot kecil (cth. ikon AppBar 48x48): teks akan dibalut satu perkataan
  /// setiap baris dan dikecilkan sehingga tidak boleh dibaca - dibuktikan pada
  /// peranti. Di sini hanya ikon dilukis; mesej penuh kekal pada label
  /// semantik untuk pembaca skrin.
  @visibleForTesting
  bool get isCompact => size.width < 120 || size.height < 64;

  @override
  void paint(PaintingContext context, Offset offset) {
    if (size.isEmpty) return;
    if (isCompact) {
      _layoutContent(double.infinity);
      final s = math.min(1.0,
          math.min(size.width / _icon.width, size.height / _icon.height));
      final c = context.canvas
        ..save()
        ..clipRect(offset & size)
        ..translate(offset.dx + (size.width - _icon.width * s) / 2,
            offset.dy + (size.height - _icon.height * s) / 2)
        ..scale(s);
      _icon.paint(c, Offset.zero);
      c.restore();
      return;
    }
    final natural = _layoutContent(_innerWidthFor(size.width));
    final scale = math.min(
      1.0,
      math.min(size.width / natural.width, size.height / natural.height),
    );
    final canvas = context.canvas
      ..save()
      ..clipRect(offset & size)
      ..translate(
        offset.dx + (size.width - natural.width * scale) / 2,
        offset.dy + (size.height - natural.height * scale) / 2,
      )
      ..scale(scale);
    _icon.paint(canvas, Offset((natural.width - _icon.width) / 2, _pad));
    _text.paint(
      canvas,
      Offset((natural.width - _text.width) / 2, _pad + _icon.height + _gap),
    );
    canvas.restore();
  }

  @override
  void describeSemanticsConfiguration(SemanticsConfiguration config) {
    super.describeSemanticsConfiguration(config);
    config
      ..isSemanticBoundary = true
      ..label = _message
      ..textDirection = _textDirection;
  }

  @override
  void dispose() {
    _icon.dispose();
    _text.dispose();
    super.dispose();
  }
}
