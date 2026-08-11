/// Nama event kanonik AI Brain (Prompt 8). SATU gaya sahaja: snake_case.
/// Semua penulisan baru guna pemalar ini supaya konsisten antara client
/// dan backend. Jangan cipta nama ad-hoc di tempat lain.
class EventType {
  EventType._();

  // A. App / navigasi
  static const appOpen = 'app_open';
  static const homeView = 'home_view';
  static const screenView = 'screen_view';
  static const appError = 'app_error';

  // B. Konteks / keutamaan
  static const languageChanged = 'language_changed';
  static const profileUpdated = 'profile_updated';
  static const dietAllergyUpdated = 'diet_allergy_updated';
  static const budgetUpdated = 'budget_updated';
  static const radiusChanged = 'radius_changed';
  static const moodSelected = 'mood_selected';
  static const spinThemeChanged = 'spin_theme_changed';
  static const dietGoalUpdated = 'diet_goal_updated';
  static const fitGoalUpdated = 'fit_goal_updated';
  static const sportMoodSelected = 'sport_mood_selected';

  // C. Aliran cadangan
  static const spinStarted = 'spin_started';
  static const suggestionRequestStarted = 'suggestion_request_started';
  static const suggestionRequestCompleted = 'suggestion_request_completed';
  static const suggestionRequestFailed = 'suggestion_request_failed';
  static const suggestionPreviewShown = 'suggestion_preview_shown';
  static const suggestionShown = 'suggestion_shown';
  static const suggestionViewed = 'suggestion_viewed';
  static const restaurantDetailViewed = 'restaurant_detail_viewed';
  static const openMap = 'open_map';
  static const suggestionSkipped = 'suggestion_skipped';
  static const suggestionAccept = 'suggestion_accept';
  static const suggestionReject = 'suggestion_reject';
  static const noMoreSuggestions = 'no_more_suggestions';

  // D. Meal / sejarah
  static const mealLogged = 'meal_logged';
  static const mealEdited = 'meal_edited';
  static const mealDeleted = 'meal_deleted';
  static const sampleManualLog = 'sample_manual_log';

  // E. Simpan / kongsi
  static const favoriteAdded = 'favorite_added';
  static const favoriteRemoved = 'favorite_removed';
  static const shareClicked = 'share_clicked';

  // F. Monetisasi
  static const paywallViewed = 'paywall_viewed';
  static const upgradeClicked = 'upgrade_clicked';
  static const planChanged = 'plan_changed';
  static const lockedFeaturePreviewed = 'locked_feature_previewed';
  static const quotaLimitReached = 'quota_limit_reached';

  // Pro tools (Prompt 11)
  static const mealPlanViewed = 'meal_plan_viewed';
  static const mealPlanGenerated = 'meal_plan_generated';
  static const mealPlanRetry = 'meal_plan_retry';
  static const aiFoodCoachViewed = 'ai_food_coach_viewed';
  static const aiFoodCoachTipViewed = 'ai_food_coach_tip_viewed';
  static const aiFoodCoachRetry = 'ai_food_coach_retry';

  // G. Pro / Fit (hanya jika skrin sudah wujud)
  static const fitCoachOpened = 'fit_coach_opened';
  static const fitProfileUpdated = 'fit_profile_updated';
  static const fitTodayViewed = 'fit_today_viewed';
  static const monitorViewed = 'monitor_viewed';
  static const weeklyFitnessReportViewed = 'weekly_fitness_report_viewed';
  static const sportMoodPreviewed = 'sport_mood_previewed';
  static const workoutCompleted = 'workout_completed';
  static const workoutSkipped = 'workout_skipped';
  static const coachFeedbackSubmitted = 'coach_feedback_submitted';

  // H. Social Prompt 2: profil makanan awam
  static const publicProfileViewed = 'public_profile_viewed';
  static const publicProfileEditOpened = 'public_profile_edit_opened';
  static const followTapped = 'follow_tapped';
  static const dmComingSoonTapped = 'dm_button_tapped_coming_soon';
  static const profileBlockTapped = 'profile_block_tapped';
  static const profileReportTapped = 'profile_report_tapped';

  // I. Social Prompt 3: media viewer + interaksi post
  static const postMediaOpened = 'post_media_opened';
  static const postMediaClosed = 'post_media_closed';
  static const postLiked = 'post_liked';
  static const postUnliked = 'post_unliked';
  static const postCommentOpened = 'post_comment_opened';
  static const postShared = 'post_shared';
  static const postSaved = 'post_saved';
  static const postUnsaved = 'post_unsaved';
  static const postMoreOpened = 'post_more_opened';
  static const postReportTapped = 'post_report_tapped';
  static const postNotInterested = 'post_not_interested';

