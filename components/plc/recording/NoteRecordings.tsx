import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PlcMember, PlcRecording } from '@/types';
import { useDialog } from '@/context/useDialog';
import { useDashboard } from '@/context/useDashboard';
import { logError } from '@/utils/logError';
import {
  isPlcRecordingLive,
  plcRecordingHasAudio,
  plcRecordingPartPath,
} from '@/utils/plcRecording';
import { RecordingPlayer } from './RecordingPlayer';
import { formatRecordingClock } from './recordingTime';

interface NoteRecordingsProps {
  plcId: string;
  noteTitle: string;
  recordings: PlcRecording[];
  members: PlcMember[];
  canEdit: boolean;
  onDeleteAudio: (recordingId: string) => Promise<void>;
  /** Extra content under each recording, such as its drafted notes. */
  renderExtra?: (recording: PlcRecording) => React.ReactNode;
}

const formatDay = (ms: number): string =>
  ms
    ? new Date(ms).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : '';

/** Playable recordings on a note, oldest first (MR-D10, MR-D11). */
export const NoteRecordings: React.FC<NoteRecordingsProps> = ({
  plcId,
  noteTitle,
  recordings,
  members,
  canEdit,
  onDeleteAudio,
  renderExtra,
}) => {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  const { addToast } = useDashboard();

  // Rows without audio stay listed only when something else renders under them.
  const shown = recordings.filter(
    (r) =>
      !isPlcRecordingLive(r) &&
      r.status !== 'finalizing' &&
      (renderExtra ? true : plcRecordingHasAudio(r) && r.parts.length > 0)
  );
  if (shown.length === 0) return null;

  const nameFor = (uid: string) => {
    const name = members.find((m) => m.uid === uid)?.displayName.trim();
    if (name) return name;
    return t('plcDashboard.notes.recording.someone', {
      defaultValue: 'A member',
    });
  };

  const metaFor = (r: PlcRecording) => {
    const bits = [nameFor(r.recorderUid), formatDay(r.createdAt)];
    if (r.recoveredFrom) {
      bits.push(
        t('plcDashboard.notes.recording.recovered', {
          defaultValue: 'Recovered audio',
        })
      );
    } else if (r.interruptedAtMs != null) {
      bits.push(
        t('plcDashboard.notes.recording.interrupted', {
          defaultValue: 'Interrupted',
        })
      );
    }
    return bits.filter(Boolean).join(' · ');
  };

  const handleDelete = async (r: PlcRecording) => {
    const confirmed = await showConfirm(
      t('plcDashboard.notes.recording.confirmDelete', {
        defaultValue: "{{length}} · {{meta}}. This can't be undone.",
        length: formatRecordingClock(r.durationMs),
        meta: metaFor(r),
      }),
      {
        title: t('plcDashboard.notes.recording.confirmDeleteTitle', {
          defaultValue: 'Delete this recording?',
        }),
        variant: 'danger',
        confirmLabel: t('common.delete', { defaultValue: 'Delete' }),
      }
    );
    if (!confirmed) return;
    try {
      await onDeleteAudio(r.id);
    } catch (err) {
      logError('NoteRecordings.delete', err, { plcId, recordingId: r.id });
      addToast(
        t('plcDashboard.notes.recording.deleteFailed', {
          defaultValue: "Couldn't delete the recording",
        }),
        'error'
      );
    }
  };

  return (
    <div className="shrink-0 max-h-[30%] overflow-y-auto custom-scrollbar px-4 py-3 border-t border-slate-100">
      <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500 mb-1">
        {t('plcDashboard.notes.recording.heading', {
          defaultValue: 'Recordings',
        })}
      </h4>
      {shown.map((r) => (
        <div key={r.id}>
          {plcRecordingHasAudio(r) && r.parts.length > 0 ? (
            <RecordingPlayer
              parts={r.parts.map((p, i) => ({
                path: plcRecordingPartPath(plcId, r.id, i),
                durationMs: p.durationMs,
              }))}
              meta={metaFor(r)}
              downloadName={`${noteTitle || 'Meeting'} ${formatDay(r.createdAt)}`}
              onDelete={
                canEdit && r.status !== 'transcribing'
                  ? () => void handleDelete(r)
                  : undefined
              }
            />
          ) : (
            <div className="py-1 text-xxs text-slate-500">
              {formatRecordingClock(r.durationMs)} · {metaFor(r)}
            </div>
          )}
          {renderExtra?.(r)}
        </div>
      ))}
    </div>
  );
};
