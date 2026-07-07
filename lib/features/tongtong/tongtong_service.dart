import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../wallet/wallet_providers.dart';
import '../wallet/wallet_service.dart';

/// Peserta bil Tong-Tong (embedded dalam dokumen bil).
class TtParticipant {
  TtParticipant({
    required this.name,
    this.uid,
    this.amountOwed = 0,
    this.paymentStatus = 'unpaid', // unpaid|paid|pending_confirmation|waived
    this.proofUrl,
  });

  final String name;
  final String? uid;
  double amountOwed;
  String paymentStatus;
  String? proofUrl;

  Map<String, dynamic> toMap() => {
        'name': name,
        'uid': uid,
        'amountOwed': double.parse(amountOwed.toStringAsFixed(2)),
        'paymentStatus': paymentStatus,
        'proofUrl': proofUrl,
      };

  static TtParticipant fromMap(Map<String, dynamic> m) => TtParticipant(
        name: m['name'] as String? ?? '',
        uid: m['uid'] as String?,
        amountOwed: (m['amountOwed'] as num?)?.toDouble() ?? 0,
        paymentStatus: m['paymentStatus'] as String? ?? 'unpaid',
        proofUrl: m['proofUrl'] as String?,
      );
}

/// Item bil (embedded).
class TtItem {
  const TtItem({
    required this.itemName,
    required this.price,
    this.quantity = 1,
    this.assignedTo = const [], // nama peserta; kosong = kongsi semua
  });

  final String itemName;
  final double price;
  final int quantity;
  final List<String> assignedTo;

  double get lineTotal => price * quantity;

  Map<String, dynamic> toMap() => {
        'itemName': itemName,
        'price': price,
        'quantity': quantity,
        'assignedTo': assignedTo,
      };

  static TtItem fromMap(Map<String, dynamic> m) => TtItem(
        itemName: m['itemName'] as String? ?? '',
        price: (m['price'] as num?)?.toDouble() ?? 0,
        quantity: (m['quantity'] as num?)?.toInt() ?? 1,
        assignedTo:
            ((m['assignedTo'] as List?) ?? const []).map((e) => '$e').toList(),
      );
}

class TongTongService {
  TongTongService(this._ref);

  final Ref _ref;

  FirebaseFirestore get _db => FirebaseFirestore.instance;
  String get uid =>
      _ref.read(authRepositoryProvider).currentUser?.uid ?? '';
  bool get _ready => _ref.read(firebaseReadyProvider) && uid.isNotEmpty;

  void _log(String type, [Map<String, dynamic> meta = const {}]) =>
      _ref.read(walletServiceProvider).logEvent(type, metadata: meta);

  /// Kira pecahan hutang ikut kaedah split. Pulangkan map nama→jumlah.
  static Map<String, double> calculateSplit({
    required String method, // equal | by_item | custom | sponsor
    required double total,
    required List<TtParticipant> participants,
    required List<TtItem> items,
    required String payerName,
  }) {
    final owed = {for (final p in participants) p.name: 0.0};
    if (participants.isEmpty) return owed;

    switch (method) {
      case 'sponsor':
        // Belanja! Semua orang 0, payer tanggung.
        break;
      case 'by_item':
        final itemsTotal =
            items.fold(0.0, (s, i) => s + i.lineTotal);
        for (final item in items) {
          final targets = item.assignedTo.isEmpty
              ? owed.keys.toList()
              : item.assignedTo.where(owed.containsKey).toList();
          if (targets.isEmpty) continue;
          final per = item.lineTotal / targets.length;
          for (final t in targets) {
            owed[t] = owed[t]! + per;
          }
        }
        // Baki tak beritem (cukai dll) dikongsi rata.
        final leftover = total - itemsTotal;
        if (leftover > 0.01) {
          final per = leftover / participants.length;
          for (final k in owed.keys) {
            owed[k] = owed[k]! + per;
          }
        }
        break;
      case 'custom':
        for (final p in participants) {
          owed[p.name] = p.amountOwed;
        }
        break;
      default: // equal
        final per = total / participants.length;
        for (final k in owed.keys) {
          owed[k] = per;
        }
    }
    // Payer tak hutang pada diri sendiri.
    if (owed.containsKey(payerName)) owed[payerName] = 0;
    return owed.map(
        (k, v) => MapEntry(k, double.parse(v.toStringAsFixed(2))));
  }

