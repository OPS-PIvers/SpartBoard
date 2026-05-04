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

## 2026-04-27

- PRs reviewed:
  - #1429 — test(useQuizSession): cover useQuizSessionTeacher actions (head `scheduled-tasks`, base `dev-paul`, DRAFT)
  - #1428 — fix: quiz menu callback types + dialog focus on destructive variants (head `claude/quiz-menu-and-dialog-hardening`, base `dev-paul`)
  - #1422 — (dev-paul → main) Refactor quiz and PLC features with multiple fixes and enhancements (head `dev-paul`, base `main`) — read-only for pushes per branch-safety
  - #1414 — chore(plcs): retire VITE_ENABLE_PLCS dev feature flag (head `claude/adoring-ramanujan-cr4CY`, base `main`, DRAFT)
  - #1366 — docs: plan for repo-wide line-ending normalization (head `docs/line-endings-normalization-plan`, base `main`)
- Comments processed: 11 inline review threads + 5 PR-level issue comments — 0 new fixes, all already addressed by prior author replies
  - PR #1429: 0 inline threads; 1 bot summary review (gemini) with no findings
  - PR #1428: 0 inline threads; 2 bot summary reviews (gemini + copilot) with no findings
  - PR #1422: 2 inline threads (gemini) — both `is_outdated: true` and already replied to with "fixed in 163e577" (`useCallback` import + memoized `getManualResetUrl` for `ManualResetLinkModal`); 3 PR-level comments from OPS-PIvers flagging follow-up issues (AssignmentArchiveCard a11y, PlcInviteAcceptance stuck-state, hardcoded `CLAIM_URL_ORIGIN`) — surfaced into Phase 2 review
  - PR #1414: 3 inline threads (1 gemini + 2 copilot) — all replied to: 2 fixed in `07cfae3` (lifted `usePlcs`/`usePlcInvitations` to Sidebar parent), 1 fixed in `693ebf3` (added `enabled?: boolean` option to both hooks); 1 PR-level OPS-PIvers comment about #1422 cross-PR coordination already on file
  - PR #1366: 6 inline threads (all `is_outdated: true`) + 1 OPS-PIvers PR-level comment — all addressed in the current head doc since the 2026-04-21 iteration; previously confirmed across three prior automated runs
- Fixes pushed: none
  - No unaddressed comments required a code fix on any PR. All actionable gemini/copilot suggestions are already implemented in each PR's current head. The three flagged PR-level items on #1422 (a11y, stuck-state, CLAIM_URL_ORIGIN) were rolled into the Phase 2 review as merge-blocking notes since they affect production correctness and touch a `dev-paul → main` integration.
- Reviews posted: 5
  - PR #1429: Ready — 16 well-structured Vitest tests (~547 LoC) closing the `useQuizSessionTeacher` coverage gap (`removeStudent`, reveal/hide, `endQuizSession`, `advanceQuestion` including review-phase gate, startedAt-once, advance-past-end with finalize). Auto-progress effect remains the next gap, documented in `test-coverage.md`.
  - PR #1428: Ready with minor notes — clean dialog safety + type-widening fix; suggested adding a Vitest covering the destructive-variant Enter-suppression + Cancel-autofocus contract so the UX guarantee is regression-protected.
  - PR #1422: Needs changes — 89-file integration of PLCs + NeedDoPutThen widget + quiz hardening + reset-link modal + user-activity throttle. CI green and test discipline strong on most surfaces. Three blockers before merge to main: (1) author-flagged AssignmentArchiveCard `OverflowMenu` missing `aria-label` / `aria-haspopup` / `aria-expanded` / Escape handler (WCAG AA), (2) author-flagged `PlcInviteAcceptance` stuck `wrong-account` state after sign-out → sign-in (`if (load.kind !== 'idle') return;` guard short-circuits before re-fetch), (3) no `tests/rules/plc.test.ts` despite +255-line firestore.rules change for new PLC collections. Also flagged: hardcoded `CLAIM_URL_ORIGIN` in `plcInviteEmails.ts` breaks dev-preview testing; `DashboardContext.tsx` -28 net-line change warrants careful review of `getAdminBuildingConfig`; multi-feature dev-branch PR shape is a process observation worth discussing.
  - PR #1414: Ready with minor notes — clean retirement of `VITE_ENABLE_PLCS` flag plus thoughtful listener consolidation (Sidebar owns single `usePlcs`/`usePlcInvitations` pair; `enabled: isOpen` pauses subscriptions when drawer closed; net 6 → 3 → 0 listener reduction). Two follow-ups: (1) coordinate workflow-level `# DEV-FLAG` cleanup with #1422's flag introduction, (2) add Vitest covering the `enabled: false` gate on both hooks.
  - PR #1366: Ready — fourth automated daily review on this branch with no content change since 2026-04-21; nothing material to add. All six prior threads still addressed. Plan execution still gated on "no open PRs" precondition (5 open today, so not yet eligible).
