// Applying a drafted set of meeting notes to a note (docs/plans/PLC_MEETING_RECORDING.md, MR-D18, MR-D19).
import type { PlcActionItem, PlcRecording, PlcRecordingDraft } from '@/types';
import { MAX_ACTION_ITEMS, newActionItem } from '@/utils/plcActionItems';
import { STALE_NOTES_JOB_MS } from '@/utils/plcRecording';

export type MeetingNotesApplyMode = 'insert' | 'replace';

/** The body after Insert (appended under what is there) or Replace. */
export function applyDraftToBody(
  body: string,
  draftMarkdown: string,
  mode: MeetingNotesApplyMode
): string {
  const draft = draftMarkdown.trim();
  if (mode === 'replace') return draft;
  const existing = body.replace(/\s+$/, '');
  if (!existing) return draft;
  return draft ? `${existing}\n\n${draft}` : existing;
}

/** Drafted action items become real ones with the owners an editor confirmed; existing items are always kept. */
export function applyDraftToActionItems(
  existing: readonly PlcActionItem[],
  draft: PlcRecordingDraft,
  owners: Readonly<Record<string, string | null>>,
  createdBy: string,
  now: number
): PlcActionItem[] {
  const added = draft.actionItems
    .filter((i) => i.text.trim())
    .map((i) =>
      newActionItem(i.text.trim(), createdBy, now, {
        assigneeUid:
          i.id in owners ? owners[i.id] : (i.suggestedOwnerUid ?? null),
      })
    );
  return [...existing, ...added].slice(0, MAX_ACTION_ITEMS);
}

export type MeetingNotesState =
  | 'none'
  | 'generate'
  | 'working'
  | 'ready'
  | 'failed'
  | 'resolved';

/** What the notes row shows for one recording. */
export function meetingNotesState(
  r: PlcRecording,
  now: number
): MeetingNotesState {
  if (r.status === 'queued' || r.status === 'transcribing') {
    return now - (r.jobUpdatedAt ?? 0) > STALE_NOTES_JOB_MS
      ? 'failed'
      : 'working';
  }
  if (r.status === 'failed') {
    return r.hasTranscript || !r.audioDeletedAt ? 'failed' : 'none';
  }
  if (r.draft && !r.draftResolvedAt) return 'ready';
  if (r.draft) return 'resolved';
  if (r.status === 'ready' && !r.audioDeletedAt) return 'generate';
  return 'none';
}

/** Which callable mode a Generate, Retry or Regenerate press asks for. */
export const meetingNotesRequestMode = (
  r: Pick<PlcRecording, 'hasTranscript'>
): 'transcribe' | 'regenerate' =>
  r.hasTranscript ? 'regenerate' : 'transcribe';

/** mm:ss or h:mm:ss for a transcript timestamp. */
export function formatTranscriptTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
