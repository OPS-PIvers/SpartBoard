# PR Review Log

_Automated nightly review by claude-opus-4-6_

---

## 2026-07-21

- PRs reviewed: 4 (all open PRs, all targeting `dev-paul`, all draft, all authored by the automated nightly system)
  - #2257 — fix(deps): SECURITY force `ws@8` to `>=8.20.1` (uninitialized memory disclosure) (head `deps/ws-uninitialized-memory`)
  - #2256 — audit(tuesday): daily/weekly scheduled-audit journals (head `scheduled-tasks`)
  - #2255 — docs(routines): log nightly unifier run 39 (head `nightly/unifier-log-2026-07-21`)
  - #2254 — refactor(reveal-grid): unify "Reveal Mode" settings label to group-heading pattern (head `nightly/unify-settings-labels-2026-07-21`)
- Comments processed: 2 total — 0 fixed, 0 change-requests. Zero unresolved inline review threads on any PR (`get_review_comments` empty on all 4). The two existing top-level comments are both approving `claude[bot]` reviews (#2257 "No issues found ✅ Approved"; #2254 "LGTM, no concerns") — neither requests a change, so no reply and no code fix was needed.
- Fixes pushed: 0 — no comment required a code change and no diff-level defect was found in any PR.
- Reviews posted: 2 (on the two PRs that had no prior review — #2256, #2255).
  - #2256 — Ready. Docs-only Tuesday audit-journal update across 5 `docs/scheduled-tasks/` files. Flagged (as human follow-up, not a PR defect) the real security signal the journal itself records: 2 new CRITICALs (`websocket-driver <0.7.5`, `tar <=7.5.18`), axios fix target raised to `>=1.18.0`, and the existing `"tar": ">=7.5.11"` override now insufficient (needs `>=7.5.19`) — these are open items for a dedicated dependency PR.
  - #2255 — Ready. Docs-only unifier run-39 memory log; the code it describes (RevealGrid "Reveal Mode" label retrofit) ships separately in #2254.
  - #2257 and #2254 were NOT re-reviewed — both already carry a fresh, thorough approving `claude[bot]` review posted hours earlier; a duplicate structured review would be pure noise. Both diffs were still independently inspected: #2257 is a correctly-scoped `ws@8` `pnpm.overrides` entry (leaves the non-vulnerable `ws@7.5.x` firebase-tools chain untouched; lockfile confirms `8.19.0`/`8.20.0` → `8.21.1`); #2254 is a mechanical `as="span"` + `role="group"`/`aria-labelledby` group-heading a11y retrofit with correct per-instance `${widget.id}` id scoping. Both confirmed clean.
- Notes:
  - Branch safety: no push to `main` or any `dev-*` head. No code fixes were pushed to any PR branch this run (nothing was actionable). This review-log commit is on the designated `claude/compassionate-shannon-rir4oc` branch — rebuilt from the latest `origin/dev-paul` (it previously carried only already-merged `dev-paul`→`main` merge commits, no unique work) so the log PR is a clean single-file diff. Kept off `scheduled-tasks` deliberately: that branch is the head of the unrelated open audit PR #2256 (a different routine's session), matching the run-18/run-19 precedent of not polluting an in-flight PR and honoring the branch-safety directive.
  - All 4 open PRs are automated nightly output whose comments (where any exist) are approvals, so this run's work was independent review sign-off on the 2 un-reviewed PRs plus diff verification of the 2 already-approved ones — no thread cleanup or code repair required.
  - Env runs Node 22 (repo pins 24, "Unsupported engine" warning); no local fix-verification was needed since nothing was pushed to a PR branch. CI on Node 24 remains the authoritative gate.

## 2026-07-20

- PRs reviewed: 11 (all open PRs)
  - #2253 — fix(activity-wall): photo-grid rowHeight resize-continuous via cqmin (head `scheduled-tasks`, base `dev-paul`, draft)
  - #2252 — docs(routines): log nightly debugger run 31 (head `nightly/debugger-log-2026-07-20`)
  - #2251 — fix(functions): SECURITY — relock `activity_wall_sessions` after gallery share expires/revokes (head `nightly/build-tooling-2026-07-20`)
  - #2250 — fix(config): replace non-existent `Football` lucide icon in instructional icon picker (head `nightly/admin-config-2026-07-20`)
  - #2249 — fix(rosters): `assignPins` no longer collides with manually-set PINs (head `nightly/state-data-2026-07-20`)
  - #2248 — fix(DraggableWindow): cancel touch long-press timers on unmount (head `nightly/dashboard-layout-2026-07-20`)
  - #2247 — fix(LunchCount): key assignments by roster student id, not display name (head `nightly/widgets-2026-07-20`)
  - #2246 — docs(routines): log nightly unifier run 38 (head `nightly/unifier-log-2026-07-20`)
  - #2245 — fix(RevealGrid): unify "Game Mode" settings label to `SettingsLabel as="span"` (head `nightly/unify-settings-labels-2026-07-20`)
  - #2244 — Enhance GraphicOrganizer config and fix various issues (head `dev-paul`, base `main` — release PR)
- Comments processed: 7 total inline threads — 0 newly fixed, 7 explained & resolved. (Two further PRs, #2253 and #2244, had only already-resolved threads — no action needed.)
  - #2251 (3 threads): redundant-write guard (line 137) and its paired test assertion — both already addressed on-branch in `2395fe1`; replied and resolved. Serialized-loop perf note (line 111) — flagged non-blocking at current scale by the reviewer; replied acknowledging, resolved, no change.
  - #2250 (2 threads, both outdated): Ghost/Goal alphabetical ordering already fixed in `be9ce16`; single-line test comment already trimmed in `010ab49`. Replied and resolved both.
  - #2247 (2 threads): stuck legacy-name unassign (line 359) already fixed in `a18490a`; orphaned legacy-key on reassignment (line 390) already fixed in `a6a4e96`. Replied and resolved both.
- Fixes pushed: 0 — every actionable review comment across all open PRs had already been resolved by later commits on its own branch (the nightly orchestrator applied the fixes but never closed the threads). No code fix was required this run.
- Reviews posted: 11 (a structured review on every open PR)
  - #2249: Ready — correct `assignPins` extraction with collision-avoidance Set + advancing counter; behavior preserved for all-blank rosters; 5 regression tests.
  - #2248: Ready — write-once `isUnmountedRef` unmount guard on both long-press timers; targeted regression test; legit external-sync `useEffect`.
  - #2245: Ready — pure a11y `SettingsLabel as="span"` + `role="group"` retrofit, zero visual delta.
  - #2247: Ready — id-keyed assignments with legacy-name fallback + eviction; both inline threads resolved.
  - #2250: Ready — `Football`→`Goal` swap + all-entries-resolve test; both nits resolved.
  - #2251: Ready — new hourly relock sweep closes a real submissions/photo data-exposure hole; strong test coverage; redundant-write guard resolved.
  - #2253: Ready — JS-px `gridAutoRows` → `minmax(clamp(...cqmin...), 1fr)`, resize-continuous and container-fitting; reviewer note adopted in `c7332e95`.
  - #2252, #2246: Ready — documentation-only nightly run logs, no source changes.
  - #2244: Ready with human sign-off — `dev-paul`→`main` release PR; the security-sensitive `shared_activity_walls` read-gating gaps were closed in `5fb0649` with rules + component tests; warrants a final human review of the aggregate diff since it targets `main`.
- Notes:
  - Branch safety: no code fixes were pushed to any PR branch this run. `main` untouched; no push to `dev-paul` (#2244) was needed. This log is committed to `scheduled-tasks` per the routine convention.
  - Every open PR was authored by the automated nightly system and its actionable comments were self-resolved on-branch, so this run's work was thread cleanup (reply + resolve) plus independent review sign-off, not code repair.
  - Env runs Node 22 (repo wants 24); no local fix-verification was needed since nothing was pushed to a PR branch. CI on Node 24 remains the authoritative gate.

## 2026-07-19

- PRs reviewed: 7 (all open PRs, all targeting `dev-paul`)
  - #2242 — fix(rules): gate `shared_activity_walls` read on revoked/expiresAt (head `nightly/build-tooling-2026-07-19`)
  - #2241 — fix(i18n): ES plcRoute/plcDirectory + FR sidebar.nav.plcs PLC-acronym drift (head `nightly/admin-config-2026-07-19`)
  - #2240 — fix(RemoteControlMenu): clear stale copy-link timer on rapid re-click (head `nightly/dashboard-layout-2026-07-19`)
  - #2239 — fix(TimeTool): re-enable "+" once a ceiling-started run decays below it (head `nightly/widgets-2026-07-19`)
  - #2238 — action(admin-config): GraphicOrganizer building-default appearance config (head `scheduled-tasks`)
  - #2237 — docs(unifier): log nightly run 37 (head `nightly/unifier-log-2026-07-19`)
  - #2236 — a11y: convert RandomSettings "Operation Mode" label to group heading (head `nightly/unify-settings-labels-2026-07-19`)
- Comments processed: 2 total — 0 newly fixed, 2 explained/resolved.
  - #2240 inline nit (claude[bot]): reorder `clearTimeout` before `setCopied(true)` in `handleCopyLink`. Already addressed on-branch by commit `789c102`; replied and resolved the thread. No code change needed.
  - #2238 inline nit (claude[bot], outdated): export a runtime `GRAPHIC_ORGANIZER_LAYOUT_TYPES` array from `types.ts` to remove manual-copy drift. Already addressed on-branch by commit `c906e67` (derives the type from the shared const and validates against it); replied and resolved the thread. No code change needed.
- Fixes pushed: 0 (both actionable comments were already resolved by later commits on their branches).
- Reviews posted: 5 (structured reviews on the PRs without a prior review)
  - #2242: Ready with minor notes — correct server-side revoke/expiry gating mirroring `/shared_boards`; flagged the `expiresAt`-stored-as-millis assumption to confirm on the write path.
  - #2241: Ready — data-only locale fix with correctly-scoped regression tests.
  - #2239: Ready — stale `config.elapsedTime` term removed; write-storm still guarded by `adjustTime`'s no-op check; test updated.
  - #2237: Ready — documentation-only run log.
  - #2236: Ready — mechanical a11y group-heading retrofit, zero visual delta.
  - #2240, #2238: skipped a duplicate review — both already carry a `claude[bot]` structured review; only the comment follow-ups above were handled.
- Notes:
  - Branch safety: all 7 heads are non-`main`/non-`dev-*` (nightly/\* and `scheduled-tasks`) → pushable, but no fixes were required this run.
  - Env runs Node 22 (repo wants 24); no local fix-verification was needed since nothing was pushed to a PR branch. CI on Node 24 remains the authoritative gate.

## 2026-07-14

- PRs reviewed: 1 (all open PRs)
  - #2204 — fix(deps): override ts-deepmerge to ^8.0.0 in functions (GHSA-87mf-gv2c-c62c) (head `deps/ts-deepmerge-8`, base `dev-paul`, draft)
- Comments processed: 0 actionable — 0 fixed, 0 explained.
  - #2204 has no inline review threads. Existing feedback is a Gemini `COMMENTED` review with no change requests (neutral LGTM + Gemini-Code-Assist sunset notice) and a `claude[bot]` issue comment that is an explicit LGTM. Neither requires a code fix; no per-comment replies posted (both are automated bot approvals — replying would be pure noise, per frugality).
- Fixes pushed: 0 (no comment required an automated code fix this run)
- Reviews posted: 1 (one structured review)
  - #2204: Ready — minimal two-file security override (`functions/package.json` + `functions/pnpm-lock.yaml`) resolving the `ts-deepmerge` prototype-override DoS. Independently verified the core claim: `grep` across the entire `functions/` tree for `ts-deepmerge`/`firebase-functions-test` returns zero source imports, so the known v8 default-export forward-compat hazard (fft's cloudevent `wrap()`) is dormant. Flagged that no CI checks have reported on the head commit yet (combined status `pending`, 0 checks) — confirm PR validation is green before merge.
- Notes:
  - Branch-safety: #2204 head is `deps/ts-deepmerge-8` (non-`main`/non-`dev-*`) → pushable; no fix was required this run. Base is `dev-paul`.
  - Env runs Node 22 (repo wants 24); no local fix verification was needed since no fix was pushed. CI on Node 24 remains the authoritative gate.

## 2026-07-01

- PRs reviewed: 7 (all open PRs)
  - #2124 — docs(unifier): run 23 sixth consecutive all-aligned (head `nightly/unifier-log-2026-07-01`, base `dev-paul`)
  - #2123 — fix(quiz): strict Matching compares unique prompts, not raw pair count (head `claude/serene-meitner-tofij0`, base `dev-paul`)
  - #2120 — fix(deps): bump dompurify to 3.4.11 (GHSA-cmwh-pvxp-8882) (head `deps/dompurify-3.4.11`, base `dev-paul`)
  - #2119 — audit(tuesday): scheduled audit journals 2026-06-30 + new useScreenRecord test (head `scheduled-tasks`, base `dev-paul`)
  - #2118 — docs(unifier): run 23 (2026-06-30) (head `nightly/unifier-log-2026-06-30`, base `dev-paul`)
  - #2101 — fix(dashboard): Escape-minimize + screen-record listener stabilisation (head `nightly/dashboard-2026-06-28`, base `dev-paul`)
  - #2098 — Audit updates, empty-state scaling, analytics labels (head `dev-paul`, base `main`) — dev-paul→main promotion (push to dev-paul only via the sanctioned review-comment-fix path)
- Comments processed: 2 unresolved threads actioned — 0 fixed, 2 explained. Every other PR's inline threads already carried author replies or were resolved-in-code.
  - #2119: 2 open `claude` threads on the new `tests/hooks/useScreenRecord.test.ts` → both EXPLAINED, no push. (1) Real hook bug — `useScreenRecord` unmount cleanup (`hooks/useScreenRecord.ts:94-101`) stops the tracks but never calls `recorder.stop()`, so `onstop`→`onSuccess` can fire post-unmount; not auto-fixed (functional hook change, out of scope for an audit-journal PR, and needs a mounted-ref guard rather than a one-line `stop()`). (2) Empty-recording 0-byte-blob behavior is an undefined contract → product decision, not a mechanical fix.
  - #2098 (5 threads), #2101 (~30 threads), #2123 (2 gemini "separate PR" threads) → all already had author replies / were resolved-in-code; no new action.
  - #2124, #2120, #2118: no unresolved review threads.
- Fixes pushed: 0 (no comment required an automated code fix this run)
- Reviews posted: 7 (one structured review per PR)
  - #2124: Ready with minor notes — doc-only run-23 log; flagged duplicate "run 23" title shared with #2118.
  - #2123: Ready — correct `seenLefts.size` grading fix + 3 regression tests; mind land-order vs #2098.
  - #2120: Ready — dompurify security bump + pnpm override; single resolved `3.4.11`.
  - #2119: Ready with minor notes — docs + solid new screen-record test; flagged the real hook-cleanup bug for a dedicated follow-up and the scope mix (327-line test in an audit-journal PR).
  - #2118: Ready with minor notes — doc-only; duplicate "run 23" title shared with #2124.
  - #2101: Ready with minor notes — two well-diagnosed bug fixes; residual acknowledged gaps (driveService ~hourly churn, a few unguarded window escape listeners).
  - #2098: Ready with minor notes — dev-paul→main promotion; confirm #2123 lands first, track the deferred read-only-Escape follow-up.
- Notes:
  - Branch-safety: #2098 head is `dev-paul` (promotion into `main`) — review-only except the sanctioned dev-paul push path for review-comment fixes; none were needed. All other heads are non-`main`/non-`dev-*` → pushable; no fixes were required this run.
  - Cross-PR flag: #2124 and #2118 are both titled "run 23" and open simultaneously against `dev-paul` with overlapping `unifier.md` edits — reconcile before merging both.
  - Env runs Node 22 (repo wants 24); no local fix verification was needed since no fix was pushed. CI on Node 24 remains the authoritative gate.

## 2026-06-28

- PRs reviewed: 9 (all open PRs)
  - #2106 — feat(admin-config): expand TimeTool building-config 3→11 fields (head `scheduled-tasks`, base `dev-paul`)
  - #2105 — chore(docs): nightly debugger run 22 (head `nightly/debugger-2026-06-28`, base `dev-paul`)
  - #2104 — fix(plcWeeklyDigest): removed member leaks via legacy memberEmails mirror (head `nightly/build-2026-06-28`, base `dev-paul`)
  - #2103 — fix(analytics): add missing labels for 7 programmatic widget types (head `nightly/admin-2026-06-28`, base `dev-paul`)
  - #2102 — fix(GraphicOrganizer): render-body ref assignment prevents stale onUpdate closure (head `nightly/widgets-2026-06-28`, base `dev-paul`)
  - #2101 — fix(dashboard): Escape-minimize + screen-record listener stabilisation (head `nightly/dashboard-2026-06-28`, base `dev-paul`)
  - #2100 — docs(unifier): run 22 — fifth consecutive all-aligned run (head `nightly/unifier-log-2026-06-28`, base `dev-paul`)
  - #2099 — Address PR #2098 review comments (head `claude/serene-meitner-ah9zj6`, base `dev-paul`)
  - #2098 — Audit updates, fix empty-state scaling, analytics labels (head `dev-paul`, base `main`) — READ-ONLY (`dev-*` head: review/comment only, no push)
- Comments processed: ~23 unresolved threads across 5 PRs — 0 fixed by this run, all explained/already-addressed. No fix push was needed: every actionable inline comment was already resolved in committed code by the author sessions (verified by reading the files at branch HEAD), or is a design-decision/architectural note being handled in active iteration.
  - #2106: all 7 review threads already `is_resolved`. Gemini duration-clamp (59999) + test applied (`7d80677`); shared `config/timeTool.ts` extracted (`5e3ce6f`); `SurfaceColorSettings` decline is correct (`themeColor` is a `WIDGET_PALETTE` hex, not `cardColor`). Nothing to do.
  - #2103: 7 unresolved threads — ALL already addressed in HEAD code: `PROGRAMMATIC_WIDGET_LABELS` is `Partial<Record<WidgetType,string>>`, dual `_exhaustiveCheck`/`_reverseExhaustiveCheck` compile guards present, comments reduced to one-liners, redundant `hasOwnProperty` test removed. Threads simply not marked resolved.
  - #2102: 1 unresolved gemini thread (timeoutRef mgmt) — already addressed: debounce callback nullifies `timeoutRef.current`, `handleBlur` only flushes when pending, unmount-cleanup effect present. `isConnected` guard intentionally omitted (redundant given the pending-timeout guard).
  - #2101: 13 threads (2 author-retracted re: `react-hooks/refs` being a real rule in v7.0.1). Core fixes correct. Three genuine live notes surfaced in the posted review rather than pushed (PR was under active iteration, last commit 06:02Z — avoided conflicting commits): (1) `Dock.test.tsx ~L549` may not actually guard the regression (module-level `useScreenRecord` mock ignores the `onError` arg); (2) `stopImmediatePropagation` blast radius across other unguarded window/document Escape handlers; (3) `driveService` hourly identity churn → once-per-hour listener re-register gap.
  - #2098: 3 threads (NonNullable answers typing, NumberLine `htmlFor`, AI-feature 3-location sync comment) — all addressed via #2099, which routes the fixes into this branch.
  - #2105: 1 unresolved gemini thread (lowercase repo path in doc URLs) — cosmetic + anchored hunk outdated; non-blocking, noted in review.
  - No redundant per-thread replies were posted: threads were already addressed in-code or already carried an author resolution reply — adding "already fixed" replies to ~23 threads would be pure noise (frugality).
- Fixes pushed: 0 (no genuine unaddressed actionable comment remained; #2101's live items were left for the actively-iterating author session and surfaced as review feedback).
- Reviews posted: 9 (one structured review per PR)
  - #2106: Ready — 3→11 field expansion with sound per-field validation; all threads resolved.
  - #2105: Ready — doc-only debugger run-22 log.
  - #2104: Ready — well-tested privacy fix (removed-member digest leak); `removedUids` second guard.
  - #2103: Ready — clean label-map extraction; all inline comments addressed in-code.
  - #2102: Ready — render-body ref sync per CLAUDE.md; timeoutRef concerns addressed.
  - #2101: Ready with minor notes — core fixes correct; flagged Dock test / blast-radius / driveService notes for human verification before merge.
  - #2100: Ready — doc-only unifier run-22 log.
  - #2099: Ready — applies the three #2098 review fixes; merge order (this → dev-paul → main) noted.
  - #2098: Ready with minor notes — verify #2099 is folded in and CI green before merging to `main`.
- Notes:
  - Branch-safety: no pushes to `main` or any `dev-*` branch. #2098 (head `dev-paul`) treated read-only — reviewed/commented only. The other 8 heads are pushable but required no fix push this run.
  - This log is committed to the designated working branch `claude/compassionate-shannon-4t37a1` rather than `scheduled-tasks`, because `scheduled-tasks` is the head of open PR #2106 — committing there would pollute that PR's diff. Consistent with prior runs (2026-06-27/06-24/06-21/06-19).

## 2026-06-27

- PRs reviewed: 6 (all open PRs; all base `dev-paul`, none `main`/`dev-*` → all pushable)
  - #2096 — scheduled-tasks 2026-06-27: audit + ActivityWall empty-state scaling fix (head `scheduled-tasks`, base `dev-paul`)
  - #2095 — chore(docs): nightly debugger run 21 (head `nightly/debugger-log-2026-06-27`, base `dev-paul`)
  - #2094 — fix(analytics): add missing AI feature labels for 6 Gemini features (head `nightly/admin-2026-06-27`, base `dev-paul`)
  - #2093 — fix(quiz): use first-occurrence answers in exportResultsToSheet stats block (head `nightly/state-2026-06-27`, base `dev-paul`)
  - #2092 — fix(NumberLine): Escape cancels min/max/step edits without saving (head `nightly/widgets-2026-06-27`, base `dev-paul`)
  - #2091 — docs(unifier): run 21 — fourth consecutive all-aligned run (head `nightly/unifier-log-2026-06-27`, base `dev-paul`)
- Comments processed: 10 unresolved threads across 3 PRs — 1 fixed, 9 explained/acknowledged (every other thread was already satisfied by a later commit on its branch and is marked `is_outdated`)
  - #2093: gemini `utils/quizDriveService.ts:731` (`r.answers ?? []` defensive guard) → FIXED. 2 claude threads on the test teardown (`vi.unstubAllGlobals`) → EXPLAINED no-op: the surviving test file `tests/utils/quizDriveService.test.ts` uses `vi.spyOn(global,'fetch')` + `afterEach(vi.restoreAllMocks)` (the reviewer's own suggested alternative); the colocated `vi.stubGlobal` file was replaced.
  - #2094: 2 gemini import-path threads (re-export / test import from `aiFeatureLabels.ts`) + 1 claude drop-PR-number-from-comment + 1 claude redundant-second-test → all already addressed in later commits (EXPLAINED): `AnalyticsManager.tsx` only imports (no re-export), test imports from `@/components/admin/Analytics/aiFeatureLabels`, the comment carries no PR number, and the second test is now a `toEqual` exhaustiveness check. 2 claude architectural threads (export `GEMINI_SPECIFIC_FEATURES` across the functions↔root boundary; acknowledge the inherent cross-package mirror gap) → EXPLAINED no-op (architectural / inherent constraint, not an unattended-fix candidate; flagged for human consideration of a shared constants module).
  - #2095: gemini `docs/routines/debugger.md` count (`has 10` → `has 11`) → EXPLAINED: already corrected on-branch; both the Run Log entry and backlog item now read `has 11` / `all 11 entries`.
- Fixes pushed: 1
  - #2093 / `nightly/state-2026-06-27` (`a295e3d`) — `fix(pr-2093): guard r.answers with ?? [] in exportResultsToSheet dedup loop`. Mirrors the defensive guard in `buildResultsSheetDataShared`. type-check ✓ lint ✓ tests ✓ (24/24).
- Reviews posted: 6 (one structured review per PR)
  - #2096: Ready — ActivityWall empty-state heading `fontSize: min(14px, 5.5cqmin)` + scaled `marginTop` (correct medium-text tier; preserves hierarchy vs subtitle); journal's ⚠️ false-premise correction on the appearance-panel MEDIUM is well-evidenced.
  - #2095: Ready — doc-only debugger run-21 log; count nit already resolved.
  - #2094: Ready with minor notes — clean label-map extraction; only the documented cross-package mirror gap remains as a non-blocking follow-up.
  - #2093: Ready — first-occurrence dedup matches grader semantics; `?? []` guard pushed; strong regression suite (24/24).
  - #2092: Ready — Escape-cancel `cancelledRef` pattern consistent with #1965/#1974/#1975/#2064; 10 tests; `aria-label`s added.
  - #2091: Ready — doc-only unifier run-21 log.
- Notes:
  - Branch-safety: all 6 head branches are non-`main`/non-`dev-*` → pushable; only #2093 required a fix push. No pushes to `main` or `dev-paul`.
  - This log is committed to the designated working branch `claude/compassionate-shannon-0f10tg` rather than `scheduled-tasks`, because `scheduled-tasks` is the head of open PR #2096 — committing there would pollute that PR's diff. Consistent with prior runs (2026-06-24/06-21/06-19).
  - Verification ran on Node 22 locally (project requires Node 24); `tsc --noEmit`, scoped `eslint --max-warnings 0`, and the affected vitest suite were green for the touched files. CI on Node 24 remains the authoritative gate.

## 2026-06-26

- PRs reviewed: 9 (all open PRs)
  - #2084 — audit(friday) nightly audit log (head `scheduled-tasks`, base `dev-paul`)
  - #2083 — docs(unifier) run 20 log (head `nightly/unifier-log-2026-06-26`, base `dev-paul`)
  - #2082 — refactor(types) brand `First5Config` + registry-audit wording (head `claude/serene-meitner-j84chw`, base `dev-paul`)
  - #2081 — Rules/auth hardening: M1/M2/LO2/LO4/LO10/M4 (head `audit/rules-auth-hardening`, base `dev-paul`)
  - #2080 — feat(subs) finish Collections in /subs — board view + Drive grants (head `audit/subs-collections`, base `dev-paul`)
  - #2079 — feat(link-shortener) Phase 2 Links analytics + Shorten button (head `audit/link-shortener-p2`, base `dev-paul`)
  - #2078 — feat(quiz) unify edit-modal class picker on rosterIds (head `audit/quiz-rosterids`, base `dev-paul`)
  - #2077 — docs(specs) Cluster-3 design-first specs (head `audit/c3-design-specs`, base `dev-paul`)
  - #2076 — Fix WidgetConfig union + audit docs (head `dev-paul`, base `main` — READ-ONLY)
- Comments processed: 13 unaddressed threads — 5 fixed, 8 explained/flagged. (Many other threads already carried author "Fixed in …" replies and were skipped.)
  - **Fixed (5):**
    - #2078 Widget.tsx:2040 — destructure targeting fields out of patch (type-narrows `settingsPatch`) instead of spread+`delete`.
    - #2080 useSubstituteShares.ts:285 — invert expiry guard so a missing `expiresAt` is treated as expired.
    - #2080 expireSubShares.ts:199 — re-throw after `Promise.allSettled` so sweep failures surface as a failed invocation.
    - #2081 AuthContext.tsx:2564 — clear `accessDeactivated` only after sign-in succeeds (popup-cancel no longer drops the DeactivatedScreen).
    - #2081 UsersView/primitives — bulk role picker `role="group"` + opt-in `aria-pressed` (without breaking shared `PopoverOption` menu usages).
  - **Explained, no change (3):**
    - #2078 Widget.tsx:2058 (dead guard) — coupling is intentional/documented; guard kept as defensive boundary.
    - #2079 LinksPanel.tsx:154 (useState→useMemo) — `useMemo(()=>Date.now())` fails the repo's `react-hooks/purity` lint rule; `useState` lazy init is the compliant pattern.
    - #2079 AnalyticsManager.tsx:1809 (tabBar focus) — promotion-to-component doesn't fix position-based reconciliation; needs a shared-parent restructure (architectural).
  - **Flagged for manual review (3):**
    - #2080 firestore.rules:1116 — `subEmails` not validated server-side (pre-existing on boards path; needs a CF domain-validation wrapper).
    - #2081 firestore.rules:462 — domain admin can still deactivate/downgrade an existing `super_admin` (security residual; needs policy decision + guard + CI-validated rules test).
    - #2081 UsersView.tsx:542 — role picker lists `super_admin` for `domain_admin`; client companion to the rules decision above.
  - **Outdated/already-fixed (2):**
    - #2083 unifier.md — `DEFAULT_GLOBAL_STYLE` reference already correct as committed (verified vs `types.ts:6579`).
    - #2084 code-structure.md — large-file count inconsistency already fixed on-branch in `472bbba`.
- Fixes pushed: 4 commits across 3 branches
  - #2078 `audit/quiz-rosterids` `7c16b45` — destructure targeting fields from patch.
  - #2080 `audit/subs-collections` `5604cdb` — treat missing `expiresAt` as expired.
  - #2080 `audit/subs-collections` `c55b1d8` — re-throw after `allSettled`.
  - #2081 `audit/rules-auth-hardening` `0300295` — deactivation flag on popup-cancel + bulk role picker a11y.
  - All verified locally before push: `pnpm type-check` ✓, scoped `eslint --max-warnings 0` ✓, prettier ✓, and the relevant vitest suites (`useSubstituteShares` 20/20, `AuthContext.deactivation` 3/3, `UsersView.bulkRoleBuilding` 3/3) ✓. Functions change passed `tsc --noEmit` + functions eslint.
- Reviews posted: 9 (one structured review per PR)
  - #2078 Ready with minor notes · #2079 Ready with minor notes · #2080 Ready with minor notes (deploy new index) · #2081 **Needs changes** (super-admin deactivate/downgrade protection + CI rules green) · #2082 Ready · #2077 Ready (docs) · #2083 Ready (docs) · #2084 Ready (docs) · #2076 Ready with notes (land #2082 into dev-paul first; confirm CI before dev-paul→main).
- Notes:
  - Branch-safety: #2076 head is `dev-paul` (dev-_) → READ-ONLY; reviewed/commented only, no push. All fixes went to non-`main`/non-`dev-_` feature branches.
  - Could not locally verify any `firestore.rules` change (no Firestore emulator in this env) and the file is at ~98.5% of the 256 KiB cap — so the two rules-level security items on #2081/#2080 were flagged for human + CI rather than auto-patched.

## 2026-06-25

- PRs reviewed: 3 (all open PRs)
  - #2075 — audit(thursday): daily audits 2026-06-25 (head `scheduled-tasks`, base `dev-paul`)
  - #2074 — docs(unifier): run 19 log (head `nightly/unifier-log-2026-06-25`, base `dev-paul`)
  - #2072 — Audit updates and fixes for admin settings and widget configurations (head `dev-paul`, base `main`)
- Comments processed: 11 total — 0 fixed, 2 explained (replies), 9 skipped (already addressed by author in `6573248` / outdated / informational)
  - #2075: 1 gemini inline thread (`@/` alias in `ScaledEmptyState` import snippet) → EXPLAINED: already fixed in commit `9992a19`, thread now outdated. 2 claude review summaries → no action (approvals/notes).
  - #2074: gemini "unsupported file types" note → no action (informational, doc-only PR).
  - #2072: 7 inline threads already resolved by author in `6573248` (stale-closure ref restore, NOT_FOUND toast, 2× redundant `Promise.resolve`, 2× test-correctness gaps, O(N·M)→O(M) resend) → SKIPPED (functionally addressed). 1 open thread (`users.filter` vs `filtered.filter`, UsersView:382) → EXPLAINED (replied): UX judgment, not a bug — `users.filter` keeps bulk Resend consistent with bulk Deactivate/Delete which act on all `selected`; declined automated change.
- Fixes pushed: 0
  - Investigated 3 newer review-level items on #2072 and concluded none warranted an automated fix:
    1. **Deactivate ungated by `canManageUsers` (UsersView:422)** — FALSE POSITIVE. Deactivation is governed by `canEditStatus = inScope` (line 574), deliberately separate from `canManage`; `building_admin`s are intended to deactivate in-scope users and `selected` is already scope-restricted. Guarding it would remove a legitimate capability.
    2. **UTC-midnight due-date parse (QuizManager:2300)** — NOT A BUG. Current parse is symmetric with the `toISOString()` display (line 2292) and matches the documented date-only convention in `utils/localDate.ts` (`splitDueAtToInputs(hasTime=false)`). The suggested local-midnight change would break symmetry for UTC+ timezones; a correct change requires moving both parse and display to local components together.
    3. **`users` vs `filtered` (UsersView:382)** — UX decision, declined (see replied thread above).
- Reviews posted: 3 (one structured review per PR)
  - #2075: Ready — doc journal updates + correct additive `First5Config` type fix (closes `ConfigForWidget<'first-5'> = never`).
  - #2074: Ready — doc-only unifier run-19 log, no executable surface.
  - #2072: Ready with minor notes — earlier feedback resolved in `6573248`; Deactivate-guard and UTC-date "bugs" are consistent-by-design; remaining notes (announcement half-window auto-expire, `AnnouncementOverlay` `isActive` index growth, `OptionInput` key-sync contract) are low-severity follow-ups.
- Notes:
  - Branch-safety: #2072 head is `dev-paul` (dev-_); per the standing rule, pushable only for review-comment fixes on a dev-paul→main PR. No fixes were warranted this run, so nothing was pushed to `dev-paul`. #2075/#2074 heads are non-`main`/non-`dev-_`.
  - No code changes pushed this run — the author had already landed all clear fixes (`6573248`), and the three remaining flagged items resolved to false-positives / convention-conflicts / UX judgments on investigation.

## 2026-06-24

- PRs reviewed: 10
  - #2070 — refactor(ui): unify ClockWidget/TimeTool font pickers via shared TypographySettings (head `scheduled-tasks`, base `dev-paul`)
  - #2069 — docs(routine): nightly debugger run 20 memory doc (head `nightly/debugger-log-2026-06-24`, base `dev-paul`)
  - #2068 — fix: remove .animate-spin from reduced-motion suppression in index.css (head `nightly/dashboard-layout-2026-06-24`, base `dev-paul`)
  - #2067 — fix(analytics): remove phantom 'guided-learning' from GEMINI_SPECIFIC_FEATURES (head `nightly/build-tooling-2026-06-24`, base `dev-paul`)
  - #2066 — fix(i18n): correct verbatim-EN clock font/style labels in DE and FR (head `nightly/admin-config-2026-06-24`, base `dev-paul`)
  - #2065 — fix(quizDriveService): dedup questions before solo-mode stats section (head `nightly/state-data-2026-06-24`, base `dev-paul`)
  - #2064 — fix(poll): cancel OptionInput rename on Escape without saving (head `nightly/widgets-2026-06-24`, base `dev-paul`)
  - #2063 — docs(unifier): run 18 log — D4 PLC Wave 5 (head `nightly/unifier-log-2026-06-24`, base `dev-paul`)
  - #2062 — fix(imports): PLC Wave 5 cross-subdir relative imports → @/ alias (head `nightly/unify-import-paths-plc-wave5-2026-06-24`, base `dev-paul`)
  - #2043 — docs(unifier): run 23 staleness scan + doc regression recovery (head `nightly/unifier-log-2026-06-22`, base `dev-paul`)
- Comments processed: 4 unresolved threads actioned (others were outdated/already-addressed) — 0 fixed, 4 explained
  - #2065: gemini thread on `utils/quizDriveService.ts:716` (also dedup `r.answers` per-response in stats loop) → EXPLAINED: valid but separate grading-semantics concern, out of this PR's row-dedup scope; recommended as a follow-up mirroring `buildResultsSheetData`'s first-occurrence answer filter.
  - #2064: gemini thread suggesting a `userEvent` rewrite of the Escape/Enter tests → EXPLAINED: stylistic, not a correctness issue; the deliberate `fireEvent`+`act()` is required to replicate a browser blur without focusing the element.
  - #2064: claude thread on the Enter test double-blur (line 94) → EXPLAINED: already addressed in current HEAD (`toHaveBeenCalledTimes(1)` present).
  - #2067: claude thread requesting a `totalCalls` assertion (line 1205) → EXPLAINED: already present in current HEAD with a clarifying comment.
- Fixes pushed: 0 (no actionable code-fix comments — open threads were out-of-scope, stylistic, or already satisfied in current HEAD; all code PRs verify clean per their own descriptions)
- Reviews posted: 10 (one structured review per PR)
  - #2070: Ready — clean shared-settings de-duplication; `showColorPicker={false}` correctly avoids a dead `fontColor` control (Clock/TimeTool use `themeColor`).
  - #2069: Ready with minor notes — docs-only; two gemini prose-accuracy nits on the debugger memory log.
  - #2068: Ready — correct root-cause WCAG 2.3.3 fix; gemini's strip-comments test suggestion already in HEAD.
  - #2067: Ready — phantom analytics bucket removed + matching frontend label cleanup; thorough regression tests.
  - #2066: Ready — three verbatim-EN locale values corrected with a regression guard.
  - #2065: Ready with minor notes — question-row dedup correct; flagged the separate answers-dedup follow-up.
  - #2064: Ready — real Escape-cancel bug fixed with the `cancelledRef` pattern; reset-on-blur present so normal saves still work.
  - #2063: Ready with minor notes — docs-only; gemini count nits are correct (bodies→viewer is 4 not 5; NeedDoPutThen panel has 6 labels not 5); 12-total figure is right.
  - #2062: Ready — purely mechanical `@/` alias unification across 7 PLC files.
  - #2043: Ready — docs-only recovery + run-23 scan; flagged overlap with newer #2063 to confirm before merge.
- Notes: No code fixes were pushed this run. None of the open review threads met the clearly-needed + in-scope + unambiguous + safe bar for an automated push to these draft PRs; the substantive ones were either out-of-scope follow-ups (answers-dedup), stylistic preferences, or already satisfied in current HEAD. Per this session's branch policy, this log entry is committed to `claude/compassionate-shannon-ta0tmu` rather than `scheduled-tasks` (the latter is the head of open PR #2070; appending here avoids polluting that PR's diff).

## 2026-06-23

- PRs reviewed: 5
  - #2058 — docs(skill): fix admin-widget-config SpecialistSchedule Settings path (head `scheduled/skill-freshness-specialist-settings-path`, base `dev-paul`)
  - #2057 — audit(tuesday): daily+weekly journal updates (head `scheduled-tasks`, base `dev-paul`)
  - #2056 — docs(unifier): run 17 log — D4 plc/meeting import fix (head `nightly/unifier-log-2026-06-23`, base `dev-paul`)
  - #2055 — fix(D4): @/ alias for cross-subdir imports in plc/meeting + plc/bodies (head `nightly/unify-import-paths-plc-meeting-2026-06-23`, base `dev-paul`)
  - #2043 — docs(unifier): run 23 staleness scan + doc regression recovery (head `nightly/unifier-log-2026-06-22`, base `dev-paul`)
- Comments processed: 2 total — 0 fixed, 2 explained (both already satisfied in current revision)
  - #2056: 2 gemini threads on `docs/routines/unifier.md` (fully-qualify meeting paths; move `#2055` to the dedicated PR column) → EXPLAINED + RESOLVED: both marked outdated; current revision (lines 270 and 289) already matches the suggestions. Replied and resolved both threads.
  - #2058, #2057, #2055, #2043: no unresolved actionable threads (Gemini reviews carried no inline comments; #2057's single Blooms-Taxonomy thread was already resolved and Gemini itself advised against mechanical edits to historical audit logs).
- Fixes pushed: 0 (no actionable code-fix comments — the only two were already addressed)
- Reviews posted: 5 (one structured review per PR)
  - #2058: Ready with minor notes — skill path fix verified (`SpecialistSchedule/Settings.tsx:48` reads `featurePermissions`); flagged a `2026-06-24` future-date typo in the journal entry and journal-file overlap with #2057.
  - #2057: Ready — journal-only; flagged two newly-logged advisories (production `dompurify` GHSA-cmwh-pvxp-8882 worth a remediation PR; test-only `ts-deepmerge`).
  - #2056: Ready — doc-only unifier run-17 log; both Gemini nitpicks already satisfied.
  - #2055: Ready — clean mechanical `@/` import-path refactor (6 imports, 5 files); same-dir `./` imports correctly preserved.
  - #2043: Ready — doc recovery + `.gitattributes merge=ours` (built-in driver, correct fix) + timestamp-only perf-baseline bumps.
- Notes:
  - Branch-safety: all 5 head branches are non-`main` / non-`dev-*` → pushable. No fix pushes were required this run.
  - Merge-order coordination flagged on #2058/#2057: both carry the same five `docs/scheduled-tasks/*` journal updates (the skill-fix branch was cut from `scheduled-tasks`), so the second to merge will conflict on those files.

---

## 2026-06-22

- PRs reviewed: 7
  - #2049 — audit(monday): daily=0 weekly=2 new issues (head `scheduled-tasks`, base `dev-paul`)
  - #2048 — docs(nightly): debugger run 19 log update (head `nightly/debugger-log-2026-06-22`, base `dev-paul`)
  - #2047 — fix(test): add missing vi.mock() stubs in mirrorPlcIndex.test.ts (head `nightly/build-tooling-2026-06-22`, base `dev-paul`)
  - #2046 — fix(schedule): use getTodayStr() in checkAutoLaunch (head `nightly/widgets-2026-06-22`, base `dev-paul`)
  - #2045 — fix(DraggableWindow): prevent Enter double-commit on title rename (head `nightly/dashboard-layout-2026-06-22`, base `dev-paul`)
  - #2044 — fix(i18n): translate plcDashboard.search.groupBoards to "Tafeln" in DE (head `nightly/admin-config-2026-06-22`, base `dev-paul`)
  - #2043 — docs(unifier): run 23 staleness scan + doc regression recovery (head `nightly/unifier-log-2026-06-22`, base `dev-paul`)
- Comments processed: 8 total — 4 fixed, 4 explained
  - #2045: 3 gemini/claude threads → 2 FIXED (moved `hasCommittedTitleRef` reset into the render body per CLAUDE.md synchronous-ref-flag rule; removed the `onClick` reset), 1 EXPLAINED (outdated — the landed test comment already matched the suggestion).
  - #2046: 2 gemini threads → 2 FIXED (mock factory now captures the real `getTodayStr` via `importOriginal` into a hoisted `defaultGetTodayStr.current` ref; `beforeEach` restores it — removes duplicated date logic).
  - #2048: 2 gemini threads → 2 EXPLAINED (already addressed): commit `16b8b57` had already rewritten lines 135/225 to the render-body reset wording.
  - #2049: 1 claude thread → no action (self-verification note confirming the RevealGrid finding, not a change request).
  - #2043, #2044, #2047: no unresolved threads.
- Fixes pushed: 2
  - #2045 / `nightly/dashboard-layout-2026-06-22` — `fix(pr-2045): reset hasCommittedTitleRef in render body per CLAUDE.md ref pattern`.
  - #2046 / `nightly/widgets-2026-06-22` — `fix(pr-2046): capture real getTodayStr in mock factory to avoid duplicating date logic`.
- Reviews posted: 7 (one structured review per PR)
  - #2049: Ready — Monday audit docs + thorough `useTemplateStore` test; flagged RevealGrid no-`onClick` button as the most actionable follow-up.
  - #2048: Ready — doc-only debugger run-19 log; gemini wording suggestions already incorporated.
  - #2047: Ready — recovers 5 silently-dropped tests via the established mock-hoisting pattern.
  - #2046: Ready — local-date fix matching the widget's convention; test-DRY review note addressed.
  - #2045: Ready — surgical double-write fix; ref-reset now aligned with repo convention.
  - #2044: Ready — minimal, well-tested DE locale fix.
  - #2043: Ready — doc recovery; flagged the recurring `main → dev-paul` clobber of `unifier.md` for a permanent merge-strategy fix.
- Notes:
  - Branch-safety: all 7 head branches are non-`main` / non-`dev-*` → pushable. Two required fix pushes (#2045, #2046).
  - Local verification for both fix pushes ran on Node 22 (env wants 24): `tsc --noEmit` (0 errors), `eslint --max-warnings 0` (clean), and the affected vitest suites (DraggableWindow 55/55, ScheduleWidget 29/29) all passed; full CI on Node 24 remains the authoritative gate.

## 2026-06-21

- PRs reviewed: 4 (all open PRs; all base `dev-paul`, none `main`/`dev-*`)
  - #2035 — audit(scheduled-tasks): Sunday 2026-06-21 — admin-config audit + TextWidget MEDIUM fix (head `scheduled-tasks`)
  - #2034 — docs(unifier): run 22 — staleness scan (head `nightly/unifier-log-2026-06-21`)
  - #2030 — pr-review: nightly PR review log — 2026-06-20 (head `claude/compassionate-shannon-dzln7f`)
  - #2029 — fix(widgets/expectations): use shared Toggle in Settings panel (head `scheduled/expectations-toggle`)
- Comments processed: 1 actionable thread — 0 fixed, 1 explained (all other threads empty/resolved)
  - #2034: 1 unresolved-but-outdated thread (claude) requesting revert of inflated `actualDurationMs` baselines → EXPLAINED, no fix: the current diff already addresses it — only `generatedAt` changed in `baseline.json`/`dashboard-baseline.json`; timing medians are unchanged. Replied marking resolved.
  - #2029: 1 thread (gemini optional-chaining) already `is_resolved:true` from the 2026-06-20 run → no action.
  - #2035, #2030: no review comments.
- Fixes pushed: 0 (no comment required a code change)
- Reviews posted: 3
  - #2035: Ready with minor notes — TextWidget admin building defaults (`fontFamily`/`fontColor`/`verticalAlign`) are correct and well-tested (`isHexColor`/`Number.isFinite`/`isWidgetFontFamily`/enum validation; 3 new test cases; panel mirrors Stations). Flagged scope: `scheduled-tasks` head carries 42 changed files, ~38 unrelated to the described change (accumulated-divergence pattern, same as #2016) — human should confirm the bundle is intended for the nightly→`dev-paul` release flow.
  - #2034: Ready — doc-only unifier run 22; the inline baseline concern is resolved.
  - #2030: Ready — doc-only nightly review-log entry.
  - #2029: skipped (not re-reviewed) — already carries a full automated Claude review from 2026-06-20 and has no new commits since; re-reviewing would be noise.
- Notes:
  - Branch-safety: all 4 head branches are non-`main` / non-`dev-*` → pushable. Phase 1 produced no fixes, so no pushes to any PR branch.
  - This log is committed to `claude/compassionate-shannon-l4ziui` (this session's development branch) rather than `scheduled-tasks`, because `scheduled-tasks` is the head of open PR #2035 — committing there would pollute that PR's diff. Consistent with prior runs (#2030 used `claude/compassionate-shannon-dzln7f`).

## 2026-06-19

- PRs reviewed: 9 (all base `dev-paul`; no head is `main`/`dev-*`, so all pushable)
  - #2023 — docs(routines): nightly debugger run #21 log (head `nightly/debugger-log-2026-06-19`)
  - #2022 — fix(widgets): remove stale-ref useEffect in PageEditor and RandomSettings (head `nightly/widgets-2026-06-19`)
  - #2021 — fix(functions): enforce accessLevel in generateVideoActivity (head `nightly/build-tooling-2026-06-19`)
  - #2020 — fix(hooks): dedupe steps in buildGLResponsesCSV (head `nightly/state-data-2026-06-19`)
  - #2019 — fix(plc): guard TodosBody inline-edit onBlur (head `nightly/dashboard-layout-2026-06-19`)
  - #2018 — fix(i18n): es backgrounds.presets verbatim-EN fix (head `nightly/admin-config-2026-06-19`)
  - #2017 — docs(unifier): run 20 staleness scan (head `nightly/unifier-log-2026-06-19`)
  - #2016 — fix(poll): cap progress-bar height (head `scheduled-tasks`)
  - #2013 — docs(routines): Run 21 debugger log (head `nightly/debugger-log-2026-06-18`)
- Comments processed: 5 actionable threads across 4 PRs — 1 fixed, 4 explained (remaining open threads were `is_outdated:true` style/doc nits, left per the be-frugal guideline)
  - #2020: gemini `buildGLResponsesCSV` thread (not outdated) → FIXED. Map answer lookup (O(N+M)) + `typeof … === 'number'` guards so a 0-epoch timestamp renders an ISO date. The two claude threads (missing `sessionId`, react-hooks/refs comment) were already addressed at HEAD → replied.
  - #2019: gemini render-body-reset thread → already implemented at HEAD (replied). claude "drop the eslint-disable" thread → EXPLAINED no-change: verified empirically that removing the directive errors `Cannot update ref during render react-hooks/refs` under `--max-warnings 0`; the rule is real here and the suppression is required.
  - #2021: all 3 claude threads (rename, `.exists` guard, reuse `accessPerm?.config`) already addressed at HEAD → replied to the not-outdated one.
  - #2023: open gemini doc-accuracy note (`checkAccess` helper doesn't exist; checks are inline) → surfaced in the posted review; not pushed (docs log, outdated thread).
- Fixes pushed: 1
  - #2020 / `nightly/state-data-2026-06-19` — `buildGLResponsesCSV` stepId→answer Map + 0-epoch timestamp guards; type-check ✓ lint ✓ prettier ✓ tests 12/12 ✓.
- Reviews posted: 9 (one structured review per PR)
  - #2022: Ready — documented anti-pattern removal + strong regression tests; nit: undocumented accentText fix.
  - #2021: Ready — real accessLevel bypass fix; noted pre-existing `.exists` gap in `transcribeVideoWithGemini` as follow-up.
  - #2020: Ready — dedup fix + my timestamp/perf follow-up.
  - #2019: Ready with minor notes — pattern-consistent onBlur guard; confirm the regression test landed (not seen in diff).
  - #2018: Ready — trivial locale fix, consolidated into the backgrounds locale sweep test.
  - #2016: Needs changes — poll cap is correct, but the `scheduled-tasks` head carries 36 files vs the 5-line described fix; scope/description mismatch flagged.
  - #2023, #2017, #2013: Ready (docs logs); flagged #2013↔#2023 run-21 overlap and the #2023 `checkAccess` wording.
- Notes:
  - Branch-safety: no PR targets `main`; all head branches pushable. Only #2020 needed a fix push.
  - This log committed to the designated working branch `claude/compassionate-shannon-e8i4ou` (not `scheduled-tasks`, which is itself the head of the open, scope-flagged #2016).

## 2026-06-15

- PRs reviewed: 10 (all open PRs)
  - #1980 — Scheduled tasks: test coverage + admin-config defaults (head `scheduled-tasks`, base `dev-paul`)
  - #1979 — docs: nightly debugger log 2026-06-15 run #18 (head `nightly/debugger-log-2026-06-15`, base `dev-paul`)
  - #1978 — test(lti/ags): trailing-slash regression coverage for scoresUrl (head `nightly/build-tooling-2026-06-15`, base `dev-paul`)
  - #1977 — fix(i18n): translate 10 verbatim-EN shareCollection keys DE/ES/FR (head `nightly/admin-config-2026-06-15`, base `dev-paul`)
  - #1976 — fix(migration): range guards in proportionsValid (head `nightly/state-data-2026-06-15`, base `dev-paul`)
  - #1975 — fix(library): guard folder-rename onBlur against stale Escape-cancel (head `nightly/dashboard-layout-2026-06-15`, base `dev-paul`)
  - #1974 — fix(widgets/random): guard group-rename onBlur (head `nightly/widgets-2026-06-15`, base `dev-paul`)
  - #1972 — docs(unifier): run 16 (head `nightly/unifier-log-2026-06-15`, base `dev-paul`)
  - #1971 — UI: redesign Quiz/Video Activity monitor & results views (head `dev-paul`, base `main`)
  - #1951 — fix(i18n): EN-placeholder strings boardsModal/shareCollection DE/ES/FR (head `nightly/admin-config-2026-06-12`, base `dev-paul`)
- Comments processed: 11 total — 7 fixed, 3 explained-no-op, 1 skipped (author rationale present)
  - #1975: 4 unresolved threads — gemini HIGH Enter-commit double-fire on unmount blur in `NewFolderInput` + claude's matching pre-existing-risk note → FIXED with one `if (!e.currentTarget?.isConnected) return;` guard on `onBlur`; 2 claude test-gap threads (NewFolderInput has no regression test) → EXPLAINED (component is non-exported; needs full-FolderSidebar harness that actually unmounts the input — flagged for manual follow-up).
  - #1977: 4 unresolved threads — 3 gemini type-safety threads (remove `as unknown as`/`Record<string, unknown>` casts) → FIXED via `LocaleWithShareCollection` interface + `keyof ShareCollectionSection`-typed key list; 1 claude FR terminology thread (`Établissement` vs established `bâtiment`) → FIXED to `Bâtiment`/`— Sélectionner un bâtiment —`.
  - #1972: 1 gemini thread — stale `D3-E12` reference in 2026-06-14 log row → FIXED to `D3-E13`.
  - #1980: 1 gemini thread — `vi.restoreAllMocks()` cleanup → EXPLAINED (already present in the branch's `afterEach`, lines 94–97; `vi.useRealTimers()` correctly omitted, no fake timers).
  - #1971: 56/57 review threads resolved by author; 1 unresolved (copilot — fixed `size={16}` icons in `OverflowMenu`) → SKIPPED, author already replied with a rationale (intentional fixed-size chrome matching the library menu).
  - #1974, #1976, #1978, #1979, #1951: no unresolved review comments.
- Fixes pushed: 3
  - #1975 / `nightly/dashboard-layout-2026-06-15` (08dda10) — `NewFolderInput.onBlur` `isConnected` guard against the Enter-unmount double-commit. type-check ✓ lint ✓ format ✓ existing rename test ✓
  - #1977 / `nightly/admin-config-2026-06-15` (7f70499) — FR `building`/`selectBuilding` aligned to "bâtiment" + type-safe `shareCollectionLocales.test.ts`. type-check ✓ lint ✓ format ✓ 11/11 locale tests ✓
  - #1972 / `nightly/unifier-log-2026-06-15` (d4e8b74) — `D3-E12` → `D3-E13` in run log. prettier ✓ (doc-only)
- Reviews posted: 10 (one structured review per PR)
  - #1980: Ready — substitute-portal hook tests (20); mock cleanup already correct.
  - #1979: Ready — doc-only debugger run #18 log.
  - #1978: Ready — additive trailing-slash AGS coverage (528→532).
  - #1977: Ready — root-cause i18n fix + verbatim guard; type-safety/terminology nits resolved.
  - #1976: Ready — root-cause `proportionsValid` range-guard fix with FAIL-before/PASS-after tests.
  - #1975: Ready with minor notes — Escape + Enter-double-commit fixes; `NewFolderInput` test gap flagged.
  - #1974: Ready — `cancelledRef` stale-closure guard + 8 tests.
  - #1972: Ready — doc-only unifier run 16; numbering fix applied.
  - #1971: Ready with minor notes — large shared-atom Quiz/VA monitor/results refactor into `main`; 56/57 threads resolved; CI `pending`, recommend confirming green + manual live-session smoke test (touches live monitor/results path).
  - #1951: Ready — boardsModal/collection i18n (~335 values) + regression suite; all 6 threads resolved.
- Notes:
  - Branch-safety: all 9 nightly/scheduled head branches are non-`main` / non-`dev-*` → pushable; only #1975, #1977, #1972 needed fix pushes. #1971's head is `dev-paul` (matches `dev-*`, read-only) — review comment only, no push.
  - Verification ran on Node 22 locally (project wants Node 24); type-check/lint/format/tests all green for the touched files. CI on Node 24 remains the authoritative gate.

## 2026-06-14

- PRs reviewed: 8 (all open PRs; all head branches are `nightly/*` or `scheduled-tasks` → base `dev-paul`, all in-scope for pushing)
  - #1969 — action(admin-config): wire need-do-put-then building defaults + Sunday audit (head `scheduled-tasks`)
  - #1966 — chore: nightly debugger log 2026-06-14 (run 17) (head `nightly/debugger-log-2026-06-14`)
  - #1965 — fix: Escape while editing widget title saves cancelled text to Firestore (head `nightly/dashboard-layout-2026-06-14`)
  - #1964 — fix(i18n): translate 59 verbatim-English strings in DE/ES/FR collection UI (head `nightly/admin-config-2026-06-14`)
  - #1963 — fix: CalendarWidget 'Today' label uses UTC date instead of local date (head `nightly/widgets-2026-06-14`)
  - #1962 — chore(unifier): run 15 log (head `nightly/unifier-log-2026-06-14`)
  - #1951 — fix(i18n): replace EN-placeholder strings in boardsModal/shareCollection (DE/ES/FR) (head `nightly/admin-config-2026-06-12`)
  - #1945 — docs(unifier): run 14 memory log (head `nightly/unifier-log-2026-06-12`)
- Comments processed: 8 total — 8 fixed, 0 explained-no-op (plus 1 pre-resolved thread on #1951 skipped)
  - #1965: 1 gemini thread (MEDIUM) — removed redundant `setIsEditingTitle(false)` in `saveTitle` cancel guard. Fixed + replied.
  - #1964: 3 gemini threads (MEDIUM) — DE `abgeheftet`→`entpinnt`; FR `échoué(s)`→`en échec` (×2). Fixed + replied.
  - #1963: 3 gemini threads (MEDIUM) — `vi.restoreAllMocks()` to `afterEach`; drop manual call; derive `todayD` from `todayMidnightMs`. Fixed + replied.
  - #1962: 1 gemini thread (MEDIUM) — corrected run-15 file-location wording (`useRemoteConnection.ts` is at `remote/` root; `.test.tsx` files). Fixed + replied.
  - #1969, #1966, #1945: no open review comments.
  - #1951: 1 pre-existing thread already resolved (Cyrillic fix) — no action.
- Fixes pushed: 5
  - #1965 / `nightly/dashboard-layout-2026-06-14` — remove redundant setState in saveTitle cancel guard (b7251be)
  - #1964 / `nightly/admin-config-2026-06-14` — DE/FR translation phrasing fixes (7ee2af6)
  - #1963 / `nightly/widgets-2026-06-14` — sync Today label to todayMidnightMs + centralize mock cleanup (e7bcf26)
  - #1962 / `nightly/unifier-log-2026-06-14` — correct run-15 file-location note (f2c5720)
  - (no push needed for #1969/#1966/#1945/#1951)
  - All verified with type-check ✓ / lint ✓ / targeted tests ✓ before push. No pushes to `main`/`dev-*`.
- Reviews posted: 8 (one structured `COMMENT` review per open PR)
  - Ready: #1965, #1964, #1963, #1966, #1962, #1945, #1951
  - Ready with minor notes: #1969 (small preset-list duplication in the new `getAdminBuildingConfig` case — non-blocking)

---

## 2026-06-13

- PRs reviewed: 11 (all open PRs; one head is `dev-paul` — read-only, review-only)
  - #1960 — fix(state): extract `normalizeActivityWallLibraryEntry` to prevent field-stripping on snapshot refresh (head `nightly/state-data-2026-06-13`, base `dev-paul`)
  - #1959 — chore(memory): nightly run 16 log (head `nightly/debugger-log-2026-06-13`, base `dev-paul`)
  - #1958 — fix(lti): preserve `contextId` across privacy-stripped LTI relaunches (head `nightly/build-tooling-2026-06-13`, base `dev-paul`)
  - #1957 — fix(i18n): extract 4 hardcoded TimeTool Stations strings (head `nightly/admin-config-2026-06-13`, base `dev-paul`)
  - #1956 — fix(keyboard): Alt+P pin shortcut drops when CapsLock is active (head `nightly/dashboard-layout-2026-06-13`, base `dev-paul`)
  - #1955 — fix(widgets): CalendarWidget midnight staleness + useEffect ref-sync anti-pattern (head `nightly/widgets-2026-06-13`, base `dev-paul`)
  - #1954 — docs(unifier): run 14 memory log (head `nightly/unifier-log-2026-06-13`, base `dev-paul`)
  - #1953 — action(css-scaling): scale ActivityWall moderation checkbox with cqmin (head `scheduled-tasks`, base `dev-paul`)
  - #1951 — fix(i18n): replace EN-placeholder strings in boardsModal/shareCollection (DE/ES/FR) (head `nightly/admin-config-2026-06-12`, base `dev-paul`)
  - #1945 — docs(unifier): run 14 memory log (head `nightly/unifier-log-2026-06-12`, base `dev-paul`)
  - #1943 — Enhance Guided Learning editor with media upload/playback (head `dev-paul`, base `main` — read-only; large integration PR)
- Comments processed: 4 total — 0 fixed, 4 already-addressed/no-op (all 4 resolved + replied)
  - #1958: 1 gemini thread (MEDIUM) — already addressed in HEAD. `launchEndpoints.ts` already caches `existingGradeLink.data()` in `gradeLinkData` with explicit `string | null` typing (no repeated `.data()`, no `any`, no assertion). Replied + resolved.
  - #1957: 1 gemini thread (MEDIUM) — already addressed in HEAD. `fr.json` `addStationsTip` already reads "…effectuer une rotation automatique des élèves…". Replied + resolved.
  - #1956: 1 gemini thread (MEDIUM) — already addressed in HEAD. CapsLock test already wraps dispatch in `try…finally` with listener cleanup. Replied + resolved.
  - #1955: 1 gemini thread (HIGH) — already addressed in HEAD. `isBlocked` already derives the date string via local-time `getFullYear()/getMonth()/getDate()` instead of `.toISOString()`. Replied + resolved.
  - #1960, #1959, #1954, #1953, #1951 (resolved), #1945, #1943 (all 7 prior threads resolved): no open review comments requiring action.
- Fixes pushed: 0 — every open review comment was already satisfied by a follow-up commit on its branch; no code changes were warranted. No pushes to `main`/`dev-*`.
- Reviews posted: 11 (one structured `COMMENT` review per open PR)
  - Ready: #1960, #1959, #1958, #1957, #1956, #1955, #1954, #1953, #1951, #1945
  - Needs human review (scope, not defect): #1943 — 100+ file `dev-paul → main` integration PR; highest risk in the `dashboardCanvasStore`/`DashboardContext` refactor. New `rollout_requests` Firestore rule verified (identity-pinned, `hasOnly` allow-list, admin-only triage); `functions/src/index.ts` change is additive + adds an SSRF `maxRedirects: 0` guard. CI status pending at review time.

---

## 2026-06-12

- PRs reviewed: 12 (all open PRs; one head is `dev-paul` — read-only, review-only)
  - #1953 — refactor(admin-config): extract shared `isCardOpacity` guard (head `scheduled-tasks`, base `dev-paul`)
  - #1952 — docs(debugger): nightly run 15 log (head `nightly/debugger-log-2026-06-12`, base `dev-paul`)
  - #1951 — fix(i18n): replace EN-placeholder strings in boardsModal/shareCollection (DE/ES/FR) (head `nightly/admin-config-2026-06-12`, base `dev-paul`)
  - #1950 — fix(state): gradeAnswer partial-credit `isCorrect` consistency (head `nightly/state-data-2026-06-12`, base `dev-paul`)
  - #1949 — fix(layout): typing-field guard on Ctrl+/ cheat-sheet shortcut (head `nightly/dashboard-layout-2026-06-12`, base `dev-paul`)
  - #1948 — fix(docs): format unifier.md to pass Prettier (head `nightly/build-tooling-2026-06-12`, base `dev-paul`)
  - #1947 — fix(widgets): correct negative-range fraction label on NumberLine (head `nightly/widgets-2026-06-12`, base `dev-paul`)
  - #1946 — fix(docs): restore Prettier formatting on unifier.md (head `nightly/unifier-baseline-fix-2026-06-12`, base `dev-paul`)
  - #1945 — docs(unifier): run 14 memory log (head `nightly/unifier-log-2026-06-12`, base `dev-paul`)
  - #1944 — fix(guided-learning): address PR #1943 review feedback (head `claude/serene-meitner-eagi8c`, base `dev-paul`)
  - #1943 — Enhance Guided Learning editor with media upload/playback (head `dev-paul`, base `main` — read-only)
- Comments processed: 11 total — 8 fixed, 3 already-addressed/no-op
  - #1944: 4 gemini threads — 3 FIXED (HIGH: NaN-sanitize `trim.start`/`end` centrally in `clampTrimStart`/`clampTrimEnd` so `video.currentTime` can't be assigned NaN; MEDIUM: sync `onClose` ref in render body instead of `useLayoutEffect`; MEDIUM: drop now-unused `useLayoutEffect` import). 1 outdated thread skipped. Note: the suggested `react-hooks/refs` disable was _not_ needed — the rule doesn't flag this assignment (unused-directive under `--max-warnings 0`).
  - #1951: 1 gemini thread (MEDIUM) — FIXED. `fr.json` `pinnedEmpty` had Cyrillic `инг` in `Épингlez`; corrected to Latin `Épinglez`. Scanned all four locales for Cyrillic-block chars — none remaining.
  - #1950: 1 gemini thread (MEDIUM) — FIXED. `isCorrect = pointsEarned >= max` marked every answer correct for a 0-point question (`0 >= 0`) and used float comparison; switched to `matched === total` (equivalent for `max > 0`, correct for `max === 0`) + added a 0-point regression test.
  - #1949: 1 gemini thread (MEDIUM) — FIXED. Extracted the duplicated input/textarea/select/contentEditable check into a file-level `isTypingFieldActive()` helper and applied it to all six keydown guard sites.
  - #1947: 3 gemini threads (MEDIUM) — FIXED. Simplified the negative-tick fraction expr to `Math.abs(valNumer) % denom` (distinct from the `Math.abs(valNumer % denom)` band-aid the PR rejected — keeps `% denom`); corrected two test descriptions (`-1 3/4` is first sub-tick _above -2_; `fractionLabel` renders `2/4`, not `1/2`).
  - #1943: 7 threads — all already addressed via #1944 (author replies on each thread). No action.
  - #1953, #1952, #1948, #1946, #1945: no review comments.
- Fixes pushed: 5 (each to its own PR head branch — no pushes to `main`/`dev-*`)
  - #1944 / `claude/serene-meitner-eagi8c` — `fix(pr-1944): sanitize non-finite video trim values and sync onClose ref in render body`; type-check ✓ lint ✓ tests ✓ (5/5).
  - #1951 / `nightly/admin-config-2026-06-12` — `fix(pr-1951): replace Cyrillic characters in fr.json pinnedEmpty`; JSON ✓ prettier ✓ i18n tests ✓ (156/156).
  - #1950 / `nightly/state-data-2026-06-12` — `fix(pr-1950): derive matching isCorrect from matched===total`; type-check ✓ lint ✓ tests ✓ (13/13).
  - #1949 / `nightly/dashboard-layout-2026-06-12` — `fix(pr-1949): extract isTypingFieldActive helper`; type-check ✓ lint ✓ tests ✓ (25/25).
  - #1947 / `nightly/widgets-2026-06-12` — `fix(pr-1947): simplify negative-tick fraction expr and correct test descriptions`; type-check ✓ lint ✓ tests ✓ (16/16).
- Reviews posted: 12 (one structured `## Automated Code Review` per PR)
  - #1953 Ready; #1952 Ready; #1951 Ready (Cyrillic fix pushed); #1950 Ready (0-point fix pushed); #1949 Ready (helper extraction pushed); #1948 Ready (dup of #1946); #1947 Ready (simplification pushed); #1946 Ready (dup of #1948); #1945 Ready; #1944 Ready (all threads resolved); #1943 **Needs changes** (CI red — see below).
- Notes:
  - Branch-safety: #1943 head is `dev-paul` (matches `dev-*`) → read-only, review-only, no push. All other heads (`nightly/*`, `claude/*`, `scheduled-tasks`) are pushable; 5 fixes went to their own head branches. No pushes to `main` or `dev-paul`.
  - **#1943 CI is red** but only on `format:check` for `docs/routines/unifier.md` (Prettier drift) — all other jobs (type-check, Unit, E2E, Build, Firestore Rules, CodeQL) pass. This is exactly what **#1946**/**#1948** fix; landing one into dev-paul and re-running #1943's CI clears it. The 7 inline review threads on #1943 are already handled via #1944.
  - **Duplicate Prettier fix flagged:** #1946 (run-14 baseline-fix branch) and #1948 (run-15 build-tooling branch) carry the _identical_ reformat of `docs/routines/unifier.md`. Only one is needed — merge one and the other becomes empty/conflicting. #1945 also edits the same file (run-14 log content) and will need a trivial merge-order reconciliation.
  - Forward note: #1952's new "partial-credit `isCorrect` invariant" gotcha documents `pointsEarned >= pointsMax`; #1950 was refined to `matched === total` (handles the `max === 0` case). Worth syncing the gotcha wording when convenient.

---

## 2026-06-11

- PRs reviewed: 10 (all open PRs; every head is non-`main`/non-`dev-*`, so all in scope; all base `dev-paul`)
  - #1942 — docs(unifier): run 13 memory log (head `nightly/unifier-log-2026-06-11`)
  - #1941 — D4: convert tests/ relative imports to `@/` alias (head `nightly/unify-import-paths-tests-2026-06-11`)
  - #1940 — chore(perf): refresh performance baselines (head `nightly/perf-baseline-2026-06-11`)
  - #1939 — fix(layout): remove duplicate Alt+Delete handler from DraggableWindow (head `nightly/dashboard-layout-2026-06-11`)
  - #1938 — docs(debugger): nightly run 14 log (head `nightly/debugger-log-2026-06-11`)
  - #1937 — fix(functions): maxRedirects:0 SSRF guard in checkUrlCompatibility (head `nightly/build-tooling-2026-06-11`)
  - #1936 — fix(i18n): boardBreadcrumb/collectionSwitcher DE/ES/FR placeholders (head `nightly/admin-config-2026-06-11`)
  - #1935 — fix(state): dedup questions in classroomGradePush currentTotal (head `nightly/state-data-2026-06-11`)
  - #1934 — fix(BreathingWidget): phase==='ready' sentinel for Reset disabled (head `nightly/widgets-2026-06-11`)
  - #1933 — chore(scheduled-tasks): audit journals + activity-wall building defaults (head `scheduled-tasks`)
- Comments processed: 9 total — 7 fixed, 2 explained
  - #1939: 1 HIGH gemini thread — removing the `DraggableWindow` Alt+Backspace branch left `Alt+Backspace` unhandled because `DashboardView` only matched `Delete` → FIXED (global handler now clears on Delete+Backspace under Alt/Shift; plain Backspace stays a no-op).
  - #1936: 5 threads (3 HIGH stale `.root` keys in DE/ES/FR + 2 MEDIUM redundant test casts) → all 5 FIXED (translated `.root` to match the `"No Collection"` EN source, removed casts, extended the regression test to guard `.root`).
  - #1938: 1 MEDIUM gemini thread — duplicate `normalizeSession` backlog row → FIXED (removed; already tracked on the 06-08/06-09 rows).
  - #1942: 1 MEDIUM gemini thread (outdated) — Run Log PR-number column → EXPLAINED (no fix): committed table already has the PR in its own 5th column.
  - #1933: 1 MEDIUM gemini thread (outdated) — 64-vs-63 widget-count discrepancy → EXPLAINED (no fix): reviewer's own guidance is not to auto-reconcile historical audit logs; the PR itself reconciles it with an explicit awk verification.
  - #1940, #1941, #1935, #1934, #1937: no review comments.
- Fixes pushed: 3
  - #1939 / `nightly/dashboard-layout-2026-06-11` — restored Alt/Shift+Backspace clear-board in DashboardView; type-check ✓ lint ✓ tests ✓ (28/28).
  - #1936 / `nightly/admin-config-2026-06-11` — translated `.root` keys (Keine Sammlung / Sin colección / Aucune collection), dropped redundant test casts, extended regression test; type-check ✓ lint ✓ format ✓ tests ✓ (20/20).
  - #1938 / `nightly/debugger-log-2026-06-11` — removed duplicate backlog row (doc-only).
- Reviews posted: 10 (one structured review per PR)
  - #1942: Ready — doc-only unifier run 13 log; outdated table nit already resolved.
  - #1941: Ready — `@/` alias substitution; behavior-preserving (one bonus double-mock cleanup in escapeInteraction.test.tsx).
  - #1940: Ready with minor notes — baseline refresh is more than timing-only: `dashboard-baseline.json` `totalShellRenders` (a deterministic primary metric) dropped across nearly every scenario (the DashboardContext-split win); recommended correcting the PR body.
  - #1939: Ready — handler-ownership consolidation; the Alt+Backspace gap raised in review is fixed.
  - #1938: Ready — doc-only debugger run 14 log; duplicate backlog row removed.
  - #1937: Ready — genuine SSRF redirect-bypass fix mirroring fetchExternalProxy; good test.
  - #1936: Ready — locale placeholder fix + parity-enforcing test; all gemini follow-ups addressed.
  - #1935: Ready — Set-based dedup fence matching 5 prior fixes; well-tested.
  - #1934: Ready — phase sentinel for Reset disable; one-line + regression test.
  - #1933: Ready — high-quality activity-wall building-defaults wiring (pure validated helper + 8 tests); journal updates doc-only.
- Notes:
  - Branch-safety: all 10 head branches are non-`main`/non-`dev-*` → pushable; 3 required fix pushes.
  - #1933 head is `scheduled-tasks` (this log's branch); appending today's entry here and pushing follows the POST-TASK workflow.

---

## 2026-06-10

- PRs reviewed: 12 (all open PRs; no head is `main`/`dev-*`, so all in scope)
  - #1931 — perf(dashboard): DashboardContext split (head `perf/dashboard-context-split`, base `perf/dashboard-canvas-pass`)
  - #1930 — test(hooks): cover useVideoActivitySessionTeacher (head `add-video-activity-session-teacher-tests`, base `dev-paul`)
  - #1929 — audit(wednesday): daily/weekly audits 2026-06-10 (head `scheduled-tasks`, base `main`)
  - #1928 — fix(stores): `?? null` on contextId/contextTitle/resourceLinkId (head `nightly/build-tooling-2026-06-10`, base `dev-paul`)
  - #1927 — fix(i18n): widgets.seatingChart for DE/ES/FR (head `nightly/admin-config-2026-06-10`, base `dev-paul`)
  - #1926 — fix(export): first-occurrence answer dedup in buildResultsSheetData (head `nightly/state-data-2026-06-10`, base `dev-paul`)
  - #1925 — fix(DashboardView): guard groupBuildMode Escape vs typing fields (head `nightly/dashboard-layout-2026-06-10`, base `dev-paul`)
  - #1924 — chore(perf): refresh baseline.json (head `nightly/perf-baseline-2026-06-10`, base `dev-paul`)
  - #1923 — perf(dashboard): canvas perf pass + ruler (head `perf/dashboard-canvas-pass`, base `dev-paul`)
  - #1922 — docs(unifier): run 11 log 2026-06-10 (head `nightly/unifier-log-2026-06-10`, base `dev-paul`)
  - #1915 — chore(debugger): run 13 log 2026-06-09 (head `nightly/debugger-log-2026-06-09`, base `dev-paul`)
  - #1910 — docs(unifier): run 11 log 2026-06-09 (head `nightly/unifier-log-2026-06-09`, base `dev-paul`)
- Comments processed: 6 total — 3 fixed, 3 explained (all from gemini-code-assist)
  - #1923: 2 threads — FIXED. `minimizeAllWidgets`/`restoreAllWidgets` now read `activeIdRef.current` and drop `activeId` from deps for reference stability. Also converted the `if (!activeId) return` early-return guards in both (the suggestion only showed the `d.id` line; leaving the guard on the closure while removing the dep would have made it stale). `activeIdRef.current` is render-body-synced. type-check ✓ lint ✓ tests ✓.
  - #1926: 1 thread — FIXED. Added `const answers = r.answers ?? []` nullish guard before the dedup loop and switched the map value type to `R['answers'][number]`. type-check ✓ lint ✓ tests ✓ (17/17).
  - #1931: 1 thread — EXPLAINED. gemini's `lastCommittedState` notify-bailout is a sound, low-risk optimization but changes the brand-new store's notify semantics in a concurrent-rendering-sensitive path; recommended to the author but not auto-applied (design call, not a correctness defect).
  - #1925: 1 thread — EXPLAINED. Test-cleanup hardening (centralize element disposal in `afterEach`) is an enhancement; suite passes 21/21 and the suggestion is a wholesale `describe` rewrite, not a targeted fix.
  - #1924: 1 thread — EXPLAINED. Reverting durations to 3-run medians while surgically updating only the `gl.type25` commit count is a baseline-methodology decision that would undo the PR's stated purpose; left to the author.
  - #1930, #1929, #1928, #1927, #1922, #1915, #1910: no review comments.
- Fixes pushed: 2 (each to its own PR head branch — no pushes to `main`/`dev-*`)
  - #1923 / `perf/dashboard-canvas-pass` — `fix(pr-1923): make minimizeAllWidgets/restoreAllWidgets reference-stable`
  - #1926 / `nightly/state-data-2026-06-10` — `fix(pr-1926): guard answers iteration with ?? [] and use R['answers'][number]`
- Reviews posted: 12 (all COMMENT event)
  - #1931 Ready w/ notes (stacked on #1923 — merge that first; adopt notify bailout); #1930 Ready (test-only, faithful wiring; flagged VA's non-filtering of empty classIds/rosterIds as a possible follow-up); #1929 **Needs changes** (described "audit-only" but diff vs base `main` carries ~4,000+ lines of source — GuidedLearningEditor +1083, new ScreenCaptureModal +464, VideoActivityEditor +463, Quiz/VA editor modals, workflow files — `scheduled-tasks` has diverged from `main`; reconcile base/scope before merging to `main`); #1928 Ready; #1927 Ready; #1926 Ready (defensive guard pushed); #1925 Ready w/ notes (test-cleanup hardening deferred); #1924 Ready w/ notes (single-run snapshot noise); #1923 Ready w/ notes (ref-stability pushed; base of #1931); #1922 Ready w/ notes (run-11 unifier.md collides with #1910); #1915 Ready; #1910 Ready w/ notes (duplicate run-11 of unifier.md, collides with #1922).
- Notes:
  - Branch-safety: no open PR head is `main` or `dev-*`; all heads pushable. Both fixes went to PR head branches. No pushes to `main` or `dev-paul`. This log committed to `scheduled-tasks` (fair-game) per task instructions.
  - **#1929 scope discrepancy (flag for human):** the audit PR's base is `main` and `scheduled-tasks` is far ahead of it, so the PR would land a large editor refactor into production `main`. Either retarget to `dev-paul` or re-sync `scheduled-tasks` to `main`. (This log commit rides on that same branch but is docs-only.)
  - **Duplicate run-11 unifier logs:** #1910 (2026-06-09) and #1922 (2026-06-10) both bump `docs/routines/unifier.md` to "Run count: 11" and edit overlapping rows → conflict on second merge; flagged on both.
  - #1929 journals also surface a real Firestore **MEDIUM** (`pollVotes` subcollection writes unrestricted for all authenticated users) worth a dedicated `firestore.rules` fix PR.
  - #1923 touches `context/DashboardContext.tsx` heavily but identity-preserving; #1931 adds a new `dashboardCanvasStore.ts` with conditional-`use()` fallback so the ~185 `useDashboard()` consumers are untouched. No new `WidgetType`/`WidgetRegistry.ts` config-merge or `firestore.rules` match-block changes in the code-bearing PRs, so those checks were not triggered.

---

## 2026-06-08

- PRs reviewed: 12 (all open PRs; every head is non-`main`/non-`dev-*`, so all in scope; all base `dev-paul`)
  - #1905 — test(hooks): cover useMiniAppSessionTeacher (head `scheduled-tasks`)
  - #1904 — chore(debugger): nightly run log 2026-06-08 run 11 (head `nightly/debugger-log-2026-06-08`)
  - #1903 — fix(nrpsStore): preserve contextTitle on privacy LTI relaunch (head `nightly/build-tooling-2026-06-08`)
  - #1902 — fix(state-data): normalizeSession drops optional VA session fields (head `nightly/state-data-2026-06-08`)
  - #1901 — fix(DashboardView): Alt+Arrow/Alt+P swallow events in text fields (head `nightly/dashboard-layout-2026-06-08`)
  - #1900 — fix(i18n): add widgets.clock/schedule + sidebar.boards keys to DE/ES/FR (head `nightly/admin-config-2026-06-08`)
  - #1899 — fix(NumberLine): toFixed(4) baseline for all display modes (head `nightly/widgets-2026-06-08`)
  - #1898 — docs(unifier): run 10 memory log 2026-06-08 (head `nightly/unifier-log-2026-06-08`)
  - #1897 — fix(D4): convert utils/ relative imports to @/ alias (head `nightly/unify-import-paths-utils-2026-06-08`)
  - #1896 — docs(nightly): run 11 memory log 2026-06-07 (head `nightly/debugger-log-2026-06-07`)
  - #1890 — chore(unifier): run 10 memory doc 2026-06-07 (head `nightly/unifier-log-2026-06-07`)
  - #1889 — fix(D4): utils/ cross-directory imports → @/ alias (head `nightly/unify-import-paths-utils-2026-06-07`)
- Comments processed: 11 total — 10 fixed, 1 explained (all from gemini-code-assist)
  - #1905: 3 threads — FIXED. Import `afterEach`, add `afterEach(vi.restoreAllMocks())`, drop manual `consoleSpy.mockRestore()`. lint ✓ tests ✓ (21/21).
  - #1902: 2 threads — FIXED. Removed redundant `as never` / `as { … }` casts in the normalize test; fields are declared optionals on `VideoActivitySession`, sessionOptions now uses real `VideoActivitySessionOptions` fields. type-check ✓ tests ✓ (19/19).
  - #1901: 2 threads — FIXED. Dropped redundant `P`/`Nav` suffixes on block-scoped `activeEl`/`isTypingField` guard vars. type-check ✓ lint ✓ tests ✓ (10/10).
  - #1900: 2 threads — FIXED. German `Tafel-Daten`→`Tafeldaten` (compound noun) and `inherit` `Übernehmen`→`Vom Board` (avoids "Apply" ambiguity). prettier ✓ i18n tests ✓ (35/35).
  - #1899: 1 thread — FIXED. Removed dead `displayMode === 'decimals'` no-op branch. type-check ✓ lint ✓ tests ✓ (6/6).
  - #1898: 1 thread — EXPLAINED, no fix. The suggested `AssignModal.tsx:23`/`ImportWizard.tsx:31` line numbers are wrong; verified the doc's existing `:24`/`:30` match the actual code. Suggested edit would introduce errors.
  - #1904, #1903, #1897, #1896, #1890, #1889: no review comments.
- Fixes pushed: 5 (each to its own PR head branch — no pushes to `main`/`dev-*`)
  - #1899 / `nightly/widgets-2026-06-08` — `fix(pr-1899): remove dead displayMode==='decimals' no-op branch`
  - #1905 / `scheduled-tasks` — `fix(pr-1905): add afterEach restoreAllMocks and remove manual mockRestore`
  - #1902 / `nightly/state-data-2026-06-08` — `fix(pr-1902): remove redundant type assertions in normalize test`
  - #1901 / `nightly/dashboard-layout-2026-06-08` — `fix(pr-1901): drop redundant P/Nav suffixes on block-scoped guard vars`
  - #1900 / `nightly/admin-config-2026-06-08` — `fix(pr-1900): correct German translations (Tafeldaten, inherit label)`
- Reviews posted: 12 (all COMMENT event)
  - #1905 Ready; #1904 Ready w/ notes (run-11 debugger.md overlaps #1896); #1903 Ready (contained LTI null-clobber fix); #1902 Ready; #1901 Ready; #1900 Ready; #1899 Ready; #1898 Ready w/ notes (run-10 unifier.md overlaps #1890; wrong line-number nit declined); #1897 Ready w/ notes (DUPLICATE of #1889 — merge one); #1896 Ready w/ notes (overlaps #1904); #1890 Ready w/ notes (overlaps #1898; tracks dup #1889); #1889 Needs changes (superseded by more-complete #1897).
- Notes:
  - Branch-safety: no open PR head is `main` or `dev-*`; all heads pushable. All 5 fixes went to PR head branches. No pushes to `main`.
  - **Duplicate-PR cluster flagged:** #1889 and #1897 make the identical `utils/`→`@/` conversion (#1897 also converts the `FONTS` import; more complete). Their memory-log PRs (#1890 ↔ #1898, both "run 10") and the debugger logs (#1896 ↔ #1904, both "run 11") similarly overlap and will conflict on second merge. Recommended in reviews that the team land one of each pair.
  - #1903 touches `functions/src/lti/nrpsStore.ts` — additive title-preservation logic only; `persistLtiLaunchContext` signature unchanged. No new `WidgetType`, no `WidgetRegistry.ts`/`DashboardContext.tsx` config-merge, no `firestore.rules` changes across the batch, so widget-registration and rules-match-block checks were not triggered.

---

## 2026-06-07

- PRs reviewed: 10 (all open PRs; every head is non-`main`/non-`dev-*`, so all in scope)
  - #1896 — docs(nightly): run 11 memory log (head `nightly/debugger-log-2026-06-07`, base `dev-paul`)
  - #1895 — fix(CalculatorTool): expression desyncs from display on decimal (head `nightly/widgets-2026-06-07`, base `dev-paul`)
  - #1894 — fix(Dock): remove spurious processAndUploadImage dep from smart-paste useEffect (head `nightly/dashboard-2026-06-07`, base `dev-paul`)
  - #1893 — fix: dedup questions denominator in getResponseScore (head `nightly/state-2026-06-07`, base `dev-paul`)
  - #1892 — fix(i18n): add widgets.weather namespace to DE and FR (head `nightly/admin-2026-06-07`, base `dev-paul`)
  - #1891 — fix(functions): register widget-builder/widget-explainer in per-feature AI tracking (head `nightly/build-2026-06-07`, base `dev-paul`)
  - #1890 — chore(unifier): run 10 memory doc (head `nightly/unifier-log-2026-06-07`, base `dev-paul`)
  - #1889 — fix(D4): utils/ cross-directory imports → @/ alias (head `nightly/unify-import-paths-utils-2026-06-07`, base `dev-paul`)
  - #1888 — fix(D1): SoundboardWidget "Select sounds below" → ScaledEmptyState (head `nightly/unify-empty-states-2026-06-07`, base `dev-paul`)
  - #1887 — scheduled-tasks: NextUp maxWidth cqmin + SmartNotebook admin-config docs (head `scheduled-tasks`, base `dev-paul`)
- Comments processed: 1 total — 1 fixed, 0 explained
  - #1894: 1 unresolved thread (gemini-code-assist) — FIXED. The new regression test called `setupMocks()` _after_ setting `useImageUpload`'s `fnA` return value; since `setupMocks()` re-mocks `useImageUpload` with a fresh `vi.fn()`, it silently clobbered `fnA` so the first render never used it. Reordered `setupMocks()` ahead of the `fnA` mock. type-check ✓ lint ✓ tests ✓ (5/5 in Dock.test.tsx). Replied and resolved the thread.
  - #1887: 1 thread already resolved (NextUp maxWidth `30cqmin` fix from 2026-06-06) — no action.
  - All other PRs: no review comments.
- Fixes pushed: 1
  - #1894 / `nightly/dashboard-2026-06-07` — commit `e76d763` `fix(pr-1894): call setupMocks() before fnA mock in smart-paste test`.
- Reviews posted: 10 (all COMMENT event)
  - #1896 Ready (docs); #1895 Ready; #1894 Ready (test-ordering fix pushed); #1893 Ready; #1892 Ready; #1891 Ready; #1890 Ready (docs); #1889 Ready (mechanical @/ alias); #1888 Ready (verified ScaledEmptyState + Music already imported); #1887 Ready with minor notes (css-scaling.md Completed entry still records the superseded `min(120px, 30cqmin)` value — doc-only).
- Notes:
  - Branch-safety: no open PR head is `main` or `dev-*`; all heads were pushable. The single fix went to its PR head branch (`nightly/dashboard-2026-06-07`). No pushes to `main`.
  - All 9 nightly PRs are small, focused bug/i18n/refactor/doc changes; none add a new `WidgetType` or touch `WidgetRegistry.ts`/`DashboardContext.tsx` config-merge/`firestore.rules`, so the widget-registration and rules-match-block checks were not triggered. #1891 touches `functions/src/index.ts` (two additive `if` statements — no signature change) and #1887 touches `types.ts`/`utils/adminBuildingConfig.ts` (comment-only).

## 2026-06-06

- PRs reviewed: 5 (all open PRs; every head is non-`main`/non-`dev-*`, so all in scope)
  - #1887 — fix(css-scaling): scale NextUp session-name maxWidth cap with cqmin (head `scheduled-tasks`, base `dev-paul`)
  - #1886 — docs(unifier): run 9 memory log (2026-06-06) (head `nightly/unifier-log-2026-06-06`, base `dev-paul`)
  - #1885 — D3: 4 admin config modal labels → SettingsLabel (head `nightly/unify-settings-labels-2026-06-06`, base `dev-paul`)
  - #1884 — D4: hooks/ cross-directory imports → @/ alias (head `nightly/unify-import-paths-hooks-2026-06-06`, base `dev-paul`)
  - #1883 — D1: WorkSymbols "select a symbol" empty state → ScaledEmptyState (head `nightly/unify-empty-states-2026-06-06`, base `dev-paul`)
- Comments processed: 2 threads — 2 fixed, 0 explained
  - #1887: 1 thread — FIXED. gemini-code-assist correctly noted `maxWidth: 'min(120px, 30cqmin)'` still hard-caps at 120px (since `min()` picks the smaller value), defeating the PR's scaling goal. Changed to `maxWidth: '30cqmin'` so the session name scales with the widget. type-check ✓ lint ✓ format ✓.
  - #1886: 1 thread — FIXED. Removed the duplicate "D4 hooks/ complete (run 9)" note, keeping the more detailed entry (the one noting the `useImageUpload.ts` Prettier fix). Did NOT apply gemini's literal suggestion text, which would have duplicated the adjacent "D4 context/ complete (run 8)" line; removed the redundant line instead. format ✓.
  - #1885, #1884, #1883: no review comments.
- Fixes pushed: 2
  - #1887 / `scheduled-tasks` — commit `fbe309b` `fix(pr-1887): use 30cqmin directly for NextUp session-name maxWidth`.
  - #1886 / `nightly/unifier-log-2026-06-06` — commit `9c0ba4c` `fix(pr-1886): remove duplicate D4 hooks/ run-9 note in unifier log`.
- Reviews posted: 5 (all COMMENT event)
  - #1887 Ready w/ minor notes (css-scaling.md Completed entry still records the superseded `min(120px, 30cqmin)` value — doc-only); #1886 Ready; #1885 Ready (verified `SettingsLabel` `icon?` prop signature; `Settings2` still used); #1884 Ready (mechanical `@/` alias, `./` sibling imports untouched); #1883 Ready (verified `ScaledEmptyState` requires `icon`+`title`; usage correct).
- Notes:
  - Branch-safety: no open PR head is `main` or `dev-*`; all heads were pushable. Both fixes went to their respective PR head branches (`scheduled-tasks` for #1887, `nightly/unifier-log-2026-06-06` for #1886). No pushes to `main`.
  - Verified component signatures before reviewing: `components/common/SettingsLabel.tsx` (optional `icon` rendered at `w-3 h-3`, label `mb-2`) and `components/common/ScaledEmptyState.tsx` (`icon` + `title` required, `subtitle` optional, default icon color `text-slate-300`). Both #1885 and #1883 use them correctly.
  - All five PRs are small, mechanical/doc-level changes — no new widgets, no `types.ts`/`WidgetRegistry.ts`/`DashboardContext.tsx`/Firestore-rules changes, so the widget-registration and rules-match-block checks were not triggered.

## 2026-06-05

- PRs reviewed: 14 (all open PRs; every head is non-`main`/non-`dev-*`, so all in scope)
  - #1879 — feat(admin): per-building appearance defaults for the Stations widget (head `scheduled-tasks`, base `dev-paul`)
  - #1878 — chore(docs): nightly debugger run log 2026-06-05 (head `nightly/debugger-log-2026-06-05`, base `dev-paul`)
  - #1877 — fix(layout): include SELECT in keyboard-handler isInput guards (head `nightly/dashboard-layout-2026-06-05`, base `dev-paul`)
  - #1876 — fix(i18n): add widgets.random namespace to DE/ES/FR (head `nightly/admin-config-2026-06-05`, base `dev-paul`)
  - #1875 — fix(state): dedup stepId accumulation in GL publishAssignmentScores (head `nightly/state-data-2026-06-05`, base `dev-paul`)
  - #1874 — fix(widgets): update phaseDuration on mid-cycle pattern change in useBreathing (head `nightly/widgets-2026-06-05`, base `dev-paul`)
  - #1873 — fix(functions): register dashboard-layout + instructional-routine in per-feature AI tracking (head `nightly/build-tooling-2026-06-05`, base `dev-paul`)
  - #1872 — docs(unifier): run 8 memory log 2026-06-05 (head `nightly/unifier-log-2026-06-05`, base `dev-paul`)
  - #1871 — refactor(D4): context/ relative imports → @/ alias (head `nightly/unify-import-paths-context-2026-06-05`, base `dev-paul`)
  - #1870 — refactor(D3): hand-rolled labels → SettingsLabel in admin config (head `nightly/unify-settings-labels-2026-06-05`, base `dev-paul`)
  - #1864 — docs(changelog): release entry for 2026-06-04 (#1863 batch) (head `claude/vibrant-darwin-TXWlL`, base `dev-paul`)
  - #1861 — docs(changelog): release entry for 2026-06-04 (#1860 batch) (head `claude/vibrant-darwin-eN8R7`, base `dev-paul`)
  - #1852 — docs(unifier): run 8 memory log 2026-06-04 (head `nightly/unifier-log-2026-06-04`, base `dev-paul`)
  - #1838 — fix(iframe-auth): gate Classroom add-on + LTI teacher surfaces on a real Google session (head `claude/epic-einstein-JNkjY`, base `dev-paul`)
- Comments processed: 6 threads — 0 fixed, 6 explained
  - #1879: 1 thread — explained, no fix. gemini's `undefined`-property cleanup is unnecessary: feature config is saved via `FeaturePermissionsManager.savePermission` with a full-document `setDoc` (no `{ merge: true }`), so `ignoreUndefinedProperties` drops a `fontFamily: undefined` reset-to-Global correctly. Also matches the sibling Checklist/ConceptWeb panels.
  - #1876: 2 threads — explained, already addressed in `4bd04b2` (pluralized `modeChipAriaWithCount_*`/`triggerAriaWithAbsent_*` keys already present in test + all locales).
  - #1875: 1 thread (outdated) — explained, mocks already use the `@/` alias in HEAD (active, not inert).
  - #1874: 1 thread (outdated) — explained, the `newDurationSeconds === 0` else-branch is already present in HEAD (`useBreathing.ts:83–89`).
  - #1870: 1 thread — explained, no fix. MathTools grid column headers becoming orphan `<label>`s is a design tradeoff; `SettingsLabel` deliberately always renders `<label>` per its own documented rationale. Deferred to human/design owner; suggested an `as`/`role` escape hatch as the clean path.
  - #1864, #1861, #1838: inline threads already carried author "Fixed/Valid" replies (or are resolved) at HEAD — no action.
  - #1878, #1877, #1873, #1872, #1871, #1852: no review comments.
- Fixes pushed: 0 — every actionable comment was already addressed in a later commit, not-a-defect (evidence-backed), or a design tradeoff for human judgment. No branch pushes this run other than this log update.
- Reviews posted: 14 (all COMMENT event)
  - #1879 Ready w/ minor notes (incidental scheduled-tasks journal-doc churn riding along); #1878 Ready; #1877 Ready; #1876 Ready (native DE/ES/FR copy spot-check suggested); #1875 Ready; #1874 Ready; #1873 Ready; #1872 Ready w/ minor notes (run-8 ledger dup vs #1852); #1871 Ready; #1870 Ready w/ minor notes (a11y thread deferred); #1864 Ready w/ minor notes (changelog overlap w/ #1861); #1861 Ready w/ minor notes (overlap w/ #1864); #1852 Ready w/ minor notes (superseded by #1872); #1838 Ready w/ minor notes (author-flagged live Classroom smoke test).
- Notes:
  - Branch-safety: no open PR head is `main` or `dev-*`; all branches were pushable. No fixes required pushing this run. No pushes to `main`.
  - Cross-PR coordination flagged for humans: (1) #1864 and #1861 both add a 2026-06-04 entry to `public/changelog.json` → `dev-paul` (conflict/duplicate risk — reconcile or sequence); (2) #1852 (06-04) and #1872 (06-05) are both "run 8" `docs/routines/unifier.md` updates → `dev-paul` (#1872 supersedes #1852); (3) #1879's diff carries accumulated `docs/scheduled-tasks/*.md` journal updates beyond the Stations feature.
  - CI status was not surfaced via the commit-status API (`total_count: 0` on all heads — these branches validate through GitHub Actions check_runs, not legacy statuses); merge-readiness is based on diff review + each PR's stated `pnpm run validate` result rather than an independently re-run CI.

## 2026-06-04

- PRs reviewed: 13 (all open PRs; all heads are non-`main`/non-`dev-*`, so all in scope)
  - #1859 — feat(admin): per-building appearance defaults for ConceptWeb & Checklist (head `claude/compassionate-noether-9xpQW`, base `dev-paul`)
  - #1858 — docs(nightly): run 9 debugger memory doc (head `nightly/debugger-log-2026-06-04`, base `dev-paul`)
  - #1857 — fix(functions): track video-activity-recommend AI usage per-feature (head `nightly/build-tooling-2026-06-04`, base `dev-paul`)
  - #1856 — fix(i18n): add missing widgets.lunchCount namespace to DE/ES/FR (head `nightly/admin-config-2026-06-04`, base `dev-paul`)
  - #1855 — fix(state): dedup answered-question ids in quiz grading accumulator (head `nightly/state-data-2026-06-04`, base `dev-paul`)
  - #1854 — fix(layout): resolve widgetId from .widget ancestor, not focused child (head `nightly/dashboard-layout-2026-06-04`, base `dev-paul`)
  - #1853 — fix(widgets): restore breathing phase position on pause/resume (head `nightly/widgets-2026-06-04`, base `dev-paul`)
  - #1852 — docs(unifier): run 8 memory log (head `nightly/unifier-log-2026-06-04`, base `dev-paul`)
  - #1851 — refactor(D4): plc authoring/tabs→assignments imports → @/ alias (head `nightly/unify-import-paths-plc-authoring-2026-06-04`, base `dev-paul`)
  - #1850 — refactor(D3): NextUp/MathTools/RecessGear settings labels → SettingsLabel (head `nightly/unify-settings-labels-2026-06-04`, base `dev-paul`)
  - #1849 — docs(changelog): release entry 2026.06.03.2 (head `claude/vibrant-darwin-bHcj5`, base `main`)
  - #1847 — docs(changelog): release entry 2026.06.03.1 (head `claude/vibrant-darwin-C4BO8`, base `dev-paul`)
  - #1838 — fix(iframe-auth): gate Classroom add-on + LTI teacher surfaces on a real Google session (head `claude/epic-einstein-JNkjY`, base `dev-paul`)
- Comments processed: 13 total — 1 fixed, 12 explained
  - #1856: 1 thread — FIXED. Spanish gender agreement `noBentoBox` `listado` → `listada` (agrees with feminine _caja_).
  - #1859: 9 threads — explained, no fix. 5 `e.target?.value` optional-chaining nitpicks declined (repo uses plain `e.target.value` in ~566 handlers, 0 optional; `e.target` non-null in React onChange). 2 already-implemented (`toStandardHex`, bare-hex `#` prepend present at HEAD). 2 outdated (scaleMultiplier validation/test, lines gone from current diff).
  - #1854: 1 thread — explained, no fix. Listener `beforeEach`/`afterEach` refactor is out-of-scope test hygiene; tests pass, jsdom torn down per file.
  - #1850: 2 threads — explained, no fix. `useId`/`htmlFor` a11y is a valid but pre-existing gap (base markup was already orphaned `<label>`s); out of scope for a mechanical behavior-preserving refactor.
  - #1838, #1847: all inline threads already carried author "Fixed/Valid" replies at HEAD — no action.
  - #1858, #1857, #1855, #1853, #1852, #1851, #1849: no review comments.
- Fixes pushed: 1
  - #1856 — branch `nightly/admin-config-2026-06-04` — corrected Spanish `noBentoBox` participle to `listada`; verified Prettier + full i18n suite (132 tests) green before push.
- Reviews posted: 13 (all COMMENT event)
  - #1859 Ready w/ minor notes; #1858 Ready; #1857 Ready; #1856 Ready (pushed gender fix); #1855 Ready; #1854 Ready; #1853 Ready; #1852 Ready; #1851 Ready; #1850 Ready w/ minor notes; #1849 Ready w/ minor notes (changelog version-ordering vs #1847; base is `main`); #1847 Ready w/ minor notes (coordinate version ordering with #1849); #1838 Ready w/ minor notes (author-flagged live Classroom smoke test).
- Notes:
  - Branch-safety: no open PR head is `main` or `dev-*`, so all branches were pushable. Only #1856 needed a fix; the rest were explanation-only. No pushes to `main`. #1849 targets `main` as its base but the push (had there been one) would have been to its head `claude/vibrant-darwin-bHcj5`, not `main`.
  - Cross-PR coordination flagged for humans: #1847 (`2026.06.03.1`, base `dev-paul`) and #1849 (`2026.06.03.2`, base `main`) both prepend to `public/changelog.json` and describe overlapping Schoology work — version ordering / dedup needs a human decision.

## 2026-06-03

- PRs reviewed: 17
  - #1809 — fix(a11y): give shared ToggleRow switches an accessible name + real disabled state (head `claude/sweet-sagan-rzk2U`, base `dev-paul`)
  - #1814 — fix(classroom-addon): verify teacher via single courses.teachers.get (head `claude/clever-goodall-Z5E0O`, base `dev-paul`)
  - #1815 — fix(video-activity): guard teacher monitor against phantom 0% (head `claude/festive-tesla-w7CjN`, base `dev-paul`)
  - #1816 — harden classroom_course_links writes + add unlink correction path (head `claude/kind-noether-5eLsy`, base `dev-paul`)
  - #1817 — fix(classes): paginate + time-box Google Classroom course list (head `claude/sharp-hypatia-GjAJO`, base `dev-paul`)
  - #1820 — docs(changelog): release entry for 2026-06-02 (head `claude/vibrant-darwin-Pldtm`, base `dev-paul`)
  - #1821 — feat(lti): Schoology LTI 1.3 integration (Spike 0 + Phase 1) (head `feat/schoology-lti`, base `dev-paul`)
  - #1822 — refactor(D3): SettingsLabel in MathToolInstance/Settings (head `nightly/unify-settings-labels-2026-06-03`, base `dev-paul`)
  - #1823 — refactor(D4): convert plc tabs↔bodies cross-subdir imports to @/ (head `nightly/unify-import-paths-plc-tabs-bodies-2026-06-03`, base `dev-paul`)
  - #1824 — docs(unifier): run 7 memory log (head `nightly/unifier-log-2026-06-03`, base `dev-paul`)
  - #1825 — fix(NumberLine): epsilon guard for fraction labels (head `nightly/widgets-2026-06-03`, base `dev-paul`)
  - #1826 — fix(annotation): prevent double-commit of path (head `nightly/dashboard-layout-2026-06-03`, base `dev-paul`)
  - #1827 — fix(quizScoreboard): deduplicate answers by questionId (head `nightly/state-data-2026-06-03`, base `dev-paul`)
  - #1828 — fix(i18n): add widgets.stickers translations to DE and FR (head `nightly/admin-config-2026-06-03`, base `dev-paul`)
  - #1829 — fix(invites): reject email addresses where domain begins with a dot (head `nightly/build-tooling-2026-06-03`, base `dev-paul`)
  - #1830 — docs(nightly): debugger run log — run 8 (head `nightly/debugger-log-2026-06-03`, base `dev-paul`)
  - #1831 — audit(scheduled-tasks): Wednesday daily + weekly E audits (head `scheduled-tasks`, base `dev-paul`)
- Comments processed: 12 total — 8 fixed, 4 explained
  - #1814 (classroomAddonAuth.ts, gemini): **explained** — already addressed by the author in 066d873 (response-body drain added); thread left unresolved but fix is in.
  - #1815 (Results.tsx, gemini): **explained** — already addressed by the author in 8fcc0b8 (empty-session early return returns `avgScore: null`); thread left unresolved but fix is in.
  - #1824 (unifier.md, gemini): **explained** — the requested "2 instances at lines ~67, ~171" wording is already present on the branch (comment is outdated).
  - #1826 (AnnotationCanvas.tsx, gemini ×2): **fixed** — added a render-body-synced `drawingStateRef`; window pointerup/pointercancel listeners now read it and the effect deps reduce to `[isDrawing]`, so listeners register once per stroke (targeted `react-hooks/refs` disable, per #1802 precedent).
  - #1828 (de.json / fr.json / widgetStickersLocales.test.ts, gemini ×3): **fixed** — added `filterAll`/`filterFavorites`/`filterMine`/`reorganizeSticker`/`favoriteSticker` to all four locales and to `REQUIRED_WIDGET_STICKERS_KEYS`.
  - #1829 (organizationInvites.ts + .test.ts, gemini ×2): **fixed** — the dot-domain check now uses `indexOf('.', atIdx + 1) < atIdx + 2`, rejecting `user@.co.uk`; extended the regression test.
  - #1830 (debugger.md, gemini ×2): **fixed** — escaped the absolute-value pipes (`\|...\|`) and restored the table to 4 columns.
  - #1831 (ai-integration.md, gemini): **fixed** — corrected the client caller name to `recommendVideoForActivity`.
- Fixes pushed: 6
  - #1829 / `nightly/build-tooling-2026-06-03` — reject email domains beginning with a dot for multi-dot TLDs (+ test).
  - #1828 / `nightly/admin-config-2026-06-03` — add missing filter/favorite/reorder sticker keys to all locales (+ test array).
  - #1830 / `nightly/debugger-log-2026-06-03` — escape pipes in NumberLine epsilon-guard log entry, restore 4-column table.
  - #1826 / `nightly/dashboard-layout-2026-06-03` — sync drawing state via ref so window listeners register once per stroke.
  - #1831 / `scheduled-tasks` — correct ai-integration.md caller name to `recommendVideoForActivity` (this commit).
  - (Each fix verified: type-check ✓ lint ✓ tests ✓ / format-check ✓ for doc-only changes.)
- Reviews posted: 17 (one structured review per open PR)
  - Notable: #1821 (Schoology LTI) — Ready with notes; no blocking issues found in the JWT/rules surfaces reviewed (RS256 pinned, all secret LTI collections server-only, dedicated rules test), but recommended a human security sign-off given size + LTI/OIDC/grade-writeback sensitivity. #1816 & #1814 both rewrite the `linkClassroomCourse` trust-anchor/transaction seam — flagged to confirm clean merge order. All other PRs assessed Ready or Ready-with-minor-notes.
- Notes:
  - Branch-safety: all 17 PR heads are feature/nightly/`scheduled-tasks` branches (none are `main` or `dev-*`), so all were pushable. Fixes pushed only to the respective PR head branches; no pushes to `main` or `dev-paul`.
  - This log + the #1831 doc fix are committed and pushed to `scheduled-tasks` per task instructions (it is a fair-game branch; pushing updates open PR #1831, which is the intended target of its own review-comment fix).

## 2026-06-02

- PRs reviewed: 8
  - #1800 — fix(classroom-addon): address review feedback on PR #1798 (head `claude/serene-meitner-EzK6N`, base `dev-paul`)
  - #1801 — fix(widgets): GuidedLearningPlayer auto-advance timer resets on every answer (head `nightly/widgets-2026-06-02`, base `dev-paul`)
  - #1802 — fix(draggable-window): settings panel placeholder flashes on first flip (head `nightly/dashboard-layout-2026-06-02`, base `dev-paul`)
  - #1803 — fix(quiz): publishAssignmentScores inflates pointsMax on duplicate question ids (head `nightly/state-data-2026-06-02`, base `dev-paul`)
  - #1804 — fix(i18n): add missing widgetWindow action keys to DE and FR locales (head `nightly/admin-config-2026-06-02`, base `dev-paul`)
  - #1805 — fix(analytics): blooms-ai usage silently dropped from admin analytics (head `nightly/build-tooling-2026-06-02`, base `dev-paul`)
  - #1806 — docs(nightly): debugger run log for 2026-06-02 (run 7) (head `nightly/debugger-log-2026-06-02`, base `dev-paul`)
  - #1807 — fix(deps): pin path-to-regexp to patched versions to close HIGH ReDoS advisories (head `deps/path-to-regexp-redos-fix`, base `dev-paul`)
- Comments processed: 6 total — 3 fixed, 3 explained
  - #1800 (AddonShell.tsx, gemini): **fixed** — `AddonSelect` `onBlur` now guards `e.relatedTarget` for null before the `contains` check, so a non-focusable blur target (e.g. the dropdown scrollbar) no longer prematurely closes the popover.
  - #1800 (TeacherReviewRoute.tsx, gemini): **explained** — code already resets `quizData` to null when `quizId` is absent; the suggested `useSyncedState` hook is a new shared abstraction (architectural call) and the cross-quiz-transition case is an edge case for this single-session route.
  - #1801 (GuidedLearningPlayer.tsx, gemini): **fixed** — replaced the post-paint `useEffect` ref sync with a synchronous render-body assignment per CLAUDE.md, plus a targeted `react-hooks/refs` disable for the v7 false-positive.
  - #1802 (DraggableWindow.tsx, gemini): **fixed** — corrected the `shouldRenderSettings` latch comment to describe the actual `!shouldRenderSettings` guard instead of a nonexistent `prevFlipped` (comment-only).
  - #1804 (widgetWindowLocales.test.ts, gemini): **explained** — recursive full-parity refactor is a test-design enhancement that would broaden scope beyond the PR's 9 keys and risk surfacing unrelated pre-existing gaps; left for a human.
  - #1806 (debugger.md, gemini): **explained** — reviewer's `.values()` suggestion is incorrect; #1803 iterates `questionsById` directly with `[qId, q]` destructuring (≡ `.entries()`), so the existing wording is accurate.
- Fixes pushed: 3
  - #1800 / `claude/serene-meitner-EzK6N` — guard `AddonSelect` `onBlur` against null `relatedTarget` (type-check ✓ lint ✓).
  - #1801 / `nightly/widgets-2026-06-02` — sync `answeredStepsRef` in render body instead of `useEffect` (type-check ✓ lint ✓ tests ✓ 3946 pass).
  - #1802 / `nightly/dashboard-layout-2026-06-02` — correct `shouldRenderSettings` latch comment (lint ✓ format ✓).
- Reviews posted: 8 (one structured `## Automated Code Review` comment per PR above)
- Notes:
  - Branch-safety: no PR targets `main`; all eight head branches are non-`main`/non-`dev-*` and pushable. Pushes went only to the three PR head branches with actionable fixes. This log committed on `scheduled-tasks` per task instructions (not a `dev-*`/`main` branch).

## 2026-06-01

- PRs reviewed: 11
  - #1791 — test(hooks): add useStarterPacks coverage (head `claude/compassionate-noether-ukcDO`, base `dev-paul`)
  - #1790 — docs(debugger): nightly run log 2026-06-01 (head `nightly/debugger-log-2026-06-01`, base `dev-paul`)
  - #1789 — fix(functions): block IPv6 private/loopback in checkUrlCompatibility SSRF guard (head `nightly/build-tooling-2026-06-01`, base `dev-paul`)
  - #1788 — fix(i18n): add missing admin namespace to DE/ES/FR (head `nightly/admin-config-2026-06-01`, base `dev-paul`)
  - #1787 — fix: dedup questions in VA publishAssignmentScores (head `nightly/state-data-2026-06-01`, base `dev-paul`)
  - #1786 — fix(DashboardView): guard global Delete handler against focused inputs (head `nightly/dashboard-layout-2026-06-01`, base `dev-paul`)
  - #1785 — fix(RandomWidget): activeDashboardRef stale-closure fix (head `nightly/widgets-2026-06-01`, base `dev-paul`)
  - #1784 — chore: unifier run 6 log (head `nightly/unifier-log-2026-06-01`, base `dev-paul`)
  - #1783 — D3: SpecialistSchedule/Settings.tsx 10 labels → SettingsLabel (head `nightly/unify-settings-labels-2026-06-01`, base `dev-paul`)
  - #1782 — D4: plc/home/cards ../../sections → @/ alias (head `nightly/unify-import-paths-plc-2026-06-01`, base `dev-paul`)
  - #1781 — Fix SettingsPanel Escape, i18n, widget migrations (head `dev-paul`, base `main` — read-only)
- Comments processed: 11 total — 8 fixed, 3 explained
  - #1789 (2): broadened IPv6 block to `/^\[::/` + added `[::127.0.0.1]` regression test — both fixed
  - #1788 (1): deep-path `toHaveProperty` refactor (dropped unsafe `as unknown as LocaleFile` casts) — fixed
  - #1787 (1): added `scoredQuestionIds` Set dedup to the grading loop + regression test — fixed
  - #1786 (2): switched both Delete tests to `defaultPrevented` instead of monkey-patching `preventDefault` — both fixed
  - #1785 (1): jigsaw `setTimeout` now reads `activeDashboardRef.current?.sharedGroups` — fixed
  - #1784 (3): grep `-E`/order-independent pipes/`<path-to-main-repo>` placeholder in doc snippets — all fixed
  - #1791 (2): afterEach import + `vi.restoreAllMocks()` block already present in branch — explained, no change
- Fixes pushed: 6
  - #1789 / `nightly/build-tooling-2026-06-01` — consolidate IPv6 SSRF patterns into `/^\[::/` (+ IPv4-compatible test); functions tests + type-check + lint green
  - #1788 / `nightly/admin-config-2026-06-01` — type-safe deep-path `toHaveProperty` in locale parity tests
  - #1787 / `nightly/state-data-2026-06-01` — dedup grading loop via `scoredQuestionIds` Set + regression test
  - #1786 / `nightly/dashboard-layout-2026-06-01` — assert `KeyboardEvent.defaultPrevented` in Delete-key tests
  - #1785 / `nightly/widgets-2026-06-01` — jigsaw branch reads `activeDashboardRef.current`
  - #1784 / `nightly/unifier-log-2026-06-01` — portable, path-agnostic backlog grep snippets
- Reviews posted: 11 (structured review comment on every open PR)
- Notes:
  - Branch-safety: #1781 head `dev-paul` matches `dev-*` → treated read-only (review comment only, no push). All other heads (`nightly/*`, `claude/*`) are pushable. #1781's one prior inline thread was already author-resolved.
  - #1781 CI status reads `pending` (0 checks reported) on head SHA — flagged in the review to confirm green before merging to `main`.
  - `scheduled-tasks` is not the head of any open PR this run, so this log is committed and pushed to `scheduled-tasks` directly.

## 2026-05-29

- PRs reviewed:
  - #1746 — refactor(D1): VideoActivityWidget guard states → ScaledEmptyState (base `dev-paul`, head `nightly/unify-empty-states-2026-05-29`, draft)
  - #1747 — refactor(D3): RandomSettings 7 hand-rolled labels → SettingsLabel (base `dev-paul`, head `nightly/unify-settings-labels-2026-05-29`, draft)
  - #1748 — docs(unifier): nightly consistency run 4 — 2026-05-29 (base `dev-paul`, head `nightly/unifier-log-2026-05-29`, draft)
  - #1749 — fix(dice): use refs to prevent stale-closure bug when props change mid-roll (base `dev-paul`, head `nightly/widgets-2026-05-29`, draft)
  - #1750 — fix(typography): write undefined instead of 'global' sentinel when Inherit is clicked (base `dev-paul`, head `nightly/dashboard-layout-2026-05-29`, draft)
  - #1751 — fix(i18n): add sidebar.header.\* and whatsNew.\* keys to DE/ES/FR (base `dev-paul`, head `nightly/admin-config-2026-05-29`, draft)
  - #1752 — fix(sanitize): escape double-quotes to block JSON-context prompt injection (base `dev-paul`, head `nightly/build-tooling-2026-05-29`, draft)
  - #1753 — docs(nightly): debugger run log 2026-05-29 (base `dev-paul`, head `nightly/debugger-log-2026-05-29`, draft)
  - #1754 — action(url-config): dedupe hardcoded URL color palette against URL_COLORS (base `dev-paul`, head `scheduled-tasks`, draft)
- Comments processed: 10 total — 9 fixed, 1 explained.
- Fixes pushed: 5
  - PR #1753 (`nightly/debugger-log-2026-05-29`) — commit `c5104b2` `fix(pr-1753): wrap DiceWidget identifier in backticks in debugger log`. Wrapped the `DiceWidget` identifier in backticks per gemini-code-assist suggestion; prettier rewrapped column padding in adjacent rows.
  - PR #1752 (`nightly/build-tooling-2026-05-29`) — commit `25eb17c` `fix(pr-1752): escape single-quote in sanitizePrompt for attribute-breakout defense`. Added `"'": '&#39;'` to `ESCAPE_MAP` and extended the regex character class; added a regression test asserting `it's → it&#39;s`. 7/7 tests pass.
  - PR #1748 (`nightly/unifier-log-2026-05-29`) — commit `99f7743` `fix(pr-1748): prefix admin paths with components/admin/ in D5 backlog table`. Prefixed `SaveAsTemplateModal.tsx` and `Organization/OrganizationPanel.tsx` with `components/admin/` to match the rest of the D5 table.
  - PR #1747 (`nightly/unify-settings-labels-2026-05-29`) — commit `d0e5246` `fix(pr-1747): associate RandomSettings labels with inputs via useId`. Added `htmlFor`/`id` pairs for 5 form controls using React `useId()` for collision-free ids across multiple Random widget instances. Verified: type-check ✓ lint ✓.
- Reviews posted: 9 (all open PRs received a structured review comment).
- Notes:
  - Branch safety: all 4 fixes were pushed to head branches of PRs targeting `dev-paul`. No push to `main` or `dev-paul`.
  - PR #1750 had a gemini suggestion to swap `TestConfig` for `TextConfig` in the new test file, claiming type-check would fail. Declined — `pnpm run type-check` exits clean; the explicit `as [Partial<TestConfig>]` cast on `mock.calls[0]` resolves the generic at the call site. Explained on the thread.
  - PR #1754 (head `scheduled-tasks`) — no reviewer comments; only the gemini summary review existed.
  - PRs #1746, #1749, #1751 — no reviewer comments beyond the gemini summary; received reviews only.

---

## 2026-05-28

- PRs reviewed:
  - #1720 — fix(quiz): preserve student answers + recover from PIN pop-out lockout (base `dev-paul`, head `fix-quiz-data-loss`)
  - #1721 — unify(D1): replace hand-rolled empty state in NextUp/Widget with ScaledEmptyState (base `dev-paul`, head `nightly/unify-empty-states-2026-05-28`, draft)
  - #1722 — unify(D3): replace hand-rolled labels with SettingsLabel in Calendar/Settings (base `dev-paul`, head `nightly/unify-settings-labels-2026-05-28`, draft)
  - #1723 — unify(D4): convert relative cross-dir imports to @/ alias in components/admin/ (base `dev-paul`, head `nightly/unify-import-paths-admin-2026-05-28`, draft)
  - #1724 — unify(D5): replace local Toast state with addToast in InstructionalRoutinesManager (base `dev-paul`, head `nightly/unify-toast-routines-2026-05-28`, draft)
  - #1725 — chore(unifier): run 3 memory doc update (base `dev-paul`, head `nightly/unifier-log-2026-05-28`, draft)
  - #1726 — fix(widgets): resolve UUID group IDs to human-readable names in Stations (base `dev-paul`, head `nightly/widgets-2026-05-28`, draft)
  - #1727 — fix(canvas): remove onPointerLeave from AnnotationCanvas (base `dev-paul`, head `nightly/dashboard-layout-2026-05-28`, draft)
  - #1728 — fix(grading): guard max-point accumulation against duplicate question IDs (base `dev-paul`, head `nightly/state-data-2026-05-28`, draft)
  - #1729 — fix(i18n): add missing sidebar.plcs namespace + remoteControl key to DE/ES/FR (base `dev-paul`, head `nightly/admin-config-2026-05-28`, draft)
  - #1730 — fix(security): escape & before HTML entities in sanitizePrompt (base `dev-paul`, head `nightly/build-tooling-2026-05-28`, draft)
  - #1731 — docs(nightly): debugger log — run 3 (base `dev-paul`, head `nightly/debugger-log-2026-05-28`, draft)
  - #1732 — action(thursday): wire NumberLine appearance fields into admin building defaults (base `dev-paul`, head `claude/loving-bell-M4E0T`, draft)
- Comments processed: 16 total — 12 fixed, 4 explained.
- Fixes pushed: 6
  - PR #1722 (`nightly/unify-settings-labels-2026-05-28`) — commit `f7502ed` `fix(pr-1722): drop colliding mb-3 + add mb-0 on flex/space-y SettingsLabels`. Drops the `mb-3` Tailwind-class-collision with the SettingsLabel default `mb-2`; adds `mb-0` on the two SettingsLabels inside flex-headers / `space-y-3` sections to preserve the original spacing. Verified: type-check ✓ lint ✓ prettier ✓.
  - PR #1724 (`nightly/unify-toast-routines-2026-05-28`) — commit `09d9bb0` `fix(pr-1724): wrap async saveRoutine in try/catch + guard nullable state`. Adds try/catch around `saveRoutine` so a Firestore/network error surfaces a toast and the modal stays open; adds `if (!editingRoutine) return;` and `if (!deleteConfirm) return;` guards inside the async closures. Verified: type-check ✓ lint ✓ prettier ✓.
  - PR #1729 (`nightly/admin-config-2026-05-28`) — commit `8fb3c73` `fix(pr-1729): use German typographic quotes („…") in PLG confirm dialogs`. Replaces straight `"` with `„` / `"` in `confirmLeave`, `confirmDelete`, `confirmRemoveMember` to match the existing `sidebar.classes.confirmDelete` style. Verified: i18n tests ✓ (11/11).
  - PR #1730 (`nightly/build-tooling-2026-05-28`) — commit `e7b5c49` `fix(pr-1730): sanitizePrompt single-pass regex + lookup map`. Collapses the 8 chained `.replace()` calls into a single-pass `/[&<>{}[\]\`]/g`regex +`ESCAPE_MAP`lookup; functionally identical, inherently safer against re-evaluation of inserted`&`, one allocation instead of eight. Verified: type-check ✓ lint ✓ sanitize tests ✓ (5/5).
  - PR #1731 (`nightly/debugger-log-2026-05-28`) — commit `ee249f6` `fix(pr-1731): use full path components/widgets/Stations/nexus.ts in run log`. Updates the run-3 Widgets row to use the full repo-root path, matching the convention of other rows. Verified: prettier ✓.
  - PR #1732 (`claude/loving-bell-M4E0T`) — commit `63deb8e` `fix(pr-1732): validate fontFamily union + guard color picker against invalid hex`. Validates `raw.fontFamily` against the `GlobalFontFamily` union in `utils/adminBuildingConfig.ts` (was accepting any non-empty string); adds `isValidHex` helper to `NumberLineConfigurationPanel.tsx` so both color pickers no longer flicker to `#000000` when the adjacent text field has a partial/invalid hex. Added 19th test asserting unknown `fontFamily` strings are rejected. Verified: type-check ✓ lint ✓ prettier ✓ tests ✓ (19/19).
- Reviews posted: 13 (all open PRs received a structured review comment).
- Notes:
  - Branch safety: all 6 fixes were pushed to head branches of PRs targeting `dev-paul`. No push to `main` or `dev-paul`.
  - PR #1720 (`fix-quiz-data-loss`) had 6 review threads — all already resolved by the author in commits 2fbbdc9 / 615db37 / bbee53a before this run started; no automated fix needed.
  - PR #1727 (AnnotationCanvas) had 2 review comments suggesting a `hasPointerCapture` guard fallback and corresponding test mocks. Declined — the PR description explicitly evaluated and rejected this as a band-aid. Every browser this app supports (Chrome 90+, Edge 90+, Firefox 88+, Safari 14+) implements pointer capture, so the guarded code path would never fire.
  - PR #1729 had a defensive `?? {}` test-guard suggestion — declined as a style preference; the current `toHaveProperty` matcher already produces a clear failure if the namespace is missing.
  - PR #1732 had a suggestion to swap the color inputs for `SurfaceColorSettings`. Declined — the panel intentionally uses a uniform plain-input visual style across font dropdown, opacity slider, number/select inputs, and color fields. A partial swap would create visual discontinuity; a whole-panel migration to shared appearance components is a separate scope.

---

## 2026-05-27

- PRs reviewed:
  - #1702 — Implement Phase 2 features for whiteboard: shapes, text, images, selection, multi-page, undo, export (base `main`, head `dev-paul`)
  - #1704 — refactor(D1): MaterialsWidget ScaledEmptyState migration (base `dev-paul`, head `nightly/unify-empty-states-2026-05-27-clean`, draft)
  - #1705 — refactor(D2): LunchCount brand color → CSS var (base `dev-paul`, head `nightly/unify-brand-colors-2026-05-27-clean`, draft)
  - #1706 — refactor(D3): Schedule/Settings SettingsLabel migration (base `dev-paul`, head `nightly/unify-settings-labels-2026-05-27-clean`, draft)
  - #1707 — refactor(D4): @/ alias imports in layout/widgets/student (base `dev-paul`, head `nightly/unify-import-paths-2026-05-27-clean`, draft)
  - #1708 — refactor(D5): WorkSymbolsConfigurationModal addToast (base `dev-paul`, head `nightly/unify-toast-arch-2026-05-27-clean`, draft)
  - #1709 — docs(unifier): run 2 memory log (base `dev-paul`, head `nightly/unifier-log-2026-05-27`, draft)
  - #1710 — fix(dock): canAccessTool for InternalToolType (base `dev-paul`, head `nightly/dashboard-layout-2026-05-27`, draft)
  - #1711 — fix(embed): YouTube playlist URL regex (base `dev-paul`, head `nightly/widgets-2026-05-27`, draft)
  - #1712 — fix(parseGeminiJson): top-level JSON arrays (base `dev-paul`, head `nightly/build-tooling-2026-05-27`, draft)
  - #1713 — fix(i18n): missing common.saved/success/error in DE/ES/FR (base `dev-paul`, head `nightly/admin-config-2026-05-27`, draft)
  - #1714 — chore(nightly): debugger log update (base `dev-paul`, head `nightly/debugger-log-2026-05-27`, draft)
  - #1715 — fix(guided-learning): matching answer length check (base `dev-paul`, head `nightly/state-data-2026-05-27`, draft)
  - #1716 — action(specialist-schedule): register appearance panel (base `dev-paul`, head `scheduled-tasks`, draft)
- Comments processed: 13 total — 4 fixed (PRs #1708, #1712, #1713 with one extra cross-cutting fix landed in #1708), 9 explained (5 cross-cutting WorkSymbolsConfigurationModal duplicates on #1704/#1706/#1707/#1709 pointing at #1708 fix; 1 declined URL-API refactor on #1711; 1 docs guidance on #1714 worktree clean recommendation; 1 outdated docs comment on #1714; 1 type-safety wrap on #1716 declined as the codebase pattern doesn't wrap).
- Fixes pushed: 3
  - PR #1713 (`nightly/admin-config-2026-05-27`) — commit `de87e4e` `fix(pr-1713): remove unnecessary LocaleFile type assertions`. Dropped the `LocaleFile` alias and double `as unknown as` casts; TypeScript infers `.common` on JSON imports. Verified: type-check ✓ lint ✓ tests ✓ (4/4).
  - PR #1712 (`nightly/build-tooling-2026-05-27`) — commit `8cf7332` `fix(pr-1712): handle leading prose with brackets before JSON object`. Added the gemini-suggested test case which exposed a real bug (stray `[` in leading prose like `[docs]` caused `parseGeminiJson` to try parsing `[docs]` as a JSON array). Updated the implementation to retry the brace path if the array-slice parse fails. Verified: type-check ✓ lint ✓ tests ✓ (15/15).
  - PR #1708 (`nightly/unify-toast-arch-2026-05-27-clean`) — commit `d37b011` `fix(pr-1708): functional setSymbols update + async handleSave`. `setSymbols` now accepts both array and functional-updater forms; `handleFiles` uses functional update and no longer depends on `globalConfig.symbols`; `handleSave` is async, prop signature accepts `void | Promise<void>`. Verified: type-check ✓ lint ✓.
- Reviews posted: 14 (all open PRs received a structured review comment).
- Notes:
  - Branch safety: pushed to nightly/admin-config-2026-05-27, nightly/build-tooling-2026-05-27, nightly/unify-toast-arch-2026-05-27-clean (all fair game). No push to `main` or `dev-paul`. PR #1702 (`dev-paul → main`) received review comment only — its two open threads already have author-replies pointing at #1703 fixes.
  - Cross-cutting bleed-through observation: PRs #1704, #1706, #1707, #1709 all carry the WorkSymbolsConfigurationModal.tsx diff from a shared base with #1708, which is why gemini-code-assist left the same race/async findings on each. Replied on each PR explaining the canonical fix lives in #1708 (commit d37b011) and no per-PR push is needed.
  - Declined refactor: the URL-API rewrite suggestion on #1711 was scoped much larger than the targeted YouTube playlist regression — would touch all 36 existing tests. Recommended a separate follow-up PR.
  - Declined wrapper on #1716: gemini suggested wrapping `updateConfig` to narrow the type. The reference pattern in `NeedDoPutThen/Settings.tsx` (whose config also lacks `scaleMultiplier`) passes a direct callback under strict type-check, and the `writeScaleMultiplier={false}` default prevents `scaleMultiplier` from ever being dispatched at runtime. Not changing the established pattern.

---

## 2026-05-26

- PRs reviewed:
  - #1685 — feat(drawing): Whiteboard Phase 2 (base `dev-paul`, head `claude/whiteboard-implementation-status-SNkii`)
  - #1690 — Audit and refactor useEffect patterns (base `main`, head `dev-paul`)
  - #1691 — fix(unifier/D2): InstructionalRoutines step badge respects --spart-primary theme (base `dev-paul`, head `nightly/unify-brand-color-2026-05-26`, draft)
  - #1692 — docs(unifier): bootstrap nightly consistency memory doc (base `dev-paul`, head `nightly/unifier-log-2026-05-26`, draft)
  - #1693 — audit(tuesday): daily=[0 issues] weekly=[1 new MEDIUM] (base `main`, head `scheduled-tasks`, draft)
  - #1694 — action(tuesday): fix new-widget skill reference (base `dev-paul`, head `claude/loving-bell-LrmHy`, draft)
- Comments processed: 19 total — 3 fixed (1 on PR #1694, 2 on dev-paul via new PR #1695), 16 explained (lint suppressions intentional, scope-mismatch is a meta-PR concern, deps already complete in dev-paul HEAD, Settings memoization split intentionally not done because settings only renders on user open). PR #1685's 18 review threads are all resolved — no action.
- Fixes pushed: 2
  - PR #1694 (`claude/loving-bell-LrmHy`) — commit `fa204a53` `fix(pr-1694): rephrase 'sole exception' wording in new-widget skill reference table`. Rephrased to "exception to the standard `Widget.tsx` convention" after verifying TimeToolWidget, ClassesWidget, BreathingWidget, ScheduleWidget, PdfWidget, RandomWidget, StickerBookWidget, and Catalyst widgets all deviate from the convention. Verified: `pnpm exec prettier --write` re-formatted table column widths.
  - dev-paul reviewer concerns (PR #1690 + #1691) — addressed via new PR **#1695** (`claude/pr-review-fixes-2026-05-26`) commit `b47ddeca` `fix(pr-1690,1691): harden QR DOMParser body access + admin clock format24 type check`. Two-line patch: `doc.body?.textContent` in `QRWidget/deriveSyncedUrl.ts:16` and `typeof raw.format24 === 'boolean'` in `utils/adminBuildingConfig.ts:141`. Verified: `pnpm type-check` ✓, `pnpm lint --max-warnings 0` ✓, `pnpm run format:check` ✓, 31 tests passed. Opened as a separate PR because direct pushes to `dev-paul` returned HTTP 403 from the automation proxy.
- Reviews posted: 6
  - PR #1685: Ready with minor notes — massive Phase 2 work, all 18 prior threads resolved, only known follow-up is the cross-user synced-drawing gap documented as TODO.
  - PR #1690: Ready with minor notes — rollup of #1684/#1687/#1688/#1689, two hardening fixes pulled into #1695, the `prefer-promise-reject-errors` disables preserve realistic Firestore rejection shapes in mock.
  - PR #1691: Ready with minor notes — single mechanical theme-color substitution; rebase on current dev-paul HEAD will collapse the apparent unrelated-changes diff.
  - PR #1692: Ready with minor notes — doc-only canon doc; same rebase-collapses-diff caveat as #1691.
  - PR #1693: Ready — standard Tuesday audit cadence; surfaced the new `qs` MEDIUM as worth tracking in the next functions/ dep sweep.
  - PR #1694: Ready — small but useful 404-link fix in the new-widget skill table.
- Notes:
  - Branch safety: pushed to `claude/loving-bell-LrmHy` (fair game) and new branch `claude/pr-review-fixes-2026-05-26` (fair game). Attempted direct push to `dev-paul` for #1690 hardening fixes; the proxy returned HTTP 403, so the fixes were rerouted through new PR #1695 against dev-paul. No pushes to `main` or `dev-paul` direct.
  - The "scope mismatch" comments on #1691 and #1692 turned out to be artifacts of both branches being created off an older dev-paul SHA — the PR diff appears to include #1684/#1687/#1688/#1689 file deltas because git renders them against the branch's older base. Rebasing on current dev-paul HEAD before merge will collapse each PR to its actual single-purpose change.
  - The `react-hooks/refs` rule the reviewers kept citing is not actually enabled in `eslint.config.js` (only `react-hooks/recommended` is). Verified by running `pnpm lint --max-warnings 0` clean on the current dev-paul HEAD with the DriveFileAttachment render-body ref pattern in place. The local disable in `hooks/useDebouncedCallback.ts` appears to be defensive rather than required.

---

## 2026-05-25

- PRs reviewed:
  - #1687 — perf(time-tool): stop RAF restarting on every dashboard change (base `dev-paul`, head `claude/dev-paul-bug-perf-fix-1xnnH`, draft)
  - #1686 — docs: comprehensive useEffect audit (base `dev-paul`, head `claude/useeffect-audit-1G9oi`, draft)
  - #1685 — feat(drawing): Whiteboard Phase 2 — shapes, text, images, selection, multi-page, undo, export (base `main`, head `claude/whiteboard-implementation-status-SNkii`, draft)
  - #1684 — MiniApp portaled toolbar (JS cqmin) + Clock building defaults (base `dev-paul`, head `scheduled-tasks`, draft)
- Comments processed: 9 unresolved review threads across the four PRs — 5 fixed (PR #1687 config-spread cleanup), 3 explained as already-addressed (PR #1686 audit-doc inaccuracies — all fixed in 9a2302d on the branch). PR #1685's 11 review threads and PR #1684's 1 review thread are all marked outdated with author resolution replies pointing at follow-up commits (4c35a4c on #1685; 8bf7759 + ed08dbc on #1684) — no further action.
- Fixes pushed: 1
  - PR #1687 (`claude/dev-paul-bug-perf-fix-1xnnH`) — commit `80967e6` `fix(pr-1687): drop config spread in TimeTool auto-trigger updateWidget calls`. Removed 5 redundant `...widget.config` spreads inside the new auto-trigger effect and the now-unused `ExpectationsConfig`/`TrafficConfig`/`StationsConfig` imports. Verified: `pnpm type-check` ✓, `pnpm exec eslint components/widgets/TimeTool/useTimeTool.ts --max-warnings 0` ✓, `pnpm exec prettier --check components/widgets/TimeTool/useTimeTool.ts` ✓, `pnpm exec vitest run components/widgets/TimeTool/TimeToolConnection.test.tsx` 6/6 ✓.
- Reviews posted: 4
  - PR #1687 TimeTool RAF perf fix: Ready — root-cause fix splits the conflated tick + auto-trigger into two effects with the correct dep array for each concern; new regression tests cover both the perf bug and the closure-via-effect freshness invariant.
  - PR #1686 useEffect audit doc: Ready — doc-only, 9a2302d fixup commit reconciled the headline numbers (527 graded of 567 total) and corrected the DriveFileAttachment/DashboardView/BoardNavFab/MusicManager entries. Suggested nice-to-have: permalink the actionable D/C entries at audit-base SHA `8765c4f` for line-drift resilience.
  - PR #1685 Whiteboard Phase 2: Needs description update + Wave 8 + test-plan checkboxes — PR description still says "Wave 1 in progress / Waves 2-8 pending" but waves 1-7 have landed on this branch as separate per-wave commits; only Wave 8 (Firestore subcollection) remains. Branch also drags in the unmerged dev-paul backlog because it's based off main — confirm merge plan.
  - PR #1684 MiniApp toolbar + Clock building defaults: Ready with minor notes — both items well-scoped, all self-review feedback addressed (rounding + zero-guard in 8bf7759/ed08dbc, partial-validity tests, `Completed-pending-merge` journal convention). Manual visual-regression checkboxes in test plan still unticked.
- Notes:
  - Branch safety: 1 push to `claude/dev-paul-bug-perf-fix-1xnnH` (fair game per safety rule). No pushes to `main` or `dev-paul`.
  - The five `gemini-code-assist` comments on PR #1687 were all valid — `updateWidget` already shallow-merges via `context/DashboardContext.tsx:4470`, so the `...widget.config` spread was redundant and risked write-skew with the stale `activeDashboard` closure when timer-end triggers fire.

---

## 2026-05-20

- PRs reviewed:
  - #1675 — test(hooks): add coverage for useActivityWallLibrary (base `dev-paul`, head `scheduled-tasks`, draft)
  - #1674 — fix(dup,quiz): address PR #1672 review feedback (base `dev-paul`, head `claude/jolly-thompson-pejpC`, draft)
  - #1672 — Boards Duplicate UX polish, data-safety, and cross-browser focus-loss detection (base `main`, head `dev-paul`)
  - #1366 — docs: plan for repo-wide line-ending normalization (base `main`, head `docs/line-endings-normalization-plan`)
- Comments processed: 11 unresolved review threads across the four PRs — 0 fixed (none actionable), 11 already addressed/explained. PR #1672's five threads (Copilot `console.error`→`logError` + ungated poll; Gemini ×2 missing `isDefault: false`; Copilot stale-title) each already carry an author reply, with the three code fixes staged on #1674. PR #1366's six threads are all outdated/resolved across prior sweeps. PR #1674 and #1675 had no inline review comments.
- Fixes pushed: 0
  - No new code fixes were needed. The actionable #1672 feedback is already implemented on #1674 (verified the diff: explicit `isDefault: false` after `sanitizeBoardSnapshot`, `logError('DashboardContext.duplicateDashboard', …)`, and the quiz `useFocusLossPoll` gate `tabWarningsEnabled && session.status === 'active' && myResponse?.status !== 'completed'`). The `dev-paul` push permission was therefore not exercised.
- Reviews posted: 4
  - PR #1675 useActivityWallLibrary tests: Ready — 13 well-structured tests (listener wiring, snapshot mapping + sparse-doc defaults, empty-`classId` strip rule, signed-out throw paths) following the `usePlcNotes.test.ts` pattern; test-only + scheduled-task doc-log refresh, no production risk.
  - PR #1674 #1672 fix-up: Ready with minor notes — three correct, minimal fixes mapping 1:1 to the #1672 bot comments. Flagged merge ordering (must land in `dev-paul` with/before #1672) and a small gap (no test asserting the poll disables once `myResponse.status === 'completed'`).
  - PR #1672 Boards Duplicate + focus-loss: Ready with minor notes — all 14 CI checks green; `useFocusLossPoll` is well-designed and follows the useEffect-escape-hatch rule (latest-callback ref in render body, first-call-only seed surviving snapshot re-renders). Key note: this branch's own diff still carries the pre-fix code, so #1674 + the #1673 changelog must be sequenced into `dev-paul` alongside it.
  - PR #1366 line-endings plan: Ready — doc-only, all reviewer threads resolved; noted the PR has been open since 2026-04-21 and is itself the kind of open PR its execution preconditions require cleared, so it should be merged (inert until executed) or closed.
- Notes:
  - Branch safety: zero pushes to any PR branch this run (no actionable fixes). No push to `main`; `dev-paul` push permission not exercised.
  - #1672, #1674, and #1673 (changelog) form a merge set against `dev-paul` — sequencing them together is the main reviewer-flagged concern, since #1672 in isolation ships the bot feedback unaddressed.

---

## 2026-05-19

- PRs reviewed:
  - #1666 — fix(deps): override lodash-es to ^4.18.1 to close HIGH code-injection CVEs (base `dev-paul`, head `scheduled-tasks`, draft)
  - #1665 — feat(admin): personal-spotify global feature gate with building scoping (base `dev-paul`, head `feat/personal-spotify-gate`)
  - #1366 — docs: plan for repo-wide line-ending normalization (base `main`, head `docs/line-endings-normalization-plan`)
- Comments processed: 1 actionable unresolved review comment (PR #1666, gemini-code-assist proposing scope expansion to also override `flatted`/`ws`/`yaml`). PR #1665's six review threads are all already resolved. PR #1366's remaining `.editorconfig` proposal continues to be deferred (fourth sweep — still pending author decision).
- Fixes pushed: 0
  - PR #1666 gemini comment was a MEDIUM scope-expansion suggestion against an intentionally HIGH-only, single-line `pnpm.overrides` PR. The `flatted`/`ws`/`yaml` items are tracked individually as Open in `docs/scheduled-tasks/dependency-audit.md` and warrant per-override verification on the Tuesday cadence rather than being bundled into a focused production-bundle CVE fix. Replied inline with the scope rationale; no code change pushed.
- Reviews posted: 3
  - PR #1666 lodash-es override: Ready — focused security fix, lockfile change is a single resolution swap, all verification (audit, type-check, lint, format, tests 2809/2809, build) documented in the PR description. Companion audit-doc updates (axios → 1.16.0, tar override → >=7.5.11) are tracked Open items, not blockers.
  - PR #1665 personal-spotify gate: Ready — generalized `buildings?: string[]` field on `GlobalFeaturePermission` is small/additive (existing 15 features unaffected), `FEATURE_DEFAULTS` table centralizes missing-doc default behavior with `personal-spotify` matching the `canSeeShareTracking` precedent (default-off until explicit admin enable). Four new test files (477+ lines) cover the gate matrix, orphan-chip flow, transparent fallback. CI green across all 7 checks. Flagged `context/AuthContext.tsx`'s `canAccessFeature` as the highest-leverage change (called on every gate check) but coverage is good.
  - PR #1366 line-endings plan: Ready with minor notes — no new edits this sweep; all reviewer threads resolved across the prior four sweeps; only `.editorconfig` proposal continues deferred. Observation flagged: the PR is the canonical example of why execution is hard — 12+ revisions over 4 weeks because the renormalize-window precondition keeps reopening as new PRs land. Merging the docs is safe now; executing the plan still requires the quiet window.
- Notes:
  - Branch safety: zero pushes this run (no actionable code fixes needed). All three open PRs had either no actionable comments or pre-existing author replies. The `dev-paul` push permission was not exercised.
  - PR #1665 is the only ready-for-review (non-draft) PR open against `dev-paul` this sweep. CI is green. Author has already swept all six review threads in prior commits.
  - PR #1666 marks `scheduled-tasks` (the daily-audit / scripted-housekeeping branch) → `dev-paul`. Targeting `dev-paul` rather than `main` keeps the auto-deploy preview pipeline opt-in; expected behavior per the dev-\* deploy convention.
  - PR #1366's deferred `.editorconfig` proposal has now been carried forward across four sweeps. Worth a sentence in a future status nudge: either bundle it into PR 1 when the plan is finally executed, or close it explicitly. Not pushing without author input.

---

## 2026-05-18

- PRs reviewed:
  - #1657 — fix(rules): add admin_audit_log Firestore rule (HIGH) (base `dev-paul`, head `scheduled-tasks`, draft)
  - #1655 — Collections, templates, what's new, and bug fixes (base `main`, head `dev-paul`)
  - #1366 — docs: plan for repo-wide line-ending normalization (base `main`, head `docs/line-endings-normalization-plan`)
- Comments processed: 2 unresolved comment threads (both on PR #1657 from gemini-code-assist) — 1 fixed and 1 partially fixed/partially explained. PR #1655's three inline review threads were already resolved in earlier commits on the branch; PR #1655's three PR-level comments were already replied to in prior sweeps. PR #1366's remaining `.editorconfig` proposal continues to be deferred (third sweep — author decision pending).
- Fixes pushed: 1
  - PR #1657 / `scheduled-tasks` (`19ba1e8`): two-part fix for gemini-code-assist comments on the new `admin_audit_log` rule. (a) `firestore.rules` — changed `allow read, write` to `allow read, create` so audit entries are append-only (admins cannot edit/delete their own trail); expanded the inline comment to document why `create` (not `write`) is intentional so a future audit can't loosen it. (b) Kept `serverTimestamp()` at the call site — the reviewer's suggestion to switch to `Date.now()` + `is int` validation would WEAKEN security for an audit log (a client-supplied epoch is forgeable, server-set timestamps are not), so the consistency argument applies to data the client should own, not tamper-evident records. Added a rule comment documenting this choice. (c) `docs/scheduled-tasks/firestore-rules.md` — corrected line-range reference (`572-582` after the expanded comment grew the block, was `574-578`) and rewrote the 2026-05-18 audit-note bottom matter from "`admin_audit_log` HIGH open item remains unfixed" to "`admin_audit_log` HIGH item resolved in this PR — match block at lines 572-582 with append-only (`create` not `write`) permission." Verified: prettier ✓, lint ✓, type-check ✓ (test:rules requires firebase emulator not available in this env).
- Reviews posted: 3
  - PR #1657 admin_audit_log rule: Ready with minor notes — solid fix; follow-up suggestion to add `tests/rules/admin_audit_log.test.ts` locking in the immutability invariant (~30 lines, non-blocking), and to route the audit-write `catch` through the existing `logError()` utility so the next silent-deny class of bug surfaces faster. Reminder about post-merge `firebase deploy --only firestore:rules`.
  - PR #1655 Collections + Results Protection: Ready with notes — 146 files / ~17K+ additions, all 14 CI checks green, three prior inline review threads (DashboardContext dot-notation, SoundWidget unreachable resume, useResultsTabWarnings race) already validated and fixed earlier on the branch. Substantial new test coverage shipped (rebutting the prior "12 empty test files" claim — verified again, files have real content). Two human-attention items flagged: (1) PR title is better than the original `"Implement custom list toggling and drag-select enhancements"` but worth a final pass for git-log searchability, and (2) `context/DashboardContext.tsx` (+708/-35) + `types.ts` (+293/-1) + LRU mounting cache lifecycle warrant a manual walkthrough — the dot-notation `setDoc({merge:true})` bug fixed earlier in the same PR is the exact class of subtle Firestore-pipeline regression CLAUDE.md flags this file as prone to.
  - PR #1366 line-endings plan: Ready — no new edits this sweep, all reviewer items already addressed across the previous three sweeps. The single deferred item (`.editorconfig` proposal) carried forward; also flagged that the plan now self-handles the "PR 2 may be a no-op if blobs are already LF" case (`git status` probe between `git add --renormalize .` and `git commit`), so the author can probe locally before scheduling the dedicated window and possibly collapse the rollout to PR 1 + cleanup.
- Notes:
  - Branch safety: All fixes pushed only to `scheduled-tasks` (fair game per CRITICAL BRANCH SAFETY RULE). No push to `main`. `dev-paul` not pushed to this run — PR #1655's comments were already addressed by the author in earlier commits and no new fixes were needed, so the dev-paul push-permission did not need to be exercised.
  - Two of the three PRs (#1655 and #1366) had every actionable reviewer comment addressed before this sweep — these reviews are purely fresh-eyes reads. Only PR #1657 needed new code pushed.
  - Gemini-code-assist's `serverTimestamp() → Date.now()` suggestion on PR #1657 was a generic project-convention rule applied incorrectly to a tamper-evidence context. The reply on the inline comment explains the security rationale for keeping `serverTimestamp()` so the same suggestion isn't re-applied in future passes.

---

## 2026-05-15

- PRs reviewed:
  - #1633 — docs(widget-registry): document intentional omissions in WIDGET_SETTINGS_COMPONENTS (base `dev-paul`, head `claude/widget-registry-settings-docs`, draft)
  - #1632 — audit(scheduled-tasks): Friday 2026-05-15 daily audits (base `dev-paul`, head `scheduled-tasks`, draft)
  - #1366 — docs: plan for repo-wide line-ending normalization (base `main`, head `docs/line-endings-normalization-plan`)
- Comments processed: 8 unresolved comment threads/issue-comments across the 3 PRs — 7 fixed and pushed, 1 deferred for author decision (PR #1366 `.editorconfig` scope expansion).
- Fixes pushed: 3
  - PR #1633 / `claude/widget-registry-settings-docs` (`fd47ee2b`): correct stickers flip-panel JSDoc + audit-log entry — the prior wording claimed `StickerBookWidget` hides the flip button, but `DraggableWindow.tsx:2688-2710` unconditionally renders the gear icon and `StickerBookWidget` has no flip-suppressing logic. Flipping a stickers widget shows the standard "Standard settings available." fallback on the Settings tab; appearance lives on the Style tab via `StickerBookAppearanceSettings`. Verified: tsc --noEmit ✓, eslint --max-warnings 0 ✓, prettier --check ✓.
  - PR #1632 / `scheduled-tasks`: same stickers JSDoc + audit-log correction applied (the PR carries a verbatim copy of PR #1633's WidgetRegistry.ts block and the same Completed entry). Pushed alongside the pr-review-log update for this run.
  - PR #1366 / `docs/line-endings-normalization-plan` (`a9eaa492`): five doc edits — Step 2 now creates a branch (`chore/normalize-line-endings`) before renormalize commands, adds `git status` sanity check between `--renormalize` and `commit` (so an empty-staging case isn't silently treated as a failure), and includes the `gh pr create` invocation with the title pinned to the Step 4 grep pattern; Step 5 working-tree refresh lifted out of the conflict-resolution block into an unconditional `git rm --cached -r . && git reset --hard` after the rebase loop (a conflict-free rebase never pauses for `--continue` so the prior phrasing left the operator without a refresh signal); Rollback section uses the same subject-grep + hard-fail + verification echo pattern as Step 4 instead of a `<renormalize-commit-hash>` placeholder, and adds a follow-up block to register the revert commit's hash in `.git-blame-ignore-revs` (the revert produces matching blame pollution on the same ~932 files). Verified: prettier --check ✓.
- Reviews posted: 3
  - PR #1633 widget-registry docs: Ready — JSDoc + audit-log both corrected during this pass; CI mostly green with Code Quality job still running; cross-PR consistency note flagged the verbatim duplicate in PR #1632 (which was fixed in parallel).
  - PR #1632 Friday audit: Ready — three daily audits performed, one new LOW item (MiniApp portaled active-app toolbar) detected with sound fix options. Cross-PR overlap with #1633 called out and resolved.
  - PR #1366 line-endings plan: Ready — five operator-failure-mode fixes applied this pass; `.editorconfig` proposal left for author decision.
- Notes:
  - Both gemini-code-assist threads on PR #1633 were inline review comments tied to the WidgetRegistry.ts JSDoc and the audit-log entry. Verified directly against `DraggableWindow.tsx` (gear icon unconditionally rendered) and `WidgetRenderer.tsx:169-173` (the "Standard settings available." fallback) — the JSDoc claim that StickerBookWidget hides the flip button was factually wrong. The audit-log entry was authored in the same PR (not a historical log), so correcting it from inception keeps the resolution accurate.
  - Coordination call-outs raised in reviews:
    - PR #1633 + #1632 — same JSDoc block duplicated across both PRs; whichever merges first wins, conflict resolution should preserve the corrected wording.
    - PR #1366 — `.editorconfig` would prevent the "Delete ␍" friction from returning on newly-created Windows files but is out of scope for this plan; author should decide whether to bundle into PR 1 or open a separate `feat: add .editorconfig` PR.

---

## 2026-05-14

- PRs reviewed:
  - #1623 — feat(random): manual editing, lock + remove for randomizer groups (base `main`, head `claude/manual-group-editing-IoDSo`, draft)
  - #1622 — Enhance quiz annotations (base `main`, head `dev-paul`)
  - #1621 — feat: substitute teacher portal (base `dev-paul`, head `feat/substitute-teacher`)
  - #1366 — docs: plan for repo-wide line-ending normalization (base `main`)
- Comments processed: 12 unresolved comment threads across the 4 PRs — 3 fixes prepared & verified locally but blocked by branch protection on `dev-paul` (HTTP 403 push reject) so posted as suggestion diffs, 2 explained as no-fix-needed (architectural API refactor / i18n-cross-cut), 1 deferred as needing a deliberate schema decision, 6 already-addressed-by-author skipped (PR #1621 × 3 outdated/fixed in c733f59, PR #1366 × 6 — author replies on each).
- Fixes pushed: 0 (push to `dev-paul` for PR #1622 blocked by branch protection HTTP 403; prepared diffs posted as `\`\`\`suggestion` blocks for manual apply)
  - PR #1622 prepared diffs (verified locally — type-check ✓, lint ✓, 2458/2458 unit tests pass):
    - `firestore.rules:811`: replace `matches(uid + '_.*')` with `startsWith(uid + '_')` for shared_activity_walls sessionId-ownership check
    - `components/quiz/QuizStudentApp.tsx:2491`: derive icon/border from `writtenGrade` only for written question types (avoid red/X on ungraded responses where `publishAssignmentScores` stored `ans.isCorrect = false`)
    - `components/quiz/QuizStudentApp.tsx:2605`: fall back to sanitized `studentAnswer` when a points-only / comment-only grade has no `gradingSnapshot` (currently shows "— no response")
    - `tests/components/quiz/PublishedScoreReview.annotations.test.tsx`: new regression test `falls back to the live answer when a points-only grade has no snapshot`
- Reviews posted: 4
  - PR #1623 manual group editing: Ready (after the i18n follow-up is scheduled and manual smoke passes); helper extraction + `randomEditHelpers.test.ts` (18 tests) + group-id preservation noted as exactly the right shape; main gap is no DnD integration test (deferred to manual smoke per the PR's test plan)
  - PR #1622 quiz annotations: Needs changes — 3 of the 5 open reviewer threads have prepared fixes; the `firestore.rules:838` schema-lock concern was deferred as needing a deliberate mutable-field allow-list decision rather than an automated patch; declined the `htmlToPlainText` overload as a perf-refactor not a bug
  - PR #1621 substitute teacher portal: Ready with minor notes — every actionable reviewer thread closed by c733f59/613ccb2 in author's prior round (including the composite `(intendedMode, expiresAt)` index for `expireSubShares`); follow-ups for Phase 6 real widget renderer, i18n backfill, and emulator-based rules/function tests are explicitly called out by author
  - PR #1366 line-endings plan: Ready (eighth review on this PR with no content change since `da8f0946`); flagged that PR is ~3 weeks old and the "quiet window" precondition may need an updated execution date
- Notes:
  - Branch-safety: PR #1622's head is `dev-paul`. Per the CRITICAL rule, push to `dev-paul` is permitted "when there are PR comments on a PR merging dev-paul into main" — but the local proxy rejected the push with HTTP 403, indicating infrastructure-level branch protection takes precedence over the conditional permission. The prepared commit was reset and the diffs surfaced as inline suggestions so the maintainer can apply manually.
  - Coordination call-outs raised in reviews:
    - PR #1623 — i18n strings in `RandomGroups.tsx` / `StudentChip.tsx` / `UnassignedTray.tsx` / `ShuffleList.tsx` need a module-wide sweep PR (not a one-off fix)
    - PR #1622 — `shared_activity_walls` update rule should adopt a `keys().hasOnly([...])` schema-lock paired with rules tests for the disallowed-field-injection paths
    - PR #1366 — eight reviews and three weeks in; consider whether the renormalization can actually land in a quiet window given the current open-PR landscape

---

## 2026-05-13

- PRs reviewed:
  - #1606 — refactor(context): extract getAdminBuildingConfig to utils/adminBuildingConfig.ts (base `dev-paul`)
  - #1605 — chore(audit): scheduled task journals — 2026-05-13 Wednesday (base `main`)
  - #1602 — Add AI model config fallback, new assignment CTAs, and improve accessibility in PLC (base `main`, from `dev-paul`)
  - #1600 — refactor(functions): LRU eviction for admin status cache + BoundedLruMap utility (base `dev-paul`)
  - #1366 — docs: plan for repo-wide line-ending normalization (base `main`)
- Comments processed: 21 unresolved comment threads across the 5 PRs — 1 fixed by code change, 1 attempted-but-blocked by branch protection, 11 explained as no-fix-needed (audit-context / a11y-cross-cut / i18n-sweep / test-refactor / architectural), 5 already-addressed-by-author skipped (PR #1600 × 3, PR #1366 × 6 — author replies on each).
- Fixes pushed:
  - `c318bc70` on `claude/charming-ramanujan-AR3BP` (PR #1606) — safely handle undefined `WIDGET_DEFAULTS.nextUp.config` by typing the cast as `NextUpConfig | undefined` and spreading `?? {}`. `pnpm type-check` ✓, `pnpm lint --max-warnings 0` ✓, `tests/utils/adminBuildingConfig.test.ts` 11/11 ✓.
- Reviews posted: 5
  - PR #1606 `getAdminBuildingConfig` extraction: Ready — clean seam extraction (-400 lines from `DashboardContext.tsx`), 11 unit tests added, follow-up note on adding fixtures for the 20+ untested switch cases.
  - PR #1605 Wednesday audit: Ready with minor notes — three doc-consistency points from the gemini reviewer left for human pass; surfaces real `stations` admin-config gap that should land before the next stations-related merge.
  - PR #1602 PLC CTAs + AI fallback: Ready with minor notes — flagged mixed-scope (PR title scoped to PLC, but AI-fallback work also lands), `void _omit;` cleanup blocked by branch protection, `any`-typed Firestore mock + `eslint-disable` blocks in `functions/src/index.test.ts` worth a dedicated cleanup PR.
  - PR #1600 LRU cache: Ready — textbook small refactor, every reviewer edge case (K = undefined, V = undefined) addressed with dedicated tests, 244/244 functions tests passing.
  - PR #1366 Line-endings plan: Ready — doc-only, all 6 prior reviewer comments have author resolutions, execution correctly deferred to a "no other PRs open" window.
- Notes:
  - Branch safety: today's run pushed only to `claude/charming-ramanujan-AR3BP` (matches neither `main` nor `dev-*`). One attempted push to `dev-paul` (PR #1602 `void _omit;` cleanup) was rejected by branch protection with HTTP 403 — local commit reset, comment posted explaining the situation.
  - PR #1606 was already fast-following the HIGH item that #1605's Wednesday audit itself flagged (`DashboardContext.tsx` +937 lines/week). Cross-PR coherence: the audit identified the seam, the extraction PR landed the fix, both reviewed in the same nightly run.
  - PR #1600 and PR #1366 review threads all had prior author replies acknowledging fixes — skipped duplicate "already addressed" replies to avoid noise.
  - One cross-PR finding: PR #1605's `stations` admin-config gap (no `StationsConfigurationPanel`, no `FeatureConfigurationPanel` entry, no `getAdminBuildingConfig` case) is the same gap the `admin-widget-config` skill exists to prevent. Now in `utils/adminBuildingConfig.ts` after PR #1606 — surfacing here so the next stations-related merge picks it up.

---

## 2026-05-12

- PRs reviewed:
  - #1585 — fix(deps): pin protobufjs >=7.5.6 to close CRITICAL CVE via firebase-functions (base `dev-paul`)
  - #1584 — audit(tuesday): scheduled audit journals — 2026-05-12 (base `dev-paul`)
  - #1582 — feat(plc): drag-resize grid + live tile bodies + cross-PLC analytics + shared library primitives + members invite (Phases 1–4, 6) (base `dev-paul`)
  - #1580 — fix(draggable-window): attach gesture listeners to capture target, not window (base `dev-paul`)
  - #1366 — docs: plan for repo-wide line-ending normalization (base `main`)
- Comments processed: 10 unresolved comment threads across the 5 PRs — 1 fixed by code change, 4 explained as no-fix-needed (architectural/out-of-scope/ambiguous), 5 already addressed by author with replies on PR #1580 (no further action needed).
- Fixes pushed:
  - `20637623` on `claude/improve-plc-dashboard-Z1HvH` (PR #1582) — clarified `LibraryPreviewPane` docstring to accurately describe unmount-on-close behavior (no exit animation; slide-in classes reused on each open). `pnpm type-check` ✓, `pnpm lint --max-warnings 0` ✓.
- Reviews posted: 5
  - PR #1585 protobufjs pin: Ready — textbook security patch with single-version lockfile evidence and `pnpm test` 2301/2301 + functions test 209/209 verification.
  - PR #1584 Tuesday audit: Ready — markdown-only journal updates; net positive in surfacing the new hono 4.12.15→4.12.18 CVE pair.
  - PR #1582 PLC overhaul: Ready with minor notes — opt-in flag limits blast radius; flagged Firestore-rules emulator gate, `types.ts` +86 line surface, and missing `commitTileCoords` unit-test coverage as merge gates.
  - PR #1580 DraggableWindow listener leak: Ready — pointer-capture-target binding + unmount cleanup ref is the right fix; new regression test (`clears global drag-state body class when host unmounts mid-gesture`) locks in the behavior.
  - PR #1366 Line-endings doc: Ready — doc-only; all 6 prior reviewer comments are already addressed; execution correctly deferred per the plan's own "all open PRs merged or closed" precondition.
- Notes:
  - Branch safety: today's run pushed only to `claude/improve-plc-dashboard-Z1HvH` (matches neither `main` nor `dev-*`). No writes to `main` or `dev-paul`.
  - PR #1580 review threads (5 total) were all already replied to by the author citing commit 7c84765 — skipped duplicate "already addressed" replies to avoid noise.
  - One cross-PR finding: `@ungap/structured-clone@1.3.0` deprecation (CWE-502, fix in 1.3.1) surfaces in the PR #1585 lockfile diff. Gemini-code-assist flagged it; replied that it belongs in the next scheduled-tasks audit cycle rather than this PR's narrow protobufjs scope.

---

## 2026-05-07

- PRs reviewed:
  - #1366 — docs: line-endings normalization plan (base `main`)
  - #1534 — feat(quiz): add Shuffle Questions / Shuffle Answer Options toggles (base `dev-paul`)
  - #1535 — feat(quiz): publish scores with per-assignment visibility levels (base `dev-paul`)
  - #1536 — feat(sharing): board import picker — Synced / View-Only / Make a Copy (base `dev-paul`)
  - #1537 — feat(plc): PLC Dashboard shell + feature toggles + completed assignments (Phase 1) (base `dev-paul`)
- Comments processed: 16 unanswered review threads/issue comments across the 5 PRs — 13 already addressed in current code (replies posted explaining), 3 fixed by a doc-hardening commit on PR #1366.
- Fixes pushed:
  - `958c237` on `docs/line-endings-normalization-plan` — applied 3 doc improvements to `docs/line-endings-normalization-plan.md` covering Step 2 PR-title guidance (issue 4374319374), Step 3 verification parenthetical (issue 4374318572), and Step 5 pre-flight `git status` guard (issue 4361544503). `prettier --check` ✓.
- Reviews posted: 5
  - PR #1537 PLC Dashboard: Ready with minor notes — strong firestore rules (split create/update with existing-owner check, `keys().hasOnly` schema lock, `sheetUrl` pinned to parent PLC's `sharedSheetUrl`), `void writePlcAssignmentIndexEntry` keeps Assign action fast. Flagged: no test coverage for `usePlcAssignmentIndex` (parser, ordering, error path) or for the new firestore rules.
  - PR #1536 Board import picker: Ready with minor notes — PII scrub coverage is thorough across all three write paths (seed, mirror, linkage). Role-gated rule splits (host/collaborator/self-join/self-leave) with `originalAuthorName` immutability prevent host-display-name spoofing. Flagged: medium regression risk on `DashboardContext.tsx` (~470 lines added; now 3886 lines total); no test for cancellation-on-detach mirror timer path.
  - PR #1535 Publish quiz scores: Ready — well-tested (234 + 115 lines of new tests cover unpublish, multi-response publish, chunking past `MAX_BATCH_WRITES`, anonymous rejection, missing-response throw); server-authoritative grading prevents client-side correctness fabrication; idempotent re-publish + clean unpublish.
  - PR #1534 Quiz shuffle: Ready — per-attempt seed (`${uid}:attempt-${completedAttempts}`) with `:question-order` domain suffix decorrelates the two shuffles; `if (!myResponse) return <loading />` guard prevents `attempt-0` flash on retakes; `shuffleQuestions` correctly restricted to self-paced sessions. 6 new tests cover variance, stability, multiset preservation, and decorrelation.
  - PR #1366 Line endings doc: Ready — doc-only PR; today's run added 3 hardening edits and confirmed the prior 5 review concerns are already addressed in the current revision. CI in progress on `958c237`.
- Notes:
  - All 4 feature PRs (1534, 1535, 1536, 1537) had CI green at review time.
  - All 4 feature PRs target `dev-paul`, not `main` — author has been merging into `dev-paul` for integration testing before the broader merge-up to `main`.
  - Branch safety: today's run pushed only to `docs/line-endings-normalization-plan` (matches neither `main` nor `dev-*`). No writes to `main` or `dev-paul`.
  - 13 of the 16 unanswered review-comment threads on these PRs were already addressed in current code by the author across earlier commits — the threads remained "open" on GitHub because Copilot/Gemini comments are not auto-resolved when the underlying code changes. Posted "already addressed" replies citing the current line numbers and rationale.

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

## 2026-05-05

- PRs reviewed:
  - #1502 — Add tests for `getLocalIsoDate` in `localDate.ts` (head `fix/local-date-tests-…`, base `main`, DRAFT)
  - #1503 — Add comprehensive tests for first5 utilities (head `testing/first5-utils-…`, base `main`, DRAFT)
  - #1504 — Add comprehensive tests for `isCustomBackground` (head `testing-is-custom-background-…`, base `main`, DRAFT)
  - #1505 — Add unit tests for `blobToBase64` (head `test-file-encoding-…`, base `main`, DRAFT)
  - #1506 — Add error path tests for smartPaste URL parsers (head `testing/smart-paste-error-paths-…`, base `main`, DRAFT)
  - #1507 — audit(scheduled-tasks): Tuesday 2026-05-05 (head `scheduled-tasks`, base `dev-paul`, DRAFT)
  - #1366 — docs: plan for repo-wide line-ending normalization (head `docs/line-endings-normalization-plan`, base `main`)
- Comments processed: 5 actionable inline threads — 4 fixed, 1 (#1366 cluster) skipped as already-addressed
  - PR #1507: 2 gemini-code-assist threads — both fixed in `de81795`
    - dependency-audit.md line 29 — relabel protobufjs CRITICAL entry from MEDIUM → HIGH to match prior precedent
    - skill-freshness.md — refresh post-merge line numbers (FeaturePermissionsManager 919–933 → 941–953; FeatureConfigurationPanel 682–694 → 688–700), verified against current source
  - PR #1502: 1 gemini-code-assist thread — fixed in `40931d8`
    - utils/localDate.test.ts:2 — `import { getLocalIsoDate } from './localDate'` → `'@/utils/localDate'` per repo style guide
  - PR #1503: 1 gemini-code-assist thread — fixed in `df33da3`
    - utils/first5.test.ts — added 8 new boundary tests covering 5:59 vs 6:00 AM rollover, same-day pre-rollover returning `activeDayNumber - 1`, and weekend stick-to-Friday transitions through Monday 6 AM
  - PR #1366: 6 inline threads — all `is_outdated: true` with prior OPS-PIvers replies; no further action this run
- Fixes pushed: 3
  - PR #1507 → `scheduled-tasks` `de81795` — fix(pr-1507): relabel protobufjs to HIGH and refresh post-merge line numbers (markdown only; prettier check passed)
  - PR #1502 → `fix/local-date-tests-…` `40931d8` — fix(pr-1502): use @/ path alias for internal import (type-check ✓ lint ✓ 6/6 tests pass)
  - PR #1503 → `testing/first5-utils-…` `df33da3` — fix(pr-1503): expand computeCurrentDayNumber boundary tests (lint ✓ 20/20 tests pass)
- Reviews posted: 7
  - PR #1502: Ready — small focused test addition; only DST-boundary case noted as optional follow-up
  - PR #1503: Ready — 20/20 pass after boundary additions; DST optional follow-up noted
  - PR #1504: Ready — focused 4-test addition pinning `startsWith` semantics; adequate coverage
  - PR #1505: Ready — solid coverage including null-error branch; minor convention nit on `tests/utils/` vs co-located placement
  - PR #1506: Ready with minor notes — new error-path tests are valuable; flagged minor coverage regressions in fixture edits (`/view → /edit` Google Docs branch and Drive `?usp=sharing` stripping no longer covered)
  - PR #1507: Ready — both gemini comments now fixed; flagged that the new dependency-audit items (axios MEDIUM, protobufjs HIGH via firebase-functions) should be triaged into upgrade PRs before next Tuesday cycle
  - PR #1366: Ready — seventh review with no content change; all 6 prior threads still addressed
- Notes:
  - PR #1507 head SHA `de81795` (was `ac05d3a`) — 1 fix commit added this run; 2 markdown files changed
  - PR #1502 head SHA `40931d8` (was `8401713`) — 1 fix commit added this run; 1 file changed
  - PR #1503 head SHA `df33da3` (was `12ce825`) — 1 fix commit added this run; 1 file changed (+59 lines)
  - PR #1504, #1505, #1506 had no inline review threads at audit time — review-only this run
  - PR #1366 head SHA `da8f0946` — unchanged since 2026-05-01; no new commits this run
  - Branch-safety: all 7 PRs had non-`main` / non-`dev-*` head branches → eligible for pushes; pushes only made where comments required a code/doc fix

## 2026-05-06

- PRs reviewed: 23 open PRs
  - #1502 — Add tests for `getLocalIsoDate` (base `dev-paul`)
  - #1503 — Add tests for first5 utilities (base `dev-paul`)
  - #1504 — Add tests for `isCustomBackground` (base `dev-paul`)
  - #1505 — Add tests for `blobToBase64` (base `dev-paul`)
  - #1506 — Add error path tests for smartPaste URL parsers (base `dev-paul`)
  - #1507 — audit(scheduled-tasks): Tuesday 2026-05-05 (base `dev-paul`)
  - #1508 — slugify trailing-dash fix + tests (base `dev-paul`)
  - #1509 — widgetDragFlag tests (base `dev-paul`)
  - #1510 — styles utilities tests (base `dev-paul`)
  - #1511 — DraggableWindow commented-code cleanup (base `dev-paul`)
  - #1512 — Cloud Functions parallel email lookup (base `dev-paul`)
  - #1513 — PLC tests + memberUids source-of-truth fix (base `dev-paul`)
  - #1514 — DraggableWindow commented-code cleanup (base `dev-paul`, non-draft)
  - #1515 — testClassAccess tests + whitespace orgId fix (base `dev-paul`)
  - #1516 — backgrounds tests + getCustomBackgroundStyle refactor (base `dev-paul`)
  - #1517 — PLC tests + memberEmails safety check (base `main`)
  - #1518 — urlHelpers error path test (base `main`)
  - #1519 — Cloud Functions concurrent getUsers (base `main`)
  - #1520 — resolveCategory tests (base `main`)
  - #1521 — DOMPurify XSS sanitizer replacement (base `main`)
  - #1522 — DraggableWindow commented-code cleanup (base `main`)
  - #1523 — DraggableWindow commented-code cleanup (base `main`)
  - #1366 — docs: line-endings normalization plan (base `main`)
- Comments processed: 0 actionable — every unresolved thread across all 23 PRs already had author "Fixed in [commit]" replies from prior cycles. No new code fixes required this run.
- Fixes pushed: 0
- Reviews posted: 23
  - PR #1521 DOMPurify: Ready with minor notes — flagged adding back the SVG regression test and a `data:text/html` URI test to lock in the new `ALLOWED_TAGS`/URI behavior
  - PR #1519 perf (concurrent getUsers): Ready with minor notes — optional concurrency-cap follow-up for very large orgs (Firebase Auth quota: 1000 ops/sec)
  - PR #1512 perf (parallel email lookup): Ready
  - PR #1508 slugify: Ready with minor notes — `slugOrFallback` now returns variable lengths (≤24); verify no caller asserts `length === 24`
  - PR #1517 vs #1513 PLC tests: flagged as overlapping; recommended merging #1513 (stronger `memberUids` source-of-truth fix + caller-email-alias suppression) and closing #1517
  - PR #1516 backgrounds: Ready
  - PR #1515 testClassAccess: Ready
  - PR #1507 audit: Ready — flagged the two new dependency-audit items (axios MEDIUM `>=1.15.1`, firebase-functions `>=7.2.5` to resolve the protobufjs HIGH path) for follow-up upgrade PRs before next Tuesday cycle
  - PR #1502, #1503, #1504, #1505, #1506, #1509, #1510, #1518, #1520: Ready (focused test additions)
  - PR #1511, #1514, #1522, #1523: all four delete the same commented-out `MIN_GESTURE_SWIPE_DISTANCE` constant; flagged duplicate; recommended merging one (#1511 preferred — non-draft, base `dev-paul`) and closing the other three
  - PR #1366: Ready — eighth review with no content change since `da8f0946` (2026-05-01); all 6 prior threads addressed
- Notes:
  - Every open PR's unresolved review threads were already addressed by author "Fixed in [commit]" replies in prior runs (many marked `is_outdated:true` on GitHub but not `is_resolved:true`). No code/doc fixes pushed this run.
  - Coordination call-outs raised in reviews:
    - #1511 / #1514 / #1522 / #1523 — duplicate DraggableWindow cleanup PRs; merge one, close three
    - #1513 / #1517 — overlapping PLC tests; recommend #1513
    - #1504 / #1516 — overlapping `isCustomBackground` test additions on `dev-paul`; coordinate to avoid test-file conflicts
  - Branch-safety: PR #1507 head `scheduled-tasks` is the current branch (review-only). All other open PRs have non-`main` / non-`dev-*` head branches; no pushes were required this run.

## 2026-05-21

- PRs reviewed: 3
  - #1677 — refactor(admin): remove dead magic/record/remote config panels (head `scheduled-tasks`, base `dev-paul`)
  - #1676 — PLC collaborative space redesign (head `dev-paul-plc-redesign`, base `dev-paul`)
  - #1366 — docs: line-endings normalization plan (head `docs/line-endings-normalization-plan`, base `main`)
- Comments processed: 0 actionable
  - #1677: no review comments.
  - #1676: all 4 inline review threads already `is_resolved:true` (gemini security comment on `plc_resources` rules + 3 obsolete normalization suggestions, all addressed at HEAD).
  - #1366: 6 threads `is_resolved:false` but `is_outdated:true`, each already carrying an author "Addressed" reply from a prior cycle. No new fix or reply needed (re-replying would be noise).
- Fixes pushed: 0
- Reviews posted: 3
  - PR #1677: Ready — clean dead-code removal; reasoning sound (mathTools/recessGear correctly left as global-config pattern, magic/record/remote keys confirmed unreferenced). Flagged one manual check: verify nothing else imports the deleted `SchemaDrivenConfigurationPanel`; `RemoteGlobalConfig` left as documented unused export.
  - PR #1676: Ready with minor notes — large (~73 files) but coherent old-bento→rail-nav swap with excellent test coverage incl. firestore rules tests. Firestore rules (`plcs/docs`, `plc_resources`) are schema-locked with `keys().hasOnly`, enum + type validation, and admin/member auth gates; prior security comment resolved. Notes: confirm rules tests run green in CI (need Java 21, not run locally), and this is Wave 1 of a multi-wave plan.
  - PR #1366: Ready — doc-only; all prior reviewer feedback addressed, open threads outdated. Execution must wait for a no-open-PR window.
- Notes:
  - Branch-safety: #1676 head `dev-paul-plc-redesign` matches `dev-*` → treated read-only (review comment only, no push). #1677 head `scheduled-tasks` and #1366 head `docs/*` are pushable, but Phase 1 produced no fixes, so no pushes to any PR branch this run.
  - This run's log + summary committed on branch `claude/clever-johnson-GghmZ` (the harness-designated development branch) rather than pushed directly to `scheduled-tasks`, since `scheduled-tasks` is the head of open PR #1677 and pushing to it would alter that PR without authorization.

## 2026-05-22

- PRs reviewed: 1
  - #1366 — docs: line-endings normalization plan (head `docs/line-endings-normalization-plan`, base `main`)
- Comments processed: 0 actionable
  - #1366: 6 inline review threads `is_resolved:false` but 5 `is_outdated:true` (1 not outdated); every thread already carries an author "Addressed/Fixed in [commit]" reply from prior cycles. 26 PR-level review comments, all from prior automated sweeps and all already addressed — most recent sweep `17dfae3` (2026-05-20) covered the latest 5 comments; nothing posted since. No new fix or reply needed (re-replying would be noise).
- Fixes pushed: 0
- Reviews posted: 1
  - PR #1366: Ready — doc-only; read the full 336-line doc and verified all prior reviewer feedback is now reflected at HEAD: step references consistent (Step 1→"step 4 adds the hash"), logical step order (config→renormalize→verify→register→cleanup), `--ignore-cr-at-eol` (not over-broad `--ignore-all-space`), subject-grep+`grep -i`+hard-fail hash lookup, rebase remediation with `git add`/`--continue`/unconditional working-tree refresh/`--force-with-lease`, `--ours`/`--theirs` rebase-vs-merge note, rollback via PR with `--no-edit` (main protected), and `blame.ignoreRevsFile` local config. Execution must wait for a no-open-PR window.
- Notes:
  - Branch-safety: only #1366 is open this run (PR #1677 from the 2026-05-21 entry is no longer open, so `scheduled-tasks` is no longer a PR head). #1366 head `docs/*` is pushable but Phase 1 produced no fixes — no pushes to any PR branch.
  - Log committed and pushed to `scheduled-tasks` directly this run, since it is no longer the head of any open PR.

## 2026-06-09

- PRs reviewed: 8
  - #1909 — fix(D4): library/ Modal imports → @/ alias (head `nightly/unify-import-paths-library-2026-06-09`, base `dev-paul`)
  - #1910 — docs(unifier): run 11 memory log (head `nightly/unifier-log-2026-06-09`, base `dev-paul`)
  - #1911 — fix(i18n): widgets.timeTool DE/FR/ES (head `nightly/admin-config-2026-06-09`, base `dev-paul`)
  - #1912 — fix(miniApp): extract normalizeMiniAppSession (head `nightly/state-data-2026-06-09`, base `dev-paul`)
  - #1913 — fix(dock): add SELECT to smart-paste guard (head `nightly/dashboard-layout-2026-06-09`, base `dev-paul`)
  - #1914 — fix(widgets): NextUp queue in-place mutation (head `nightly/widgets-2026-06-09`, base `dev-paul`)
  - #1915 — chore(debugger): nightly run log run 13 (head `nightly/debugger-log-2026-06-09`, base `dev-paul`)
  - #1916 — audit(tuesday) + fix(deps): close CRITICAL vitest CVE (head `scheduled-tasks`, base `dev-paul`)
- Comments processed: 5 total — 3 fixed, 2 explained
  - #1911: 3 unresolved gemini-code-assist French word-choice threads (Randomiseur vs Aléatoire, le Randomiseur vs l'aléatoire, « Suivant » vs « Prochain ») → all 3 FIXED in a pushed commit; consistent with existing `Randomiseur` term at fr.json:669.
  - #1912: 1 unresolved gemini thread requesting classIds/rosterIds sanitization → EXPLAINED (no fix): a later commit on the branch already destructures them out of `restData` and filters to non-empty strings; the spread is `...restData`, never a blind `...data`.
  - #1913: 1 thread (e.target null-guard) already `is_resolved:true` + `is_outdated:true` (fix already incorporated) → skipped silently.
  - #1909, #1910, #1914, #1915, #1916: no review comments.
- Fixes pushed: 1
  - #1911 / `nightly/admin-config-2026-06-09` — fr.json timeTool tips reworded to "Randomiseur"/"Suivant" for consistency; JSON valid, prettier clean, i18n test 8/8 passing.
- Reviews posted: 8 (one structured review per PR)
  - #1909: Ready — pure `@/` alias substitution, behavior-preserving.
  - #1910: Ready — doc-only unifier run 11 log.
  - #1911: Ready — locale parity fix + parity-enforcing regression test; gemini nits addressed.
  - #1912: Ready — destructure + `...restData` extraction mirrors normalizeVideoActivitySession (#1902); good test coverage.
  - #1913: Ready — SELECT guard + null-safety; minor non-blocking nit (double `<Dock />` render in the new test).
  - #1914: Ready — extracted advanceNextUpQueue (no in-place mutation) + render-body queueRef; minor nit (duplicate nextIdx computation).
  - #1915: Ready — doc-only debugger run 13 log; cross-refs consistent with #1911–#1914.
  - #1916: Ready with minor notes — CRITICAL vitest CVE bump; CI on Node 24 (frozen lockfile) is the authoritative gate (couldn't run install/suite locally — Node 22 here); `ws` MEDIUM remains a tracked follow-up.
- Notes:
  - Branch-safety: all 8 head branches are non-`main` / non-`dev-*` → pushable. Only #1911 required a fix push.
  - #1916 head is `scheduled-tasks` (this log's branch). The deps bump + audit journals it carries are scheduled-task artifacts in the same family as this log, so appending today's entry here is in-scope; pushed to `scheduled-tasks` per the POST-TASK workflow.

## 2026-06-16

- PRs reviewed: 8
  - #1991 — fix(deps): override qs to ^6.15.2 in functions, clears GHSA-q8mj-m7cp-5q26 (head `claude/compassionate-noether-qb9lws`, base `dev-paul`)
  - #1989 — audit(scheduled-tasks): Tuesday daily clean + dependency-version notes (head `scheduled-tasks`, base `dev-paul`)
  - #1987 — docs(nightly): debugger run 19 log (head `nightly/debugger-log-2026-06-16`, base `dev-paul`)
  - #1986 — fix(a11y): SegmentedTabs WAI-ARIA tablist keyboard navigation (head `nightly/widgets-2026-06-16`, base `dev-paul`)
  - #1985 — fix(poll): clear lastPollSessionId when starting a fresh session (head `nightly/state-data-2026-06-16`, base `dev-paul`)
  - #1984 — fix(layout): align GroupBoundingBox commit scale + NaN clamp (head `nightly/dashboard-layout-2026-06-16`, base `dev-paul`)
  - #1983 — fix(i18n): translate sidebar.boards.rootBoards in DE/ES/FR (head `nightly/admin-config-2026-06-16`, base `dev-paul`)
  - #1982 — docs(unifier): run 17 staleness scan (head `nightly/unifier-log-2026-06-16`, base `dev-paul`)
- Comments processed: 11 total — 0 fixed, 11 already-addressed (10 threads resolved, 1 left open as informational discussion)
  - #1991: 2 threads — (a) `claude` caret suggestion `^6.15.2` already applied at HEAD (`functions/package.json` shows `"qs": "^6.15.2"`); (b) `gemini` comment targets `utils/migrateProportionalLayout.ts:102`, a file NOT in this PR's 2-file diff (outdated/misattributed). Both resolved as not-applicable.
  - #1986: 6 threads, ALL addressed at HEAD — `nodes.length===0` guard now precedes `preventDefault`; modifier-key bailout present; roving `tabIndex={selected?0:-1}`; handler calls `onChange(tabs[nextIdx].key)` (select-follows-focus, closes the tabIndex/onChange mismatch); test now covers Home/End + modifier no-op + roving-tabindex assertion. All 6 resolved.
  - #1984: 2 threads — (a) `gemini` HIGH NaN clamp `Math.max(0, …)` already applied at both `onMove` (~156) and `onUp` (~234), resolved; (b) `claude` informational note about the onMove behavior change left OPEN for author awareness (discussion, not a change request).
  - #1983: 1 thread — `claude` over-long test comment already trimmed to a single line at HEAD; resolved.
  - #1989, #1987, #1985, #1982: no review comments.
- Fixes pushed: 0 — every actionable review comment was already addressed in the current branch HEAD (branches were updated after the reviews were left). No code change needed.
- Reviews posted: 8 (one structured review per PR)
  - #1991: Ready — qs override clears a DoS advisory; caret convention matches siblings; security-positive, low risk.
  - #1986: Ready — full WAI-ARIA §3.23 tablist keyboard model; all six review threads addressed; comprehensive tests.
  - #1985: Ready — `mode==='fresh'` clears stale `lastPollSessionId`; correct root-cause fix; 3 regression tests.
  - #1984: Ready with minor notes — geometric-mean alignment + NaN clamp at both call sites; suggested a small test for the defensive clamp branch.
  - #1983: Ready — DE/ES/FR rootBoards translations; correct root-cause (not a `defaultValue` band-aid); 11 regression tests.
  - #1982: Ready — doc-only unifier run 17 journal; RandomGroups empty-state correctly deferred to designer sign-off.
  - #1987: Ready — doc-only debugger run 19 journal; entries match the four fix PRs.
  - #1989: Ready — standing nightly-audit branch; only non-doc change is a sound test-file rebase resolution; standing dependency vulns are tracked, not introduced here.
- Notes:
  - Branch-safety: all 8 head branches are non-`main` / non-`dev-*` → pushable; Phase 1 produced zero fixes so no PR-branch pushes were needed.
  - Local verification of `pnpm` checks was not run this cycle (no code changes pushed); CI on Node 24 remains the authoritative gate for each PR.
  - This log appended to `scheduled-tasks` per the POST-TASK workflow (continuous log; prior entry was 2026-06-09).

## 2026-06-17

- PRs reviewed: 10
  - #2004 — perf(widgets): migrate 9 content widgets to stable `useDashboardActions()` (head `perf-content-actions-migration`, base `f9-toolvis-context-split`)
  - #2003 — fix(ci): run functions tests in both deploy workflows (head `nightly/build-2026-06-17`, base `dev-paul`)
  - #2002 — docs(routines): Run 20 debugger log (head `nightly/debugger-log-2026-06-17`, base `dev-paul`)
  - #2001 — fix(DraggableWindow): add stopPropagation to Alt+P (head `nightly/dashboard-2026-06-17`, base `dev-paul`)
  - #2000 — fix(videoActivityGrading): dedup question IDs in videoActivityMaxPoints (head `nightly/state-2026-06-17`, base `dev-paul`)
  - #1999 — fix(i18n): translate verbatim-English values in DE/ES/FR (head `nightly/admin-2026-06-17`, base `dev-paul`)
  - #1998 — fix(ClockWidget): cqh/cqw → cqmin font scaling (head `nightly/widgets-2026-06-17`, base `dev-paul`)
  - #1997 — docs(unifier): run 18 staleness scan (head `nightly/unifier-log-2026-06-17`, base `dev-paul`)
  - #1996 — perf(dashboard): split tool visibility into its own context (F9) (head `f9-toolvis-context-split`, base `dev-paul`)
  - #1984 — fix(layout): align GroupBoundingBox commit scale with drag-frame formula (head `nightly/dashboard-layout-2026-06-16`, base `dev-paul`)
- Comments processed: 13 total — 1 fixed, 12 explained
  - #2004: 1 gemini thread (use `vi.mocked`) → FIXED. Applied `vi.mocked(useDashboardActions)` but kept `as unknown as DashboardActions` on the value since `mockDashboardActions` is an intentional partial of the 16-member surface (verbatim suggestion would not type-check). Verified type-check ✓ lint ✓ tests ✓; pushed.
  - #2003: 1 gemini thread (robust `includesFunctionsTests`) → EXPLAINED (already addressed): the function already splits by line and skips `#`-commented lines.
  - #2002: 2 gemini threads (React 17+ stopPropagation accuracy, both outdated) → EXPLAINED (already addressed): lines 142 and 233 already carry the corrected statement.
  - #2001: 1 claude thread (condense comment block, outdated) → EXPLAINED (already addressed): already condensed to the two-line note.
  - #1999: 4 threads → 2 EXPLAINED as already addressed (`typeStill` = "Bilder"; FR `typeVideo` dedicated assertion exists), 2 EXPLAINED as declined cosmetic Vitest-style nits (`?.` removal — presence checks already use `toHaveProperty`).
  - #1998: 1 gemini thread (`gap-[1cqmin]` → inline style) → EXPLAINED (already addressed): gap is already in the `style` prop.
  - #1984: 2 open claude threads (use `data-testid` selectors) → EXPLAINED (already addressed): all three tests already select via `[data-testid="group-resize-handle-se"]`.
  - #2000, #1997, #1996: no actionable unresolved threads (#1996 all six resolved).
- Fixes pushed: 1
  - #2004 / `perf-content-actions-migration` — `fix(pr-2004): use vi.mocked for useDashboardActions mock typing`.
- Reviews posted: 10 (one structured review per PR)
  - #2004: Ready with minor notes — clean mount-stable migration; merge base #1996 first.
  - #2003: Ready — CI deploy-gate fix + hermetic YAML test.
  - #2002: Ready with minor notes — accurate log; pre-existing contradiction at line 107 (#1939 row) flagged for a future pass.
  - #2001: Ready — minimal, correct, tested stopPropagation fix.
  - #2000: Ready — denominator dedup mirrors numerator; strong coverage.
  - #1999: Ready — i18n parity fix; declined cosmetic test nits.
  - #1998: Ready — cqmin aspect-ratio fix per container-query standard.
  - #1997: Ready — doc-only unifier run-18 log.
  - #1996: Ready — measured, host-safe context split; base for #2004.
  - #1984: Ready — geometric-mean alignment + NaN guard + non-vacuous tests.
- Notes:
  - Branch-safety: all 10 head branches are non-`main` / non-`dev-*` → pushable. Only #2004 required a fix push.
  - Local verification for the #2004 fix ran on Node 22 (env wants 24): targeted `tsc --noEmit` (0 errors), `eslint --max-warnings 0` (clean), and the TrafficLight test (6/6) all passed; full CI on Node 24 remains the authoritative gate.
  - Most nightly PRs had already incorporated reviewer suggestions in later commits before this run, so most threads were explanatory rather than fixes.

## 2026-06-18

- PRs reviewed: 9 (all open PRs)
  - #2016 — fix(poll): cap progress-bar height at large widget sizes (head `scheduled-tasks`, base `dev-paul`)
  - #2014 — fix(Modal): prevent scroll-lock flicker on new onClose reference (head `nightly/layout-2026-06-18`, base `dev-paul`)
  - #2013 — docs(routines): Run 21 debugger log (head `nightly/debugger-log-2026-06-18`, base `dev-paul`)
  - #2012 — fix(i18n): DE widgets.timeTool.timer → "Countdown" (head `nightly/admin-2026-06-18`, base `dev-paul`)
  - #2011 — fix(widgets): Escape-cancel guards — DrawingWidget InlineTitle + SmartNotebook PageEditor (head `nightly/widgets-2026-06-18`, base `dev-paul`)
  - #2010 — fix(lti): preserve stored contextTitle in linkLtiCourseV1 (head `nightly/build-2026-06-18`, base `dev-paul`)
  - #2009 — fix(quizMaxPoints): dedup Set guard against scoreMaximum inflation (head `nightly/state-2026-06-18`, base `dev-paul`)
  - #2007 — chore(perf): update baseline timing snapshots (head `nightly/perf-baseline-2026-06-18`, base `dev-paul`)
  - #2006 — docs(unifier): run 19 staleness scan (head `nightly/unifier-log-2026-06-18`, base `dev-paul`)
- Comments processed: 17 total — 2 fixed, 9 explained, 6 skipped (already answered by author / outdated nitpicks)
  - #2016: 2 gemini threads (migrateProportionalLayout `Math.abs` on wProp/hProp) → EXPLAINED (already addressed): current code uses strict `wProp <= 0 || wProp > 1.5` (lines 42-45) and `wProp > 0 && wProp <= 1.5` (lines 109-112).
  - #2014: 2 gemini threads (body.style.overflow restore) → FIXED: replaced dummy getter/setter restore with `delete` of the shadowed instance property in both `afterEach` and the in-test restore.
  - #2011: 2 gemini ref-reset threads → EXPLAINED (already addressed): render-body resets `if (isEditing) isCancellingRef.current = false;` / `if (editing) cancellingRef.current = false;` already present. 4 further threads (eslint-disable back-and-forth answered by author; 2 outdated claude test-quality nitpicks) → SKIPPED.
  - #2010: 1 gemini TS-narrowing thread → EXPLAINED (already addressed): code already uses `priorData && typeof priorData.contextTitle === 'string'`.
  - #2009: 2 gemini threads (defensive null/Array guards + tests) → EXPLAINED (declined): out of scope for the dedup fence; `if (!q || !q.id) continue` would change semantics for id-less questions.
  - #2007: 3 threads (gl.switchSlide10/addStep commit-count drop) → EXPLAINED (resolved in follow-up): counts restored to 10 / 3, the 10→1 / 3→1 was a full-suite isolation artifact.
  - #2013, #2012, #2006: no unresolved threads.
- Fixes pushed: 1
  - #2014 / `nightly/layout-2026-06-18` — `fix(pr-2014): restore native body.style.overflow via delete in Modal test cleanup`.
- Reviews posted: 9 (one structured review per PR)
  - #2016: Ready with minor notes — clean PollWidget `clamp()` cap; net diff vs dev-paul is 29 files / +2560 (scheduled-tasks divergence) — confirm intended scope.
  - #2014: Ready — Modal onClose-ref flicker fix + regression test; follow-up test-hygiene fix pushed.
  - #2013: Ready — doc-only debugger run-21 log.
  - #2012: Ready — i18n DE Countdown fix, well-justified and tested.
  - #2011: Ready — pattern-consistent Escape-cancel guards with regression tests.
  - #2010: Ready — LTI contextTitle null-clobber fix; transaction-safe, tested.
  - #2009: Ready — quizMaxPoints dedup fence mirrors push-path seenIds; tested.
  - #2007: Ready — deterministic commit counts intact; only indicative timings moved.
  - #2006: Ready — doc-only unifier run-19 log.
- Notes:
  - Branch-safety: all 9 head branches are non-`main` / non-`dev-*` → pushable. Only #2014 required a fix push.
  - Local verification for the #2014 fix ran on Node 22 (env wants 24): `tsc --noEmit` (0 errors), `eslint --max-warnings 0` (clean), and `vitest` Modal suite (16/16) all passed; full CI on Node 24 remains the authoritative gate.
  - #2016 scope: the `scheduled-tasks` head has diverged ~29 files from `dev-paul`, so its PR diff far exceeds the stated one-line PollWidget change — flagged in the review for human confirmation.

## 2026-07-02

- PRs reviewed: 9
  - #2127 — docs(unifier): run 23 dedupe of `unifier.md` (head `nightly/unifier-log-2026-07-02`, base `dev-paul`)
  - #2126 — chore(imports): relative → `@/` alias in 14 test files (head `nightly/unify-import-paths-2026-07-02`, base `dev-paul`)
  - #2125 — fix(stickers): guard floating-menu actions on locked/read-only boards (head `claude/serene-meitner-7luik8`, base `dev-paul`)
  - #2124 — docs(unifier): run 23 all-aligned log (head `nightly/unifier-log-2026-07-01`, base `dev-paul`)
  - #2120 — fix(deps): bump dompurify to 3.4.11 / GHSA-cmwh-pvxp-8882 (head `deps/dompurify-3.4.11`, base `dev-paul`)
  - #2119 — audit(tuesday): scheduled audit journals + useScreenRecord tests (head `scheduled-tasks`, base `dev-paul`)
  - #2118 — docs(unifier): run 23 log + prettier/dedupe maintenance (head `nightly/unifier-log-2026-06-30`, base `dev-paul`)
  - #2101 — fix(dashboard): Escape-minimize + screen-record listener churn (head `nightly/dashboard-2026-06-28`, base `dev-paul`)
  - #2098 — NumberLine Escape-cancel/a11y + AI feature label sync (head `dev-paul`, base `main`)
- Comments processed: 1 new unresolved — 0 fixed, 1 explained. Every other open review thread across the 9 PRs already carried an author reply (addressed in earlier commits/PRs #2099/#2123/#2125) and needed no new action.
  - #2119: new gemini/claude thread (discussion_r3510696315) requesting a `startRecording` concurrent-call guard + test → EXPLAINED (no fix). Scope: production hook change belongs in the dedicated `useScreenRecord.ts` follow-up already tracked on this PR (with the unmount-cleanup/`mountedRef` guard), not this audit-journal PR. Also flagged the suggested one-liner `if (isRecording) return;` as unsafe — `startRecording`'s deps are `[options, stopRecording]`, so a ref-based guard (`mediaRecorderRef.current?.state === 'recording'`) is the correct fix.
- Fixes pushed: 0 (no PR carried an unaddressed comment with an unambiguous, in-scope mechanical fix).
- Reviews posted: 9 (one structured review per PR)
  - #2127: Ready — docs-only `unifier.md` dedup (633→491 lines); good double-merge prevention note.
  - #2126: Ready — pure relative→`@/` test-path sweep; all 20 call-sites verified equivalent, test counts unchanged.
  - #2125: Ready — sticker lock/read-only guards; closes a real `bringToFront` read-only write path; 9/9 tests.
  - #2124: Ready — docs-only run-23 log; flagged 3 concurrent "run 23" `unifier.md` PRs risk re-duplication.
  - #2120: Ready — dompurify security bump; override correctly collapses transitive monaco pin to single 3.4.11.
  - #2119: Ready — audit journals + useScreenRecord test suite; 3 documented hook gaps deferred to a dedicated follow-up.
  - #2118: Ready — docs-only run-23 log + prettier/dedupe maintenance; same three-PR overlap caveat.
  - #2101: Ready — two dashboard bug fixes with root-cause writeups + regression tests.
  - #2098: Ready with minor notes — dev-paul→main integration PR, 14/14 CI green, all 8 threads addressed; a few stale-closure/read-only items deferred by design.
- Notes:
  - Branch-safety: only #2098 is a `dev-*`→`main` PR (read-only for fixes); the rest target `dev-paul` from pushable feature branches. No fix pushes were needed this run, so nothing was pushed to any PR branch.
  - CI health: #2098 shows all 14 checks green; no failing checks observed on any open PR.
  - Housekeeping: three separate "run 23" `unifier.md` PRs (#2118, #2124, #2127) are open at once — flagged in each review that they must merge in a deliberate order (ideally consolidated) to avoid re-introducing the exact log duplication #2127 is cleaning up.

## 2026-07-03

- PRs reviewed: 3
  - #2125 — fix(stickers): guard floating-menu Delete on locked/read-only boards (head `claude/serene-meitner-7luik8`, base `dev-paul`)
  - #2119 — audit(tuesday): scheduled audit journals + SegmentedControl unification (head `scheduled-tasks`, base `dev-paul`)
  - #2098 — NumberLine Escape-cancel/a11y + AI feature label sync (head `dev-paul`, base `main`)
- Comments processed: 3 new unresolved threads — 0 fixed, 3 explained. Every other open review thread across the 3 PRs already carried an author reply from an earlier run and needed no new action.
  - #2125 (discussion_r3517394360): outdated single-slot `cleanupRef` fragility note → EXPLAINED. Superseded by the `Set<() => void>` gesture-cleanup refactor in `b981cc7`; no further change.
  - #2119 (discussion_r3517687333): `SegmentedControl` `role="tab"`→`role="radio"` a11y swap → EXPLAINED (no fix). The suggested swap is incomplete — ARIA `role="radio"` on `<button>`s still needs a custom roving-tabindex + arrow-key handler (native arrow-nav only applies to real `<input type="radio">`), and the container needs `role="radiogroup"`. A correct fix is a focused a11y follow-up, out of scope for an audit-journal PR.
  - #2119 (discussion_r3517687898): `SpecialistScheduleWidget.handleStartTimer` pre-existing bugs (unclamped `newXProp` off-screen spawn; `20/safeCurW` vs `20/safeRefW` gap denominator) → EXPLAINED (no fix). Off-screen recovery is a UX tradeoff (flush-right-overlap vs place-left), not a one-liner; the denominator is an arguable proportional-coord consistency call. Tracked for a dedicated `SpecialistScheduleWidget` placement fix + regression test.
- Fixes pushed: 0 (no PR carried an unaddressed comment with an unambiguous, in-scope mechanical fix).
- Reviews posted: 3 (one structured review per PR)
  - #2125: Ready — sticker lock/read-only guards; closes several unguarded z-order/delete/clear-board write paths on locked boards; ~19 regression tests; all 18 threads dispositioned.
  - #2119: Ready — audit journals + `Segmented`→shared `SegmentedControl` extraction (re-exported to preserve import paths) + valid SpecialistSchedule Tailwind fix (arbitrary `border-[min(6px,1.5cqmin)]` class → inline `borderWidth` style). Two adjacent findings deferred.
  - #2098: Ready with minor notes — dev-paul→main integration PR aggregating fixes routed via #2099/#2123/#2125/#2128; all 12 threads dispositioned; deferred read-only-viewer close + matching-quiz builder validation are non-blocking follow-ups.
- Notes:
  - Branch-safety: only #2098 is a `dev-*`→`main` PR (read-only for fixes; dev-paul push exception unused this run since all comments were already addressed via routed sub-PRs). #2125 and #2119 target `dev-paul` from pushable branches. No fix pushes were needed, so nothing was pushed to any PR branch.
  - CI: both #2098 and #2125 report no legacy commit statuses (repo uses GitHub Actions checks); merge-readiness noted as pending Actions green.

## 2026-07-04

- PRs reviewed: 6 of 9 open (structured reviews posted)
  - #2139 — fix(test): CI guard for silently-omitted Vitest suites (head `nightly/build-tooling-2026-07-04`, base `dev-paul`)
  - #2138 — fix(i18n): add missing `plcDashboard.resources` namespace to all locales (head `nightly/admin-config-2026-07-04`, base `dev-paul`)
  - #2137 — fix(state): Ordering partial-credit `isCorrect`/`pointsEarned` consistency (head `nightly/state-data-2026-07-04`, base `dev-paul`)
  - #2136 — fix(dock): gate folder items by permission (head `nightly/dashboard-layout-2026-07-04`, base `dev-paul`)
  - #2135 — fix(widgets): warn on duplicate terms in Matching editor (head `nightly/widgets-2026-07-04`, base `dev-paul`)
  - #2098 — NumberLine Escape-cancel/a11y + AI feature label sync (head `dev-paul`, base `main`)
  - Not separately reviewed: #2134 (engaged via a fix push), #2131 (all threads already resolved/declined), #2132 (mechanical import-path swaps), #2133 (docs-only unifier log) — all low-risk and already carrying automated reviews.
- Comments processed: 14 unresolved threads acted on across 4 PRs — 4 fixed (2 pushes), 10 explained + resolved (already addressed by follow-up commits on their branches). #2098 (12 threads) and #2131 (5 threads) already had author replies on every thread; no new action.
  - #2139: 3 gemini threads → FIXED in 21f08db, replied + resolved.
  - #2134: 1 claude thread → FIXED in 7354f7b, replied + resolved.
  - #2136: 6 claude threads → EXPLAINED + resolved (all addressed by follow-up commits 666fda6/f2b7f21: `shouldShowFolder` guard, `reorderPreservingHidden`, `visibleItems`-based FolderPlus).
  - #2135: 4 threads → EXPLAINED + resolved (dedup now keys on shared `normalizeAnswer`; comment blocks trimmed per CLAUDE.md).
- Fixes pushed: 2
  - #2139 / `nightly/build-tooling-2026-07-04` / 21f08db — adopt native `import.meta.dirname`/`filename` (drop `node:url`), guard missing baseline entry, normalize `isMain` path comparison. Verified: 9/9 script tests, format, functional run.
  - #2134 / `scheduled-tasks` / 7354f7b — trim `GLOBAL_FONT_FAMILY_OPTIONS` block comment to one line (CLAUDE.md one-line rule). Verified: type-check, lint, format clean.
- Reviews posted: 6 (one structured review per reviewed PR)
  - #2139: Ready — real, empirically-reproduced CI gap closed; additive tooling, gitignored artifacts, 9-test coverage.
  - #2138: Ready with minor notes — solid i18n fix (feature was English-only in every language); flagged the ~50-line test-file header comment vs the CLAUDE.md one-line rule.
  - #2137: Ready with minor notes — correct Ordering partial-credit fix; flagged the new 11-line comment block vs the one-line rule.
  - #2136: Ready with minor notes — dock permission gating complete; flagged that the two extracted `folderPermissions.ts` helpers have no dedicated unit test (`reorderPreservingHidden` in particular).
  - #2135: Ready — duplicate-term warning root-caused at entry; dedup shares `normalizeAnswer` with grading.
  - #2098: Ready — dev-paul→main integration PR, all 15 checks green, all 12 threads dispositioned; deferred read-only-close follow-up is non-blocking.
- Notes:
  - Cross-PR pattern: three nightly PRs this run (#2137, #2138, and the pre-fix #2135/#2134) introduced multi-paragraph comment blocks that violate the CLAUDE.md "one short line max" rule. #2135/#2134 were corrected; #2137/#2138 flagged in review. Worth a lint rule if it keeps recurring.
  - Branch-safety: only #2098 targets `main` (from `dev-paul`) — no push made there. All fix pushes went to pushable branches (`nightly/build-tooling-2026-07-04`, `scheduled-tasks`). `main` never touched.
  - CI health: all checks green on every PR inspected (#2098 15/15, #2137 7/7); no failing checks observed. New CI runs will trigger on the two fix pushes.

## 2026-07-05

- PRs reviewed: 9
  - #2150 — fix(rules): shared_boards substitute reads had no expiresAt cutoff (head `nightly/build-tooling-2026-07-05`, base `dev-paul`)
  - #2149 — fix(i18n): replace DE "Board" loanword with "Tafel" (head `nightly/admin-config-2026-07-05`, base `dev-paul`)
  - #2148 — fix(dashboard-layout): stop stale collection id leaking into active-board picker (head `nightly/dashboard-layout-2026-07-05`, base `dev-paul`)
  - #2147 — fix(TimeTool): clamp hold-to-ramp duration to the shared ceiling (head `nightly/widgets-2026-07-05`, base `dev-paul`)
  - #2146 — audit(sunday) + NumberLine markers/jumps admin building defaults (head `scheduled-tasks`, base `dev-paul`)
  - #2145 — docs(routines): nightly unifier run 26 log (head `nightly/unifier-log-2026-07-05`, base `dev-paul`)
  - #2144 — refactor(settings): unify 4 missed canonical labels to SettingsLabel (head `nightly/unify-settings-labels-2026-07-05`, base `dev-paul`)
  - #2142 — refactor(imports): fix plc/resources cross-subdir relative import (head `nightly/unify-import-paths-2026-07-05`, base `dev-paul`)
  - #2141 — Refactor admin modals to use SettingsLabel and improve accessibility (head `dev-paul`, base `main`)
- Comments processed: 15 unresolved threads across 5 PRs — 7 fixed (3 pushes), 8 explained.
  - #2149: 2 gemini threads → FIXED in 972fbf7, replied. (redundant LocaleFile cast removed; Board guard made case-insensitive)
  - #2148: 2 claude threads → 1 FIXED in 1f58777 (beforeEach mock reset), 1 already-addressed on branch head (uses `Dashboard` directly, not `MockBoard`); both replied.
  - #2146: 5 threads → 3 FIXED in 7b4782f (handleAddJump reset, stale add-form reset on building switch, marker+jump label trim ×2 = 3 code changes), 1 outdated audit-log note EXPLAINED (do-not-rewrite guidance honored); all replied.
  - #2150: 1 claude thread → EXPLAINED (legacy-doc dead-zone is a production data-audit decision, not a code change); replied.
  - #2144: 4 threads → EXPLAINED (import/first false positive; mb-1→mb-2 spacing = visual judgment ×2; semantic `<label>` = scope decision); all replied.
  - #2141: 1 open claude thread (of 9; other 8 already author-resolved) → EXPLAINED, not auto-pushed to `dev-paul`→`main` (MatchingOrderingEditor normalization mismatch is a grading-path tradeoff for a human); replied.
- Fixes pushed: 3
  - #2149 / `nightly/admin-config-2026-07-05` / 972fbf7 — drop redundant `LocaleFile` cast + delete unused type; make Board regression guard `/i`. Verified: type-check, lint, 25/25 tests.
  - #2148 / `nightly/dashboard-layout-2026-07-05` / 1f58777 — reset mocks in `beforeEach` to prevent cross-test leakage. Verified: lint, 3/3 tests.
  - #2146 / `scheduled-tasks` / 7b4782f — reset add-jump form, clear stale add-form state on building switch, trim marker/jump labels. Verified: full type-check, lint, 47/47 tests.
- Reviews posted: 9 (one structured review per PR)
  - #2150: Ready with minor notes — security-positive expiry gate; flagged composite-index deploy ordering + legacy-doc audit.
  - #2149: Ready — clean terminology fix with durable regression guard.
  - #2148: Ready — correct nullish-coalescing-over-meaningful-null fix, matches sibling `BoardNavFab`.
  - #2147: Ready — root-cause clamp at persistence layer + UI disable; noted PR body undersells the diff (adds UI guard too).
  - #2146: Ready with minor notes — well-validated admin-config addition; bundles audit journal + feature code.
  - #2145: Ready — docs-only unifier log with self-verified line-count check.
  - #2144: Ready with minor notes — clean label consolidation; flagged semantic `<label>` scope + label spacing for visual review.
  - #2142: Ready — trivial correct import-path convention fix; recommended `no-restricted-imports` follow-up.
  - #2141: Ready with minor notes — integration PR to `main`; crash guards resolved, one open normalization thread flagged for human sign-off.
- Notes:
  - Branch-safety: #2141 targets `main` (from `dev-paul`) — no push made there; its one open thread was explained, not fixed. All 3 fix pushes went to pushable branches (`nightly/admin-config-*`, `nightly/dashboard-layout-*`, `scheduled-tasks`). `main` never touched.
  - Force-push detection: #2148 was force-pushed between review and this run (c31cce7→cc0d025), which already resolved the `MockBoard`→`Dashboard` comment; verified against the branch head rather than the stale review diff.
  - CI health: not separately polled this run; the 3 fix pushes will trigger fresh PR-validation runs on their branches.

## 2026-07-06

- PRs reviewed: 13 open
  - #2154 docs(unifier): run 26 log (D1+D4 shipped, D3 rejected) — nightly/unifier-log-2026-07-06
  - #2153 chore(imports): remaining cross-dir relative imports → @/ — nightly/unify-import-paths-2026-07-06
  - #2152 refactor(ui-unification): RandomGroups empty state → ScaledEmptyState — nightly/unify-empty-states-2026-07-06
  - #2151 docs(nightly): debugger run 24 log — nightly/debugger-log-2026-07-05
  - #2150 fix(rules): shared_boards substitute expiresAt cutoff — nightly/build-tooling-2026-07-05
  - #2149 fix(i18n): DE "Board"→"Tafel" — nightly/admin-config-2026-07-05
  - #2148 fix(dashboard-layout): stale collection id in active-board picker — nightly/dashboard-layout-2026-07-05
  - #2147 fix(TimeTool): clamp hold-to-ramp duration — nightly/widgets-2026-07-05
  - #2146 audit(sunday) + NumberLine markers/jumps admin config — scheduled-tasks
  - #2145 docs(routines): unifier run 26 log — nightly/unifier-log-2026-07-05
  - #2144 refactor(settings): unify 4 missed canonical labels to SettingsLabel — nightly/unify-settings-labels-2026-07-05
  - #2142 refactor(imports): plc/resources cross-subdir import — nightly/unify-import-paths-2026-07-05
  - #2141 Refactor admin modals to SettingsLabel + a11y (dev-paul → main)
- Comments processed: 2 genuinely-unaddressed reviewer threads (both #2146) — 0 fixed, 2 explained. Both flagged a NumberLine marker-color-counter bug that a later commit already fixed (`useState(markers.length)` at Settings.tsx:51 and NumberLineConfigurationPanel.tsx:138); replied on each and noted them outdated. Every other review thread across all 13 PRs already carried an author reply (fixed/deferred/explained) or was marked resolved — no new action required.
- Fixes pushed: 0 — no actionable unaddressed review comment required a code change this run.
- Reviews posted: 13 (one structured review per open PR)
  - #2153 Ready; #2152 Ready; #2142 Ready — clean mechanical refactors.
  - #2147 Ready; #2148 Ready; #2149 Ready — well-tested root-cause fixes.
  - #2150 Ready with minor notes — security-positive expiry gate + regex-spoof hardening; flagged legacy-`expiresAt` doc audit/backfill before the rules deploy.
  - #2146 Ready with minor notes — NumberLine markers/jumps admin building-defaults; the two marker-color-counter threads already resolved in a later commit.
  - #2144 Ready with minor notes — SettingsLabel unification; orphaned-`<label>` a11y + mb-1→mb-2 spacing + scope-extension deferred to a human.
  - #2145 / #2151 / #2154 Ready — docs-only routine logs; flagged the two open run-26 unifier-log PRs (#2145 dated 07-05, #2154 dated 07-06) to avoid overlapping appends.
  - #2141 Ready with minor notes — dev-paul→main rollup; folder-permission crash guards + dup-term logic resolved and tested, two deferred items (grader normalization mismatch, orphaned-label semantics) to decide before merge; CI pending at review time.
- Notes:
  - Branch-safety: no push to `main` or any `dev-*` branch. #2141 (head `dev-paul` → `main`) received a review comment only. The two #2146 comment replies posted via the API; this log commit is the only push, to `scheduled-tasks`.
  - Phase-1 outcome contrast: unlike the prior (07-05) run's 3 fix pushes, every actionable comment this run was already resolved (author replies or later commits), so nothing needed fixing — only two outdated no-reply threads needed a closing reply.

## 2026-07-07

- PRs reviewed: 9 open
  - #2162 fix(i18n): DE plcDashboard "PLC"→"PLG" terminology — nightly/admin-config-2026-07-07
  - #2161 fix(privacy): Random/Stations custom-name fields → PII scrub allowlist — nightly/state-data-2026-07-07
  - #2160 fix(import-wizard): guard stale in-flight promises after close/reopen — nightly/dashboard-layout-2026-07-07
  - #2159 fix(audio): await AudioContext.resume() before cleanup chime — nightly/widgets-2026-07-07
  - #2158 fix(announcements): close multi-tenant leak in no-org listener query — nightly/build-tooling-2026-07-07
  - #2157 docs(skill-freshness): correct WIDGET_SCALING_CONFIG consequence — scheduled-tasks
  - #2156 docs(unifier): run 28 log — nightly/unifier-log-2026-07-07
  - #2155 fix(D4): unify plc import + ESLint no-restricted-imports rule — nightly/unify-import-paths-2026-07-07
  - #2141 Refactor admin modals to SettingsLabel + a11y (dev-paul → main)
- Comments processed: 11 unresolved threads acted on — 5 fixed, 6 explained/deferred. (Every other thread across the 9 PRs already carried an author reply or was resolved.)
  - Fixed (5): #2162 ×1 (case-insensitive PLC guard regex); #2159 ×2 (void playCleanUpUnlocked so confetti isn't blocked on ctx.resume); #2158 ×2 (generic email fixture + LEAK-test rationale comment).
  - Explained/deferred (6): #2161 ×3 — verified `lastResult`/`jigsawHomeGroups`/`jigsawExpertGroups` are real PII with RandomConfig-unique names (collateral-safe to add) but deferred the add to the maintainer because scrubbing `lastResult` changes reload persistence for the cross-widget Scoreboard/Stations integrations (privacy-vs-persistence product call); #2157 ×1 and #2155 ×1 — outdated threads already resolved on branch head; #2141 ×1 — validated the Dock `SortableContext.items` dnd-kit index bug but did not push (head `dev-paul` = read-only).
- Fixes pushed: 3
  - #2162 → nightly/admin-config-2026-07-07 — case-insensitive `/\bPLCs?\b/i` in the DE plcDashboard terminology guard (test 51/51, lint, format).
  - #2159 → nightly/widgets-2026-07-07 — CatalystWidget + StarterPack/Widget handleExecute made synchronous with `void playCleanUpUnlocked()` (type-check, lint, format, audioUtils 2/2).
  - #2158 → nightly/build-tooling-2026-07-07 — announcementsQuery.test.ts: generic `teacher@` fixture + LEAK-test rationale comment (rules suite 4/4 under the emulator, lint, format).
- Reviews posted: 9 (one structured review per open PR)
  - #2158 / #2159 / #2160 / #2162 / #2155 / #2157 / #2156 Ready.
  - #2161 Ready with notes — shipped fields sound; outstanding `lastResult`/`jigsaw*` PII-scope decision flagged before it fully closes the leak.
  - #2141 Needs changes — strong a11y/consistency refactor, but the Dock `SortableContext.items` filtering bug (hidden folder/gated tool ids left in the items array with no rendered node → dnd-kit index skew) should be fixed + tested before merge to main.
- Notes:
  - Branch-safety: no push to `main` or any `dev-*` branch. #2141 (head `dev-paul` → `main`) received review comments only. All fixes went to `nightly/*` branches; this log commit is the only push to `scheduled-tasks`.
  - #2158 fixes were verified against the real Firestore emulator (`firebase emulators:exec --only firestore`), 4/4 announcements-rules tests green.

## 2026-07-08

- PRs reviewed: 13 (all open PRs)
  - #2166 — fix(css-scaling): raise TalkingTool Scaffolding label cap to 10px (head `fix/talkingtool-scaffolding-cap`, base `dev-paul`)
  - #2165 — docs(unifier): run 29 log (head `nightly/unifier-log-2026-07-08`, base `dev-paul`)
  - #2164 — fix(D3): LunchCount SubmitReportModal notes label → SettingsLabel (head `nightly/unify-settings-labels-2026-07-08`, base `dev-paul`)
  - #2163 — docs(nightly): debugger run 25 log (head `nightly/debugger-log-2026-07-07`, base `dev-paul`)
  - #2162 — fix(i18n): DE plcDashboard PLC→PLG (head `nightly/admin-config-2026-07-07`, base `dev-paul`)
  - #2161 — fix(privacy): Random/Stations PII scrub allowlist (head `nightly/state-data-2026-07-07`, base `dev-paul`)
  - #2160 — fix(import-wizard): stale-promise guard (head `nightly/dashboard-layout-2026-07-07`, base `dev-paul`)
  - #2159 — fix(audio): await AudioContext.resume() before chime (head `nightly/widgets-2026-07-07`, base `dev-paul`)
  - #2158 — fix(announcements): multi-tenant no-org listener leak (head `nightly/build-tooling-2026-07-07`, base `dev-paul`)
  - #2157 — docs(skill-freshness): WIDGET_SCALING_CONFIG consequence (head `scheduled-tasks`, base `dev-paul`)
  - #2156 — docs(unifier): run 28 log (head `nightly/unifier-log-2026-07-07`, base `dev-paul`)
  - #2155 — fix(D4): plc import + ESLint rule (head `nightly/unify-import-paths-2026-07-07`, base `dev-paul`)
  - #2141 — Refactor admin modals to SettingsLabel + a11y (head `dev-paul`, base `main`) — dev-paul→main promotion (push only via the sanctioned review-comment-fix path)
- Comments processed: 4 genuinely-unanswered threads actioned — 1 fixed, 3 explained. Every other unresolved thread across the 13 PRs already carried a reply from the prior (2026-07-07) run or was resolved-in-code, so no re-reply.
  - Fixed (1): #2141 — `MatchingAnswerEditor` used a static `duplicate-term-warning` DOM id (+ its `aria-describedby`), which collides if two editors mount at once → replaced with `React.useId()`.
  - Explained (3): #2141 ×2 — (a) `adminBuildingConfig.ts` `.trim()` removal is intentional, documented strictness (`isHexColor` docstring rejects `'#fff '`); legacy-data leniency is a maintainer/data call, not an auto-fix on a main-bound branch. (b) the `useSubstituteShares.ts` "#2150" comment is a valid cross-ref (the merged retry-logic PR), not a typo. #2157 ×1 — the `_Last action` header was already bumped in `09d34c9` (thread outdated).
- Fixes pushed: 1
  - #2141 → `dev-paul` (188cf12) — `React.useId()` for the duplicate-term warning id. Verified: type-check ✓, lint ✓, `MatchingOrderingEditor.duplicateTerm`/`.memo` tests 11/11 ✓, prettier ✓. Sanctioned path: PR #2141 merges `dev-paul`→`main` and carried review comments. Push re-triggered CI — Build ✓ and type-check ✓ at log time, remaining checks in progress.
- Reviews posted: 1
  - #2141 — Ready with minor notes. Consolidated merge-readiness for the only main-bound PR. Flagged (non-blocking, inline): the Dock `SortableContext.items` array is still built from full `dockItems` while hidden folders/gated tools `return null`, so dnd-kit sort indices can skew — a complete fix filters `items` by both `shouldShowFolder` and `canAccessTool`, with a reorder-after-hidden test. Also flagged the one-time `shared_boards`/`expiresAt` live-data check before merge.
  - Refrained from re-reviewing #2155–#2166: each already carries a `gemini-code-assist` review plus prior-run structured reviews with resolved/answered threads; a second automated review this cycle would duplicate rather than add signal (harness frugality guidance).
- Notes:
  - Branch-safety: no push to `main` or any `dev-*` branch except the sanctioned `dev-paul` review-comment-fix path (#2141). This log commit is the only push to `scheduled-tasks`.
  - This run followed the 2026-07-07 run, which had already replied to / resolved the bulk of the open threads — so today's actionable surface was small (4 unanswered threads, 1 real fix).
  - Env runs Node 22 (repo pins 24); local type-check/lint/tests green. CI on Node 24 remains the authoritative gate.

## 2026-07-09

- PRs reviewed: 5 open PRs (all authored by OPS-PIvers, all base `dev-paul`)
  - #2171 — audit(scheduled-tasks): Thursday journals + skill fix (head `scheduled-tasks`, base `dev-paul`)
  - #2170 — docs(unifier): runs 29+30 memory log (head `nightly/unifier-log-2026-07-09`, base `dev-paul`)
  - #2169 — fix(D4): Organization/views imports → `@/` alias (head `nightly/unify-import-paths-2026-07-09`, base `dev-paul`)
  - #2168 — fix(D3): SettingsLabel group-heading retrofit (head `nightly/unify-settings-labels-2026-07-09`, base `dev-paul`)
  - #2167 — fix(D1): ExpectationsWidget empty state → ScaledEmptyState (head `nightly/unify-empty-states-2026-07-09`, base `dev-paul`)
- Comments processed: 2 unresolved threads (both on #2167, contradictory) — 1 fixed, 1 explained.
  - Fixed (1): #2167 — the committed `ScaledEmptyState` had color overrides (`titleClassName="text-slate-800"`, `iconClassName`/`subtitleClassName="text-slate-500"`) that render near-invisible on the transparent widget surface over the slate-900 dashboard and violate CLAUDE.md's muted-text-on-dark guidance. Dropped all three overrides so the component's dark-surface defaults (`text-slate-200`/`text-slate-300`) apply. Agreed with the `claude` reviewer thread over the contradictory `gemini-code-assist` thread.
  - Explained (1): #2167 — the `gemini-code-assist` thread asked for the opposite (darker overrides for a "light-themed widget"). Explained it's based on a false premise: the empty-state code path renders on a transparent `WidgetLayout` (no card) over the dashboard, not on the widget's white `bg-white` category cards (which only appear in the main view). No fix in that direction.
- Fixes pushed: 1
  - #2167 → `nightly/unify-empty-states-2026-07-09` (44816fe) — drop ScaledEmptyState color overrides. Verified: type-check ✓, lint ✓ (eslint --max-warnings 0 on the file), prettier ✓.
- Reviews posted: 5 (one structured review per open PR)
  - #2167 — Ready. Empty-state unification, container-scaling boundary preserved, review contrast concern resolved.
  - #2168 — Ready. Visual-neutral `SettingsLabel as="span"` + `role="group"`/`aria-labelledby` a11y fix; `SettingsLabel` confirmed to support the `as`/`id` props used.
  - #2169 — Ready. Pure `@/`-alias import-path equivalence swap across 8 Organization/views files.
  - #2170 — Ready with minor notes. Docs-only unifier log reconstruction; flagged a human sanity-check for residual duplicate rows.
  - #2171 — Ready. Docs/skill-only; skill-doc SpecialistSchedule correction matches real codebase layout. Non-blocking nit: `.claude/` mirror blockquote continuation line missing its `>` marker (renders fine via lazy continuation).
- Notes:
  - Branch-safety: no push to `main` or any `dev-*` branch. The only code push was to the non-protected feature branch `nightly/unify-empty-states-2026-07-09` (#2167). This log commit is the only push to `scheduled-tasks`.
  - #2167 carried two directly-contradictory reviewer threads; resolved by reading ground truth (`WidgetLayout` provides no background; `ScaledEmptyState` defaults are `text-slate-200`/`300`) rather than either reviewer's assertion.
  - Env runs Node 22 (repo pins 24); local type-check/lint/prettier green. CI on Node 24 remains the authoritative gate.

## 2026-07-10

- PRs reviewed: 2 open PRs (both authored by OPS-PIvers)
  - #2173 — docs(ai): document generateGuidedLearning admin-only + no-rate-limit design intent (head `scheduled-tasks`, base `dev-paul`, draft)
  - #2172 — Audit updates: fix skill freshness, unify import paths, and CSS adjustments (head `dev-paul`, base `main`)
- Comments processed: 6 total across both PRs — 0 fixed, 6 already-resolved/explained.
  - #2173 thread 1 (`docs/scheduled-tasks/ai-integration.md`) — reviewer flagged internal agent-scheduling triage reasoning in a completed audit entry. Already resolved by follow-up commit `9b64964` ("trim item-selection triage noise") before this run; the flagged "no HIGH anywhere… daily-before-weekly tiebreak" text is gone. Replied to close the loop. No new fix needed.
  - #2173 thread 2 (`functions/src/aiGeneration.ts:2087`) — reviewer nit claiming the `isExternalCaller` cross-reference points at a function with no docblock. Independently verified FALSE: `isExternalCaller` (line 179) has a JSDoc at lines 161–178 whose closing lines document the admin-exempt short-circuit. Owner already rebutted correctly at top-level. No change.
  - #2172 — all 4 review threads already carry owner replies (1 resolved: the ExpectationsWidget D1-E16 revert; 3 explained: TalkingTool `text-slate-400` on white card is correct, and two SKILL.md blockquote `>`-marker nits that are valid CommonMark lazy continuations / Prettier-canonical). Nothing outstanding.
- Fixes pushed: 0 (no branch required a code change this run — every actionable item was already resolved by a prior commit or reply).
- Reviews posted: 0 new structured reviews. Both PRs already carry two full verified `claude[bot]` reviews each plus Gemini/Copilot reviews, with all threads addressed; a third automated review would duplicate rather than add signal (harness frugality guidance). Independent re-verification of both diffs surfaced no new issues.
- Notes:
  - Branch-safety: no push to `main` or any `dev-*` branch. #2172 merges `dev-paul`→`main` and needed no fix (all comments already addressed), so the sanctioned `dev-paul` fix path went unused. This log commit is the only push to `scheduled-tasks`.
  - #2173 CI status: pending/none reported (draft PR).
  - Env runs Node 22 (repo pins 24); CI on Node 24 remains the authoritative gate.

## 2026-07-11

- PRs reviewed: 3 open PRs (all authored by OPS-PIvers, all draft, all base `dev-paul`)
  - #2176 — fix(css-scaling): scale QuizResults period-filter select with cqmin (head `scheduled-tasks`)
  - #2175 — docs(unifier): log nightly run 31 — 2026-07-11 (head `nightly/unifier-log-2026-07-11`)
  - #2174 — D4: use @/ alias for i18n locale imports (head `nightly/unify-import-paths-2026-07-11`)
- Comments processed: 0 change-requesting review comments. No inline review threads on any PR. Existing reviews were all non-actionable: `gemini-code-assist[bot]` "no feedback" summaries (+ its own sunsetting notice) on all three, and `claude[bot]` LGTM reviews on #2176 and #2174. No replies posted — none were questions or change requests, and harness guidance is to be frugal with GitHub replies.
- Fixes pushed: 0 (no PR carried an unresolved comment requiring a code fix).
- Reviews posted: 3 structured reviews (one per PR) — all **Ready**.
  - #2176 — Ready. Verified the fix against ground truth: QuizWidget has `skipScaling: true`; the wrapping `<div>` (`padding: min(8px,2cqmin) min(16px,4cqmin)`/`gap`) and sibling `<label>` (`fontSize: min(10px,3cqmin)`) were already scaled, so the `<select>` was genuinely the lone hardcoded outlier. `min(14px, 5.5cqmin)` is the correct body/form tier per CLAUDE.md. WON'T FIX on the ClockWidget hero cap is sound (jsdom `cssstyle` drops `min()`/`clamp()`, defeating the cqmin regression test; bare `cqmin` hero text is CLAUDE.md-endorsed).
  - #2175 — Ready. Doc-only unifier run-31 log; backlog-row hygiene fix (4 NEEDS REVIEW → CLOSED D1-E19–E22) correctly reconciles backlog vs exceptions tables. Zero code risk.
  - #2174 — Ready. Pure mechanical `@/` alias equivalence for 4 i18n locale imports; `@/` resolves to repo root in both `vite.config.ts` and `tsconfig.json`, same resolved modules.
- Notes:
  - Branch-safety: no push to `main` or any `dev-*` branch. No PR merged `dev-paul`→`main` this run, so the sanctioned `dev-paul` fix path went unused. This log commit is the only push to `scheduled-tasks`.
  - Env runs Node 22 (repo pins 24); CI on Node 24 remains the authoritative gate.

## 2026-07-12

- PRs reviewed: 12 open PRs (all authored by OPS-PIvers, all draft, all base `dev-paul`; heads are `nightly/*` or `scheduled-tasks`, none `main`/`dev-*` → all in-scope)
  - #2185 — docs(unifier): log nightly run 32 (head `nightly/unifier-log-2026-07-12`)
  - #2184 — D4: use @/ alias for MathToolInstance's math-tools imports (head `nightly/unify-import-paths-2026-07-12`)
  - #2183 — D3: retrofit DrawingWidget "Color Presets" label to as="span" group heading (head `nightly/unify-settings-labels-2026-07-12`)
  - #2182 — docs(ai): nightly debugger run 26 (head `nightly/debugger-log-2026-07-11`)
  - #2181 — test(useRosters): fix PII-migration test race (head `nightly/build-tooling-2026-07-11`)
  - #2180 — fix(i18n): FR plcDashboard PLC→CAP terminology drift (7 keys) (head `nightly/admin-config-2026-07-11`)
  - #2179 — fix(useSyncedQuizGroups): dedupe syncGroupIds to prevent loading hang (head `nightly/state-data-2026-07-11`)
  - #2178 — fix(ImportWizard): guard 2 remaining async handlers (head `nightly/dashboard-layout-2026-07-11`)
  - #2177 — fix(TalkingToolWidget): resync active tab on live category change (head `nightly/widgets-2026-07-11`)
  - #2176 — scheduled-tasks: WorkSymbols admin building config + QuizResults period-filter scaling (head `scheduled-tasks`)
  - #2175 — docs(unifier): log nightly run 31 (head `nightly/unifier-log-2026-07-11`)
  - #2174 — D4: use @/ alias for i18n locale imports (head `nightly/unify-import-paths-2026-07-11`)
- Comments processed: 2 unresolved inline threads actioned — 0 fixed (no push needed), 2 explained + resolved. Every other PR's inline threads were already resolved / already carried author replies.
  - #2183: 2 unresolved-but-`is_outdated` `claude` threads asking to scope the "Color Presets" `id`/`aria-labelledby` per widget instance (duplicate-DOM-id when two drawing widgets are flipped simultaneously). Verified the fix is ALREADY on the branch — both are `` `drawing-color-presets-label-${widget.id}` ``. Replied once confirming and resolved both threads. No push.
  - All other PRs (#2185/#2184/#2182/#2181/#2180/#2179/#2178/#2177/#2176/#2175/#2174): no open actionable review threads (resolved-in-code, prior author replies, or gemini/claude non-actionable summaries).
- Fixes pushed: 0 (no PR carried an unresolved comment requiring a code fix; the one candidate on #2183 was already fixed in-branch).
- Reviews posted: 12 structured reviews (one per PR).
  - #2185 — Ready with minor notes. Doc-only run-32 log, stacked on the still-open #2175; flagged the merge-order dependency (merge #2175 first, or close it) to avoid the doc-duplication failure mode.
  - #2184 — Ready. Mechanical `@/` alias unification (12 imports) + matching narrowly-scoped `no-restricted-imports` rule mirroring the `plc/**` pattern.
  - #2183 — Ready. Accessibility-only `as="span"` group-heading retrofit; per-instance id scoping correctly handles the per-widget `DraggableWindow` render (the key detail).
  - #2182 — Ready. Doc-only debugger run-26 log; backlog cross-references shipped PRs correctly.
  - #2181 — Ready. Test-only race fix; polls the real downstream write instead of the `uploadFile` proxy, 0ms macrotask-deferred mock. Production code untouched.
  - #2180 — Ready. FR `plcDashboard` PLC→CAP fix (7 keys incl. a gender-agreement fix) + recursive-sweep regression test.
  - #2179 — Ready. One-line dedup fix bringing `useSyncedQuizGroups` in lockstep with its already-fixed VA sibling; removes a latent loading-hang + redundant listener.
  - #2178 — Ready. Completes `sessionRef` cancellation-guard coverage for the last 2 ImportWizard handlers, incl. stale-blank-tab cleanup; 3 new tests.
  - #2177 — Ready. Render-time `activeTab` resync (repo-sanctioned "adjust state while rendering") + `aria-pressed` a11y bonus; regression test asserts both highlight and ARIA state.
  - #2176 — Ready with minor notes. WorkSymbols per-building appearance defaults (validated `getAdminBuildingConfig` case + panel embedded in the dedicated modal) and QuizResults `<select>` cqmin scaling; two independent low-risk fixes, 4 new validation tests. `types.ts` change is purely additive (no `WidgetConfig`/`ConfigForWidget` impact); no `DashboardContext`/`WidgetRegistry` touch.
  - #2175 — Ready. Doc-only run-31 log; closes 4 stale D1 NEEDS-REVIEW backlog rows.
  - #2174 — Ready. Mechanical `@/` alias for 4 i18n locale imports.
- Notes:
  - Branch-safety: no push to `main` or any `dev-*` branch. No PR merged `dev-paul`→`main` this run, so the sanctioned `dev-paul` fix path went unused. This log commit is the only push to `scheduled-tasks`.
  - Merge-order flag: #2185 (run-32 log) is stacked on #2175 (run-31 log); both edit `docs/routines/unifier.md`. Merge #2175 first (then #2185 shrinks to the run-32 delta), or land only one — surfaced in both reviews.
  - No code fixes were pushed, so no local verification was required. All code PRs claim `pnpm run validate` + `build` green; CI on Node 24 remains the authoritative gate (env runs Node 22, repo pins 24).

## 2026-07-13

- PRs reviewed: 10 open PRs (all authored by OPS-PIvers, all draft). #2186 base `main` (head `dev-paul`, the promotion PR); all others base `dev-paul` with `nightly/*`, `scheduled-tasks`, or `fix/*` heads. No PR has a `main`/`dev-*` head requiring push, so all are in-scope for review; per branch-safety, `dev-paul` (head of #2186) and `main` remain push-read-only except the sanctioned review-comment-fix path on the promotion PR.
  - #2195 — docs(debugger): log nightly run 27 (head `nightly/debugger-log-2026-07-13`)
  - #2194 — fix(test:counts): extend silent-test-drop guard to the Firestore rules suite (head `nightly/build-tooling-2026-07-13`)
  - #2193 — fix(i18n): DE sidebar.nav.plcs + plc.errors PLC→PLG drift (head `nightly/admin-config-2026-07-13`)
  - #2192 — fix(useResultsTabWarnings): don't zero pending-write tally on a partial snapshot (head `nightly/state-data-2026-07-13`)
  - #2191 — fix(FolderSidebar): "All items" badge undercounts when items are filed into folders (head `nightly/dashboard-layout-2026-07-13`)
  - #2190 — fix(VideoActivityWidget): dedup per-question answers in Results teacher stats (head `nightly/widgets-2026-07-13`)
  - #2189 — fix: Prettier formatting drift in docs/routines/unifier.md (head `nightly/baseline-fix-2026-07-13`)
  - #2188 — audit + test-coverage action: Monday (journals + quizAudio tests) (head `scheduled-tasks`)
  - #2187 — fix(unifier): dedupe docs/routines/unifier.md after merge-commit corruption (head `fix/unifier-doc-dedup-2026-07-12`)
  - #2186 — Document admin-only design intent for generateGuidedLearning / WorkSymbols config + a11y + fixes (head `dev-paul`, base `main`) — dev-paul→main promotion
- Comments processed: 7 unresolved inline threads actioned — 0 fixed (no push needed), 7 explained. Every actionable suggestion was already implemented in-branch or was incorrect/not-applicable when verified against the current file state.
  - #2194: 2 threads. Gemini(high) "pass `rules` arg" + Claude "test description vs `main()` behavior" — BOTH already resolved on the branch (`test:rules` passes `rules`; `selectTargets` throws on unknown label + test/description corrected with a `claude[bot]` credit). Replied, no push.
  - #2192: 1 thread. Gemini(med) "remove redundant `Promise.resolve()` in `act()`" — DECLINED: the thenable return puts `act` in async mode so each hide/return cycle's effect flushes before the next, which is load-bearing for the in-flight-write race this test pins (corroborated by #2195's own run notes). Replied, no push.
  - #2190: 1 thread. Gemini(med) lookup-optimization — already fully implemented in the current file (single-loop accuracy, `Map`-based count). Replied, no push.
  - #2188: 2 threads. Claude `toBe(2)` — already applied. Gemini css-scaling.md line refs (`:989/:1069`) — verified INCORRECT against the branch; the doc's existing `:983/:1061` matches `PageEditorOverlay.tsx` exactly (confirmed via `git show`). Replied to both, no push.
  - #2186: 5 threads, 4 already carried author replies (WorkSymbols `global` sentinel refutation, empty-`selectedBuildingId` guard, label `htmlFor`/`id` a11y, unifier.md dedup via #2187). The 1 unanswered Claude thread (TalkingTool `aria-pressed` → `role="tab"`) EXPLAINED as a non-blocking a11y follow-up. Replied.
  - #2195/#2193/#2191/#2189/#2187: no open review threads.
- Fixes pushed: 0 (no PR carried an unresolved comment requiring a code fix; every candidate was already resolved in-branch or non-actionable).
- Reviews posted: 10 structured reviews (one per PR).
  - #2195 — Ready with minor notes. Doc-only run-27 log; flagged `unifier.md` merge-order coordination with #2189/#2187.
  - #2194 — Ready. Extends the test-count guard to the rules suite; `optional: true` correctly keeps `validate`/`test:all` green while still failing loud on missing required reports. 4 new unit tests.
  - #2193 — Ready. DE PLC→PLG terminology fix (11 keys) with a correctly-scoped (`plc.errors` + `sidebar.nav.plcs`) recursive-scan test.
  - #2192 — Ready. Snapshot-reconciliation race fix on the anti-cheating lockout path; reduces pending tally only by the confirmed delta. Regression test verified fail-before/pass-after.
  - #2191 — Ready. Sums all `itemCounts` buckets for the "All items" badge (was root-only); GL undercount limitation correctly logged as backlog. 3-case test.
  - #2190 — Ready. First-occurrence dedup extracted to a tested pure module, matching the codebase's established dedup-fence pattern. 7-case test.
  - #2189 — Ready. Formatting-only baseline unblock; land before sibling nightly PRs.
  - #2188 — Ready. Monday audit journals + new `quizAudio.test.ts` (13 tests); no production code.
  - #2187 — Ready. Restores `unifier.md` after a merge-artifact duplication; suggested a lightweight duplicate-header/row-count CI guard as follow-up given this is the 3rd occurrence.
  - #2186 — Ready with minor notes. Promotion PR bundling a feature + 3 fixes + a refactor; all threads addressed. Suggested a focused test for the new `WorkSymbolsConfigurationPanel` and preferring narrower integration PRs. `types.ts`/admin changes checked: additive config, correct admin-level placement, no new Firestore collection (so no `firestore.rules` change needed).
- Notes:
  - Branch-safety: no push to `main` or any `dev-*` branch. This log commit is the only push to `scheduled-tasks` (which also rides into open PR #2188).
  - Merge-order flag: #2189, #2195, and #2187 all touch `docs/routines/unifier.md`. Sequence deliberately (or land one) to avoid the recurring doc-merge concatenation artifact #2187 was created to repair.
  - Recurring failure class: `unifier.md` has now hit merge-corruption 3× — a small CI check (duplicate `Run count:` header / Run Log row-count floor) would catch it mechanically; surfaced in #2187's review.
  - No code fixes were pushed, so no local verification was required. All code PRs claim `pnpm run validate` + `build` green; CI on Node 24 remains the authoritative gate (this env runs Node 22, repo pins 24).

## 2026-07-16

- PRs reviewed: 5 open PRs (all authored by OPS-PIvers, all draft except #2217).
  - #2221 — audit(thursday) + fix(deps): journals + `flatted` DoS/proto-pollution override (head `scheduled-tasks`, base `dev-paul`)
  - #2220 — docs(unifier): log nightly run 35 (head `nightly/unifier-log-2026-07-16`, base `dev-paul`)
  - #2219 — Unify ActivityWall library empty state onto ScaledEmptyState (head `nightly/unify-empty-states-2026-07-16`, base `dev-paul`)
  - #2218 — Retrofit MusicWidget "Layout" label to group-heading SettingsLabel (head `nightly/unify-settings-labels-2026-07-16`, base `dev-paul`)
  - #2217 — Audit results and fixes for widget registry, linting, and i18n (head `dev-paul`, base `main`) — dev-paul→main promotion
- Comments processed: 3 unresolved inline threads on #2217 (gemini-code-assist) — 1 fixed + pushed, 2 explained (no fix). All other PRs (#2221/#2220/#2219/#2218) had zero review threads.
  - #2217 quiz path (`TeacherDiscoveryRoute.tsx:418`): gemini(med) optional-chaining guard on `quizData.questions`. VALID — `loadQuizData` returns the raw Drive JSON blob with no normalizer, so a malformed/legacy file can yield undefined `questions` → `quizMaxPoints(undefined)` throws. Fixed with `quizData?.questions ? quizMaxPoints(quizData.questions) : 100` (100 matches the helper's own empty-set denominator). Pushed to `dev-paul` (d44cef9); verified type-check ✓ lint ✓ format ✓ + `TeacherDiscoveryRoute.test.tsx` (2 tests) ✓. Replied + this is the sanctioned dev-paul review-comment-fix path.
  - #2217 VA path (`:561`): gemini(med) same guard for `activityData.questions`. DECLINED — `loadActivityData` normalizes via `normalizeVideoActivityQuestions(raw.questions)` = `(qs ?? []).map(...)`, guaranteeing a defined array; the guard would be dead code. Replied.
  - #2217 GuidedLearning (`GuidedLearningManager.tsx:449`): gemini(med) `buildingSets && buildingSets.length` guard. DECLINED — `buildingSets` is a required non-optional prop already dereferenced unguarded via `.map()` at lines 304/456; the guard would be redundant and locally inconsistent. Replied.
- Fixes pushed: 1
  - #2217 / `dev-paul` (d44cef9) — guard quiz-attach `maxPoints` against unvalidated Drive JSON (`quizData?.questions ? … : 100`).
- Reviews posted: 5 structured reviews (one per PR).
  - #2221 — Ready. Dev-only `flatted` override (^3.4.2) closing 2 advisories via the eslint chain; minimal lockfile diff. Flagged the newly-logged `pnpm audit` HTTP 410 (CVE scanning currently blind) as a maintainer follow-up (Dependabot/osv-scanner).
  - #2220 — Ready. Docs-only unifier run-35 log; large add/del count is expected in-place log rewrite churn.
  - #2219 — Ready with minor notes. ScaledEmptyState conversion with a correctly-scoped `container-type: size` boundary on the empty-state arm only; two intentional canonical deltas (uppercase/tracked title, cqmin constants). Per the PR's own visual-risk tag, recommended a one-glance preview check.
  - #2218 — Ready. Mechanical `as="span"` group-heading a11y retrofit; per-instance `${widget.id}` id scoping correct for per-widget render.
  - #2217 — Ready with minor notes. dev-paul→main rollup; the one actionable reviewer comment resolved. `types.ts` change is a pure widening (`RevealGridConfig.fontFamily` → `string`), no `WidgetType`/registry impact. `firestore.rules` moderation-bypass fix is sound and tested; noted the added second `get()` on the session doc (well under the per-request access-call limit).
- Notes:
  - Branch-safety: no push to `main` or any `dev-*` head EXCEPT the sanctioned path — #2217 merges `dev-paul`→`main` and carried unresolved review comments, so the one code fix was pushed to `dev-paul` per the standing rule. No other `dev-*`/`main` push.
  - Verification env runs Node 22 (repo pins 24, "Unsupported engine" warning); type-check/lint/format/tests all still ran green locally. CI on Node 24 remains the authoritative gate.
  - This review-log commit is on the designated `claude/compassionate-shannon-ijvfgq` branch (where prior runs' pr-review-log.md already lives), not `scheduled-tasks` — avoids polluting the unrelated open PR #2221 and honors the branch-safety directive.

## 2026-07-18

- PRs reviewed: 6 open PRs (all authored by OPS-PIvers).
  - #2231 — docs(debugger): log nightly run 29 (head `nightly/debugger-log-2026-07-18`, base `dev-paul`)
  - #2230 — fix(gcPlcOrphans): paginate PLC/synced-group sweeps past the first page (head `nightly/build-tooling-2026-07-18`, base `dev-paul`)
  - #2229 — fix(i18n): ES `sidebar.nav.plcs` + `plc.errors` PLC→Comunidad (head `nightly/admin-config-2026-07-18`, base `dev-paul`)
  - #2228 — fix(FolderTree): dismiss the folder overflow menu on outside click/Escape (head `nightly/dashboard-layout-2026-07-18`, base `dev-paul`)
  - #2227 — fix(Countdown): parse bare-date startDate/eventDate as local noon (head `nightly/widgets-2026-07-18`, base `dev-paul`)
  - #2226 — audit(friday): daily/weekly journals (head `scheduled-tasks`, base `dev-paul`)
- Comments processed: 2 total — 0 fixed (both already self-resolved on-branch), 2 replied to close the loop. The 14 threads on #2226 were left to the concurrent session actively iterating that branch (see notes).
  - #2227 (`Countdown/Widget.test.tsx`): claude[bot] flagged the mid-process `process.env.TZ` override as a possible false-positive regression guard. ALREADY ADDRESSED on-branch in commit `759fa9d` — `parseConfigDate` was extracted to `components/widgets/Countdown/utils.ts` and now has a pure, timezone-independent unit test (`new Date(y,m,d,12).getHours() === 12`), exactly the reviewer's preferred fix; the integration test switched to `vi.stubEnv('TZ', …)`. Replied confirming; no code change needed.
  - #2230 (`functions/src/gcPlcOrphans.ts`): claude[bot] flagged a missing `MAX_GROUPS_PER_RUN` ceiling warning in the two group loops (asymmetry with the PLC loop). ALREADY ADDRESSED on-branch in commit `a4bbc1b` — both group loops now `console.warn` on hitting the ceiling (lines 275–277, 404–406). Replied confirming; no code change needed.
  - #2226: 14 inline threads (claude[bot] + gemini-code-assist) on an actively-iterated BuildingSelector-unification branch. Most are `is_outdated` with existing "already applied" author replies; the live ones concern roving-tabindex/aria edge cases that the concurrent session was still committing to as of 05:40 today. Left untouched to avoid colliding with in-flight work; no fresh automated review posted there (would duplicate the existing review load).
- Fixes pushed: 0 — both actionable review comments were already resolved by later commits on their own branches before this run; nothing required a new push.
- Reviews posted: 5 structured reviews (one each on #2227, #2228, #2229, #2230, #2231; #2226 skipped — already under active multi-reviewer iteration).
  - #2227 — Ready. Contained bare-date parsing fix via a shared `parseConfigDate` helper at all 4 call sites; full-ISO values still fall through unchanged. Pure + integration regression coverage; the one review comment is resolved.
  - #2228 — Ready. Outside-click + Escape dismissal on `FolderRow`'s overflow menu, reusing the established `useClickOutside` + `isEscapeFromWidgetInput` pattern from `SidebarPlcs.PlcRow`. Live surface (Quiz/VA/GL/MiniApp managers); both dismissal paths tested.
  - #2229 — Ready. Pure ES locale terminology swap (PLC→Comunidad) across `sidebar.nav.plcs` + 10 `plc.errors` keys, with a scoped recursive regression test that avoids the intentionally-untranslated `admin.plc.recovery` namespace. FR/`plcRoute`/`plcDirectory` siblings correctly deferred to backlog.
  - #2230 — Ready. Cursor-based pagination on all 3 `gcPlcOrphans` scans fixes a real silent starvation bug (any doc past the first page was never swept); mirrors the validated `plcWeeklyDigest` pattern, ceiling warnings added, page-crossing regression tests included.
  - #2231 — Ready. Docs-only debugger run-29 log; backlog checkoffs cross-reference their fixing PRs (#1976, #2211), and the two notes captured from the #2227/#2230 claude[bot] reviews are reusable lessons.
- Notes:
  - Branch-safety: no push to `main` or any `dev-*` branch. No code fixes were pushed at all this run (both review comments were already resolved on-branch). This review-log commit is on the designated `claude/compassionate-shannon-mdzg3t` branch — matching the prior-run precedent of keeping the log off `scheduled-tasks` (which is the head of the actively-iterated open PR #2226) to avoid polluting an unrelated PR and honor the branch-safety directive. The designated branch was rebuilt from the latest `origin/dev-paul` (it previously carried only already-merged dev-paul→main merge commits) so the log PR is a clean single-file diff.
  - Verification env runs Node 22 (repo pins 24, "Unsupported engine" warning). No fixes pushed, so no local verification was required; all 4 code PRs claim `pnpm run validate` + `build` green, and CI on Node 24 remains the authoritative gate.
