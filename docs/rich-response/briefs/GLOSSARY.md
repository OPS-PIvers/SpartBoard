# Rich-response canonical glossary

Built 2026-09-01 by cross-reading `CONVENTIONS.md` and briefs 2.1, 2.2, 3.1,
3.2, 3.3, 3.4, 3.5, 3.6, 4.1. Every name below is shared by two or more
briefs. Where briefs disagreed on shape, one is picked as canonical and the
losing shape is noted so nobody re-introduces it. Briefs 1.2/1.3 are out of
scope for this pass — not touched, not glossaried.

Every implementer brief should use these exact names. If you need a type,
field, or helper not listed here, check whether it's brief-local (fine) or
whether it should have been listed here (flag it, don't invent a rival name).

## Artifact types (types.ts) — 2.1 is canonical

```ts
export type ArtifactSlot = 'primary' | 'addendum';
export type ArtifactKind = 'text' | 'audio' | 'video' | 'whiteboard';
export type ArtifactUploadState = 'pending' | 'uploaded' | 'failed';

export interface ResponseArtifact {
  id: string; // minted client-side at record-stop; never changes
  slot: ArtifactSlot;
  kind: ArtifactKind;
  text?: string; // inline, kind: 'text' only
  storagePath?: string; // Firebase Storage transit path; absent once archived
  mimeType?: string;
  bytes?: number;
  durationMs?: number; // client-measured — Chrome webm reports Infinity
  uploadState: ArtifactUploadState;
}
```

- `ArtifactKind` carries the full peer-mode union (`'video'`, `'whiteboard'`
  included) even though only `'audio'` ships in this run. Brief 3.3's own
  Step 0 code block narrowed this to `'text' | 'audio'` — that was wrong
  against the shipped 2.1 type and has been corrected in 3.3 to reference
  the full union (video/whiteboard just aren't handled by any 3.3 logic
  branch).
- `QuizResponseAnswer.artifacts?: ResponseArtifact[]` — added by 2.1.

## `takeIndex` (types.ts) — 3.2 is canonical

`QuizResponseAnswer.takeIndex?: number` — present only on artifact-bearing
(recording) answers; absent on text/MC-style answers, where a `questionId`
is unique in `answers[]`. Introduced by brief 3.2 (RR-A2 sub-decision 5),
not 2.1 (2.1 explicitly scopes `takeIndex` out — it belongs to 3.2).

## `UnrespondedReason` (types.ts) — 2.2 is canonical

```ts
export type UnrespondedReason =
  | 'passed'
  | 'expired'
  | 'abandoned'
  | 'capture-unavailable';
```

`QuizResponseAnswer.unresponded?: UnrespondedReason` — absent means the
student responded. **No `'declined'` value** — RR-A2 explicitly rejected
one; there is no refusal exit from a required question.

Brief 3.4's original draft used a different, wrong fallback vocabulary
(`'auto-advance' | 'unanswered' | 'capture-unavailable'`) for the case where
Phase 2 hadn't landed yet. That fallback has been removed from 3.4 (see
`CONVENTIONS.md`-style ordering: Phase 2 ships before Phase 3, so the
fallback was never going to be exercised) — 3.4 now points at 2.2's shipped
type directly.

## `artifactArchive` / `ArtifactArchiveEntry` (types.ts) — 3.3 (+ 4.1's extension) is canonical