- Notes:
  - PR #1429 head SHA `9a27ff99` — tests + journal updates only; CI 7/7 green (Build, Unit Tests, E2E, Code Quality, Firestore Rules, Docker, summary)
  - PR #1428 head SHA `e9c6c1dd` — 2 files (`DialogContainer.tsx` +6/-3, `QuizManager.tsx` +16/-16); CI 11/11 green
  - PR #1422 head SHA `163e577f` — 89 files, +~9k LoC; new PLC subsystem (`hooks/usePlcs.ts`, `hooks/usePlcInvitations.ts`, `components/auth/PlcInviteAcceptance.tsx`, `functions/src/plcInviteEmails.ts`, `utils/plc.ts`), new `NeedDoPutThen` widget (Widget 706 LoC + Settings 379 LoC + admin panel 65 LoC + 4 config-file additions), quiz hardening (deterministic response-key + permission-denied legacy-key fallback + Drive export service), `firestore.rules` +255/-23, `types.ts` +150/-25, `context/DashboardContext.tsx` +38/-66, hooks: `useTestClassRosters.ts` deleted (-113); CI 7/7 green
  - PR #1414 head SHA `693ebf39` — 4 files (`Sidebar.tsx` +44/-18, `SidebarPlcs.tsx` +19/-6, `usePlcInvitations.ts` +18/-5, `usePlcs.ts` +14/-3); CI 10/10 green
  - PR #1366 head SHA `7ffde284` — unchanged since 2026-04-21; 9/9 CI checks green
  - Branch-safety: PR #1422 is on `dev-paul` (matches `dev-*`) — pushes prohibited by policy, comment-only scope observed; the other 4 PRs are on safe branches

## 2026-04-28

- PRs reviewed:
  - #1437 — audit + fix(deps,hono): Tuesday 2026-04-28 — patch hono CVEs + journal updates (head `scheduled-tasks`, base `dev-paul`, DRAFT)
  - #1414 — chore(plcs): retire VITE_ENABLE_PLCS dev feature flag (head `claude/adoring-ramanujan-cr4CY`, base `main`, DRAFT)
  - #1366 — docs: plan for repo-wide line-ending normalization (head `docs/line-endings-normalization-plan`, base `main`)
- Comments processed: 10 inline review threads + 1 PR-level issue comment — 1 fix pushed, 9 + 1 explained
  - PR #1437: 1 inline thread (gemini, `is_outdated: true`) flagging EmbedWidget audit-entry inaccuracies (portal context, line numbers) — already addressed in current branch state of `css-scaling.md` (entry now explicitly notes `createPortal` to `document.body`, corrected line numbers 443/437/457/426, presents two fix options instead of a non-working `cqmin` conversion); replied with explanation, no fix pushed
  - PR #1414: 3 inline threads — all `is_outdated: true` and previously addressed in earlier commits (`07cfae3` lifted hooks to `Sidebar`, `693ebf3` added `enabled?: boolean` option); 1 of 3 now `is_resolved: true`; no new action needed
  - PR #1366: 6 inline threads (all `is_outdated: true` from 2026-04-21 round, all with addressing replies in commit `7ffde28`) + 1 PR-level issue comment from 2026-04-22 about reversed `--ours`/`--theirs` semantics during `git rebase` — the issue comment was a valid, concrete documentation improvement not yet in the doc; pushed fix `af5c404` adding a sub-bullet under Step 5 explaining the reversed semantics and warning against swapping to `--ours`; replied to the issue comment
