import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlcMember, PlcRecording } from '@/types';
import type {
  MeetingRecorderError,
  UseMeetingRecorderResult,
} from '@/hooks/useMeetingRecorder';
import { PLC_RECORDING_HEARTBEAT_MS } from '@/utils/plcRecording';
import { RecordControl, type RecordControlLive } from './RecordControl';

interface NoteRecordControlProps {
  recorder: UseMeetingRecorderResult;
  /** Note the local recorder is attached to, if it is running. */
  recorderNoteId: string | null;
  noteId: string;
  /** The note's live recording from Firestore, whoever is making it. */
  live: PlcRecording | null;
  members: PlcMember[];
  /** Viewers see the badge only. */
  canRecord: boolean;
  onStart: () => void;
}

const ACTIVE_PHASES = new Set(['starting', 'recording', 'paused', 'stopping']);

// A teammate's clock runs on from the last heartbeat, capped so a dropped recorder doesn't count up forever.
const estimateElapsed = (r: PlcRecording, now: number): number => {
  if (r.status !== 'recording' || !r.lastHeartbeatAt) return r.durationMs;
  const since = Math.min(
    Math.max(0, now - r.lastHeartbeatAt),
    PLC_RECORDING_HEARTBEAT_MS * 2
  );
  return r.durationMs + since;
};

/** Record control for one note, joining the local recorder with the shared recording doc. */
export const NoteRecordControl: React.FC<NoteRecordControlProps> = ({
  recorder,
  recorderNoteId,
  noteId,
  live,
  members,
  canRecord,
  onStart,
}) => {
  const { t } = useTranslation();
  const localActive = ACTIVE_PHASES.has(recorder.phase);
  const mineHere = localActive && recorderNoteId === noteId;
  const otherLive = live && !(mineHere && live.id === recorder.recordingId);
  const [now, setNow] = useState(() => Date.now());

  const ticking = !!otherLive && live.status === 'recording';
  useEffect(() => {
    if (!ticking) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  const errorText = (error: MeetingRecorderError | null): string | null => {
    switch (error) {
      case 'mic-denied':
        return t('plcDashboard.notes.recording.micDenied', {
          defaultValue: 'Microphone blocked',
        });
      case 'start-failed':
        return t('plcDashboard.notes.recording.startFailed', {
          defaultValue: "Couldn't start recording",
        });
      case 'mic-lost':
        return t('plcDashboard.notes.recording.micLost', {
          defaultValue: 'Microphone lost',
        });
      case 'finalize-failed':
        return t('plcDashboard.notes.recording.finalizeFailed', {
          defaultValue: "Couldn't save the recording",
        });
      default:
        return null;
    }
  };

  const notice = mineHere
    ? recorder.micFallback
      ? t('plcDashboard.notes.recording.micFallback', {
          defaultValue: 'Microphone disconnected. Using the default mic.',
        })
      : errorText(recorder.error)
    : recorderNoteId === noteId
      ? errorText(recorder.error)
      : null;

  const nameFor = (uid: string) => {
    const name = members.find((m) => m.uid === uid)?.displayName.trim();
    if (name) return name;
    return t('plcDashboard.notes.recording.someone', {
      defaultValue: 'A member',
    });
  };

  const self: RecordControlLive | undefined =
    mineHere && recorder.phase !== 'starting'
      ? { paused: recorder.phase === 'paused', elapsedMs: recorder.elapsedMs }
      : undefined;
  const other: RecordControlLive | undefined = otherLive
    ? {
        paused: live.status === 'paused',
        elapsedMs: estimateElapsed(live, now),
        recorderName: nameFor(live.recorderUid),
      }
    : undefined;

  if (!canRecord) {
    if (!other) return null;
    return (
      <RecordControl
        other={other}
        supported
        busy
        hideRecord
        devices={[]}
        deviceId={null}
        onSelectDevice={() => undefined}
        onStart={() => undefined}
        onPause={() => undefined}
        onResume={() => undefined}
        onStop={() => undefined}
      />
    );
  }

  return (
    <RecordControl
      self={self}
      other={other}
      supported={recorder.isSupported}
      busy={
        recorder.phase === 'starting' ||
        recorder.phase === 'stopping' ||
        (localActive && !mineHere)
      }
      notice={notice}
      devices={recorder.mics}
      deviceId={recorder.selectedMicId}
      onSelectDevice={(id) => void recorder.selectMic(id)}
      onStart={() => {
        recorder.dismissMicFallback();
        onStart();
      }}
      onPause={() => void recorder.pause()}
      onResume={() => void recorder.resume()}
      onStop={() => void recorder.stop()}
    />
  );
};
