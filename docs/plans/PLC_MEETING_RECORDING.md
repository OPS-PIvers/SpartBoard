# Group meeting recording and AI meeting notes

Source: Paul, grill-me session 2026-10-02.
Status: decisions confirmed by Paul (grill-me, two rounds). No code yet.

## Goal

Any editor in a group can press **Record** on a note in Notes & Docs so nobody has to type the whole meeting. The audio is attached to the note for playback. Behind a separate, admin-gated AI flag, Gemini turns the recording into a speaker-labelled transcript and a draft of structured meeting notes that an editor reviews and inserts.

## Decisions

| #      | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MR-D1  | **Two flags.** `plc-meeting-recording` (recording and playback) and `plc-meeting-ai-notes` (transcript and notes). Both are new `GlobalFeature` ids with `defaultAccessLevel: 'admin'`, `missingDocPublic: false` and `stage: 'preview'`. Recording is `afterLaunch: 'retire'`. AI notes is `afterLaunch: 'keep'` so admins keep control of who gets AI. AI notes also needs the `gemini-functions` hard gate and runs through `enforceAiFeatureAccess` with `missingDocAllowed: false`.                                                 |
| MR-D2  | **Without AI, recording means audio playback only.** There is no transcript and no summary, and the audio is removed by the 30-day sweep (MR-D9).                                                                                                                                                                                                                                                                                                                                                                                        |
| MR-D3  | **Who records:** any editor (`plcCanEditContent`, so not viewers). One active recording per note. Other members see a live red badge, "Recording · {name} · mm:ss", and their Record button is disabled.                                                                                                                                                                                                                                                                                                                                 |
| MR-D4  | **Placement:** a Record button in the note editor toolbar only, in both the rich editor and the Markdown editor. Starting a recording on a freeform note sets `kind: 'meeting'`. Meeting Mode and Group Home do not get the button for now.                                                                                                                                                                                                                                                                                              |
| MR-D5  | **Devices:** Chrome and Chromebooks only (`audio/webm;codecs=opus`). The button is feature-detected; elsewhere it is disabled with "Recording works in Chrome".                                                                                                                                                                                                                                                                                                                                                                          |
| MR-D6  | **Length:** 60 minutes of recorded time. A warning appears at 55:00 and recording auto-stops at 60:00. Pause and resume are allowed; paused time does not count, and the badge shows "Paused". A recording paused for 30 minutes stops and finalizes on its own, so a forgotten pause never blocks the note.                                                                                                                                                                                                                             |
| MR-D7  | **Uploads happen live, in chunks.** `MediaRecorder.start(30000)` uploads each 30-second segment as soon as it is produced. A segment that fails to upload (a Wi-Fi drop) is saved to IndexedDB and retried when the connection returns, even after a reload. A `beforeunload` warning appears while recording or while segments are waiting to upload. Each `MediaRecorder` instance is one **part**: its segments concatenate byte-for-byte into a valid WebM file. Resuming, or switching microphone, starts a new part.               |
| MR-D8  | **Interruptions:** the recorder sends a heartbeat every 30 seconds. A scheduled function finalizes any recording with no heartbeat for 5 minutes (so 5 to 10 minutes in practice) and marks it "interrupted at mm:ss". If the recorder returns first, "Resume recording" appends a new part. Buffered segments that arrive after finalizing are merged back in, and the recording re-finalizes, if no transcript has been made yet. Otherwise they become a separate "Recovered audio" recording on the note with its own 30-day expiry. |
| MR-D9  | **Audio retention:** the audio lives in Firebase Storage only temporarily. It is deleted as soon as the transcript and draft are saved. Audio that never got transcribed (AI off, failures, abandoned recordings) is hard-deleted by a sweep 30 days after creation. Deleted audio does not go to Trash. Trashing a note leaves its audio in place, so restoring the note brings the audio back; the 30-day expiry still applies.                                                                                                        |
| MR-D10 | **Playback and download:** all members, viewers included, can play and download the audio while it exists.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| MR-D11 | **Early delete:** any editor can delete a recording's audio immediately (for moments like "we shouldn't have recorded that"). A transcript that has already been saved stays until the note is deleted.                                                                                                                                                                                                                                                                                                                                  |
| MR-D12 | **One note can hold several recordings,** one after another. Each recording has its own transcript section and draft.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| MR-D13 | **Engine:** Gemini on Vertex, using the existing `aiGeneration.ts` client and model overrides. One call takes the `gs://` part files in order and returns structured JSON with the transcript, the notes and the action items. "Regenerate" re-summarizes from the saved transcript, which is a text-only call.                                                                                                                                                                                                                          |
| MR-D14 | **How AI starts:** automatically on Stop when the recorder has `plc-meeting-ai-notes`. Otherwise, while the audio exists, any editor with access can press "Generate notes". Recordings finalized by the server (MR-D8), and Recovered audio, always wait for a button press (Paul's call).                                                                                                                                                                                                                                              |
| MR-D15 | **Quota:** 3 transcriptions per user per day and a separate 10 per day for Regenerate. Only successful runs count; a failed run is refunded. Admins are exempt, as with every other AI feature.                                                                                                                                                                                                                                                                                                                                          |
| MR-D16 | **Failure:** the audio is kept and an error shows with a Retry button. Retrying does not use quota (MR-D15). If nobody retries, the 30-day sweep removes the audio.                                                                                                                                                                                                                                                                                                                                                                      |
| MR-D17 | **Transcript:** kept with the note in a collapsed "Transcript" section, visible to all members. Speakers are labelled Speaker 1, 2, 3 and so on; no names are guessed. It is read-only.                                                                                                                                                                                                                                                                                                                                                  |
| MR-D18 | **Notes shape:** the sections of the existing meeting-note template (`notesTemplate.ts`): Agenda, Discussion, Decisions and Action items. The notes do not say who said what. Action items become real `PlcActionItem` entries. An owner is suggested only when someone takes a task by name ("Sarah will…"), matched against the group's member names, and an editor confirms or changes each owner in the preview.                                                                                                                     |
| MR-D19 | **Draft review:** every editor sees a "Notes ready · Review" badge in the note and on the Notes & Docs list. There are no other notifications. In the preview, anyone can choose Insert (appended under the existing body), Replace, Regenerate or Dismiss. The insert is made client-side through the note's normal write path, so it works in both version-precondition mode and Yjs collab mode. Nothing touches the shared note until a person accepts it.                                                                           |
| MR-D20 | **Privacy:** out of scope for now, by Paul's call. A visible recording badge is still shown to everyone in the note, and a row is added to `docs/gemini-api-terms-audit.md` for the meeting-audio input.                                                                                                                                                                                                                                                                                                                                 |
| MR-D21 | **Claude connector (phase 3):** tools to list a group's recorded meetings, read a transcript, and write notes into the recording's draft slot, where an editor reviews and inserts them as in MR-D19. Claude never edits the note itself. Writing is refused, with the reason, when a draft is already waiting for review. The caller must be an editor of the group. Claude does not transcribe; that stays in Gemini.                                                                                                                  |
| MR-D22 | **Microphone:** the recorder picks a microphone from a list when more than one input exists, and the choice is remembered on that device (localStorage). If the selected mic disconnects mid-recording, recording carries on with the default mic as a new part, with the notice "Microphone disconnected — now using built-in mic".                                                                                                                                                                                                     |
| MR-D23 | **AI wording:** badges and buttons do not say AI ("Notes ready", "Generate notes"). Only the review preview carries the line "Drafted automatically from the recording — check before inserting". Inserted notes carry no marker.                                                                                                                                                                                                                                                                                                        |

## Data

- `plcs/{plcId}/recordings/{recordingId}`. Fields:
  - `noteId`, `recorderUid`, `recoveredFrom?` (Recovered audio)
  - `status`: `'recording' | 'paused' | 'finalizing' | 'ready' | 'queued' | 'transcribing' | 'transcribed' | 'failed'`
  - `parts: { segmentCount, durationMs }[]`, `durationMs`
  - `lastHeartbeatAt`, `interruptedAtMs?`
  - `audioDeletedAt?`, `audioExpiresAt` (created at + 30 days)
  - `error?`, `requestedBy?`
  - `draft?: { markdown, actionItems[], generatedAt, generatedBy }`, `draftResolvedAt?`
  - `createdAt`
- `plcs/{plcId}/recordings/{recordingId}/transcript/main`: `{ segments: { speaker, startMs, text }[] }`. This is a separate doc so the live recordings listener stays small; it is read when the Transcript section is expanded.
- Storage path `plc_meeting_audio/{plcId}/{recordingId}/{partIndex}/{segmentIndex}.webm`. Finalizing concatenates these into `{partIndex}.webm` and deletes the segments.

## Rules

- **Firestore:**
  - Members can read recordings and transcripts.
  - Editors can create a recording only when `recorderUid == authUid()` and `status == 'recording'`.
  - Only the recorder may update, and only `status` between recording and paused, `parts`, `durationMs` and `lastHeartbeatAt`.
  - Every other transition, every draft write, transcript writes and deletes go through the server.
  - Use the shorthands, and run `pnpm run check:rules-size`.
- **Storage:**
  - Members can read.
  - Editors can create segments under their own recording (also after it is finalized, for late uploads, MR-D8) when `contentType == 'audio/webm'` and the size is under 5 MB.
  - No client update or delete.

## Server

- `finalizePlcRecordingV1` (callable; only the recorder can call it):
  - concatenates each part's segments and sets `status: 'ready'`;
  - if the caller passes the AI access check, chains straight into queueing the transcription.
- `requestPlcMeetingNotesV1` (callable; any editor; runs `enforceAiFeatureAccess` and the quota check):
  - sets `status: 'queued'` and `requestedBy`;
  - takes a `mode` of `transcribe` or `regenerate`.
- A Firestore trigger on `status == 'queued'`:
  - makes the Gemini call (540 s timeout);
  - writes the transcript and the draft;
  - deletes the audio;
  - refunds the quota on failure.

  It is a trigger rather than the callable doing the work so a closed tab never cancels a run.

- `deletePlcRecordingAudioV1` (callable; any editor): early delete (MR-D11).
- Scheduled every 5 minutes: finalizes stale recordings and stops recordings paused for 30 minutes (MR-D6, MR-D8).
- Late segments (MR-D8): a Storage `onObjectFinalized` trigger on a finalized recording merges them back in or creates a Recovered audio recording.
- Daily sweep: deletes audio past `audioExpiresAt`. `gcPlcOrphans` also deletes a hard-deleted note's recordings and transcripts.
- New callables get a View-as guard and a `CALLABLE_MODES` row.

## Phases

Each phase is its own PR into `dev-paul`. UI phases get a mockup that Paul approves before merge.

1. **Recording** (`plc-meeting-recording`). This phase covers:
   - the type, parser and hook;
   - a chunked recorder hook (new, modelled on `useAudioRecording` but with a timeslice, pause and heartbeat);
   - Firestore and Storage rules, with tests;
   - the finalize callable, stale finalizer and 30-day sweep;
   - the toolbar button, live badge, player and download, and early delete;
   - the flag rows (`featureDefaults.ts`, `featureMissingDoc.ts`).
2. **AI meeting notes** (`plc-meeting-ai-notes`). This phase covers:
   - the request callable, queue trigger, Gemini prompt and JSON schema;
   - the quota and refund;
   - the Transcript section, draft preview (Insert, Replace, Regenerate, Dismiss) and action-item owner confirmation;
   - the terms-audit row.
3. **Connector tools** (MR-D21): `list_group_meetings`, `get_meeting_transcript`, `write_meeting_notes_draft`, following `CLAUDE_CONNECTOR.md` conventions.

## Open

- The concatenated WebM from a timesliced `MediaRecorder` has no duration header. Check that Chrome's `<audio>` seeks well enough, and fix up the header on the server if it doesn't.
- Whether Gemini output for a 60-minute meeting reliably fits the output-token limit for transcript plus notes in one call. If it doesn't, split into transcribe then summarize (two calls). The data model already supports that.

## Release

Both flags start admin-only, so "on for Paul" also means every other `/admins` member. Paul opens them in Admin Settings > Access > Previews > Meeting recording / AI meeting notes > Public after testing on prod. The changelog entry is written when a flag opens to everyone.
