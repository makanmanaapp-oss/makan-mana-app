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

    final followAsync = ref.watch(myRestaurantFollowProvider(target));
    final countAsync = ref.watch(restaurantFollowerCountProvider(target));

    // GATE 3F — an ERRORED read is not the same as "not following / 0
    // followers". Previously both providers were flattened with
    // `valueOrNull ?? false` / `?? 0`, so a Firestore permission or network
    // failure was rendered as an authoritative negative: the button said "Ikut"
    // and the count said 0 even after a follow had really been stored. Errors
    // are now surfaced as UNAVAILABLE instead of being answered with a lie.
    final serverFollowing = followAsync.valueOrNull;
    // Only drop the optimistic override once the server actually AGREES; a
    // failed read can no longer "confirm" anything.
    if (_override != null &&
        followAsync.hasValue &&
        _override == serverFollowing) {
      _override = null;
    }
    final following = _override ?? serverFollowing ?? false;
    final stateUnavailable = followAsync.hasError && _override == null;

    return Row(
      children: [
        SizedBox(
          height: 36,
          child: FilledButton.tonalIcon(
            key: const Key('restaurant-follow-button'),
            onPressed: _busy ? null : () => _toggle(following),
            icon: _busy
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Icon(
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
        _followerLabel(t, mm, countAsync, stateUnavailable),
      ],
    );
  }

  /// The follower slot carries the truth about readability: a real count when
  /// one was read, an explicit unavailable notice when the read failed, and
  /// nothing at all while it is still resolving. It never renders a fabricated
  /// 0, and never shows raw Firebase error text.
  Widget _followerLabel(
    AppLocalizations t,
    MMColors mm,
    AsyncValue<int> countAsync,
    bool stateUnavailable,
  ) {
    final style = TextStyle(fontSize: 13, color: mm.onCardMuted);
    if (countAsync.hasError || stateUnavailable) {
      return Flexible(
        child: Text(
          t.t('restaurantFollowersUnavailable'),
          key: const Key('restaurant-followers-unavailable'),
          overflow: TextOverflow.ellipsis,
          style: style,
        ),
      );
    }
    if (!countAsync.hasValue) {
      return const SizedBox(
        key: Key('restaurant-followers-loading'),
        width: 14,
        height: 14,
        child: CircularProgressIndicator(strokeWidth: 2),
      );
    }
    return Text(
      '${countAsync.requireValue} ${t.t('restaurantFollowers')}',
      key: const Key('restaurant-follower-count'),
      style: style,
    );
  }
}