- Fixes pushed: 1
  - PR #1366 / `docs/line-endings-normalization-plan` → commit `af5c404` "docs(line-endings): note reversed --ours/--theirs semantics during rebase" — addresses 2026-04-22 issue comment about rebase-vs-merge `--ours`/`--theirs` semantics; one-line addition, prettier check clean
- Reviews posted: 3
  - PR #1437: Ready — surgical Tuesday run with double-bumped hono in both `devDependencies` and `pnpm.overrides` (necessary because the override pinned the dep graph at 4.11.4 even though semver allowed newer); closes the open HIGH hono CVE class; 7/7 CI green; recommends `@google/genai@^1.50.1` as the natural follow-up to clear the new HIGH protobufjs entry + the existing MCP SDK MEDIUM in one shot
  - PR #1414: Ready with minor notes — same assessment as 2026-04-27 since head sha `693ebf39` unchanged; flag-retirement + listener-consolidation (0 listeners closed, 3 open vs prior 6) all sound; cross-PR coordination with #1422's `VITE_ENABLE_PLCS: 'true'` workflow addition still outstanding; tests for `enabled: false` gate still missing
  - PR #1366: Ready — new commit `af5c404` addresses the open `--theirs`/`--ours` rebase-semantics issue comment; all six prior review threads still have addressing replies; plan execution still gated on "no open PRs" precondition (3 open today, so not eligible to execute yet)
- Notes:
  - PR #1437 head SHA `4fc7e9fd` — 6 files: 4 markdown audit journals + `package.json` (hono override + devDep bump 4.11.4 → 4.12.14) + `pnpm-lock.yaml` (resolved 4.12.15 propagating through `@hono/node-server`, `@modelcontextprotocol/sdk`, `@google/genai`, `firebase-tools` peer brackets); 7/7 CI green; 1511 tests pass per PR description
  - PR #1414 head SHA `693ebf39` — unchanged from 2026-04-27 entry; 10/10 CI green
  - PR #1366 head SHA `af5c404a` (was `7ffde284` before this run) — added one commit in this run; CI re-running at time of review; doc grew by exactly one bulleted sentence under Step 5
  - Branch-safety: no head branches match `main` or `dev-*`; all 3 PRs eligible for pushes; only PR #1366 received a push this run

## 2026-04-29

- PRs reviewed:
  - #1445 — Enhance SSO student experience with quiz auto-join and dashboard updates (head `dev-paul`, base `main`) — READ-ONLY (dev-\* branch, no pushes per branch-safety policy)
  - #1437 — test(utils): add coverage for backgrounds.ts and slug.ts — Wed 2026-04-29 (head `scheduled-tasks`, base `dev-paul`)
  - #1414 — chore(plcs): retire VITE_ENABLE_PLCS dev feature flag (head `claude/adoring-ramanujan-cr4CY`, base `main`, DRAFT)
  - #1366 — docs: plan for repo-wide line-ending normalization (head `docs/line-endings-normalization-plan`, base `main`)
