# Quiz Read-Aloud (TTS) — Implementation Plan

**Date**: 2026-09-08 · **Branch**: `dev-paul` · **Status**: Draft for product-owner review — decisions in §2 were settled in a 16-question design interview on 2026-09-08; no code has been written. File paths and line numbers were verified against `dev-paul` at `76a98c372` on 2026-09-08; re-verify before relying on them.

Bring the accommodation that the Google Apps Script "Spartan Read Aloud" portal
(`OPS-PIvers/Spartan_Read_Aloud`) provides for paper assessments into SpartBoard's
native quizzes, so that students whose plans require assessments read aloud can
hear quiz questions, answer choices, and text inside stimuli without leaving the
quiz. The Apps Script portal stays in service for scanned/paper assessments.

---

## 1. Problem statement

- Some students' IEP/504 plans require all assessments read aloud. Today that is
  served by a separate Apps Script portal that OCRs uploaded PDFs/Docs, splits them
  into numbered chunks, synthesizes WAV audio with Google Cloud Text-to-Speech
  (`en-US-Standard-H`), stores it in Drive, and plays it with highlighting.
- SpartBoard quizzes are digital and structured, yet have **no** text-to-speech
  anywhere (`speechSynthesis`, `texttospeech`, `readAloud` have zero hits in the
  app, `functions/`, and `locales/`). `docs/rich-response-wayfinder.md` (RR-11)
  recorded this gap before per-student overrides existed.
- The plumbing an accommodation needs already exists:
  - **Per-student accommodations**: `StudentOverride` (`types.ts:4663`) carries
    extended time, question subsets, hidden options, rubric overrides, tab-warning
    thresholds and window shifts. It is delivered to the student only through the
    server-written pointer doc `/student_assignments/{studentUid}/items/{assignmentId}`
    (`StudentAssignmentPointer`, `types.ts:4680`), written solely by
    `setAssignmentTargetsV1` (`functions/src/studentAssignmentTargets.ts`) with
    field-level merge rules that prevent a partial payload from erasing a stored
    accommodation. Roster-level standing defaults live in
    `ClassRoster.defaultOverridesByStudentId` (`types.ts:195`). Teachers edit
    overrides in `components/common/library/OverrideEditorRow.tsx`.
  - **Answer-key-free student text**: `QuizPublicQuestion` (`types.ts` after
    `QuizBehaviorSettings`) is built by `toPublicQuestion`
    (`hooks/useQuizSession.ts:338`) and stored on `QuizSession.publicQuestions`
    (`types.ts:3649`). It has `text`, `choices`, `matchingLeft`/`matchingRight`,
    `orderingItems`.
  - **SSO student identity**: SSO students sign in with a custom token carrying the
    claims `studentRole: true`, `orgId`, `classIds` (validated client-side in
    `context/StudentAuthContext.tsx:96-121`, checked server-side as
    `request.auth.token.studentRole === true`, e.g. `functions/src/studentIdentity.ts:1225`).
    Anonymous code+PIN joiners have none of these.
  - **Vertex/Gemini callables** with ADC auth and per-user daily quota in
    `ai_usage/{uid}_{featureId}_{YYYY-MM-DD}` (`functions/src/aiGeneration.ts:443-479`);
    `generateWithAI` already has an `ocr` generation type (`aiGeneration.ts:805`).
  - **Storage precedent** for student-readable quiz audio:
    `quiz_response_media/{sessionId}/{responseKey}/{fileName}` (`storage.rules:259`).
- The student quiz app (`components/quiz/QuizStudentApp.tsx`, 4,828 lines) has no
  settings tray, language switcher, or font-size control; a read-aloud control is
  its first per-student UI affordance.

## 2. Decisions (locked 2026-09-08)

