import {HttpsError, onCall} from "firebase-functions/v2/https";

import {createNotification} from "../domain/notifications/notificationService";
import {isNotificationQaFixture, notificationQaFixtureCommand} from "../domain/notifications/notificationFixture";
import {assertAdmin} from "../utils/adminAuth";

/**
 * Permanently hardened owner-only production QA path. It is intentionally
 * self-recipient only and accepts only a fixture name; no recipient, actor,
 * deep link, content or notification type can be supplied by a client.
 * App Check follows the project's current monitoring policy (not enforced).
 */
export const createNotificationQaFixture = onCall(async (request) => {
  const uid = assertAdmin(request);
  const fixture = request.data?.fixture;
  if (!isNotificationQaFixture(fixture)) {
    throw new HttpsError("invalid-argument", "Unknown QA notification fixture.");
  }
  const result = await createNotification(notificationQaFixtureCommand(fixture, uid));
  return "notificationId" in result ? result : {status: result.status};
});
