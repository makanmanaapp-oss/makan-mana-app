/// What a QA build shows when it has no verified isolated backend.
///
/// It is a dead end on purpose. The alternative — starting anyway — is how a
/// test session writes into production, so this screen offers no way forward and
/// constructs no application service, repository or provider.
library;

import 'package:flutter/material.dart';

class QaIsolationBlockedApp extends StatelessWidget {
  const QaIsolationBlockedApp({required this.reason, super.key});

  final String reason;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: const Color(0xFF1B1B1B),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'QA build blocked',
                  style: TextStyle(
                    color: Color(0xFFE83A32),
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'This build has not been verified as isolated, so it was not '
                  'started. No connection to the production project was '
                  'attempted.',
                  style: TextStyle(color: Colors.white70, fontSize: 14),
                ),
                const SizedBox(height: 20),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFF262626),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFF3A3A3A)),
                  ),
                  child: SelectableText(
                    reason,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      height: 1.5,
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Start the isolated services, map them with adb reverse, then '
                  'build with --dart-define=MM_QA_BACKEND_HOST=127.0.0.1.',
                  style: TextStyle(color: Colors.white54, fontSize: 12.5),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