| #   | Decision        | Choice                                                                                                                                                                                                                                                                                                                            |
| --- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Scope           | Native quiz content **plus text inside stimuli**. The Apps Script portal remains for paper assessments; no document-upload port.                                                                                                                                                                                                  |
| Q2  | Engine          | **Google Cloud Text-to-Speech** called from a Cloud Function; MP3 cached in Storage keyed by hash of text + voice. No browser `speechSynthesis`.                                                                                                                                                                                  |
| Q3  | Who             | **Per-student override** (`StudentOverride.readAloud`) **plus** an assignment-level "Allow read-aloud for everyone" toggle.                                                                                                                                                                                                       |
| Q4  | Playback UX v1  | Speaker button on the question, on each choice/item, and on each text-bearing stimulus; a "Read question" button; playback speed 0.75×–1.5×; replay. Part-level highlight and an opt-in auto-read switch (see D1, D5). No word-level sync in v1.                                                                                  |
| Q5  | Stimulus text   | Extracted **at authoring time** (PDF text layer first, Gemini OCR fallback via the existing `ocr` generation type), stored as `QuizStimulus.readAloudText`, **teacher-reviewable and editable**. Nothing unreviewed is ever synthesized.                                                                                          |
| Q6  | Voice           | **Neural2** voices, admin-configurable default per language in `admin_settings`.                                                                                                                                                                                                                                                  |
| Q7  | When            | **Prepared at assign time** (R1): creating a session with read-aloud on synthesizes every part in the background under the teacher; students only ever play cached files. On-demand synthesis remains as a fallback for the assign-then-start race and pre-feature sessions. Cached forever by content hash.                      |
| Q8  | Language        | Optional **quiz-level `language`** (BCP-47, default `en-US`) set in the quiz editor; voice map picks the matching Neural2 voice.                                                                                                                                                                                                  |
| Q9  | Text source     | **Server-derived only.** The client sends `{sessionId, questionId, part}`; the function reads the session doc and synthesizes only text that exists there (or the reviewed `readAloudText`). Client-supplied text is never accepted.                                                                                              |
| Q10 | Eligibility     | **SSO students only.** The caller must carry `studentRole === true` and own a pointer doc for the session. Anonymous PIN joiners never see the control.                                                                                                                                                                           |
| Q11 | Gating          | New global feature permission **`quiz-read-aloud`** (admin → beta → public). When off for a user, no reference to read-aloud renders anywhere: not the override checkbox, the assignment toggle, the editor fields, nor student buttons.                                                                                          |
| Q12 | Delivery        | **Three stacked PRs** into `dev-paul` (§7).                                                                                                                                                                                                                                                                                       |
| Q13 | Quota           | Characters counted **under the teacher's uid** in `ai_usage` with feature key `tts` (R2); cache hits are free. No student quota and no per-session ceiling: a student can only request parts that exist in their session. A **global monthly counter** switches new synthesis to Standard voices past the Neural2 free tier (R3). |
| Q14 | "Everyone"      | Means **all SSO students on that assignment**. Server check: pointer exists AND (`override.readAloud === true` OR `assignment.readAloudAll === true`).                                                                                                                                                                            |
| Q15 | Teacher preview | **Yes**: a "Preview voice" button beside the language field in the quiz editor speaks the first question prompt (else a fixed localized sample) in the mapped voice, billed to the teacher under `tts` (D10).                                                                                                                     |
| Q16 | Next step       | Plan doc only; product owner reviews before any code.                                                                                                                                                                                                                                                                             |

### 2.1 Design decisions (locked 2026-09-08, UI grill)

| #   | Decision            | Choice                                                                                                                                                                                                                                                             |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Highlight           | **Part-level.** The prompt, choice or item whose audio is playing gets a soft brand-blue tint + outline. No word-level sync.                                                                                                                                       |
| D2  | MC rows             | **Sibling speaker.** Each choice row is a flex pair: existing choice button grows, a 44 px speaker button sits beside it with the same height and radius. Never nested inside the choice button; own `aria-label`.                                                 |
| D3  | Toolbar             | **Compact sticky bar under the progress header**, full width, glass surface. Not rendered at all for ineligible students so layout never shifts.                                                                                                                   |
| D4  | Modes               | **Self-paced (light) only for v1.** Live teacher-paced quizzes (`session.sessionMode !== 'student'`) get no read-aloud; the server rejects them too.                                                                                                               |
| D5  | Autoplay            | **Tap only**, plus an opt-in **Auto-read** switch in the toolbar, off by default, persisted per device in `localStorage`. Once on, each new question's prompt plays after the browser has a prior gesture.                                                         |
| D6  | Speed               | **One cycling pill** 1× → 1.25× → 1.5× → 0.75× → 1×, 44 px, current rate as its label, `aria-live` announces the new rate.                                                                                                                                         |
| D7  | States              | Speaker icon becomes a spinner while a fallback synthesis runs. Failure: icon returns and one inline line under the toolbar, "Couldn't load audio. Tap to try again." TTS outage: one calm line says read-aloud is unavailable right now.                          |
| D8  | Matching / Ordering | **Trailing speaker outside the drag surface**: `[grip] [text] [speaker]`, `pointerdown` stopped before the drag listeners. Always visible, ghost style, same as every other speaker (R6).                                                                          |
| D9  | Read order          | "Read question" = prompt, pause, then choices as "A. …", "B. …" (letters spoken); Matching reads left column then right; Ordering reads items in shown order. Attached stimulus text (PR3) is read first. Highlight walks each part.                               |
| D10 | Preview text        | First question prompt if present, else a fixed localized sample sentence. Same cache key scheme as student playback.                                                                                                                                               |
| D11 | Copy                | Override checkbox label **"Read aloud"**, help line **"Signed-in students only."** Same two strings on the assignment-wide toggle. No tooltips, no parentheticals.                                                                                                 |
| D12 | Stimulus text UI    | **Collapsed disclosure row** under each image/pdf stimulus card: "Read-aloud text" + source badge (PDF text / OCR / Edited / None). Expands to textarea, Extract, Clear. Replacing the stimulus file clears the text and resets the badge to None (R7).            |
| D13 | Admin card          | One row per language (en-US, es-US, de-DE, fr-FR): Neural2 voice select, Standard fallback voice select, Play sample. Below: "Neural2 characters per month" number input showing the default, and this month's usage read-only. Save. Existing admin card styling. |
| D14 | Auto-read control   | Small labeled switch "Auto-read", existing switch styling, right end of the toolbar, `role="switch"` + `aria-checked`.                                                                                                                                             |

### 2.2 Refinements (locked 2026-09-08, review session)

