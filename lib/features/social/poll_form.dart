/// QA-DEV17 — Client-side feed-poll FORM validation.
///
/// Pure (no Flutter/Firestore) so it is unit-testable and mirrors the server
/// `validateFeedPoll` (functions/src/domain/feedPoll/pollValidation.ts). The
/// server stays authoritative; this only drives the composer's Post enable
/// state and pre-submit cleanup.
const int kPollQuestionMin = 2;
const int kPollQuestionMax = 120;
const int kPollOptionMin = 2;
const int kPollOptionMax = 8;
const int kPollOptionLabelMax = 60;

/// A poll form is valid with a 2–120 char question and at least 2 DISTINCT
/// (case-insensitive), non-blank options.
bool isFeedPollFormValid(String question, List<String> options) {
  final q = question.trim();
  if (q.length < kPollQuestionMin || q.length > kPollQuestionMax) return false;
  final distinct = options
      .map((o) => o.trim().toLowerCase())
      .where((t) => t.isNotEmpty)
      .toSet();
  return distinct.length >= kPollOptionMin;
}

/// Trimmed, non-blank option labels (original order preserved) for submission.
/// The server re-validates, de-dupes and caps these.
List<String> cleanPollOptions(List<String> options) =>
    options.map((o) => o.trim()).where((t) => t.isNotEmpty).toList();
