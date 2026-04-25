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

## 2026-04-20

- PRs reviewed:
  - #1355 — 🧹 remove leftover console.log in adminAnalytics (head `code-health-remove-logs-admin-analytics-16413078109270849377`, base `dev-paul`)
  - #1354 — Refactor `useEffect` prop synchronization in `SidebarBackgrounds` (head `refactor-use-effect-prop-sync-2711741412273027246`, base `dev-paul`)
  - #1353 — fix(math-tools): scale empty-state and tab-bar spacing with cqmin (head `scheduled-tasks`, base `dev-paul`, DRAFT)
  - #1335 — Randomizer scaling/a11y, absent tracking, dock positioning, editor AI overlays (head `dev-paul`, base `main`) — read-only for pushes per branch-safety
- Comments processed: 15 total — 0 new fixes, 15 already addressed by prior runs
  - PR #1355: 0 review threads; 2 bot summary comments (gemini + copilot) with no actionable feedback
  - PR #1354: 0 review threads; 1 bot summary comment with no actionable feedback
  - PR #1353: 4 inline threads (1 outdated) — all already replied to by OPS-PIvers explaining non-actionability (3 reference files not in this PR's diff — `AbsentStudentsModal`, `useRosters`, `DraggableWindow` — fixed on `dev-paul`)
  - PR #1335: 11 inline threads — all already replied to by OPS-PIvers (9 fixed in `49ab44f7`/earlier commits, 2 declined with rationale for intentional `cqw`/`cqh` mix and PR-description update)
- Fixes pushed: none
  - No unaddressed comments remained requiring a code fix on any PR
- Reviews posted: 4
  - PR #1355: Ready — zero-risk single-file hygiene cleanup; all 13 CI checks green
  - PR #1354: Ready — correct implementation of CLAUDE.md's "adjusting state while rendering" pattern; behavior preserved; all 6 CI checks green
  - PR #1353: Ready with minor notes — MathTools scaling fix follows `cqmin` guidance; draft PR also bundles `tests/hooks/useLiveSession.test.ts` (not mentioned in PR body); recommend description update before marking ready
  - PR #1335: Needs changes (non-code) — 130+ file PR whose title/description cover only ~20% of the actual scope; bundles organization hierarchy (Organizations/Buildings/Domains/Roles/Users/StudentPage/Invites), full Library shell, and Manager/Importer refactor of four widgets (Quiz/MiniApp/VideoActivity/GuidedLearning) alongside the advertised Randomizer/dock/editor polish. Recommended splitting or rewriting the description. All 13 CI checks green. Flagged: `quizImportAdapter.ts` missing test coverage (sibling adapters have tests); `firestore.rules` +314 lines needs human verification; sibling changes to `AuthContext`/`AuthContextValue` may affect `getAdminBuildingConfig` permission-filtering path
- Notes:
  - PR #1355 head SHA `02822790` — 10 log lines + 1 unused counter removed from `functions/src/index.ts`
  - PR #1354 head SHA `d8cf3e3d` — two `useEffect`s converted in `SidebarBackgrounds.tsx`; `useEffect` still used for Google Drive fetch elsewhere in the file
  - PR #1353 head SHA `7a043e4a` — draft, no CI triggered; diff covers MathTools/Widget.tsx + 4 journal files + new `tests/hooks/useLiveSession.test.ts` (201 lines, 9 tests covering `joinSession` validation)
  - PR #1335 head SHA `5a78487e` — largest PR in the review cycle; rollback risk is very high if a regression ships

## 2026-04-22

- PRs reviewed:
  - #1377 — audit+action(scheduled-tasks): Wednesday 2026-04-22 — useQuizSession tests (head `scheduled-tasks`, base `dev-paul`, DRAFT)
  - #1376 — feat(auth): ClassLink-via-Google student SSO, PII-free (head `claude/distracted-fermi-040d18`, base `dev-paul`)
  - #1375 — fix(admin): scope analytics to org + sync buildings counter (head `claude/fix-admin-settings-alignment-uVLDu`, base `dev-paul`, DRAFT)
  - #1371 — Refactor adminAnalytics and enhance organization member management (head `dev-paul`, base `main`) — read-only for pushes per branch-safety
  - #1366 — docs: plan for repo-wide line-ending normalization (head `docs/line-endings-normalization-plan`, base `main`)