| #   | Topic                 | Decision                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | When to synthesize    | **At assign time, in the background.** `prepareQuizReadAloudV1` runs when a session is created with read-aloud on, or when a student is flagged after assignment. Roughly 100 parts for a 20-question quiz, 8 in flight, about 15 s. Students never wait on synthesis; the assignment card shows "Preparing read-aloud" until the manifest is complete. |
| R2  | Who pays              | **The teacher.** All characters, prepare and fallback alike, count under the teacher uid. Student quota and the per-session ceiling are removed.                                                                                                                                                                                                        |
| R3  | Free-tier guard       | **Track it ourselves.** A monthly counter doc increments only on cache misses (what Google bills). Past `neural2MonthlyCapChars` (default 900k) new misses use the per-language Standard voice until the month rolls over; cache lookups still try the Neural2 path first.                                                                              |
| R4  | Long stimulus text    | **Chunk on the server.** Text is split at paragraph/sentence boundaries under 4,500 bytes, each chunk cached separately, returned as a playlist. The client plays chunks back to back with a chunk-level highlight. Text-layer PDFs extract in full (50k stored characters max); the 4-page cap applies to OCR only.                                    |
| R5  | Stimulus student view | **Text pane under the viewer.** While a passage plays, the stimulus card shows the reviewed text as paragraphs beneath the image/PDF viewer and the highlight walks them. No highlighting inside the PDF viewer in v1.                                                                                                                                  |
| R6  | Button visibility     | **Always visible, ghost style.** 44 px target, mid-slate icon, no border, for choices, matching, ordering and stimuli. The prompt speaker and toolbar keep the bordered style. No hover reveal anywhere: it fails on touch and hides an accommodation.                                                                                                  |
| R7  | Edits                 | **Nothing to reprocess.** Sessions snapshot text at assign; re-assigning an edited quiz re-hashes every part and synthesizes only the changed lines. No warming on editor save. Replacing a stimulus file clears its `readAloudText`.                                                                                                                   |
| R8  | Where files live      | **Firebase Storage, not Drive.** Audio is derived, regenerable, PII-free and shared across teachers by hash, so per-teacher Drive ownership would break the cache and force proxied playback. Lifecycle rule deletes objects after 365 days; regeneration is background and near-free. No Drive tiering.                                                |
| R9  | Delivery path         | Students read files through the Firebase Storage SDK at stable paths listed in the session manifest, rule `allow read: if request.auth != null`, one-year immutable cache header, prefetch of the next question only. No per-play signed URLs.                                                                                                          |
| R10 | SSML                  | SSML with `<mark>` from PR2, not later: D9's `parts` timings depend on it.                                                                                                                                                                                                                                                                              |
| R11 | Text normalization    | Server strips markdown/HTML, speaks fill-in-the-blank underscores as "blank", and normalizes common fractions, exponents and units before synthesis. Per-question "read as" overrides are deferred (§9).                                                                                                                                                |
| R12 | Reading assessments   | Stimulus text stays opt-in per stimulus. Teacher help copy on the disclosure row: "Leave empty on reading assessments."                                                                                                                                                                                                                                 |
| R13 | Copies                | `language` and stimulus `readAloudText`/`readAloudSource` travel through shared, synced and PLC quiz copies and through the OLF/notebook import paths that produce quizzes.                                                                                                                                                                             |
| R14 | Older sessions        | Sessions created before the feature have no manifest; the on-demand fallback serves them.                                                                                                                                                                                                                                                               |
| R15 | Usage logging         | **Deferred.** Per-student play counts for IEP documentation are a follow-up (§9).                                                                                                                                                                                                                                                                       |

## 3. Data model

All additions are optional fields; no migration.

```ts
// types.ts — StudentOverride (types.ts:4663)
readAloud?: boolean; // quiz only; requires SSO + 'quiz-read-aloud' permission

// types.ts — QuizData (types.ts:3426)
/** BCP-47 tag used to pick the read-aloud voice. Absent = 'en-US'. */
language?: string;

// types.ts — QuizStimulus (types.ts:3287)
/** Teacher-reviewed text spoken for image/pdf stimuli. Absent = no speaker button. */
readAloudText?: string;
/** How readAloudText was produced; 'edited' once the teacher touches it. */
readAloudSource?: 'pdf-text' | 'ocr' | 'edited';

// types.ts — QuizSessionOptions (PR1 placed it here, beside tabWarningThreshold, so it rides
// every existing behavior → assignment → session path instead of a new top-level field)
/** Read-aloud for every SSO student on this assignment, not only overrides. */
readAloudAll?: boolean;

// types.ts — QuizSession (types.ts:3626), snapshotted at create time (freeze-live)
readAloudAll?: boolean;
language?: string;
/** Per-stimulus reviewed text, keyed by stimulus id; the only stimulus text the synth function may speak. */
readAloudTextByStimulusId?: Record<string, string>;
/** Written by prepareQuizReadAloudV1 (R1). Absent on pre-feature sessions (R14). */
readAloud?: {
  status: 'preparing' | 'ready' | 'partial' | 'failed';
  voice: string;
  preparedAt?: Timestamp;
  /** partKey ('q:{questionId}:choice:1', 'q:{id}:whole', 'stim:{id}:3', …) -> Storage object path. */
  files: Record<string, string>;
  /** partKey -> SSML mark timings for 'whole' parts (D9). */
  timings?: Record<string, { kind: string; index?: number; startMs: number }[]>;
  /** stimulusId -> ordered chunk partKeys (R4). */
  stimulusChunks?: Record<string, string[]>;
};

// types.ts — GlobalFeature union
| 'quiz-read-aloud'
```

