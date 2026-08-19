import {HttpsError, onCall} from "firebase-functions/v2/https";

import {createNotification} from "../domain/notifications/notificationService";
import {isNotificationFixture, notificationFixtureCommand} from "../domain/notifications/notificationFixture";

/** QA-only fixture. It rejects every non-emulator runtime. */
export const createNotificationFixture = onCall(async (request) => {
  if (process.env.FUNCTIONS_EMULATOR !== "true") {
    throw new HttpsError("failed-precondition", "Notification fixture is emulator-only.");
  }
  const uid = request.auth?.uid;
  const fixture = request.data?.fixture;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in is required.");
  if (!isNotificationFixture(fixture)) throw new HttpsError("invalid-argument", "Unknown notification fixture.");
  return createNotification(notificationFixtureCommand(fixture, uid));
});