- Comments processed: 31 total — 0 new fixes, 31 already addressed by prior author responses
  - PR #1377: 0 inline threads; 1 bot review comment (gemini) with no findings
  - PR #1376: 3 inline threads, all already replied to by OPS-PIvers (1 declined pseudonym→name follow-up w/ reason, 1 confirmed fixed in `be6fc29`, 1 declined `cqmin` change w/ correct reasoning per CLAUDE.md)
  - PR #1375: 10 inline threads, all already addressed — 4 fixed in `060f206`, 3 fixed in `97c14c1`, 3 outdated — auth scoping, engagement bucket iteration, dead `buildingsMap`, chunk-failure isolation, test coverage, and UI loading state all resolved
  - PR #1371: 6 inline threads, all already replied to by OPS-PIvers (5 fixed in `15cfb65`, 1 documentation-scope deferral); branch is `dev-paul` so no pushes attempted regardless
  - PR #1366: 6 inline threads, all already replied to by OPS-PIvers (all reflected in the final plan doc — 3-PR structure, subject-based hash lookup, working-tree refresh warnings)
- Fixes pushed: none
  - No unaddressed comments remained requiring a code fix on any PR
- Reviews posted: 5
  - PR #1377: Ready — scheduled audit + 432-line `useQuizSession.test.ts`; flagged `DashboardContext.tsx` growth rate (projection >4500 lines in 5 weeks) as priority for extraction
  - PR #1376: Ready with minor notes — large SSO PR with sound security model; flagged deploy prerequisites (`STUDENT_PSEUDONYM_HMAC_SECRET`, `minInstances: 1`), legacy PIN-flow regression test, mini-app Apps Script → Firestore cutover, and Activity Wall fallback ordering
  - PR #1375: Ready — three well-targeted fixes (trigger-based building counter, orgId gating, admin-assigned `buildingIds` for labels); suggested correlation-id follow-up + dedicated test for never-signed-in member engagement contract
  - PR #1371: Ready with minor notes — 160+ file cumulative `dev-paul → main` merge; flagged initial-hydration empty `orgBuildings` window, `test:all` workflow change, absent tests for `DriveImagePicker` race path + new library primitives, and 944-line `QuizLiveMonitor` as follow-up extraction candidate
  - PR #1366: Ready — doc-only runbook, no runtime effect; suggested linking from `docs/DEV_WORKFLOW.md`
- Notes:
  - PR #1377 head SHA `0977c1c8` — adds `useQuizSession.test.ts` (24 tests) covering pure helpers + student-side join; teacher-side flows still untested
  - PR #1376 head SHA `e2253f58` — 35 files touched; `firestore.rules` +162 lines, `functions/src/index.ts` +522 lines, 568-line rules-test file for student-role class gate
  - PR #1375 head SHA `97c14c15` — 6 files; new `organizationBuildingCounters` trigger + test (5 cases); `functions/src/index.ts` +147/-88
  - PR #1371 head SHA `15cfb658` — cumulative merge, 160+ files; organization management (new Cloud Functions for reset-password/counters/activity), library folder subsystem, `DriveImagePicker`, migration of every admin panel from static `BUILDINGS` to dynamic `useAdminBuildings`
  - PR #1366 head SHA `7ffde284` — single doc (194 lines); no code impact; execution gated on "all open PRs merged" precondition
  - Branch-safety: PR #1371 is on `dev-paul` (matches `dev-*`) — pushes prohibited by policy; comment-only scope observed

## 2026-04-23

- PRs reviewed:
  - #1394 — fix(graphic-organizer): convert hardcoded padding/sizing to cqmin scaling (head `claude/beautiful-sagan-0wgop`, base `dev-paul`, DRAFT)
  - #1393 — audit: scheduled task journals — 2026-04-23 (Thursday) (head `scheduled-tasks`, base `dev-paul`, DRAFT)
  - #1392 — feat(assign): unified multi-class picker across Quiz/VA/GL (Phase 5A) (head `claude/phase-5a-planning-7y3lz`, base `main`, DRAFT)
  - #1391 — fix(rules): drop resource.data gate from session `get` to unbreak teacher Start (head `claude/fix-quiz-paused-status-ODQwk`, base `dev-paul`)
  - #1385 — fix(reset-password): surface resetUrl when email queue is disabled (head `paul/fix-reset-link-silent-failure`, base `main`)
  - #1382 — docs(admin): fill in ClassLink auth secret setup (OAuth client ID + HMAC gen) (head `docs/admin-setup-classlink-merge`, base `dev-paul`)
  - #1366 — docs: plan for repo-wide line-ending normalization (head `docs/line-endings-normalization-plan`, base `main`)
