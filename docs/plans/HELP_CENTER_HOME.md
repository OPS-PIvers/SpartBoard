# The Help Center is the home for tours

Goal: an admin who makes help never files it twice. A Live tour is recorded straight into the Help Center, a Picture guide moves there in one step and leaves the library, Web tours get a page of their own, and Admin Settings > Help Center becomes one calm list with a detail pane instead of boxes inside boxes.

Settled in a design interview with Paul on 2026-11-12. Terms: **Help Center**, **Hidden**, **Published**, **Unfiled**, **Picture guide**, **Live tour** and **Web tour** in [GLOSSARY.md](../../GLOSSARY.md). Two decisions have ADRs: [0005](../adr/0005-live-tours-live-only-in-the-help-center.md) (tours never live in a library) and [0006](../adr/0006-web-tours-get-their-own-page.md) (Web tours get a SpartBoard page, not an extension-only home). It **revises** [GL_LIVE_TOUR_TYPE.md](shipped/GL_LIVE_TOUR_TYPE.md) (a Live tour no longer lives in the building library), [WEB_TOURS_UX.md](shipped/WEB_TOURS_UX.md) U6 (Web tour cards leave the GL library) and [CHROME_EXTENSION.md](CHROME_EXTENSION.md) T5 (the Web tour editor no longer opens from the Guided Learning manager). [TOURS_10X.md](shipped/TOURS_10X.md) S3 stands: teachers still never see Web tours in the in-app Help Center.

**Code references** were taken at `dev-paul` `747170f0d`. Symbol names are authoritative; line numbers are hints.

## Starting facts

- **Recorded tours are building items, not personal ones.** `buildRecordedSet` saves every recording with `isBuilding: true` to `building_guided_learning/{id}`, which every admin can write (`components/widgets/GuidedLearning/components/recorder/buildRecordedSet.ts`, `firestore.rules` `building_guided_learning`). The GL library lists them beside the admin's personal sets, which are the only things that live in Drive.
- **"Move to Help Center" only sets a flag.** `setHelpCenterFlag` writes `helpCenter: true` on the building set (`hooks/useGuidedLearning.ts`), which hides it from every library view except the Help Center filter. It doesn't create the `help_resources/{id}` item, so the admin adds it a second time in Admin Settings (`GuidedLearningPicker.tsx`).
- **A personal set already moves by copy.** `GuidedLearningPicker` copies a personal set into `building_guided_learning/help-{personalId}` with `helpCenter: true` and deletes the original unless students still have it open or it was edited after an older copy (`components/admin/HelpCenter/GuidedLearningPicker.tsx`).
- **A Live tour has two publish switches.** Publishing the tour (the snapshot in `building_guided_learning_tours`, judged by `isTourRunnable`) is separate from the item's `visible` toggle, so a row can be "Live tour · Draft", "Hidden" or "Live" and prints instructions about which to press (`HelpCenterManager.tsx` `tourStateOf`, `TOUR_NEXT_STEP`).
- **No embeds in prod.** On 2026-11-12 prod `help_resources` held 33 items, all `kind: 'guided-learning'`, none `embed`.
- **`categoryId` must be a string**, and nothing else constrains it (`firestore.rules` `help_resources`). An empty string can mean Unfiled with no rules change.
- **The recorder and tour editor are board-level.** `TourRecordingHost` and `TourEditorHost` mount once in `DashboardView`. `requestRecordTour` and `requestEditTour` dispatch window events (`components/tours/tourState.ts`), and `Sidebar` closes Admin Settings on them (`components/layout/sidebar/Sidebar.tsx`). Admin Settings already restores its last tab from `localStorage` (`components/admin/AdminSettings.tsx` `LAST_TAB_KEY`).
- **Web tours are admin-only and already outside the GL library's data.** Drafts live in `building_web_tours`, published copies in `building_guided_learning_tours`, and pictures in `web_tour_pictures/{setId}` (`components/tours/webTours.ts`). The GL library only lists them (`GuidedLearningManager.tsx`). Their editor depends on app contexts and the Firebase client SDK, which the extension never loads (CHROME_EXTENSION D3).
- **Help Center writes:** global items (`orgId == null`) are super admin only, and org items need membership of that org (`firestore.rules` `help_resources`).

## Decisions

### Where things live

