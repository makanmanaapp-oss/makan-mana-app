import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_constants.dart';
import '../../app/theme.dart';
import 'merchant_analytics_models.dart';
import 'merchant_error_mapper.dart';

/// WAVE 6 — Analitik / Prestasi untuk kedai yang peniaga benar-benar urus.
///
/// Kebenaran diputuskan di pelayan (`authorizeMerchantPlace`), bukan di sini.
/// Skrin ini tidak pernah memaparkan identiti sesiapa: semua yang turun dari
/// callable ialah kiraan, kadar dan siri harian.
class MerchantAnalyticsScreen extends ConsumerStatefulWidget {
  const MerchantAnalyticsScreen({
    super.key,
    required this.canonicalPlaceId,
    required this.placeLabel,
  });

  /// Id kanonik kedai. Tidak pernah dipaparkan pada skrin.
  final String canonicalPlaceId;

  /// Nama kedai untuk tajuk — nama, bukan ID.
  final String placeLabel;

  @override
  ConsumerState<MerchantAnalyticsScreen> createState() =>
      _MerchantAnalyticsScreenState();
}

class _MerchantAnalyticsScreenState
    extends ConsumerState<MerchantAnalyticsScreen> {
  AnalyticsRange _range = AnalyticsRange.last30;
  MerchantAnalytics? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final callable = FirebaseFunctions.instanceFor(
        region: AppConstants.functionsRegion,
      ).httpsCallable('getMerchantAnalytics');
      final result = await callable.call<Map<String, dynamic>>({
        'canonicalPlaceId': widget.canonicalPlaceId,
        'days': _range.days,
        'compare': true,
      });
      if (!mounted) return;
      setState(() {
        _data = MerchantAnalytics.fromMap(
          Map<String, dynamic>.from(result.data),
        );
        _loading = false;
      });
    } catch (error) {
      // Kod teknikal kekal di log; pengguna dapat ayat biasa.
      MerchantErrorMapper.logForDebug('merchant_analytics', error);
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = MerchantErrorMapper.message(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final mm = context.mm;
    return Scaffold(
      backgroundColor: mm.appBackground,
      appBar: AppBar(
        title: const Text('Prestasi'),
        actions: [
          IconButton(
            key: const Key('merchant-analytics-refresh'),
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : _load,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          key: const Key('merchant-analytics-list'),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            Text(
              widget.placeLabel,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: mm.onCard,
              ),
            ),
            const SizedBox(height: 10),
            _rangePicker(mm),
            const SizedBox(height: 16),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 48),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null)
              _notice(mm, _error!, isError: true)
            else if (_data != null)
              ..._sections(mm, _data!),
          ],
        ),
      ),
    );
  }

  Widget _rangePicker(MMColors mm) {
    return Wrap(
      spacing: 8,
      children: [
        for (final option in AnalyticsRange.values)
          ChoiceChip(
            key: Key('merchant-analytics-range-${option.days}'),
            label: Text(option.label),
            selected: _range == option,
            onSelected: _loading
                ? null
                : (selected) {
                    if (!selected) return;
                    setState(() => _range = option);
                    _load();
                  },
          ),
      ],
    );
  }

  List<Widget> _sections(MMColors mm, MerchantAnalytics data) {
    return [
      _periodNote(mm, data),
      const SizedBox(height: 14),
      _group(mm, 'Ringkasan', [
        _metricRow(mm, data, 'Paparan profil', 'profileViews'),
        _metricRow(mm, data, 'Tindakan minat tinggi', 'conversionProxyActions'),
      ]),
      _group(mm, 'Pengikut', [
        _metricRow(mm, data, 'Pengikut baharu', 'newFollows'),
        _metricRow(mm, data, 'Berhenti ikut', 'unfollows'),
        _metricRow(mm, data, 'Perubahan bersih', 'netFollows'),
      ]),
      _group(mm, 'Simpan & kongsi', [
        _metricRow(mm, data, 'Disimpan', 'saves'),
        _metricRow(mm, data, 'Buang simpanan', 'unsaves'),
        _metricRow(mm, data, 'Dikongsi', 'shares'),
      ]),
      _group(mm, 'Penglibatan menu', [
        _metricRow(mm, data, 'Menu dibuka', 'menuOpens'),
        _metricRow(mm, data, 'Item menu dilihat', 'menuItemViews'),
        _metricRow(mm, data, 'Komen menu', 'menuComments'),
      ]),
      _group(mm, 'Prestasi promosi', [
        _metricRow(mm, data, 'Promosi dipapar', 'promotionImpressions'),
        _metricRow(mm, data, 'Ketukan promosi', 'promotionTaps'),
        _metricRow(mm, data, 'Kadar ketukan', 'promotionCtr', isRate: true),
      ]),
      _group(mm, 'Tindakan minat tinggi (proksi)', [
        _metricRow(mm, data, 'Buka peta', 'mapsTaps'),
        _metricRow(mm, data, 'Arah jalan', 'directionsTaps'),
        _metricRow(mm, data, 'Telefon', 'callTaps'),
        _metricRow(mm, data, 'Laman web', 'websiteTaps'),
        _metricRow(mm, data, 'Check-in', 'checkins'),
        _metricRow(mm, data, 'Makanan dilog', 'mealsLogged'),
      ]),
      const SizedBox(height: 8),
      _proxyDisclaimer(mm),
      if (data.notTracked.isNotEmpty) ...[
        const SizedBox(height: 14),
        _notTrackedBlock(mm, data),
      ],
    ];
  }

  Widget _periodNote(MMColors mm, MerchantAnalytics data) {
    final comparison = data.comparisonAvailable
        ? 'Dibandingkan dengan tempoh sebelum ini.'
        : (data.comparisonNote ?? 'Tiada tempoh sebelum ini untuk dibandingkan.');
    return _notice(
      mm,
      '${data.fromDay} hingga ${data.toDay} (waktu ${data.timezone}). $comparison',
    );
  }

  Widget _proxyDisclaimer(MMColors mm) => _notice(
        mm,
        'Tindakan minat tinggi ialah PROKSI. Ia menunjukkan minat pelanggan, '
        'bukan rekod kunjungan atau jualan. MakanMana tidak memproses bayaran '
        'kedai, jadi jualan dan pesanan tidak boleh dilaporkan di sini.',
      );

  Widget _notTrackedBlock(MMColors mm, MerchantAnalytics data) {
    return _group(mm, 'Belum dijejaki', [
      for (final entry in data.notTracked.entries)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            '• ${entry.value}',
            style: TextStyle(color: mm.onCardMuted, fontSize: 12.5, height: 1.35),
          ),
        ),
    ]);
  }

  Widget _group(MMColors mm, String title, List<Widget> children) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: mm.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: mm.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 14.5,
              color: mm.onCard,
            ),
          ),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    );
  }

  Widget _metricRow(
    MMColors mm,
    MerchantAnalytics data,
    String label,
    String key, {
    bool isRate = false,
  }) {
    final cell = data.metric(key);
    final change = data.change(key);

    final String display;
    if (cell.isMeasured) {
      display = isRate
          ? '${(cell.value! * 100).toStringAsFixed(1)}%'
          : cell.value!.toString();
    } else {
      display = switch (cell.state) {
        MetricState.notTracked => 'Tidak dijejaki',
        MetricState.insufficient => 'Data tidak mencukupi',
        MetricState.unavailable => 'Tidak tersedia',
        MetricState.recorded => '—',
      };
    }

    return Padding(
      key: Key('merchant-metric-$key'),
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(color: mm.onCardMuted, fontSize: 13.5),
                ),
              ),
              Text(
                display,
                style: TextStyle(
                  color: cell.isMeasured ? mm.onCard : mm.onCardMuted,
                  fontWeight: cell.isMeasured ? FontWeight.w800 : FontWeight.w500,
                  fontSize: cell.isMeasured ? 15 : 12.5,
                ),
              ),
              if (change != null) ...[
                const SizedBox(width: 8),
                Text(
                  '${change >= 0 ? '+' : ''}${(change * 100).toStringAsFixed(0)}%',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: change >= 0 ? Colors.green.shade700 : Colors.red.shade700,
                  ),
                ),
              ],
            ],
          ),
          if (!cell.isMeasured && (cell.note ?? '').isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                cell.note!,
                style: TextStyle(color: mm.onCardMuted, fontSize: 11.5, height: 1.3),
              ),
            ),
        ],
      ),
    );
  }

  Widget _notice(MMColors mm, String message, {bool isError = false}) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isError ? Colors.red.withValues(alpha: 0.07) : mm.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isError ? Colors.red.shade200 : mm.border),
      ),
      child: Text(
        message,
        key: isError ? const Key('merchant-analytics-error') : null,
        style: TextStyle(
          color: isError ? Colors.red.shade800 : mm.onCardMuted,
          fontSize: 12.5,
          height: 1.35,
        ),
      ),
    );
  }
}