- Comments processed: 18 total — 0 new fixes, 18 explained
  - PR #1394: 3 inline threads (gemini) all `is_outdated: true` — verified each suggestion is already applied in the current branch HEAD `ebb9389` (Frayer marginTop/fontSize, KWL content padding/fontSize, Cause/Effect header padding/fontSize); replied to each with the current code location
  - PR #1393: 0 inline threads
  - PR #1392: 1 inline thread (gemini) — race-condition guard on `VideoActivityStudentApp.handleJoin`; replied as UX/product decision flagged for human review
  - PR #1391: 5 inline threads (copilot) — all requesting a `get`/`list` split on the five session collections' read rules. That's the exact shape PR #1390 shipped and which this PR is backing out because it empirically denied teacher single-doc subscriptions. Replied to each noting the architectural tradeoff is already addressed in the PR description's **Security impact** section and routing the decision to a human.
  - PR #1385: 5 inline threads — 2 already resolved, 3 unresolved but already have author rationale replies (declined data-migration, declined pagination on a short-lived script, confirmed docblock-only reconciliation); no further action needed
  - PR #1382: 1 inline thread already resolved by author
  - PR #1366: 6 inline threads — all have author replies from the 2026-04-21 iteration; no further action needed
- Fixes pushed: none
  - No unaddressed comments remained requiring a code fix on any PR. The PR #1394 gemini threads are already-applied suggestions (outdated line refs), PR #1391 copilot threads are architectural tradeoffs intentional to the PR, and PR #1385/#1382/#1366 threads all had prior author replies.
- Reviews posted: 7
  - PR #1394: Ready with minor notes — clean scaling follow-up; only gap is the unchecked visual-resize checklist item across all five layouts
  - PR #1393: Ready — routine journal bookkeeping, zero runtime impact
  - PR #1392: Ready with minor notes — Phase 5A multi-class picker across Quiz/VA/GL with sensible backward-compat rules helper; flagged `pnpm test:rules` still unchecked, `classIds[0] === undefined` edge case in four session hooks, and absence of automated coverage for the new multi-class + period-picker behaviors
  - PR #1391: Ready with minor notes — fixes empirically-observed teacher Start regression from #1390 and actively closes the rules-test gap with an end-to-end lifecycle suite + regression smoke across all five session collections + new CI `rules` job; flagged the deployed-rules diff + post-deploy smoke as still-unchecked
  - PR #1385: Ready — silent-auth-failure fix + backfill PASS 2 with solid CF test coverage; author's rationale on declined gemini suggestions is well-reasoned for a short-lived admin script
  - PR #1382: Ready — docs-only recovery of ClassLink + Google OAuth secret setup
  - PR #1366: Ready — doc-only 3-PR plan, internally consistent, six prior review threads all addressed
- Notes:
  - PR #1394 head SHA `ebb93899` — single-file cqmin rollout across 5 GraphicOrganizer layouts; 1423 unit tests clean; closes a scheduled-task journal item
  - PR #1393 head SHA `e47a3e8e` — 3 journal markdown files, date-only changes plus one sentence rewrite in typescript-eslint.md
  - PR #1392 head SHA `7dce8622` — 15 files: new `AssignClassPicker.{tsx,helpers.ts}` (+36/+292), 4 session hooks widened, `firestore.rules` +104/-45, `types.ts` +86/-26. Dual-write compat pattern (`classIds` + `classId = classIds[0]`) is sound.
  - PR #1391 head SHA `13934e92` — `firestore.rules` +52/-70 (five collections collapsed to `allow read`), `tests/rules/studentRoleClassGate.test.ts` +422/-21 (adds end-to-end lifecycle + PR #1391 regression suites), new `rules` job in `.github/workflows/pr-validation.yml`
  - PR #1385 head SHA `742b0ffb` — CF +15/-1, hook return-type widened, UI clipboard fallback (3 levels), backfill script PASS 2 +73/-8; 5 new CF tests
  - PR #1382 head SHA `73f71664` — single-file doc addition (`docs/ADMIN_SETUP.md` +78/-2) for `GOOGLE_OAUTH_CLIENT_ID`, `CLASSLINK_CLIENT_*` / `CLASSLINK_TENANT_URL`, and `openssl rand -hex 32` generation step
  - PR #1366 head SHA `7ffde284` — unchanged from 2026-04-22 log entry
  - Branch-safety: no head branches match `main` or `dev-*`; all 7 PRs are eligible for pushes, but no pushes were needed this run

## 2026-04-24

- PRs reviewed:
  - #1405 — fix(graphic-organizer): convert hardcoded padding to cqmin scaling (head `scheduled/graphic-organizer-padding-cqmin`, base `dev-paul`, DRAFT)
  - #1399 — chore(hardening): bundle 7 org-admin/student/AI fixes + backfill rescue (head `paul/hardening-bundle`, base `dev-paul`)
  - #1394 — fix(graphic-organizer): convert hardcoded padding/sizing to cqmin scaling (head `claude/beautiful-sagan-0wgop`, base `dev-paul`)
  - #1393 — audit: scheduled task journals — 2026-04-23 (Thursday) (head `scheduled-tasks`, base `dev-paul`)
  - #1366 — docs: plan for repo-wide line-ending normalization (head `docs/line-endings-normalization-plan`, base `main`)
