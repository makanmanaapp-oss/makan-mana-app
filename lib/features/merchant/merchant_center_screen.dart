import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_colors.dart';
import '../../core/services/merchant_service.dart';
import '../home/home_palette.dart';
import 'restaurant_profile_editor_card.dart';

final merchantServiceProvider = Provider<MerchantService>((ref) {
  return MerchantService();
});

/// Merchant & Business Foundation public entry point.
///
/// This screen never writes Supabase, Master Place Registry or runtime place
/// collections directly. Every submit action is a Firebase-authenticated
/// callable and all merchant-provided data remains review-gated.
class MerchantCenterScreen extends ConsumerStatefulWidget {
  const MerchantCenterScreen({super.key});

  @override
  ConsumerState<MerchantCenterScreen> createState() =>
      _MerchantCenterScreenState();
}

class _MerchantCenterScreenState extends ConsumerState<MerchantCenterScreen> {
  final _contactName = TextEditingController();
  final _contactPhone = TextEditingController();
  final _contactEmail = TextEditingController();
  final _displayName = TextEditingController();
  final _legalName = TextEditingController();
  final _registrationNumber = TextEditingController();

  final _claimPlaceName = TextEditingController();
  final _claimRegistryId = TextEditingController();
  final _claimFirebasePlaceId = TextEditingController();
  String _verificationMethod = 'phone';

  final _newPlaceName = TextEditingController();
  final _newPlaceAddress = TextEditingController();
  final _newPlaceCity = TextEditingController();
  final _newPlaceState = TextEditingController();
  final _newPlacePostcode = TextEditingController();
  final _newPlacePhone = TextEditingController();
  final _newPlaceWebsite = TextEditingController();
  String _newPlaceBusinessStatus = 'active';

