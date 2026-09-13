# UI Reconciliation Matrix — approved baseline vs PR #26

Approved baseline: `rescue/ui-baseline-2026-09-07` @ `0a952416ff1ef66d6836dac49339084a2883f5c5`
Current runtime:   `hotfix/wave6-analytics-canonical-coverage` @ `cd4a04f00d9ab0e631fd119efabcc304284bdc3c`
Integration branch: `fix/pr26-ui-unlimited-discovery-20260913`

Every row was proved by diffing the two commits and by running the approved
test suites on PR #26. Nothing here is assumed.

---

## Structural findings (these reframe the whole audit)

**1. The branches are not peers.** They diverge at `60f6bf1`. The rescue branch
carries **3** commits; PR #26 carries **178**. Rescue is a preservation branch,
not a newer branch.

**2. No approved file is missing from PR #26.** Comparing the full trees, zero
`lib/` files and zero `test/` files exist in rescue but not in PR #26. PR #26
adds 26 further `lib/` files. Nothing was deleted — content diverged.

**3. The approved goldens are byte-identical.**
`git diff --stat <rescue> <pr26> -- test/goldens` is empty. Goldens are
pixel-exact locks on Home and Profile; identical goldens that still pass is
direct evidence the approved layout was not redrawn.

**4. Across `lib/features`, 47 files differ: 7,183 insertions vs 635 deletions.**
The overwhelming direction is PR #26 *adding* Wave 3–6 work (promotions,
canonical detail, merchant, engagement, menu comments), not removing approved UI.

**5. The approved suites pass unmodified on PR #26 — 182 tests.** Including
`main_navigation_pager`, "Activity swipes through tabs and keeps chips in sync",
"tapping a chip moves Activity content without refetching", Home hero voice,
Home layout order, Profile redesign, Malaysia state resolver, location
consistency and history edge-swipe handoff.

**Conclusion: the premise "several mobile pages regressed away from the approved
UI" is not supported by the source or the tests, with exactly one exception,
recorded below.** The device did show an older *Restaurant Detail*, but that is a
feature-flag state (canonical detail is debug/QA-gated), not lost UI code.

---

## Matrix

| Screen | Approved rescue behaviour | Current PR26 behaviour | Same/Diff | Intentional later change? | Action | Tests | Samsung |
|---|---|---|---|---|---|---|---|
| Home | Local hero, state greeting, mood chips, suggestion card | Identical layout **plus** `homeClockProvider` (test determinism) and a Wave 5 CMS slot that renders nothing when no banner is eligible | Diff (additive) | **Yes** — source comment states Home stays "byte-for-byte its approved layout" | Keep PR26 | `home_redesign_viewport`, `home_layout_order`, `home_local_hero_voice`, `home_food_hero_carousel` — PASS | PASS (boot screenshot) |
| Explore | Search box `onChanged` sets local `_query`; card routes `place.placeId` | Search delegates to `explorePaginationProvider.setSearchQuery`; card routes `canonicalPlaceId ?? placeId` | Diff | **Yes** — this *is* PR #26 | Keep PR26 (Section N) | `explore_pagination_controller`, `explore_redesign` — PASS | PASS |
| Spin / Suggestion | Suggestion screen + reject sheet | Same, minus the duplicate `restaurant_detail_viewed` hook (moved to the detail surface in Wave 6) | Diff (additive) | **Yes** | Keep PR26 | suggestion suites — PASS | PASS (McDonald's → reject → Richeese) |
| Activity / Notifications | Dark Activity + 6 filter tabs, swipe/tap sync | Identical UI; `markOpened` → `markRead` (API rename) | Diff (rename only) | **Yes** | Keep PR26 | `notification_activity`, `notification_screen_widget` — PASS incl. swipe/chip sync | Not yet re-checked |
| Notification Settings | Reachable from **Settings** *and* **Activity** | Reachable from **Activity only** — Settings entry removed | **Diff — REGRESSION** | **No** | **RESTORED** approved tile in Settings | analyze + suite PASS | Pending device |
| Profile | Sectioned flat redesign | Identical **plus** a Merchant Center entry | Diff (additive) | **Yes** | Keep PR26 | `profile_redesign` + goldens — PASS | Not yet re-checked |
| Restaurant Detail | Legacy redesign layout | Legacy layout **unchanged**; canonical detail added behind a debug/QA flag (+408 lines) | Diff (additive) | **Yes** | Keep PR26 | detail suites — PASS | PASS (legacy path renders, no crash) |
| History | — | — | **Identical** | n/a | No action | — | Not re-checked |
| Groups (Group Hub) | — | — | **Identical** | n/a | No action | — | Not re-checked |
| Social Feed (`post_card`) | Repost reads `originalSnapshot` | Wave 3C reads the original **live** (no stale content) | Diff | **Yes** | Keep PR26 | social suites — PASS | Not re-checked |
| Compose | Quote preview uses snapshot | Wave 3C live read | Diff | **Yes** | Keep PR26 | compose suites — PASS | Not re-checked |
| Food profile | — | — | **Identical** | n/a | No action | — | Not re-checked |
| Settings | Account / Appearance / **Notifications** / Language / Plan / Legal | Notifications section absent | **Diff — REGRESSION** | **No** | **RESTORED** | analyze PASS | Pending device |
| Bottom-nav shell (`app_shell`) | PageView/PageController swipe, tap+swipe synced | — | **Identical** | n/a | No action — already correct | `main_navigation_pager` — PASS | PASS |
| Swipe navigation | Horizontal PageView between nav pages | — | **Identical** | n/a | No action | `main_navigation_pager`, `history_edge_swipe_handoff` — PASS | Not re-checked |

---

## The single proven regression

`lib/features/settings/settings_screen.dart` lost the "Notifikasi (PROMPT 4)"
section between the baseline and the Wave 3+ lineage.

Counted precisely:

| | rescue | PR26 |
|---|---|---|
| `RoutePaths.notificationSettings` in Settings | 1 | **0** |
| `RoutePaths.notificationSettings` in Activity | 1 | 1 |

So the surface was never dead — the route and screen exist and Activity still
links to it. What was lost is one approved entry point, and Settings is where a
user goes looking for settings. Restored verbatim from the baseline, placed back
between Appearance and Language, with `firebaseReady` gating preserved.

## Deliberately not "restored"

Everything else that differs is later intentional work. Reverting it would
undo PR #26 and Waves 3–6, which Section N forbids. In particular the Explore
search delegation and the `canonicalPlaceId ?? placeId` route are PR #26 itself.

## Not yet re-verified on device

Activity, Notification Settings, Profile, Social feed, Compose, History, Groups
and swipe navigation have passing widget tests but have not been re-photographed
on the A05 since this change. They are marked "Not re-checked", not PASS.