- Comments processed: 13 inline review threads — 0 fixed, 2 explained, 11 already-resolved-and-noted
  - PR #1445: 2 unresolved inline threads — copilot on `QuizAssignmentSettingsModal.tsx:178` (PLC toggle silent state) and gemini on `QuizStudentApp.tsx:935` (setSubmitted-before-await UX); both reply-explained — neither qualifies for an automated fix (product/UX decisions requiring human judgment), and the `dev-paul` head branch is read-only for the auto-fix workflow regardless
  - PR #1437: 4 threads — 1 `is_resolved: true`, 3 `is_outdated: true` with prior OPS-PIvers addressing replies; no action needed
  - PR #1414: 3 threads — 1 `is_resolved: true`, 2 `is_outdated: true` with prior OPS-PIvers addressing replies; no action needed
  - PR #1366: 6 threads — all `is_outdated: true` with prior OPS-PIvers addressing replies from 2026-04-21 / 2026-04-22 rounds; no action needed
- Fixes pushed: 0
- Reviews posted: 4
  - PR #1445: Ready with minor notes — large multi-surface bundle (66 files, +5.6k/-1.5k) covering SSO routing, student dashboard redesign, PLC sheet UX, ClassLink real/test class metadata, quiz scoreboard SSO support; comprehensive test additions (rules, hook, util, component); 11/11 CI green; flagged: deployment-coordination needed for `firestore.indexes.json` (+123 lines of new composite indexes) before code paths run, possibly-unrelated `docs/classroom-addon-integration-plan.md` (+1000 lines) bundled in, scope is wide enough that splitting future passes would help review/rollback
  - PR #1437: Ready — routine scheduled-tasks PR, additive test coverage only (`utils/backgrounds.test.ts` 21 tests + `utils/slug.test.ts` 20 tests), `hono` override bumped 4.11.4 → 4.12.14, 10 audit journals updated; 7/7 CI green
  - PR #1414: Ready — same assessment as 2026-04-28 since head sha `693ebf39` unchanged; flag-retirement + listener-consolidation; 10/10 CI green; minor gap noted (no explicit unit test for `enabled: false` branch)
  - PR #1366: Ready — doc-only, all earlier reviewer feedback already folded in; 10/10 CI green; execution still gated on "no open PRs" precondition (3 other open PRs today)
- Notes:
  - PR #1445 head SHA `98cc1fea` — 66 files; new Cloud Function `getStudentClassDirectoryV1` + extended `getPseudonymsForAssignmentV1` need a functions deploy; new `studentRole` deny rule on dashboards subcollections + tolerated missing pin/name for SSO responses; `App.tsx` routing guard relies on the new `roleResolved` signal from `AuthContext`
  - PR #1437 head SHA `e0b75a3e` — 14 files (10 docs + 2 new test files + package.json + pnpm-lock.yaml)
  - PR #1414 head SHA `693ebf39` — unchanged since 2026-04-25; 4 files
  - PR #1366 head SHA `af5c4043` — unchanged since 2026-04-28; 1 file (doc-only)
  - Branch-safety: PR #1445 head `dev-paul` matches `dev-*` pattern → no pushes attempted; reply-only on its 2 unresolved comments. The other 3 PRs were eligible for pushes but none required code fixes this run.

## 2026-05-01

- PRs reviewed:
  - #1470 — refactor(dashboard): extract mergeWidgetConfig + Friday 2026-05-01 audit (head `scheduled-tasks`, base `dev-paul`, DRAFT)
  - #1469 — feat(navigation): replace top-toolbar board picker with bottom-left FAB cluster (head `claude/redesign-board-navigation-gCWoW`, base `dev-paul`)
  - #1468 — chore(pr1466-cleanup): refactor effect-based ref reset, setState deferral, and Drive error classification (head `feature/pr1466-cleanup`, base `dev-paul`)
  - #1366 — docs: plan for repo-wide line-ending normalization (head `docs/line-endings-normalization-plan`, base `main`)
