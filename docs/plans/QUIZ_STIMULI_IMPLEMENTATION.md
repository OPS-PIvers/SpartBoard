# Quiz Question Stimuli — Implementation Plan

**Status:** Spec locked 2026-08-26 via grilling session with Paul. Ready to implement.
**Scope:** One build — all stimulus types ship together; `pnpm run validate` green before push.
**Supersedes:** Parts of `docs/rich-response-wayfinder.md` §RR-C1/C2/C3 and §RR-10 — deviations are called out explicitly below. Read `docs/rich-response/rr-c3-stimulus-attachment-grounding.md` for the source-verified grounding audit (line cites).

## 1. Feature summary

Teachers attach **stimuli** to quiz questions — content students see/interact with while answering. Types: **image, PDF, audio, video (file URL), YouTube, Google Doc/Slides embed**. A stimulus can apply to a single question, any subset of questions, or all questions. Renders on student devices in both live sessions and self-paced assignments, on the teacher's live monitor, and in the post-submit student review.

## 2. Data model

### 2.1 New types (`types.ts`)

```ts
export type QuizStimulusType =
  | 'image'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'youtube'
  | 'gdoc-embed';

export interface QuizStimulus {
  id: string; // stable UUID — pointers reference this
  type: QuizStimulusType;
  url: string; // source URL (or Drive-derived URL)
  driveFileId?: string; // set when the file lives in the teacher's Drive
  label: string; // authoring-only; never shown to students
  playLimit?: number; // audio/video/youtube only; undefined = unlimited
}
```

- `QuizData` (`types.ts:3087`) gains `stimuli?: QuizStimulus[]`.
- `QuizQuestion` (`types.ts:3030-3070`) gains `stimulusIds?: string[]` — **the pointer array IS the grouping**. No group/section objects (per RR-C3). "All questions" is simply every question carrying the id.
- ⚠️ `VideoActivityQuestion = Omit<QuizQuestion, ...>` (`types.ts:~4371`) inherits new fields automatically — add `'stimulusIds'` to the `Omit` in the same commit.
- `QuizPublicQuestion` (`types.ts:3218-3242`) gains `stimulusIds?: string[]`; `QuizSession` (`types.ts:3259`) gains a projected `stimuli?: QuizStimulus[]` (labels may be stripped; strip `playLimit`? No — students need it enforced client-side, keep it).

### 2.2 Projection to students

`toPublicQuestion` in `hooks/useQuizSession.ts:288-326` is a hand-written allowlist — add an explicit `stimulusIds` line. Session start must also copy the quiz's `stimuli` array onto the session doc (only entries actually referenced by at least one question).

### 2.3 Shuffle

`utils/quizShuffle.ts` → `shufflePublicQuestions:96-101` (single call site: `components/quiz/QuizStudentApp.tsx:1231`). Make it **connected-component-aware**: questions sharing any stimulus id form a component that stays contiguous (in original relative order); components + standalone questions shuffle as units. Pure function, unit-test heavily.

## 3. Storage: teacher's Google Drive (NOT Firebase Storage)

**Explicit override of RR-C2.** Paul's decision: all uploaded files live in the uploading teacher's Drive, like quiz JSON. No Storage rules changes, no new Firestore collections, no migrations.

