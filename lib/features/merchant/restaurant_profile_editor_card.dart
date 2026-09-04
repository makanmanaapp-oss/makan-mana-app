import 'package:flutter/material.dart';

import '../../core/services/merchant_service.dart';
import 'restaurant_profile_proposal.dart';

typedef RestaurantProfileSubmit = Future<void> Function({
  required String registryId,
  required String submissionType,
  required Map<String, dynamic> data,
});

/// Review-gated Restaurant Profile V2 editor for places the merchant already
/// has an active membership for.
///
/// It only creates proposals. There are deliberately no approve, apply or
/// publish controls in this widget.
class RestaurantProfileEditorCard extends StatefulWidget {
  const RestaurantProfileEditorCard({
    super.key,
    required this.state,
    required this.submitting,
    required this.onSubmit,
  });

  final MerchantState state;
  final bool submitting;
  final RestaurantProfileSubmit onSubmit;

  @override
  State<RestaurantProfileEditorCard> createState() =>
      _RestaurantProfileEditorCardState();
}

class _RestaurantProfileEditorCardState
    extends State<RestaurantProfileEditorCard> {
  String _submissionType = RestaurantProfileProposal.profileUpdate;
  String? _registryId;
  String _businessStatus = 'active';
  String? _localError;

  final _displayName = TextEditingController();
  final _branchName = TextEditingController();
  final _primaryCategory = TextEditingController();
  final _description = TextEditingController();
  final _address = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _postcode = TextEditingController();

  final _phone = TextEditingController();
  final _whatsapp = TextEditingController();
  final _website = TextEditingController();
  final _instagram = TextEditingController();
  final _facebook = TextEditingController();
  final _tiktok = TextEditingController();

  final _monday = TextEditingController();
  final _tuesday = TextEditingController();
  final _wednesday = TextEditingController();
  final _thursday = TextEditingController();
  final _friday = TextEditingController();
  final _saturday = TextEditingController();
  final _sunday = TextEditingController();

  final _cuisineTags = TextEditingController();
  final _foodTags = TextEditingController();
  final _signatureDishes = TextEditingController();
  final _priceRange = TextEditingController();

  @override
  void initState() {
    super.initState();
    _syncMembership();
  }

  @override
  void didUpdateWidget(covariant RestaurantProfileEditorCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncMembership();
  }

  void _syncMembership() {
    final active = widget.state.activeMemberships;
    if (active.isEmpty) {
      _registryId = null;
      return;
    }
    final ids = active
        .map((item) => item['registry_id']?.toString())
        .whereType<String>()
        .where((value) => value.isNotEmpty)
        .toSet();
    if (_registryId == null || !ids.contains(_registryId)) {
      _registryId = ids.isEmpty ? null : ids.first;
    }
  }

  @override
  void dispose() {
    for (final controller in <TextEditingController>[
      _displayName,
      _branchName,
      _primaryCategory,
      _description,
      _address,
      _city,
      _state,
      _postcode,
      _phone,
      _whatsapp,
      _website,
      _instagram,
      _facebook,
      _tiktok,
      _monday,
      _tuesday,
      _wednesday,
      _thursday,
      _friday,
      _saturday,
      _sunday,
      _cuisineTags,
      _foodTags,
      _signatureDishes,
      _priceRange,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  List<String> _csv(TextEditingController controller) => controller.text
      .split(',')
      .map((value) => value.trim())
      .where((value) => value.isNotEmpty)
      .toList(growable: false);

  void _addText(
    Map<String, dynamic> data,
    String key,
    TextEditingController controller,
  ) {
    final value = controller.text.trim();
    if (value.isNotEmpty) data[key] = value;
  }

  Map<String, dynamic> _proposalData() {
    final data = <String, dynamic>{};
    switch (_submissionType) {
      case RestaurantProfileProposal.profileUpdate:
        _addText(data, 'display_name', _displayName);
        _addText(data, 'branch_name', _branchName);
        _addText(data, 'primary_category', _primaryCategory);
        _addText(data, 'short_description', _description);
        _addText(data, 'address_line1', _address);
        _addText(data, 'city', _city);
        _addText(data, 'state', _state);
        _addText(data, 'postcode', _postcode);
        break;
      case RestaurantProfileProposal.contactUpdate:
        _addText(data, 'phone', _phone);
        _addText(data, 'whatsapp', _whatsapp);
        _addText(data, 'website', _website);
        _addText(data, 'instagram', _instagram);
        _addText(data, 'facebook', _facebook);
        _addText(data, 'tiktok', _tiktok);
        break;
      case RestaurantProfileProposal.hoursUpdate:
        data['business_status'] = _businessStatus;
        final hours = <String, String>{};
        for (final entry in <MapEntry<String, TextEditingController>>[
          MapEntry('monday', _monday),
          MapEntry('tuesday', _tuesday),
          MapEntry('wednesday', _wednesday),
          MapEntry('thursday', _thursday),
          MapEntry('friday', _friday),
          MapEntry('saturday', _saturday),
          MapEntry('sunday', _sunday),
        ]) {
          final value = entry.value.text.trim();
          if (value.isNotEmpty) hours[entry.key] = value;
        }
        if (hours.isNotEmpty) data['opening_hours'] = hours;
        break;
      case RestaurantProfileProposal.menuUpdate:
        final cuisines = _csv(_cuisineTags);
        final foods = _csv(_foodTags);
        final dishes = _csv(_signatureDishes);
        if (cuisines.isNotEmpty) data['cuisine_tags'] = cuisines;
        if (foods.isNotEmpty) data['food_tags'] = foods;
        if (dishes.isNotEmpty) data['signature_dishes'] = dishes;
        _addText(data, 'price_range', _priceRange);
        break;
    }
    return RestaurantProfileProposal.validate(_submissionType, data);
  }

  Future<void> _submit() async {
    final registryId = _registryId;
    if (registryId == null || registryId.isEmpty) {
      setState(() => _localError =
          'Akses kedai aktif diperlukan sebelum anda boleh hantar perubahan.');
      return;
    }
    try {
      final data = _proposalData();
      setState(() => _localError = null);
      await widget.onSubmit(
        registryId: registryId,
        submissionType: _submissionType,
        data: data,
      );
      if (!mounted) return;
      _clearCurrentSection();
    } on ArgumentError catch (error) {
      if (!mounted) return;
      setState(() => _localError = error.message?.toString() ==
              'restaurant_profile_data_empty'
          ? 'Isi sekurang-kurangnya satu perubahan.'
          : 'Maklumat perubahan tidak sah.');
    }
  }

  void _clearCurrentSection() {
    final controllers = switch (_submissionType) {
      RestaurantProfileProposal.profileUpdate => <TextEditingController>[
          _displayName,
          _branchName,
          _primaryCategory,
          _description,
          _address,
          _city,
          _state,
          _postcode,
        ],
      RestaurantProfileProposal.contactUpdate => <TextEditingController>[
          _phone,
          _whatsapp,
          _website,
          _instagram,
          _facebook,
          _tiktok,
        ],
      RestaurantProfileProposal.hoursUpdate => <TextEditingController>[
          _monday,
          _tuesday,
          _wednesday,
          _thursday,
          _friday,
          _saturday,
          _sunday,
        ],
      RestaurantProfileProposal.menuUpdate => <TextEditingController>[
          _cuisineTags,
          _foodTags,
          _signatureDishes,
          _priceRange,
        ],
      _ => <TextEditingController>[],
    };
    for (final controller in controllers) {
      controller.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final active = widget.state.activeMemberships;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Restaurant Profile V2',
                style: theme.textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text(
              'Hantar cadangan perubahan untuk kedai yang sudah diluluskan. MakanMana akan semak dahulu sebelum perubahan boleh masuk ke Master Registry.',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 14),
            _safetyNotice(theme),
            const SizedBox(height: 16),
            if (active.isEmpty)
              const Text(
                'Belum ada akses kedai aktif. Selesaikan tuntutan pemilikan dahulu.',
              )
            else ...[
              DropdownButtonFormField<String>(
                key: const Key('restaurant-profile-place'),
                initialValue: _registryId,
                decoration: const InputDecoration(labelText: 'Kedai'),
                items: active
                    .where((membership) =>
                        membership['registry_id']?.toString().isNotEmpty == true)
                    .map((membership) {
                  final id = membership['registry_id'].toString();
                  final role = membership['role']?.toString() ?? 'editor';
                  return DropdownMenuItem(
                    value: id,
                    child: Text('${_shortId(id)} · $role'),
                  );
                }).toList(growable: false),
                onChanged: widget.submitting
                    ? null
                    : (value) => setState(() => _registryId = value),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                key: const Key('restaurant-profile-section'),
                initialValue: _submissionType,
                decoration:
                    const InputDecoration(labelText: 'Bahagian yang hendak diubah'),
                items: const [
                  DropdownMenuItem(
                    value: RestaurantProfileProposal.profileUpdate,
                    child: Text('Profil & alamat'),
                  ),
                  DropdownMenuItem(
                    value: RestaurantProfileProposal.contactUpdate,
                    child: Text('Hubungan & media sosial'),
                  ),
                  DropdownMenuItem(
                    value: RestaurantProfileProposal.hoursUpdate,
                    child: Text('Waktu operasi'),
                  ),
                  DropdownMenuItem(
                    value: RestaurantProfileProposal.menuUpdate,
                    child: Text('Menu & kategori makanan'),
                  ),
                ],
                onChanged: widget.submitting
                    ? null
                    : (value) => setState(() {
                          _submissionType = value ??
                              RestaurantProfileProposal.profileUpdate;
                          _localError = null;
                        }),
              ),
              const SizedBox(height: 14),
              _fieldsForSection(),
              if (_localError != null) ...[
                const SizedBox(height: 8),
                Text(_localError!,
                    style: TextStyle(color: theme.colorScheme.error)),
              ],
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  key: const Key('restaurant-profile-submit'),
                  onPressed: widget.submitting ? null : _submit,
                  icon: const Icon(Icons.rate_review_outlined),
                  label: Text(widget.submitting
                      ? 'Menghantar...'
                      : 'Hantar perubahan untuk semakan'),
                ),
              ),
            ],
            if (widget.state.restaurantProfileSubmissions.isNotEmpty) ...[
              const Divider(height: 32),
              Text('Status perubahan',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              ...widget.state.restaurantProfileSubmissions
                  .take(8)
                  .map(_submissionLifecycleTile),
            ],
          ],
        ),
      ),
    );
  }

  Widget _safetyNotice(ThemeData theme) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Text(
        'Status halal, alergen, pengesahan dan penerbitan tidak boleh diubah sendiri di sini. Maklumat sensitif kekal melalui semakan MakanMana.',
      ),
    );
  }

  Widget _fieldsForSection() {
    switch (_submissionType) {
      case RestaurantProfileProposal.profileUpdate:
        return Column(children: [
          _field(_displayName, 'Nama paparan'),
          _field(_branchName, 'Nama cawangan'),
          _field(_primaryCategory, 'Kategori utama'),
          _field(_description, 'Penerangan ringkas', maxLines: 3),
          _field(_address, 'Alamat'),
          _field(_city, 'Bandar'),
          _field(_state, 'Negeri'),
          _field(_postcode, 'Poskod', keyboardType: TextInputType.number),
        ]);
      case RestaurantProfileProposal.contactUpdate:
        return Column(children: [
          _field(_phone, 'Telefon', keyboardType: TextInputType.phone),
          _field(_whatsapp, 'WhatsApp', keyboardType: TextInputType.phone),
          _field(_website, 'Laman web', keyboardType: TextInputType.url),
          _field(_instagram, 'Instagram'),
          _field(_facebook, 'Facebook'),
          _field(_tiktok, 'TikTok'),
        ]);
      case RestaurantProfileProposal.hoursUpdate:
        return Column(children: [
          DropdownButtonFormField<String>(
            initialValue: _businessStatus,
            decoration: const InputDecoration(labelText: 'Status operasi'),
            items: const [
              DropdownMenuItem(value: 'active', child: Text('Beroperasi')),
              DropdownMenuItem(
                  value: 'temporarily_closed', child: Text('Tutup sementara')),
              DropdownMenuItem(
                  value: 'permanently_closed', child: Text('Tutup kekal')),
            ],
            onChanged: widget.submitting
                ? null
                : (value) => setState(() => _businessStatus = value ?? 'active'),
          ),
          const SizedBox(height: 12),
          _field(_monday, 'Isnin', hint: '09:00-22:00 atau Tutup'),
          _field(_tuesday, 'Selasa', hint: '09:00-22:00 atau Tutup'),
          _field(_wednesday, 'Rabu', hint: '09:00-22:00 atau Tutup'),
          _field(_thursday, 'Khamis', hint: '09:00-22:00 atau Tutup'),
          _field(_friday, 'Jumaat', hint: '09:00-22:00 atau Tutup'),
          _field(_saturday, 'Sabtu', hint: '09:00-22:00 atau Tutup'),
          _field(_sunday, 'Ahad', hint: '09:00-22:00 atau Tutup'),
        ]);
      case RestaurantProfileProposal.menuUpdate:
        return Column(children: [
          _field(_cuisineTags, 'Jenis masakan', hint: 'Melayu, Thai, Western'),
          _field(_foodTags, 'Tag makanan', hint: 'Sarapan, Nasi, Sup'),
          _field(_signatureDishes, 'Menu signature',
              hint: 'Nasi Lemak, Laksa, Mee Kolok'),
          _field(_priceRange, 'Julat harga', hint: 'Contoh: RM5-RM20'),
        ]);
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    String? hint,
    TextInputType? keyboardType,
    int maxLines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        enabled: !widget.submitting,
        keyboardType: keyboardType,
        maxLines: maxLines,
        decoration: InputDecoration(labelText: label, hintText: hint),
      ),
    );
  }

  Widget _submissionLifecycleTile(Map<String, dynamic> submission) {
    final type = submission['submission_type']?.toString() ?? 'profile_update';
    final review = submission['status']?.toString() ?? 'unknown';
    final apply = submission['apply_status']?.toString() ?? 'not_applied';
    final appliedVersion = submission['applied_registry_version'];
    final semantics = switch (apply) {
      'applied' =>
        'Sudah masuk Master Registry${appliedVersion == null ? '' : ' v$appliedVersion'}. Penerbitan ke app ialah proses berasingan.',
      'conflict' =>
        'Master Registry berubah selepas semakan. MakanMana perlu reconcile sebelum apply semula.',
      _ when review == 'approved' =>
        'Diluluskan untuk apply, tetapi belum live dan belum diterbitkan.',
      _ => 'Menunggu proses semakan MakanMana.',
    };

    return ListTile(
      key: ValueKey('profile-lifecycle-${submission['id'] ?? type}'),
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.fact_check_outlined),
      title: Text(type.replaceAll('_', ' ')),
      subtitle: Text(
        'Review: ${RestaurantProfileProposal.reviewLabel(review)}\n'
        'Apply: ${RestaurantProfileProposal.applyLabel(apply)}\n$semantics',
      ),
      isThreeLine: true,
    );
  }

  String _shortId(String value) =>
      value.length <= 12 ? value : '${value.substring(0, 8)}…${value.substring(value.length - 4)}';
}
