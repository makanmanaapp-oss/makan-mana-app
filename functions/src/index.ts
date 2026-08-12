import {setGlobalOptions} from "firebase-functions/v2";

import {REGION} from "./config/constants";

setGlobalOptions({region: REGION, maxInstances: 10});

export {getSuggestions} from "./callable/getSuggestions";
export {getNearbyPlaces} from "./callable/getNearbyPlaces";
export {submitFeedback} from "./callable/submitFeedback";
export {seedDefaultAlgoConfig} from "./callable/seedDefaultAlgoConfig";
export {updateBrainMetrics} from "./scheduled/updateBrainMetrics";
export {createFeedPost} from "./callable/createFeedPost";
export {toggleLike} from "./callable/toggleLike";
export {checkIn} from "./callable/checkIn";
export {submitReview} from "./callable/submitReview";
export {getWeeklyReport} from "./callable/getWeeklyReport";
export {onReviewApproved} from "./triggers/onReviewApproved";
export {onCommentChanged} from "./triggers/onCommentChanged";
export {updateProfile} from "./callable/updateProfile";
export {scanCalories} from "./callable/scanCalories";
export {adminReviewAction} from "./callable/adminReviewAction";
export {lunchReminder, dinnerReminder} from "./scheduled/mealReminders";
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
export {
  createGroupPoll,
  voteGroupPoll,
  closeGroupPoll,
  setGroupStatus,
} from "./callable/groupPoll";
export {updateFoodProfile} from "./callable/updateFoodProfile";
export {syncControlCenterMirrors} from "./controlCenter/mirrorSync";
