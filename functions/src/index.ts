import {setGlobalOptions} from "firebase-functions/v2";

import {REGION} from "./config/constants";

setGlobalOptions({region: REGION, maxInstances: 10});

export {getSuggestions} from "./callable/getSuggestions";
export {getNearbyPlaces} from "./callable/getNearbyPlaces";
export {submitFeedback} from "./callable/submitFeedback";
export {seedDefaultAlgoConfig} from "./callable/seedDefaultAlgoConfig";
export {updateBrainMetrics} from "./scheduled/updateBrainMetrics";
export {recalculateUserBrain} from "./callable/recalculateUserBrain";
export {resetUserBrain} from "./callable/resetUserBrain";
export {createFeedPost} from "./callable/createFeedPost";
export {repostFeedPost} from "./callable/repostFeedPost";
export {toggleLike} from "./callable/toggleLike";
export {checkIn} from "./callable/checkIn";
export {submitReview} from "./callable/submitReview";
export {getWeeklyReport} from "./callable/getWeeklyReport";
export {onReviewApproved} from "./triggers/onReviewApproved";
export {onPostVisibilityChanged} from "./triggers/onPostVisibilityChanged";
export {onCommentChanged} from "./triggers/onCommentChanged";
export {updateProfile} from "./callable/updateProfile";
export {scanCalories} from "./callable/scanCalories";
export {saveScanMeal} from "./callable/saveScanMeal";
export {adminReviewAction} from "./callable/adminReviewAction";
export {hideLegacyAutoPosts} from "./callable/hideLegacyAutoPosts";
export {mealReminderBackfill, mealReminderDispatch} from "./scheduled/mealReminders";
export {
  editUserPost,
  deleteUserPost,
  editUserComment,
  deleteUserComment,
} from "./callable/userContentControl";
// V4 Social + Group
export {
  followUser,
  unfollowUser,
  muteUser,
  blockUser,
  reportContent,
} from "./callable/followControl";
export {
  createGroupV2,
  joinGroupV2,
  addGroupMember,
  removeGroupMember,
  changeGroupRole,
  updateGroupSettings,
  pinGroupItem,
} from "./callable/groupControl";
// HOTFIX 4.5C — imej grup server-mediated V2 (signed upload/resolve).
export {
  prepareGroupImageUploadV2,
  finalizeGroupImageUploadV2,
  getGroupImageUrlV2,
  getGroupImageUrlsV2,
  removeGroupImageV2,
} from "./callable/groupImageControl";
// HOTFIX 4.6 — secure group invite links + people search.
export {
  createGroupInviteLinkV2,
  getGroupInviteLinkInfoV2,
  joinGroupByInviteLinkV2,
  revokeGroupInviteLinkV2,
  listGroupInviteLinksV2,
} from "./callable/groupInviteLinkControl";
export {searchPeopleV2} from "./callable/peopleSearchControl";
// HOTFIX 4.6A — admin-gated people-search backfill (dry-run by default).
export {backfillPeopleSearchLowerV2} from "./callable/peopleSearchBackfillControl";
export {
  createGroupPoll,
  voteGroupPoll,
  closeGroupPoll,
  setGroupStatus,
} from "./callable/groupPoll";
// FIX 3: jemputan grup peribadi + pemadaman grup selamat (owner soft-delete).
export {
  inviteToGroup,
  respondGroupInvite,
  cancelGroupInvite,
  deleteGroupV2,
} from "./callable/groupInvites";
export {updateFoodProfile} from "./callable/updateFoodProfile";
// PROMPT 12: kupon Pro Trial
export {redeemCoupon} from "./callable/redeemCoupon";
export {refreshMyPlanStatus} from "./callable/refreshMyPlanStatus";
// FINAL PRE-AAB — verifikasi langganan Google Play (server-authoritative).
export {prepareGooglePlayBilling} from "./callable/prepareGooglePlayBilling";
export {verifyGooglePlaySubscription} from "./callable/verifyGooglePlaySubscription";
export {handleGooglePlayRtdn} from "./triggers/handleGooglePlayRtdn";
export {createCoupon} from "./callable/createCoupon";
export {expireCouponTrials} from "./scheduled/expireCouponTrials";
// Notification V2 - push device registry + user preferences.
export {registerPushDevice, unregisterPushDevice} from "./callable/pushDeviceControl";
export {setNotificationPreferences} from "./callable/notificationPreferences";

// Phase 1.14A — callable pembetulan dipercayai (BELUM DI-DEPLOY; berpagar-pemilik).
export {submitPlaceCorrection} from "./callable/submitPlaceCorrection";
export {nextSuggestion} from "./callable/nextSuggestion";
// Notification V2 - trusted Control Center test bridge.
export {controlCenterNotificationAdminBridge} from "./triggers/controlCenterNotificationAdminBridge";

// Notification V2 - bounded broadcast worker; runtime gates remain OFF unless explicitly enabled.
export {broadcastFanout} from "./scheduled/notificationBroadcast";

// Notification V2 - Supabase control-plane claim/sync worker.
export {broadcastControlPlaneSync} from "./scheduled/notificationBroadcastControlPlane";

// Control Center — privacy-safe production sync/control bridges.
export {syncPlaceCoverageToControlCenter} from "./controlCenter/placeCoverageSync";
export {
  syncAiBrainToControlCenter,
  syncAiBrainProfileMirrorToControlCenter,
} from "./controlCenter/aiBrainSync";
export {syncPlaceReferencesToControlCenter} from "./controlCenter/placeReferenceSync";
export {
  syncUserToDataVault,
  syncSocialPostToDataVault,
  syncAiBrainProfileToDataVault,
  reconcileUniversalDataVault,
} from "./controlCenter/dataVaultSync";
export {controlCenterAiBrainAdminBridge} from "./controlCenter/aiBrainAdminBridge";
export {
  syncSubscriptionsToControlCenter,
  syncSubscriptionsToControlCenterEvery5Hours,
} from "./controlCenter/subscriptionMirrorSync";
export {
  syncUsersToControlCenter,
  syncUsersToControlCenterEvery5Hours,
} from "./controlCenter/userMirrorSync";
export {
  syncCouponsToControlCenter,
  syncCouponsToControlCenterEvery5Hours,
} from "./controlCenter/couponMirrorSync";
export {controlCenterCouponAdminBridge} from "./controlCenter/couponAdminBridge";
