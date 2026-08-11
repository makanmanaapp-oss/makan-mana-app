import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/models/makanmana_user_context.dart';
import '../../core/providers.dart';
import '../../core/providers/makanmana_user_context_provider.dart';
import 'food_profile.dart';
import 'social_providers.dart';

/// Social Prompt 2: profil makanan awam auto-jana.
///
/// PRIVASI: hanya medan yang memang selamat-awam diterbitkan —
/// masakan kegemaran, mood makanan generik dan bio ringkas.
/// TIDAK SEKALI-KALI diterbitkan: alahan, data perubatan/badan/fitness,
/// lokasi tepat, diet/halal (kekal ikut toggle showDiet), dan julat bajet
/// TIDAK ditulis ke public_profiles melainkan showBudget sudah true
/// (dokumen public_profiles boleh dibaca semua pengguna log masuk).

/// SP2.1: teks bajet SAH sahaja — mesti mengandungi "RM" + digit > 0.
/// Menghalang ayat rosak seperti "bajet sekitar Nasi Lemak" / "RM0" / nama
/// masakan yang tersalah simpan dalam medan bajet.
String? validBudgetText(String raw) {
  final t = raw.trim();
  if (t.isEmpty || t.length > 24) return null;
  if (!t.toLowerCase().contains('rm')) return null;
  final digits = RegExp(r'\d+')
      .allMatches(t)
      .map((m) => int.tryParse(m.group(0)!) ?? 0);
  if (digits.isEmpty || digits.every((d) => d == 0)) return null;
  return t;
}

/// Senarai masakan -> "Melayu, Jepun dan Thai" (huruf besar awal).
String _prettyCuisineList(AppLocalizations l, String raw) {
  final items = raw
      .split(RegExp(r'[,/]'))
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .map((s) => s[0].toUpperCase() + s.substring(1))
      .toList();
  if (items.isEmpty) return '';
  if (items.length == 1) return items.first;
  final last = items.removeLast();
  return '${items.join(', ')} ${l.t('bioAnd')} $last';
}

/// Bina bio makanan auto daripada medan AWAM profil sahaja.
/// Ayat penuh & gramatis; pulangkan '' jika data tidak cukup
/// (skrin papar teks "sedang belajar").
String buildAutoFoodBio(AppLocalizations l, FoodProfile p) {
  final parts = <String>[];
  final mood = p.foodMood.trim();
  if (mood.toLowerCase().contains('pedas')) {
    parts.add(l.t('bioSpicy'));
  } else if (mood.isNotEmpty) {
    parts.add('${l.t('bioLikes')} $mood');
  }
  if (p.favouriteCuisine.isNotEmpty) {
    final list = _prettyCuisineList(l, p.favouriteCuisine);
    if (list.isNotEmpty) parts.add('${l.t('bioPickPrefix')} $list');
  }
  if (p.favouriteFood.isNotEmpty) {
    parts.add('${l.t('bioFavPrefix')} ${p.favouriteFood}');
  }
  // Bajet: HANYA jika dibenarkan DAN nilainya julat RM yang sah.
  final budget = validBudgetText(p.budgetRange);
  if (p.showBudget && budget != null) {
    parts.add('${l.t('bioBudgetPrefix')} $budget');
  }
  if (parts.isEmpty) return '';
  return '${parts.join('. ')}.';
}

