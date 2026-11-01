# Library folders as places (folder view)

Grilled and settled 2026-10-08 against `dev-paul` at `04714d0c3`, in five rounds with mockups built from the repo's tokens ([mockups](mockups/library-folders-mockup.html)). Six PRs to `dev-paul`.

## Goal

A teacher opening any widget library sees a short, scannable top level of their folders instead of one long stream, opens folders like a file explorer, files things by dragging, and can clear out a whole unit in one step without losing anything they didn't mean to.

## Current-state facts that drove the decisions

- **Folders already nest.** `LibraryFolder` (`types.ts`, `parentId: string | null`, `order`) lives at `/users/{uid}/{x}_folders/{folderId}`, one collection per widget (`hooks/useFolders.ts`). Shared logic is `hooks/useFolderTree.ts`; PLC folders reuse it at `plcs/{plcId}/folders` (`hooks/usePlcFolders.ts`). Items carry `folderId` (null = root).
- **Folder-enabled libraries** (`LibraryFolderWidget`): quiz, question_bank, video_activity, guided_learning, miniapp, flashcards, projects, plus PLC assessments. Activity Wall, Rubrics and SmartNotebook have no folders and stay out of scope.
- **Folders only filter.** `filterByFolder` (`components/common/library/folderFilters.ts`) keeps items whose `folderId` equals the selected folder exactly, so subfolder contents never appear; `null` = "All items" = everything. Subfolders never show in the main list, there is no breadcrumb, and every library opens on "All items".
- **Shell.** `components/common/library/`: `LibraryShell`, `LibraryToolbar`, `FolderSidebar` (+ `FolderTree`), `LibraryGrid`, `LibraryItemCard`, `BulkActionBar`, `useLibrarySelection`, `FolderPickerPopover`, `LibraryDndContext`, `folderDropTargets.ts`. Folders render only on the Library tab.
- **Drag.** dnd-kit. `LibraryDndContext` shares one context between sortable rows and folder drop targets (`folder:<id|root>`); `PointerSensor` (`distance: 5`) + `KeyboardSensor`, no touch sensor, single `activeId` (no multi-drag). Dropping on a side-tree folder already moves an item.
- **Order.** Items have one `order` field; reorder writes `order: index` for the ids in the current filtered folder, so values only mean something within one folder. Folders sort by their own `order` (`reorderSiblings`); Name/Date sorts don't apply to them. Dropping while sorted by Name/Date switches to Manual (`useLibraryView.ts`).
- **Folder delete today.** Empty folders delete immediately. Otherwise a sidebar-local `DeleteFolderModal` offers "Move contents to parent folder" or "Delete folder and subfolders"; both move items to the parent. Items are never deleted (`useFolderTree.ts`).
- **Item delete is inconsistent.** Quiz trashes the Drive file and refuses while an assignment is active/paused. Question banks, Video Activity and GL trash Drive files. Mini App, Projects and Flashcards delete Firestore docs (Flashcards also the public share doc). PLC assessments archive instead of deleting. The GL card's Delete has **no confirm** unless open assignments exist; bulk delete in VA/GL/Mini App uses `window.confirm` (skipping GL's open-assignment check); Mini App bulk delete prompts once per app on top of the bulk prompt. Nothing is undoable.
- **Items the teacher doesn't own.** GL Building sets always show whatever folder is picked (`filterSourcedEntriesByFolder`); Mini App `global:` rows append unfiltered; Quiz banks merge teammates' PLC banks (`sharedBankSources`) outside the folder filter. None can carry a `folderId`.
- **Toast with action** exists: `addToast(message, type, { label, onClick })` (`types.ts`, `DashboardContext.tsx`), used for widget undo; no library flow uses it yet.
- **Connector.** `functions/src/mcp/tools.ts` `list_folders` / `create_folder` already read and write `parentId` / `order`. `FOLDER_COLLECTIONS` (`functions/src/mcp/toolKit.ts`) lacks guided_learning and projects.
- **Tokens.** Lexend; brand blue `#2d3f89` / dark `#1d2a5d` / lighter `#eaecf5`; brand red `#ad2122`; slate surfaces; per-library header accents in `libraryAccents.ts` (GL `#b45309`, Quiz `#047857`, VA `#b91c1c`, MiniApp `#334155`, Flashcards `#be185d`, Projects `#0369a1`). Modals: `bg-white rounded-2xl shadow-2xl border-slate-200` over `bg-slate-900/40 backdrop-blur-sm`.

