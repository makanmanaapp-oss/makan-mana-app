import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/history/history_screen.dart';

Widget _host({
  required VoidCallback onPrevious,
  required VoidCallback onNext,
}) =>
    MaterialApp(
      home: HistoryEdgeSwipeHandoff(
        onPreviousBranch: onPrevious,
        onNextBranch: onNext,
        child: const ColoredBox(color: Colors.white),
      ),
    );

void main() {
  testWidgets('hands off only edge swipes to adjacent shell branches',
      (tester) async {
    var previous = 0;
    var next = 0;
    await tester.pumpWidget(_host(
      onPrevious: () => previous++,
      onNext: () => next++,
    ));

    // The normal History content area stays available to its TabBarView.
    await tester.dragFrom(const Offset(200, 300), const Offset(-140, 0));
    expect(previous, 0);
    expect(next, 0);

    // Right edge, dragging left: History -> Profile.
    await tester.dragFrom(const Offset(795, 300), const Offset(-140, 0));
    expect(next, 1);
    expect(previous, 0);

    // Left edge, dragging right: History -> Explore.
    await tester.dragFrom(const Offset(5, 300), const Offset(140, 0));
    expect(previous, 1);
    expect(next, 1);
  });
}
