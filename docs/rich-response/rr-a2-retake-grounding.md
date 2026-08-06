# RR-A2 Grounding Brief — what "a retake" can mean in shipped SpartBoard code

> **Provenance:** read-only audit, 2026-08-06, against the working tree on branch
> `dev-paul` at commit `0e2cc93`. No file outside `docs/rich-response/` was touched.
>
> **Verification status:** every claim marked ✅ was read directly out of the source
> file in this session, not inferred from a neighbouring comment or from
> `rr-08-answered-state-grounding.md`. Claims marked ⚠️ **INFERRED** are reasoning
> on top of verified reads, or are grep-scoped negatives (I searched and found
> nothing; a negative from grep is weaker than a positive from a read). Treat
> ⚠️ items as leads to confirm during the session.
>
> **This is grounding, not a resolution.** RR-A2 is a HITL grilling ticket. Nothing
> here decides it, and nothing here was resolved or edited on the map.

---

## 0. The one-sentence summary

SpartBoard has **no concept of an attempt to a question** — only an attempt to an
_assignment_. The per-question write path is a destructive replace with no counter
and no reader-visible history, the one attempt counter that exists
(`completedAttempts`) is a **budget meter that teachers decrement**, not a ledger,
and there is **no Drive-file deletion anywhere in `functions/`**. So all three
things RR-A2 needs — count takes, show takes, delete a superseded take — are new
capabilities, not extensions.

The sharpest finding for the ticket's **new first question** (discards vs. retakes):
because RR-A1 sub-decision 7 means a discarded take never reaches the server,
**counting discards requires inventing a write whose only purpose is to record that
a child refused to be recorded.** See §5.

---

## 1. Every path that overwrites or replaces a prior answer for the same `questionId`

There are exactly **five** writers of `QuizResponse.answers` outside tests and dev
mocks. Grep: `answers:` across `hooks/`, `functions/src/`, `components/`, `utils/`.
⚠️ **INFERRED (grep-scoped):** that this is the complete set. It is a whole-repo
grep on the field name, so a writer using a computed key or a dotted field path
would be missed.

| #   | Site                                                       | Shape                                                                     | Preserves prior?                                                   |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | `hooks/useQuizSession.ts:2359-2362` ✅                     | `[...existing.filter(a => a.questionId !== questionId), newAnswer]`       | **No — destructive replace**                                       |
| 2   | `hooks/useQuizSession.ts:1969-1979` ✅                     | `answers: []` on rejoin-for-a-new-attempt                                 | **No — whole array discarded**                                     |
| 3   | `hooks/useQuizSession.ts:2120` ✅                          | `answers: []` at first response-doc create                                | n/a (nothing prior)                                                |
| 4   | `hooks/useQuizAssignments.ts:2010-2037,2063` ✅            | `answers.map(a => ({...a, isCorrect}))` on teacher publish                | **Yes — spread**, except a deliberate `isCorrect` strip at `:2017` |
| 5   | `functions/src/finalizeIdleQuizAttempts.ts:433-440,460` ✅ | `answers.map(a => a.status === 'draft' ? {...a, status:'submitted'} : a)` | **Yes — spread**                                                   |

### 1.1 The replace at `useQuizSession.ts:2359-2362` is the whole story

✅ Verified by direct read. `submitAnswer` builds `newAnswer` as a **fresh object
literal** (`:2349-2357`) containing only `questionId`, `answer`, `answeredAt`,
`status` and an optional `speedBonus`. There is no `...priorEntry` spread even
though `priorEntry` is in scope (bound at `:2271-2273`, used at `:2277` and
`:2299`). The rebuilt object then replaces the array element and the whole array is
written at `:2394`.

For RR-A2 that means: **any field you add to carry take metadata — a take index, a
recorded-at, a Drive file id, a "this is take 3" marker — is erased by the next
write to that question** unless this line changes. This is the same landmine RR-08
recorded as #1 for `artifacts[]`; RR-A2 inherits it verbatim, because a retake _is_
a second write to the same `questionId`.

