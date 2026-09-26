# Activity Wall — merged student page (one link, Padlet model)

Follow-up to `ACTIVITY_WALL_REDESIGN.md`. Settled in a design interview on 2026-09-03 and
confirmed by Paul. Ships as **one PR on `dev-paul`, stacked after #2796**. Every item is
self-contained: an implementer should be able to build it from the item text plus the code.

## Why

Teachers currently hand out two URLs: one to post (`/activity-wall/{sessionId}`) and one to
view (`/activity-wall/gallery/{shareId}`). Padlet gives one link that does both. The student
page today is a bare composer plus "my posts"; students never see the wall. This PR turns the
student link into the live wall with posting built in, and demotes the gallery share to an
explicit read-only "Public gallery" link.

## Product decisions (settled — do not re-litigate)

| Decision              | Answer                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One link              | The student link renders the live wall via `LayoutRouter` with a composer. Students see approved posts, their own pending posts, and can post from the same screen.                                                                                                                                                                                                                                                  |
| Public gallery        | The existing share (`shared_activity_walls/{shareId}`, `/activity-wall/gallery/{shareId}`, `/r/<code>`) stays as a read-only link named **"Public gallery"** in the UI. Never "family link". Still created explicitly by the teacher with expiry and revoke; never auto-created. URLs and short codes unchanged so handed-out links keep working.                                                                    |
| Share modal           | Two tabs: **Student link** and **Public gallery**. Widget toolbar keeps Copy student link, Join QR, Library as primary. "Open gallery" becomes **"Open student view"** (opens the student link in a new tab).                                                                                                                                                                                                        |
| Composer              | Floating "+ Add post" button opening a bottom sheet on every layout, plus a **hover-plus** spot per layout that pre-fills placement: column body → `sectionId`; table cell → `cellKey`; timeline gap between two cards → `order` midpoint; map click → `lat`/`lng`; wall → plus in the bottom-right of the wall area; word cloud → fixed corner plus. On touch (no hover) the plus is always visible at low opacity. |
| Identification        | Name / PIN walls ask on arrival (one screen, remembered in the browser as today). Anonymous walls land straight on the wall.                                                                                                                                                                                                                                                                                         |
| Visibility toggle     | New per-wall boolean `studentsCanSeePosts` (default `true`). When false the student page shows only the student's own posts and a note that the teacher will reveal the wall. Reveal is live: a **Visible / Hidden** pill in the widget header beside Open / Closed writes the flag to the session doc.                                                                                                              |
| Engagement settings   | `allowLikes`, `allowComments`, `allowCommentResponses` move onto the wall (library entry + session). Copied **once** from the most recent active share when the teacher next opens a wall that lacks them. Likes and comments work on both the student page and the public gallery.                                                                                                                                  |
| Likes/comments data   | Move from `shared_activity_walls/{shareId}/{likes,comments}` to `activity_wall_sessions/{sessionId}/{likes,comments}` so both surfaces share one set. Existing share-level likes/comments are **not migrated** (low value, read-only history); the gallery reads the session collections only.                                                                                                                       |
| Pending posts         | A student sees their own pending post with an "Awaiting approval" badge. Other students' pending posts are hidden. Teacher sees everything.                                                                                                                                                                                                                                                                          |
| Student edit / delete | Own posts only, gated by the existing `allowStudentEdit` / `allowStudentDelete`. Rendered as small affordances on the student's own cards.                                                                                                                                                                                                                                                                           |
| Teacher powers        | Teachers **always** see edit and delete on every post, in the widget and when signed in on the student view. Teachers can post from the widget face; their posts are auto-approved and labelled with the teacher's name regardless of identification mode.                                                                                                                                                           |
| Closed wall           | Wall still renders for students; composer and hover-plus are hidden and a "Closed" chip shows in the header.                                                                                                                                                                                                                                                                                                         |
| Old composer page     | The student-only composer + `MyPostsList` page is removed; `StructureFields` (column/cell/label pickers) moves into the sheet as a fallback when the student used the floating button instead of a hover-plus spot.                                                                                                                                                                                                  |