2.1 deliberately left the exact `archiveStatus` vocabulary open ("this
brief's to pick... do not block on inventing more values than the archival
callable will actually need"). 3.3 and 4.1 are the callables that actually
need it, so their shape wins. 2.1's brief text has been updated to match
this shape directly instead of shipping a placeholder that 3.3/4.1 would
have had to diverge from.

```ts
export type ArtifactArchiveStatus =
  | 'syncing'
  | 'archived'
  | 'failed'
  | 'deleted' // added by 4.1
  | 'delete-failed'; // added by 4.1

// Server-owned, sibling to QuizResponse.grading — never in the student
// write whitelist (firestore.rules:3360). Keyed by ResponseArtifact.id.
export interface ArtifactArchiveEntry {
  driveFileId?: string;
  archiveStatus: ArtifactArchiveStatus; // required — an entry is only created once a status is known
  archiveStartedAt?: number;
  archivedAt?: number;
  archiveError?: string;
  deletedAt?: number; // 4.1
  deletedBy?: string; // 4.1, admin uid
  deleteAttemptedAt?: number; // 4.1, dead-token failure path
}

// On QuizResponse, sibling to `answers[]`.
artifactArchive?: Record<string, ArtifactArchiveEntry>;
```

Every reader of `archiveStatus` must treat anything other than `'archived'`
(with `driveFileId` present) as "not currently playable" — this already
holds by construction in 3.3/3.4/3.6's logic; 4.1's new values are additive
and don't require those briefs to add new branches, only to confirm the
"else not playable" fallback still catches them. `isArtifactPlayable`
(`utils/responseArtifacts.ts`) is the shared helper for this check.

## `RecordingConfig` (types.ts) — 3.1 (base) + 3.2 (`takeLimit`) is canonical

```ts
export type RecordingPrepExpiry =
  | 'auto-start'
  | 'auto-advance'
  | 'armed'
  | 'unanswered';

export interface RecordingConfig {
  prepSeconds: number; // default 30
  limitSeconds: number; // default 60, max 300 for audio (mode-dependent ceiling)
  prepExpiry: RecordingPrepExpiry;
  takeLimit: number | null; // added by 3.2 — null = unlimited (default)
}
```

`recording?: RecordingConfig` lives on `QuizQuestion` and
`QuizPublicQuestion` (3.1). `takeLimit` counts takes, not re-takes.

## `GlobalFeature` id + gating helper — 3.1 is canonical (introduced via owner note)

- **`GlobalFeature` id: `'quiz-media-response'`** (fixed by `CONVENTIONS.md`,
  formally introduced in brief 3.1's owner note).
- **Canonical fail-closed gating helper: `canAccessQuizMediaResponse(...)`.**
  Every sibling surface — 3.1's recording controls, 3.3's archival callable,
  3.4's grading queue, 3.6's playback callable — imports and calls this one
  helper rather than re-deriving the check from `canAccessFeature` +
  a manual "does the permission record exist" lookup. Fail-closed means:
  the permission record must **exist** AND grant access; a missing record
  is treated as denied (this is the opposite of `canAccessFeature`'s default
  "no record = public" behavior elsewhere in the app — `quiz-media-response`
  is the one feature id that inverts that default, so the helper name is
  deliberately distinct from `canAccessFeature` to avoid the mistake of
  calling the generic helper directly for this one gate).
- 4.1's org-admin console is explicitly exempt from this gate (compliance
  tooling must work even when the feature is off) — do not add the check
  there.

## Drive archival callable, sweep, playback, delete — names from 3.3/3.6/4.1

| Name                         | File (recommended)                                                                                           | Brief | Purpose                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------- |
| `archiveQuizMediaArtifact`   | `functions/src/quizMediaArchive.ts`                                                                          | 3.3   | `onCall`, transcodes + archives one artifact to Drive             |
| `sweepStuckQuizArchives`     | `functions/src/sweepStuckQuizArchives.ts`                                                                    | 3.3   | `onSchedule`, hourly, retries stuck/failed archives older than 2h |
| `getQuizArtifactPlaybackUrl` | `functions/src/getQuizArtifactPlaybackUrl.ts`, or added to `quizMediaArchive.ts` if that file already exists | 3.6   | Proxies Drive bytes back to the owning student after publish      |
| `deleteQuizMediaForOrgAdmin` | `functions/src/deleteQuizMediaForOrgAdmin.ts`                                                                | 4.1   | Org-admin compliance delete, all takes for a question/student     |

All four use `refreshGoogleAccessTokenForUid(teacherUid)`
(`functions/src/googleOAuth.ts`) — never a client-supplied token.

## Firebase Storage transit path — 3.3 is canonical

```
quiz_response_media/{sessionId}/{studentUid}/{artifactId}.{ext}
```

5 MB size cap, `contentType.matches('audio/.*')`. Deleted by the archival
callable on successful archive. Any reader of `ResponseArtifact.storagePath`
must independently verify the `{sessionId}/{studentUid}` prefix before
trusting it (Firestore rules cannot validate array element shape).

## Google Drive folder + filename convention — 3.3 is canonical

```
SpartBoard/Quiz Responses/{quizTitle}/{LastName}_{FirstName}__Q{n}.m4a
```

Mirrors the existing `QuizMetadata.driveFileId` folder convention. Filename
carries the student's **real name**, resolved server-side (never
client-supplied) — Firebase transit stays pseudonymous, Drive does not.
Output format is **M4A/AAC** (`fluent-ffmpeg` + `ffmpeg-static`), fixed by
`CONVENTIONS.md` — this overrides the wayfinder map's own MP3/Opus
discussion for this run. No public Drive link (`makeDriveFilePublic` is
never called for quiz media).

