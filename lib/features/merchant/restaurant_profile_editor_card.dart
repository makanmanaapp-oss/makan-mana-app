import 'package:flutter/material.dart';

import '../../core/services/merchant_service.dart';
import 'restaurant_profile_proposal.dart';

typedef RestaurantProfileSubmit = Future<void> Function({
  required String registryId,
  required String submissionType,
  required Map<String, dynamic> data,
});

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

class _DayHoursDraft {
  _DayHoursDraft(this.key, this.label);

  final String key;
  final String label;
  bool closed = false;
  bool allDay = false;
  final open1 = TextEditingController();
  final close1 = TextEditingController();
  final open2 = TextEditingController();
  final close2 = TextEditingController();

  bool get hasTimes =>
      open1.text.trim().isNotEmpty ||
      close1.text.trim().isNotEmpty ||
      open2.text.trim().isNotEmpty ||
      close2.text.trim().isNotEmpty;

  void clear() {
    closed = false;
    allDay = false;
    open1.clear();
    close1.clear();
    open2.clear();
    close2.clear();
  }

  void dispose() {
    open1.dispose();
    close1.dispose();
    open2.dispose();
    close2.dispose();
  }
}

class _MenuDraft {
  _MenuDraft({required this.section});

  String section;
  bool available = true;
  final name = TextEditingController();
  final category = TextEditingController();
  final description = TextEditingController();
  final price = TextEditingController();
  final imageUrl = TextEditingController();

  void dispose() {
    name.dispose();
    category.dispose();
    description.dispose();
    price.dispose();
    imageUrl.dispose();
  }
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

  final _cuisineTags = TextEditingController();
  final _foodTags = TextEditingController();
  final _signatureDishes = TextEditingController();
  final _priceRange = TextEditingController();

  late final List<_DayHoursDraft> _days = [
    _DayHoursDraft('monday', 'Isnin'),
    _DayHoursDraft('tuesday', 'Selasa'),
    _DayHoursDraft('wednesday', 'Rabu'),
    _DayHoursDraft('thursday', 'Khamis'),
    _DayHoursDraft('friday', 'Jumaat'),
    _DayHoursDraft('saturday', 'Sabtu'),
    _DayHoursDraft('sunday', 'Ahad'),
  ];