Notes:

- `readAloudText` is authoring content; it must **not** travel through
  `APPEARANCE_CONFIG_KEYS` (it is quiz data, not widget config, so this is moot, but
  stated for the record).
- `QuizPublicQuestion` is unchanged: its `text`, `choices`, `matchingLeft/Right`,
  `orderingItems` are already the exact strings a student sees, so they are the exact
  strings to speak.
- `setAssignmentTargetsV1` needs no contract change: `readAloud` rides inside the
  existing `override` object and inherits the field-level merge protection.
- Roster standing defaults (`defaultOverridesByStudentId`) pick up `readAloud`
  for free, so a student flagged once on the roster is flagged on every future
  assignment to that roster.

### Admin voice configuration

`admin_settings/quiz_read_aloud`:

```ts
{
  voicesByLanguage: Record<string, string>; // 'en-US' -> 'en-US-Neural2-F', 'es-US' -> 'es-US-Neural2-A', ...
  defaultLanguage: 'en-US';
  standardVoicesByLanguage: Record<string, string>; // R3 fallback: 'en-US' -> 'en-US-Standard-H', ...
  neural2MonthlyCapChars: 900_000; // R3; free tier is 1M
  speakingRateDefault: 1.0;
}
```

Monthly counter `ai_usage/global_tts_{YYYY-MM}` (R3):

```ts
{
  neural2Chars: number;
  standardChars: number;
  cacheHits: number;
  updatedAt: Timestamp;
}
```

Incremented in the same transaction as the teacher's daily `ai_usage` row, on cache
misses only. Read by the admin card and by the synth path to pick the voice tier.

Seeded on first read with en-US / es-US / de-DE / fr-FR Neural2 voices (the app's
four UI locales). Editable from a small card in Admin Settings (PR1).

## 4. Cloud Functions

### 4.0 `prepareQuizReadAloudV1` (onCall, `functions/src/quizReadAloud.ts`) — PR2

Teacher-only. Input `{ sessionId }`. Called by the assign path right after the
session doc is written when `readAloudAll` is true or any target carries
`override.readAloud`, and again by `setAssignmentTargetsV1` when a target gains the
override later (R1). Steps:

1. Verify caller owns the session and holds `quiz-read-aloud`.
2. Set `session.readAloud = { status: 'preparing', voice, files: {} }`.
3. Enumerate parts from `publicQuestions` and `readAloudTextByStimulusId`: per
   question `question`, each `choice` / `matchingLeft` / `matchingRight` /
   `orderingItem`, and `whole`; per stimulus the R4 chunks.
4. For each part, apply the shared `synthesizePart(text, language)` helper (§4.1
   steps 6–10) with 8 in flight. Hits cost nothing; misses bill the teacher.
5. Write `files`, `timings`, `stimulusChunks` and `status: 'ready'`
   (`'partial'` if any part failed after two retries, listing the failed keys so the
   student fallback can fill them). Return `{ status, parts, synthesized, chars }`.

A 20-question quiz is about 100 parts and finishes in roughly 15 s. Idempotent:
re-running after an edit re-hashes everything and synthesizes only changed lines (R7).

PR2 implementation notes:

- `whole` speaks the choices **unlettered** (prompt, pause, choice, pause, …). Answer
  order is shuffled per student, so canonical "A. / B." letters would contradict the
  rows on screen; the timing-driven row highlight carries the order instead.
- A `preparing` manifest younger than 3 minutes short-circuits a second prepare
  (`startedAt`), so the assign-path client call and the `setAssignmentTargetsV1`
  re-trigger cannot double-synthesize. The targets re-trigger runs with a 40 s deadline
  inside that callable (timeout raised to 120 s); parts past the deadline land in
  `failedKeys` with `status: 'partial'` and the student fallback fills them.
- The manifest also carries `failedKeys` and, while running, `startedAt`.
- Sync pickup (`syncAssignmentToLatest`) re-prepares in the background when the
  assignment has `readAloudAll` or any `readAloud` override.
- Timings for `whole` are persisted as object metadata on the MP3, so a cache hit
  returns them without re-synthesis.

### 4.1 `synthesizeQuizAudioV1` (onCall, `functions/src/quizReadAloud.ts`)

Request:

```ts
type QuizReadAloudPart =
  | { kind: 'question' }
  | { kind: 'choice'; index: number }
  | { kind: 'matchingLeft' | 'matchingRight' | 'orderingItem'; index: number }
  | { kind: 'stimulus'; stimulusId: string }
  | { kind: 'whole' }; // D9: prompt, pause, then "A. …" choices / left then right / items in order

type SynthesizeQuizAudioRequest =
  | {
      mode: 'student';
      sessionId: string;
      questionId: string;
      part: QuizReadAloudPart;
    }
  | { mode: 'preview'; language: string; quizId?: string }; // D10: first prompt of the teacher's quiz, else fixed sample
```

