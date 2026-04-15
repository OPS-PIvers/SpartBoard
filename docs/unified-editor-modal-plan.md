# Unified Full-Screen Editor Modal — Implementation Plan

Shared full-screen modal editor for library-style widgets (Quiz, Video Activity, MiniApp, Guided Learning). Replaces cramped in-widget back-face editors with a viewport-scale modal that mirrors the roster editor pattern established in commit `57fc7b13`.

## Status

- [x] **Phase 0** — Shared primitives (EditorModalShell, auth-bypass plumbing)
- [x] **Phase 1** — Quiz
- [ ] **Phase 2** — Video Activity
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

## Phase 2 — Video Activity (Pending)

Location: `components/widgets/VideoActivityWidget/`

### Files to create

- `components/widgets/VideoActivityWidget/components/VideoActivityEditorModal.tsx`
- `utils/mockVideoActivityDriveService.ts` (only if VA stores blobs in Drive — verify by reading the existing VA drive service / hook)

### Files to modify

- `components/widgets/VideoActivityWidget/Widget.tsx` — remove back-face editor path; add `editingActivity` local state; render the modal as a sibling to the library component; `onNew` builds a blank `VideoActivityData` draft.
- The VA library/manager component (find it — probably `Manager.tsx` or similar) — add `onNew` prop; split header into `Import` + `New` buttons same as Quiz.
- `hooks/useVideoActivity.ts` (or wherever the VA hook lives) — add real/mock drive service selection by `isAuthBypass`.

### Implementation notes

1. Follow `QuizEditorModal.tsx` as the reference. VA questions have an extra `timestamp` field (the video time the question fires at) — add it as a field inside each question block; include it in the `questionsEqual` dirty-check.
2. **Decision during implementation**: extract `components/common/QuestionEditor.tsx` shared between Quiz and VA if the duplication is clean. If the timestamp field makes the shared props shape awkward, defer the extraction and accept the duplication for now. Per the original plan, this is opportunistic — don't force it.
3. Verify the 5 flows from the Phase 1 verification list.

---

## Phase 3 — MiniApp (Pending)

Location: `components/widgets/MiniApp/`

### Files to create

- `components/widgets/MiniApp/components/MiniAppEditorModal.tsx`
- `utils/mockMiniAppDriveService.ts` (only if MiniApp stores code/config blobs in Drive — verify)

### Files to modify

- `components/widgets/MiniApp/Widget.tsx` — same pattern as Quiz.
- MiniApp library view component — split `Import` / `New` header buttons.
- `components/widgets/MiniApp/components/MiniAppEditor.tsx` — body migrated into the new modal (or deleted if replaced entirely).

### Implementation notes

1. MiniApp editor body is code/config-centric — structurally unlike Quiz questions. Just wrap the existing body in `EditorModalShell`; don't try to reuse `QuestionEditor`.
2. Dirty-check: a deep-equal (`JSON.stringify` compare or a small helper) on the draft vs original may be simpler than field-by-field given the config shape. The shell just needs a boolean.
3. Verify the 5 flows.

---

## Phase 4 — Guided Learning (Pending, highest complexity)

Location: `components/widgets/GuidedLearning/`

### Files to create

- `components/widgets/GuidedLearning/components/GuidedLearningEditorModal.tsx`
- `utils/mockGuidedLearningDriveService.ts` (only if GL stores blobs in Drive — verify)

### Files to modify

- `components/widgets/GuidedLearning/Widget.tsx`
- `GuidedLearningLibrary.tsx`
- `GuidedLearningEditor.tsx` — body migrated into the modal.

### Implementation notes

1. GL has nested steps, nested questions, and image uploads. **Do not refactor the body** during this migration — move it into the modal as-is. Refactoring can happen later in its own PR.
2. Dirty-check: write a structural compare for the steps array (recursive helper). Don't rely on deep-equal on image data URIs — compare by URL/key.
3. Do this phase last so the shell is battle-tested by the simpler editors.
4. Verify: step reordering, image upload, nested question types all work inside the modal. Plus the standard 5 flows.

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

---

## References

- Template: `components/classes/RosterEditorModal.tsx` (commit `57fc7b13`)
- Base primitive: `components/common/Modal.tsx`
- Confirm dialog: `context/DialogContext.tsx` (`showConfirm`)
- Z-index: `config/zIndex.ts` (`modal: 10000`, `modalNested: 10100`)