## Data changes

`types.ts`

- `ActivityWallLibraryEntry` and `ActivityWallSession` gain `studentsCanSeePosts?: boolean`,
  `allowLikes?: boolean`, `allowComments?: boolean`, `allowCommentResponses?: boolean`.
- `ActivityWallSubmission` gains `authorRole?: 'teacher'` (set only on teacher posts).
- `ActivityWallLike` / `ActivityWallComment` unchanged in shape; only their path moves.

`firestore.rules` (`match /activity_wall_sessions/{sessionId}`)

- **Submissions read** (currently owner, admin, `publiclyShared` + approved, or own post): add
  "enrolled or guest-allowed caller may read approved posts when `studentsCanSeePosts != false`".
  Reuse `awPadletAccessOk()`. Own posts stay readable regardless.
- **Submissions update/delete**: unchanged for students. Confirm the owner branch already lets
  the teacher edit/delete any post (it does via `sessionId.matches(uid + '_.*')`).
- **Teacher create**: allow the owner to create a submission with `status: 'approved'` and
  `authorRole: 'teacher'` even when moderation is on.
- **New** `match /likes/{likeId}` and `match /comments/{commentId}` under the session, mirroring
  the existing rules at `shared_activity_walls/.../likes|comments` but gated on
  `awSession().allowLikes / allowComments` and on `awPadletAccessOk() || publiclyShared`.
- Session doc `update` by owner: allow the new flags. Add a rules test file under `tests/rules/`
  for: student reads approved posts only when `studentsCanSeePosts` is on; student never reads
  another student's pending post; teacher creates an approved post under moderation; guest on an
  SSO-only wall is denied.

`firestore.indexes.json`: composite index on `submissions` for `status == approved` + `submittedAt`
if the student query needs it (check the gallery query first; it may already exist).

## Work items

Each item lists the files it owns. Items in the same phase are file-disjoint and can run in parallel.

### Phase A — data and rules

- **A1 Types + defaults.** `types.ts` fields above; `buildDefaultWall` in
  `components/widgets/ActivityWall/editor/` sets `studentsCanSeePosts: true` and the three
  engagement flags `false`. `normalizeActivityWallLibraryEntry` / `normalizeActivityWallSession`
  in `utils/activityWallNormalize.ts` pass them through.
- **A2 Rules.** `firestore.rules` changes above plus `tests/rules/activityWallMergedPage.test.ts`.
- **A3 Session mirror.** `useActivityWallSession` in
  `components/widgets/ActivityWall/hooks/useActivityWallSession.ts` mirrors the four new flags
  onto the session doc. Add `setStudentsCanSeePosts(visible)` next to the existing open/closed
  writer.
- **A4 One-time engagement copy.** In `WallEditorModal.makeDraft`, when the entry lacks all three
  engagement flags and `session.latestShareId` exists, read that share doc once and seed the
  draft. Owner-side, so no rules change.

### Phase B — student page

- **B1 Student page shell.** Rewrite `components/activityWall/ActivityWallStudentApp.tsx`:
  arrival identification screen (reuse the current name/PIN form), then `WallShell` →
  header (title, prompt, Open/Closed chip, image-size button reused from the gallery) →
  `LayoutRouter mode="student"` → floating "+ Add post". Subscribe to approved posts
  (`where('status','==','approved')`) and own posts (`where('authorUid','==',uid)`), merge
  by id, and pass `showNames` from the session. When `studentsCanSeePosts === false`, render
  only own posts plus the reveal note.
- **B2 New render mode.** `components/activityWall/render/types.ts` adds `'student'` to
  `WallRenderMode`. `scale.ts` maps it to `GALLERY_SCALE`. `SubmissionCard` shows the
  "Awaiting approval" badge for own pending posts, own-post edit/delete when the callbacks are
  present, and never the teacher approve/reject strip in student mode.
