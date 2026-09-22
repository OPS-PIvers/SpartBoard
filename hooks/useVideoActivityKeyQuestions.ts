import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { normalizeVideoActivityQuestions } from '@/utils/videoActivityNormalize';
import {
  hasEmbeddedAnswerKey,
  VA_KEY_DOC_ID,
  VA_KEY_SUBCOLLECTION,
  type VideoActivitySessionKeyDoc,
} from '@/utils/videoActivityPublicQuestions';
import type { VideoActivityQuestion, VideoActivitySession } from '@/types';

const NO_QUESTIONS: VideoActivityQuestion[] = [];

interface KeyState {
  sessionId: string;
  source: string;
  questions: VideoActivityQuestion[];
}

/** Keyed questions for grading: embedded on legacy docs, else the teacher-only key doc. */
export function useVideoActivityKeyQuestions(
  session: Pick<VideoActivitySession, 'id' | 'questions' | 'publicQuestions'>
): { questions: VideoActivityQuestion[]; loading: boolean } {
  const embedded = hasEmbeddedAnswerKey(session.questions);
  const needsFetch = !embedded && !!session.publicQuestions;
  // Content, not identity: every session snapshot hands us a new array.
  const source = needsFetch ? JSON.stringify(session.publicQuestions) : '';
  const [loaded, setLoaded] = useState<KeyState | null>(null);

  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    void getDoc(
      doc(
        db,
        'video_activity_sessions',
        session.id,
        VA_KEY_SUBCOLLECTION,
        VA_KEY_DOC_ID
      )
    )
      .then((snap) => {
        const data = snap.data() as VideoActivitySessionKeyDoc | undefined;
        return normalizeVideoActivityQuestions(data?.questions);
      })
      .catch((err: unknown) => {
        logError('useVideoActivityKeyQuestions', err, {
          sessionId: session.id,
        });
        return [] as VideoActivityQuestion[];
      })
      .then((questions) => {
        if (!cancelled) setLoaded({ sessionId: session.id, source, questions });
      });
    return () => {
      cancelled = true;
    };
  }, [needsFetch, session.id, source]);

  if (!needsFetch) return { questions: session.questions, loading: false };
  const fresh = loaded?.sessionId === session.id && loaded.source === source;
  return fresh
    ? { questions: loaded.questions, loading: false }
    : { questions: NO_QUESTIONS, loading: true };
}