Response: `{ path: string; mimeType: 'audio/mpeg'; chars: number; cached: boolean; parts?: { kind: string; index?: number; startMs: number }[]; chunks?: string[] }`
(`parts` only for `whole`, from SSML `<mark>` timepoints, per D9; `chunks` only for
`stimulus`, the ordered Storage paths per R4). `path` is a Storage object path the
client opens through the SDK (R9); no signed URLs.

This is the **fallback** path (R1): the student player calls it only for a part
missing from `session.readAloud.files`, which happens during the assign-then-start
race, for `partial` manifests, and for pre-feature sessions (R14). A successful
fallback also patches the manifest so the next student hits it.

Server steps, student mode:

1. `request.auth` required; `request.auth.token.studentRole === true` else `permission-denied`.
2. Load `/student_assignments/{uid}/items/{sessionId}`; missing → `permission-denied`.
3. Load `/quiz_sessions/{sessionId}`; require `session.status` open for taking; require
   `pointer.override?.readAloud === true || session.readAloudAll === true`.
   (`readAloudAll` lives on `sessionOptions`; PR1 snapshots it onto the session.)
4. Resolve the global permission `quiz-read-aloud` for the **teacher** uid
   (`session.teacherUid`), mirroring how `generateWithAI` gates on
   `global_permissions/{featureId}` (`aiGeneration.ts:535-537`). Off → `permission-denied`.
   Rationale: the feature flag is a district rollout switch; students have no
   permission rows of their own.
5. Resolve text from the session doc only: `publicQuestions.find(q => q.id === questionId)`
   and the requested part; stimulus parts read `session.readAloudTextByStimulusId[stimulusId]`
   and additionally require the question's `stimulusIds` to include that id. Any miss →
   `invalid-argument`. Text is trimmed; question parts are capped at 5,000 characters (Cloud TTS request limit) and stimulus text is chunked under it (R4).
6. Normalize (R11): strip markdown/HTML, replace runs of underscores with "blank",
   expand common fractions, exponents and units. Build SSML (R10): `<mark>` before each
   sub-part of `whole`, `<break time="600ms"/>` between them. Stimulus text is split
   into R4 chunks; each chunk is its own part from here on.
7. Voice: `voicesByLanguage[language]` unless the monthly counter is past
   `neural2MonthlyCapChars`, then `standardVoicesByLanguage[language]` (R3). Cache key
   = `sha256(voice + ' ' + ssml)`; look up the Neural2 path first, then Standard, so
   already-cached audio keeps the better voice.
8. Object path `quiz_tts_cache/{voice}/{hash}.mp3`. Exists → `cached: true`, no quota
   write.
9. Else one transaction: teacher daily row `ai_usage/{teacherUid}_tts_{YYYY-MM-DD}`
   (same shape as `aiGeneration.ts:466-479`) plus `ai_usage/global_tts_{YYYY-MM}`
   (R2, R3). Teacher uid is `session.teacherUid` for student-mode calls. No
   `resource-exhausted` path for students; only the admin monthly cap changes tier.
10. Call Cloud TTS `text:synthesize` via `@google-cloud/text-to-speech` with ADC
    (add the Text-to-Speech API and grant the functions service account
    `roles/cloudtts.user`, §8). `audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 }`,
    `enableTimePointing: ['SSML_MARK']`. Speed is client-side via
    `HTMLMediaElement.playbackRate` so one file serves every rate.
11. Write the MP3 with `contentType: audio/mpeg`,
    `cacheControl: public, max-age=31536000, immutable` and metadata
    `{ chars, voice, createdAt }`. Return `path`, `cached: false`, `parts` from the
    timepoints.

Preview mode: teacher auth (`!studentRole`), permission `quiz-read-aloud` for the
caller, fixed sentence per language from `locales/en.json` `quizReadAloud.previewSentence`,
same cache path, quota under the teacher's uid.

Error mapping on the client: `permission-denied` hides the controls (should not
happen because the client gates first); `unavailable` (TTS outage) shows the D7
retry line.

### 4.2 `extractStimulusReadAloudTextV1` (onCall, same file) — PR3

Teacher-only. Input `{ stimulusId, driveFileId | url, type: 'image' | 'pdf' }`.
PDF: download via the teacher's Drive token (reuse `getAccessToken` / `downloadDriveFile`
deps from `functions/src/getQuizArtifactPlaybackUrl.ts`), extract the text layer with
`pdf-parse` for the whole document, capped at 50,000 stored characters (R4); if fewer
than 40 characters per page come back, fall back to OCR.
OCR: reuse the `ocr` branch of `generateWithAI` (Gemini multimodal with
`inlineData`, `aiGeneration.ts:921-936`) page by page (PDF pages rasterised server-side
are out of scope; for PDFs without a text layer v1 sends the first 4 pages as images
via `pdfjs-dist` canvas rendering, or returns `needs-manual` if that exceeds 60 s).
Returns `{ text, source: 'pdf-text' | 'ocr' | 'needs-manual' }`. Quota under the
teacher's `ocr` feature key, unchanged.

PR3 implementation notes (`functions/src/quizStimulusText.ts`):