  final List<_MenuDraft> _menuDrafts = [];

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
      _cuisineTags,
      _foodTags,
      _signatureDishes,
      _priceRange,
    ]) {
      controller.dispose();
    }
    for (final day in _days) {
      day.dispose();
    }
    for (final item in _menuDrafts) {
      item.dispose();
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

  bool _validClock(String value) =>
      RegExp(r'^(?:[01]\d|2[0-3]):[0-5]\d$').hasMatch(value);

  Map<String, dynamic>? _dayPayload(_DayHoursDraft day) {
    if (day.closed) {
      return const {'closed': true, 'all_day': false, 'sessions': []};
    }
    if (day.allDay) {
      return const {'closed': false, 'all_day': true, 'sessions': []};
    }
    if (!day.hasTimes) return null;

    final sessions = <Map<String, String>>[];
    for (final pair in [
      (day.open1.text.trim(), day.close1.text.trim()),
      (day.open2.text.trim(), day.close2.text.trim()),
    ]) {
      final open = pair.$1;
      final close = pair.$2;
      if (open.isEmpty && close.isEmpty) continue;
      if (!_validClock(open) || !_validClock(close)) {
        throw ArgumentError('restaurant_profile_hours_invalid:${day.key}');
      }
      sessions.add({'open': open, 'close': close});
    }
    if (sessions.isEmpty) return null;
    return {'closed': false, 'all_day': false, 'sessions': sessions};
  }

  List<Map<String, dynamic>> _menuPayload() {
    final result = <Map<String, dynamic>>[];
    for (var index = 0; index < _menuDrafts.length; index++) {
      final draft = _menuDrafts[index];
      final name = draft.name.text.trim();
      final category = draft.category.text.trim();
      final description = draft.description.text.trim();
      final priceText = draft.price.text.trim();
      final imageUrl = draft.imageUrl.text.trim();
      if (name.isEmpty &&
          category.isEmpty &&
          description.isEmpty &&
          priceText.isEmpty &&
          imageUrl.isEmpty) {
        continue;
      }
      if (name.isEmpty || name.length > 120) {
        throw ArgumentError('restaurant_profile_menu_name_invalid');
      }
      if (draft.section != 'makanan' && draft.section != 'minuman') {
        throw ArgumentError('restaurant_profile_menu_section_invalid');
      }
      double? price;
      if (priceText.isNotEmpty) {
        price = double.tryParse(priceText);
        if (price == null || price < 0 || price > 100000) {
          throw ArgumentError('restaurant_profile_menu_price_invalid');
        }
      }
      if (imageUrl.isNotEmpty &&
          !(imageUrl.startsWith('https://') || imageUrl.startsWith('http://'))) {
        throw ArgumentError('restaurant_profile_menu_image_invalid');
      }
      result.add({
        'id': 'merchant-${draft.section}-${index + 1}',
        'section': draft.section,
        'name': name,
        if (category.isNotEmpty) 'category': category,
        if (description.isNotEmpty) 'description': description,
        if (price != null) 'price': price,
        'currency': 'MYR',
        'available': draft.available,
        if (imageUrl.isNotEmpty) 'imageUrl': imageUrl,
        'sortOrder': result.length * 10,
      });
    }
    if (result.length > 200) {
      throw ArgumentError('restaurant_profile_menu_too_many_items');
    }
    return result;
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
        final hours = <String, dynamic>{};
        for (final day in _days) {
          final value = _dayPayload(day);
          if (value != null) hours[day.key] = value;
        }
        if (hours.isNotEmpty) data['opening_hours'] = hours;
        break;
      case RestaurantProfileProposal.menuUpdate:
        final cuisines = _csv(_cuisineTags);
        final foods = _csv(_foodTags);
        final dishes = _csv(_signatureDishes);
        final menu = _menuPayload();
        if (cuisines.isNotEmpty) data['cuisine_tags'] = cuisines;
        if (foods.isNotEmpty) data['food_tags'] = foods;
        if (dishes.isNotEmpty) data['signature_dishes'] = dishes;
        if (menu.isNotEmpty) data['menu_items'] = menu;
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
      final message = error.message?.toString() ?? '';
      setState(() => _localError = message == 'restaurant_profile_data_empty'
          ? 'Isi sekurang-kurangnya satu perubahan.'
          : message.startsWith('restaurant_profile_hours_invalid')
              ? 'Lengkapkan waktu buka dan tutup dalam format 24 jam, contohnya 09:00 dan 14:00.'
              : message.startsWith('restaurant_profile_menu_')
                  ? 'Semak item menu. Nama wajib, harga mesti nombor sah dan URL gambar mesti bermula http/https.'
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
    if (_submissionType == RestaurantProfileProposal.hoursUpdate) {
      for (final day in _days) {
        day.clear();
      }
      _businessStatus = 'active';
    }
    if (_submissionType == RestaurantProfileProposal.menuUpdate) {
      for (final item in _menuDrafts) {
        item.dispose();
      }
      _menuDrafts.clear();
    }
    setState(() {});
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
        return _hoursFields();
      case RestaurantProfileProposal.menuUpdate:
        return _menuFields();
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _hoursFields() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
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
        const Text(
          'Setiap hari menyokong maksimum dua sesi. Contoh: 09:00-14:00, rehat, 17:00-22:00.',
        ),
        const SizedBox(height: 10),
        for (final day in _days) _dayHoursCard(day),
      ],
    );
  }

  Widget _dayHoursCard(_DayHoursDraft day) {
    return Card(
      key: ValueKey('merchant-hours-${day.key}'),
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(day.label, style: const TextStyle(fontWeight: FontWeight.w700)),
            Wrap(
              spacing: 12,
              children: [
                FilterChip(
                  key: ValueKey('merchant-hours-${day.key}-closed'),
                  label: const Text('Tutup'),
                  selected: day.closed,
                  onSelected: widget.submitting
                      ? null
                      : (value) => setState(() {
                            day.closed = value;
                            if (value) day.allDay = false;
                          }),
                ),
                FilterChip(
                  key: ValueKey('merchant-hours-${day.key}-24h'),
                  label: const Text('24 jam'),
                  selected: day.allDay,
                  onSelected: widget.submitting
                      ? null
                      : (value) => setState(() {
                            day.allDay = value;
                            if (value) day.closed = false;
                          }),
                ),
              ],
            ),
            if (!day.closed && !day.allDay) ...[
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: _timeField(day.open1, '${day.label} buka sesi 1')),
                const SizedBox(width: 8),
                Expanded(child: _timeField(day.close1, '${day.label} tutup / rehat')),
              ]),
              Row(children: [
                Expanded(child: _timeField(day.open2, '${day.label} buka semula')),
                const SizedBox(width: 8),
                Expanded(child: _timeField(day.close2, '${day.label} tutup akhir')),
              ]),
            ],
          ],
        ),
      ),
    );
  }

  Widget _timeField(TextEditingController controller, String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextField(
        controller: controller,
        enabled: !widget.submitting,
        keyboardType: TextInputType.datetime,
        decoration: InputDecoration(labelText: label, hintText: '09:00'),
      ),
    );
  }

  Widget _menuFields() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _field(_cuisineTags, 'Jenis masakan', hint: 'Melayu, Thai, Western'),
        _field(_foodTags, 'Tag makanan', hint: 'Sarapan, Nasi, Sup'),
        _field(_signatureDishes, 'Menu signature',
            hint: 'Nasi Lemak, Laksa, Mee Kolok'),
        _field(_priceRange, 'Julat harga', hint: 'Contoh: budget / mid'),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                key: const Key('merchant-add-food-item'),
                onPressed: widget.submitting
                    ? null
                    : () => _addMenuItem('makanan'),
                icon: const Icon(Icons.restaurant_menu),
                label: const Text('Tambah makanan'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                key: const Key('merchant-add-drink-item'),
                onPressed: widget.submitting
                    ? null
                    : () => _addMenuItem('minuman'),
                icon: const Icon(Icons.local_drink_outlined),
                label: const Text('Tambah minuman'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        if (_menuDrafts.isEmpty)
          const Text('Belum ada item menu ditambah.')
        else
          for (var index = 0; index < _menuDrafts.length; index++)
            _menuItemCard(index, _menuDrafts[index]),
      ],
    );
  }

  void _addMenuItem(String section) {
    if (_menuDrafts.length >= 200) {
      setState(() => _localError = 'Maksimum 200 item menu untuk satu cadangan.');
      return;
    }
    setState(() {
      _menuDrafts.add(_MenuDraft(section: section));
      _localError = null;
    });
  }

  void _removeMenuItem(int index) {
    final item = _menuDrafts.removeAt(index);
    item.dispose();
    setState(() {});
  }

  Widget _menuItemCard(int index, _MenuDraft draft) {
    final label = draft.section == 'makanan' ? 'Makanan' : 'Minuman';
    return Card(
      key: ValueKey('merchant-menu-item-$index'),
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('$label ${index + 1}',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
                IconButton(
                  key: ValueKey('merchant-menu-remove-$index'),
                  tooltip: 'Buang item',
                  onPressed: widget.submitting ? null : () => _removeMenuItem(index),
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
            DropdownButtonFormField<String>(
              initialValue: draft.section,
              decoration: const InputDecoration(labelText: 'Bahagian'),
              items: const [
                DropdownMenuItem(value: 'makanan', child: Text('Makanan')),
                DropdownMenuItem(value: 'minuman', child: Text('Minuman')),
              ],
              onChanged: widget.submitting
                  ? null
                  : (value) => setState(() => draft.section = value ?? 'makanan'),
            ),
            const SizedBox(height: 8),
            _field(draft.name, 'Nama item', key: ValueKey('merchant-menu-name-$index')),
            _field(draft.category, 'Kategori', hint: 'Contoh: Nasi / Kopi'),
            _field(draft.description, 'Penerangan', maxLines: 2),
            _field(draft.price, 'Harga (RM)',
                hint: '12.90', keyboardType: const TextInputType.numberWithOptions(decimal: true)),
            _field(draft.imageUrl, 'URL gambar (optional)',
                hint: 'https://...', keyboardType: TextInputType.url),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Available'),
              value: draft.available,
              onChanged: widget.submitting
                  ? null
                  : (value) => setState(() => draft.available = value),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    Key? key,
    String? hint,
    TextInputType? keyboardType,
    int maxLines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        key: key,
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

  String _shortId(String value) => value.length <= 12
      ? value
      : '${value.substring(0, 8)}…${value.substring(value.length - 4)}';
}