## Grading types (types.ts) — 3.4 is canonical

- `WrittenAnswerGrade.gradedTakeIndex?: number` — which take a manual grade
  is about; scoring/leaderboard always reads the highest `takeIndex`
  regardless of this field.
- `WrittenAnswerGrade.excused?: boolean` — distinguishes "excused,
  permanently resolved" from "still awaiting grade"; both compute to
  `GradeResult.state === 'awaiting-grade'` for every downstream consumer.
- Composite grading key helpers: `gradingKey(questionId, slot): string`
  (unsuffixed key = primary slot, for backward compat; `` `${questionId}::${slot}` ``
  otherwise) and `parseGradingKey(key): { questionId, slot }`. Every reader
  of `QuizResponse.grading` — the grading UI, `quizScoreboard.ts`, the
  export, both LMS pushes, and 3.6's playback callable — routes through
  these two helpers.
- `slotNeedsManualGrading(question, artifact): boolean` — per-slot
  predicate (`utils/mediaGrading.ts` or `utils/quizScoreboard.ts`);
  distinct from the existing per-question `isWrittenQuestionType`, which
  keeps its current meaning and call sites.

## Completeness predicate — 2.2 is canonical

`isQuestionAnswered(answers, questionId): boolean` and
`countAnsweredQuestions(answers, questionIds): number` — the one binary
completeness check every student-facing progress/count site routes through.
Unaffected by `takeIndex`/takes (3.2): any committed take fills a slot,
regardless of count.

## Deploy-safety markers

`completenessModel: number` on the `quiz_sessions/{id}` doc, written as `1` by the
teacher client at session creation (`hooks/useQuizAssignments.ts`); the server-side
always-write of `unresponded: 'abandoned'` entries in
`functions/src/finalizeIdleQuizAttempts.ts` is gated on `>= 1`, so sessions created by
production clients that predate the marker are finalized exactly as before.

## i18n namespace/key prefix — none of the nine briefs commits to one; established here

No brief specifies a concrete i18n key prefix beyond `CONVENTIONS.md`'s
generic "every new string goes through i18n" rule. To keep five different
implementers from inventing five different prefixes, use:

```
locales/en/quizMediaResponse.json  (namespace: "quizMediaResponse")
```

covering: the Tennessen notice (3.1), recording controls/advisory copy
(3.1, 3.5), the media grading queue (3.4), and student playback (3.6).
Follow whatever namespacing convention the existing `locales/en/*.json`
files already use for other quiz surfaces (check `quiz.json` or similar
before assuming a brand-new top-level file is correct) — the point is
consistency across siblings, not a specific file boundary.

## Permission helper vs. existing `canAccessFeature`/`canAccessWidget`

`canAccessQuizMediaResponse` (above) is new and specific to this feature.
Do not confuse it with the existing generic `canAccessFeature`/
`canAccessWidget` from `useAuth()` — those keep their current
default-to-public behavior for every other feature/widget id; only
`quiz-media-response` is fail-closed, and only through the dedicated
helper.