- Text layer via `pdf-parse` 2.x (`PDFParse.getText`), 40 chars/page threshold.
- OCR sends the document to Gemini **natively** (`inlineData` with
  `application/pdf` or the sniffed image type) instead of rasterising pages with
  pdfjs; `pdf-lib` slices a scanned PDF to its first 4 pages first so the 4-page cap
  still bounds cost. Same admin model override as `generateWithAI`
  (`__getGeminiModelConfig`).
- The 60 s budget covers download + OCR; past it the callable returns
  `needs-manual` rather than failing.
- Sources: a Drive file id is fetched with the teacher's token; a pasted url is
  fetched server-side, https only, private/loopback hosts rejected; 25 MB cap.
- OCR is charged through a mirror of `generateWithAI`'s per-feature counter
  (`ai_usage/{uid}_ocr_{day}` + the overall daily doc, `global_permissions/ocr`
  limit, admins uncapped); the text-layer path is free.
- The client mirrors `chunkText` (`chunkReadAloudText`) so the R5 pane can
  highlight the chunk being spoken; `readQuestion()` sequences the attached passages
  before `whole` on the client, since `whole` never includes stimulus text.
- There is no stimulus file-replacement flow in the manager (stimuli are added and
  deleted); a re-added file is a new stimulus with no text, which satisfies R7.

## 5. Storage

```
// storage.rules — new block above the default deny
match /quiz_tts_cache/{voice}/{fileName} {
  // Any signed-in principal may read (SSO students hold custom-token auth); only functions write.
  allow read: if request.auth != null;
  allow write: if false;
}
```

Students open manifest paths through the Firebase Storage SDK (R9), so the URL is
stable per object and the one-year immutable header lets each browser fetch a part
once. Object names are content hashes: the same question text in two quizzes shares
one file and is billed once district-wide (R8). A lifecycle rule (`storage.lifecycle.json`,
applied with `gsutil lifecycle set`, §8) deletes objects older than 365 days; a re-assigned old quiz simply re-prepares in the background.
Drive is deliberately not used: audio is derived, PII-free and shared across
teachers, and Drive playback would have to go through the base64 proxy pattern in
`getQuizArtifactPlaybackUrl.ts`.

Sizes (Cloud TTS MP3 is 32 kbps): a 20-question quiz with `whole` joins is about
1.5 MB; 1,000 quizzes about 1.5 GB, inside the 5 GB free tier. Egress is the moving
cost: about 45 MB per class period, roughly twenty periods a day inside the free
1 GB, US$0.12/GB after.

## 6. Client

### 6.1 Teacher surfaces (PR1 unless noted)

- **Override editor** `components/common/library/OverrideEditorRow.tsx`: a
  "Read aloud" checkbox after "Extended time" (`:255`) with the help line
  "Signed-in students only." (D11). Rendered only when
  `canAccessFeature('quiz-read-aloud')`; the "No accommodations" summary at `:208`
  must include it. Standing defaults in the roster editor pick it up through the
  same component.
- **Assignment settings** `components/common/library/QuizBehaviorSettingsPanel.tsx`:
  toggle "Read aloud" with the same help line, under the accommodation-ish area near
  the tab-switch toggle (`:112`), gated the same way. Snapshotted onto the session at
  create time by the existing assign path (`hooks/useQuizAssignments.ts`).
- **Quiz editor** `components/widgets/QuizWidget/components/QuizEditorModal.tsx`
  (`:372` region): a "Language" select (en-US, es-US, de-DE, fr-FR, plus "Other…"
  free BCP-47 input) and the "Preview voice" button (Q15, D10) that speaks the first
  question prompt, else a fixed sample. Gated.
- **Stimulus manager** (PR3) `components/widgets/QuizWidget/components/StimulusManagerPanel.tsx`
  (`:370` area): for `image` and `pdf` stimuli, a collapsed "Read-aloud text"
  disclosure row (D12) carrying a source badge (PDF text / OCR / Edited / None). Open
  it for the textarea, "Extract text" (calls `extractStimulusReadAloudTextV1`) and
  "Clear". Help line "Leave empty on reading assessments." (R12). Empty text = no
  speaker button for students. Replacing the file clears the text (R7). Gated.
- **Assignment card / results header** (PR2): a "Preparing read-aloud" status while
  `session.readAloud.status === 'preparing'`, then nothing (R1). `partial` shows
  "Some audio will load on demand."
- **Copy paths** (PR1/PR3): the share, sync, PLC and import code paths that clone a
  quiz carry `language`, `readAloudText` and `readAloudSource` (R13).
- **Admin** (PR1): card in Admin Settings → "Quiz read-aloud" editing
  `admin_settings/quiz_read_aloud` (D13): one row per language with a Neural2 voice
  select and Play sample, then a "Characters per session" number input, then Save.
- **Permission registry** (PR1): add `'quiz-read-aloud'` to `GlobalFeature`,
  `config/featureDefaults.ts` (default `admin`, enabled), and the admin
  `GlobalPermissionsManager` label/description strings in `locales/*.json`.

### 6.2 Student player (PR2)

Applies to the self-paced (light) `ActiveQuiz` shell only (D4). The player pulls
its classes from the same light token block as the MC rows
(`QuizStudentApp.tsx:2645`); live dark mode is untouched in v1.

