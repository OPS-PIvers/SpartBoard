# PR Review Log

_Automated nightly review by claude-opus-4-6_

---

## 2026-04-14

- PRs reviewed:
  - #1285 — large in-flight refactor (ref-in-render pattern discussion)
  - #1287 — focused refactor (memoization key suggestion)
  - #1288 — author actively iterating (google-labs-jules)
  - #1291 — dev-paul branch (read-only, comment-only scope)
  - #1292 — fetchWeatherProxy host-whitelist hardening
  - #1293 — quiz session live-leaderboard (BLOCKING: missing `broadcastLiveLeaderboard`)
  - #1294 — widget transparency centralization (bgHex threading)
  - #1295 — Weather test cleanup (duplicate of #1296)
  - #1296 — Weather test cleanup (duplicate of #1295)
  - #1297 — DashboardContext.removeWidgets O(N+M) refactor
  - #1298 — quizDriveService O(N+M) stats refactor
  - #1299 — Firestore batched reads via Promise.all
  - #1300 — Firebase Storage rules tightening (get/list split)
- Comments processed: 20 total — 1 fixed, 19 explained
- Fixes pushed:
  - PR #1300 → `dependabot/...` branch cleanup: deleted 6 temporary `validate_status*.txt` artifacts via individual commits (`fix(pr-1300): remove temporary validate_status_N.txt artifact`)
- Reviews posted: 13
- Notes:
  - PR #1293 flagged as BLOCKING — `broadcastLiveLeaderboard` referenced in diff but not implemented in `hooks/useQuizSession.ts` on the head branch; consumers would crash at runtime.
  - PRs #1295 and #1296 are near-duplicates — recommended closing one.
  - PR #1291 is on `dev-paul` (dev-\* branch); per branch-safety policy, comments posted but no pushes.
  - PR #1294 touches `DraggableWindow` and `GlassCard` — visual QA pass recommended across representative widget set before merge.
  - Node modules were not installed locally; no `pnpm validate` runs possible. All fixes were low-risk file deletions or review comments that did not require local verification.

## 2026-04-15

- PRs reviewed:
  - #1285 — Dice Widget 10x UI Enhancement (head `dice-widget-10x-ui-enhancement-...`, base `dev-paul`)
  - #1305 — Dev paul (head `dev-paul`, base `main`) — read-only for pushes per branch-safety
- Comments processed: 15 total — 0 new fixes, 15 already addressed by prior runs
  - PR #1305: 1 inline thread (resolved) + 1 prior summary comment (3 issues still open at HEAD)
  - PR #1285: 14 inline threads, all replied to by previous runs; no new reviewer activity
- Fixes pushed: none
  - PR #1305 is on `dev-paul` (dev-\* branch) — pushes prohibited by branch-safety policy
  - PR #1285 had no new reviewer feedback requiring action; all prior threads already explained
- Reviews posted: 2
  - PR #1305: full structured review (CI green; 3 carryover items — `fetchWeatherProxy` misnomer, dead background div in `LunchCount/Widget.tsx:329`, hardcoded English in `StudentLeaderboard.tsx`)
  - PR #1285: refresher confirming HEAD unchanged since 2026-04-14 review, no new regressions
- Notes:
  - PR #1305 head SHA `d38c2270` — CI green across type-check, lint, unit tests, E2E, build, CodeQL, Docker build
  - PR #1285 head SHA `986f7dc6` — unchanged since last review; duplicate review was minimized to a brief refresher to avoid noise
  - No new PRs opened since last run

## 2026-04-16

- PRs reviewed:
  - #1318 — fix(admin): wire 6 widget building defaults into getAdminBuildingConfig (head `scheduled-tasks`, base `main`)
  - #1311 — Implement full-screen editor modal and address review feedback (head `dev-paul`, base `main`) — read-only for pushes per branch-safety
- Comments processed: 4 total — 0 fixed, 4 explained
  - PR #1318: 1 inline thread (gemini-code-assist style suggestion re: functional array methods) — replied explaining no fix needed (style preference, not correctness issue)
  - PR #1311: 3 inline threads, all already replied to by OPS-PIvers in prior conversation — no action needed