## Decisions

### Model

- **D1.** Folders are places, not filters, plus smart views that ignore folders: **All items** and **Recent**. No Starred, no Unfiled view, no tags.
- **D2.** A library opens at the top level (folders, then unfiled items) and reopens the folder the teacher was last in, per widget (per-user preference, not per-board content).
- **D3.** No depth limit. The breadcrumb collapses middle levels (`Library › … › Unit 3 › Week 2`); the side tree scrolls.
- **D4.** Search covers the current folder and its subfolders, with a chip that widens to "Search all of Library". Results outside the current folder show their path.
- **D5.** All items rows show the item's folder path chip.
- **D6.** Recent = edited or assigned in the last 30 days, newest first, capped around 25. Uses existing `updatedAt` plus each widget's last-assigned time; no new "last opened" write.

### Layout (option A)

- **D7.** Main pane: breadcrumb, then folder rows at the top of the same list (warm tint, folder icon, count), then items. The existing side tree stays as navigation and drop target. Single click on a folder row opens it.
- **D8.** Folders always sort above items and follow the active sort: Name A–Z by name, Date by last change, Manual by dragged `order`. Folders and items never interleave.
- **D9.** Manual order is per folder: the existing `order` field is read only among siblings in the same folder (it already behaves that way when written).
- **D10.** Folder rows show a recursive total: "12 sets", or "2 folders · 12 sets" when subfolders exist. The same count feeds the delete dialog.
- **D11.** Optional folder colour from a palette of about 8, set from the folder's "…" menu, stored as `color` on `LibraryFolder`. Default is neutral.

### Drag and drop

- **D12.** Drop targets: folder rows in the main list, side-tree folders (existing), and breadcrumb levels (drop on a parent to move up). Side-tree folders do **not** auto-expand on hover.
- **D13.** Dragging one selected item in Select mode carries the whole selection, with a "3 sets" badge on the drag overlay.
- **D14.** Drag-to-create: dragging near a row's top or bottom edge reorders (blue insertion line, as today). Holding over the middle of a row for about 500 ms turns it into a target ("Create folder" pill; "Move into {name}" on a folder row). Dropping creates "New folder" in the target item's position containing both items, with the name field focused and selected. Enter saves; Esc keeps "New folder".
- **D15.** Touch: add a touch sensor with a press-and-hold activation of about 250 ms so swipes still scroll.
- **D16.** Undo toast (`addToast` with action) after moves, drag-created folders and "Keep everything" folder deletes. Item deletes stay non-undoable behind their confirm.

### Deleting a folder

- **D17.** One design-aligned dialog (mockup) for any non-empty folder: title `Delete "{name}"?`, subtitle with the recursive counts, and two choices:
  - **Keep everything** (default): move the subfolders and items to `{parent name}`; only the folder goes away.
  - **Delete the folder and everything in it** (red): "Deletes N folders and M sets. You can't undo this." The confirm button turns red and names the count ("Delete 7 sets"). No third confirm step.
- **D18.** Items that can't be deleted yet (for example quizzes with live assignments, using each widget's own rules) are listed in the dialog before confirming and are kept, moved to the parent. Everything else is deleted through each widget's own delete path (Drive trash, share docs, Storage cleanup as today).
- **D19.** Items the teacher doesn't own are never deleted: under either choice they go back to their source folder, and the dialog says so in a line.
- **D20.** Empty folders still delete immediately (with the Undo toast).

