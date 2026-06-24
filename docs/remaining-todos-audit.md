# SpartBoard — Remaining To-Dos Audit

**Generated:** 2026-06-23
**Method:** Read-only parallel sweep of code TODO/FIXME markers + every plan/spec/handoff in `docs/`, each cross-checked against the actual codebase and git history. Items confirmed already-shipped were removed (see [Appendix A](#appendix-a--docs-deleted-completed)); only **verified-still-open** work appears below.

## How to read this

- **Impact** = payoff to users/operations/maintainability. Highest first.
- **Complexity** = rough effort. **S** = <½ day · **M** = ½–2 days · **L** = multi-day / wide-blast-radius refactor.
- Within each impact tier, items are ordered **easiest → hardest**.
- **Source** links the canonical doc or the exact `file:line`. Where several signals describe one piece of work, they're merged into a single row.
- 🔒 = security / data-isolation · 👤 = Paul-owned ops (not a code change) · ⛔ = blocked on a dependency.

**Totals:** 8 code TODO markers triaged (5 legit-pending, 3 stale) · ~70 docs cross-referenced · **24 completed docs deleted** · **2 flagged for your call** · ~38 distinct open items below.

> **Update — 2026-06-23 (later this session):** A subagent pass on the useEffect items found the `docs/useEffect_audit.md` Grade-D + top Grade-C work was **already shipped** in commit `8719bffc` (#1689); this audit had inherited a stale "remaining" claim. Q4 is marked done and LO6 corrected below. While confirming, regression tests were added (ActivityWall `ShareModal`, `DiceWidget`, `DriveFileAttachment`, `Checklist`) to lock the fixes in, plus one small residual cleanup in `Checklist/Settings.tsx` (removed a redundant `updateWidgetRef`). Lesson: even this audit needs the "is it actually still open?" check before work starts.

---

## 0. Quick wins (high payoff ÷ low effort — do these first)

| #   | Item                                                                                                                                                                                                                 | Source                                                    | Impact | Cx  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | :----: | :-: |
| Q1  | **Graduate `org-admin-writes` flag** from beta → admin after QA sign-off (all org-admin mutations currently fall back to a "coming soon" toast). Script already exists: `scripts/graduate-org-admin-writes-flag.js`. | `components/admin/Organization/OrganizationPanel.tsx:318` |  High  |  S  |
| Q2  | 🔒 **Scope the announcements query by `orgId`** before a 2nd org goes live (today the query is org-unscoped; relies on client-side filtering only). Add `where('orgId','==',orgId)` + run the documented backfill.   | `components/announcements/AnnouncementOverlay.tsx:391`    |  High  |  S  |
| Q3  | **Org wiring Phase 4 close-out:** run manual QA checklist (task J) then flip the org-wiring flag to `admin` (task K, ~5 min).                                                                                        | `docs/organization_wiring_implementation.md`              |  High  |  S  |
| Q4  | ✅ **DONE (verified shipped in #1689).** ~~useEffect Grade-D anti-patterns — ShareModal, DiceWidget, QRWidget~~. Already cleared; regression tests added 2026-06-23.                                                 | `docs/useEffect_audit.md`                                 |  Med   |  S  |

---

## 1. High impact

### 1a. Launch gates / operations (👤 Paul-owned — unblock external availability)

These are the critical path to turning external availability fully on. Mostly console/ops, not code.

| #   | Item                                                                                                                                                                                                                                                        | Source                                                                                          | Cx  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | :-: |
| L1  | 👤 **Decide `CLASSROOM_ASSIGN_ENABLED`** — set `false` for a safe launch, OR confirm the restricted Classroom scope is Marketplace-declared and the OAuth client is "Trusted", then enable.                                                                 | `docs/external-availability-journal.md`, `docs/assign-from-spartboard-to-lms-feasibility.md` §7 |  S  |
| L2  | 👤🔒 **Announcements backfill sequence** — run `backfill-org-members` → `migrateAnnouncements` → scope the listener query, _before_ a 2nd org posts announcements (otherwise cross-org leakage). Pairs with Q2.                                             | `docs/external-availability-journal.md`                                                         |  S  |
| L3  | 👤 **OAuth consent finalization** — upload consent-screen logo; submit sensitive-scope verification (justifications + demo video are ready). ⛔ **Blocked:** `*.web.app` can't satisfy OAuth branding verification — a **custom domain** is required first. | `docs/external-availability-oauth-runbook.md` §2–3                                              |  M  |
| L4  | 👤 **Legal / operator-model sign-off** — district counsel approves the free-tier operator model; legal copy is already finalized & redeploys via the prerender step.                                                                                        | `docs/external-availability-legal-review.md`                                                    |  M  |
| L5  | 👤 **Classroom Add-On Phase 0B** — Workspace Admin Console install/allowlist + Marketplace Store Listing publication + live launch test (gcloud/API work in Phase 0A is done).                                                                              | `docs/classroom-addon-gcp-state.md`                                                             |  M  |

### 1b. Product / engineering (high impact)

| #   | Item                                                                                                                                                                                                                                                                                                                                    | Source                                                                                   | Cx  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | :-: |
| H1  | **Real Monitor & Results redesign** for Quiz/VA — the shipped work (PR #1971) was a _reskin_; the IA/layout is unchanged. Rethink the live monitor as a glanceable control surface (hero join+QR, presence board, question spotlight) and Results as "what do I do next". Build on the shipped `components/common/sessionViews/` atoms. | `docs/monitor-results-redesign-handoff.md`                                               |  L  |
| H2  | **Rostered sign-in join links** for Activity Wall + Quiz/VA/GL. Unblocks safely gating `anonymous-join` for external in-class sharing (today only anonymous PIN-join exists, so the gate can't be enforced).                                                                                                                            | `docs/wide-distro-plan.md` (Phase 3b); `components/widgets/ActivityWall/Widget.tsx:1804` |  L  |
| H3  | **PLC Workspace Waves 2–4** — presence, activity log, comments, soft-delete/trash, optimistic concurrency, Common Assessment + Meeting Mode, server-side analytics, version history. Active PRD, decisions locked; in-flight on `dev-paul-plc-workspace`.                                                                               | `docs/plc-workspace-prd.md`                                                              |  L  |

---

## 2. Medium impact

| #   | Item                                                                                                                                                                                                                     | Source                                                                                                                 | Impact | Cx  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | :----: | :-: |
| M1  | **Inactive-user full sign-in lockout** — "Inactive" status currently only revokes admin access; users can still sign in. Phase 4.1 backlog.                                                                              | `components/admin/Organization/views/UsersView.tsx:98`                                                                 |  Med   |  S  |
| M2  | **F6 — building-ID canonicalization in rules** — the member-`buildingIds` list-overlap check isn't alias-aware like the single-building `manages()` helper; can wrongly deny on legacy/canonical mismatch.               | `docs/optimize-pass/03-firestore-rules.md`; `firestore.rules:389-396`                                                  |  Med   |  M  |
| M3  | **F7 — quiz history deletion scoping** — on PIN-collision keys, removing a student bulk-deletes the whole `/history` subcollection (corrupts the PIN-mate's history). Scope to the session window.                       | `docs/optimize-pass/04-quiz-history-correctness.md`; `hooks/useQuizSession.ts:888`                                     |  Med   |  M  |
| M4  | **User-management actions** — wire the 3 disabled "coming soon" buttons: Resend invite, Change role, Move to building.                                                                                                   | `components/admin/Organization/views/UsersView.tsx:385,394,403`                                                        |  Med   |  M  |
| M5  | **Finish `/subs` Collections support** — real Collection board view (currently a stub) + Drive roster-file grants for Collection substitute-shares (single-board shares already grant).                                  | `components/subs/SubsApp.tsx:34,122`; `components/subs/SubCollectionsList.tsx:114`; `hooks/useSharedCollection.ts:273` |  Med   |  M  |
| M6  | **Unify the assign class-picker** + migrate assignment targeting from `periodNames[]` → `rosterIds[]` (data-model migration with back-compat reads). The picker spec and the PR #1541 follow-ups describe the same work. | `docs/quiz-class-picker-followups.md`; `docs/superpowers/specs/2026-04-22-assign-class-picker-design.md`               |  Med   |  M  |
| M7  | **Collections modal UI (Plan 1 Phase 6)** — `BoardsModal` panes: CollectionTree, BoardGrid, header/search, bulk-actions bar, drag-drop sorting (core data layer already shipped).                                        | `docs/superpowers/plans/2026-05-15-collections-core-and-modal.md`                                                      |  Med   |  M  |
| M8  | **Collections — finish FAB/mounted-set (Plan 2 Phase 3)** + **sharing wiring (Plan 3 Phase 2)** — extract `BoardCanvas` + integrate `MountedBoardsLayer`; complete `ImportSharedCollectionModal` hydration.              | `docs/superpowers/plans/2026-05-16-collections-fab-and-mounted-set.md`, `…-collections-sharing.md`                     |  Med   |  M  |
| M9  | **Quiz results screenshot-protection — Tasks 10–13** — monitor unlock affordance, locked-card UX on the assignment list, Firestore-rule tests (watermark + tab-warning hooks already shipped).                           | `docs/superpowers/plans/2026-05-15-quiz-results-screenshot-protection.md`                                              |  Med   |  M  |
| M10 | **Formatting-toolbar redesign** — single-row grouped layout with `ResizeObserver` overflow menu + portal positioning (NOT-STARTED).                                                                                      | `docs/superpowers/plans/2026-04-10-formatting-toolbar-redesign.md`                                                     |  Med   |  M  |
| M11 | **Unified editor modal — Phases 3 & 4** — MiniApp (Firestore-only) then Guided Learning (separate Drive service). Phases 0–2 (shell, Quiz, VA) shipped.                                                                  | `docs/unified-editor-modal-plan.md`                                                                                    |  Med   |  M  |
| M12 | **Written-response quizzes — Phase 3 (rubrics)** — rubric data model, builder UI, CSV import/export, PLC sharing + deferred rule tests (Phases 1–2 shipped).                                                             | `docs/written-response-quiz-questions.md`                                                                              |  Med   |  L  |
| M13 | **Student-landing overhaul** — complete 9-phase plan (unified landing, per-assignment results release, teacher directory). NOT-STARTED, fully specced (~20–30 hrs).                                                      | `docs/student-landing-overhaul-plan.md`                                                                                |  Med   |  L  |
| M14 | **Schoology LTI — Phase E hardening** — re-launch idempotency, missing-AGS handling, key rotation, expired codes, rules/unit test coverage, rollout sign-off (Phases A–D shipped).                                       | `docs/schoology-lti-plan.md`                                                                                           |  Med   |  L  |
| M15 | **Classroom Item D Part 2** — Schoology course-link CFs + linking UX + multi-course GC fan-out (needs `classroomAttachment` → `classroomAttachments[]` migration). Part 1 shipped.                                       | `docs/classroom-itemD-unify-class-course-design.md`                                                                    |  Med   |  L  |
| M16 | **PLC roadmap Phases 7–8** — Mini-apps + Guided Learning PLC integration (need design before build).                                                                                                                     | `docs/PLC_ROADMAP.md`                                                                                                  |  Med   |  L  |

---

## 3. Low impact / tech-debt / nice-to-have

| #    | Item                                                                                                                                                                                                                                                     | Source                                                                         | Cx  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | :-: |
| LO1  | **Quiz reorder persistence** — `REORDER_NOOP` silently drops quiz item reordering; wire the Firestore update.                                                                                                                                            | `components/widgets/QuizWidget/components/QuizManager.tsx:424`                 |  S  |
| LO2  | **Harmonize dual role-resolution** — collapse the legacy `superAdmins[]` array + member-`roleId` fallback into one source once rules read member docs.                                                                                                   | `components/admin/Organization/OrganizationPanel.tsx:140`                      |  S  |
| LO3  | **Verify org member-counter CF** — `recount-org-members.js` notes counts read 0 pending a Phase-4 trigger; `organizationMemberCounters` may already cover this (confirm, else finish).                                                                   | `scripts/recount-org-members.js:11`                                            |  S  |
| LO4  | **Rules follow-up #1** — collapse the triple `get()` helpers per session collection (read the doc once, reuse cached fields).                                                                                                                            | `docs/rules-followups.md`                                                      |  S  |
| LO5  | **Inner-edge drag zones** — invisible inner drag zones on widgets (NOT-STARTED, single-file change).                                                                                                                                                     | `docs/superpowers/specs/2026-04-09-inner-edge-drag-zones-design.md`            |  S  |
| LO6  | **useEffect Grade-C cleanups** — top batch (DriveFileAttachment ×3, Checklist Settings ×3) **shipped #1689 + verified 2026-06-23**; only a few low-priority residuals may remain (LunchCount nutrislice, DashboardView:1156) — verify before picking up. | `docs/useEffect_audit.md`                                                      |  S  |
| LO7  | **Cloud Functions cost — Items 2–5** — `generateWithAI` read caching, `archiveActivityWallPhoto` size guard, ClassLink roster batching, verify `fetchExternalProxy` volume (Item 1 done).                                                                | `docs/CLOUD_FUNCTIONS_COST_OPTIMIZATION.md`                                    |  M  |
| LO8  | **`userTier` configurable domains** — make `INTERNAL_TIER_DOMAINS` admin-configurable (⛔ needs a world-readable config doc first).                                                                                                                      | `utils/userTier.ts:14`                                                         |  M  |
| LO9  | **Synced-board drawings (post-2.6)** — shared-board viewers can't see drawings (mirrored payload strips `objects[]`; rules deny cross-user reads). Mirror objects into `shared_boards` or add a host-uid read contract.                                  | `components/widgets/DrawingWidget/useDrawingObjectsDoc.ts:49`                  |  L  |
| LO10 | **Rules follow-up #2** — migrate `activity_wall_sessions` to the Phase-5A compat gate (latent trap; bundle with the AW Phase-5A migration).                                                                                                              | `docs/rules-followups.md`                                                      |  M  |
| LO11 | **Link-shortener Phase 2** — analytics panel, per-click event log + charts, inline "shorten this URL", bulk CSV, vanity domain (Phase 1 shipped).                                                                                                        | `docs/link-shortener-phase-2.md`                                               |  M  |
| LO12 | **Widget-connection candidates (9)** — proposed auto-trigger/sync/spawn/import links (e.g. Quiz→GraphicOrganizer, Text→ConceptWeb), scored in the journal.                                                                                               | `docs/nexus.md`                                                                |  M  |
| LO13 | **F2 — dual-query listener consolidation** — ⛔ blocked on the `classIds` backfill; collapsing before backfill drops assignments.                                                                                                                        | `docs/optimize-pass/02-firestore-cost.md`; `hooks/useStudentAssignments.ts:38` |  M  |
| LO14 | **F9 — DashboardContext churn** — legacy consumers read the full ~100-prop value; finish slicing (canvas store already split). Measure before landing.                                                                                                   | `docs/optimize-pass/06-perf-render.md`                                         |  L  |
| LO15 | **F8 / F23 — build hygiene** — re-enable `noUnusedLocals`/`noUnusedParameters`; regroup the ~144 flat `utils/` files. Wide-blast-radius.                                                                                                                 | `docs/optimize-pass/05-build-infra-monorepo.md`                                |  L  |

> **Recurring-audit backlogs (not enumerated above):** `docs/scheduled-tasks/*` are living nightly/weekly audit logs that each carry their own open items — notably 🔒 `firestore-rules.md` (unrestricted `pollVotes` write; broad `sessions` list read) and `code-structure.md` (DashboardContext ~5.7k lines; `functions/src` ~4.3k lines). Triage those from within their own docs; they're designed to persist.

---

## Appendix A — Docs deleted (completed)

24 planning/spec/handoff/spike artifacts whose work is fully shipped (git-verified). All recoverable via git (`git restore --staged --worktree <path>` or from history).

| Doc                                                                    | Why deleted (evidence)                                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `superpowers/plans/2026-05-14-subs-real-widget-rendering.md`           | Shipped — `SubsDashboardProvider`/`SubBoardCanvas` live (PR #1634).                                                             |
| `superpowers/plans+specs/2026-05-18-personal-spotify-gate*`            | Shipped — `3b885467` (#1665).                                                                                                   |
| `superpowers/plans+specs/2026-05-18-whats-new-overview-redesign*`      | Shipped — `0fbbea46` (#1664).                                                                                                   |
| `superpowers/plans+specs/2026-05-19-personal-spotify-browse-face*`     | Shipped — `264a747e`.                                                                                                           |
| `superpowers/plans+specs/2026-05-21-quiz-settings-on-content*`         | Shipped — `94ac7a75`.                                                                                                           |
| `superpowers/plans+specs/2026-05-24-whiteboard-phase-2*`               | Shipped — drawing PRs 2.1b–2.6 (`50546902`,`90774d0c`,`95d18d35`,`063ab8c1`,`ceaefd69`,`83f6533d`,`78977ddc`).                  |
| `superpowers/plans+specs/2026-05-18-board-switcher-fab-cleanup*`       | Shipped — `BoardNavFab` split buttons + transient `BoardBreadcrumb` + `en.json` keys present.                                   |
| `superpowers/plans+specs/2026-06-13-remote-control-v2*`                | Shipped — `6623ee6c` + remote v2 components.                                                                                    |
| `superpowers/spikes/2026-06-13-embed-slide-control.md`                 | Spike verdict (`080a6485`) acted on — ships spotlight/swap only.                                                                |
| `superpowers/plans+specs/2026-06-13/14-public-poll-participation*`     | Shipped — `c18fa639` + `components/poll/PollVoteApp.tsx`.                                                                       |
| `superpowers/plans+specs/2026-06-14-quiz-va-monitor-results-redesign*` | Reskin shipped — `4ae6d2d1`,`be418568`. (Real redesign tracked separately in `monitor-results-redesign-handoff.md`, kept.)      |
| `superpowers/checklists/2026-06-13-remote-v2-smoke-test.md`            | Spent QA checklist; remote v2 shipped.                                                                                          |
| `drawing-widget-phase-2.md`                                            | Stale roadmap — all 2.1b–2.6 PRs shipped (see above); superseded the same work as the whiteboard-phase-2 plan.                  |
| `classroom-assign-phase2-handoff.md`                                   | Items A–D shipped — `593859a1` (#1882). Residual Item-D Phase 2 lives in `classroom-itemD-unify-class-course-design.md` (kept). |
| `schoology-lti-spike1-runbook.md`                                      | One-time spike procedure; executed (post-spike fixes merged).                                                                   |

## Appendix B — Flagged for your call (completed, but kept)

Verified shipped, but **kept** because each is entangled with active, same-named work. Say the word and I'll delete:

| Doc                                                          | Status                                                                                                | Why kept                                                                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `superpowers/plans/2026-05-20-plc-collaborative-redesign.md` | DONE (`651cedb9` #2025 → `1a82a164` #2027 to main)                                                    | Name-collides with the **in-flight** `plc-workspace-prd.md`; kept to avoid confusing the active redesign.                          |
| `superpowers/plans/2026-05-16-collections-templates.md`      | DONE (`CollectionTemplate` type + `dashboardSanitize.ts` + `CreateFromTemplateModal.tsx` all present) | It's "Plan 4 of 4" of the collections arc whose Plans 1–3 are still partial; kept to keep the set coherent until the arc finishes. |

## Appendix C — Code markers verified NOT actionable

So they don't get re-investigated:

- `Results.tsx:270`, `videoActivityDriveService.ts:8`, `…test.ts:40` — "PR2a TODO" is **already fixed** (`gradeVideoActivityAnswer` handles MA).
- `scripts/draft-changelog-entry.js` — template placeholder text (operator guidance, not a code TODO).
- `QuizStudentApp.tsx`, `ShareLinkCreatorModal.tsx`, `videoActivityResponseProtection.test.ts` — `XXXXXX`/`XXX` are example/placeholder strings, not markers.
- `StudentContexts.tsx:264,267,328` — intentional "not implemented in student view" guards (students aren't teachers).

## Appendix D — Living docs kept as-is

Not plans-to-complete; intentionally persistent. Each carries its own tracked open items:

- `docs/optimize-pass/` (backlog index + 6 batch docs — 01/F1 is done but kept with the set)
- `docs/scheduled-tasks/*` (14 recurring audit logs)
- `docs/routines/{debugger,unifier}.md` (recurring routine logs)
- `docs/plc-workspace-prd.md`, `docs/PLC_ROADMAP.md`, `docs/wide-distro-plan.md`, `docs/organization_wiring_implementation.md` (active roadmaps/PRDs)
- `docs/external-availability-{journal,oauth-runbook,legal-review}.md`, `docs/assign-from-spartboard-to-lms-feasibility.md`, `docs/classroom-addon-gcp-state.md` (journals/runbooks/decision records)
- `docs/admin_settings_widget_configs.md`, `docs/nexus.md` (reference catalogs)
- `docs/{ADMIN_SETUP,DEV_WORKFLOW,LINTING_SETUP,DEPLOY_CHECK}.md` (developer reference)
