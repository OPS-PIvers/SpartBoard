# Unified Full-Screen Editor Modal — Implementation Plan

Shared full-screen modal editor for library-style widgets (Quiz, Video Activity, MiniApp, Guided Learning). Replaces cramped in-widget back-face editors with a viewport-scale modal that mirrors the roster editor pattern established in commit `57fc7b13`.

## Status

- [x] **Phase 0** — Shared primitives (EditorModalShell, auth-bypass plumbing)
- [x] **Phase 1** — Quiz
- [x] **Phase 2** — Video Activity
- [ ] **Phase 3** — MiniApp
- [ ] **Phase 4** — Guided Learning

Each phase is independently shippable. Phase 1 is landed on `dev-paul`; the remaining phases follow the same playbook.

---

## Phase 0 — Shared Primitives (Complete)

### `components/common/EditorModalShell.tsx`

Wraps the base `components/common/Modal.tsx` with standardized editor chrome. All four per-widget modals should use it verbatim — do not fork.

- Sizing: `max-w-5xl` (override via `maxWidth`), `h-[85vh]` (override via `className`).
- Sticky header: title, optional subtitle, close (X) button.
- Sticky footer: `Cancel` (always enabled) and `Save` (spinner when `isSaving`, disabled when `saveDisabled`). Optional `footerExtras` slot for per-editor actions (e.g., Delete).
- Dirty-state guard: when `isDirty` is true, X / Cancel / Escape / backdrop-click all route through `DialogContext.showConfirm` with "Discard changes?" / "Keep editing" / "Discard".
- Accessibility: focus trap, `aria-labelledby` on title, Escape handled at the shell level.

Parent owns draft state and `isDirty` computation. The shell only handles presentation, close-confirm flow, and the save spinner.

### Auth-bypass mode plumbing (`context/AuthContext.tsx`)

When `VITE_AUTH_BYPASS=true`, the app now calls `signInAnonymously()` to get a real Firebase UID (so Firestore security rules like `request.auth.uid == userId` pass) and wraps the returned user in a `Proxy` that overrides `email` and `displayName` with the `MOCK_USER` values for UI display. This keeps the dev experience identical while letting Firestore writes actually work.

### Mock Drive service pattern (`utils/mockQuizDriveService.ts`)

