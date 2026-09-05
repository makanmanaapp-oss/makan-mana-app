import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/localization/app_localizations.dart';
import '../../../app/theme.dart';
import '../../../core/services/restaurant_engagement_service.dart';
import 'restaurant_engagement_providers.dart';

/// WAVE 3D Gate 2 — Follow / Following for a CANONICAL restaurant.
///
/// This is the RESTAURANT follow domain (`restaurant_follows` +
/// `restaurant_public`), which is deliberately separate from user-to-user
/// follows (`follows` / `public_profiles.followersCount`). Nothing here touches
/// the user follow graph.
///
/// The write is always server-mediated (`followRestaurant` /
/// `unfollowRestaurant`); the client never writes `restaurant_follows`.
class RestaurantFollowButton extends ConsumerStatefulWidget {
  const RestaurantFollowButton({
    super.key,
    required this.canonicalPlaceId,
    this.onError,
  });

  /// The RESOLVED canonical restaurant identity. Callers must not pass an
  /// alias/provider place id — this widget is only mounted once the canonical
  /// Restaurant Profile V2 publication has resolved.
  final String canonicalPlaceId;

  final void Function(String message)? onError;

  @override
  ConsumerState<RestaurantFollowButton> createState() =>
      _RestaurantFollowButtonState();
}

class _RestaurantFollowButtonState
    extends ConsumerState<RestaurantFollowButton> {
  /// Guards against a duplicate action while a request is in flight.
  bool _busy = false;

  /// Optimistic local state; cleared once the server stream agrees.
  bool? _override;

  Future<void> _toggle(bool currentlyFollowing) async {
    if (_busy || widget.canonicalPlaceId.isEmpty) return;
    final previous = _override;
    setState(() {
      _busy = true;
      _override = !currentlyFollowing; // optimistic
    });
    try {
      final service = ref.read(restaurantEngagementServiceProvider);
      if (currentlyFollowing) {
        await service.unfollow(canonicalPlaceId: widget.canonicalPlaceId);
      } else {
        await service.follow(canonicalPlaceId: widget.canonicalPlaceId);
      }
      if (mounted) setState(() => _busy = false);
    } on RestaurantEngagementException catch (error) {
      // Failed call restores the previous state — no false success.
      if (!mounted) return;
      setState(() {
        _busy = false;
        _override = previous;
      });
      widget.onError?.call(error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _override = previous;
      });
      widget.onError?.call('restaurant_action_failed');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final mm = context.mm;
    final target = widget.canonicalPlaceId;

    final serverFollowing =
        ref.watch(myRestaurantFollowProvider(target)).valueOrNull ?? false;
    // Once the server agrees with the optimistic value, drop the override so
    // the stream is authoritative again.
    if (_override != null && _override == serverFollowing) {
      _override = null;
    }
    final following = _override ?? serverFollowing;
    final followers =
        ref.watch(restaurantFollowerCountProvider(target)).valueOrNull ?? 0;

    return Row(
      children: [
        SizedBox(
          height: 36,
          child: FilledButton.tonalIcon(
            key: const Key('restaurant-follow-button'),
            onPressed: _busy ? null : () => _toggle(following),
            icon: Icon(
              following ? Icons.check_rounded : Icons.add_rounded,
              size: 18,
            ),
            label: Text(
              following
                  ? t.t('restaurantFollowing')
                  : t.t('restaurantFollow'),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Text(
          '$followers ${t.t('restaurantFollowers')}',
          key: const Key('restaurant-follower-count'),
          style: TextStyle(fontSize: 13, color: mm.onCardMuted),
        ),
      ],
    );
  }
}
