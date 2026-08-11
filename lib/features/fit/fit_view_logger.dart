import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// Pembalut ringan (Prompt 12): log satu event paparan skrin sekali sahaja
/// bila skrin dibina, tanpa menyentuh logik skrin sebenar. Non-blocking.
class FitViewLogger extends ConsumerStatefulWidget {
  const FitViewLogger({
    super.key,
    required this.eventType,
    required this.sourceScreen,
    required this.child,
    this.metadata,
  });

  final String eventType;
  final String sourceScreen;
  final Widget child;
  final Map<String, dynamic> Function(WidgetRef ref)? metadata;

  @override
  ConsumerState<FitViewLogger> createState() => _FitViewLoggerState();
}

class _FitViewLoggerState extends ConsumerState<FitViewLogger> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(eventLoggerProvider).logEvent(
            widget.eventType,
            sourceScreen: widget.sourceScreen,
            metadata: widget.metadata?.call(ref),
          );
    });
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
