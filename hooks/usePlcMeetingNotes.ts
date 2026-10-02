// Callables and the lazy transcript read for PLC meeting notes (docs/plans/PLC_MEETING_RECORDING.md, phase 2).
import { useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import type { PlcRecordingTranscript } from '@/types';
import {
  PLC_RECORDINGS_SUBCOLLECTION,
  PLC_TRANSCRIPT_DOC_ID,
  PLC_TRANSCRIPT_SUBCOLLECTION,
  parsePlcRecordingTranscript,
} from '@/utils/plcRecording';

export type MeetingNotesRequestMode = 'transcribe' | 'regenerate';
export type MeetingNotesResolveAction = 'inserted' | 'dismissed' | 'reopen';

export function usePlcMeetingNotes(plcId: string) {
  const requestNotes = useCallback(
    async (recordingId: string, mode: MeetingNotesRequestMode) => {
      const call = httpsCallable<
        { plcId: string; recordingId: string; mode: MeetingNotesRequestMode },
        { status: 'queued' }
      >(functions, 'requestPlcMeetingNotesV1');
      await call({ plcId, recordingId, mode });
    },
    [plcId]
  );

  const resolveDraft = useCallback(
    async (
      recordingId: string,
      generatedAt: number,
      action: MeetingNotesResolveAction
    ) => {
      const call = httpsCallable<
        {
          plcId: string;
          recordingId: string;
          generatedAt: number;
          action: MeetingNotesResolveAction;
        },
        { ok: true }
      >(functions, 'resolvePlcMeetingNotesDraftV1');
      await call({ plcId, recordingId, generatedAt, action });
    },
    [plcId]
  );

  const loadTranscript = useCallback(
    async (recordingId: string): Promise<PlcRecordingTranscript> => {
      const snap = await getDoc(
        doc(
          db,
          'plcs',
          plcId,
          PLC_RECORDINGS_SUBCOLLECTION,
          recordingId,
          PLC_TRANSCRIPT_SUBCOLLECTION,
          PLC_TRANSCRIPT_DOC_ID
        )
      );
      return parsePlcRecordingTranscript(snap.data());
    },
    [plcId]
  );

  return { requestNotes, resolveDraft, loadTranscript };
}