  // J. Social Prompt 4: unified composer + check-in
  static const composerOpened = 'composer_opened';
  static const composerClosed = 'composer_closed';
  static const composerTypeSelected = 'composer_type_selected';
  static const postCreated = 'post_created';
  static const checkinCreated = 'checkin_created';
  static const checkinSharedToFeed = 'checkin_shared_to_feed';
  static const checkinSavedToHistory = 'checkin_saved_to_history';
  static const composerPhotoAdded = 'composer_photo_added';
  static const composerVisibilityChanged = 'composer_visibility_changed';
  static const composerPostFailed = 'composer_post_failed';
  static const composerCancelled = 'composer_cancelled';

  // K. Social Prompt 5: Group Hub
  static const groupListViewed = 'group_list_viewed';
  static const groupHubViewed = 'group_hub_viewed';
  static const groupTabChanged = 'group_tab_changed';
  static const groupQuickActionTapped = 'group_quick_action_tapped';
  static const groupFeedPostOpened = 'group_feed_post_opened';
  static const groupPollViewed = 'group_poll_viewed';
  static const groupPollCreateTapped = 'group_poll_create_tapped';
  static const groupBillViewed = 'group_bill_viewed';
  static const groupBillCreateTapped = 'group_bill_create_tapped';
  static const groupMemberProfileOpened = 'group_member_profile_opened';
  static const groupAccessDeniedViewed = 'group_access_denied_viewed';

  // L. Social Prompt 6: Tong-Tong Bill attach ke post/check-in grup
  static const billCreateFromPostTapped = 'bill_create_from_post_tapped';
  static const billAttachOpened = 'bill_attach_opened';
  static const billAttachedToPost = 'bill_attached_to_post';
  static const billAttachFailed = 'bill_attach_failed';
  static const billOpenedFromPost = 'bill_opened_from_post';
  static const billLinkedPostOpened = 'bill_linked_post_opened';

  // M. Social Prompt 7: DM V1
  static const dmInboxViewed = 'dm_inbox_viewed';
  static const dmThreadOpened = 'dm_thread_opened';
  static const dmStartedFromProfile = 'dm_started_from_profile';
  static const dmMessageSent = 'dm_message_sent';
  static const dmSendFailed = 'dm_send_failed';
  static const dmMarkRead = 'dm_mark_read';
  static const dmBlockTapped = 'dm_block_tapped';
  static const dmReportTapped = 'dm_report_tapped';
  static const dmMuteToggled = 'dm_mute_toggled';

  // N. Social Prompt 8: repost + quote + multi-gambar
  static const repostSheetOpened = 'repost_sheet_opened';
  static const postReposted = 'post_reposted';
  static const quoteRepostStarted = 'quote_repost_started';
  static const quoteRepostCreated = 'quote_repost_created';
  static const repostBlockedPrivacy = 'repost_blocked_privacy';
  static const multiImageSelected = 'multi_image_selected';
  static const multiImageRemoved = 'multi_image_removed';
  static const mediaCarouselViewed = 'media_carousel_viewed';
  static const mediaViewerSwiped = 'media_viewer_swiped';
}

/// Mod sumber tindakan (bagaimana cadangan dihasilkan).
class SourceMode {
  SourceMode._();
  static const preview = 'preview';
  static const spin = 'spin';
  static const manual = 'manual';
  static const sample = 'sample';
  static const system = 'system';
}

/// Asal data hasil (untuk label jujur sample vs live).
class ResultSource {
  ResultSource._();
  static const googlePlaces = 'google_places';
  static const firestoreCache = 'firestore_cache';
  static const mockFallback = 'mock_fallback';
  static const demoPreview = 'demo_preview';
  static const manual = 'manual';
  static const unknown = 'unknown';
}

/// Nama skrin sumber (untuk analitik funnel).
class SourceScreen {
  SourceScreen._();
  static const home = 'home';
  static const suggestion = 'suggestion_screen';
  static const suggestionNext = 'suggestion_screen_next';
  static const restaurantDetail = 'restaurant_detail';
  static const explore = 'explore';
  static const profileMakanan = 'profile_makanan';
  static const paywall = 'paywall';
  static const spinButton = 'spin_button';
}
