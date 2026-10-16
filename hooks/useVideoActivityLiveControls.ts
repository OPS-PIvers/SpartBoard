import { useMemo } from 'react';
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { livePacingPatch, type VaLiveEvent } from '@/utils/videoActivityState';

const SESSIONS_COLLECTION = 'video_activity_sessions';

export interface VideoActivityLiveControls {
  start: () => Promise<void>;
  openQuestion: (questionId: string, playheadSeconds: number) => Promise<void>;
  resume: (playheadSeconds: number) => Promise<void>;
  showResults: (shown: boolean) => Promise<void>;
  /** Writes the key for students to see while revealed, and clears it on hide. */
  revealAnswer: (
    revealed: boolean,
    correctAnswer?: string | null
  ) => Promise<void>;
  skip: (questionIds: string[], playheadSeconds: number) => Promise<void>;
  /** Closes any open question and ends the session; the caller runs the assignment finalize path. */
  end: (playheadSeconds: number) => Promise<void>;
}

/** Board pacing writes for a teacher-paced session: small single-doc updates (plan §5.2). */
export function useVideoActivityLiveControls(
  sessionId: string | null | undefined
): VideoActivityLiveControls {
  return useMemo(() => {
    const write = async (event: VaLiveEvent): Promise<void> => {
      if (!sessionId) return;
      const data = livePacingPatch(event, Date.now(), {
        arrayUnion,
        arrayRemove,
      });
      if (!data) return;
      await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), data);
    };

    return {
      start: () => write({ type: 'start' }),
      openQuestion: (questionId, playheadSeconds) =>
        write({ type: 'open', questionId, playheadSeconds }),
      resume: (playheadSeconds) => write({ type: 'resume', playheadSeconds }),
      showResults: (shown) => write({ type: 'showResults', shown }),
      revealAnswer: (revealed, correctAnswer = null) =>
        write({ type: 'reveal', revealed, correctAnswer }),
      skip: (questionIds, playheadSeconds) =>
        write({ type: 'skip', questionIds, playheadSeconds }),
      end: (playheadSeconds) => write({ type: 'end', playheadSeconds }),
    };
  }, [sessionId]);
}
