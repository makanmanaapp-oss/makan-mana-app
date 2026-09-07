import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/app_localizations.dart';
import '../../app/theme.dart';
import '../../core/constants/app_colors.dart';
import 'notification_preferences.dart';
import 'notification_settings_provider.dart';

/// PROMPT 4 — user notification settings: masters, per-category in-app/push,
/// quiet hours, and device-permission awareness. Account-scoped preferences are
/// saved through the validated callable (optimistic + rollback). OS permission
/// is device-specific and never flips the account push preference.
class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  ConsumerState<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends ConsumerState<NotificationSettingsScreen>
    with WidgetsBindingObserver {
  NotificationPreferences? _local; // optimistic working copy
  bool _saving = false;
  bool? _osAllowed;
  String? _platformTz; // canonical IANA zone from the OS (Part 16)

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refreshOsPermission();
    _resolvePlatformTz();
  }

  Future<void> _resolvePlatformTz() async {
    final tz =
        await ref.read(notificationSettingsServiceProvider).platformTimezone();
    if (mounted && tz != null) setState(() => _platformTz = tz);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Part 17: refresh permission when returning from Android Settings.
    if (state == AppLifecycleState.resumed) _refreshOsPermission();
  }

  Future<void> _refreshOsPermission() async {
    final allowed =
        await ref.read(notificationSettingsServiceProvider).osPermissionAllowed();
    if (mounted) setState(() => _osAllowed = allowed);
  }

  Future<void> _apply(NotificationPreferences next) async {
    final prev = _local;
    final errorText = AppLocalizations.of(context).t('notifSaveError');
    final messenger = ScaffoldMessenger.of(context);
    // Always persist a canonical IANA timezone (never a device abbreviation) so
    // the server quiet-hours evaluator has a usable zone (Part 16/17).
    final withTz = (next.timezone == null && _platformTz != null)
        ? next.copyWith(timezone: _platformTz)
        : next;
    setState(() {
      _local = withTz;
      _saving = true;
    });
    try {
      await ref.read(notificationSettingsServiceProvider).save(withTz);
    } catch (_) {
      if (mounted) {
        setState(() => _local = prev); // Part 24: revert on failure
        messenger.showSnackBar(SnackBar(content: Text(errorText)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final asyncPrefs = ref.watch(notificationPreferencesProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.t('notifSettingsTitle'))),
      body: asyncPrefs.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => _ErrorRetry(
          message: l.t('notifLoadError'),
          onRetry: () => ref.invalidate(notificationPreferencesProvider),
        ),
        data: (serverPrefs) {
          final prefs = _local ?? serverPrefs;
          final pushMaster = prefs.master.pushEnabled;
          final inAppMaster = prefs.master.inAppEnabled;
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              // ---------- Masters ----------
              _card(context, [
                _ToggleRow(
                  label: l.t('notifMasterPush'),
                  value: pushMaster,
                  onChanged: _saving
                      ? null
                      : (v) => _apply(prefs.copyWith(
                          master: prefs.master.copyWith(pushEnabled: v))),
                ),
                _divider(context),
                _ToggleRow(
                  label: l.t('notifMasterInApp'),
                  value: inAppMaster,
                  onChanged: _saving
                      ? null
                      : (v) => _apply(prefs.copyWith(
                          master: prefs.master.copyWith(inAppEnabled: v))),
                ),
              ]),

              // ---------- Category types ----------
              _sectionLabel(context, l.t('notifTypesLabel')),
              _card(context, [
                for (var i = 0; i < kNotificationSections.length; i++) ...[
                  if (i > 0) _divider(context),
                  _CategoryRow(
                    section: kNotificationSections[i],
                    prefs: prefs,
                    pushMasterOn: pushMaster,
                    inAppMasterOn: inAppMaster,
                    saving: _saving,
                    onInApp: (v) => _apply(_setSection(
                        prefs, kNotificationSections[i], inApp: v)),
                    onPush: (v) => _apply(_setSection(
                        prefs, kNotificationSections[i], push: v)),
                  ),
                ],
              ]),

              // ---------- Quiet hours ----------
              _sectionLabel(context, l.t('notifQuietHours')),
              _QuietHoursCard(
                prefs: prefs,
                saving: _saving,
                platformTz: _platformTz,
                onChanged: _apply,
              ),

              // ---------- OS permission ----------
              _sectionLabel(context, l.t('notifOsSection')),
              _OsPermissionCard(
                allowed: _osAllowed,
                onOpen: () =>
                    ref.read(notificationSettingsServiceProvider).openOsSettings(),
              ),
              const SizedBox(height: 24),
            ],
          );
        },
      ),
    );
  }

  /// Apply a toggle to EVERY backend category the section spans (Part 4/5).
  NotificationPreferences _setSection(
    NotificationPreferences prefs,
    NotificationSettingsSection section, {
    bool? inApp,
    bool? push,
  }) {
    var next = prefs;
    for (final cat in section.categories) {
      next = next.withCategory(cat, inAppEnabled: inApp, pushEnabled: push);
    }
    return next;
  }

  Widget _sectionLabel(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 20),
        child: Text(text,
            style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w800,
                color: context.tMuted)),
      );

  Widget _card(BuildContext context, List<Widget> children) => Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.tBorder),
        ),
        child: Material(
          color: context.tCard,
          child: Column(children: children),
        ),
      );

  Widget _divider(BuildContext context) =>
      Divider(height: 1, thickness: 1, color: context.tBorder);
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow(
      {required this.label, required this.value, required this.onChanged});
  final String label;
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile.adaptive(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      title: Text(label,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
      value: value,
      activeThumbColor: AppColors.primaryRed,
      onChanged: onChanged,
    );
  }
}

