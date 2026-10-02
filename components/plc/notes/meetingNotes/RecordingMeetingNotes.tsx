// The notes row under one recording: status, Generate or Retry, Review, and the Transcript (MR-D14, MR-D16, MR-D17, MR-D19).
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { PlcMember, PlcRecording } from '@/types';
import { usePlcMeetingNotes } from '@/hooks/usePlcMeetingNotes';
import {
  meetingNotesRequestMode,
  meetingNotesState,
  type MeetingNotesApplyMode,
} from '@/utils/plcMeetingNotes';
import { logError } from '@/utils/logError';
import { RecordingTranscript } from './RecordingTranscript';
import { MeetingNotesReviewModal } from './MeetingNotesReviewModal';

interface RecordingMeetingNotesProps {
  plcId: string;
  recording: PlcRecording;
  /** e.g. "Recording 1", shown as the review dialog's title. */
  label: string;
  members: PlcMember[];
  canEdit: boolean;
  /** `canAccessFeature('plc-meeting-ai-notes')`; the server re-checks. */
  aiEnabled: boolean;
  /** Writes the draft into the note through its normal save path. */
  onApply: (
    recording: PlcRecording,
    mode: MeetingNotesApplyMode,
    owners: Record<string, string | null>
  ) => Promise<void>;
}

const outline =
  'px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xxs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors';

export const RecordingMeetingNotes: React.FC<RecordingMeetingNotesProps> = ({
  plcId,
  recording,
  label,
  members,
  canEdit,
  aiEnabled,
  onApply,
}) => {
  const { t } = useTranslation();
  const { requestNotes, resolveDraft, loadTranscript } =
    usePlcMeetingNotes(plcId);
  const [now, setNow] = useState(() => Date.now());
  const [reviewing, setReviewing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const working =
    recording.status === 'queued' || recording.status === 'transcribing';
  // Re-evaluate a running job once a minute so a stuck one turns into Retry.
  useEffect(() => {
    if (!working) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [working]);

  const state = meetingNotesState(recording, now);
  const canRequest = canEdit && aiEnabled;

  const request = async () => {
    setRequesting(true);
    setRequestError(null);
    try {
      await requestNotes(recording.id, meetingNotesRequestMode(recording));
      setNow(Date.now());
    } catch (err) {
      logError('RecordingMeetingNotes.request', err, {
        plcId,
        recordingId: recording.id,
      });
      setRequestError(
        err instanceof Error && err.message
          ? err.message
          : t('plcDashboard.notes.meetingNotes.actionFailed', {
              defaultValue: 'That didn’t work. Try again.',
            })
      );
    } finally {
      setRequesting(false);
    }
  };

  const draft = recording.draft;

  const apply = async (
    mode: MeetingNotesApplyMode,
    owners: Record<string, string | null>
  ) => {
    if (!draft) return;
    // Claim the draft first so two editors can't insert it twice; give it back if the write fails.
    await resolveDraft(recording.id, draft.generatedAt, 'inserted');
    try {
      await onApply(recording, mode, owners);
    } catch (err) {
      await resolveDraft(recording.id, draft.generatedAt, 'reopen').catch(
        () => undefined
      );
      throw err;
    }
  };

  let status: React.ReactNode = null;
  let action: React.ReactNode = null;
  if (state === 'working') {
    status = (
      <span className="inline-flex items-center gap-1.5 text-xxs text-slate-500">
        <Loader2 className="w-3 h-3 animate-spin" />
        {t('plcDashboard.notes.meetingNotes.working', {
          defaultValue: 'Making notes',
        })}
      </span>
    );
  } else if (state === 'ready' && canEdit) {
    status = (
      <span className="text-xxs font-bold text-brand-blue-primary">
        {t('plcDashboard.notes.meetingNotes.ready', {
          defaultValue: 'Notes ready',
        })}
      </span>
    );
    action = (
      <button
        type="button"
        onClick={() => setReviewing(true)}
        className="px-2.5 py-1 rounded-lg bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-xxs font-bold transition-colors"
      >
        {t('plcDashboard.notes.meetingNotes.review', {
          defaultValue: 'Review',
        })}
      </button>
    );
  } else if (state === 'failed') {
    status = (
      <span className="text-xxs font-bold text-brand-red-primary">
        {t('plcDashboard.notes.meetingNotes.failed', {
          defaultValue: "Couldn't make notes",
        })}
      </span>
    );
    if (canRequest) {
      action = (
        <button
          type="button"
          disabled={requesting}
          onClick={() => void request()}
          className={outline}
        >
          {t('plcDashboard.notes.meetingNotes.retry', {
            defaultValue: 'Retry',
          })}
        </button>
      );
    }
  } else if (state === 'generate' && canRequest) {
    action = (
      <button
        type="button"
        disabled={requesting}
        onClick={() => void request()}
        className={outline}
      >
        {t('plcDashboard.notes.meetingNotes.generate', {
          defaultValue: 'Generate notes',
        })}
      </button>
    );
  }

  if (
    status === null &&
    action === null &&
    !recording.hasTranscript &&
    !requestError
  ) {
    return null;
  }

  return (
    <div className="mt-2">
      {status !== null || action !== null ? (
        <div className="flex items-center gap-2">
          {status}
          {action}
        </div>
      ) : null}
      {requestError && (
        <p role="alert" className="mt-1 text-xxs text-brand-red-primary">
          {requestError}
        </p>
      )}
      {recording.hasTranscript && (
        <RecordingTranscript
          recordingId={recording.id}
          loadTranscript={loadTranscript}
        />
      )}
      {reviewing && draft && (
        <MeetingNotesReviewModal
          title={label}
          draft={draft}
          members={members}
          canRegenerate={canRequest}
          onApply={apply}
          onRegenerate={() => requestNotes(recording.id, 'regenerate')}
          onDismiss={() =>
            resolveDraft(recording.id, draft.generatedAt, 'dismissed')
          }
          onClose={() => setReviewing(false)}
        />
      )}
    </div>
  );
};