- Fixes pushed: none
  - PR #1318: the one comment was a style preference, not a bug or lint issue
  - PR #1311: on `dev-paul` (dev-\* branch) — pushes prohibited by branch-safety policy; all comments already addressed by author
- Reviews posted: 2
  - PR #1318: Ready with minor notes — clean code following existing patterns, fills genuine gap (dead admin UI for 6 widgets). One open style comment is non-blocking.
  - PR #1311: Needs changes — large PR (51 files, +4766/-1588) with 3 items to address before merge: (1) verify QuizSession.id semantics change doesn't break consumers, (2) fix DiceWidget Roll button scaling regression, (3) confirm composite Firestore index for allocateJoinCode. Also noted ~1,500 lines of new Quiz Assignment code with no test coverage.
- Notes:
  - PR #1318 head SHA `53d22f4c` — mergeable state clean
  - PR #1311 head SHA `8ead5797` — mergeable state clean; Firestore rules changes are well-secured with proper auth checks and ownership enforcement
  - PR #1311 has HIGH regression risk around QuizSession.id changing from teacher UID to session UUID

## 2026-04-17

- PRs reviewed:
  - #1329 — docs: refresh CLAUDE.md to match codebase (head `claude/update-claude-md-2m3wm`, base `dev-paul`)
  - #1328 — refactor(seating-chart): use ScaledEmptyState for empty states (head `claude/ui-improvement-with-tests-jEWzs`, base `dev-paul`, DRAFT)
  - #1326 — Add daily absent toggle and per-student restrictions features (head `dev-paul`, base `main`) — read-only for pushes per branch-safety
- Comments processed: 10 total — 0 fixed, 10 explained
  - PR #1329: 2 inline threads from copilot — both already addressed by the PR's own diff (removes `src/TestCalendar.tsx`; Docker workflow suggested wording already applied). Replies posted.
  - PR #1328: 7 inline threads, all marked `is_outdated: true`. 6 reference files not in this PR's 3-file diff (pre-existing dev-paul comments carried over); the 1 relevant SeatingChart i18n thread was already addressed by the PR moving strings to `locales/en.json`. Reply posted on the relevant thread.
  - PR #1326: 13 threads total — 10 previously replied to by OPS-PIvers (8 fixed, 2 explicitly declined with rationale). 3 threads remain unaddressed at HEAD; per branch-safety policy no pushes made, findings rolled into Phase 2 review.
- Fixes pushed: none
  - PR #1329: reviewer concerns already resolved by PR's own diff
  - PR #1328: all comments outdated; relevant one already addressed in-branch
  - PR #1326: on `dev-paul` (dev-\* branch) — pushes prohibited
- Reviews posted: 3
  - PR #1329: Ready — pure docs refresh correcting genuine drift (hook/API names, stale counts, duplicated blocks); bundled deletion of `src/TestCalendar.tsx` stub keeps the "no `src/`" claim accurate
  - PR #1328: Ready with minor notes — clean swap onto shared `ScaledEmptyState` primitive with 6 test cases and a regression guard for the legacy `text-sm`/`text-xs` pattern; noted pre-existing i18n gap that `de`/`es`/`fr` locales don't have the new keys (nor the sibling `emptyStateFreeform`/`emptyStateTemplate` keys)
  - PR #1326: Needs changes (minor) — 3 items flagged: (1) `AbsentStudentsModal.toggleStudent` still calls `setAbsentStudents` inside a `setLocalAbsentIds` updater (side effect in pure function), (2) `useRosters.setAbsentStudents` does `await updateDoc` with no try/catch after optimistic state update, (3) `RandomWidget` uses `widgets.random.markAbsentTitle` / `markAbsentAria` keys that aren't in `en.json` — inconsistent with sibling `widgets.random.absent.*` namespace
- Notes:
  - PR #1329 head SHA `3a52afaf` — small, low-risk docs-only change
  - PR #1328 head SHA `386fdc87` — DRAFT status; 3-file diff cleanly scoped to SeatingChart empty states
  - PR #1326 head SHA `c6498487` — large feature bundle (22 files, +1401/-268); RandomWidget refactor is +343/-217 and warrants a human eye at 30+ student rosters
