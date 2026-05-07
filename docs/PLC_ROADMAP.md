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
- [ ] **Phase 2** — PLC Quiz Library (share-with-PLC, collaborative editing, sync-or-copy import)
- [ ] **Phase 3** — PLC-authored Assignments tab + auto-bubble-up from personal assignments
- [ ] **Phase 4** — Video Activities (extend with `PlcLinkage` + dashboard surface)
- [ ] **Phase 5** — Notes + To-Do list (collaborative shared docs)
- [ ] **Phase 6** — Shared Boards surface

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

### Open question

- When the original sharer **deletes** their personal copy of a quiz that's been synced to a PLC, does the PLC copy stay (orphan-tolerant) or get pulled? Recommend: **stays.** PLC copy lives in its own subcollection; deleting your personal version doesn't affect the PLC's shared version. Confirm with user before implementing.

### Notes from implementation

_(Fill in after shipping.)_

---

## Phase 3 — PLC-authored Assignments tab

**Goal:** members can author assignments at the PLC level (so all teammates pick them up), AND any personal assignment that opts into PLC mode auto-bubbles up to the PLC dashboard.

### Scope

- New `plcs/{plcId}/assignments/{assignmentId}` subcollection. PLC-level assignments differ from the personal `quiz_assignments` collection: they're created without a teacher's class targeting, and members opt in by importing them onto their own board.
- New `PlcAssignmentsTab.tsx` (replaces the placeholder, distinct from `PlcCompletedAssignmentsTab`):
  - **Top half:** PLC-authored assignments awaiting member pickup. Each row has "Add to my board" (sync-or-copy picker).
  - **Bottom half:** the existing completed-assignments index (or move it into a sub-tab here — TBD).
- The reverse path: when a member toggles "PLC" inside the personal `QuizAssignmentSettingsModal`, the assignment auto-creates a corresponding PLC-level entry too. (Phase 1 already writes to `assignment_index` for the completed view; Phase 3 extends this with a "live assignment" entry for the authoring tab.)

### Architectural notes

- A PLC-level assignment is essentially a parameterized template: quiz reference, session options, attempt limit, `sessionMode`. It does NOT carry `classIds` / `rosterIds` (those are per-importer).
- The "Add to my board" action calls the existing `createAssignment` with the PLC template's settings, then either joins the synced group (sync) or creates a fresh sync group (copy).
- The reverse-bubble-up should write to BOTH the existing `assignment_index` (already done in Phase 1) AND the new `assignments` subcollection. Document the difference: `assignment_index` is the read-only history; `assignments` is the live "available for pickup" template list.

### Out of scope for Phase 3

- Per-member completion tracking (already covered by the assignment_index + Google Sheet aggregation).
- Notifications when a PLC-level assignment is added.

### Open questions

- Does the "PLC option" in the personal assignment modal create a brand-new PLC-level assignment, or surface the personal one with a `forkable: true` flag? Recommend: **brand-new PLC-level assignment** (cleaner separation; personal assignment stays personal). Confirm.
- If a PLC member deletes the PLC-level assignment, what happens to any in-flight imports on members' boards? Recommend: **imports keep running** (they're independent assignment+session docs after import). Confirm.

### Notes from implementation

_(Fill in after shipping.)_

---

## Phase 4 — Video Activities

**Goal:** extend video activities with the same PLC linkage + dashboard surface that quizzes already have.

### Scope

- Add `plc?: PlcLinkage` to `VideoActivityAssignmentSettings` (mirror `QuizAssignmentSettings`).
- `useVideoActivityAssignments.createAssignment` writes to the PLC index (extend `PlcAssignmentIndexEntry.kind` union to include `'video-activity'` — the discriminator slot is already there in Phase 1).
- New `plcs/{plcId}/video_activities/{activityId}` subcollection mirroring Phase 2's quiz library pattern.
- `PlcVideoActivitiesTab.tsx` replaces the placeholder.

### Architectural notes

- Video activities use a binary status (active/ended) instead of quiz's active/paused/inactive — doesn't affect the index entry shape.
- `kind` discriminator widening: this is the first phase that meaningfully exercises the union. Update `parseEntry` in `usePlcAssignmentIndex.ts` to accept `'video-activity'` AND update the rules' `kind in ['quiz', 'video-activity']` check. The Phase 1 test (`normalizes 'kind' to 'quiz' even for legacy or wrong values`) needs to be revisited once the union widens.

### Out of scope for Phase 4

- Activity Wall (it's not a true assignment type — it's a collaborative student space).
- Mini-apps (separate phase, not currently planned for PLC integration).

### Notes from implementation

_(Fill in after shipping.)_

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

_(Fill in after shipping.)_

---

## Phase 6 — Shared Boards surface

**Goal:** surface dashboards (boards) that have been shared with a PLC.

### Scope

- Today, board sharing is per-user (`shared_boards/{shareId}`). Add a `plcId?: string` field so a board can be shared with an entire PLC.
- New `PlcSharedBoardsTab.tsx` lists all boards shared with this PLC. Each row has "Open" (read-only view) and "Copy to my dashboards".

### Architectural notes

- This is the smallest phase. The infrastructure already exists; we're just adding a `plcId` filter and a tab.
- The existing `shared_boards` rules will need a new branch: members of the PLC can read shares where `plcId == this PLC` even if they aren't the shareTarget.

### Open questions

- Can a member edit a PLC-shared board, or is it always read-only/copy? Recommend: **read-only/copy** for simplicity. Editing shared boards multi-teacher would need its own LWW infrastructure (out of scope for Phase 6).

### Notes from implementation

_(Fill in after shipping.)_

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

- **Phase 2:** orphan behavior when sharer deletes their personal copy of a synced PLC quiz.
- **Phase 3:** does the personal "PLC option" toggle create a brand-new PLC-level assignment template, or fork from the personal one?
- **Phase 3:** what happens to in-flight imports if the PLC-level template is deleted?
- **Phase 5:** single shared notepad vs. multiple notes per PLC.
- **Phase 5:** are todos PLC-owned or per-member?
- **Phase 6:** read-only vs. editable for PLC-shared boards.

---

**Last updated:** 2026-05-07 (Phase 1 shipped — PR #1537)