  MerchantState? _state;
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  String? _success;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_refresh);
  }

  @override
  void dispose() {
    for (final controller in [
      _contactName,
      _contactPhone,
      _contactEmail,
      _displayName,
      _legalName,
      _registrationNumber,
      _claimPlaceName,
      _claimRegistryId,
      _claimFirebasePlaceId,
      _newPlaceName,
      _newPlaceAddress,
      _newPlaceCity,
      _newPlaceState,
      _newPlacePostcode,
      _newPlacePhone,
      _newPlaceWebsite,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _refresh() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final value = await ref.read(merchantServiceProvider).getState();
      if (!mounted) return;
      setState(() {
        _state = value;
        _loading = false;
      });
    } on MerchantException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = _friendlyError(error.message);
      });
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
      _success = null;
    });
    try {
      await action();
      if (!mounted) return;
      setState(() => _submitting = false);
      await _refresh();
    } on MerchantException catch (error) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = _friendlyError(error.message);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = 'Ada masalah. Cuba lagi.';
      });
    }
  }

  String _friendlyError(String raw) {
    final value = raw.toLowerCase();
    if (value.contains('unauthenticated')) return 'Sila log masuk dahulu.';
    if (value.contains('merchant_bridge_not_configured') ||
        value.contains('merchant_bridge_unavailable')) {
      return 'Pendaftaran peniaga belum diaktifkan. Cuba lagi kemudian.';
    }
    if (value.contains('merchant_account_required')) {
      return 'Daftar akaun peniaga dahulu.';
    }
    if (value.contains('merchant_account_not_active')) {
      return 'Akaun peniaga ini tidak aktif. Hubungi sokongan MakanMana.';
    }
    if (value.contains('invalid_uuid') || value.contains('registry_id_invalid')) {
      return 'ID kedai tidak sah.';
    }
    if (value.contains('registry_id_required')) {
      return 'Akses kedai aktif diperlukan untuk menghantar perubahan.';
    }
    if (value.contains('merchant_place_access_required')) {
      return 'Anda belum mempunyai akses yang diluluskan untuk kedai ini.';
    }
    if (value.contains('restaurant_profile_field_forbidden') ||
        value.contains('restaurant_profile_field_not_allowed')) {
      return 'Medan ini tidak boleh diubah sendiri. Hantar hanya maklumat profil yang dibenarkan.';
    }
    return raw.replaceAll('_', ' ');
  }

  Future<void> _register() async {
    final name = _contactName.text.trim();
    final phone = _contactPhone.text.trim();
    if (name.isEmpty || phone.length < 3) {
      setState(() =>
          _error = 'Nama untuk dihubungi dan nombor telefon diperlukan.');
      return;
    }
    await _run(() async {
      await ref.read(merchantServiceProvider).registerAccount(
            contactName: name,
            contactPhone: phone,
            displayName: _displayName.text,
            contactEmail: _contactEmail.text,
            legalName: _legalName.text,
            registrationNumber: _registrationNumber.text,
          );
      if (mounted) {
        setState(() => _success =
            'Pendaftaran diterima. Akaun anda akan melalui proses semakan.');
      }
    });
  }

  Future<void> _submitClaim() async {
    final place = _claimPlaceName.text.trim();
    if (place.isEmpty) {
      setState(
          () => _error = 'Nama kedai diperlukan untuk tuntutan pemilikan.');
      return;
    }
    await _run(() async {
      await ref.read(merchantServiceProvider).submitClaim(
            claimedPlaceName: place,
            registryId: _claimRegistryId.text,
            firebasePlaceId: _claimFirebasePlaceId.text,
            verificationMethod: _verificationMethod,
          );
      _claimPlaceName.clear();
      _claimRegistryId.clear();
      _claimFirebasePlaceId.clear();
      if (mounted) {
        setState(() => _success =
            'Tuntutan kedai dihantar untuk semakan. Ia belum diluluskan atau diterbitkan.');
      }
    });
  }

  Future<void> _submitNewPlace() async {
    final name = _newPlaceName.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Nama kedai diperlukan.');
      return;
    }

    final data = <String, dynamic>{
      'official_name': name,
      'display_name': name,
      if (_newPlaceAddress.text.trim().isNotEmpty)
        'address_line1': _newPlaceAddress.text.trim(),
      if (_newPlaceCity.text.trim().isNotEmpty)
        'city': _newPlaceCity.text.trim(),
      if (_newPlaceState.text.trim().isNotEmpty)
        'state': _newPlaceState.text.trim(),
      if (_newPlacePostcode.text.trim().isNotEmpty)
        'postcode': _newPlacePostcode.text.trim(),
      'country': 'Malaysia',
      if (_newPlacePhone.text.trim().isNotEmpty)
        'phone': _newPlacePhone.text.trim(),
      if (_newPlaceWebsite.text.trim().isNotEmpty)
        'website': _newPlaceWebsite.text.trim(),
      'business_status': _newPlaceBusinessStatus,
    };

    await _run(() async {
      await ref.read(merchantServiceProvider).submitPlace(
            submissionType: 'new_place',
            data: data,
          );
      _newPlaceName.clear();
      _newPlaceAddress.clear();
      _newPlaceCity.clear();
      _newPlaceState.clear();
      _newPlacePostcode.clear();
      _newPlacePhone.clear();
      _newPlaceWebsite.clear();
      if (mounted) {
        setState(() => _success =
            'Maklumat kedai dihantar untuk semakan. Kedai tidak akan muncul secara automatik sebelum diluluskan.');
      }
    });
  }

  Future<void> _submitProfileUpdate({
    required String registryId,
    required String submissionType,
    required Map<String, dynamic> data,
  }) async {
    await _run(() async {
      await ref.read(merchantServiceProvider).submitProfileUpdate(
            registryId: registryId,
            submissionType: submissionType,
            data: data,
          );
      if (mounted) {
        setState(() => _success =
            'Perubahan profil dihantar untuk semakan. Diluluskan tidak bermaksud terus live.');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = HomePalette.of(context);
    return Scaffold(
      backgroundColor: palette.background,
      appBar: AppBar(
        title: const Text('Peniaga & Kedai'),
        actions: [
          IconButton(
            onPressed: _loading || _submitting ? null : _refresh,
            tooltip: 'Muat semula',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 110),
                children: [
                  _introCard(palette),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    _messageCard(_error!, error: true),
                  ],
                  if (_success != null) ...[
                    const SizedBox(height: 12),
                    _messageCard(_success!),
                  ],
                  const SizedBox(height: 18),
                  if (_state?.hasAccount != true)
                    _registrationCard(palette)
                  else ...[
                    _accountCard(palette, _state!),
                    const SizedBox(height: 18),
                    _claimCard(palette),
                    const SizedBox(height: 18),
                    _newPlaceCard(palette),
                    const SizedBox(height: 18),
                    RestaurantProfileEditorCard(
                      state: _state!,
                      submitting: _submitting,
                      onSubmit: _submitProfileUpdate,
                    ),
                    const SizedBox(height: 18),
                    _historyCard(palette, _state!),
                  ],
                ],
              ),
            ),
    );
  }

  Widget _introCard(HomePalette palette) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primaryRed, AppColors.deepSambalRed],
        ),
        borderRadius: BorderRadius.circular(24),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.storefront_outlined, color: Colors.white, size: 34),
          SizedBox(height: 12),
          Text(
            'Urus kedai anda di MakanMana',
            style: TextStyle(
              color: Colors.white,
              fontSize: 23,
              fontWeight: FontWeight.w800,
            ),
          ),
          SizedBox(height: 8),
          Text(
            'Daftar sebagai peniaga, tuntut kedai sedia ada atau hantar kedai baharu. Semua tuntutan dan perubahan disemak dahulu oleh MakanMana sebelum diterbitkan.',
            style: TextStyle(color: Colors.white, height: 1.4),
          ),
        ],
      ),
    );
  }

  Widget _registrationCard(HomePalette palette) {
    return _section(
      palette,
      title: 'Daftar akaun peniaga',
      subtitle:
          'Maklumat ini digunakan untuk pengesahan dan tidak dipaparkan pada profil kedai awam.',
      child: Column(
        children: [
          _field(_contactName, 'Nama untuk dihubungi *'),
          _field(_contactPhone, 'Nombor telefon *',
              keyboard: TextInputType.phone),
          _field(_contactEmail, 'E-mel', keyboard: TextInputType.emailAddress),
          _field(_displayName, 'Nama peniaga / jenama'),
          _field(_legalName, 'Nama syarikat / perniagaan'),
          _field(_registrationNumber, 'No. pendaftaran (jika ada)'),
          const SizedBox(height: 6),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _submitting ? null : _register,
              icon: const Icon(Icons.how_to_reg_outlined),
              label: Text(_submitting ? 'Menghantar...' : 'Daftar peniaga'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _accountCard(HomePalette palette, MerchantState state) {
    final account = state.account ?? const <String, dynamic>{};
    return _section(
      palette,
      title: 'Status akaun peniaga',
      subtitle:
          'Pengesahan akaun dan pemilikan kedai ialah dua proses berasingan.',
      child: Column(
        children: [
          _statusRow('Akaun', state.accountStatus),
          _statusRow('Pengesahan', state.verificationStatus),
          _statusRow('ID akaun', (account['id'] ?? '—').toString()),
          if (account['verified_at'] != null)
            _statusRow('Disahkan', _date(account['verified_at'])),
        ],
      ),
    );
  }

  Widget _claimCard(HomePalette palette) {
    return _section(
      palette,
      title: 'Tuntut kedai sedia ada',
      subtitle:
          'Jika kedai anda sudah ada dalam MakanMana, hantar tuntutan pemilikan. Kelulusan tidak memberi akses terus untuk mengubah data tanpa semakan.',
      child: Column(
        children: [
          _field(_claimPlaceName, 'Nama kedai *'),
          _field(
            _claimRegistryId,
            'Master Registry ID (jika diketahui)',
            helper: 'Biarkan kosong jika anda tidak pasti.',
          ),
          _field(
            _claimFirebasePlaceId,
            'Place ID MakanMana / Firebase (jika diketahui)',
          ),
          DropdownButtonFormField<String>(
            initialValue: _verificationMethod,
            decoration: const InputDecoration(labelText: 'Cara pengesahan'),
            items: const [
              DropdownMenuItem(value: 'phone', child: Text('Telefon')),
              DropdownMenuItem(value: 'email', child: Text('E-mel')),
              DropdownMenuItem(
                  value: 'registration_document',
                  child: Text('Dokumen pendaftaran')),
              DropdownMenuItem(
                  value: 'domain', child: Text('Domain / laman web')),
              DropdownMenuItem(
                  value: 'social_account', child: Text('Akaun media sosial')),
              DropdownMenuItem(
                  value: 'storefront', child: Text('Bukti premis')),
              DropdownMenuItem(
                  value: 'in_person', child: Text('Semakan bersemuka')),
              DropdownMenuItem(value: 'other', child: Text('Lain-lain')),
            ],
            onChanged: _submitting
                ? null
                : (value) =>
                    setState(() => _verificationMethod = value ?? 'phone'),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _submitting ? null : _submitClaim,
              icon: const Icon(Icons.verified_user_outlined),
              label: Text(_submitting ? 'Menghantar...' : 'Hantar tuntutan'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _newPlaceCard(HomePalette palette) {
    return _section(
      palette,
      title: 'Daftar kedai baharu',
      subtitle:
          'Maklumat ini masuk ke queue semakan. Ia tidak terus menjadi data kedai awam atau mempengaruhi ranking.',
      child: Column(
        children: [
          _field(_newPlaceName, 'Nama kedai *'),
          _field(_newPlaceAddress, 'Alamat'),
          _field(_newPlaceCity, 'Bandar'),
          _field(_newPlaceState, 'Negeri'),
          _field(_newPlacePostcode, 'Poskod', keyboard: TextInputType.number),
          _field(_newPlacePhone, 'Telefon kedai',
              keyboard: TextInputType.phone),
          _field(_newPlaceWebsite, 'Laman web', keyboard: TextInputType.url),
          DropdownButtonFormField<String>(
            initialValue: _newPlaceBusinessStatus,
            decoration: const InputDecoration(labelText: 'Status operasi'),
            items: const [
              DropdownMenuItem(value: 'active', child: Text('Beroperasi')),
              DropdownMenuItem(
                  value: 'temporarily_closed', child: Text('Tutup sementara')),
              DropdownMenuItem(
                  value: 'permanently_closed', child: Text('Tutup kekal')),
            ],
            onChanged: _submitting
                ? null
                : (value) => setState(
                    () => _newPlaceBusinessStatus = value ?? 'active'),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _submitting ? null : _submitNewPlace,
              icon: const Icon(Icons.add_business_outlined),
              label: Text(
                  _submitting ? 'Menghantar...' : 'Hantar kedai untuk semakan'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _historyCard(HomePalette palette, MerchantState state) {
    return _section(
      palette,
      title: 'Permohonan anda',
      subtitle: 'Sejarah disimpan supaya keputusan dan status boleh dijejaki.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (state.claims.isEmpty && state.submissions.isEmpty)
            Text('Belum ada tuntutan atau penghantaran.',
                style: TextStyle(color: palette.subtext)),
          ...state.claims.take(8).map((claim) => _historyTile(
                icon: Icons.verified_user_outlined,
                title:
                    (claim['claimed_place_name'] ?? 'Tuntutan kedai').toString(),
                status: (claim['claim_status'] ?? 'unknown').toString(),
                subtitle: 'Tuntutan · ${_date(claim['updated_at'])}',
              )),
          ...state.submissions.take(8).map((submission) => _historyTile(
                icon: Icons.store_mall_directory_outlined,
                title: (submission['submission_type'] ?? 'Penghantaran')
                    .toString()
                    .replaceAll('_', ' '),
                status: (submission['status'] ?? 'unknown').toString(),
                subtitle: 'Kedai · ${_date(submission['updated_at'])}',
              )),
          if (state.memberships.isNotEmpty) ...[
            const Divider(height: 28),
            Text('Akses kedai diluluskan',
                style: TextStyle(
                    fontWeight: FontWeight.w800, color: palette.text)),
            const SizedBox(height: 8),
            ...state.memberships.take(12).map((membership) => _historyTile(
                  icon: Icons.badge_outlined,
                  title: (membership['registry_id'] ?? 'Kedai').toString(),
                  status: (membership['status'] ?? 'unknown').toString(),
                  subtitle: 'Peranan: ${membership['role'] ?? '—'}',
                )),
          ],
        ],
      ),
    );
  }

  Widget _section(
    HomePalette palette, {
    required String title,
    required String subtitle,
    required Widget child,
  }) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  color: palette.text)),
          const SizedBox(height: 6),
          Text(subtitle,
              style: TextStyle(color: palette.subtext, height: 1.4)),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    TextInputType? keyboard,
    String? helper,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        enabled: !_submitting,
        keyboardType: keyboard,
        textInputAction: TextInputAction.next,
        decoration: InputDecoration(labelText: label, helperText: helper),
      ),
    );
  }

  Widget _statusRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 112,
            child: Text(label,
                style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
          Expanded(
            child: Text(value.replaceAll('_', ' '),
                style: const TextStyle(fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }

  Widget _historyTile({
    required IconData icon,
    required String title,
    required String status,
    required String subtitle,
  }) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(child: Icon(icon, size: 20)),
      title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(subtitle),
      trailing: Chip(label: Text(status.replaceAll('_', ' '))),
    );
  }

  Widget _messageCard(String message, {bool error = false}) {
    final color = error ? Colors.red.shade700 : Colors.green.shade700;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        border: Border.all(color: color.withValues(alpha: 0.25)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(error ? Icons.error_outline : Icons.check_circle_outline,
              color: color),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: TextStyle(color: color))),
        ],
      ),
    );
  }

  String _date(dynamic raw) {
    if (raw == null) return '—';
    final parsed = DateTime.tryParse(raw.toString());
    if (parsed == null) return raw.toString();
    final local = parsed.toLocal();
    String two(int value) => value.toString().padLeft(2, '0');
    return '${two(local.day)}/${two(local.month)}/${local.year} '
        '${two(local.hour)}:${two(local.minute)}';
  }
}