- Comments processed: 13 total — 0 new fixes, 13 explained
  - PR #1405: 1 inline thread (gemini) `is_outdated: true` — verified `gap-4` is removed and `backgroundColor: cellBg` is only on the outer Cause-Effect wrapper, not on the inner Cause/Effect flex-1 boxes at head `bb06e899`; replied with the current code location
  - PR #1399: 12 inline threads total
    - 9 outdated threads (8 gemini + 1 copilot on `AuthContext.memberLastActiveSyncedKeyRef` + `@/` import) — all already applied in current branch HEAD `c393d6e0` (bucket-level `erroredBuckets`, per-(uid,orgId) throttle key, success-only `stampLastActive`, `@/utils/lastActiveThrottle` import); replied with concrete code references
    - 2 non-outdated copilot threads on `OrganizationPanel.ManualResetLinkModal` lines 885–886 — requested a `useEffect` conversion of the `lastUrl`/`copied` reset. Declined: this is the "adjusting state while rendering" pattern that CLAUDE.md explicitly endorses for resetting state on prop change; both branches are guarded and converge in one extra render pass. Replied with the CLAUDE.md citation and the rationale already inline in the source.
    - 1 non-outdated gemini thread on `UsersView.tsx` amber banner accessibility — deferred to a future design-system PR that unifies the partial-failure banner across MyAssignmentsPage / UsersView / GuidedLearningAIGenerator; replied with the deferral rationale and an immediate contrast note (amber-900 on amber-50 clears 4.5:1; amber-800/90 body text is borderline).
  - PR #1394: 3 inline threads — all resolved from the 2026-04-23 run; no further action needed
  - PR #1393: 0 inline threads
  - PR #1366: 6 inline threads — all have prior author addressing replies; no further action needed
- Fixes pushed: none
  - No unaddressed comments required a code fix. All actionable gemini/copilot suggestions are already implemented in each PR's current head. The two non-outdated architectural-pattern comments on #1399 are explicit CLAUDE.md-endorsed patterns; declining is the correct response.
- Reviews posted: 5
  - PR #1405: Ready with minor notes — complete cqmin conversion across all five GO layouts including Frayer absolute-pin `top-2 left-2`, Venn `mb-2` headers, KWL content `fontSize`, Cause-Effect arrow SVG `width/height="48"`. Overlaps with PR #1394 (same base) — recommend consolidating.
  - PR #1399: Ready with minor notes — 7-commit hardening bundle with strong test coverage (5 new CF test files + 1 context test + 2 unit tests). Flagged: `getOrgUserActivity` total-failure regression smoke, empty `classIds` token sign-out implication, no component test for `MyAssignmentsPage` partial-banner + retry, no test for the `ManualResetLinkModal` render-time state reset, UsersView amber-800/90 body text borderline WCAG AA.
  - PR #1394: Ready — clean mechanical cqmin conversion; merge-orderings with PR #1405 needs resolution
  - PR #1393: Ready — routine journal bookkeeping; zero runtime impact; `ai-integration.md` finding re: `generateGuidedLearning` rate-limit loss is a valuable follow-up tracked
  - PR #1366: Ready — 194-line doc-only 3-PR plan internally consistent; all six prior threads addressed; line 17 remediation + Step 2 clean-tree warning + grep-by-subject SQUASH_HASH capture all in place
- Notes:
  - PR #1405 head SHA `bb06e899` — single-file GraphicOrganizer cqmin rollout, 220-line diff; CI all green (7/7); superset of PR #1394's scope
  - PR #1399 head SHA `c393d6e0` — 22 files: 4 CF changes (+3 tests), 3 UI surfaces (MyAssignmentsPage, UsersView, OrganizationPanel, GuidedLearningAIGenerator), 1 throttle util, 3 context/script/test changes. CI all green (7/7). 1546 tests pass.
  - PR #1394 head SHA `3264866f` — 220-line diff on single file; CI all green (7/7); 1423 unit tests clean
  - PR #1393 head SHA `969c5cfa` — 6 markdown journals; date-only changes plus one new MEDIUM finding (generateGuidedLearning post-#1368 regression) and one new LOW finding (useScreenRecord/useLiveSession state density)
  - PR #1366 head SHA `7ffde284` — unchanged from previous entries; 9/9 CI checks green including CodeQL
  - Branch-safety: no head branches match `main` or `dev-*`; all 5 PRs eligible for pushes, but no pushes were needed this run