- **H1. Live tours live only in the Help Center.** Every way a Live tour is made creates its Help Center item, Hidden and Unfiled: a recording started from the GL widget or from Admin Settings, and the connector's `create_live_tour` (`functions/src/mcp/glLiveTour.ts`, `glCreate.ts`), which no longer treats `help_center` as optional; a category passed in still files it. The GL library hides a tour only once it has a Help Center item (its `helpCenter: true` flag), so nothing is hidden before it has somewhere to go. After H3 that is every tour. See ADR 0005.
- **H2. Record from the widget.** The GL widget keeps its record button. When the recording saves, a toast says the tour is in the Help Center (Hidden) with an **Open in Help Center** button, which opens Admin Settings > Help Center with that tour selected.
- **H3. One-time move of existing tours.** A script moves every Live tour still in the library. It selects with the library's own tour test (`mode === 'tour' || hasLiveTour`, `GuidedLearningManager.tsx`), so partly anchored sets move too. Those with no `help_resources` item that points at them get one, Hidden and Unfiled, and get `helpCenter: true`. Tours that already have an item keep it unchanged. Dry run on dev, then on prod, where Paul OKs the dry-run output before `--apply`, run right after the `main` release.
- **H4. Picture guides move in one step.** An admin sees **Move to Help Center** in the GL widget's kebab menu on their own personal sets and on building sets. It creates the item, Hidden and Unfiled, and the set leaves the library. A toast offers **Open in Help Center**.
- **H5. A Picture guide in use moves later.** If students have a personal set open, the Help Center gets its copy at once and the library copy shows a **Moved to Help Center** tag. It removes itself the next time the owner's library loads and no student has it open. A copy edited after the move stays and loses the tag, as the picker does today.
- **H6. A building Picture guide leaves every library.** Moving a building set removes it from every teacher's building library. Both the kebab action and the picker say so in the confirm.
- **H7. Nothing moves back.** A Live tour never leaves the Help Center. A Picture guide's detail pane has **Copy to my library**, which makes a personal copy and leaves the Help Center item in place. Removing an item is Hide or Delete. The old "Move to library" goes.
- **H8. Embeds are retired.** The `embed` kind leaves + New, the form and the teacher-facing Help Center. The rules keep accepting it, so no rules change is needed, and nothing reads it.

### Web tours

- **H9. Web tours get their own page.** A standalone admin page at `/web-tours` in the SpartBoard app, with no board, Dock or sidebar. It mounts only the providers it needs, as the other standalone routes in `App.tsx` do. It holds the Web tour list, the existing editor, Check tour, health (moved from `WebTourHealthSection`) and the public-link controls. See ADR 0006.
- **H10. Ways in.** The extension's side panel gets a **Manage tours** button that opens `/web-tours` in a new tab. Admin Settings > Help Center gets a small **Web tours** link to it. Both are admins only, as Web tour authoring is today.
- **H11. Out of the GL library.** The GL widget stops listing Web tours and drops their filter. The recorder's quiet save (`/web-tour-intake`) keeps writing drafts the same way, and its "open in editor" target becomes `/web-tours`.

### Admin Settings > Help Center

- **H12. + New.** The header button changes from **+ Add Item** to **+ New**, which opens a menu:
  - **Record a Live tour**
  - **Move from library**
  - **New Picture guide**
- **H13. The round trip.** **Record a Live tour** and **Edit** on a Live tour close Admin Settings. Finishing the recording or pressing Done in the tour editor reopens Admin Settings > Help Center with that tour selected. This happens only when the start was in Admin Settings; a widget start ends on the board with the H2 toast.
- **H14. Move from library.** A picker with a search box, a **Type** select and an **Owner** select (Mine, Building), and a checkbox per row. **Move** creates a Hidden, Unfiled item for each pick, applying H5 and H6, and leaves the picker with the moved items selected in the list.
- **H15. Hidden or Published.** Every item is in exactly one of the two. **Publish** is one button that publishes the tour snapshot when the item is a Live tour, then makes the item visible. Publish is refused, with the reason in place of the button, while the item is Unfiled or its tour has an unchecked or failing step. **Hide** reverses it. The "Live tour · Draft" state and its instructions go.
- **H16. Unfiled.** An item with `categoryId: ''`. Unfiled items list first under an **Unfiled** heading with a count. Teachers never see one: it can't be Published, and the teacher-side reader (`hooks/useHelpResources.ts`) also skips any item with `categoryId: ''`, which covers older items already stored that way.
- **H17. Layout: list plus detail pane.**
  - **List (left):** plain category headings, with no bordered sections or row cards. Each row shows its title, kind and status (Hidden or Published), plus a dot when it needs attention. Rows drag to reorder within a category and between categories.
  - **Detail (right):** the selected item's title and description (edited in place), kind, status, category select, widgets select and scope. Below them are its step count, opens and health, then **Edit**, **View steps** (Live tour), **Copy to my library** (Picture guide), **Publish**/**Hide** and **Delete**.
  - **Selection:** stored with the tab, so the H13 round trip and a reload land on the same item.
  - **Header:** search, a **Show** select (All, Hidden, Published, Needs attention) and **Categories**, beside + New.
  - **Phone width:** the list and detail pane stack, and selecting a row opens its detail with a Back button.