/// Kira payload updateFoodProfile untuk MENGISI KEKOSONGAN sahaja —
/// medan yang pengguna sudah isi secara manual TIDAK diubah.
/// Pulangkan null jika tiada apa-apa untuk diisi.
Map<String, dynamic>? deriveAutoProfilePayload(
  MakanManaUserContext ctx,
  FoodProfile cur,
) {
  var changed = false;

  var favouriteCuisine = cur.favouriteCuisine;
  if (favouriteCuisine.isEmpty) {
    if (ctx.favoriteCuisines.isNotEmpty) {
      favouriteCuisine = ctx.favoriteCuisines.take(3).join(', ');
      changed = true;
    } else {
      // Fallback: masakan paling kerap dari Food Memory (data teragregat
      // bukan sensitif — nama masakan sahaja, tiada kiraan/lokasi).
      final brainTop = _topCuisineFromMemory(ctx.foodMemorySummary);
      if (brainTop != null) {
        favouriteCuisine = brainTop;
        changed = true;
      }
    }
  }

  var foodMood = cur.foodMood;
  if (foodMood.isEmpty && ctx.spicyPreference >= 2) {
    foodMood = 'Pedas power 🌶️';
    changed = true;
  }

  // Bajet: HANYA jika pengguna benarkan paparan (showBudget) DAN nilai
  // sedia ada bukan julat RM yang sah (medan mungkin tersalah isi teks
  // makanan — SP2.1). Nilai derive sentiasa bentuk RMx–RMy.
  var budgetRange = cur.budgetRange;
  final curBudgetValid = validBudgetText(budgetRange) != null;
  if (cur.showBudget &&
      !curBudgetValid &&
      ctx.budgetMin > 0 &&
      ctx.budgetMax > 0) {
    budgetRange = 'RM${ctx.budgetMin}–RM${ctx.budgetMax}';
    changed = true;
  }

  // Bio auto (guna pembina yang sama dengan paparan supaya konsisten &
  // selamat). SP2.1: bio auto lama yang rosak ("bajet sekitar <makanan>")
  // dikesan dan dijana semula.
  var bio = cur.bio;
  final bioLower = bio.toLowerCase();
  final bioBroken = bioLower.contains('bajet sekitar') &&
      !RegExp(r'bajet sekitar rm\s*\d').hasMatch(bioLower);
  if (bio.isEmpty || bioBroken) {
    // Bio disimpan dalam BM (bahasa lalai kandungan awam).
    final l10nMs = AppLocalizations(const Locale('ms'));
    final preview = FoodProfile(
      uid: cur.uid,
      displayName: cur.displayName,
      favouriteFood: cur.favouriteFood,
      favouriteCuisine: favouriteCuisine,
      foodMood: foodMood,
      budgetRange: budgetRange,
      showBudget: cur.showBudget,
    );
    final autoBio = buildAutoFoodBio(l10nMs, preview);
    if (autoBio.isNotEmpty && autoBio != bio) {
      bio = autoBio;
      changed = true;
    }
  }

  if (!changed) return null;
  // updateFoodProfile menulis SEMUA medan — hantar nilai sedia ada supaya
  // medan manual pengguna tidak terpadam.
  return {
    'bio': bio,
    'favouriteFood': cur.favouriteFood,
    'favouriteCuisine': favouriteCuisine,
    'foodMood': foodMood,
    'dietPreference': cur.dietPreference, // kekal; papar ikut showDiet
    'budgetRange': budgetRange,
    'showDiet': cur.showDiet,
    'showBudget': cur.showBudget,
  };
}

String? _topCuisineFromMemory(Map<String, dynamic>? memory) {
  final raw = memory?['topCuisines'];
  if (raw is Map && raw.isNotEmpty) {
    final entries = raw.entries.toList()
      ..sort((a, b) =>
          ((b.value as num?) ?? 0).compareTo((a.value as num?) ?? 0));
    final k = entries.first.key.toString().trim();
    return k.isEmpty ? null : k;
  }
  if (raw is List && raw.isNotEmpty) return raw.first.toString();
  return null;
}

/// Guard sesi: satu percubaan sync sahaja setiap pelancaran app.
bool _autoSyncDone = false;

/// Isi profil awam SENDIRI secara automatik (fill-gaps, tidak overwrite).
/// Dipanggil bila pengguna membuka profil awam sendiri.
Future<void> autoSyncMyPublicProfile(WidgetRef ref) async {
  if (_autoSyncDone) return;
  _autoSyncDone = true;
  try {
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    if (uid.isEmpty) return;
    final ctx = ref.read(makanManaUserContextProvider);
    final cur = await ref.read(publicProfileProvider(uid).future);
    final payload = deriveAutoProfilePayload(ctx, cur);
    if (payload == null) return;
    await ref.read(socialServiceProvider).updateFoodProfile(payload);
  } catch (e) {
    // Auto-sync tidak boleh mengganggu UI — cuba lagi sesi akan datang.
    debugPrint('MakanMana: auto-sync profil awam gagal: $e');
    _autoSyncDone = false;
  }
}