### Items the teacher doesn't own

- **D21.** They live in pinned, read-only source folders at the top level, named by source and shown only when the widget has that source: "From your building" (GL Building sets), "From the district" (Mini App `global:`), "From your PLCs" (teammates' banks). These can't be renamed, deleted or reordered.
- **D22.** A teacher can file one into their own folders by dragging or "Move to folder…". The placement is private to that teacher and never changes the source item. Filing moves it out of the source folder; "Remove from folder" (or dragging back) returns it.
- **D23.** Placements are stored per user per widget, keyed by a source key (for example `building:<id>`, `global:<id>`, `plcbank:<plcId>:<id>`) with `folderId` and `order`, in a new owner-only subcollection beside the folders (for example `/users/{uid}/{x}_placements/{sourceKey}`). Placements whose source disappears are hidden and cleaned up lazily.
- **D24.** Once filed, the row shows a source chip (Building / District / PLC). Its menu shows "Remove from folder" instead of Delete; edit and duplicate behave as today.

### Scope and rollout

- **D25.** All folder-enabled libraries at once through the shared library code: Quiz, Question Banks, Video Activity, Guided Learning, MiniApp, Flashcards, Projects, and PLC assessment folders. Archive/Shared tabs keep no folders.
- **D26.** The folder view, drag additions, colours, new delete dialog and placements ship behind one preview flag, `library-folder-view` (`GlobalFeature`, `FEATURE_DEFAULTS` with `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, `stage: 'preview'`, `afterLaunch: 'retire'`; add to `functions/src/featureMissingDoc.ts`). With the flag off, teachers keep today's filter view. Admin path: Admin Settings > Access > Previews > set to Public.
- **D27.** The delete inconsistencies ship first with no flag (restoring intended behaviour): one shared confirm dialog for library item delete, a confirm on the GL card, a single prompt for Mini App bulk delete, and no `window.confirm` in library flows (which also restores GL's open-assignment check on bulk delete).
- **D28.** The connector gains guided_learning and projects in `FOLDER_COLLECTIONS`, folder `color` in list/create, and nested paths, so Claude-made content can be filed wherever a teacher can file it.

## PRs

1. **Delete consistency, no flag (D27).** Shared library delete-confirm component; route GL card, VA/GL/Mini App bulk delete through it; remove the Mini App double prompt; keep Quiz's blocked/warn behaviour.
2. **Folder view (D1–D10, D25, D26).** Flag registration; breadcrumb; folder rows in `LibraryGrid`; landing + last-folder preference; subtree search with widen chip; All items path chips; Recent view; recursive counts; folder sort following the active sort; per-folder manual order. Update `tests/e2e/scroll-end-padding.spec.ts` if the pane's scroller changes.
3. **Drag (D12–D16).** Folder rows and breadcrumb levels as drop targets; multi-item drag; hold-to-create with edge-vs-middle zones; touch sensor; Undo toasts.
4. **Colours and delete dialog (D11, D17–D20).** `color` on `LibraryFolder` (rules accept it); new shared delete-folder dialog replacing the sidebar-local `DeleteFolderModal`; delete-everything path that runs each widget's delete and reports blocked items.
5. **Filing items the teacher doesn't own (D21–D24).** Placements subcollection + owner-only rules; source folders; source chips and "Remove from folder". This is the PR that touches `firestore.rules` most; run `pnpm run check:rules-size` and `node scripts/releaseFirestoreRules.mjs spartboard-dev` before merging, since the compiled cap has been crossed before. Use the rules shorthands.
6. **Connector (D28).** `FOLDER_COLLECTIONS` additions, `color`, nested paths; tests in `functions/`.

The PR descriptions for 2–5 name the `library-folder-view` flag, its admin starting level, and the Previews path. Changelog entry when the flag opens to everyone, not at merge.
