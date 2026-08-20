import {CreateNotificationCommand} from "./notificationService";

export const NOTIFICATION_FIXTURES = ["social_comment", "social_reaction", "system_announcement"] as const;
export type NotificationFixture = typeof NOTIFICATION_FIXTURES[number];

export function isNotificationFixture(value: unknown): value is NotificationFixture {
  return typeof value === "string" && (NOTIFICATION_FIXTURES as readonly string[]).includes(value);
}

/** Commands used only by the emulator-only callable fixture. */
export function notificationFixtureCommand(fixture: NotificationFixture, recipientUid: string): CreateNotificationCommand {
  const shared = {
    recipientUid,
    sourceEventId: `notification-fixture:${fixture}:${recipientUid}`,
    deepLink: fixture === "system_announcement" ? "/home" : "/social",
  };
  switch (fixture) {
    case "social_comment":
      return {...shared, type: "social_comment", actorUid: "fixture_actor", actorDisplaySnapshot: "MakanMana QA", titleKey: "notificationSocialCommentTitle", bodyKey: "notificationSocialCommentBody"};
    case "social_reaction":
      return {...shared, type: "social_reaction", actorUid: "fixture_actor", actorDisplaySnapshot: "MakanMana QA", titleKey: "notificationSocialReactionTitle", bodyKey: "notificationSocialReactionTitle"};
    case "system_announcement":
      return {...shared, type: "system_announcement", titleKey: "notificationSystemAnnouncementTitle", bodyKey: "notificationSystemAnnouncementTitle", priority: 1};
  }
}

/** A production-QA-only, tiny set. It contains no caller-controlled payload. */
export const NOTIFICATION_QA_FIXTURES = [
  "social_comment",
  "social_reaction",
  "system_announcement",
  "self_suppressed_social_reaction",
  "unavailable_target",
] as const;
export type NotificationQaFixture = typeof NOTIFICATION_QA_FIXTURES[number];

export function isNotificationQaFixture(value: unknown): value is NotificationQaFixture {
  return typeof value === "string" && (NOTIFICATION_QA_FIXTURES as readonly string[]).includes(value);
}

/**
 * Produces the only inputs accepted by the production QA callable. Recipient,
 * actor, route and localized copy are all server-selected. The resulting
 * source event is deterministic so retries remain deduplicated.
 */
export function notificationQaFixtureCommand(
  fixture: NotificationQaFixture,
  recipientUid: string,
): CreateNotificationCommand {
  if (fixture === "self_suppressed_social_reaction") {
    return {
      recipientUid, type: "social_reaction", actorUid: recipientUid,
      source: "qa_fixture", sourceEventId: `notification-qa:${fixture}:${recipientUid}`,
      titleKey: "notificationSocialReactionTitle", bodyKey: "notificationSocialReactionTitle",
    };
  }
  if (fixture === "unavailable_target") {
    return {
      recipientUid, type: "system_announcement", source: "qa_fixture",
      sourceEventId: `notification-qa:${fixture}:${recipientUid}`,
      entityType: "qa_unavailable", entityId: "qa-unavailable-target",
      titleKey: "notificationSystemAnnouncementTitle", bodyKey: "notificationSystemAnnouncementTitle",
    };
  }
  return {...notificationFixtureCommand(fixture, recipientUid), source: "qa_fixture", sourceEventId: `notification-qa:${fixture}:${recipientUid}`};
}