- Comments processed: 9 total — 4 fixed (PR #1366 doc improvements bundled into one commit), 5 explained
  - PR #1470: 1 outdated inline thread (gemini-code-assist on `ai-integration.md` wording for the `magic-layout` fix description) — reply-explained, no code change (wording suggestion, comment is outdated, the actual implementation when this finding is acted on will be a single-line `functions/src/index.ts` change)
  - PR #1469: 10 inline threads — most outdated and addressed in subsequent commits on the branch (role=menu instead of listbox, focus management on open/close, full keyboard handler, useCallback wrapping of click-outside handler, focus-visible rings on menu items, length-truncation cleanup of itemRefs); 2 still-open threads reply-explained pointing at the addressing lines; 1 (gemini high-priority on music FAB opposite-side placement) declined by author with prior rationale, no further action
  - PR #1468: 2 unresolved inline threads (copilot suggesting `useRef` over `useState` for `prevUid` / `prevSessionId`) — both reply-explained: the `useState`-based "adjusting state while rendering" pattern is React's documented approach (per `CLAUDE.md`) and the synchronous re-render is intentional to avoid one-frame stale-data flashes
  - PR #1366: 4 issue-level comments from prior review rounds (Step 3 grep case-sensitivity, Steps 3/4 ordering, Step 5 missing `git add` / `git rebase --continue`, Step 4 `--ignore-all-space` over-broad) — all 4 fixed in a single commit on the branch
- Fixes pushed:
  - PR #1366 → `docs/line-endings-normalization-plan` branch: commit `da8f094` `docs(pr-1366): apply 4 review fixes to line-endings normalization plan` — Steps 3/4 swapped (verification now precedes squash-hash PR step), `SQUASH_HASH` lookup uses `grep -i` plus an explicit empty-hash hard-fail guard, verify-diff drops `--ignore-all-space` in favor of `--ignore-cr-at-eol` alone, rebase-conflict remediation adds the previously-missing `git add <file>` and `git rebase --continue` calls; format:check clean
- Reviews posted: 4
  - PR #1470: Ready — clean extract-method refactor of duplicated four-layer config merge into `mergeWidgetConfig` helper in `utils/widgetConfigPersistence.ts`; both `addWidget` and `addWidgets` delegate to it; 3 new unit tests cover layer ordering, transient-key stripping, all-undefined inputs; touches `DashboardContext.tsx` (regression-risk file) but layer order is preserved byte-for-byte; manual smoke of add-widget + AI-paste flows still unchecked in PR test plan
  - PR #1469: Ready with minor notes — 209-line new `BoardNavFab.tsx` with strong accessibility (role=menu, aria-labelledby, full keyboard nav, focus management, focus-visible rings), help-FAB stacking refactored from nested ternary to named-variable IIFE, dead board-switcher state/refs/effects removed from `Sidebar.tsx`; missing test coverage for the new component flagged as non-blocking follow-up; deliberate "all FABs on one edge" design choice noted (author already declined the music-FAB-opposite-side alternative)
  - PR #1468: Ready — three pattern-compliance refactors per `CLAUDE.md`: `prevSessionId`/`prevUid` "adjusting state while rendering" replaces `useEffect`-only-resets-refs, `shouldSubscribe` boolean replaces `setTimeout(..., 0)` deferral, `DriveAuthError` marker class enables `instanceof`-first classification with message-matching fallback preserved; backwards-compatible; 1678 tests pass per PR description
  - PR #1366: Ready — doc-only, all 4 earlier issue-level comments now addressed in `da8f094`; plan in better shape than at any prior review (operator-friendly step ordering, hard-fail squash-hash capture, accurate verify-diff, complete rebase remediation); execution still gated on "no open PRs" precondition (4 open today, including this PR)
- Notes:
  - PR #1470 head SHA `ac945ca1` — 7 files (4 audit docs + `DashboardContext.tsx` + `widgetConfigPersistence.ts` + test file); CI status pending at review time per github status API
  - PR #1469 head SHA `ad85e87f` — 7 files (1 new component + `DashboardView.tsx` + `Sidebar.tsx` + 4 locales)
  - PR #1468 head SHA `0cf76282` — 4 files (`QuizLiveMonitor.tsx` + `SavedWidgetsContext.tsx` + `driveAuthErrors.ts` + test file)
  - PR #1366 head SHA `da8f0946` (was `af5c4043` before this run) — added one commit in this run
  - Branch-safety: no head branches match `main` or `dev-*`; all 4 PRs eligible for pushes; only PR #1366 received a push this run

## 2026-05-04

- PRs reviewed:
  - #1491 — audit(sunday): scheduled task journals — 2026-05-03 (head `scheduled-tasks`, base `dev-paul`, DRAFT)
  - #1485 — Refactor dashboard components, enhance zoom functionality, and implement view-only modes (head `dev-paul`, base `main`) — READ-ONLY (dev-\* branch, no pushes per branch-safety policy)
  - #1366 — docs: plan for repo-wide line-ending normalization (head `docs/line-endings-normalization-plan`, base `main`)
- Comments processed: 27 inline review threads — 0 fixed, 27 already-addressed-and-noted
  - PR #1491: 2 inline threads — both already have OPS-PIvers replies (1 explaining the `useClickOutside` fix landed on `dev-paul` and flows here, 1 noting the copilot bot was confused by branch-vs-PR-diff scope)
  - PR #1485: 19 inline threads — all already have OPS-PIvers addressing replies. Most are marked fixed in commits `9f66239`, `45d7db1`, or `930ba75`; the `LunchCount` `padStart` thread is "no action — month/day already pre-padded on lines 138-139"; `UrlWidget` font/a11y threads are stale against later commits
  - PR #1366: 6 inline threads — all `is_outdated: true` with prior addressing replies from 2026-04-21 / 2026-04-22 rounds; no further action needed
- Fixes pushed: 0
- Reviews posted: 3
  - PR #1491: Ready with minor notes — Sunday audit run; the diff against `main` includes the duplicated code changes (`useClickOutside`, `useVideoActivitySession`, `firestore.rules`, four StudentApp `logError` migrations, `config/tools.ts` JSDoc, `LazyChunkErrorBoundary` subtitle) that already exist on `dev-paul` and will resolve to no-op once the branch rebases. PR description claim ("audit-only") will read as inaccurate against the visible diff until that rebase happens. Recommend either rebasing onto current `dev-paul` or updating the description.
  - PR #1485: Ready with minor notes — 113-file / 12,469-line PR delivering Assignment Modes (view-only sharing across Quiz/VA/MiniApp/GuidedLearning), Synced Quizzes for PLC collaboration, bottom-screen FAB clusters, and `LazyChunkErrorBoundary`. All 14 CI checks pass. Strong test coverage added (12+ new test files). Two regression-risk items worth a manual smoke pass: (1) widget config merging integration via `mergeWidgetConfig` in `DashboardContext`, (2) `DraggableWindow` world-bound clamping math with grouped widgets at zoom edges. Test gaps: `BoardNavFab` (216 lines, no test), `useSyncedQuizGroups` (338-line hook, rule-only coverage). Pre-existing `Stations` admin-config alignment gap noted as natural follow-up.
  - PR #1366: Ready — sixth automated daily review on this branch with no content change since the 2026-05-01 `da8f094` commit; nothing material to add. All 6 prior threads still addressed. Plan execution still gated on "no open PRs" precondition (3 open today, including this PR, so not yet eligible).
- Notes:
  - PR #1491 head SHA `8e96f690` — 16 files: 8 markdown audit journals + 8 code files (the duplicated `dev-paul` content); CI status not retrieved this run
  - PR #1485 head SHA `930ba751` — 113 files; CI 14/14 green (Build, Unit Tests, E2E, Code Quality, Firestore Rules, Docker, CodeQL, deploy, Analyze javascript-typescript, Analyze actions, test, lint, type-check, summary)
  - PR #1366 head SHA `da8f0946` — unchanged since 2026-05-01; no new commits in this run
  - Branch-safety: PR #1485 head `dev-paul` matches `dev-*` pattern → no pushes attempted (review-only). The other 2 PRs were eligible for pushes but none required code fixes this run.