- New `components/quiz/readAloud/` folder:
  - `useQuizReadAloud.ts`: owns one `HTMLAudioElement`, reads
    `session.readAloud.files` for paths and opens them via the Storage SDK (R9),
    prefetches the current question's parts on mount and the next question's while
    the current one is on screen, falls back to `synthesizeQuizAudioV1` for a
    missing key (R1/R14), plays stimulus chunk playlists back to back (R4), and
    keeps two `localStorage` keys:
    `quiz_read_aloud_rate` and `quiz_read_aloud_auto`. Exposes
    `{ playingPart, loadingPart, error, play(part), stop(), rate, cycleRate(), auto, setAuto() }`.
    Stops audio on question change and on unmount; when `auto` is on and the page
    has a prior gesture, plays `{kind:'question'}` on question change.
  - `ReadAloudButton.tsx`: icon-only 44×44 button, always visible (R6). Idle
    `Volume2`, playing `Square`, loading `Loader2` spinning (`motion-reduce` keeps a
    static icon). `aria-label` "Read question aloud" / "Read choice B aloud" /
    "Read item 3 aloud" / "Stop", `aria-pressed` while playing. Two variants:
    `prominent` (prompt, toolbar):
    `rounded-2xl border-2 border-slate-200 bg-white text-slate-600 hover:border-slate-300`;
    `ghost` (choices, matching, ordering, stimulus):
    `rounded-2xl text-slate-500 hover:bg-slate-100`. Playing, both:
    `border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary`.
  - `ReadAloudToolbar.tsx` (D3): sticky bar directly under the progress header,
    `bg-white/85 backdrop-blur border-b border-slate-200`, contents left→right:
    "Read question" button with `Volume2`, the speed pill (D6), then the Auto-read
    switch (D14) at the right end. Beneath it, only when needed, one line for the
    error or quota message (D7).
  - `readAloudHighlight.ts`: `highlightClass(part, playingPart)` returning
    `ring-2 ring-brand-blue-primary/60 bg-brand-blue-lighter/60` for the part being
    read (D1). MC rows, prompt block, matching/ordering items and the stimulus header
    apply it.
- Eligibility on the client:
  `readAloudEnabled = isSsoStudent && isStudentPaced && (myOverride?.readAloud || session.readAloudAll)`
  where `isSsoStudent` is derived from the current user's `studentRole` claim
  (already resolved for the `ssoGate` path at `QuizStudentApp.tsx:352`) and
  `isStudentPaced` is `session.sessionMode === 'student'` (`:1593`). The permission
  flag is not readable by students; the server is the authority, and the session doc
  gains `readAloudAll` only when the teacher's flag was on at assign time. For
  override-only students the server check in §4.1 step 4 is the guard; the client
  handles a `permission-denied` by hiding the controls for the rest of the session.
  When not eligible nothing read-aloud-related mounts, so layout is identical to
  today.
- Placement per question type:
  - Prompt: speaker at the trailing end of the prompt block for every type.
  - MC (D2): each row becomes `flex items-stretch gap-2`; the existing choice
    `<button>` gets `flex-1`, the speaker sits beside it, never inside it.
  - FIB / free-response: prompt speaker only; blanks are spoken as "blank" (R11).
  - Matching / Ordering (D8): `[grip] [text] [speaker]` in
    `MatchingResponseInput.tsx` and `OrderingResponseInput.tsx`; the speaker calls
    `stopPropagation` on `pointerdown` so it never starts a drag. Ghost variant,
    always visible (R6).
  - Stimuli (PR3): speaker in the `QuizStimulusView.tsx` header for image/pdf
    stimuli that have reviewed text. While playing, a text pane opens under the
    viewer showing the reviewed text as paragraphs; the highlight walks the chunk
    being read (R5).
- "Read question" (D9): plays `{kind:'whole'}`; the server joins prompt, a 600 ms
  SSML break, then "A. …", "B. …" for MC, left column then right for Matching,
  items in shown order for Ordering, with attached stimulus text first. The response
  `parts` timings drive the row-by-row highlight.
- Audio etiquette: starting any read-aloud stops the previous one; the quiz's own
  sound effects (`soundEffectsEnabled`) are unaffected; timers keep running (extended
  time is the separate accommodation).
- Accessibility: every control is keyboard reachable in DOM order, visible
  `focus-visible:ring-2` ring, 44 px minimum targets, AA contrast on the light
  surface, `aria-live="polite"` region announcing rate changes and errors.
- i18n: all labels in `locales/en.json` under `quizReadAloud.*`; the other three
  locales get the English strings copied per repo convention for new keys.

## 7. Delivery — three stacked PRs to `dev-paul`

