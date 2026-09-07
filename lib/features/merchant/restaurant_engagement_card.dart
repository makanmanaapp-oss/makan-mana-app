import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/services/merchant_service.dart';
import '../../core/services/restaurant_engagement_service.dart';
import '../../core/services/restaurant_profile_v2_service.dart';
import '../restaurant/engagement/restaurant_engagement_providers.dart';
import '../home/home_palette.dart';

/// Backend limits (functions/src/domain/restaurantEngagement/identity.ts).
/// The server remains the final validator; these only avoid a doomed round trip.
const int kRestaurantPostTextMax = 500;
const int kRestaurantReplyTextMax = 300;

/// WAVE 3D Gate 2 — merchant-side restaurant engagement inside Merchant Center.
///
/// Two workflows, both AS THE RESTAURANT:
///   1. publish a restaurant post  -> createRestaurantPost
///   2. reply to a REAL menu comment -> replyToRestaurantMenuComment
///
/// IDENTITY (corrected):
/// The restaurant is addressed by `canonicalPlaceId`, taken from the Control
/// Center's read-only `engagementRestaurants` projection. A membership
/// `registry_id` is a MASTER REGISTRY ROW id and is NEVER used as a restaurant
/// identity — a membership whose canonical mapping is missing or ambiguous is
/// simply absent from that projection and therefore cannot be selected.
///
/// REAL DATA ONLY:
/// The merchant never types a database id. Menu items come from the published
/// Restaurant Profile V2, and the parent comment is a real `MenuCommentData`
/// picked from the live visible-comment thread.
///
/// SECURITY:
/// - The role is server-provided and display-only; the callable re-authorizes
///   every single request through the read-only merchant bridge, so editing UI
///   state cannot grant authorization for another restaurant.
/// - The public author is always the RESTAURANT. The acting merchant Firebase
///   UID is never sent, rendered, or stored publicly.
/// - No direct Firestore write: `feed_posts` and `menu_comments` deny client
///   writes outright.
/// - Moderation stays a Control Center capability. Nothing here can hide,
///   remove or restore content.
class RestaurantEngagementCard extends ConsumerStatefulWidget {
  const RestaurantEngagementCard({super.key, required this.state});

  final MerchantState state;

  @override
  ConsumerState<RestaurantEngagementCard> createState() =>
      _RestaurantEngagementCardState();
}

