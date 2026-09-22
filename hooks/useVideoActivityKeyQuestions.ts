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
  failed: boolean;
}

export interface VideoActivityKeyQuestions {
  questions: VideoActivityQuestion[];
  loading: boolean;
  /** The key doc was missing or unreadable, as opposed to an activity with no questions. */
  failed: boolean;
}

/** Keyed questions for grading: embedded on legacy docs, else the teacher-only key doc. */
export function useVideoActivityKeyQuestions(
  session: Pick<VideoActivitySession, 'id' | 'questions' | 'publicQuestions'>
): VideoActivityKeyQuestions {
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
        if (!snap.exists()) throw new Error('Answer key doc is missing');
        const data = snap.data() as VideoActivitySessionKeyDoc;
        return {
          questions: normalizeVideoActivityQuestions(data.questions),
          failed: false,
        };
      })
      .catch((err: unknown) => {
        logError('useVideoActivityKeyQuestions', err, {
          sessionId: session.id,
        });
        return { questions: NO_QUESTIONS, failed: true };
      })
      .then((result) => {
        if (!cancelled) setLoaded({ sessionId: session.id, source, ...result });
      });
    return () => {
      cancelled = true;
    };
  }, [needsFetch, session.id, source]);

  if (!needsFetch)
    return { questions: session.questions, loading: false, failed: false };
  const fresh = loaded?.sessionId === session.id && loaded.source === source;
  return fresh
    ? { questions: loaded.questions, loading: false, failed: loaded.failed }
    : { questions: NO_QUESTIONS, loading: true, failed: false };
}