- **B3 Composer sheet.** New `components/activityWall/submission/ComposerSheet.tsx`: bottom sheet
  built from the existing `ContentFields`, `SubmissionTypePicker`, `StructureFields`, and
  `MapPinPicker`. Accepts a `placement` prefill (`sectionId` | `cellKey` | `order` | `lat,lng`)
  and hides the matching structure field when prefilled. Reuses the current submit path
  (slot ids, cap check, Drive staging, link preview fetch) lifted out of the old page into
  `components/activityWall/submission/submitPost.ts`.
- **B4 Hover-plus.** New `components/activityWall/render/AddSpot.tsx` rendered by each layout
  when `onAddAt` is supplied (student and widget modes only): Columns → one per column body;
  Table → one per cell; Timeline → one per gap (between consecutive cards, plus leading and
  trailing); Map → click handler on the map that emits `lat,lng`; Wall → bottom-right of the
  board; WordCloud → fixed corner. Shows on `:hover` / `:focus-within`; on
  `(hover: none)` always visible at `opacity-40`. Extends `WallRenderActions` with
  `onAddAt?: (placement: WallPlacement) => void`.
- **B5 Own-post edit and delete.** `onEdit` in student mode opens the composer sheet with the
  post loaded; `onDelete` confirms via `useDialog().showConfirm`. Both gated by
  `allowStudentEdit` / `allowStudentDelete`.
- **B6 Likes and comments on the student page.** Move `EngagementFooter`, `CommentNode`, and
  `CommentComposer` out of `ActivityWallGalleryView.tsx` into
  `components/activityWall/engagement/`. Point them at the session collections. Render on the
  student page when the wall flags allow.

### Phase C — gallery, widget, share

- **C1 Gallery reads session engagement.** `ActivityWallGalleryView.tsx` uses the moved engagement
  components against `activity_wall_sessions/{sessionId}/{likes,comments}` and reads the three
  flags from the session (fall back to the share doc for shares created before this PR).
- **C2 Widget header pill + teacher posting.** `components/widgets/ActivityWall/Widget.tsx`: add
  the Visible / Hidden pill; supply `onAddAt` to `LayoutRouter` in widget mode so hover-plus
  works for the teacher; teacher submissions write `status: 'approved'`,
  `authorRole: 'teacher'`, `participantLabel: <teacher display name>`.
- **C3 Share modal tabs.** `components/widgets/ActivityWall/ShareModal.tsx`: tabs "Student link"
  (copy, QR) and "Public gallery" (existing create/expiry/revoke flow, empty state "Create public
  gallery link"). Rename "Open gallery" → "Open student view" in the toolbar; it opens
  `buildStudentWallLink(...)`.
- **C4 Wall editor.** `ModerationAndAccess` gains "Students can see posts"; a new
  "Engagement" section holds likes / comments / replies. Remove those toggles from the share
  modal's create form.
- **C5 Cleanup.** Delete `MyPostsList.tsx`; remove the share-level likes/comments writes; update
  `docs/plans/ACTIVITY_WALL_REDESIGN.md` with a pointer to this doc.

### Phase D — tests and verification

- Unit: `ActivityWallStudentApp.test.tsx` (arrival screen per identification mode, hidden wall
  shows own posts only, closed wall hides composer, pending badge), `AddSpot` per layout in
  `layouts.test.tsx`, `ComposerSheet` placement prefill, `ShareModal` tabs, `Widget` pill writes
  the session flag, `SubmissionCard` student-mode affordances.
- Rules: the new `tests/rules/` file (CI-only on Paul's machine, see memory).
- Manual on the dev preview: one wall per layout, post from each hover-plus spot on desktop and a
  phone, reveal toggle updates a second browser live, public gallery link still resolves, teacher
  edit/delete on a student post.

## Explicit assumptions

- Session-level likes/comments start empty; existing share-level ones are not copied.
- `WallRenderMode` grows to four values; `teacher` mode (moderation drawer) is untouched.
- The `?data=` base64 legacy student link keeps working through the existing fallback until
  P3-3 retires it.
