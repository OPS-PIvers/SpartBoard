import type {
  PlcRecording,
  PlcRecordingAudioDeletedReason,
  PlcRecordingDraft,
  PlcRecordingDraftActionItem,
  PlcRecordingPart,
  PlcRecordingStatus,
  PlcRecordingTranscript,
  PlcTranscriptSegment,
} from '@/types';
import { tsToMillis } from '@/utils/plc';

// Limits from docs/plans/PLC_MEETING_RECORDING.md; firestore.rules and storage.rules pin the same numbers.
export const PLC_RECORDINGS_SUBCOLLECTION = 'recordings';
export const PLC_TRANSCRIPT_SUBCOLLECTION = 'transcript';
export const PLC_TRANSCRIPT_DOC_ID = 'main';
export const PLC_MEETING_AUDIO_PREFIX = 'plc_meeting_audio';
export const PLC_RECORDING_MAX_MS = 60 * 60 * 1000;
export const PLC_RECORDING_WARN_MS = 55 * 60 * 1000;
export const PLC_RECORDING_TIMESLICE_MS = 30 * 1000;
export const PLC_RECORDING_HEARTBEAT_MS = 30 * 1000;
export const PLC_RECORDING_STALE_MS = 5 * 60 * 1000;
export const PLC_RECORDING_PAUSE_LIMIT_MS = 30 * 60 * 1000;
export const PLC_RECORDING_AUDIO_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PLC_RECORDING_SEGMENT_MAX_BYTES = 5 * 1024 * 1024;
export const PLC_RECORDING_MAX_PARTS = 200;
export const PLC_RECORDING_MIME = 'audio/webm;codecs=opus';
export const PLC_RECORDING_CONTENT_TYPE = 'audio/webm';

const STATUSES: ReadonlySet<PlcRecordingStatus> = new Set<PlcRecordingStatus>([
  'recording',
  'paused',
  'finalizing',
  'ready',
  'queued',
  'transcribing',
  'transcribed',
  'failed',
]);

const DELETED_REASONS: ReadonlySet<PlcRecordingAudioDeletedReason> =
  new Set<PlcRecordingAudioDeletedReason>(['manual', 'expired', 'transcribed']);

const LIVE_STATUSES: ReadonlySet<PlcRecordingStatus> = new Set([
  'recording',
  'paused',
]);

/** True while someone is still recording (or paused) on the note (MR-D3). */
export const isPlcRecordingLive = (r: Pick<PlcRecording, 'status'>): boolean =>
  LIVE_STATUSES.has(r.status);

/** True while the audio files still exist in Storage (MR-D9, MR-D10). */
export const plcRecordingHasAudio = (
  r: Pick<PlcRecording, 'audioDeletedAt'>
): boolean => !r.audioDeletedAt;

/** Storage folder holding one recording's audio. */
export const plcRecordingAudioDir = (plcId: string, recordingId: string) =>
  `${PLC_MEETING_AUDIO_PREFIX}/${plcId}/${recordingId}`;

/** A live 30-second segment, before finalizing concatenates its part. */
export const plcRecordingSegmentPath = (
  plcId: string,
  recordingId: string,
  partIndex: number,
  segmentIndex: number
) =>
  `${plcRecordingAudioDir(plcId, recordingId)}/${partIndex}/${segmentIndex}.webm`;

/** One finalized part, the file players and Gemini read. */
export const plcRecordingPartPath = (
  plcId: string,
  recordingId: string,
  partIndex: number
) => `${plcRecordingAudioDir(plcId, recordingId)}/${partIndex}.webm`;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const nonNegInt = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;

const optionalMillis = (v: unknown): number | null =>
  v == null ? null : tsToMillis(v) || null;

const optionalString = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : null;

function parsePart(raw: unknown): PlcRecordingPart | null {
  if (!isRecord(raw)) return null;
  return {
    segmentCount: nonNegInt(raw.segmentCount),
    durationMs: nonNegInt(raw.durationMs),
  };
}

function parseDraftActionItem(
  raw: unknown
): PlcRecordingDraftActionItem | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.text !== 'string') return null;
  if (raw.text.trim() === '') return null;
  return {
    id: raw.id,
    text: raw.text,
    suggestedOwnerUid: optionalString(raw.suggestedOwnerUid),
  };
}