class _RestaurantEngagementCardState
    extends ConsumerState<RestaurantEngagementCard> {
  final _postController = TextEditingController();
  final _replyController = TextEditingController();

  String? _selectedCanonicalPlaceId;
  String? _selectedMenuItemId;
  MenuCommentData? _replyTarget;

  bool _busy = false;
  String? _error;
  String? _success;

  Future<PublicRestaurantProfileV2?>? _profileFuture;
  String? _profileForCanonicalId;

  @override
  void dispose() {
    _postController.dispose();
    _replyController.dispose();
    super.dispose();
  }

  /// Restaurants with a PROVEN canonical identity. A membership without a valid
  /// canonical mapping never appears here.
  List<MerchantEngagementRestaurant> get _restaurants =>
      widget.state.engagementRestaurants;

  MerchantEngagementRestaurant? get _selected {
    final list = _restaurants;
    if (list.isEmpty) return null;
    if (list.length == 1) return list.first;
    for (final r in list) {
      if (r.canonicalPlaceId == _selectedCanonicalPlaceId) return r;
    }
    return null;
  }

  /// Published Restaurant Profile V2 for the selected restaurant. Flutter never
  /// reads the Master Registry directly — this is the existing public read path.
  Future<PublicRestaurantProfileV2?> _profile(String canonicalPlaceId) {
    if (_profileFuture == null || _profileForCanonicalId != canonicalPlaceId) {
      _profileForCanonicalId = canonicalPlaceId;
      _profileFuture =
          RestaurantProfileV2Service().getPublishedProfile(canonicalPlaceId);
    }
    return _profileFuture!;
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
      _success = null;
    });
    try {
      await action();
    } on RestaurantEngagementException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Ada masalah rangkaian. Cuba lagi.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _publishPost() async {
    final restaurant = _selected;
    final text = _postController.text.trim();
    if (restaurant == null || text.isEmpty) {
      setState(() => _error = 'Pilih kedai dan tulis kandungan siaran.');
      return;
    }
    await _run(() async {
      final result = await ref
          .read(restaurantEngagementServiceProvider)
          .createRestaurantPost(
            canonicalPlaceId: restaurant.canonicalPlaceId,
            text: text,
          );
      if (!mounted) return;
      _postController.clear();
      setState(() => _success =
          'Siaran diterbitkan sebagai ${restaurant.label} '
          '(${result.postId ?? 'OK'}).');
    });
  }

  Future<void> _sendReply() async {
    final restaurant = _selected;
    final menuItemId = _selectedMenuItemId;
    final target = _replyTarget;
    final text = _replyController.text.trim();
    if (restaurant == null ||
        menuItemId == null ||
        target == null ||
        text.isEmpty) {
      setState(() => _error = 'Pilih komen pelanggan dan tulis balasan.');
      return;
    }
    await _run(() async {
      await ref.read(restaurantEngagementServiceProvider).replyToMenuComment(
            canonicalPlaceId: restaurant.canonicalPlaceId,
            menuItemId: menuItemId,
            parentCommentId: target.id,
            text: text,
          );
      if (!mounted) return;
      _replyController.clear();
      // The thread is a live snapshot stream, so it refreshes naturally.
      setState(() {
        _replyTarget = null;
        _success = 'Balasan rasmi dihantar sebagai ${restaurant.label}.';
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = HomePalette.of(context);
    final restaurants = _restaurants;
    final selected = _selected;

    return Container(
      key: const Key('merchant-restaurant-engagement-card'),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Kandungan kedai',
              style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  color: palette.text)),
          const SizedBox(height: 6),
          Text(
            'Terbitkan siaran dan balas komen menu SEBAGAI KEDAI. Identiti '
            'awam ialah kedai — akaun peribadi anda tidak pernah dipaparkan. '
            'Kebenaran disahkan semula oleh pelayan pada setiap hantaran.',
            style: TextStyle(color: palette.subtext, height: 1.4),
          ),
          const SizedBox(height: 16),
          if (restaurants.isEmpty)
            const Text(
              key: Key('merchant-engagement-no-restaurant'),
              'Belum ada kedai yang boleh diwakili. Ini berlaku jika tiada '
              'akses kedai aktif, atau kedai itu belum mempunyai identiti '
              'kanonikal yang sah.',
            )
          else ...[
            if (restaurants.length > 1)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: DropdownButtonFormField<String>(
                  key: const Key('merchant-engagement-place'),
                  initialValue: _selectedCanonicalPlaceId,
                  decoration: const InputDecoration(labelText: 'Kedai'),
                  // Labels are the restaurant NAME, never a registry UUID.
                  items: restaurants
                      .map((r) => DropdownMenuItem(
                            value: r.canonicalPlaceId,
                            child: Text('${r.label} · ${r.role}'),
                          ))
                      .toList(growable: false),
                  onChanged: _busy
                      ? null
                      : (value) => setState(() {
                            _selectedCanonicalPlaceId = value;
                            _selectedMenuItemId = null;
                            _replyTarget = null;
                            _profileFuture = null;
                          }),
                ),
              ),
            if (selected != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  children: [
                    Icon(Icons.storefront_rounded,
                        size: 18, color: palette.subtext),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        // Restaurant DISPLAY NAME + role, shown before publish.
                        'Menerbit sebagai ${selected.label} · ${selected.role}',
                        key: const Key('merchant-engagement-identity'),
                        style: TextStyle(
                            color: palette.text, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              ),
            const Divider(height: 24),
            Text('Siaran kedai',
                style: TextStyle(
                    fontWeight: FontWeight.w800, color: palette.text)),
            const SizedBox(height: 8),
            TextField(
              key: const Key('merchant-restaurant-post-text'),
              controller: _postController,
              enabled: !_busy,
              minLines: 2,
              maxLines: 5,
              maxLength: kRestaurantPostTextMax,
              decoration: const InputDecoration(
                labelText: 'Apa yang baharu di kedai?',
              ),
            ),
            const SizedBox(height: 4),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const Key('merchant-restaurant-post-submit'),
                onPressed: _busy || selected == null ? null : _publishPost,
                child: Text(_busy ? 'Menghantar…' : 'Terbitkan siaran kedai'),
              ),
            ),
            const Divider(height: 28),
            Text('Balasan rasmi komen menu',
                style: TextStyle(
                    fontWeight: FontWeight.w800, color: palette.text)),
            const SizedBox(height: 6),
            Text(
              'Pilih item menu, kemudian pilih komen pelanggan sebenar untuk '
              'dibalas. Moderasi kandungan kekal di Control Center — kad ini '
              'tidak menyorok atau membuang sebarang komen.',
              style: TextStyle(color: palette.subtext, height: 1.4),
            ),
            const SizedBox(height: 10),
            if (selected != null) _replyWorkflow(palette, selected),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!,
                key: const Key('merchant-engagement-error'),
                style: const TextStyle(color: Colors.redAccent)),
          ],
          if (_success != null) ...[
            const SizedBox(height: 12),
            Text(_success!,
                key: const Key('merchant-engagement-success'),
                style: TextStyle(color: palette.subtext)),
          ],
        ],
      ),
    );
  }

  /// Menu item selector -> live visible comments -> reply editor. Every id used
  /// in the payload comes from selected data; nothing is typed by hand.
  Widget _replyWorkflow(
      HomePalette palette, MerchantEngagementRestaurant restaurant) {
    return FutureBuilder<PublicRestaurantProfileV2?>(
      future: _profile(restaurant.canonicalPlaceId),
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Padding(
            key: Key('merchant-reply-profile-loading'),
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          );
        }
        final profile = snapshot.data;
        if (profile == null) {
          return Text(
            key: const Key('merchant-reply-profile-unavailable'),
            'Profil kedai belum diterbitkan, jadi komen menu tidak tersedia.',
            style: TextStyle(color: palette.subtext),
          );
        }
        final items = profile.menuItems
            .where((item) => (item['id']?.toString() ?? '').isNotEmpty)
            .toList(growable: false);
        if (items.isEmpty) {
          return Text(
            key: const Key('merchant-reply-no-menu'),
            'Kedai ini belum mempunyai item menu diterbitkan.',
            style: TextStyle(color: palette.subtext),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DropdownButtonFormField<String>(
              key: const Key('merchant-reply-menu-item'),
              initialValue: _selectedMenuItemId,
              decoration: const InputDecoration(labelText: 'Item menu'),
              items: items.map((item) {
                final id = item['id'].toString();
                final name = (item['name']?.toString() ?? '').trim();
                return DropdownMenuItem(
                  value: id,
                  // PRIVASI: id item menu ialah nilai dalaman sahaja. Item
                  // tanpa nama diterbitkan mendapat label sandaran yang jujur,
                  // bukan kunci pangkalan data.
                  child: Text(name.isNotEmpty ? name : 'Item menu tanpa nama'),
                );
              }).toList(growable: false),
              onChanged: _busy
                  ? null
                  : (value) => setState(() {
                        _selectedMenuItemId = value;
                        _replyTarget = null;
                      }),
            ),
            const SizedBox(height: 10),
            if (_selectedMenuItemId != null)
              _commentPicker(palette, restaurant, _selectedMenuItemId!),
          ],
        );
      },
    );
  }

  Widget _commentPicker(HomePalette palette,
      MerchantEngagementRestaurant restaurant, String menuItemId) {
    // Reuses the EXACT existing query contract:
    // canonicalPlaceId + menuItemId + status == visible.
    final async = ref.watch(menuCommentsProvider(MenuCommentTarget(
      canonicalPlaceId: restaurant.canonicalPlaceId,
      menuItemId: menuItemId,
    )));

    return async.when(
      loading: () => const Padding(
        key: Key('merchant-reply-comments-loading'),
        padding: EdgeInsets.symmetric(vertical: 14),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (error, stack) => Text(
        key: const Key('merchant-reply-comments-error'),
        'Komen tidak dapat dimuatkan. Cuba lagi.',
        style: TextStyle(color: palette.subtext),
      ),
      data: (comments) {
        // Offer an official reply on CUSTOMER comments only. An existing
        // official restaurant reply is shown for context but is not itself a
        // reply target — the backend remains the final validator.
        final targets = comments.where((c) => !c.isRestaurantReply).toList();
        if (targets.isEmpty) {
          return Text(
            key: const Key('merchant-reply-no-comments'),
            'Belum ada komen pelanggan untuk item menu ini.',
            style: TextStyle(color: palette.subtext),
          );
        }
        return Column(
          key: const Key('merchant-reply-comment-list'),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final comment in targets)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: palette.background,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: _replyTarget?.id == comment.id
                          ? palette.text
                          : palette.border,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(comment.displayName,
                          style: TextStyle(
                              fontWeight: FontWeight.w700, color: palette.text)),
                      const SizedBox(height: 2),
                      Text(comment.text,
                          style: TextStyle(color: palette.subtext)),
                      const SizedBox(height: 6),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          key: Key('merchant-reply-select-${comment.id}'),
                          onPressed: _busy
                              ? null
                              : () => setState(() => _replyTarget = comment),
                          child: Text('Balas sebagai ${restaurant.label}'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            if (_replyTarget != null) ...[
              const SizedBox(height: 4),
              Text(
                'Membalas komen ${_replyTarget!.displayName}',
                key: const Key('merchant-reply-target'),
                style: TextStyle(
                    color: palette.text, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              TextField(
                key: const Key('merchant-reply-text'),
                controller: _replyController,
                enabled: !_busy,
                minLines: 2,
                maxLines: 4,
                maxLength: kRestaurantReplyTextMax,
                decoration: const InputDecoration(labelText: 'Balasan rasmi'),
              ),
              SizedBox(
                width: double.infinity,
                child: FilledButton.tonal(
                  key: const Key('merchant-reply-submit'),
                  onPressed: _busy ? null : _sendReply,
                  child: Text(_busy ? 'Menghantar…' : 'Hantar balasan rasmi'),
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}
