import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';

/// 👥 Group Decision: buat sesi undian makan, kongsi kod,
/// semua orang undi, keputusan live. Buat sesi = Pro; sertai = semua.
class GroupDecisionScreen extends ConsumerStatefulWidget {
  const GroupDecisionScreen({super.key});

  @override
  ConsumerState<GroupDecisionScreen> createState() =>
      _GroupDecisionScreenState();
}

class _GroupDecisionScreenState
    extends ConsumerState<GroupDecisionScreen> {
  final _codeController = TextEditingController();
  bool _creating = false;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  String _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    final r = Random();
    return List.generate(5, (i) => chars[r.nextInt(chars.length)]).join();
  }

  /// Buat sesi baru dari tempat sebenar berdekatan (Pro sahaja).
  Future<void> _createSession() async {
    final l = AppLocalizations.of(context);
    final plan = ref.read(userPlanProvider).value ?? 'free';
    if (plan != 'pro') {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t('lockedPro'))),
      );
      context.push(RoutePaths.paywall);
      return;
    }
    setState(() => _creating = true);
    try {
      final places = await ref.read(nearbyPlacesProvider.future);
      final options = places
          .where((p) => p.isOpen)
          .take(4)
          .map((p) => {
                'placeId': p.placeId,
                'name': p.name,
                'emoji': p.emoji,
                'cuisine': p.cuisine,
              })
          .toList();
      if (options.length < 2) {
        throw Exception('Tidak cukup tempat berdekatan.');
      }
      final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
      final code = _generateCode();
      final doc = await FirebaseFirestore.instance
          .collection('group_sessions')
          .add({
        'code': code,
        'createdBy': uid,
        'status': 'open',
        'options': options,
        'createdAt': FieldValue.serverTimestamp(),
      });
      if (mounted) {
        setState(() => _creating = false);
        context.push('/group-vote', extra: doc.id);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _creating = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('📡 ${l.t('postFailed')}')),
        );
      }
    }
  }

  /// Sertai sesi dengan kod (percuma untuk semua).
  Future<void> _joinByCode() async {
    final l = AppLocalizations.of(context);
    final code = _codeController.text.trim().toUpperCase();
    if (code.length != 5) return;
    final snap = await FirebaseFirestore.instance
        .collection('group_sessions')
        .where('code', isEqualTo: code)
        .limit(1)
        .get();
    if (!mounted) return;
    if (snap.docs.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.t('sessionNotFound'))),
      );
      return;
    }
    context.push('/group-vote', extra: snap.docs.first.id);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.t('proGroupTitle'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          const Center(child: Text('🗳️', style: TextStyle(fontSize: 56))),
          const SizedBox(height: 10),
          Center(
            child: Text(
              l.t('groupIntro'),
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.mutedText,
                fontSize: 14,
                height: 1.4,
              ),
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: _creating ? null : _createSession,
            icon: _creating
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.add_circle_outline, size: 20),
            label: Text('${l.t('createSession')} 👑'),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              const Expanded(
                  child: Divider(color: AppColors.softBorder)),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text(
                  l.t('orLabel'),
                  style: const TextStyle(color: AppColors.mutedText),
                ),
              ),
              const Expanded(
                  child: Divider(color: AppColors.softBorder)),
            ],
          ),
          const SizedBox(height: 24),
          TextField(
            controller: _codeController,
            textCapitalization: TextCapitalization.characters,
            maxLength: 5,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              letterSpacing: 8,
            ),
            decoration: InputDecoration(
              hintText: 'KOD',
              counterText: '',
              filled: true,
              fillColor: AppColors.cardWhite,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide:
                    const BorderSide(color: AppColors.softBorder),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide:
                    const BorderSide(color: AppColors.softBorder),
              ),
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _joinByCode,
            style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 50)),
            icon: const Icon(Icons.login, size: 20),
            label: Text(l.t('joinSession')),
          ),
        ],
      ),
    );
  }
}

/// Skrin undian live satu sesi.
class GroupVoteScreen extends ConsumerWidget {
  const GroupVoteScreen({super.key, required this.sessionId});

  final String sessionId;