function parseDraft(raw: unknown): PlcRecordingDraft | null {
  if (!isRecord(raw) || typeof raw.markdown !== 'string') return null;
  const items = Array.isArray(raw.actionItems) ? raw.actionItems : [];
  return {
    markdown: raw.markdown,
    actionItems: items
      .map(parseDraftActionItem)
      .filter((i): i is PlcRecordingDraftActionItem => i !== null),
    generatedAt: tsToMillis(raw.generatedAt),
    generatedBy: typeof raw.generatedBy === 'string' ? raw.generatedBy : '',
  };
}

/** Parse a recordings doc, or `null` when an identifying field is missing. */
export function parsePlcRecording(
  id: string,
  data: unknown
): PlcRecording | null {
  if (!isRecord(data)) return null;
  if (typeof data.noteId !== 'string' || data.noteId === '') return null;
  if (typeof data.recorderUid !== 'string' || data.recorderUid === '') {
    return null;
  }
  const status = STATUSES.has(data.status as PlcRecordingStatus)
    ? (data.status as PlcRecordingStatus)
    : 'failed';
  const parts = (Array.isArray(data.parts) ? data.parts : [])
    .map(parsePart)
    .filter((p): p is PlcRecordingPart => p !== null);
  const createdAt = tsToMillis(data.createdAt);
  const durationMs =
    typeof data.durationMs === 'number'
      ? nonNegInt(data.durationMs)
      : parts.reduce((sum, p) => sum + p.durationMs, 0);
  return {
    id,
    noteId: data.noteId,
    recorderUid: data.recorderUid,
    recoveredFrom: optionalString(data.recoveredFrom),
    status,
    parts,
    durationMs,
    lastHeartbeatAt: tsToMillis(data.lastHeartbeatAt),
    interruptedAtMs:
      typeof data.interruptedAtMs === 'number'
        ? nonNegInt(data.interruptedAtMs)
        : null,
    finalizedAt: optionalMillis(data.finalizedAt),
    audioDeletedAt: optionalMillis(data.audioDeletedAt),
    audioDeletedReason: DELETED_REASONS.has(
      data.audioDeletedReason as PlcRecordingAudioDeletedReason
    )
      ? (data.audioDeletedReason as PlcRecordingAudioDeletedReason)
      : null,
    audioExpiresAt: optionalMillis(data.audioExpiresAt),
    mergedSegments:
      typeof data.mergedSegments === 'number'
        ? nonNegInt(data.mergedSegments)
        : null,
    recoveredInto: optionalString(data.recoveredInto),
    error: optionalString(data.error),
    requestedBy: optionalString(data.requestedBy),
    draft: parseDraft(data.draft),
    draftResolvedAt: optionalMillis(data.draftResolvedAt),
    createdAt,
  };
}

function parseSegment(raw: unknown): PlcTranscriptSegment | null {
  if (!isRecord(raw) || typeof raw.text !== 'string') return null;
  const speaker =
    typeof raw.speaker === 'number' && raw.speaker >= 1
      ? Math.floor(raw.speaker)
      : 1;
  return { speaker, startMs: nonNegInt(raw.startMs), text: raw.text };
}

/** Parse `transcript/main`; malformed segments are dropped, not fatal. */
export function parsePlcRecordingTranscript(
  data: unknown
): PlcRecordingTranscript {
  const raw =
    isRecord(data) && Array.isArray(data.segments) ? data.segments : [];
  return {
    segments: raw
      .map(parseSegment)
      .filter((s): s is PlcTranscriptSegment => s !== null),
  };
}

/** Recordings on one note, oldest first, so each keeps its place in the note (MR-D12). */
export const plcRecordingsForNote = (
  recordings: readonly PlcRecording[],
  noteId: string
): PlcRecording[] =>
  recordings
    .filter((r) => r.noteId === noteId)
    .sort((a, b) => a.createdAt - b.createdAt);

/** The note's in-progress recording, if any; only one may run at a time (MR-D3). */
export const livePlcRecordingForNote = (
  recordings: readonly PlcRecording[],
  noteId: string
): PlcRecording | null =>
  recordings.find((r) => r.noteId === noteId && isPlcRecordingLive(r)) ?? null;

/** True while a drafted set of notes waits for an editor (MR-D19 "Notes ready"). */
export const plcRecordingDraftPending = (r: PlcRecording): boolean =>
  !!r.draft && !r.draftResolvedAt;
