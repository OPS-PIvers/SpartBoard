# PLC norming flags (workstream F, F1 to F4)

Sep 24, 2026. A teacher flags a free-response answer in the grader at a level; an anonymized copy
(text, or a re-uploaded audio clip) appears in a "Norming" section on the PLC assessment page.
Everything is behind the new admin-default `GlobalFeature` `plc-norming-flags`.

## Data

### `plcs/{plcId}/norming/{normingId}` (PLC-visible copy)

`normingId` is a random 20-char Firestore auto id. Fields, all server-written:

| Field                                         | Notes                                                                |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `id`                                          | = doc id                                                             |
| `assessmentId`                                | live `plcs/{plcId}/assessments/{id}` for the session's `syncGroupId` |
| `questionId`, `questionIndex`, `questionText` | from the session's `publicQuestions` (via `withQuizSessionContent`)  |
| `level`                                       | `'high' \| 'medium' \| 'low' \| 'review'`                            |
| `kind`                                        | `'text' \| 'audio'`                                                  |
| `answerText`                                  | text answers only, capped at 20,000 chars                            |
| `audioPath`                                   | `plc_norming_media/{plcId}/{normingId}.{ext}`, audio only            |
| `mimeType`, `durationMs`                      | audio only                                                           |
| `flaggedByUid`, `flaggedByName`               | the flagging teacher (name from the PLC `members` map)               |
| `createdAt`, `updatedAt`                      | server timestamps                                                    |

Never copied: student name, uid, PIN, response key, session id, class period/classId, answeredAt,
tab-exit data, grading, the original Storage path or Drive file id.

### `plc_norming_sources/{sourceId}` (private back-pointer, top-level)

`sourceId = sha256(flaggedByUid | sessionId | responseKey | questionId)`, so one answer has at most
one flag per teacher and create/level-change/unflag run in a transaction on a known doc.
`{ normingId, plcId, flaggedByUid, sessionId, responseKey, questionId, level, createdAt }`.
The only link from a copy back to a student. Readable only by `flaggedByUid` (so the grader can show
which responses that teacher already flagged); never readable by other PLC members; no client writes.
Top-level (not under `users/{uid}`) so a compliance delete can query it by `sessionId`.
Composite index `(flaggedByUid ASC, sessionId ASC)`.

### PLC doc: `normingLevelLabels`

Optional map `{ high?, medium?, low? }` of strings (≤ 40 chars each) on `plcs/{plcId}`. Review is
fixed and not renameable. Written by a lead/co-lead through a new closed update branch
`isUpdatingPlcNormingLabels()` (`changedOnly(['normingLevelLabels','updatedAt'])`, map keys
`hasOnly(['high','medium','low'])`, each value string of size 1..40). Missing labels fall back to
"High / Medium / Low / Review". Chips render as symbols (3, 2, 1 stars, question mark) with the
label as tooltip / aria-label.

## Callable: `setPlcNormingFlagV1`

Input `{ sessionId, responseKey, questionId, level: 'high'|'medium'|'low'|'review'|null }`.
Returns `{ normingId: string | null, level }`. Identity and content are derived server-side:

1. `request.auth` required; `isGlobalFeatureGranted(db, 'plc-norming-flags', email, uid)` (fail
   closed).
2. Read `quiz_sessions/{sessionId}`; caller must equal `teacherUid`; `plcId` and `syncGroupId`
   must be non-empty.
3. Read `plcs/{plcId}`; caller must be in `memberUids` (active member). Viewers are allowed.
4. Resolve the live assessment for `(plcId, syncGroupId)` (reuse `findLiveAssessment`); none →
   `failed-precondition`.
5. Read `plc_norming_sources/{sourceId}` (the mapping for this answer).
   - `level == null`: delete copy doc, source doc and audio object; return `{ normingId: null }`.
   - existing + new level: update `level` on both docs; no re-copy.
   - none: create (below).
6. Read `quiz_sessions/{sessionId}/responses/{responseKey}`; take the representative submitted
   answer for `questionId` (highest `takeIndex`); the question must be a free-response type.
   - Text: `answer` (or the text artifact). Empty → `failed-precondition`.
   - Audio: the primary-slot audio artifact. Source bytes from the Storage transit object when it
     still exists; otherwise from the archived Drive file (`artifactArchive[id].driveFileId`) using
     the teacher's own stored token (the caller is the teacher), same path as
     `getQuizArtifactPlaybackUrl`. A tombstoned (`deleting`/`deleted`) or missing take →
     `failed-precondition 'no-recording'`. Size cap 8 MB.
   - Audio is written with `bucket.file(path).save(bytes, { contentType })` and **no** custom
     metadata, so nothing from the source object (its path, custom metadata) carries over.
7. Upload audio first (to the random `normingId` path), then a transaction re-reads the source doc
   and creates copy + source only if it is still absent; if a concurrent call won, the upload is
   deleted and the winner's id returned. On any write failure the upload is deleted.

## Storage rule

```
match /plc_norming_media/{plcId}/{fileName} {
  allow read: if request.auth != null
    && request.auth.uid in firestore.get(/databases/(default)/documents/plcs/$(plcId)).data.memberUids;
  allow write: if false;
}
```

