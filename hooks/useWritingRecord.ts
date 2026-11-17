import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { WritingRecordChunk } from '@/utils/writingRecord';
import { logError } from '@/utils/logError';

export type WritingRecordLoad =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; chunks: WritingRecordChunk[] };

/** One piece's edit log chunks, read once when opened; `version` reads them again. */
export function useWritingRecordChunks(
  sessionId: string,
  studentUid: string,
  version = 0
): WritingRecordLoad {
  const key = `${sessionId}/${studentUid}/${version}`;
  const [state, setState] = useState<{
    key: string;
    load: WritingRecordLoad;
  }>({ key, load: { kind: 'loading' } });
  if (state.key !== key) setState({ key, load: { kind: 'loading' } });

  useEffect(() => {
    let live = true;
    getDocs(
      collection(
        db,
        'writing_assignment_sessions',
        sessionId,
        'responses',
        studentUid,
        'log'
      )
    )
      .then((snap) => {
        if (!live) return;
        const chunks = snap.docs.flatMap((d) => {
          const index = Number(d.id);
          const log: unknown = d.get('log');
          return Number.isInteger(index) && typeof log === 'string'
            ? [{ index, log }]
            : [];
        });
        setState({ key, load: { kind: 'ready', chunks } });
      })
      .catch((err: unknown) => {
        logError('useWritingRecordChunks', err);
        if (live) setState({ key, load: { kind: 'error' } });
      });
    return () => {
      live = false;
    };
  }, [key, sessionId, studentUid]);

  return state.key === key ? state.load : { kind: 'loading' };
}
