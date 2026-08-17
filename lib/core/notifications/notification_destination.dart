/// Safe, shared notification destination contract.
///
/// The backend stores only an internal route or a typed entity reference.  This
/// resolver never accepts external URLs and deliberately returns null when a
/// target cannot be represented safely by the current app.
library;

import '../constants/app_constants.dart';

class NotificationDestinationResolver {
  const NotificationDestinationResolver._();

  static String? resolve({
    required String? type,
    String? destinationId,
    String? deepLink,
  }) {
    if (_isSafeInternalRoute(deepLink)) return deepLink;

    final normalizedType = type?.trim() ?? '';
    final id = destinationId?.trim() ?? '';
    switch (normalizedType) {
      case 'social_reaction':
      case 'social_comment':
      case 'social_reply':
      case 'social_mention':
      case 'social_repost':
      case 'social_quote':
      case 'socialReaction':
      case 'socialComment':
      case 'socialReply':
      case 'socialMention':
      case 'socialRepost':
      case 'socialQuote':
        return id.isNotEmpty ? '/social/post/$id' : RoutePaths.social;
      case 'social_follow':
      case 'socialFollow':
        return id.isNotEmpty ? '/u/$id' : null;
      // PROMPT 2.2A — an invitee may NOT access the private group yet, so we do
      // NOT route to /groups/{id} (which would deny). Route to the existing
      // Groups-tab pending-invite inbox, which lists ONLY the current user's own
      // active invites (invitee == self). This safely handles every case:
      // active→shows the invite card (accept/decline); wrong-recipient→not in
      // their list (no exposure); accepted/declined/revoked/expired/missing→not
      // pending→not shown (safe). No new screen; reuses respondGroupInvite UI.
      case 'group_invite':
      case 'groupInvite':
        return '/social?tab=groups';
      case 'group_invite_accepted':
      case 'group_update':
      case 'groupInviteAccepted':
      case 'groupUpdate':
        return id.isNotEmpty ? '/groups/$id' : RoutePaths.group;
      case 'weekly_report_ready':
      case 'weeklyReportReady':
      case 'fit_reminder':
      case 'meal_reminder':
      case 'fitReminder':
      case 'mealReminder':
      case 'fit_coach':
      case 'fitCoach':
        return RoutePaths.fitToday;
      case 'subscription_updated':
      case 'trial_ending':
      case 'payment_issue':
      case 'subscriptionUpdated':
      case 'trialEnding':
      case 'paymentIssue':
      case 'subscription':
        return RoutePaths.paywall;
      case 'restaurant':
      case 'food_suggestion':
      case 'foodSuggestion':
      case 'reminder':
        return id.isNotEmpty ? '/restaurant/$id' : null;
      case 'social':
        return id.isNotEmpty ? '/u/$id' : RoutePaths.social;
      case 'group':
        return id.isNotEmpty ? '/groups/$id' : RoutePaths.group;
      case 'coupon':
        return '/coupon';
      case 'support':
        return '/support';
      case 'system':
        return _isSafeInternalRoute(id) ? id : null;
      // Account-security, campaign, Tong-Tong and system records are still
      // useful in the center, but do not navigate until a safe screen exists.
      default:
        return null;
    }
  }

  static bool _isSafeInternalRoute(String? value) {
    if (value == null || !value.startsWith('/') || value.startsWith('//')) {
      return false;
    }
    return !value.contains('://') && !value.contains('..');
  }
}
