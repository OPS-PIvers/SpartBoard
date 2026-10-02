import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, functions, storage } from '@/config/firebase';
import type { PlcRecordingPart, PlcRecordingStatus } from '@/types';
import {
  PLC_RECORDINGS_SUBCOLLECTION,
  PLC_RECORDING_CONTENT_TYPE,
} from '@/utils/plcRecording';

export interface RecordingPatch {
  status?: Extract<PlcRecordingStatus, 'recording' | 'paused'>;
  parts?: PlcRecordingPart[];
  durationMs?: number;
  heartbeat?: boolean;
}

/** Everything the recorder hook touches outside the browser; injected in tests. */
export interface MeetingRecordingBackend {
  createRecording: (input: {
    plcId: string;
    noteId: string;
    recorderUid: string;
  }) => Promise<string>;
  updateRecording: (
    plcId: string,
    recordingId: string,
    patch: RecordingPatch
  ) => Promise<void>;
  uploadSegment: (path: string, blob: Blob) => Promise<void>;
  finalize: (plcId: string, recordingId: string) => Promise<void>;
}

export const firebaseMeetingRecordingBackend: MeetingRecordingBackend = {
  createRecording: async ({ plcId, noteId, recorderUid }) => {
    const created = await addDoc(
      collection(db, 'plcs', plcId, PLC_RECORDINGS_SUBCOLLECTION),
      {
        noteId,
        recorderUid,
        status: 'recording',
        parts: [],
        durationMs: 0,
        lastHeartbeatAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }
    );
    return created.id;
  },
  updateRecording: async (plcId, recordingId, patch) => {
    const { heartbeat, ...fields } = patch;
    await updateDoc(
      doc(db, 'plcs', plcId, PLC_RECORDINGS_SUBCOLLECTION, recordingId),
      {
        ...fields,
        ...(heartbeat ? { lastHeartbeatAt: serverTimestamp() } : {}),
      }
    );
  },
  uploadSegment: async (path, blob) => {
    await uploadBytes(ref(storage, path), blob, {
      contentType: PLC_RECORDING_CONTENT_TYPE,
    });
  },
  finalize: async (plcId, recordingId) => {
    const callable = httpsCallable<
      { plcId: string; recordingId: string },
      { status: PlcRecordingStatus }
    >(functions, 'finalizePlcRecordingV1');
    await callable({ plcId, recordingId });
  },
};