  Future<String?> createBill({
    required String placeName,
    required double total,
    required String method,
    required String payerName,
    required List<TtParticipant> participants,
    required List<TtItem> items,
    String? notes,
    String? receiptPhotoUrl,
    String? groupId,
  }) async {
    if (!_ready) return null;
    final owed = calculateSplit(
      method: method,
      total: total,
      participants: participants,
      items: items,
      payerName: payerName,
    );
    for (final p in participants) {
      p.amountOwed = owed[p.name] ?? 0;
      if (p.name == payerName || p.amountOwed == 0) {
        p.paymentStatus = 'paid';
      }
    }
    final doc = _db.collection('group_bills').doc();
    try {
      await doc.set({
        'hostId': uid,
        'groupId': groupId,
        'participantUids': [
          uid,
          ...participants
              .where((p) => p.uid != null && p.uid!.isNotEmpty)
              .map((p) => p.uid),
        ],
        'placeNameSnapshot': placeName,
        'mealDate': WalletService.dateKey(DateTime.now()),
        'currency': 'MYR',
        'totalAmount': total,
        'splitMethod': method,
        'payerName': payerName,
        'status': 'active',
        'notes': notes,
        'receiptPhotoUrl': receiptPhotoUrl,
        'participants': participants.map((p) => p.toMap()).toList(),
        'items': items.map((i) => i.toMap()).toList(),
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      _log('group_bill_created', {
        'method': method,
        'total': total,
        'participants': participants.length,
      });
      _log('group_bill_calculated');
      return doc.id;
    } catch (e) {
      debugPrint('MakanMana TongTong: create gagal: $e');
      return null;
    }
  }

  /// Kemaskini status bayaran peserta (nama unik dalam bil).
  Future<void> setPaymentStatus(
    String billId,
    List<TtParticipant> all,
    String participantName,
    String status, {
    String? proofUrl,
  }) async {
    if (!_ready) return;
    for (final p in all) {
      if (p.name == participantName) {
        p.paymentStatus = status;
        if (proofUrl != null) p.proofUrl = proofUrl;
      }
    }
    final settled = all.every((p) =>
        p.paymentStatus == 'paid' || p.paymentStatus == 'waived');
    unawaited(_db.collection('group_bills').doc(billId).update({
      'participants': all.map((p) => p.toMap()).toList(),
      if (settled) 'status': 'settled',
      'updatedAt': FieldValue.serverTimestamp(),
    }).then((v) {}, onError: (Object e) => debugPrint('TT: $e')));
    _log(
        status == 'paid'
            ? 'group_payment_confirmed'
            : 'group_payment_pending',
        {'status': status});
    if (settled) _log('group_bill_settled');
  }

  /// Teks kongsi WhatsApp.
  static String shareText({
    required String placeName,
    required double total,
    required String payerName,
    required List<TtParticipant> participants,
  }) {
    final lines = participants
        .where((p) => p.amountOwed > 0 && p.paymentStatus != 'paid')
        .map((p) =>
            '${p.name} hutang $payerName: RM${p.amountOwed.toStringAsFixed(2)}')
        .join('\n');
    return 'Tong-Tong Bill: $placeName\n'
        'Total: RM${total.toStringAsFixed(2)}\n'
        '$lines\n'
        'Bayar via DuitNow / TNG.\n'
        'Tanda "dah bayar" dalam MakanMana selepas transfer.';
  }
}

final tongTongServiceProvider =
    Provider<TongTongService>((ref) => TongTongService(ref));

/// Bil di mana saya host atau peserta.
final myBillsProvider =
    StreamProvider.autoDispose<List<(String, Map<String, dynamic>)>>((ref) {
  final uid = ref.watch(authRepositoryProvider).currentUser?.uid ?? '';
  if (!ref.watch(firebaseReadyProvider) || uid.isEmpty) {
    return Stream.value(const []);
  }
  return FirebaseFirestore.instance
      .collection('group_bills')
      .where('participantUids', arrayContains: uid)
      .orderBy('createdAt', descending: true)
      .limit(30)
      .snapshots()
      .map((snap) => snap.docs.map((d) => (d.id, d.data())).toList());
});

/// Satu bil (live).
final billProvider = StreamProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, billId) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(null);
  return FirebaseFirestore.instance
      .collection('group_bills')
      .doc(billId)
      .snapshots()
      .map((snap) => snap.data());
});