## Firestore rules

```
match /plcs/{plcId}/norming/{normingId} {
  allow read: if request.auth != null && plcMember(plcId);
  allow create, update, delete: if false;
}
match /plc_norming_sources/{sourceId} {
  allow read: if request.auth != null && resource.data.flaggedByUid == request.auth.uid;
  allow create, update, delete: if false;
}
```

Rules tests cover: member reads a copy, non-member / removed member denied, member cannot
create/update/delete a copy; owner reads (get + list with the `flaggedByUid` filter) a source doc,
another PLC member cannot get or list it, nobody writes it; lead sets labels, non-manager member
denied, bad shapes denied. Storage rules are exercised by the existing storage rules test setup if
one exists; otherwise covered by an explicit reasoning note in the PR.

## Lifecycle

- **Unflag:** the callable deletes the copy, the source pointer and the audio.
- **Teacher leaves or is removed from the PLC:** a new trigger `cleanupPlcNormingOnMembership`
  (`onDocumentWritten plcs/{plcId}`) diffs `memberUids`; for each uid that left, deletes that uid's
  copies, sources and audio in that PLC.
- **PLC deleted:** the same trigger deletes every copy, source and audio object for the PLC.
- **Source session deleted:** copies are kept (they are anonymous by design).
- **Compliance delete of a student's media** (`deleteQuizMediaForOrgAdmin`): also deletes any norming
  audio copy made from that student's takes (via `plc_norming_sources` where `sessionId ==` and
  `responseKey ==`), since a voice can identify a student even without a name.
- **Assessment soft-deleted:** copies stay hidden with it (the section is on the assessment page);
  no extra sweep this pass.

## Client

- **F1 (grader):** a grayscale flag icon under each response card, shown only when
  `canAccessFeature('plc-norming-flags')` and the session has `plcId` + `syncGroupId`. Click opens a
  compact chip row (3, 2, 1 stars, ?). Clicking a chip calls the callable; clicking the active chip
  unflags. The teacher's existing flags come from a `plc_norming_sources` query
  (`flaggedByUid == uid && sessionId == X`). For audio the popover says "Your PLC will hear this
  recording." Lives in its own component `PlcNormingFlagControl.tsx`; the grader only mounts it.
- **F2 (settings):** a "Norming levels" card in `PlcSettingsTab.tsx`, editable by lead/co-lead.
- **F4 (PLC page):** `PlcNormingSection.tsx`, mounted from `PlcAssessmentDetail.tsx` behind the flag.
  Query `plcs/{plcId}/norming where assessmentId == X`; group by question (question order), then
  level (High, Medium, Low, Review). Cards show the answer text or an audio player (bytes from
  `getBlob` on the member-readable path, per decision 1), the level and the flagging teacher. No scoring or
  voting.

## Compatibility

All additive: a new collection, a new top-level collection, a new optional PLC field on a new
closed update branch, a new Storage path. The previous client never writes any of them.

## Review decisions (advisor, 2026-09-24)

1. F4 never calls `getDownloadURL` on `plc_norming_media` (it mints a public token). It reads with
   `getBlob` (rule-enforced) and plays an object URL.
2. Audio is always re-muxed through ffmpeg with `-map_metadata -1` before upload, and `mimeType` and
   the extension come from the output, whether the source was the webm transit object or the m4a in
   Drive.
3. Answers can name the student in their own words. The flag popover asks the teacher to confirm the
   answer doesn't name the student (text and audio); audio also says "Your PLC will hear this
   recording."
4. The callable declares the Drive secrets, 512 MiB, 60 s, and takes the email from the auth token.
5. The create transaction re-reads `plcs/{plcId}` and the assessment, re-checking membership and
   liveness, so a flag racing a removal can't land after the cleanup ran.
6. `plc_norming_sources` gets a second composite index `(sessionId, responseKey)`; the compliance
   and response-delete sweeps filter `questionId` in memory.
7. New rules blocks stay comment-light (source is already 302 KB).
8. `answerText` over 20,000 chars is cut and marked `truncated: true`.
9. `questionIndex` is the `publicQuestions` position and is display order only.
10. Labels: lead/co-lead only (`isPlcMembershipManager`); clearing a label falls back to the default.
11. Viewers cannot flag (server mirrors `plcCanEditContent`). Only a submitted, responded answer can
    be flagged.
12. Extra lifecycle: deleting a response deletes the audio copies made from it (voice identifies) and
    its source docs, and keeps text copies; deleting a session deletes only source docs. Deleting a
    teacher account has no sweep of its own: leaving the PLC already removes that teacher's copies,
    sources and audio. PLC delete uses `deleteFiles({ prefix })`. The membership trigger is
    idempotent.
13. Media slots: the callable takes `slot: 'primary' | 'addendum'` (default primary), included in
    `sourceId`.

## Rollout slices

1. #3396: server, rules and indexes, the grader flag (mounted in `QuizResults` via the grader's
   `renderNormingFlag` prop) and the "Norming levels" card in PLC settings.
2. Follow-up (after #3400): `PlcNormingSection` mounted in `PlcAssessmentDetail.tsx` for quiz
   assessments, behind the flag.
