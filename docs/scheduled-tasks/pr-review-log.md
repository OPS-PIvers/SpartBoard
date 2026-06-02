# PR Review Log

_Automated nightly review by claude-opus-4-6_

---

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