| PR                                  | Branch                         | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Verifies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR1 data + gating**               | `feat/quiz-read-aloud-model`   | `GlobalFeature` id + `featureDefaults`; `StudentOverride.readAloud`; `QuizData.language`; `QuizSessionOptions.readAloudAll` + session snapshot; `admin_settings/quiz_read_aloud` type + admin card; override checkbox; behavior-panel toggle; editor language select (preview button omitted until PR2, §10); locale strings.                                                                                                                                                                                                         | Unit: types, `OverrideEditorRow` renders/gates the checkbox, `toPublicQuestion` unchanged, assign path snapshots `readAloudAll`/`language`. Rules tests: pointer doc with `override.readAloud` still student-readable, still not writable.                                                                                                                                                                                                                                                                                        |
| **PR2 engine + player**             | `feat/quiz-read-aloud-engine`  | `prepareQuizReadAloudV1` wired into the assign path and `setAssignmentTargetsV1`; `synthesizeQuizAudioV1` fallback (student + preview) with SSML marks, normalization and Standard-voice fallback; monthly counter; session manifest type; Storage path + rules + lifecycle; `@google-cloud/text-to-speech` dep in `functions/`; student player components (toolbar, button variants, highlight helper); `ActiveQuiz` light-mode integration; "Preparing read-aloud" status; teacher preview button; admin analytics label for `tts`. | Function unit tests with mocked TTS client and Storage (deny anonymous, deny no-pointer, deny flag-off, cache hit skips quota, teacher uid billed, monthly cap flips voice tier, prepare writes a complete manifest and re-run synthesizes only changed parts, normalization cases, text only from session doc, stimulus id must be attached to the question). Student app unit tests for eligibility and button placement per question type. E2E: SSO fixture quiz with override → speaker buttons present; PIN joiner → absent. |
| **PR3 stimuli** (opened 2026-09-09) | `feat/quiz-read-aloud-stimuli` | `QuizStimulus.readAloudText/readAloudSource`; `extractStimulusReadAloudTextV1` (full text layer, 50k cap); server chunking; stimulus manager UI with file-replacement clearing; `readAloudTextByStimulusId` snapshot on the session; stimulus speaker button and text pane; copy paths carry the fields.                                                                                                                                                                                                                              | Function tests (pdf-text vs ocr fallback vs needs-manual); editor tests (extract, edit flips source to `edited`, clear removes); student test (button only when text exists and stimulus attached).                                                                                                                                                                                                                                                                                                                               |

Each PR is independently shippable behind the `quiz-read-aloud` flag at `admin`.
Rollout: admin → beta (the teachers with read-aloud students) → public.

## 8. Deployment and operations

- **Enable the Cloud Text-to-Speech API** on the Firebase project (done 2026-09-08 via
  `gcloud services enable texttospeech.googleapis.com`). There is no `roles/cloudtts.user`
  role; Cloud TTS only requires `serviceusage.services.use`, which the runtime account
  (`759666600376-compute@…`) already holds through `roles/editor`. Per
  `dev-branch-deploys-functions-to-prod`, a push to `dev-paul` deploys functions to
  the shared prod project: the new function is additive and flag-gated, so this is
  safe, but the API must be enabled **before** PR2 merges or the callable returns
  `unavailable`.
- **Cost**: Neural2 is US$16 per 1M characters after 1M free per month; Standard is
  US$4 after 4M free. A 20-question MC quiz is roughly 3,000 characters, so the
  Neural2 free tier covers about 330 quiz preparations a month before the R3 counter
  flips new synthesis to Standard. With caching, a class of 30 reading the same quiz
  costs one preparation. Budget alert at US$20/month on the TTS SKU as a backstop.
- **Privacy**: cached objects contain only quiz text, never student identity; object
  names are hashes; no PII enters `ai_usage` beyond the uid already used by other AI
  features. Consistent with the student PII posture in `studentAssignmentTargets.ts`.
- **Lifecycle rule** (one-off, not deployed by the Firebase CLI; applied 2026-09-08):
  `gcloud storage buckets update gs://spartboard.firebasestorage.app --lifecycle-file=storage.lifecycle.json`.
  The rule is scoped to the `quiz_tts_cache/` prefix.
- **Cache purge**: safe at any time; lifecycle rule deletes at 365 days (R8).

## 9. Out of scope (v1)

- Word/sentence highlighting synchronized to audio (part- and chunk-level only in v1;
  SSML marks already land in PR2 per R10, so finer marks are an additive change).
- Per-student read-aloud usage logging for IEP documentation (R15).
- Per-question "read as" pronunciation overrides (R11 normalizes common cases only).
- Moving cached audio to Drive when a quiz closes (R8: delete and regenerate instead).
- Highlighting inside the PDF viewer (R5 uses a text pane).
- Auto-read without the opt-in switch (D5).
- Read-aloud in live teacher-paced (dark) quizzes (D4).
- OCR beyond 4 pages for scanned PDFs (text-layer PDFs extract in full per R4;
  longer scans get `needs-manual` and the teacher pastes text).
- Browser `speechSynthesis` fallback when offline.
- Read-aloud for video-activity, guided-learning, or mini-app assignments (the
  override field is quiz-only, matching the other quiz-only override fields).
- Retiring the Apps Script portal.

## 10. Resolved questions (2026-09-08)

1. **Roster-level `readAloudAll`: no, assignment-level only for v1.** Per-student
   overrides already persist on the roster and cover the IEP case; a section-wide
   default that pre-checks the assign dialog is a one-field follow-up if requested.
   A forcing flag is rejected because R12 needs per-assignment opt-out on reading
   assessments.
2. **Preview voice button: omit until PR2.** PR1 ships the language select alone; no
   disabled placeholder control.
3. **Neural2 monthly cap: 900k characters.** Leaves a 10% margin for preview and
   admin samples, guaranteeing a zero bill; adjustable in the admin card after a
   month of counter data.
