/** One shared, server-side notification contract. Feature modules may only
 * adapt their event into this contract; they must not write notification docs.
 */
export const NOTIFICATION_CATEGORIES = [
  "social", "group", "tongtong", "food", "fit", "report", "billing",
  "account", "security", "system", "marketing",
] as const;
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];

export const NOTIFICATION_TYPES = [
  "social_reaction", "social_comment", "social_reply", "social_mention", "social_follow", "social_repost", "social_quote",
  "group_invite", "group_invite_accepted", "group_update",
  "tongtong_bill_created", "tongtong_payment_request", "tongtong_payment_updated",
  "fit_reminder", "weekly_report_ready", "meal_reminder",
  "subscription_started", "subscription_renewed", "subscription_cancelled",
  "subscription_updated", "trial_ending", "payment_issue", "account_security",
  "system_announcement", "system_maintenance", "system_feature_update", "marketing_campaign",
] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];

const CATEGORY_BY_TYPE: Record<NotificationType, NotificationCategory> = {
  social_reaction: "social", social_comment: "social", social_reply: "social", social_mention: "social", social_follow: "social", social_repost: "social", social_quote: "social",
  group_invite: "group", group_invite_accepted: "group", group_update: "group",
  tongtong_bill_created: "tongtong", tongtong_payment_request: "tongtong", tongtong_payment_updated: "tongtong",
  fit_reminder: "fit", weekly_report_ready: "report", meal_reminder: "food",
  subscription_started: "billing", subscription_renewed: "billing", subscription_cancelled: "billing",
  subscription_updated: "billing", trial_ending: "billing", payment_issue: "billing", account_security: "security",
  system_announcement: "system", system_maintenance: "system", system_feature_update: "system", marketing_campaign: "marketing",
};

/** Only security/account events may bypass a user preference. */
export const CRITICAL_TYPES = new Set<NotificationType>(["account_security", "payment_issue"]);

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function categoryForType(type: NotificationType): NotificationCategory {
  return CATEGORY_BY_TYPE[type];
}

export function shouldSuppressSelf(actorUid: string | undefined, recipientUid: string, type: NotificationType): boolean {
  return actorUid === recipientUid && !CRITICAL_TYPES.has(type);
}

export function stableDedupKey(type: NotificationType, recipientUid: string, sourceEventId: string): string {
  return `${type}:${recipientUid}:${sourceEventId}`;
}

// ---------------------------------------------------------------------------
// PROMPT 4 — canonical user notification preferences.
//
// One authoritative record: users/{uid}.notificationPreferences =
//   { schemaVersion, master:{inAppEnabled,pushEnabled},
//     <category>:{inAppEnabled,pushEnabled}, ...,
//     quietHours:{quietHoursEnabled,quietHoursStart,quietHoursEnd,timezone} }
// The policy engine (createNotification + push delivery) is the ONLY place that
// decides eligibility; feature producers never submit preference flags.
// ---------------------------------------------------------------------------

/** Categories a user may control from Settings. Tong-Tong is frozen /
 *  contract-only, so it is intentionally NOT user-controllable here. */
export const USER_PREFERENCE_CATEGORIES: readonly NotificationCategory[] = [
  "social", "group", "food", "fit", "report",
  "billing", "account", "security", "system", "marketing",
] as const;

/** Conservative OPT-IN categories (missing => disabled). Everything else is
 *  opt-OUT (missing => enabled), preserving the current production default so
 *  existing users are never silently flipped. Only promotional `marketing` is
 *  opt-in, so a generic true-fallback can never auto-enable promotions. */
export const OPT_IN_CATEGORIES = new Set<NotificationCategory>(["marketing"]);

export interface EffectivePreference {
  inAppEnabled: boolean;
  pushEnabled: boolean;
}

/**
 * Resolve the EFFECTIVE in-app / push eligibility for one category from the
 * canonical preference map. Folds: critical bypass → master toggle → per-
 * category toggle → marketing opt-in default. Pure & deterministic; hydrates
 * legacy/missing docs with the documented defaults (no migration required).
 */
/** PROMPT 4A — persistence decision for the independent-channel contract. */
export interface PersistenceDecision {
  persist: boolean;
  inAppVisible: boolean;
}

/**
 * Decide whether one event persists a canonical NotificationRecord and whether
 * it is user-visible. In-app ON ⇒ visible record. In-app OFF but push
 * deliverable (push pref ON AND the type is push-eligible) ⇒ ONE canonical
 * record kept, `inAppVisible:false` (never shown / never counted, but present
 * for the secure push-tap resolution). Both off ⇒ no record.
 */
export function resolveNotificationPersistence(
  pref: EffectivePreference,
  pushEligibleType: boolean,
): PersistenceDecision {
  const pushDeliverable = pref.pushEnabled && pushEligibleType;
  return {
    persist: pref.inAppEnabled || pushDeliverable,
    inAppVisible: pref.inAppEnabled,
  };
}

export function resolvePreference(
  preferences: Record<string, unknown> | null | undefined,
  category: NotificationCategory,
  isCritical: boolean,
): EffectivePreference {
  // account_security / payment_issue always bypass EVERY user preference.
  if (isCritical) return {inAppEnabled: true, pushEnabled: true};
  const prefs = (preferences ?? {}) as Record<string, {inAppEnabled?: boolean; pushEnabled?: boolean} | undefined>;
  const master = prefs.master ?? {};
  const cat = prefs[category] ?? {};
  const optIn = OPT_IN_CATEGORIES.has(category);
  const catInApp = optIn ? cat.inAppEnabled === true : cat.inAppEnabled !== false;
  const catPush = optIn ? cat.pushEnabled === true : cat.pushEnabled !== false;
  return {
    inAppEnabled: master.inAppEnabled !== false && catInApp,
    pushEnabled: master.pushEnabled !== false && catPush,
  };
}
