import 'dart:async';

import 'package:flutter/material.dart';

export '../../core/location/malaysia_state_hero_voice.dart';

@immutable
class LocalHeroPhrasePlan {
  const LocalHeroPhrasePlan({
    required this.appLanguagePhrase,
    this.localStatePhrase,
  });

  final String appLanguagePhrase;
  final String? localStatePhrase;

  bool get shouldRotate =>
      localStatePhrase != null &&
      _comparable(appLanguagePhrase) != _comparable(localStatePhrase!);

  List<String> get visiblePhrases => shouldRotate
      ? [appLanguagePhrase, localStatePhrase!]
      : [appLanguagePhrase];

  static String _comparable(String value) =>
      value.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();
}

/// Lapisan teks hero sahaja. Satu Timer dimiliki oleh satu State dan sentiasa
/// dibatalkan semasa disposed/paused; ia tidak membaca provider atau data AI.
class DynamicLocalHero extends StatefulWidget {
  const DynamicLocalHero({
    required this.languageSpan,
    required this.plan,
    required this.style,
    super.key,
  });

  final InlineSpan languageSpan;
  final LocalHeroPhrasePlan plan;
  final TextStyle style;

  @override
  State<DynamicLocalHero> createState() => _DynamicLocalHeroState();
}

class _DynamicLocalHeroState extends State<DynamicLocalHero>
    with WidgetsBindingObserver {
  static const _interval = Duration(seconds: 4);
  Timer? _timer;
  bool _showLocal = false;
  bool _paused = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _syncTimer();
  }

  @override
  void didUpdateWidget(covariant DynamicLocalHero oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.plan.appLanguagePhrase != widget.plan.appLanguagePhrase ||
        oldWidget.plan.localStatePhrase != widget.plan.localStatePhrase) {
      _showLocal = false;
      _syncTimer(restart: true);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final inactive = state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached;
    _paused = inactive;
    if (inactive) {
      _timer?.cancel();
      _timer = null;
    } else if (state == AppLifecycleState.resumed) {
      _syncTimer(restart: true);
    }
  }

  void _syncTimer({bool restart = false}) {
    if (restart) {
      _timer?.cancel();
      _timer = null;
    }
    if (_paused || !widget.plan.shouldRotate || _timer != null) return;
    _timer = Timer.periodic(_interval, (_) {
      if (!mounted || _paused || !widget.plan.shouldRotate) return;
      setState(() => _showLocal = !_showLocal);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Saiz font terbesar (≤ base, hingga lantai boleh-baca) supaya frasa
  /// bahasa-app muat 2 baris PENUH tanpa ellipsis pada lebar sebenar. Kekalkan
  /// makanan/kotak carousel (tiada perubahan saiz hero) — hanya headline yang
  /// mengecil sedikit HANYA jika perlu (mis. 384dp SM-A055F: "Nak makan mana?").
  double _fittedAppFontSize(double maxWidth) {
    final base = widget.style.fontSize ?? 27;
    if (!maxWidth.isFinite || maxWidth <= 0) return base;
    final scaler = MediaQuery.textScalerOf(context);
    // Ukur dengan gaya BERKESAN yang sama seperti Text.rich (gabung
    // DefaultTextStyle — termasuk fontFamily aplikasi yang lebih lebar), jika
    // tidak ukuran guna font lalai sempit & tersilap "muat" pada 27.
    final defaultStyle = DefaultTextStyle.of(context).style;
    const minSize = 20.0; // jangan jadi teks kecil-tak-boleh-baca
    for (double s = base; s > minSize; s -= 1) {
      final tp = TextPainter(
        text: TextSpan(
          style: defaultStyle.merge(widget.style.copyWith(fontSize: s)),
          children: [widget.languageSpan],
        ),
        maxLines: 2,
        textDirection: Directionality.of(context),
        textScaler: scaler,
      )..layout(maxWidth: maxWidth);
      if (!tp.didExceedMaxLines) return s;
    }
    return minSize;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      final showLocal = widget.plan.shouldRotate && _showLocal;
      final phrase = showLocal
          ? widget.plan.localStatePhrase!
          : widget.plan.appLanguagePhrase;
      // Frasa bahasa-app auto-fit; frasa dialek lokal kekal kompak (16) supaya
      // dialek terpanjang muat dua baris.
      final appStyle =
          widget.style.copyWith(fontSize: _fittedAppFontSize(constraints.maxWidth));
      final localStyle = widget.style.copyWith(fontSize: 16);
      // Tinggi kekal pada base supaya tiada lonjakan antara frasa app/dialek.
      final scaledLineHeight =
          MediaQuery.textScalerOf(context).scale(widget.style.fontSize ?? 27) *
              (widget.style.height ?? 1.12);
      final transitionDuration = MediaQuery.disableAnimationsOf(context)
          ? const Duration(milliseconds: 1)
          : const Duration(milliseconds: 360);

      return Semantics(
        // Kekal pada bahasa aplikasi supaya pembaca skrin tidak mengumumkan
        // pertukaran dialek visual setiap empat saat.
        label: widget.plan.appLanguagePhrase,
        child: ExcludeSemantics(
          child: SizedBox(
            height: scaledLineHeight * 2,
            child: AnimatedSwitcher(
              duration: transitionDuration,
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeIn,
              transitionBuilder: (child, animation) => FadeTransition(
                opacity: animation,
                child: SlideTransition(
                  position: Tween<Offset>(
                    begin: const Offset(0, 0.08),
                    end: Offset.zero,
                  ).animate(animation),
                  child: child,
                ),
              ),
              child: Align(
                key: ValueKey<String>(
                    showLocal ? 'local:$phrase' : 'app:$phrase'),
                alignment: Alignment.centerLeft,
                child: showLocal
                    ? Text(
                        phrase,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: localStyle,
                      )
                    : Text.rich(
                        widget.languageSpan,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: appStyle,
                      ),
              ),
            ),
          ),
        ),
      );
    });
  }
}