/// One category section with In-app + Push chips. Push chip is subordinate
/// (disabled, dimmed) when the Push master is OFF but keeps its stored value
/// (Part 6); same for In-app.
class _CategoryRow extends StatelessWidget {
  const _CategoryRow({
    required this.section,
    required this.prefs,
    required this.pushMasterOn,
    required this.inAppMasterOn,
    required this.saving,
    required this.onInApp,
    required this.onPush,
  });

  final NotificationSettingsSection section;
  final NotificationPreferences prefs;
  final bool pushMasterOn;
  final bool inAppMasterOn;
  final bool saving;
  final ValueChanged<bool> onInApp;
  final ValueChanged<bool> onPush;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final stored = prefs.forCategory(section.primary);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.t(section.titleKey),
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          if (section.subtitleKey != null)
            Padding(
              padding: const EdgeInsets.only(top: 2, right: 8),
              child: Text(l.t(section.subtitleKey!),
                  style: TextStyle(fontSize: 11.5, color: context.tMuted)),
            ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _PrefChip(
                label: l.t('notifInApp'),
                on: stored.inAppEnabled,
                subordinate: !inAppMasterOn,
                onChanged: saving || !inAppMasterOn ? null : onInApp,
              ),
              _PrefChip(
                label: l.t('notifPush'),
                on: stored.pushEnabled,
                subordinate: !pushMasterOn,
                onChanged: saving || !pushMasterOn ? null : onPush,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PrefChip extends StatelessWidget {
  const _PrefChip({
    required this.label,
    required this.on,
    required this.subordinate,
    required this.onChanged,
  });
  final String label;
  final bool on;
  final bool subordinate; // master off → dimmed, effective OFF
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final effectiveOn = on && !subordinate;
    return Opacity(
      opacity: subordinate ? 0.45 : 1,
      child: Semantics(
        toggled: effectiveOn,
        label: label,
        child: FilterChip(
          // Not colour-only: a check icon also encodes ON (Part 30).
          avatar: Icon(
            effectiveOn ? Icons.check_circle : Icons.circle_outlined,
            size: 18,
            color: effectiveOn ? AppColors.primaryRed : context.tMuted,
          ),
          label: Text(label),
          selected: effectiveOn,
          showCheckmark: false,
          selectedColor: AppColors.primaryRed.withValues(alpha: 0.12),
          onSelected: onChanged,
        ),
      ),
    );
  }
}

class _QuietHoursCard extends StatelessWidget {
  const _QuietHoursCard(
      {required this.prefs,
      required this.saving,
      required this.platformTz,
      required this.onChanged});
  final NotificationPreferences prefs;
  final bool saving;
  final String? platformTz;
  final ValueChanged<NotificationPreferences> onChanged;

  String _fmt(BuildContext context, int? minutes, int fallback) {
    final m = minutes ?? fallback;
    return TimeOfDay(hour: m ~/ 60, minute: m % 60).format(context);
  }

  Future<void> _pick(BuildContext context, bool isStart) async {
    final current = (isStart
            ? prefs.quietHoursStartMinutes
            : prefs.quietHoursEndMinutes) ??
        (isStart ? 1320 : 420);
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: current ~/ 60, minute: current % 60),
    );
    if (picked == null) return;
    final minutes = picked.hour * 60 + picked.minute;
    onChanged(isStart
        ? prefs.copyWith(quietHoursStartMinutes: minutes)
        : prefs.copyWith(quietHoursEndMinutes: minutes));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final enabled = prefs.quietHoursEnabled;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.tBorder),
      ),
      child: Material(
        color: context.tCard,
        child: Column(
        children: [
          SwitchListTile.adaptive(
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
            title: Text(l.t('notifQuietEnable'),
                style:
                    const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            value: enabled,
            activeThumbColor: AppColors.primaryRed,
            onChanged: saving
                ? null
                : (v) => onChanged(prefs.copyWith(quietHoursEnabled: v)),
          ),
          if (enabled) ...[
            Divider(height: 1, color: context.tBorder),
            ListTile(
              title: Text(l.t('notifQuietFrom')),
              trailing: Text(_fmt(context, prefs.quietHoursStartMinutes, 1320),
                  style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppColors.primaryRed)),
              onTap: saving ? null : () => _pick(context, true),
            ),
            Divider(height: 1, color: context.tBorder),
            ListTile(
              title: Text(l.t('notifQuietUntil')),
              trailing: Text(_fmt(context, prefs.quietHoursEndMinutes, 420),
                  style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppColors.primaryRed)),
              onTap: saving ? null : () => _pick(context, false),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: Row(
                children: [
                  Icon(Icons.public, size: 14, color: context.tMuted),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '${l.t('notifTimezone')}: '
                      '${prefs.timezone ?? platformTz ?? DateTime.now().timeZoneName}',
                      style: TextStyle(fontSize: 11.5, color: context.tMuted),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
        ),
      ),
    );
  }
}

class _OsPermissionCard extends StatelessWidget {
  const _OsPermissionCard({required this.allowed, required this.onOpen});
  final bool? allowed;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final isAllowed = allowed ?? true;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.tBorder),
      ),
      child: Material(
        color: context.tCard,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    isAllowed
                        ? Icons.notifications_active
                        : Icons.notifications_off,
                    color: isAllowed
                        ? AppColors.openGreen
                        : AppColors.warningOrange,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(l.t('notifDevicePermission'),
                            style:
                                const TextStyle(fontWeight: FontWeight.w600)),
                        Text(
                          isAllowed
                              ? l.t('notifPermAllowed')
                              : l.t('notifPermDisabled'),
                          style: TextStyle(
                            fontSize: 12.5,
                            color: isAllowed
                                ? context.tMuted
                                : AppColors.warningOrange,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: onOpen,
                  icon: const Icon(Icons.open_in_new, size: 16),
                  label: Text(l.t('notifOpenSettings')),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorRetry extends StatelessWidget {
  const _ErrorRetry({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message, style: TextStyle(color: context.tMuted)),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: Text(l.t('retryAction'))),
        ],
      ),
    );
  }
}