  Future<void> _vote(WidgetRef ref, String placeId) async {
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    await FirebaseFirestore.instance
        .collection('group_sessions')
        .doc(sessionId)
        .collection('votes')
        .doc(uid)
        .set({
      'uid': uid,
      'placeId': placeId,
      'votedAt': FieldValue.serverTimestamp(),
    });
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
    final sessionStream = FirebaseFirestore.instance
        .collection('group_sessions')
        .doc(sessionId)
        .snapshots();
    final votesStream = FirebaseFirestore.instance
        .collection('group_sessions')
        .doc(sessionId)
        .collection('votes')
        .snapshots();

    return Scaffold(
      appBar: AppBar(title: Text(l.t('voteTitle'))),
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: sessionStream,
        builder: (context, sessionSnap) {
          final session = sessionSnap.data?.data();
          if (session == null) {
            return const Center(child: CircularProgressIndicator());
          }
          final code = session['code'] as String? ?? '';
          final options = (session['options'] as List? ?? [])
              .map((o) => Map<String, dynamic>.from(o as Map))
              .toList();

          return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: votesStream,
            builder: (context, votesSnap) {
              final votes = votesSnap.data?.docs ?? [];
              final counts = <String, int>{};
              String? myVote;
              for (final v in votes) {
                final pid = v.data()['placeId'] as String? ?? '';
                counts[pid] = (counts[pid] ?? 0) + 1;
                if (v.id == uid) myVote = pid;
              }
              final total = votes.length;
              String? leaderId;
              var leaderCount = -1;
              counts.forEach((k, v) {
                if (v > leaderCount) {
                  leaderId = k;
                  leaderCount = v;
                }
              });

              return ListView(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                children: [
                  // Kod sesi + kongsi ke WhatsApp.
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.softYellow,
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment:
                                CrossAxisAlignment.start,
                            children: [
                              Text(
                                l.t('sessionCode'),
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.mutedText,
                                ),
                              ),
                              Text(
                                code,
                                style: const TextStyle(
                                  fontSize: 30,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 6,
                                  color: AppColors.darkText,
                                ),
                              ),
                            ],
                          ),
                        ),
                        ElevatedButton.icon(
                          onPressed: () async {
                            try {
                              await SharePlus.instance.share(
                                ShareParams(
                                  text:
                                      '🗳️ Jom undi makan mana! Buka app '
                                      'MakanMana > Group Decision > masukkan '
                                      'kod: $code',
                                ),
                              );
                            } catch (_) {}
                          },
                          style: ElevatedButton.styleFrom(
                              minimumSize: const Size(88, 42)),
                          icon: const Icon(Icons.share, size: 18),
                          label: Text(l.t('shareCode')),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '$total ${l.t('votesLabel')}',
                    style: const TextStyle(
                      color: AppColors.mutedText,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 10),
                  ...options.map((o) {
                    final pid = o['placeId'] as String;
                    final count = counts[pid] ?? 0;
                    final isMyVote = myVote == pid;
                    final isLeader =
                        pid == leaderId && leaderCount > 0;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: InkWell(
                        onTap: () => _vote(ref, pid),
                        borderRadius: BorderRadius.circular(18),
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: isMyVote
                                ? AppColors.softYellow
                                : AppColors.cardWhite,
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(
                              color: isMyVote
                                  ? AppColors.warmYellow
                                  : AppColors.softBorder,
                              width: isMyVote ? 2 : 1,
                            ),
                          ),
                          child: Row(
                            children: [
                              Text(o['emoji'] as String? ?? '🍽️',
                                  style:
                                      const TextStyle(fontSize: 28)),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      o['name'] as String? ?? '',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 15,
                                      ),
                                    ),
                                    Text(
                                      o['cuisine'] as String? ?? '',
                                      style: const TextStyle(
                                        color: AppColors.mutedText,
                                        fontSize: 12.5,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              if (isLeader)
                                const Padding(
                                  padding:
                                      EdgeInsets.only(right: 6),
                                  child: Text('👑',
                                      style:
                                          TextStyle(fontSize: 18)),
                                ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 5),
                                decoration: BoxDecoration(
                                  color: AppColors.primaryRed
                                      .withValues(alpha: 0.1),
                                  borderRadius:
                                      BorderRadius.circular(10),
                                ),
                                child: Text(
                                  '$count',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.primaryRed,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  }),
                  const SizedBox(height: 6),
                  Text(
                    l.t('voteHint'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: AppColors.mutedText,
                      fontSize: 12.5,
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }
}
