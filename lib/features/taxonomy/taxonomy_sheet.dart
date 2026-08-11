import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import '../../core/providers.dart';
import 'taxonomy_data.dart';

/// Field user_profiles untuk setiap jenis taksonomi.
String taxonomyField(TaxonomyType type) => switch (type) {
      TaxonomyType.mood => 'selectedMoodPreferences',
      TaxonomyType.diet => 'dietPreferences',
      TaxonomyType.allergy => 'allergies',
      TaxonomyType.cuisine => 'favouriteCuisines',
    };

/// Pilihan taksonomi pengguna semasa (live) untuk satu jenis.
final userTaxonomyProvider = StreamProvider.autoDispose
    .family<Set<String>, TaxonomyType>((ref, type) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const {});
  }
  return FirebaseFirestore.instance
      .collection('user_profiles')
      .doc(uid)
      .snapshots()
      .map((snap) {
    final list = (snap.data()?[taxonomyField(type)] as List?) ?? const [];
    return list.map((e) => '$e').toSet();
  });
});

/// Buka sheet carian taksonomi. Simpan terus ke user_profiles.
Future<void> showTaxonomySheet(
  BuildContext context,
  WidgetRef ref, {
  required TaxonomyType type,
  required String title,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.mm.appBackground,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (sheetContext) => _TaxonomySheet(type: type, title: title),
  );
}

class _TaxonomySheet extends ConsumerStatefulWidget {
  const _TaxonomySheet({required this.type, required this.title});

  final TaxonomyType type;
  final String title;

  @override
  ConsumerState<_TaxonomySheet> createState() => _TaxonomySheetState();
}

class _TaxonomySheetState extends ConsumerState<_TaxonomySheet> {
  final _search = TextEditingController();
  late Set<String> _selected;
  bool _init = false;
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _save() {
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    if (uid.isEmpty || !ref.read(firebaseReadyProvider)) {
      Navigator.pop(context);
      return;
    }
    FirebaseFirestore.instance.collection('user_profiles').doc(uid).set({
      taxonomyField(widget.type): _selected.toList(),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final current = ref.watch(userTaxonomyProvider(widget.type)).value ??
        const <String>{};
    if (!_init) {
      _selected = {...current};
      _init = true;
    }
    final plan = ref.watch(userPlanProvider).value ?? 'free';
    final groups = taxonomyFor(widget.type);
    final note = taxonomySafetyNote(widget.type);
    final q = _query.toLowerCase();

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (builderContext, scrollController) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(widget.title,
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w800)),
                ),
                Text('${_selected.length} ${l.t('taxSelected')}',
                    style: TextStyle(
                        fontSize: 12.5,
                        color: context.mm.onCardMuted,
                        fontWeight: FontWeight.w700)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: TextField(
              controller: _search,
              onChanged: (v) => setState(() => _query = v),
              decoration: InputDecoration(
                hintText: l.t('taxSearch'),
                prefixIcon: const Icon(Icons.search, size: 20),
                isDense: true,
                filled: true,
                fillColor: context.mm.card,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          if (note != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Text(note,
                  style: TextStyle(
                      fontSize: 11.5,
                      color: context.mm.onCardMuted,
                      fontWeight: FontWeight.w600)),
            ),
          Expanded(
            child: ListView(
              controller: scrollController,
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
              children: [
                for (final group in groups)
                  ..._buildGroup(group, q, plan),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primaryRed,
                    minimumSize: const Size(0, 50),
                  ),
                  child: Text(l.t('saveAction'),
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 15)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildGroup(TaxGroup group, String q, String plan) {
    final items = q.isEmpty
        ? group.items
        : group.items
            .where((i) => i.label.toLowerCase().contains(q))
            .toList();
    if (items.isEmpty) return const [];
    return [
      Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 8),
        child: Text(group.title,
            style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w800,
                color: context.mm.onCard)),
      ),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: items.map((item) {
          final selected = _selected.contains(item.key);
          final locked = item.planLevel == 'pro' && plan != 'pro';
          return GestureDetector(
            onTap: locked
                ? null
                : () => setState(() {
                      selected
                          ? _selected.remove(item.key)
                          : _selected.add(item.key);
                    }),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                color: selected
                    ? AppColors.primaryRed
                    : (locked
                        ? context.mm.border.withValues(alpha: 0.4)
                        : context.mm.card),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                    color: selected
                        ? AppColors.primaryRed
                        : context.mm.border),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(item.label,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: selected
                            ? Colors.white
                            : (locked
                                ? context.mm.onCardFaint
                                : context.mm.onCard),
                      )),
                  if (locked) ...[
                    const SizedBox(width: 5),
                    Icon(Icons.lock,
                        size: 12, color: context.mm.iconMuted),
                  ],
                ],
              ),
            ),
          );
        }).toList(),
      ),
    ];
  }
}