### 1.2 Every trigger that reaches that replace

All of these funnel into the same `submitAnswer`:

- Explicit submit — `components/quiz/QuizStudentApp.tsx:1913` ✅ (teacher-paced), `:2040` ✅ (self-paced NEXT).
- **Self-paced revisit** — `QuizStudentApp.tsx:2015-2017` ✅: `if (submitted && !isStudentPaced) return;`, with the comment _"Self-paced revisits are intentional re-submissions — let them through even when `submitted=true`."_ **In self-paced mode a student may re-answer the same question an unlimited number of times, and nothing counts it.**
- Draft autosave — `QuizStudentApp.tsx:1660-1683` ✅, 500 ms debounce, `{ isDraft: true }`.
- Timer expiry auto-submit — `QuizStudentApp.tsx:1538-1574` (cited from RR-08's brief; ⚠️ **INFERRED** — I did not re-read this range this session).
- Visibility/unload flush — `QuizStudentApp.tsx:1769-1774` ✅.

### 1.3 What preserves history today: exactly one mechanism, and it has no reader

✅ The `history` subcollection (`/quiz_sessions/{s}/responses/{r}/history/{id}`),
declared at `hooks/useQuizSession.ts:73-83`, written at `:2299-2338`, gated by
`shouldSnapshotHistory` at `:170-187`. It snapshots the **prior** entry just before
the replace. Doc comment at `:74-82` states the intent plainly: recover text lost
"to a race, a stray empty draft, or a student who retyped over their own work."

Five properties that matter to RR-A2, all ✅ verified:

1. **It is write-only.** Grep for `RESPONSE_HISTORY_COLLECTION` and `'history'` across `components/`, `hooks/`, `utils/` returns three hits total: the constant (`:83`), the delete sweep (`:1022`), and the write (`:2316`). **No UI reads it.** ⚠️ **INFERRED (grep-scoped)** that no admin/console surface reads it either.
2. **Its shape is pinned by rules to five keys** — `firestore.rules:3092-3099`: `hasOnly(['questionId','answer','answeredAt','status','snapshotAt'])`. A recording reference, a take index, or a discard marker **cannot be written here without a rules change.**
3. **It skips empty priors** — `useQuizSession.ts:179`: `if (priorEntry.answer === '') return false;`. Under RR-02's `answer: '' + artifacts[]` model, a media-only take gets **no** snapshot. (This is RR-08's landmine #3; re-verified here.)
4. **It is throttled to one snapshot per 5 s per question** — `HISTORY_SNAPSHOT_THROTTLE_MS = 5000` at `:91`, consumed eagerly at `:2308`. Two takes recorded inside five seconds produce one snapshot.
5. **It is not written on the attempt-reset path.** Writer #2 above (`:1969-1979`) clears `answers` wholesale with no snapshot and no archive. History docs from the prior attempt survive in the subcollection but, per (1), nobody can see them.

### 1.4 The one path that _does_ archive, and why it doesn't help

✅ `removeStudent` (`useQuizSession.ts:967-1046` and the `archived_responses`
collection declared at `:62-72`) copies the response doc to
`/archived_responses/` before deleting the live doc — and **deletes the history
subcollection in the same operation** (`:1039-1046`), scoped to the removed
student's occupancy window on shared PIN keys. Comment at `:973-975`: _"The
teacher's archive preserves the final answers; the intermediate-draft history is
intentionally discarded on removal."_

So the only durable archive SpartBoard writes is triggered by a **teacher removing
a student**, captures only the **final** state, and is explicitly not an attempt
log.

### 1.5 Contrast: the Video Activity model is the opposite one

✅ `hooks/useVideoActivitySession.ts:1030-1041` — `submitAnswer` runs a transaction
that **refuses** a second answer for the same `questionId` (`:1034`:
`if (data.answers.some(a => a.questionId === questionId)) return;`) and appends via
`arrayUnion` rather than replacing. ✅ `firestore.rules:3473-3479` backs this with a
genuine append-only guard: `answers.size() >= resource.data.answers.size() &&
answers.hasAll(resource.data.answers)`, with one carve-out for the rejoin-reset to
`[]`.

**Quiz overwrites and never appends; VA appends and never overwrites.** RR-A2's
"what does a retake mean" question has two shipped precedents pointing opposite
directions, in the same codebase, on near-identical schemas.

### 1.6 🔴 If a retake becomes a second `answers[]` entry, the _earliest_ take wins

✅ Four independent consumers already dedupe duplicate `questionId` entries, and all
of them take the **first chronologically**:

- `components/widgets/QuizWidget/utils/quizScoreboard.ts:55-71` — sorts by `answeredAt` ascending, then `seenQuestionIds` skips repeats. Comment at `:61`: _"credit only the first (chronologically earliest) answer per question."_
- `components/widgets/VideoActivityWidget/components/questionAccuracyStats.ts:1-35` — header comment states the FIRST-answer rule is authoritative and display stats must match it; `:31` uses `.find()`.
- `hooks/useQuizAssignments.ts:2000-2035` — `scoredQuestionIds` set, first occurrence only.
- `hooks/useVideoActivityAssignments.ts:997,1028` (⚠️ **INFERRED** — grep hit + comment text, not read in full).

These were written to defend against `arrayUnion` races and Drive-sync
double-writes. **They are load-bearing against a design RR-A2 might choose**: store
takes as sibling entries and the scoreboard grades take 1 while the teacher's
results screen shows take 3.

---

## 2. `QuizResponseAnswer`'s draft/submitted lifecycle, and where re-submission is allowed or blocked

### 2.1 The type

✅ `types.ts:3467-3488`. Fields: `questionId`, `answer: string`, `answeredAt: number`,
`isCorrect?`, `speedBonus?`, `status?: 'draft' | 'submitted'`.

**There is no attempt/take field of any kind.** `answeredAt` is the only temporal
marker and it is overwritten on every write (`useQuizSession.ts:2352` ✅
`answeredAt: Date.now()`), so it records the _last_ write, not the first.

`status` is two-valued and its doc comment (`types.ts:3479-3486`) scopes drafts to
**written-response only**: _"Missing on legacy docs written before drafts existed
and on MC/FIB/Matching/Ordering answers (those have no autosave path)."_
`isAnswerSubmitted(a)` (`types.ts:3495-3497` ✅) is `a.status !== 'draft'`.

⚠️ **INFERRED, and worth naming in the session:** a recording has no draft analogue.
Under RR-A1 sub-decision 7 nothing exists server-side until commit, so a recording
question's answer can only ever be born `'submitted'`. The draft state — the one
piece of "in progress" vocabulary the schema has — is structurally unavailable to
the mode RR-A2 governs.

### 2.2 The three guards on the write path

All ✅ read at `hooks/useQuizSession.ts`:

| Guard                     | Definition | Applied      | Effect                                                                                                                              |
| ------------------------- | ---------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `isUnsafeBlankDraft`      | `:131-137` | `:2277`      | Refuses a **draft** write of `''` over a non-empty prior. Explicit submits bypass.                                                  |
| `shouldSnapshotHistory`   | `:170-187` | `:2290-2298` | Decides the history snapshot. Runs **before** the downgrade guard deliberately (`:2281-2287`) so refused writes are still recorded. |
| `isUnsafeStatusDowngrade` | `:150-159` | `:2345`      | Refuses a **draft** write over an already-`submitted` entry. Explicit submits bypass.                                               |

**Every one of these three is `isDraft`-gated.** An explicit re-submit — which is
what a retake is — passes all three untouched. ✅ There is no guard anywhere on the
write path that limits how many times the same `questionId` may be explicitly
submitted.

### 2.3 Where re-submission is allowed vs. blocked — and it's a UI-only distinction

| Mode                         | Site                                                                    | Behaviour                         |
| ---------------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| Teacher-paced                | `QuizStudentApp.tsx:1889` ✅ — `if (submitting \|\| submitted) return;` | **Blocked** after first submit    |
| Teacher-paced (advance path) | `:2017` ✅ — `if (submitted && !isStudentPaced) return;`                | **Blocked**                       |
| Self-paced                   | `:2017` ✅ — same line, inverted                                        | **Allowed, unlimited, uncounted** |
| Self-paced form              | `:2760-2766` ✅ — `showEditableForm` keeps the form live on revisit     | **Allowed**                       |

🔴 **Both blocks are client-side React state (`submitted`), not rules and not the
hook.** ✅ `firestore.rules:3023` whitelists `answers` on student updates by
top-level key with no element-shape or count validation, and the status-transition
gate at `:3066-3069` governs the response's `status`, not per-answer rewrites. **A
retake budget enforced in the component is enforced nowhere.** Contrast the
whole-assignment cap, which _is_ rules-enforced (§3.2) — the codebase already knows
how to do this and simply hasn't at the question level.

### 2.4 `attemptLimit` is on the assignment, not the question — and it is not a retake budget

✅ `types.ts:3184-3188` — `QuizBehaviorSettings.attemptLimit: number | null` (`null` =
unlimited). Mirrored to the session at `types.ts:3365`, and to VA at `:4499-4504`,
`:4521-4528`. Authored in `components/common/library/AssignmentSettingsToggleGroup.tsx:167-174,237,256`
✅ and surfaced via `QuizBehaviorSettingsPanel.tsx:136-137` ✅.

It counts **completed submissions of the whole assignment**:

- ✅ `types.ts:3613-3620` — `completedAttempts` is "Incremented on the transition `in-progress -> completed` via `completeQuiz`."
- ✅ `useQuizSession.ts:2497-2501` — `completedAttempts: increment(1)` inside the `completeQuiz` transaction, alongside a cross-launch ledger (`QUIZ_ATTEMPT_LEDGER_COLLECTION`, `:93-106`) that survives re-launches of the same assignment.
- ✅ `useQuizSession.ts:1919-1958` — enforcement at join: `Math.max(response.completedAttempts, ledgerCompleted, 1) >= limit` throws `AttemptLimitReachedError`; under the cap the doc resets to `'joined'` with `answers: []`.

**So the shipped "attempt" is: finish the whole quiz, come back, start over from a
blank answer array.** There is no vocabulary between that and a single answer. RR-A2
is inventing the middle layer.

---

## 3. Does any existing surface show a teacher how many attempts a student made?

**No.** ✅ Verified by reading every `completedAttempts` consumer found by whole-repo
grep. ⚠️ **INFERRED (grep-scoped)** that the grep is exhaustive.

### 3.1 The counter is read in five places and rendered as a number in none

| Site                                                                                                           | What it does with the count                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx:2618-2645` ✅                                    | Compares to `attemptLimit` to decide a boolean `Locked` badge. Tooltip reads _"Attempt limit reached — click to allow resume"_. **The number is never shown.** |
| `components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor.tsx:174,193` ✅ (grep + line read) | Same shape, same badge, same absence.                                                                                                                          |
| `components/quiz/QuizStudentApp.tsx:807-813` ✅                                                                | Student-side `atCap` short-circuit. Number not shown.                                                                                                          |
| `components/quiz/QuizStudentApp.tsx:1205-1220` ✅                                                              | **Feeds the per-attempt shuffle seed** — `` `${uid}:attempt-${attemptIndex}` ``.                                                                               |
| `components/videoActivity/VideoActivityStudentApp.tsx:754-756` ✅                                              | VA `atCap`.                                                                                                                                                    |

### 3.2 The counter is not a ledger — teachers decrement it

🔴 ✅ `useQuizSession.ts:1149-1180` — `unlockStudentAttempt` writes
`completedAttempts: Math.max(0, currentAttempts - 1)` on the response **and**
decrements the cross-launch ledger. ✅ Identical refund in
`useVideoActivitySession.ts:424-462`.

✅ The rules encode this asymmetry explicitly: students may only increase
(`firestore.rules:3044-3045`), may not forge a non-zero value at create (`:2948`),
and are capped at the session limit (`:3061-3064`); the **teacher branch may only
decrease** the ledger (`:3189-3198`). ✅ `firestore.rules:3156` calls the invariant
"the last line of defense."

**`completedAttempts` therefore cannot answer "how many attempts did this student
make?"** — it answers "how much budget has this student consumed?", and a teacher
who unlocks a stuck student silently rewrites history. ⚠️ **INFERRED, and a real
side effect worth checking:** because §3.1's shuffle seed reads the same counter, a
teacher's unlock also reshuffles that student's question order.

### 3.3 The results sheet has a per-student integrity column — and it isn't this one

✅ `utils/assignmentExportShared.ts:125-140` — headers are `Timestamp, Teacher,
Class Period, Student, PIN, Status, Score (%), Points Earned, Max Points,
**Warnings**, Submitted At`, then one column per question.

`Warnings` is `tabSwitchWarnings`. So **the precedent for exporting a per-student
integrity signal to the teacher's sheet already exists** — the plumbing, the column,
the teacher's expectation of reading one. Attempts simply aren't in it. If RR-A2
decides the teacher should see take counts, this row is the cheapest place it lands,
and the ticket's "is that signal or noise?" question has a shipped comparable to
argue against: teachers already tolerate a Warnings column.

---

## 4. The Drive deletion capability RR-A2 needs for superseded takes

**Nothing in `functions/` deletes a Drive file. There is exactly one Drive-writing
function and it has no delete path.**

### 4.1 ✅ Verified by reading `functions/src/driveArchive.ts` end to end (317 lines)

Its Drive surface is: `listDriveFiles` (`:30-50`), `getOrCreateDriveFolder`
(`:52-84`), `getDriveFolderPath` (`:86-98`), `uploadBlobToDrive` (`:100-141`),
`makeDriveFilePublic` (`:143-156`). **No `DELETE` verb appears in the file.**

🔴 The trap: `archiveActivityWallPhoto` does call `file.delete({ ignoreNotFound: true })`
at `:285` — but `file` is `bucket.file(storagePath)` from `:229`, i.e. a **Firebase
Storage object**, not a Drive file. Read quickly, this function looks like it
already deletes from Drive. It does not.

⚠️ **INFERRED (grep-scoped):** grep for `method: 'DELETE'` / `files.delete` across
`functions/src/` returns nothing; the only `trashed` hit is a folder-search filter
at `:60`. Other Drive-touching functions (`googleOAuth.ts`, `classroomAddonAuth.ts`)
were not read in full.

### 4.2 Two things this function already gets right for RR-A2

- ✅ `:277` persists `driveFileId` onto the submission doc. **The identifier a later delete would need is already being captured on the one existing archive path** — the pattern to copy, not invent.
- ✅ `:200-208`, `:271-283`, `:296-304` run a three-state `archiveStatus` machine (`syncing` → `archived` / `failed`) with `archiveError`. A supersede-and-delete flow needs the same shape and can reuse it.

### 4.3 Drive deletion _does_ exist — client-side only, and only for teacher-authored files

| Site                                                            | Deletes                   |
| --------------------------------------------------------------- | ------------------------- |
| `utils/googleDriveService.ts:702-715` ✅ `deleteFile(fileId)`   | generic; 404-idempotent   |
| `utils/quizDriveService.ts:307-315` ✅ `deleteQuizFile(fileId)` | quiz definition JSON      |
| `utils/guidedLearningDriveService.ts:183` ✅ (grep)             | GL set file               |
| `utils/googleDriveService.ts:637-650` ✅ `deletePermission`     | a share grant, not a file |

Callers: `hooks/useQuiz.ts:461,587`, `hooks/useVideoActivity.ts:348,411`,
`hooks/useGuidedLearning.ts:215,276`, `hooks/useRosters.ts:821`,
`components/widgets/NextUp/Settings.tsx:141-145` ✅ (grep + spot reads).

Two observations:

1. **Every one deletes teacher-authored content the teacher just asked to delete.** None deletes student media, and none runs without a teacher present.
2. ✅ `useQuiz.ts:587` and `useVideoActivity.ts:411` are **rollback deletes** — remove the file we just created because the follow-up write failed. That is the closest existing analogue to "delete the superseded take," and it lives on the client with a live teacher token.

### 4.4 🔴 The token problem RR-A2 has to solve

✅ `driveArchive.ts:164-184` — `archiveActivityWallPhoto` takes `accessToken` **from
the client request payload** and validates only that `sessionId` starts with the
caller's uid (`:186-191`). There is no stored refresh token, no service-account
delegation, no impersonation of the teacher's Drive.

⚠️ **INFERRED, but it follows directly:** a superseded-take delete must run against
the **teacher's** Drive (they own the file), while the actor is a **student**
pressing re-record. The one shipped server-side Drive path can only act with a token
the caller hands it, and a student has no token for the teacher's Drive. So
RR-A2's cleanup is not "add a delete call to the archive function" — it needs either
(a) a stored teacher credential SpartBoard does not have today, (b) a deferred
sweep that runs when the teacher is next online with a token, or (c) accepting that
superseded files accumulate until a teacher-initiated cleanup. **That is a design
fork the ticket has to walk into knowingly**, and it interacts with the ticket's own
"does the teacher ever see superseded takes" question — option (c) answers it for
you.

---

## 5. 🔴 Counting discards separately: what in the code makes it hard

This is RR-A2's stated new first question. Six obstacles, in rough order of how hard
they are to route around.

1. **A discard leaves no trace at all.** RR-A1 sub-decision 7 keeps bytes in memory until commit, so the server never learns a take happened. ✅ Nothing in `submitAnswer` (`useQuizSession.ts:2251-2400`), the rules (`firestore.rules:2967-3072`), or the history rule (`:3080-3106`) has any write shape that could carry "a take was made and thrown away." **Counting discards means creating a Firestore write whose sole content is that a child declined to be recorded.** That is not a schema problem, it's the ticket's ethical centre: the refusal mechanism becomes auditable at the moment you start counting it.

2. **The response doc's field set is a rules whitelist.** ✅ `firestore.rules:3023` — student updates must satisfy `affectedKeys().hasOnly([...13 fields])`. A second counter (`discardCount`, `takeCount`) is rejected until the rules ship. ✅ And `useQuizSession.ts:2489-2496` documents the live hazard: production deploys land hosting **before** rules, so a client writing a field the deployed rules don't yet allow silently fails the whole submit. Adding a counter is a two-stage deploy, not a field.

3. **There is nowhere per-question to put it.** ✅ `QuizResponseAnswer` (`types.ts:3467-3488`) is the only per-question structure, and §1.1's replace destroys anything added to it on the next write. A per-question sidecar map — the shape `grading` already uses (`firestore.rules:3006-3018` ✅, teacher-written, deliberately excluded from the student whitelist) — is the precedent, but `grading` is teacher-only by construction and a discard counter is student-written by nature.

4. **The one counter that exists is the wrong kind of number.** ✅ Per §3.2, `completedAttempts` is decrementable by teachers, monotonic-up for students, and capped against `sessionAttemptLimit()` (`firestore.rules:3061-3064`). Two counters with different semantics — one a budget teachers refund, one a refusal tally nobody may refund — cannot share that machinery, and the cap rule has no session-level field to compare a second counter against.

5. **The history subcollection is shape-pinned and can't record it.** ✅ `firestore.rules:3092-3099` allows exactly five keys, `allow update: if false`. A discard event doesn't fit, and per §1.3(3) a media take with `answer: ''` wouldn't be snapshotted anyway.

6. **The shuffle seed reads the attempt counter.** ✅ `QuizStudentApp.tsx:1205-1220`. If discards were folded into any counter the seed consumes, **a student who declines to be recorded gets their question order reshuffled** — an absurd but real coupling, and a reason to keep any new counter well away from `completedAttempts`.

### 5.1 The one precedent that helps

✅ `functions/src/finalizeIdleQuizAttempts.ts:442-465`. The idle sweep finalizes a
stale response but writes `completedAttempts` **only when `finalAnswers.length > 0`**,
with the comment: _"Don't consume an attempt slot for a student who joined but never
wrote a single answer — they'd otherwise hit the cap without seeing a question."_

That is exactly the shape RR-A2 needs for discards: **an attempt that happens but
deliberately does not consume budget, with the reasoning written down as a fairness
argument rather than a technical one.** If the session lands on "discards don't
count," this is the in-repo precedent to cite, and it is already server-enforced.

---

## 6. The landmine table — ranked

| #     | Site                                                                                             | What breaks                                                                                                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | `hooks/useQuizSession.ts:2359-2362` ✅                                                           | **Destructive replace.** Any take metadata added to `QuizResponseAnswer` is erased by the next write to that question — and a retake _is_ that write. Rules don't stop it (`firestore.rules:3023`). Same landmine RR-08 ranked #1; RR-A2 hits it from the other side. |
| **2** | `functions/src/driveArchive.ts` (whole file) ✅ + `:285`                                         | **No Drive delete exists server-side**, and the Storage delete at `:285` reads like one. Superseded-take cleanup is a new capability with a token problem (§4.4), not a one-line addition.                                                                            |
| **3** | `quizScoreboard.ts:55-71`, `questionAccuracyStats.ts:1-35`, `useQuizAssignments.ts:2000-2035` ✅ | **First-occurrence-wins dedupe.** If retakes become sibling `answers[]` entries, the scoreboard grades take 1 while the results view shows take 3, silently.                                                                                                          |
| **4** | `QuizStudentApp.tsx:1889`, `:2017` ✅                                                            | The only re-submission blocks are **client-side React state**. A retake budget enforced here is enforced nowhere — unlike the whole-assignment cap, which is rules-backed.                                                                                            |
| **5** | `useQuizSession.ts:1149-1180`, `useVideoActivitySession.ts:424-462` ✅                           | `completedAttempts` is **decremented on teacher unlock**. Any "how many takes?" display built on a counter of this family lies after the first unlock.                                                                                                                |
| **6** | `firestore.rules:3092-3099` ✅ + `useQuizSession.ts:179` ✅                                      | The only prior-value preservation mechanism is shape-pinned to 5 text keys, skips empty priors (so media-only takes get nothing), throttles at 5 s, and **has no reader** (§1.3).                                                                                     |
| **7** | `useQuizSession.ts:1969-1979` ✅                                                                 | A new whole-assignment attempt clears `answers: []` with **no archive**. Whatever RR-A2 decides about per-question takes, take history dies at the assignment boundary unless this changes.                                                                           |
| **8** | `QuizStudentApp.tsx:1205-1220` ✅                                                                | Question order is seeded from the attempt counter. Any counter change reshuffles the student's quiz.                                                                                                                                                                  |

---

## 7. Three things worth carrying into the session

1. **The codebase holds both answers to "what does a retake mean" and they contradict.** Quiz replaces and never appends (`useQuizSession.ts:2359-2362`); Video Activity appends and never replaces (`useVideoActivitySession.ts:1034` + `firestore.rules:3473-3479`). Whichever RR-A2 picks, one of two near-identical schemas becomes the odd one out — and §6/#3 says the append model is the one with live consumers pointed the wrong way.

2. **"Does the teacher see 6 attempts?" is currently answered _no_ twice over** — the number isn't rendered anywhere (§3.1), and the number that exists isn't trustworthy (§3.2). But the _channel_ exists: the results sheet already carries a `Warnings` column (`assignmentExportShared.ts:125-140`). The question is not "can we show it" but "is it the same kind of thing as a tab-switch warning" — and if discards are refusals, the answer had better be no.

3. **`finalizeIdleQuizAttempts.ts:442-465` is the precedent for a non-counting attempt**, written for a fairness reason ("they'd otherwise hit the cap without seeing a question") that transfers almost word-for-word to a student who declines to be recorded. It is the strongest in-repo support for the ticket's likely answer that discards and retakes must be counted separately — or not counted at all.