- **H18. Health per item.** Each Live tour's detail pane shows its health from `TourHealthPanel`: missed steps, last check and runs. **Needs attention** in the Show select lists only tours with problems. Unmapped controls (`UnmappedAnchorsSection`) become their own view, reached from the Show select. The separate Tour health box and the linked-library box (`LinkedLibrarySets`) go.
- **H19. Categories dialog.** **Categories** opens a dialog to add, rename, reorder and delete categories, for super admins as today. Deleting a category makes its items Unfiled and Hidden, and the confirm says how many Published items that hides.
- **H20. Scope follows the author.** A super admin's new items are global (`orgId: null`), and an org admin's are for their org. The detail pane shows the scope, and a super admin can change it. That needs one rules change: the `help_resources` update rule's `unchanged('orgId')` gives way for a super admin. It's tiny for the size budget, and an older client never sends `orgId`. An admin with no org and no super admin role can't hold a Help Center item, so record, Move to Help Center and + New are disabled for them with the reason ("You need an organization to add help."). The H3 script writes global items.

### Rollout

- **H21. No flag, with one teacher-visible change.** The authoring side is an admin-only tool, exempt under CLAUDE.md. One change reaches teachers: today they see building Live tours that aren't in the Help Center in their own GL library (`GuidedLearningManager.tsx` `hasLiveTour`). Once H3 runs, those tours leave the library and reach teachers only when an admin publishes them in the Help Center, and a moved building Picture guide (H6) leaves it too. Under H1 nothing disappears before it has a Help Center item. H3 runs on dev when PR 1 merges, and on prod right after the release that carries it. **Open for Paul:** this ships unflagged on his "no flag" answer, which was given before this teacher-visible change was known.
- **H22. Tour anchors carry over.** `admin.help-center.item-edit`, `item-delete` and `item-toggle` keep their ids, with `item-toggle` moving to Publish/Hide. The Add Item anchor moves to + New. Every new control (menu items, picker, detail fields, Categories, the Web tours link, Manage tours, the kebab action) gets an anchor in `config/tourAnchors.ts`, and the new files go on a surface in `config/tourSurfaces/admin.ts` or `guidedLearning.ts`. `pnpm run check:tour-anchors` must pass against `config/tourAnchorsInUse.json`.

## Build: two PRs, built at the same time

Paul's aim is speed with correctness: few PRs, each built by one lead session that fans its work out to subagents with file ownership that doesn't overlap, then folds it together. Two PRs, because Web tours (PR 2) share almost no files with the Help Center (PR 1) and each one stays reviewable.

Both leads run as **cloud sessions** from `dev-paul`, not on the laptop, because several heavy local sessions have run the laptop out of memory before. Each lead:

1. Writes the shared contract itself first (step 0 below) and commits it, so every subagent builds on real types, not guesses.
2. Starts its workstream subagents **in one message**, each told its owned files, the contract, and "touch nothing else; if you need a change outside your files, report it instead".
3. Folds the results, runs `pnpm exec vitest related --run` on the changed files and one scoped type-check, then has a fresh subagent review the whole diff adversarially against this plan's H-numbers before opening the PR.
4. Opens the PR into `dev-paul` and fixes what CI and the review find.

### PR 1: Help Center home (H1-H8, H12-H22)

**Step 0, the lead, before fanning out:** `utils/helpCenterItems.ts` (new), plus `types/helpCenter.ts`:

- `createHiddenHelpItem(set, author)`: Hidden, Unfiled, scope by H20, refusing an author with no org who isn't a super admin.
- The `firestore.rules` change from H20 (a super admin may change `orgId`) and its rules test.
- `create_live_tour` always creating the Hidden item (H1), with the connector guide's publish wording matched to H15.
- `moveSetToHelpCenter(set, author)`: the personal-copy logic lifted out of `GuidedLearningPicker`, with the H5 tag and the H6 building case.
- `publishHelpItem(item)` and `hideHelpItem(item)`: H15, including the tour snapshot publish and the refusal reasons.
- `copyHelpItemToLibrary(item, uid)`: H7.
- The `HelpCenterReturn` event: `requestOpenHelpCenter({ selectId })` in `components/tours/tourState.ts`, and the `origin: 'help-center' | 'widget'` field on the record and edit requests.

