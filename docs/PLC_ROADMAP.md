# PLC Dashboard Expansion — Roadmap

Multi-phase plan to grow the **My PLCs** sidebar entry from "list + invites" into a full Professional Learning Community workspace: shared quiz library, PLC-authored assignments, video activities, notes, to-dos, and shared boards.

Phase 1 has shipped (PR #1537, into `dev-paul`). This doc captures what landed, what's next, and the architectural decisions that bind future phases.

---

## How to use this doc

This roadmap is designed to be **executed in independent chunks across multiple sessions**. An agent (or human) can pick up any unshipped phase without re-deriving context.

### Rules for agents working this roadmap

1. **Always read this doc top-to-bottom before starting a phase.** Decisions in later phases may have shifted based on notes from earlier phases.
2. **Work one phase at a time.** Each phase is a shippable PR. Do not interleave phases.
3. **After completing each phase:**
   - Check the phase box in the Status list.
   - Fill in the phase's "Notes from implementation" block with: files actually changed (if different from the plan), surprises encountered, decisions made mid-phase, and anything the next phase needs to know.
   - If the work diverged from the plan, update the affected later-phase sections to reflect reality.
4. **Open questions.** If you hit a decision that isn't answered in "Locked decisions" below, add it to the **Open questions** list at the bottom and ask the user before proceeding — don't guess.
5. **Scope discipline.** Each phase has an explicit "Out of scope" list. Resist the urge to bundle later-phase work — small PRs ship; big PRs stall.
6. **Don't delete this section.** The next agent needs it.

---

## Status

- [x] **Phase 1** — Dashboard shell + feature toggles + completed-assignments tab _(PR #1537)_
- [x] **Phase 2** — PLC Quiz Library (share-with-PLC, collaborative editing, sync-or-copy import) _(PR #1547)_
- [x] **Phase 3** — PLC-authored Assignments tab + auto-bubble-up from personal assignments _(PR #1556)_
- [x] **Phase 4** — Video Activities (`PlcLinkage` + library + dashboard surface) _(fully-fledged PR)_
- [x] **Phase 5** — Notes + To-Do list (collaborative shared docs) _(bundled with Overview/Bento — see Phase 1.5 below)_
- [x] **Phase 6** — Shared Boards surface _(fully-fledged PR)_
- [x] **Phase 1.5 (out-of-band)** — PLC Overview tab with per-user customizable bento grid + sidebar kebab UX
- [ ] **Phase 7 (proposed)** — Mini-apps PLC integration _(not in original roadmap)_
- [ ] **Phase 8 (proposed)** — Guided Learning PLC integration _(not in original roadmap)_

> **Phase 1.5 deviation note:** Phase 5 (Notes + To-Dos) was pulled forward and shipped alongside the Overview tab + bento grid + sidebar kebab refactor in a single PR. This deviates from the "one phase per PR" rule because the Overview tab's bento tiles needed real content for Notes and To-Dos on day one — placeholder tiles linking to placeholder tabs would have felt empty.
>
> **Fully-fledged PR deviation:** Phases 4 and 6 plus the in-flight roadmap follow-ups shipped together in a single multi-commit PR (`claude/plc-fully-fledged`) at the user's explicit request after noticing the dashboard still showed "Coming soon" placeholders for activeAssignments / videoActivities / sharedBoards. This deviates from "one phase per PR" too — the trade-off was reviewer load vs. user-visible coherence. The follow-up polish PR (`claude/plc-polish`) deleted `ComingSoonTile` outright — Phase 7/8 will write their own live tiles rather than ship behind a placeholder.

Branch convention: each phase opens a `claude/plc-phase-N-<slug>` branch off `dev-paul`. Do **not** target `main` directly.

---

## Locked decisions (do not re-open without user approval)

| Decision                                   | Value                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLC-owned content storage                  | **Subcollections under `plcs/{plcId}/...`** (not top-level collections with a `plcId` field). One precedent already exists: `plcs/{plcId}/assignment_index/{assignmentId}` from Phase 1. Same pattern applies to `quizzes/`, `video_activities/`, `notes/`, `todos/`, `assignments/` in later phases.       |
| Sync-vs-copy import model                  | When a member adds PLC content to their own board/library, they pick **Sync** (live-edit follows the PLC version) or **Copy** (one-time snapshot). Reuse the existing `QuizAssignmentImportModeModal` pattern (`components/widgets/QuizWidget/components/QuizAssignmentImportModeModal.tsx`).               |
| Collaborative edit infrastructure          | Lean on existing `synced_quizzes/{groupId}` machinery (last-writer-wins per field, debounced). Phase 2 wires PLC quizzes to a sync group so member edits propagate near-real-time. **Do not invest in CRDT/op-based editing** — LWW matches every other surface in the app.                                 |
| Settings toggles                           | Per-PLC `features` map on the PLC doc, editable by **any member** (not lead-only). Always merged through `getPlcFeatures(plc)` so legacy PLCs and partial maps default to enabled.                                                                                                                          |
| `completedAssignments` is not a flag       | The completed-assignments index is always visible; it's the read-only history view that anchors the dashboard. Don't add a toggle for it.                                                                                                                                                                   |
| Assignment index writes                    | **Fire-and-forget** from `useQuizAssignments.createAssignment` via `void writePlcAssignmentIndexEntry(...)`. The helper has its own try/catch and never rejects — the assign action returns immediately after the canonical batch commits. Failures are logged via `logError` and surface at next snapshot. |
| Anti-phish on `sheetUrl`                   | The Firestore rule pins `assignment_index.sheetUrl` to the parent PLC's `sharedSheetUrl`. Defense-in-depth: client also validates `http:` / `https:` before rendering as a link. **Both layers must stay** — neither is sufficient alone.                                                                   |
| Shared sheet URL race                      | Set-if-empty transactional write at the rules layer (`isSettingPlcSharedSheetUrl`) plus client transaction in `setPlcSharedSheetUrl`. A race-loser's freshly-created sheet may be orphaned in their Drive — accepted trade-off for rare concurrent first-PLC-assignment collisions.                         |
| Migration to subcollections from top-level | None expected — every Phase 2-6 collection is **new**. Do not move the existing top-level `quizzes/`, `video_activities/`, etc. — those stay user-scoped under `users/{uid}/...`. PLC content is a separate, additive store.                                                                                |

---

## Reference files (read before starting any phase)

Open these in the first session so you understand the pivot points:

- `types.ts` — `Plc`, `PlcFeatureSettings`, `PlcLinkage`, `PlcAssignmentIndexEntry`, `QuizAssignmentSettings`. The `PlcLinkage` sub-object is the canonical "this assignment opts into PLC mode" predicate.
- `firestore.rules` lines 676–902 — PLC + invite + assignment_index rules. Read the helper functions (`isAcceptingPlcInvite`, `isLeavingPlc`, `isSettingPlcSharedSheetUrl`, `isUpdatingPlcFeatures`) before adding new rule branches.
- `hooks/usePlcs.ts` — live PLC list, mutators, `updatePlcFeatures`, transactional sheet-URL write.
- `hooks/usePlcAssignmentIndex.ts` — Phase 1 example of a PLC subcollection hook + writer pattern. Mirror this for later phases.
- `hooks/useQuizAssignments.ts` lines ~568–720 — `createAssignment` body. The PLC index write side effect lives here.
- `components/plc/PlcDashboard.tsx` — full-screen dashboard shell. Tab routing is feature-flag-gated via `getPlcFeatures(plc)`.
- `components/plc/tabs/*` — Phase 1 tab implementations + placeholder pattern (`PlcPlaceholderTab.tsx`).
- `components/widgets/QuizWidget/components/QuizAssignmentImportModeModal.tsx` — the canonical sync-or-copy picker UX. Phase 2/3/4 pickers should mirror it.
- `hooks/useSyncedQuizGroups.ts` + `synced_quizzes/{groupId}` rules in `firestore.rules` — the LWW collaborative-edit infrastructure Phase 2 will lean on.

---

## Phase 1 — Dashboard shell + feature toggles + completed assignments _(SHIPPED)_

**Status:** Merged via PR #1537 into `dev-paul`.

### What landed

- `components/plc/PlcDashboard.tsx` — full-screen overlay (mirrors `AdminSettings` pattern). Desktop tab pills, mobile drawer, Escape-to-close.
- `components/plc/tabs/PlcCompletedAssignmentsTab.tsx` — read-only list of every PLC-mode assignment any member has run. Backed by `plcs/{plcId}/assignment_index`. Each row links out to the shared Google Sheet (with `isSafeHttpUrl` defense-in-depth).
- `components/plc/tabs/PlcSettingsTab.tsx` — per-PLC feature toggles. Any member can flip. Disables all rows while one toggle write is in flight.
- `components/plc/tabs/PlcPlaceholderTab.tsx` — placeholder pattern for unshipped phases.
- `hooks/usePlcAssignmentIndex.ts` — live subscription + best-effort writer for the assignment index.
- `hooks/usePlcs.ts` extended with `updatePlcFeatures(plcId, features)` and a `features` field parser that merges against `DEFAULT_PLC_FEATURE_SETTINGS`.
- `hooks/useQuizAssignments.ts` — `createAssignment` now fires a best-effort `void writePlcAssignmentIndexEntry(...)` whenever `settings.plc` is set (covers `importSharedAssignment` for PLC members too).
- `firestore.rules` — new `isUpdatingPlcFeatures()` helper for the PLC-level features map; `plcs/{plcId}/assignment_index/{assignmentId}` rules with split create/update branches, schema lock-down via `keys().hasOnly([...])`, `kind == 'quiz'` constraint, and `sheetUrl == parent.sharedSheetUrl` anti-phish pin.
- `tests/hooks/usePlcAssignmentIndex.test.ts` (new), `tests/rules/plcAssignmentIndex.test.ts` (new), `tests/hooks/useQuizAssignments.test.ts` (extended with PLC index side-effect coverage).

### Notes from implementation

- The original `allow create, update` rule for the assignment index had a takeover bypass (member B could overwrite member A's entry by setting `ownerUid` to themselves). Caught in Copilot review — fixed by splitting into separate `create` and `update` branches and pinning `id`/`ownerUid`/`createdAt` immutable on update.
- The `PlcSettingsTab` initially only disabled the active row while a toggle write was in flight, but other rows kept the busy guard silently. Fixed to disable all rows whenever `busyKey !== null`.
- Listener mounting: `Sidebar.tsx` keeps `usePlcs` subscription active while either the drawer OR the dashboard overlay is open (`enabled: isOpen || openPlcDashboardId !== null`). Don't drop this — closing the drawer while the dashboard is open would otherwise stop refreshing the live PLC list.

---

## Phase 2 — PLC Quiz Library

**Goal:** members can share a quiz with their PLC, edit it collaboratively in near-real-time, and import it into their personal library via sync-or-copy.

### Scope

- New `plcs/{plcId}/quizzes/{quizId}` subcollection. Each entry mirrors the shape of a personal quiz (`QuizData`) plus a small PLC-snapshot header (sharedAt, sharedBy, syncGroupId).
- New "Share with PLC" item in the Quiz Library kebab menu. Click → pick PLC → write to subcollection AND join the source quiz to a `synced_quizzes/{groupId}` group.
- `PlcQuizLibraryTab.tsx` (replaces the placeholder). Lists the PLC's shared quizzes. Each row supports edit-in-place (the editor opens the synced version, debounced LWW writes via existing `useSyncedQuizGroups`).
- "Add to my library" action on each row. Opens a sync-or-copy picker (mirror `QuizAssignmentImportModeModal`):
  - **Sync** — adds the quiz to the user's personal library AND joins the sync group, so subsequent PLC edits flow into their copy.
  - **Copy** — one-time snapshot.

### Architectural notes

- The synced-quizzes infrastructure is the load-bearing piece. Don't re-implement LWW. The `participants` map on the sync group already supports multi-teacher edits.
- Add `plcId?: string` to the synced quiz group doc so it can be filtered to "this PLC's shared quizzes" without a cross-collection join.
- The kebab "Share with PLC" should reject if the user isn't a member of any PLC (not just hide — show a toast pointing at the My PLCs sidebar).

### Files (expected)

- `types.ts` — add `PlcQuizSnapshot` (or extend `QuizData` with optional `plc?: { plcId, sharedAt, sharedBy }` header).
- `firestore.rules` — new `match /plcs/{plcId}/quizzes/{quizId}` block. Reads gated by membership; writes gated by membership + sync-group ownership.
- `hooks/usePlcQuizzes.ts` (new) — live list + share/unshare mutators.
- `components/widgets/QuizWidget/QuizManager.tsx` (or wherever the kebab is) — add "Share with PLC" item + PLC picker.
- `components/plc/tabs/PlcQuizLibraryTab.tsx` — replaces placeholder.
- `components/plc/PlcQuizImportModal.tsx` (new) — sync-or-copy picker, mirrors `QuizAssignmentImportModeModal`.
- Tests: hook + rules suites for the new subcollection, mirror of existing `plcAssignmentIndex.test.ts`.

### Out of scope for Phase 2

- Video activities (Phase 4).
- PLC-authored assignments (Phase 3) — sharing a quiz does not auto-create an assignment; the assignment is created by the importer's existing flow.
- Permissions beyond "any member can edit / any member can copy". No editor-vs-viewer split.

### Open question — RESOLVED

- When the original sharer **deletes** their personal copy of a quiz that's been synced to a PLC, the PLC copy **stays** (orphan-tolerant). The PLC subcoll doc lives independently of the sharer's `quiz_metadata`; the canonical `synced_quizzes/{groupId}` doc also stays in place (its rule already declines client deletes). No cascade.

### Notes from implementation

- **Subcollection shape:** `plcs/{plcId}/quizzes/{plcQuizId}` is a lightweight header (`title`, `questionCount`, `syncGroupId`, `sharedBy*`, `sharedAt`, `updatedAt`) — questions live only in `synced_quizzes/{groupId}`. List rendering thus avoids an N+1 read against the sync collection. After every successful peer publish, `mirrorPlcQuizHeader` patches title/questionCount onto the PLC doc fire-and-forget — failures log via `logError('usePlcQuizzes.mirrorHeader', …)` and never reject so the publish path stays fast.
- **Doc ids:** the PLC doc id is a fresh v4 UUID minted at share time (NOT the source quiz id). This lets the same source quiz be shared with multiple PLCs without doc-id collisions, and lets the sharer remove a PLC entry without affecting their personal library.
- **Sharing flow** (`Widget.tsx → handleShareWithPlc`): load drive content → mint `synced_quizzes/{groupId}` (with `plcId` set) if the quiz wasn't already synced → attach sync linkage to local `quiz_metadata` → write the PLC subcoll doc. If the PLC subcoll write fails after the synced group is minted, the synced group + sync linkage are intentionally NOT rolled back — the canonical doc still appears as a "Synced" pill on the user's library card, which is still useful, and a retry just re-uses the existing groupId.
- **Importing flow** (`PlcQuizLibraryTab → handleImport`):
  - **Sync** — `pullSyncedQuizContent(syncGroupId)` → `saveQuiz(fresh)` → `callJoinPlcQuizSyncGroup(plcId, plcQuizId)` (Cloud Function) → `attachSyncLinkage`. Server-side participant write precedes the local linkage attach so a later editor save publishes from a participant context.
  - **Copy** — pull canonical → `saveQuiz(fresh)`. No sync linkage; future PLC edits do NOT propagate.
- **New Cloud Function** `joinPlcQuizSyncGroup({plcId, plcQuizId})` (`functions/src/plcQuizSyncJoin.ts`). Mirrors the existing `joinSyncedQuizGroup` shape but resolves `syncGroupId` via `plcs/{plcId}/quizzes/{plcQuizId}` instead of `shared_assignments/{shareId}` — and adds an explicit Admin-SDK membership check so the caller can't sneak into a sync group by knowing the PLC quiz id alone. **Requires `firebase deploy --only functions:joinPlcQuizSyncGroup`** before the Sync import path will work in the staging or production environment; until then, Copy mode still works without the Cloud Function.
- **Permissions:** any current member can share / edit (via the synced group, after import) / unshare. The unshare action in the PLC tab is therefore visible on every row, not just rows the current user shared — this matches the Phase 5 notes/todos PLC-owned posture. The rules pin identity + attribution fields (`id`, `syncGroupId`, `sharedBy`, `sharedByEmail`, `sharedByName`, `sharedAt`) immutable on update so a teammate can't quietly retarget an entry or rewrite authorship while patching the title mirror.
- **Edit-in-place from the PLC tab is not in this PR.** The existing `QuizEditorModal` reads/writes Drive, which only works for quizzes already in the user's personal library. Members sync the quiz first ("Add to my library → Sync"), then edit from their library card; published edits propagate back to all teammates via the existing LWW infrastructure. Direct in-tab editing on the synced doc would need a Drive-less editor surface — explicitly out of scope here.
- **dev-paul branch convention:** Phase 2 was committed to `claude/shared-plc-implementation-TB67Z` and PR'd into `dev-paul`. The auth bypass was not exercised; manual smoke tests were not run because this environment lacks Firebase project access — verification falls to the dev preview URL and the human reviewer.

### Phase 2 follow-ups (not blockers; track separately)

These were surfaced in the final review pass and intentionally deferred to keep this PR focused. None block merge:

- **Modal i18n.** `PlcShareTargetModal` and `PlcQuizImportModal` use hardcoded English. Consistent with the sibling `QuizAssignmentImportModeModal.tsx` pattern — every share/import picker in this codebase is currently English-only. A separate localization sweep should bring all three modals plus the QuizManager kebab labels under `t()` together.
- **Rollback path tests.** `PlcQuizLibraryTab.handleImport` has a 3-stage rollback (leave sync group + delete personal quiz on partial failure) but no integration test exercising it. The shared-assignment importer's analogous path also has unit-only coverage today; adding this would be additive parity.
- **Cloud Function unit tests.** `joinPlcQuizSyncGroup` (`functions/src/plcQuizSyncJoin.ts`) has no `*.test.ts` sibling. The Firestore rules suite covers the subcollection's permissions, but the Admin-SDK transaction logic itself (membership re-check, idempotent `alreadyJoined`, version-bump invariants) isn't directly exercised. Sibling pattern: `syncedQuizGroups.test.ts` (Phase 1).
- **Modal title polish.** When the user clicks "Re-import" on an already-synced quiz, the `PlcQuizImportModal` header still reads "Add to my library". Minor UX nit — the import button label updates correctly, but the modal title doesn't acknowledge the re-import context.

---

## Phase 3 — PLC-authored Assignments tab _(SHIPPED)_

**Status:** Shipped via this PR into `dev-paul` (branch `claude/plc-assignments-subtabs-mxR1V`).

**Goal:** members can author assignments at the PLC level (so all teammates pick them up), AND any personal assignment that opts into PLC mode auto-bubbles up to the PLC dashboard. Three sub-tabs scope assignment views by lifecycle: Library / In-progress / Completed.

### What landed

- `components/plc/tabs/PlcAssignmentsTab.tsx` — container with three pill-style sub-tabs (Library / In-progress / Completed). Default is Library. Replaces the Phase 1 placeholder.
- `components/plc/tabs/PlcAssignmentsLibrarySubTab.tsx` — lists `plcs/{plcId}/assignments/` templates. "Add to my board" opens the sync-or-copy picker. "Unshare" removes the template (PLC-owned model — any member can unshare; teammates' already-imported personal assignments keep running).
- `components/plc/tabs/PlcAssignmentsInProgressSubTab.tsx` — filters `plcs/{plcId}/assignment_index` to `status in ['active','paused']`. Renders rows with green Active / amber Paused status pill.
- `components/plc/tabs/PlcAssignmentsCompletedSubTab.tsx` — filters the same index to `status === 'inactive'`. Identical row UX to the pre-Phase-3 top-level "Completed Assignments" tab.
- `components/plc/tabs/PlcAssignmentIndexRow.tsx` — shared row component used by In-progress and Completed (icon, title, owner, date, sheet link with `isSafeHttpUrl`, optional status pill).
- `components/plc/PlcAssignmentImportModal.tsx` — sync-or-copy picker. Mirrors `PlcQuizImportModal.tsx` exactly with assignment-specific copy.
- `hooks/usePlcAssignments.ts` (new) — live subscription + `shareAssignmentTemplate` / `deleteAssignmentTemplate` mutators + standalone `writePlcAssignmentTemplate(plcId, uid, input)` for fire-and-forget bubble-up.
- `hooks/usePlcAssignmentIndex.ts` — extended:
  - `parseEntry` now reads `status` and defaults missing/invalid values to `'active'` (legacy entries surface in In-progress until their owner deactivates them).
  - New `mirrorPlcAssignmentStatus(plcId, assignmentId, status)` helper — fire-and-forget `updateDoc({status})` on the index entry. Logs + swallows on error so the canonical pause/deactivate/reopen never blocks on the mirror.
- `hooks/useQuizAssignments.ts` — extended:
  - `createAssignment` now stamps `status: initialStatus` in the PLC index write AND fires a fire-and-forget template write to `plcs/{plcId}/assignments/` when `settings.plc` is set, the source quiz has a resolvable `syncGroupId` (via `options.plcTemplateSyncGroupId` or `options.syncedFrom`), and `options.skipPlcTemplateWrite !== true`. The skip flag is the contract that prevents the Library "Add to my board" import from recursively authoring another template.
  - `setStatus` and `reopenAssignment` now mirror the new status onto the PLC index via `mirrorPlcAssignmentStatus`. Lookups read `settings.plc.id` from a `useRef` mirror of the live `assignments` snapshot so callbacks stay stable.
- `hooks/useSyncedQuizGroups.ts` — new `callJoinPlcAssignmentSyncGroup(plcId, plcAssignmentId)` callable wrapper for the Phase 3 Cloud Function.
- `functions/src/plcAssignmentSyncJoin.ts` — new Cloud Function `joinPlcAssignmentSyncGroup`. Mirrors `plcQuizSyncJoin.ts` shape but resolves `syncGroupId` via the `plcs/{plcId}/assignments/` subcollection. Verifies caller is a current PLC member via Admin SDK before joining the canonical synced group. **Requires `firebase deploy --only functions:joinPlcAssignmentSyncGroup`** before the Sync import path will work in staging or production environments; until then, Copy mode still works without the Cloud Function.
- `firestore.rules`:
  - `plcs/{plcId}/assignment_index/{assignmentId}` widened with required `status` field (`in ['active','paused','inactive']`); `keys().hasOnly([...])` updated on both create and update branches; identity fields (`id`/`ownerUid`/`createdAt`) still immutable on update.
  - New `plcs/{plcId}/assignments/{plcAssignmentId}` block with full schema lock-down. Same posture as Phase 2's `quizzes/` block: any member can create / update mirrored fields / delete; identity + attribution fields are immutable.
- `types.ts` — `PlcAssignmentIndexEntry` gains `status: QuizAssignmentStatus`; new `PlcAssignmentTemplate` interface for the new subcollection.
- `components/plc/PlcDashboard.tsx`:
  - **Removed** the top-level `'completed'` tab (Phase 1's `PlcCompletedAssignmentsTab` is deleted; the same content folds into PLC Assignments → Completed sub-tab).
  - The `'assignments'` placeholder is replaced with a real render: `<PlcAssignmentsTab plc={plc} />`.
- `components/plc/overview/tiles/CompletedAssignmentsTile.tsx` — overview bento tile's "View all" button now navigates to `'assignments'` instead of `'completed'`.
- `locales/en.json` — new keys `plcDashboard.assignmentsSubTabs.*`, `plcDashboard.assignmentsLibrary.*`, `plcDashboard.assignmentsInProgress.*`. The `completedAssignments.*` block stays (re-used by the new Completed sub-tab).
- Tests: `tests/hooks/usePlcAssignmentIndex.test.ts` extended (status parsing, legacy default, status pill data, `mirrorPlcAssignmentStatus`); `tests/hooks/useQuizAssignments.test.ts` extended (initial status mirror, template write side-effect, `skipPlcTemplateWrite` skip path, no-syncGroupId skip path); `tests/rules/plcAssignmentIndex.test.ts` updated to include the required `status` field in the canonical valid-entry payload.

### Resolved decisions (this PR)

- **Personal PLC toggle behavior:** creates a brand-new PLC-level template (clean separation; personal assignment stays personal). The `useQuizAssignments.createAssignment` reverse-bubble-up implements this via `writePlcAssignmentTemplate`.
- **Template deletion semantics:** orphan-tolerant. Deleting a Library template does NOT cascade — already-imported personal assignments on teammates' boards keep running.
- **Sub-tab structure (TBD answered):** three sub-tabs (Library / In-progress / Completed) inside PLC Assignments. Pre-Phase-3 top-level "Completed Assignments" tab folded into Completed sub-tab and removed from `PlcDashboard`. Disabling the `assignments` feature flag now hides the entire tab — including completed history — by design.
- **In-progress signal:** `status` field on `PlcAssignmentIndexEntry`; mirrored fire-and-forget on every status mutation. In-progress = `status in ['active','paused']`; Completed = `status === 'inactive'`.

### Notes from implementation

- **Cloud Function deploy required for Sync mode.** The `joinPlcAssignmentSyncGroup` function must be deployed before the Library "Add to my board → Sync" path works against a real Firebase project. Copy mode works without the Cloud Function. Deploy command: `firebase deploy --only functions:joinPlcAssignmentSyncGroup`.
- **Bubble-up is conditional on a synced-group pointer.** `useQuizAssignments.createAssignment` writes a template ONLY when the source quiz already participates in a synced group (via `quiz.sync.groupId` surfaced via the new `options.plcTemplateSyncGroupId`, or via the `options.syncedFrom` linkage). The hook does NOT promote a Drive-only quiz to a synced group at this layer — promotion needs Drive content the hook doesn't have in scope. The follow-up below documents wiring the QuizWidget's settings modal toggle to call `createSyncedQuizGroup` first; for now, only quizzes that have already been shared (Phase 2) or imported via sync auto-bubble templates.
- **Status mirror via `useRef`.** The status mutators look up `settings.plc.id` from a `useRef<QuizAssignment[]>` updated via `useEffect`. Direct ref-during-render is blocked by the `react-hooks/refs` lint rule; the effect path is what passes lint while still avoiding the callback-recreation churn.
- **Legacy index entries default to `'active'`.** Pre-Phase-3 entries lack the `status` field. The parser coerces missing/invalid values to `'active'` so they surface in the In-progress sub-tab. There is no admin sweep; the owner can deactivate the source assignment to migrate the entry to Completed naturally.
- **Top-level Completed tab removal is deliberate.** Per the user-confirmed design, disabling the `assignments` feature flag now hides the completed history along with everything else assignment-related. Documented as a behavior change.
- **`PlcAssignmentsTab` does NOT use the lazy WidgetRegistry pattern** — it's a single component (with three sub-components) imported directly from `PlcDashboard.tsx`. This matches the rest of the PLC tabs (Quiz Library, Notes, Todos) and keeps the routing simple.
- **Verification gap:** this environment lacks Firebase project access, so manual smoke tests against a real project did not run. Type-check + lint + Prettier + 2173 unit tests + 193 functions tests + production build + functions build all pass. Verification falls to the dev preview URL and the human reviewer per the Phase 2 precedent.

### Phase 3 follow-ups (not blockers; track separately)

- ~~**Bubble-up for Drive-only PLC quizzes.**~~ **Shipped (PR #1557).** `Widget.tsx → onAssign` now promotes Drive-only quizzes to a synced group ahead of `createAssignment` when `plcLinkage` is set and `meta.sync` is missing — mirrors `handleShareWithPlc` for the create-group + attach-linkage + leave-on-failure rollback shape. Result: every PLC-mode personal assignment authors a Library template, regardless of whether the source quiz was already shared.
- **Cloud Function unit tests.** `joinPlcAssignmentSyncGroup` (`functions/src/plcAssignmentSyncJoin.ts`) has no `*.test.ts` sibling. Same gap as Phase 2's `joinPlcQuizSyncGroup`.
- **Modal i18n.** `PlcAssignmentImportModal.tsx` uses hardcoded English (matches the sibling `PlcQuizImportModal.tsx` and `QuizAssignmentImportModeModal.tsx`). Localize all three together when the locale sweep happens.
- ~~**Library template editing.**~~ **Shipped via the Quiz Library tab (PR #1557).** Edit affordance landed on `PlcQuizLibraryTab` rather than the assignment-template Library sub-tab — the underlying canonical (the synced group) is the same, so editing from the Quiz Library propagates to teammates AND to anyone who imported the assignment template. The assignment-template Library sub-tab still has no inline edit; a future iteration could surface the same affordance there for symmetry, but it'd hit the same canonical, so it's a UX-only improvement.
- **`status` field on the `assignments` template subcollection.** Templates currently have no lifecycle status — they're either present (pickup-able) or absent (unshared). If we want "this template is no longer being run" without unsharing it, that's a future schema extension.

### Notes from PR #1557 (closing two follow-ups)

- **Promote-on-assign mirrors `handleShareWithPlc` shape.** Same create → attach-linkage → leave-on-failure rollback. Skips the `plcs/{plcId}/quizzes/{plcQuizId}` header write — bubble-up is about the assignment template, not a discoverable shared-quiz entry. Best-effort: any failure logs via `logError` and falls through; the assignment still creates and the In-progress index entry still surfaces.
- **Edit-in-place leans entirely on Phase 2 sync-group machinery.** The Edit button on `PlcQuizLibraryTab` rows resolves a personal copy (auto-importing via Sync if missing), then opens the existing `QuizEditorModal`. Saves go through `useQuiz.saveQuiz`, which already publishes to `synced_quizzes/{groupId}` via the existing LWW infrastructure. **No fork of `QuizEditorModal`, no Drive-less editor surface** — confirms the locked decision "Lean on existing `synced_quizzes/{groupId}` machinery" was the right call.
- **Auto-import edge case (deferred).** If the user has the quiz only as a Copy (no `sync.groupId`), Edit creates a SECOND personal copy that's synced. Acceptable trade-off — retroactively switching a Copy to Sync without losing local edits is a separate problem.
- **Drive-disconnected guard.** Edit button is disabled when `isDriveConnected` is false; the existing amber Drive-disconnected banner already covers messaging.

---

## Phase 4 — Video Activities _(SHIPPED)_

**Status:** Shipped via the fully-fledged PR into `dev-paul` (branch `claude/plc-fully-fledged`).

**Goal:** extend video activities with the same PLC linkage + dashboard surface that quizzes already have.

### What landed

- `types.ts` — new `PlcVideoActivityEntry` (lightweight header for `plcs/{plcId}/video_activities/{plcVideoActivityId}`). Carries `youtubeUrl` in addition to the quiz-entry fields so the tile + tab can render a thumbnail without loading the full content blob.
- `hooks/usePlcVideoActivities.ts` (new) — live subscription + `shareVideoActivityWithPlc` / `mirrorPlcVideoActivityHeader` / `unshareVideoActivityFromPlc` mutators. Standalone `writePlcVideoActivityEntry` for the share-from-widget path. Mirrors `usePlcQuizzes` exactly.
- `hooks/useVideoActivityAssignments.ts` — `createAssignment` now persists `settings.plc` onto the assignment doc (was being dropped pre-PR; the spread missed the field — silent regression caught while wiring this phase). Writes a fire-and-forget `writePlcAssignmentIndexEntry({kind: 'video-activity'})` when `settings.plc` is set. Status mutators (`pauseAssignment` / `resumeAssignment` / `deactivateAssignment` / `reactivateAssignment`) now call `mirrorPlcAssignmentStatus` via a `useRef<VideoActivityAssignment[]>` lookup mirror (mirrors the Phase 3 `useQuizAssignments` pattern).
- `functions/src/plcVideoActivitySyncJoin.ts` (new) — `joinPlcVideoActivitySyncGroup` Cloud Function. Mirrors `plcQuizSyncJoin.ts` but resolves the synced group via `plcs/{plcId}/video_activities/{...}` and joins `synced_video_activities/{groupId}` (different sync collection than quizzes). Admin-SDK membership check before participant write. **Requires `firebase deploy --only functions:joinPlcVideoActivitySyncGroup`** before Sync-import works in real Firebase; Copy mode works without it.
- `hooks/useSyncedVideoActivityGroups.ts` — new `callJoinPlcVideoActivitySyncGroup(plcId, plcVideoActivityId)` callable wrapper.
- `firestore.rules` — new `match /plcs/{plcId}/video_activities/{plcVideoActivityId}` block. Same `keys().hasOnly([...])` lockdown as the Phase 2 quiz library block, plus a `youtubeUrl is string` constraint. Identity + attribution fields (`id`, `syncGroupId`, `sharedBy`, `sharedByEmail`, `sharedByName`, `sharedAt`) immutable on update.
- `components/plc/PlcVideoActivityImportModal.tsx` (new) — sync-or-copy picker, mirror of `PlcQuizImportModal`.
- `components/plc/bodies/PlcVideoActivitiesBody.tsx` (new) — full list + import modal + inline editor. Mirrors `PlcQuizLibraryBody` shape with one deliberate divergence: no version-conflict auto-pull on save (`useVideoActivity.saveActivity` doesn't detect synced-group version conflicts at save time — documented in the file header).
- `components/plc/tabs/PlcVideoActivitiesTab.tsx` (new) — tab-mode shim.
- `components/plc/overview/tiles/VideoActivitiesTile.tsx` (new) — replaces the `ComingSoonTile` placeholder for `videoActivities`.
- `components/plc/PlcDashboard.tsx` — removed the `placeholder` block on the `videoActivities` tab def, routes the tab to `PlcVideoActivitiesTab`, adds the fullscreen-expansion case for the bento tile.
- `components/widgets/VideoActivityWidget/Widget.tsx` — new `handleShareWithPlc` (load Drive content → mint synced group if not synced → attach linkage → write PLC subcoll doc; same rollback shape as `QuizWidget`). Adds `usePlcs()`, `PlcShareTargetModal`, and a `shareWithPlcTarget` state.
- `components/widgets/VideoActivityWidget/components/VideoActivityManager.tsx` — new `onShareWithPlc` prop + library-row kebab item, hidden when the prop is omitted (matches the QuizManager test-harness pattern).

### Notes from implementation

- **`settings.plc` was being dropped on VA assignment create.** The `createAssignment` spread had `className`, `sessionSettings`, `sessionOptions`, `scoreVisibility`, `periodNames`, `rosterIds` but not `plc`. This meant any VA assignment authored with PLC mode had its PLC linkage silently stripped — the assignment ran, but PLC index entries had no source linkage and status mirroring never fired. Spread `settings.plc` onto the assignment doc to fix; this is a real bug regression that pre-dates this PR and only surfaces once the index-write path exists to consume it. No backfill — pre-existing VA assignments that intended PLC mode are stranded.
- **Status mirror uses `useRef`-mirrored snapshot.** The status mutators look up `plc.id` from a `useRef<VideoActivityAssignment[]>` synced via effect (matches the Phase 3 `useQuizAssignments` pattern). The direct-ref pattern is blocked by `react-hooks/refs` lint here for the same reason as the quiz hook; the effect path is the workaround.
- **No version-conflict UX on edit save.** `useVideoActivity.saveActivity` writes through to Drive + Firestore unconditionally — there's no `SyncedVideoActivityVersionConflictError` analogue to `SyncedQuizVersionConflictError`. A teammate publishing concurrently to the same group loses to last-writer-wins on `synced_video_activities/{groupId}`. The canonical doesn't tear (the synced-group publish path is debounced LWW per field), but the local `lastSyncedVersion` may briefly lag until the next pull. Acceptable for v1; a future iteration could surface a "Refresh from PLC" affordance in the editor.
- **VA assignment template subcollection deferred.** The roadmap mentioned two paths in "Phase 4 starter": (a) widen `PlcAssignmentTemplate` with a `kind` discriminator, or (b) add a separate `plcs/{plcId}/video_activity_templates/`. Neither shipped — the PR opted to surface VAs through the **library** (`plcs/{plcId}/video_activities/`) only, not via assignment templates. Teachers create personal VA assignments with PLC mode → the assignment-index entry surfaces on the In-progress sub-tab, but there's no template equivalent in the Library sub-tab yet. A future iteration can add VA templates if the demand materializes.
- **Cloud Function unit tests not added in this PR.** Mirrors the Phase 2/3 gap. A combined backfill PR for `joinPlcQuizSyncGroup` + `joinPlcAssignmentSyncGroup` + `joinPlcVideoActivitySyncGroup` is the natural follow-up.

### Phase 4 follow-ups (not blockers; track separately)

- **VA assignment-template subcollection.** See "Notes" above — current PR ships library-only.
- **Version-conflict UX on inline edit.** Mirror `SyncedQuizVersionConflictError` for VAs.
- **Modal i18n.** `PlcVideoActivityImportModal` uses hardcoded English. Same gap as Phase 2/3 modals.

---

## Phase 5 — Notes + To-Do list

**Goal:** lightweight collaborative shared docs at the PLC level.

### Scope

- `plcs/{plcId}/notes/{noteId}` subcollection — shared rich-text notes. Each note has `title`, `body` (markdown or simple HTML), `lastEditedBy`, `lastEditedAt`. Any member can create/edit/delete.
- `plcs/{plcId}/todos/{todoId}` subcollection — shared task list. Each todo has `text`, `done: boolean`, `createdBy`, `createdAt`, optionally `assignedTo: uid`.
- `PlcNotesTab.tsx` and `PlcTodosTab.tsx` replace placeholders.

### Architectural notes

- Notes editing: same LWW pattern as synced quizzes (debounced field writes). For Phase 5 we don't need version monotonicity (notes are a single doc, not a structured quiz tree) — last write wins on the whole `body` field is acceptable.
- For todos, prefer a subcollection (one doc per todo) over a single doc with an array — array writes serialize the whole list and don't scale to dozens of items with concurrent edits.

### Open questions

- Should notes support multiple notes per PLC (e.g. "meeting notes from May 7") or a single shared notepad? Recommend: **multiple notes** (matches the subcollection model). Confirm.
- Are todos owned by the PLC or per-member? Recommend: **PLC-owned with optional `assignedTo`** so any member can mark any todo complete. Confirm.

### Notes from implementation

Shipped together with Phase 1.5 (Overview + bento grid + sidebar kebab). See "Phase 1.5" below for the details that affect future phases.

---

## Phase 1.5 — Overview tab + bento grid + sidebar kebab _(SHIPPED)_

**Status:** Shipped together with Phase 5 (Notes + To-Dos).

### What landed

- `components/plc/tabs/PlcOverviewTab.tsx` — new default landing tab. Wraps the bento grid with an Edit Layout / Reset toggle.
- `components/plc/overview/PlcBentoGrid.tsx` — dnd-kit `SortableContext` + `DragOverlay` + closest-center collision detection. Mirrors `components/common/library/LibraryGrid.tsx` exactly (the canonical sortable pattern in this codebase — do not invent a new shape).
- `components/plc/overview/PlcBentoTile.tsx` — sortable tile wrapper. Drag handle scoped to a grip icon (so tile content stays interactive when not dragging). Resize button cycles `sm → md-wide → md-tall → lg`. Hide button moves the tile into a "Hidden tiles" tray below the grid.
- `components/plc/overview/tileRegistry.tsx` — central switchboard for tile content, keyed by `PlcBentoTileKind`. Adding a new tile = a new case here + a new union member in `types.ts`. (Originally each unshipped phase routed through a shared `ComingSoonTile`; that file was removed once Phases 2–4 + 6 all shipped live tiles.)
- `components/plc/overview/tiles/*` — live tile content for every shipped `PlcBentoTileKind`.
- `hooks/usePlcOverviewLayout.ts` — per-user layout persistence at `users/{uid}/plc_layouts/{plcId}`. Optimistic local state with debounced (~500ms) writes; `lastWrittenAt` guard so an in-flight snapshot doesn't clobber a fresher local rearrangement; pending write flushes on unmount.
- `firestore.rules` — new `match /users/{userId}/plc_layouts/{plcId}` block (owner-only, schema lock-down via `keys().hasOnly([...])`).
- `components/layout/sidebar/SidebarPlcs.tsx` — refactored. Each PLC card is now a single click target (backdrop button + layered visible content with `pointer-events-none`); secondary actions (edit/view, delete/leave) live in a kebab popover. Whole-card hover state and chevron-right affordance.

### Notes from implementation

- **dnd-kit usage in this codebase:** the canonical sortable pattern lives in `components/common/library/LibraryGrid.tsx` + `useSortableReorder.ts`. Mirror its sensor activation (`PointerSensor { distance: 5 }`), collision detection (`closestCenter`), strategy (`rectSortingStrategy`), and overlay (`DragOverlay` with `snapCenterToCursor`). An earlier exploration that "found" zero dnd-kit usage was wrong — when in doubt, search for `useSortable` and `SortableContext` imports.
- **Heterogeneous tile sizes:** the bento grid mixes 1×1, 2×1, 1×2, and 2×2 tiles inside a CSS grid. `closestCenter` is forgiving enough for the current ~10-tile size; if jitter shows up at scale the documented mitigation is to collapse non-active tiles to 1×1 during drag (`activeId != null` ⇒ render-time span override) so the sort math sees uniform rects.
- **Resize via cycle button:** the alternative — drag-resize against a CSS-grid container — would require quantizing pointer deltas to grid cells and is a notable rabbit hole. The 4-state cycle button (sm→md-wide→md-tall→lg→sm) is much cheaper and is well-discoverable with a tooltip.
- **Per-tile drag handle is mandatory:** without binding `{...listeners}` to a specific grip icon (instead of the whole tile), tile content (e.g. note row click handlers) becomes inert. The bento tile additionally suppresses content interaction with `pointer-events-none` while `editMode` is on.
- **Sidebar click affordance:** the previous split-row layout (left button + right icons) was already two real `<button>`s side-by-side, but the affordance was unclear. The new layout uses an absolute-positioned backdrop `<button>` covering the whole card with `pointer-events-none` on the visible content — clicks pass through to the backdrop unless they hit the kebab. This avoids the invalid nested-button HTML the previous design was working around.

---

## Phase 5 — Notes + To-Do list _(SHIPPED)_

**Status:** Shipped together with Phase 1.5 (see above for the bundling rationale).

### What landed

- `plcs/{plcId}/notes/{noteId}` subcollection — `{ id, title, body, createdBy, createdAt, lastEditedBy, lastEditedAt }`. Any member CRUD; `createdBy`/`createdAt`/`id` immutable on update; `lastEditedBy` must equal `request.auth.uid` on every update. Members can also delete (PLC-owned model — notes are shared, not creator-owned).
- `plcs/{plcId}/todos/{todoId}` subcollection — `{ id, text, done, createdBy, createdAt }`. Any member CRUD; `createdBy`/`createdAt`/`id` immutable. One doc per todo (not an array on a parent doc) so concurrent toggles don't serialize against the whole list.
- `hooks/usePlcNotes.ts`, `hooks/usePlcTodos.ts` — live subscriptions + CRUD mutators. The hook pattern mirrors `usePlcAssignmentIndex.ts` (parser drops malformed entries, listener disabled with `null` plcId, no useEffect for state-on-prop-change).
- `components/plc/tabs/PlcNotesTab.tsx` — two-pane (list + editor). Plain textarea body editing; debounced (~500ms) writes via `updateNote`. Snapshot updates apply to the editor only when there's no pending local write.
- `components/plc/tabs/PlcTodosTab.tsx` — single list. Add input + click-to-edit-inline + completed section.

### Open questions resolved

- **Multi-note vs. single notepad:** Multi-note model. Subcollection-per-note matches the rest of the app's collaborative pattern.
- **Optional `assignedTo` on todos:** Deferred. Not in this PR. Add later as a non-breaking schema extension (the rules' `keys().hasOnly([...])` would need to widen).

### Out of scope (still)

- Rich text in notes (we ship plain textarea — Markdown is fine via convention; no rendering yet).
- Per-todo `assignedTo` field.
- Notification when a teammate changes shared content.

---

## Phase 6 — Shared Boards surface _(SHIPPED)_

**Status:** Shipped via the fully-fledged PR into `dev-paul` (branch `claude/plc-fully-fledged`).

**Goal:** surface dashboards (boards) that have been shared with a PLC.

### What landed

- `hooks/useFirestore.ts` — `shareDashboard(dashboard, intendedMode?, hostDisplayName?, plcId?)` now writes `plcId` onto the `/shared_boards/{shareId}` doc when set.
- `context/DashboardContext.tsx` — `shareDashboard(dashboard, intendedMode?, plcId?)` plumbs the new arg. When `plcId` is set, the Drive-fallback path is intentionally bypassed (Drive-only shares wouldn't be visible to the PLC tab's Firestore query).
- `context/DashboardContextValue.ts` — public `shareDashboard` signature widened.
- `hooks/usePlcSharedBoards.ts` (new) — live subscription to `shared_boards where plcId == plcId`, sorted newest-edit-first. Returns a lightweight `PlcSharedBoardEntry` slice (id, name, originalAuthor, originalAuthorName, intendedMode, widgetCount, timestamps) rather than the full share-doc payload.
- `firestore.rules` — collaborator-update branch on `/shared_boards/{shareId}` now pins `plcId` immutable. Host updates can still change it (matches the existing posture: host = full content + metadata mutability except `intendedMode`).
- `components/plc/bodies/PlcSharedBoardsBody.tsx` (new) — list with per-row "Open share" link routing to `/share/{shareId}` (deep-links into the existing share-import flow; recipient gets the host's chosen `intendedMode` picker).
- `components/plc/tabs/PlcSharedBoardsTab.tsx` (new) — tab-mode shim.
- `components/plc/overview/tiles/SharedBoardsTile.tsx` (new) — replaces the last `ComingSoonTile` usage (sharedBoards). Rows are non-clickable previews; "Open boards" footer navigates to the tab.
- `components/plc/PlcDashboard.tsx` — removed `placeholder` block on the `sharedBoards` tab def, routes the tab to `PlcSharedBoardsTab`, adds the fullscreen-expansion case.
- `components/share/ShareLinkCreatorModal.tsx` — optional "Also share with a PLC" dropdown (rendered only when the user has ≥1 PLC memberships). Selecting a PLC plumbs `plcId` through `shareDashboard`.

### Notes from implementation

- **No new rule branch needed for reads.** The existing `/shared_boards` rule already grants read to any authenticated user — PLC scoping happens client-side via the `where plcId == ...` query filter. This is a convenience pivot, not a security boundary; a hostile client could list arbitrary shares by removing the filter (matches the pre-Phase-6 status quo).
- **Drive-fallback bypass when `plcId` is set.** Non-admin Drive shares are one-time exports that wouldn't appear in the PLC tab; we skip the Drive path entirely when the caller scoped to a PLC.
- **Host can re-scope, collaborator cannot.** The rules pin `plcId` immutable on the collaborator-update branch (so a teammate who joined a non-PLC share can't silently retarget someone else's share at an arbitrary PLC, or strip the PLC scope from a PLC-shared board). The host-update branch leaves `plcId` mutable so the originalAuthor can un-scope a share they regret tagging.
- **PLC scope picker is opt-in.** The dropdown defaults to "Don't scope to a PLC" — the existing flow (send link directly to a colleague) keeps working exactly as before. Only teachers who actively pick a PLC get the new behavior.
- **Resolved open question (read-only vs editable).** As recommended in the original roadmap, PLC-shared boards are surfaced read-only / copy. Editing is reserved for the existing `/share/:id` flow where the recipient picks Synced (joins as collaborator) or Copy (snapshot). No new multi-teacher LWW infrastructure was needed.

### Phase 6 follow-ups (not blockers; track separately)

- **Tile-level "Copy to my dashboards" action.** Currently the only action on the tile and tab is "Open share" → standard import picker. An inline "Copy" affordance would shortcut the picker to copy mode for the common "I just want a snapshot" case.
- **PLC scope visible in Sidebar.** When the host re-opens the share modal on an already-shared board, the PLC scope isn't displayed back — the modal always defaults to "Don't scope to a PLC." A round-trip on the current share state would let the host see (and remove) the scope without resharing.
- **Modal copy.** "Also share with a PLC (optional)" is hardcoded English. Group with the Phase 2/3/4 modal i18n sweep when that lands.

---

## Cross-cutting concerns

### i18n

Each phase adds strings under `locales/en.json` `plcDashboard.*`. The other locales (`de.json`, `es.json`, `fr.json`) pick them up automatically via `defaultValue` fallbacks in `t()` calls — explicit translations can be backfilled later.

### Telemetry

Errors in best-effort writes (assignment index, sync group joins) go through `logError(scope, err, context)`. Use stable `scope` strings so log queries don't break across releases. Pattern:

```ts
logError('usePlcAssignmentIndex.snapshot', err, { plcId });
logError('writePlcAssignmentIndexEntry.write', err, { plcId, entryId });
```

### Testing

- **Hooks:** unit tests with mocked Firestore SDK, mirror `tests/hooks/usePlcAssignmentIndex.test.ts`.
- **Rules:** emulator-backed tests, mirror `tests/rules/plcAssignmentIndex.test.ts`. CI's "Firestore Rules Tests" job runs them automatically.
- **Integration:** every new `createX` call site must have at least one test that asserts the side-effect (e.g. "PLC index entry is written when settings.plc is set").

### Performance

- Don't load PLC content while the dashboard is closed. Hooks accept an `enabled` option (see `usePlcs.ts`). Mirror this pattern.
- Don't add new top-level collections — every PLC subcollection is automatically gated by the parent PLC's membership check. A top-level `plc_quizzes` collection would need a `plcId` field on every doc and a rule that does an extra `get()`, doubling the read cost.

### Security

- Every PLC subcollection rule must:
  1. Gate reads on PLC membership (`request.auth.uid in get(plcDoc).data.memberUids`).
  2. Lock writes to the canonical schema via `keys().hasOnly([...])`.
  3. Pin any user-controlled URL field to a known canonical source (anti-phish pattern from Phase 1's `sheetUrl`).
  4. Split create vs update so update can also check the **existing** `resource.data` for ownership/immutability.

---

## Open questions

_(Add new ones here as they come up. Resolve before starting the affected phase.)_

- **Phase 6:** read-only vs. editable for PLC-shared boards.

Resolved:

- ~~**Phase 2:** orphan behavior when sharer deletes their personal copy of a synced PLC quiz.~~ → PLC copy stays (orphan-tolerant). See Phase 2 "Notes from implementation".
- ~~**Phase 5:** single shared notepad vs. multiple notes per PLC.~~ → Multi-note. Shipped.
- ~~**Phase 5:** are todos PLC-owned or per-member?~~ → PLC-owned, optional `assignedTo` deferred. Shipped.
- ~~**Phase 3:** does the personal "PLC option" toggle create a brand-new PLC-level assignment template, or fork from the personal one?~~ → Brand-new template. Shipped.
- ~~**Phase 3:** what happens to in-flight imports if the PLC-level template is deleted?~~ → Imports keep running (orphan-tolerant). Shipped.
- ~~**Phase 3 (TBD):** bottom-half of the PLC Assignments tab — completed-assignments index here vs. its own top-level tab.~~ → Folded into a Completed sub-tab; pre-Phase-3 top-level tab removed. Shipped.

---

## Phase 7 starter — Mini-apps PLC integration (proposed)

**Status:** Not in the original roadmap. Proposed during the fully-fledged PR design pass — the user wanted mini-apps to participate in PLC sharing like quizzes and video activities do. The Phase 4 work (`/plcs/{plcId}/video_activities/`) is the closest pattern; mirror it.

**Goal:** members can share a personal mini-app with their PLC, edit it collaboratively, and import it (sync-or-copy) into their personal mini-app library. Mini-app assignments authored with `settings.plc` set should also surface on the In-progress / Completed sub-tabs.

**What's already in place (use these — don't reinvent):**

- `PlcAssignmentIndexEntry.kind` is a string discriminator. The rule + parser currently accept `'quiz'` and `'video-activity'`; widen the union to `'mini-app'` in `usePlcAssignmentIndex.parseEntry` AND the rule's `kind in [...]` check.
- `mirrorPlcAssignmentStatus` from `usePlcAssignmentIndex.ts` is generic — call it the same way `useQuizAssignments` / `useVideoActivityAssignments` do.
- The Phase 4 sync-join Cloud Function (`plcVideoActivitySyncJoin.ts`) is the closest template — resolve the synced-group id via `plcs/{plcId}/mini_apps/{plcMiniAppId}` and join the canonical `/synced_mini_apps/{groupId}` group (this group collection may need to be added if it doesn't exist yet).
- `firestore.rules` Phase 4 `video_activities/` block is the closest template — copy it, swap field names.

**Files to touch (likely):**

- `types.ts` — new `PlcMiniAppEntry` (mirror `PlcVideoActivityEntry`); ensure `MiniAppAssignmentSettings` carries `plc?: PlcLinkage`.
- `hooks/useMiniApps.ts` (or whichever hook owns mini-app metadata) — add `attachSyncLinkage` if not present.
- `hooks/usePlcMiniApps.ts` (new) — mirror `hooks/usePlcVideoActivities.ts`.
- `hooks/useMiniAppAssignments.ts` — extend `createAssignment` to write `assignment_index` entries with `kind: 'mini-app'`; status mirroring on pause/end.
- `firestore.rules` — new `match /plcs/{plcId}/mini_apps/{plcMiniAppId}` block + widen `assignment_index.kind` to include `'mini-app'`.
- `functions/src/plcMiniAppSyncJoin.ts` (new) — mirror `plcVideoActivitySyncJoin.ts`.
- `hooks/useSyncedMiniAppGroups.ts` — add `callJoinPlcMiniAppSyncGroup` (and create the file + Cloud Function if synced mini-apps don't exist yet — bigger scope).
- `components/plc/bodies/PlcMiniAppsBody.tsx` + `tabs/PlcMiniAppsTab.tsx` + `overview/tiles/MiniAppsTile.tsx` (new).
- `components/widgets/MiniApp/...` — add the share-with-PLC kebab + `handleShareWithPlc` mirroring `VideoActivityWidget.Widget.tsx`.
- `components/plc/PlcDashboard.tsx` — add `'miniApps'` to the `PlcDashboardTabId` union + `TABS` array, route the tab.
- `components/plc/overview/tileRegistry.tsx` — add the `'miniApps'` case.

**Branch convention:** open `claude/plc-phase-7-<slug>` off `dev-paul`.

**Wildcard:** mini-apps may NOT yet have a synced-groups infrastructure (`synced_mini_apps/{groupId}`). Quiz + VA both had it before their PLC phases started. If absent, Phase 7 needs to stand it up (mirror `syncedVideoActivityGroups.ts`) — that's the bigger lift in this phase, not the PLC plumbing on top.

---

## Phase 8 starter — Guided Learning PLC integration (proposed)

**Status:** Not in the original roadmap. Proposed during the fully-fledged PR design pass alongside Phase 7. Same pattern as Phase 4/7.

**Goal:** mirror Phase 7 for Guided Learning sets — members share, sync-edit, and import collaboratively.

**Files to touch (likely):**

- `types.ts` — new `PlcGuidedLearningEntry`; ensure `GuidedLearningAssignmentSettings` carries `plc?: PlcLinkage`.
- `hooks/useGuidedLearning.ts` — `attachSyncLinkage` if not present.
- `hooks/usePlcGuidedLearning.ts` (new).
- `hooks/useGuidedLearningAssignments.ts` — PLC index writes with `kind: 'guided-learning'`; status mirroring.
- `firestore.rules` — new `match /plcs/{plcId}/guided_learning/{plcGuidedLearningId}` block + widen `assignment_index.kind`.
- `functions/src/plcGuidedLearningSyncJoin.ts` (new).
- `hooks/useSyncedGuidedLearningGroups.ts` — add `callJoinPlcGuidedLearningSyncGroup`.
- `components/plc/bodies/PlcGuidedLearningBody.tsx` + `tabs/PlcGuidedLearningTab.tsx` + `overview/tiles/GuidedLearningTile.tsx` (new).
- `components/widgets/GuidedLearning/...` — share-with-PLC kebab.
- `PlcDashboard.tsx` + `tileRegistry.tsx` — wire the new tab + tile.

**Branch convention:** open `claude/plc-phase-8-<slug>` off `dev-paul`.

**Wildcard:** same as Phase 7 — verify a `synced_guided_learning/{groupId}` collection exists before assuming the LWW infrastructure is in place.

---

## Cross-cutting follow-ups (not blockers; track separately)

These surfaced across multiple phases and are deliberately deferred:

**Resolved in `claude/plc-polish` follow-up PR:**

- ~~**ComingSoonTile cleanup.**~~ File deleted; comments referencing it cleaned up in `tileRegistry.tsx`, `ActiveAssignmentsTile.tsx`, and `SharedBoardsTile.tsx`.

**Still open:**

- **In-tab "+ New PLC Assignment" affordance.** Currently teachers author a PLC assignment by going to their personal Quiz / Video Activity widget, picking an item, and toggling PLC mode in the assign modal. The PLC Assignments → Library sub-tab is consume-only. Adding a "+ Share a quiz / VA with this PLC" button inside the tab that opens a personal-library picker + assign flow would close the discoverability gap.
- **Rich tile actions (Phase 2+ kebabs).** Quiz Library / Video Activities / Shared Boards tile rows currently navigate-to-tab on click. The user explicitly wanted "most actions doable from the tile" — a follow-up should add inline import / unshare / edit kebab items per row. The blocker today is that the tile doesn't carry the `useQuiz` / `useVideoActivity` subscription needed to drive those actions; the cleanest path is a small shared hook the body and tile both consume.
- **Modal i18n sweep.** Every PLC modal (`PlcShareTargetModal`, `PlcQuizImportModal`, `PlcVideoActivityImportModal`, `PlcAssignmentImportModal`, `ShareLinkCreatorModal` PLC dropdown, `QuizAssignmentImportModeModal`) uses hardcoded English. Group them in a single i18n PR rather than touching each one independently.
- **Cloud Function unit tests.** `joinPlcQuizSyncGroup`, `joinPlcAssignmentSyncGroup`, and `joinPlcVideoActivitySyncGroup` all lack direct `*.test.ts` siblings. Firestore-rules tests cover the subcollection permissions; the Admin-SDK transaction logic (membership re-check, idempotent `alreadyJoined`) isn't directly exercised. Sibling pattern: `syncedQuizGroups.test.ts` (Phase 1).

---

**Last updated:** 2026-05-12 (fully-fledged PR — Phase 4 + Phase 6 shipped together with the `activeAssignments` tile bug fix and the rich-tile read-side polish; Phase 7/8 added as proposed extensions)
