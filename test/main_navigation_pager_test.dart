import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/features/shell/app_shell.dart';

class _PagerHarness extends StatefulWidget {
  const _PagerHarness();

  @override
  State<_PagerHarness> createState() => _PagerHarnessState();
}

class _PagerHarnessState extends State<_PagerHarness> {
  var _index = 0;

  @override
  Widget build(BuildContext context) => MaterialApp(
        home: Scaffold(
          body: MainNavigationPager(
            currentIndex: _index,
            onBranchSelected: (index) => setState(() => _index = index),
            children: const [
              Center(child: Text('Home')),
              Center(child: Text('Explore')),
              Center(child: Text('History')),
              Center(child: Text('Profile')),
            ],
          ),
          bottomNavigationBar: TextButton(
            onPressed: () => setState(() => _index = 2),
            child: const Text('Tap History'),
          ),
        ),
      );
}

class _RetainedBranch extends StatefulWidget {
  const _RetainedBranch();
  static var created = 0;

  @override
  State<_RetainedBranch> createState() => _RetainedBranchState();
}

class _RetainedBranchState extends State<_RetainedBranch> {
  @override
  void initState() {
    super.initState();
    _RetainedBranch.created++;
  }

  @override
  Widget build(BuildContext context) => const Center(child: Text('Retained'));
}

void main() {
  testWidgets('swipe updates the selected shell index in adjacent order',
      (tester) async {
    await tester.pumpWidget(const _PagerHarness());

    expect(find.text('Home'), findsOneWidget);
    await tester.drag(find.byType(PageView), const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(find.text('Explore'), findsOneWidget);

    await tester.drag(find.byType(PageView), const Offset(500, 0));
    await tester.pumpAndSettle();
    expect(find.text('Home'), findsOneWidget);
  });

  testWidgets('external bottom-nav style selection moves the PageView',
      (tester) async {
    await tester.pumpWidget(const _PagerHarness());

    await tester.tap(find.text('Tap History'));
    await tester.pumpAndSettle();
    expect(find.text('History'), findsOneWidget);
  });

  testWidgets('main navigation does not wrap at either end', (tester) async {
    await tester.pumpWidget(const _PagerHarness());

    await tester.drag(find.byType(PageView), const Offset(500, 0));
    await tester.pumpAndSettle();
    expect(find.text('Home'), findsOneWidget);

    for (var i = 0; i < 3; i++) {
      await tester.drag(find.byType(PageView), const Offset(-500, 0));
      await tester.pumpAndSettle();
    }
    expect(find.text('Profile'), findsOneWidget);
    await tester.drag(find.byType(PageView), const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(find.text('Profile'), findsOneWidget);
  });

  testWidgets('an inactive branch is retained after a swipe away and back',
      (tester) async {
    _RetainedBranch.created = 0;
    await tester.pumpWidget(MaterialApp(
      home: MainNavigationPager(
        currentIndex: 0,
        onBranchSelected: (_) {},
        children: const [
          _RetainedBranch(),
          Center(child: Text('Explore')),
        ],
      ),
    ));

    await tester.drag(find.byType(PageView), const Offset(-500, 0));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(PageView), const Offset(500, 0));
    await tester.pumpAndSettle();

    expect(find.text('Retained'), findsOneWidget);
    expect(_RetainedBranch.created, 1);
  });
}