- **Add sources:** device upload (app uploads to teacher's Drive via `QuizDriveService`/Drive API), Drive picker (pattern: `components/common/DriveImagePicker.tsx`), or direct URL paste (hotlink; not copied).
- **Sharing:** students (anonymous Firebase auth in live sessions) can only reach Drive files shared "anyone with link can view". On attach, the app checks sharing state and **prompts the teacher each time** to confirm making the file link-viewable before completing the attach (chosen over auto-share). Warn similarly for pasted gdoc-embed URLs (can't always verify — show a standing caution).

## 4. Rendering

### 4.1 Student layout (both live + self-paced; same `ActiveQuiz` component)

`components/quiz/QuizStudentApp.tsx` (3799 lines; question column at `:2237`, question text `:2316`). Currently zero media elements in the file.

- **Wide screens:** doc-shaped stimuli (`pdf`, `gdoc-embed`) render in a **resizable left panel** beside the question column; `image`/`video`/`youtube` inline above the question; `audio` as a compact player above it.
- **Narrow screens (phones):** everything stacks above the question; doc/PDF open in a collapsible or full-screen viewer.
- **House idiom — do not key media elements** (see `GuidedLearningPlayer.tsx:761-770`): a stimulus shared across consecutive questions must NOT remount/restart when the student advances within its question set. Swap src in place only when the stimulus set changes.
- ⚠️ Verify the 768px Chromebook layout (RR-A5 flagged it un-measured).

### 4.2 Type-specific renderers (reuse precedents)

| Type       | Approach                                      | Precedent                                                                                                      |
| ---------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| image      | `<img>` on Drive/pasted URL                   | `GuidedLearningPlayer.tsx:761`                                                                                 |
| audio      | compact player, play-count enforcement        | `GuidedLearning/components/interactions/AudioInteraction.tsx:57`                                               |
| video      | `<video>` (file URL)                          | `interactions/VideoInteraction.tsx:63,72`                                                                      |
| youtube    | YT iframe API, play-count enforcement         | `utils/youtube.ts`, `components/videoActivity/VideoPlayer.tsx`                                                 |
| gdoc-embed | iframe via `convertToEmbedUrl`                | `utils/urlHelpers.ts:68`, `components/widgets/Embed/Widget.tsx:211`, `components/plc/docs/PlcDocsBody.tsx:294` |
| pdf        | **pdf.js** (new dep `pdfjs-dist`) — see below | —                                                                                                              |

**PDF (per Q7/Q14 decisions):** render with pdf.js in a scrollable panel with zoom/page nav. Byte fetch: Drive API `GET /drive/v3/files/{id}?alt=media&key=<browser API key>` works CORS-friendly for link-shared files without user auth. **Fallback:** if the byte fetch fails, render the Drive preview iframe (`drive.google.com/file/d/{id}/preview`) so students are never stranded. Pasted non-Drive PDF URLs: fetch directly; same iframe-less fallback = error card.

### 4.3 Replay limits

`playLimit` on audio/video/youtube entries (default unlimited). Client-side enforcement: count completed plays per stimulus per attempt (persist in the attempt/response doc so refresh doesn't reset). Visual types always viewable.

### 4.4 Load failure

Reload button **scoped to the stimulus container** (retries only that stimulus), inline warning card, student can keep answering. Log the failure to the session (per-student) so the teacher sees it on the monitor roster.

### 4.5 Teacher live monitor

The monitor's current-question area renders the question's stimuli — **collapsed by default, expandable** (for projecting). Roster shows stimulus-load-failure indicators (§4.4).

### 4.6 Review views

- Post-submit **student review** (where enabled): each question shows its stimuli collapsed/expandable.
- Teacher per-student results views: **paperclip badge only** on questions that had stimuli, no inline rendering.

## 5. Authoring UX (quiz editor)

**Both entry points** (supersedes RR-10's popover-only decision), operating on the same `stimuli` array:

1. **Quiz-level "Stimuli" panel** in the editor (`components/widgets/QuizWidget/components/QuizEditor.tsx`): add/manage entries (label, type, source, playLimit, delete), and assign each to questions (multi-select checklist + "all questions" shortcut).
2. **Per-question attach popover** on each question card/detail pane: pick an existing stimulus or add a new one inline; shows which questions each entry covers.

Deleting a stimulus removes its id from every question (no dangling pointers — validate on save too). `QuizPreview.tsx` should render stimuli like the student view.

## 6. Persistence pass-through checklist (all must carry `stimuli` + `stimulusIds`)

- `hooks/useQuiz.ts` — `saveQuiz:225-314` rebuilds metadata from scratch: quiz JSON (Drive) carries stimuli automatically since the whole `QuizData` is serialized, but **verify**; `duplicateQuiz:552` must deep-copy stimuli (keep same ids — file references are shared, per PLC decision).
- `utils/quizSearchText.ts` — `buildQuizSearchText` uses `q.text` only; optionally append stimulus labels. `quizQuestionDedupeKey` intentionally ignores stimuli (merge dedupe unaffected).
- **PLC sync:** `hooks/useSyncedQuizGroups.ts` `publishSyncedQuiz`/`pullSyncedQuizContent` publish `{title, questions, behavior}` — **add `stimuli` or it silently drops**. Pulled quizzes keep pointing at the owner's link-shared Drive files (no copy; breakage surfaces via §4.4).
- **Shared quizzes:** `useQuiz.ts` `shareQuiz:608` spreads whole quizData (passes through); `importSharedQuiz:623` rebuilds `{id,title,questions}` — **must add `stimuli`**.
- Session: `useQuizSession.ts` projection (§2.2); assignment flows in `useQuizAssignments.ts` (RR-C3 accepted that a peer's mid-attempt edit can swap a stimulus — no mitigation in v1).
- Import adapters (`adapters/quizImportAdapter.ts`, CSV/Sheets, AI generation) produce questions without stimuli — no change needed, but must not strip the field on re-save of an existing quiz.

## 7. Out of scope / explicitly declined

- Firebase Storage hosting (RR-C2) — overridden, Drive only.
- Auto-sharing Drive files without teacher confirmation.
- Copying stimulus files on PLC pull.
- Inline stimulus rendering in teacher results breakdowns.
- doc/docx _file_ uploads (Google Doc/Slides supported as **embeds by URL** only).
- Timed-reveal / view-once policies for visual types.

## 8. Verification requirements

- Unit tests: connected-component shuffle, pointer cleanup on stimulus delete, projection allowlist, PLC/share pass-through, playLimit counting.
- Browser walkthrough on `vite-dev-bypass` (port 56300, `/` dashboard with MockQuizDriveService): author a quiz with each stimulus type, attach one to a subset + one to all, run a live session as a student tab, verify layout wide + `resize_window` mobile, kill a URL to exercise the reload/warn/log path.
- `pnpm run validate` green before commit. Stage files explicitly — never `git add .` (`Dashboards/` and `.impeccable/` stay uncommitted).

## 9. Decision log (grilling session, 2026-08-26)

| #       | Decision                                                              |
| ------- | --------------------------------------------------------------------- |
| Q1      | Grouping = any subset via pointer arrays                              |
| Q2      | Both live sessions and self-paced assignments                         |
| Q3      | Split (doc-shaped left) + stacked on narrow screens                   |
| Q4/Q6   | Both authoring entry points (quiz-level panel + per-question popover) |
| Q5      | Google Doc/Slides embed-by-URL added (overrides RR-C3 refusal)        |
| Q7/Q14  | pdf.js renderer, Drive-preview-iframe fallback                        |
| Q8      | Stimuli render on the live monitor (collapsed, expandable)            |
| Q9      | Play-count limits for audio/video/YouTube only                        |
| Q10     | Scoped reload button + inline warn + teacher-visible log              |
| Q11     | Sources: device upload, Drive picker, and URL paste                   |
| Q12/Q15 | All files live in teacher's Drive; one build, no phases               |
| Q13     | Prompt teacher each time before making a file link-viewable           |
| Q16     | PLC pulls keep pointing at owner's Drive files                        |
| Q17     | Stimuli in student review; badge-only in teacher results              |
