# SpartBoard — Remaining To-Dos Audit

**Generated:** 2026-06-23 · **Code-verified:** 2026-06-23 (every engineering item re-checked against current code + `git log`).

> ## ⚠️ Correction notice — read this
>
> The first pass of this audit cross-referenced planning docs but, for many items, trusted those docs' own checklists/status instead of the code. A full code+git verification found **~16 of ~38 engineering items were wrong or overstated** — most of that work had **already shipped** without the plan docs being updated. This file now reflects **verified** state:
>
> - **9 items were already shipped** and are moved to [§5](#5-verified-already-shipped) with commit evidence.
> - **7 items were overstated** and are narrowed to their real remaining slice.
> - Items below **without** a "shipped" citation were confirmed STILL-OPEN by reading current code.
>
> Lesson baked into the nightly `audit-burndown` routine: confirm an item is actually open against code before doing any work.

**Legend:** **S** <½ day · **M** ½–2 days · **L** multi-day / wide-blast-radius. 🔒 security/data-isolation · 👤 Paul-owned ops · ⛔ blocked.

**Totals (verified):** ~22 genuinely-open items below · **9 found already-shipped** (removed) · **7 narrowed** · **35 completed docs deleted** (24 first pass + 11 verified-complete plans).

---

## 0. Quick wins (high payoff ÷ low effort)

| #   | Item                                                                                                                                                                                             | Source                                                    | Impact | Cx  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | :----: | :-: |
| Q1  | **Graduate `org-admin-writes` flag** beta → admin after QA. Still beta (only paul.ivers); others get "coming soon". Script `scripts/graduate-org-admin-writes-flag.js` exists but was never run. | `components/admin/Organization/OrganizationPanel.tsx:321` |  High  |  S  |
| Q2  | 🔒 **Scope the announcements query by `orgId`** before a 2nd org goes live — query at `:399` is still `where('isActive','==',true)` only (org filter is client-side).                            | `components/announcements/AnnouncementOverlay.tsx:391`    |  High  |  S  |
| Q3  | **Org-wiring Phase 4 close-out** — tasks J (manual QA, 16-step checklist) and K (graduate flag) both still unchecked. Pairs with Q1.                                                             | `docs/organization_wiring_implementation.md`              |  High  |  S  |

## 1. High impact

### 1a. Launch gates / operations (👤 Paul-owned)

| #   | Item                                                                                                                                                                                                                                                                                          | Source                                             | Cx  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | :-: |
| L1  | 👤 **Widen Classroom-assign beyond admins (narrowed)** — `CLASSROOM_ASSIGN_ENABLED` is already `true`; `CLASSROOM_ASSIGN_ADMIN_ONLY=true` limits it to admins (staged Spike A). To reach all teachers, flip `ADMIN_ONLY=false` once the restricted scope is confirmed Trusted under External. | `config/constants.ts:32,43`                        |  S  |
| L2  | 👤🔒 **Announcements backfill + listener scope** — `scripts/migrateAnnouncements.js` exists but hasn't run against prod, and the listener (Q2) isn't scoped yet. Run before a 2nd org posts.                                                                                                  | `docs/external-availability-journal.md`            |  S  |
| L3  | 👤 **OAuth consent finalization** — logo upload + sensitive-scope verification. ⛔ Blocked: `*.web.app` can't satisfy OAuth branding verification; a custom domain is required first.                                                                                                         | `docs/external-availability-oauth-runbook.md` §2–3 |  M  |
| L4  | 👤 **Legal / operator-model sign-off** — district counsel approves the free-tier operator model (copy already finalized).                                                                                                                                                                     | `docs/external-availability-legal-review.md`       |  M  |
| L5  | 👤 **Classroom Add-On Phase 0B** — Workspace Admin Console install + Marketplace Store Listing + live launch test (Phase 0A gcloud work done).                                                                                                                                                | `docs/classroom-addon-gcp-state.md`                |  M  |

### 1b. Product / engineering

| #   | Item                                                                                                                                                                                                                                                                                        | Source                                                                                 | Cx  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | :-: |
| H1  | **Real Monitor & Results redesign** for Quiz/VA — verified still the reskin (PR #1971); no commits to the 4 monitor/results files after 2026-06-14, no QR/hero-panel/presence-board/question-spotlight in code. Rethink IA, don't reskin again. Build on `components/common/sessionViews/`. | `docs/monitor-results-redesign-handoff.md`                                             |  L  |
| H2  | **Rostered sign-in join links** — `ActivityWall/Widget.tsx:1804` TODO confirmed present; only anonymous PIN-join exists in all 4 student widgets. Unblocks gating `anonymous-join` for external in-class sharing.                                                                           | `docs/wide-distro-plan.md` Phase 3b; `components/widgets/ActivityWall/Widget.tsx:1804` |  L  |

## 2. Medium impact

| #   | Item                                                                                                                                                                                                                                                                   | Source                                                          | Cx  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | :-: |
| M1  | **Inactive-user full sign-in lockout** — "Inactive" only revokes admin access (deletes `/admins/{email}`); AuthContext/rules don't gate on `member.status`. Verified open (Phase 4.1).                                                                                 | `components/admin/Organization/views/UsersView.tsx:98`          |  M  |
| M2  | **F6 (narrowed)** — the single-building `manages()` alias fix shipped (#1994); the building-admin **member-`buildingIds` list-vs-list** overlap check still isn't alias-aware (CEL has no `.map()`; false-denial only).                                                | `firestore.rules:389-399`                                       |  M  |
| M4  | **User-mgmt bulk actions** — the 3 bulk-toolbar buttons (Resend invite / Change role / Move to building) are still `disabled` "coming soon". (Per-row Resend invite/Deactivate are already wired.)                                                                     | `components/admin/Organization/views/UsersView.tsx:385,394,403` |  M  |
| M5  | **Finish `/subs` Collections** — Collection board view still a stub (`SubsApp.tsx:34,122`), board buttons disabled "coming soon" (`SubCollectionsList.tsx:114`), Drive grants not implemented for Collection shares (`useSharedCollection.ts:273`). All verified open. | `components/subs/SubsApp.tsx:34,122`                            |  M  |
| M6  | **Quiz edit modal + `rosterIds[]` (narrowed)** — `AssignClassPicker` shipped and used everywhere **except** `QuizAssignmentSettingsModal` (still an inline `periodNames` checkbox list); assignments still store `periodNames[]` not `rosterIds[]`.                    | `docs/quiz-class-picker-followups.md`                           |  M  |
| M12 | **Written-response Phase 3 (rubrics)** — verified spec-only: forward-compat type stubs exist (`WrittenAnswerRubricScore`), but no `Rubric` types, builder UI, `/rubrics` collection, CSV, or PLC sharing.                                                              | `docs/written-response-quiz-questions.md`                       |  L  |
| M13 | **Student-landing overhaul** — verified NOT-STARTED (all 9 phases): no `teacherDirectory` CF, no `StudentPageConfig.sectionOrder`, no section components, no `ResultsModal`.                                                                                           | `docs/student-landing-overhaul-plan.md`                         |  L  |
| M14 | **Schoology Phase E (narrowed)** — unit + rules tests already landed; formal deliverables remain: key-rotation runbook (`docs/schoology-lti-state.md` missing), PII-free fallback test, real-course smoke-test sign-off, district rollout.                             | `docs/schoology-lti-plan.md`                                    |  M  |
| M16 | **PLC roadmap Phases 7–8** — verified zero implementation (no PlcMiniApps/PlcGuidedLearning tabs/bodies/hooks/CFs). Need design first.                                                                                                                                 | `docs/PLC_ROADMAP.md`                                           |  L  |

## 3. Low impact / tech-debt

| #    | Item                                                                                                                                                                                                            | Source                                                         | Cx  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | :-: |
| LO1  | **Quiz reorder persistence** — `REORDER_NOOP` confirmed unchanged; needs an `order` field on quiz metadata + Firestore write.                                                                                   | `components/widgets/QuizWidget/components/QuizManager.tsx:424` |  S  |
| LO2  | **Harmonize dual role-resolution** — legacy `superAdmins[]` + member-`roleId` fallback confirmed still both present (Phase 4.1).                                                                                | `components/admin/Organization/OrganizationPanel.tsx:140`      |  S  |
| LO4  | **Rules follow-up #1** — `sessionTeacherUid/sessionClassId/sessionClassIds/…` confirmed still separate `get()` helpers (collapse to one doc read).                                                              | `firestore.rules:3357`                                         |  S  |
| LO8  | **`userTier` configurable domains** — `INTERNAL_TIER_DOMAINS` confirmed still hardcoded. ⛔ needs a world-readable config doc first.                                                                            | `utils/userTier.ts:14`                                         |  M  |
| LO9  | **Synced-board drawings (post-2.6)** — hook confirmed still reads current-user uid path; no `hostUid` option, objects stripped from mirror. Viewers see empty drawings.                                         | `components/widgets/DrawingWidget/useDrawingObjectsDoc.ts:49`  |  L  |
| LO10 | **Rules follow-up #2** — `activity_wall_sessions` confirmed still on non-compat `passesStudentClassGate` (latent Phase-5A trap).                                                                                | `docs/rules-followups.md`; `firestore.rules:4413`              |  M  |
| LO11 | **Link-shortener Phase 2** — verified none shipped: no `LinksPanel` in AnalyticsManager, no per-click event log, no inline "shorten this URL".                                                                  | `docs/link-shortener-phase-2.md`                               |  M  |
| LO12 | **Widget-connection candidates (9)** — spot-checked: still `Status: proposed`, no code.                                                                                                                         | `docs/nexus.md`                                                |  M  |
| LO13 | **F2 — dual-query consolidation** — confirmed `dualQuery: true` for quiz/VA/GL. ⛔ blocked on the `classIds` backfill.                                                                                          | `hooks/useStudentAssignments.ts:94`                            |  M  |
| LO14 | **F9 — DashboardContext churn (narrowed)** — the `dashboardCanvasStore` split + partial migration shipped; ~192 `useDashboard()` call sites remain to migrate to narrow hooks (incl. hot-path `DashboardView`). | `context/dashboardCanvasStore.ts`                              |  L  |
| LO15 | **F8 / F23 — build hygiene** — confirmed `noUnusedLocals`/`noUnusedParameters` still `false`; `utils/` still 152 flat files. Wide-blast-radius.                                                                 | `docs/optimize-pass/05-build-infra-monorepo.md`                |  L  |

> **Recurring-audit backlogs (not enumerated):** `docs/scheduled-tasks/*` are living audit logs with their own open items — notably 🔒 `firestore-rules.md` (unrestricted `pollVotes` write; broad `sessions` list read). Triage from within their own docs.

---

## 5. Verified already-shipped

Re-checked against code + git on 2026-06-23 and found **complete** — removed from the open backlog. (These were the audit's wrong/overstated rows.)

| Was | Item                                                               | Evidence                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q4  | useEffect Grade-D anti-patterns (ShareModal, DiceWidget, QRWidget) | `8719bffc` (#1689); regression tests added 2026-06-23.                                                                                                                                                                                                                                                                                                                                     |
| LO6 | useEffect Grade-C top batch (DriveFileAttachment ×3, Checklist ×3) | `8719bffc`; only a couple of low-priority residuals may remain.                                                                                                                                                                                                                                                                                                                            |
| LO3 | Org member-counter Cloud Function                                  | `functions/src/organizationMemberCounters.ts` + test + `index.ts:63` export (script comment was stale).                                                                                                                                                                                                                                                                                    |
| M3  | Quiz history session-window scoping (F7)                           | `isHistoryDocInRemovalWindow` in `useQuizSession.ts:259`, `779e3919`.                                                                                                                                                                                                                                                                                                                      |
| M7  | Collections modal (Phase 6)                                        | `components/boardsModal/{BoardsModal,CollectionTree,BoardGrid,BoardsModalHeader,useBoardsModalDnd}.tsx`.                                                                                                                                                                                                                                                                                   |
| M8  | Collections FAB/mounted-set + sharing                              | `MountedBoardsLayer`, `useMountedBoardCache`, `BoardCanvas` (`debe426f`); `ImportSharedCollectionModal` + `useSharedCollection`.                                                                                                                                                                                                                                                           |
| M9  | Quiz results-protection tasks 10–13                                | locked-card `AssignmentListItem`, monitor unlock, `tests/rules/resultsProtection.test.ts` — `2bf54e9d`, `5c5eb1d7`.                                                                                                                                                                                                                                                                        |
| M10 | Formatting-toolbar single-row + overflow                           | `FormattingToolbar.tsx` (ResizeObserver, 7 groups), `a84aa5ff`.                                                                                                                                                                                                                                                                                                                            |
| M11 | Unified editor modals (MiniApp + GuidedLearning)                   | `MiniAppEditorModal.tsx`, `GuidedLearningEditorModal.tsx`, `a30f0b50`.                                                                                                                                                                                                                                                                                                                     |
| M15 | Classroom Item D Part 2                                            | `linkLtiCourseV1`, `LinkSchoologyModal.tsx`, `utils/classroomAttachments.ts` (multi-course fan-out). `unlinkLtiCourse` is by-design absent.                                                                                                                                                                                                                                                |
| LO5 | Inner-edge drag zones                                              | `INNER_EDGE_PAD` + `data-inner-edge-strip` divs in `DraggableWindow.tsx`.                                                                                                                                                                                                                                                                                                                  |
| LO7 | CF cost items 3/4/5                                                | `generateWithAI` caching, `archiveActivityWallPhoto` size guard, ClassLink batching — `0da67704`. (Item 2 is a Firebase-Console volume check, no code.)                                                                                                                                                                                                                                    |
| H3  | PLC Workspace Waves 2–4 — **BUILT**                                | All components/hooks/CFs exist on `dev-paul` (PlcPresenceStrip, PlcMeetingMode, PlcVersionHistoryPanel, usePlcPresence/Comments/Trash, aggregate/digest CFs). **Caveat:** my two passes disagreed on whether this is on `main` yet, and memory notes emulator/app/migration gates were pending — **confirm release/verification status before relying on it.** Not "remaining build work." |

**Deleted 2026-06-23 (verified complete):** the source plan/spec docs for the §5 items were removed — the 4 collections plans (`core-and-modal`, `fab-and-mounted-set`, `sharing`, `templates`), `quiz-results-screenshot-protection.md`, `formatting-toolbar-redesign.md` (plan + spec), `unified-editor-modal-plan.md`, `classroom-itemD-unify-class-course-design.md`, `inner-edge-drag-zones-design.md`, and `2026-05-20-plc-collaborative-redesign.md`. All recoverable via git.

---

## Appendix A — Docs deleted (completed)

35 planning/spec/handoff/spike artifacts whose work is fully shipped (git-verified): the 24 first-pass deletions tabled below, plus the 11 plan/spec docs cleared after the 2026-06-23 code-verification (listed in §5). All recoverable via git.

| Doc                                                                    | Why deleted (evidence)                                                                                               |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `superpowers/plans/2026-05-14-subs-real-widget-rendering.md`           | Shipped — `SubsDashboardProvider`/`SubBoardCanvas` live (PR #1634).                                                  |
| `superpowers/plans+specs/2026-05-18-personal-spotify-gate*`            | Shipped — `3b885467` (#1665).                                                                                        |
| `superpowers/plans+specs/2026-05-18-whats-new-overview-redesign*`      | Shipped — `0fbbea46` (#1664).                                                                                        |
| `superpowers/plans+specs/2026-05-19-personal-spotify-browse-face*`     | Shipped — `264a747e`.                                                                                                |
| `superpowers/plans+specs/2026-05-21-quiz-settings-on-content*`         | Shipped — `94ac7a75`.                                                                                                |
| `superpowers/plans+specs/2026-05-24-whiteboard-phase-2*`               | Shipped — drawing PRs 2.1b–2.6 (`50546902`,`90774d0c`,`95d18d35`,`063ab8c1`,`ceaefd69`,`83f6533d`,`78977ddc`).       |
| `superpowers/plans+specs/2026-05-18-board-switcher-fab-cleanup*`       | Shipped — `BoardNavFab` split buttons + transient `BoardBreadcrumb` + `en.json` keys present.                        |
| `superpowers/plans+specs/2026-06-13-remote-control-v2*`                | Shipped — `6623ee6c` + remote v2 components.                                                                         |
| `superpowers/spikes/2026-06-13-embed-slide-control.md`                 | Spike verdict (`080a6485`) acted on — ships spotlight/swap only.                                                     |
| `superpowers/plans+specs/2026-06-13/14-public-poll-participation*`     | Shipped — `c18fa639` + `components/poll/PollVoteApp.tsx`.                                                            |
| `superpowers/plans+specs/2026-06-14-quiz-va-monitor-results-redesign*` | Reskin shipped — `4ae6d2d1`,`be418568`. (Real redesign tracked in `monitor-results-redesign-handoff.md` = H1, kept.) |
| `superpowers/checklists/2026-06-13-remote-v2-smoke-test.md`            | Spent QA checklist; remote v2 shipped.                                                                               |
| `drawing-widget-phase-2.md`                                            | Stale roadmap — all 2.1b–2.6 PRs shipped.                                                                            |
| `classroom-assign-phase2-handoff.md`                                   | Items A–D shipped — `593859a1` (#1882).                                                                              |
| `schoology-lti-spike1-runbook.md`                                      | One-time spike procedure; executed.                                                                                  |

## Appendix B — (resolved) previously-flagged docs

Both docs flagged for your confirmation were **deleted 2026-06-23** after code-verification: `2026-05-20-plc-collaborative-redesign.md` (shipped #2025 → #2027) and `2026-05-16-collections-templates.md` (Plan 4 of the now-complete collections arc). See Appendix A / §5.

## Appendix C — Code markers verified NOT actionable

- `Results.tsx:270`, `videoActivityDriveService.ts:8`, `…test.ts:40` — "PR2a TODO" already fixed (`gradeVideoActivityAnswer` handles MA).
- `scripts/draft-changelog-entry.js` — template placeholder text, not a code TODO.
- `QuizStudentApp.tsx`, `ShareLinkCreatorModal.tsx`, `videoActivityResponseProtection.test.ts` — `XXXXXX`/`XXX` are example strings.
- `StudentContexts.tsx:264,267,328` — intentional "not implemented in student view" guards.

## Appendix D — Living docs kept as-is

- `docs/optimize-pass/` (backlog index + 6 batch docs)
- `docs/scheduled-tasks/*` (14 recurring audit logs) · `docs/routines/{debugger,unifier}.md`
- `docs/plc-workspace-prd.md`, `docs/PLC_ROADMAP.md`, `docs/wide-distro-plan.md`, `docs/organization_wiring_implementation.md` (active roadmaps/PRDs)
- `docs/external-availability-{journal,oauth-runbook,legal-review}.md`, `docs/assign-from-spartboard-to-lms-feasibility.md`, `docs/classroom-addon-gcp-state.md`
- `docs/admin_settings_widget_configs.md`, `docs/nexus.md` (reference catalogs)
- `docs/{ADMIN_SETUP,DEV_WORKFLOW,LINTING_SETUP,DEPLOY_CHECK}.md` (developer reference)