Unit tests for each helper.

**Then four subagents in parallel:**

| Workstream                 | Owns                                                                                                                                                                                                                                                                                                  | Work                                                                                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Admin list and detail   | `components/admin/HelpCenter/*` (except the health panels' internals), `config/tourSurfaces/admin.ts`, its rows in `config/tourAnchors.ts`                                                                                                                                                            | H12, H14, H15 UI, H16, H17, H19, H20 UI, the Web tours link (H10, a plain link to `/web-tours`), deleting `LinkedLibrarySets`, the embed form and `GuidedLearningPicker`'s picking mode, and rewriting `HelpCenterManager.test.tsx` |
| B. Round trip and recorder | `components/tours/tourState.ts` callers, `recorder/RecordingSession.tsx`, `recorder/TourRecordingHost.tsx`, `components/tours/editor/TourEditorHost.tsx`, `components/layout/sidebar/Sidebar.tsx`, `components/admin/AdminSettings.tsx` (selection with the tab)                                      | H1 save path, H2 toast, H13                                                                                                                                                                                                         |
| C. GL library              | `GuidedLearningManager.tsx`, `GuidedLearning/Widget.tsx`, `hooks/useGuidedLearning.ts`, `helpCenterSets.ts`, `config/tourSurfaces/guidedLearning.ts` and its anchor rows                                                                                                                              | H1 (hide Live tours), H4 kebab, the H5 tag and deferred removal, H6 confirm, removing Move to Help Center and Move to library for tours. **Does not touch Web tour code paths** (PR 2 owns them).                                   |
| D. Health and data         | `TourHealthPanel.tsx`, `UnmappedAnchorsSection.tsx` (reshaped to render inside a detail pane or a view), `components/help/*` and `hooks/useHelpResources.ts` (drop embed rendering, skip Unfiled per H16), `scripts/migrate-live-tours-to-help-center.mjs` with `--dry-run`/`--apply` and `--project` | H8 teacher side, H18 pieces, H3 script and a test of its selection logic                                                                                                                                                            |

`config/tourAnchors.ts` is the one shared file. Each workstream adds only its own rows, in its own block, and the lead resolves the merge.

### PR 2: Web Tours page (H9-H11)

Step 0 is the lead adding the `/web-tours` route shell in `App.tsx` with its providers and admin gate, plus a `config/tourSurfaces/` entry. Then three subagents:

| Workstream                                   | Owns                                                                                                                                                                      | Work                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| E. Page                                      | `components/tours/web/WebToursPage.tsx` (new) and a list component, reusing `webTours.ts` list and draft helpers and opening the existing `WebTourEditor` unchanged       | H9 list, editor, Check tour and public link |
| F. Health and intake                         | `WebTourHealthSection.tsx` (moved under `components/tours/web/`), `WebTourIntakePage.tsx`, `recorder/intake.ts` target                                                    | H9 health, H11 intake target                |
| G. Out of the GL library, into the extension | The Web tour blocks of `GuidedLearningManager.tsx` and `Widget.tsx` (Web tour hunks only), `extension/src/sidepanel/*` Manage tours button, and an extension version bump | H10, H11                                    |

**Overlap with PR 1:** G edits Web tour hunks of the same two GL files that workstream C edits. The hunks don't overlap. Merge PR 1 first, then PR 2 rebases. PR 2 must not change `WebTourEditor` internals, so it stays clear of [WEB_TOURS_CROSS_SITE.md](WEB_TOURS_CROSS_SITE.md) slice 2. Whichever of the two lands second rebases.

### Verification

- **In the cloud:** `vitest related` on each workstream's files, the lead's one scoped type-check, and CI on the PR.
- **After PR 1 merges:** run H3 on `spartboard-dev` (dry run, then `--apply`). Then check on localhost against dev: record from Admin Settings (round trip lands on the tour), record from the widget (toast, then Open), move a personal set that students have open (tag, then removal), Publish refused while Unfiled, and phone width.
- **After PR 2 merges:** open `/web-tours` from the side panel in real Chrome with the dev extension, record a Web tour with no editor open (intake lands on the page), and check that the GL widget shows no Web tours.

## Out of scope

- Teachers authoring tours or a separate "tour author" role.
- Web tours in the teacher-facing Help Center (TOURS_10X S3 stands).
- Moving Web tour authoring into the extension itself (ADR 0006).
- Changes to how a Live tour or Picture guide plays for teachers.
