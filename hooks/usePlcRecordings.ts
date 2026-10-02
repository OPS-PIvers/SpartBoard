import { useCallback, useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { PlcRecording } from '@/types';
import { logError } from '@/utils/logError';
import {
  PLC_RECORDINGS_SUBCOLLECTION,
  parsePlcRecording,
} from '@/utils/plcRecording';

interface UsePlcRecordingsResult {
  recordings: PlcRecording[];
  loading: boolean;
  deleteAudio: (recordingId: string) => Promise<void>;
}

/** Live list of a group's meeting recordings; pass `null` to skip the listener. */
export const usePlcRecordings = (
  plcId: string | null
): UsePlcRecordingsResult => {
  const { user } = useAuth();
  const [recordings, setRecordings] = useState<PlcRecording[]>([]);
  const [loading, setLoading] = useState(true);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setRecordings([]);
    setLoading(true);
  }

  useEffect(() => {
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setRecordings([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const unsub = onSnapshot(
      collection(db, 'plcs', plcId, PLC_RECORDINGS_SUBCOLLECTION),
      (snap) => {
        const list: PlcRecording[] = [];
        snap.forEach((d) => {
          const parsed = parsePlcRecording(d.id, d.data());
          if (parsed) list.push(parsed);
        });
        setRecordings(list);
        setLoading(false);
      },
      (err) => {
        logError('usePlcRecordings.snapshot', err, { plcId });
        setLoading(false);
      }
    );
    return () => unsub();
  }, [plcId, user]);

  const deleteAudio = useCallback(
    async (recordingId: string) => {
      if (!plcId) return;
      const call = httpsCallable<{ plcId: string; recordingId: string }>(
        functions,
        'deletePlcRecordingAudioV1'
      );
      await call({ plcId, recordingId });
    },
    [plcId]
  );

  return { recordings, loading, deleteAudio };
};