Structural stand-in for `QuizDriveService` used in bypass mode (no Google access token means the real Drive service can't save/load). Stores the full blob in `localStorage` keyed by `mock_quiz_drive:{userId}:{fileId}`.

- `localStorage` chosen over a Firestore-backed mock path so no dev-only Firestore rule has to be deployed to the shared production project (`spartboard`).
- Swapped in via `useQuiz.getDriveService()` based on `isAuthBypass`.
- The `QuizDriveLike` interface in the mock file is the structural contract — both real and mock services satisfy it.

**Apply this pattern for VA / MiniApp / GL**: each widget stores authored content in Google Drive + metadata in Firestore. Create `mockVideoActivityDriveService.ts`, `mockMiniAppDriveService.ts`, etc., each with a `<Widget>DriveLike` interface and an `isAuthBypass` branch in their hook.

---

## Phase 1 — Quiz (Complete, landed on `dev-paul`)

### Files changed

**New**

- `components/common/EditorModalShell.tsx`
- `components/widgets/QuizWidget/components/QuizEditorModal.tsx`
- `utils/mockQuizDriveService.ts`

**Modified**

- `components/widgets/QuizWidget/Widget.tsx` — removed back-face editor; added `editingQuiz` / `editingMeta` local state; `onNew` builds a blank `QuizData` draft; modal rendered as sibling to `QuizManager`.
- `components/widgets/QuizWidget/components/QuizManager.tsx` — split `onNew` (primary "+ New Quiz" button) from `onImport` (secondary "Import" button) in the header; "Start Importing" empty-state CTA still routes to import.
- `hooks/useQuiz.ts` — selects real vs mock drive service by `isAuthBypass`.
- `context/AuthContext.tsx` — anonymous-auth plumbing described above.

**Deleted**

- `components/widgets/QuizWidget/components/QuizEditor.tsx`

### Key UX decisions (locked — follow for VA/MiniApp/GL)

1. **"New" opens the editor modal directly** with a blank draft — not the import wizard.
2. **"Import" is a separate secondary button** in the library header (plus the empty-state CTA).
3. **Title input is the first field** in the editor body. It is required on save and must be part of the `isDirty` computation.
4. **Modal header title** reflects the live draft title as the user types; falls back to `New <Widget>` for blank drafts and `Edit <Widget>` for renaming-to-empty edge cases.
5. **Save for new items**: parent calls `save<X>(draft, undefined)` — the existing drive service creates a new file. Do not add new-vs-edit branching.
6. **Dirty-guard**: X / Escape / backdrop all route through the shell's confirm flow. Do not re-implement.
7. **No back-face editor** for any of the four widgets. The back-face still exists for regular widget settings (visual/playback), just not content authoring.

### Verified flows (manual preview under `VITE_AUTH_BYPASS=true`)

- **Create**: `+ New Quiz` → blank modal with empty title + zero questions → fill title → `ADD NEW QUESTION` → fill text + correct answer → `Save Quiz` → modal closes, quiz appears in library.
- **Edit**: `Edit` on row → modal pre-populated → change a field → `Save Quiz` → persisted.
- **Dirty-guard**: change title or question field → Escape → "Discard changes?" dialog → `Keep editing` preserves state, `Discard` reverts.
- **Import**: `Import` button still opens CSV/Sheet wizard; saved quiz appears in library.

---

## Phase 2 — Video Activity (Complete)

Location: `components/widgets/VideoActivityWidget/`

**Important:** the current editor is **not** a back-face — it's an in-place sub-view rendered inside `Widget.tsx` when `view === 'editor'` (l.217-233). The migration still stands: lift that sub-view into a modal. Back-face (`Settings.tsx`) only holds playback settings (`autoPlay`, `requireCorrectAnswer`, `allowSkipping`) — keep it as-is.

### Files to create

- `components/widgets/VideoActivityWidget/components/VideoActivityEditorModal.tsx`

**No new mock drive service is needed.** VA reuses `QuizDriveService` via `useVideoActivity.getDriveService()` (l.89-96 returns `new QuizDriveService(googleAccessToken)`), so the existing `utils/mockQuizDriveService.ts` satisfies the contract — just branch on `isAuthBypass` in the VA hook.

### Files to modify

- `components/widgets/VideoActivityWidget/Widget.tsx` — drop the `view === 'editor'` branch (l.217-233); add `editingActivity` / `editingMeta` local state; render `VideoActivityEditorModal` as a sibling to `Manager`. `onNew` builds a blank `VideoActivityData` draft (`{ id, title: '', youtubeUrl: '', questions: [], createdAt, updatedAt }`).
- `components/widgets/VideoActivityWidget/components/Manager.tsx` — split header into `+ New` (primary) and `Import` (secondary) buttons, mirroring Phase 1's Quiz split. Today the header has only `New`; the `Manual / AI / Import` choice currently lives inside `Creator.tsx`. Route the new `Import` header button straight to the existing import flow (consider extracting `Importer.tsx` as a first-class step or running `Creator` in import-only mode — decide during implementation).
- `components/widgets/VideoActivityWidget/components/Editor.tsx` — **delete**. Its body moves into the modal. Question rendering already has the MM:SS `timestamp` input (Editor.tsx l.63-71, helpers l.28-42) — port it over unchanged.
- `hooks/useVideoActivity.ts` — branch `getDriveService()` on `isAuthBypass` and return a `mockQuizDriveService` instance, exactly the same way `useQuiz` does.

### Implementation notes

1. Follow `QuizEditorModal.tsx` as the reference. Data: `VideoActivityQuestion extends QuizQuestion` with `{ timestamp: number }` (`types.ts:1675-1678`); `VideoActivityData` adds `youtubeUrl: string` and optional `videoDuration?: number`.
2. Save signature already matches — `saveActivity(activity, existingDriveFileId?)`. Pass `undefined` for new; pass `selectedMeta?.driveFileId` for edits (see current `Widget.tsx:226` / `Creator.tsx:67` for the call pattern).
3. Dirty-check must include `title`, `youtubeUrl`, **and** the questions array (use a `questionsEqual` helper that compares `text`, `correctAnswer`, `incorrectAnswers`, `timeLimit`, **and** `timestamp`).
4. **Decision during implementation**: extract `components/common/QuestionEditor.tsx` shared between Quiz and VA if the duplication is clean. If the `timestamp` field makes the shared props shape awkward, defer the extraction and accept the duplication. Opportunistic — don't force it.
5. Verify the 6 flows from the Phase 1 verification list.

---

## Phase 3 — MiniApp (Pending)

Location: `components/widgets/MiniApp/`

**Important:** MiniApp stores app content (HTML + title) in **Firestore only** — not Drive. The "Collect Live Results" Google Sheet feature uses Drive, but that's incidental and unrelated to authoring persistence. MiniApp also has **no back-face** today; there is no `Settings.tsx` — all config lives in the editor body. There is no Manager file: the library header and New button are inline in `Widget.tsx` (l.886-951) with tabs for "My Apps" / "Global Apps".

### Files to create

- `components/widgets/MiniApp/components/MiniAppEditorModal.tsx`

**No mock drive service is required.** Anonymous Firebase Auth (already wired in Phase 0) is sufficient because writes go to Firestore (`users/{uid}/miniapps`), not Drive.

### Files to modify

- `components/widgets/MiniApp/Widget.tsx` — keep the "My Apps" / "Global Apps" tabs and the single `+ New App` button in the header. Replace the `view === 'editor'` branch (l.857-879) with `editingApp` / `editingId` local state and render `MiniAppEditorModal` as a sibling. Refactor the state-based `handleSave()` (l.521-554) into a parameterized `saveMiniApp(data: MiniAppItem, id?: string)` so the modal calls it with the draft; `id === undefined` → `crypto.randomUUID()` → new document.
- `components/widgets/MiniApp/components/MiniAppEditor.tsx` — body migrated into the modal. The title input (l.292-317), code textarea (l.318-329), Magic Generator prompt overlay (l.225-290), and "Collect Live Results" section (l.332-419) all remain. Decouple the body from the widget-instance `updateWidget()` calls at l.145 / l.182 / l.184 — in the modal, treat those sheet-linking side effects as part of the save callback rather than reading widget config directly.
- `components/widgets/MiniApp/hooks/useMiniAppSync.ts` — **no change required** (Firestore listener only; no Drive integration for authoring).

### Implementation notes

1. MiniApp editor body is HTML/config-centric — structurally unlike Quiz questions. Wrap the body in `EditorModalShell`; don't try to reuse `QuestionEditor`.
2. Dirty-check: deep-compare `{ title, html }` against the originals. The `collectResults` / `googleSheetId` toggles live on the **widget's** `config` (not the `MiniAppItem` in Firestore); treat those as separate from the modal's dirty state — they are widget-instance settings, not library-item content.
3. **Import/export: existing JSON format.** MiniApp already supports personal-library `Export` and `Import` actions in the header (`Widget.tsx:610-659` + header buttons at `Widget.tsx:1001-1042`); import loads a `.json` file into Firestore. Preserve those header actions during the modal migration (alongside `+ New App`). The AI "Magic Generator" remains embedded inside the editor body.
4. Data shape: `MiniAppItem = { id: string; title: string; html: string; createdAt: number; order?: number }`.
5. Verify the 6 flows. No back-face to regress.

---

## Phase 4 — Guided Learning (Pending, highest complexity)

Location: `components/widgets/GuidedLearning/`

**Important:** GL has its own drive service (`utils/guidedLearningDriveService.ts`) — it does **not** share with Quiz. So a new mock is required. Personal sets persist via `useGuidedLearning.saveSet` (Drive + Firestore metadata, l.129). "Building" sets (admin-authored, community-shared) persist to Firestore only via a **separate** `useGuidedLearning.saveBuildingSet` function (l.186). The modal must route saves to the correct function based on tab — `saveSet` does not branch internally. Back-face (`Settings.tsx`, 35 lines) only holds a "Go to Library" button — nothing to preserve.

### Files to create

- `components/widgets/GuidedLearning/components/GuidedLearningEditorModal.tsx`
- `utils/mockGuidedLearningDriveService.ts` — model on `mockQuizDriveService.ts`. Expose a `GuidedLearningDriveLike` structural interface (both real and mock satisfy it). Store blobs in `localStorage` under `mock_gl_drive:{userId}:{fileId}`.

### Files to modify

- `components/widgets/GuidedLearning/Widget.tsx` — drop the `config.view === 'editor'` branch (l.265-277); add `editingSet` / `editingMeta` local state; render the modal as a sibling to `GuidedLearningLibrary`.
- `components/widgets/GuidedLearning/components/GuidedLearningLibrary.tsx` — keep the existing tab structure ("My Sets" / "Building") and the admin-only AI button on the Building tab (l.388-426). Add the modal's `onEdit` / `onNew` / `onCreateNewBuilding` wiring. **No Import button** — GL has no native import format.
- `components/widgets/GuidedLearning/components/GuidedLearningEditor.tsx` — body wrapped by the modal. **Do not refactor internals.** Props are already clean (`existingSet`, `existingMeta`, `onSave`, `onCancel`, `saving`), and the 913-line `GuidedLearningStepEditor.tsx` sub-component is kept intact.
- `hooks/useGuidedLearning.ts` — branch `getDriveService()` (l.120) on `isAuthBypass` and return `mockGuidedLearningDriveService`, same pattern as `useQuiz`.

### Implementation notes

1. GL has nested steps (2 levels: set → step → optional question) and image uploads. **Do not refactor the body** during this migration — move it into the modal as-is. Refactoring can happen later in its own PR.
2. Dirty-check: structural compare on `{ title, description, mode, imageUrls, steps }`. Steps need a small recursive helper (each step may carry `question: { type, text, choices?, correctAnswer?, matchingPairs?, sortingItems? }`).
3. **Images are Firebase Storage URLs** (`imageUrls: string[]`), not data URIs — uploaded via `useStorage().uploadHotspotImage()`. A plain string-array compare suffices; the earlier draft's warning about data-URI equality doesn't apply.
4. Save path must branch by tab: personal sets call `saveSet(set, existingDriveFileId?)`; Building-tab sets call `saveBuildingSet(set)`. Do **not** route Building saves through `saveSet` (that would push a Drive write). The branching already exists in `GuidedLearningWidget.handleSave` today — keep it there when it moves to the modal's save callback.
5. Do this phase last so the shell is battle-tested by the simpler editors.
6. Verify: step reordering, image upload, nested question types (`multiple-choice` / `matching` / `sorting`), and the Building-vs-personal save paths all work inside the modal. Plus the standard 6 flows.

---

## Verification checklist (per phase)

Run locally under `pnpm run dev` (set `VITE_AUTH_BYPASS=true` in `.env.local` for speed).

1. **Create**: Add widget to dashboard → click `+ New <X>` → modal opens at `max-w-5xl h-[85vh]` → fill a minimum valid item → `Save` → modal closes → item appears in library → widget plays it correctly.
2. **Edit**: `Edit` on a library row → modal opens pre-populated → change field → `Save` → change persisted (refresh page, still there).
3. **Dirty-guard**: Open editor → change a field → press Escape → confirm dialog → `Keep editing` preserves state with changes intact → `Discard` closes and reverts.
4. **Close paths are uniform**: X button, Escape, and backdrop click all route through the same dirty-guard.
5. **Validation + save errors**: block the network tab → `Save` → button returns to enabled, error shown inline, editor stays open.
6. **Widget playback regression**: confirm the widget front-face (live session, playback, etc.) is unchanged.

After all phases, cross-widget verification:

- Visual consistency: stack screenshots — header, footer, spacing, button placement should be visually identical across all four editors.
- `pnpm run validate` passes (type-check + lint + format-check + tests).
- No back-face editor is reachable for the four in-scope widgets.
- Hotspot Image, PDF, SmartNotebook behavior unchanged (regression).

---

## Out of scope (explicitly deferred)

- **Hotspot Image editor** — different UX (visual canvas), warrants its own plan.
- **Global "Content Library" surface** in the sidebar — considered and rejected.
- **Autosave** — explicit Save + dirty-guard is the chosen model.
- **Extracting primitives from Guided Learning or MiniApp** — defer until a clear reuse case appears.

---

## Known quirks / implementation gotchas

1. **Auth-bypass mode uses a real anon Firebase UID** under the hood (`AuthContext`) so Firestore rules pass. A `Proxy` overrides `email` / `displayName` to `MOCK_USER` values for UI display. If you see "Missing or insufficient permissions" on a Firestore write in bypass mode, the likely cause is the target path not being covered by any `allow` rule — either add a real rule or (preferred) swap the storage for `localStorage` via the mock service pattern.

2. **Why `localStorage` for mock drive blobs, not Firestore?** Avoids deploying dev-only Firestore rules to the shared production project (`spartboard`). Keyed per user (`{userId}:{fileId}`) to survive multi-user dev scenarios on the same browser.

3. **Editor modal title field**: remember to include the title in `isDirty`. Quiz does `title !== originalTitle || !questionsEqual(...)`. Forgetting this means rename-only edits are silently discarded when the user hits Escape.

4. **Save path for new vs existing**: the existing save functions (`saveQuiz`, etc.) take `(data, existingFileId?)`. Pass `undefined` for new; pass the meta's `driveFileId` for edits. Don't add new-vs-edit branching in the modal — it's already handled downstream.

5. **Widget.tsx modal sibling rendering**: the modal is rendered as a sibling to the library component, not inside it. This keeps modal state in the widget's root and avoids prop-drilling through the library.

6. **Not every widget needs a mock drive service.** Before adding one, check what `getDriveService()` returns in the real hook:
   - **Quiz** → `QuizDriveService` → `mockQuizDriveService.ts` (exists).
   - **Video Activity** → also `QuizDriveService` → reuse `mockQuizDriveService.ts`, no new file.
   - **MiniApp** → Firestore-only, no `getDriveService()` → anonymous Firebase Auth is sufficient, no mock needed.
   - **Guided Learning** → `GuidedLearningDriveService` (distinct from Quiz) → needs its own `mockGuidedLearningDriveService.ts`.

---

## References

- Template: `components/classes/RosterEditorModal.tsx` (commit `57fc7b13`)
- Base primitive: `components/common/Modal.tsx`
- Confirm dialog: `context/DialogContext.tsx` (`showConfirm`)
- Z-index: `config/zIndex.ts` (`modal: 10000`, `modalNested: 10100`)
