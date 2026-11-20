import { useState } from 'react';
import type { QuizData, QuizSession } from '@/types';

// The quiz a live session grades and reveals against: the loaded quiz when it is the session's own, else the copy held from when it was.
export function useLiveSessionQuiz(
  loaded: QuizData | null,
  loadedFileId: string | null,
  session: Pick<QuizSession, 'id' | 'quizId'> | null,
  liveFileId: string | undefined
): QuizData | null {
  const [held, setHeld] = useState<{ key: string; data: QuizData } | null>(
    null
  );
  if (!session) return null;
  const key = `${session.id}:${liveFileId ?? ''}`;
  // A frozen copy has its own id, so a known file decides; the id only when the file is unknown.
  const loadedIsLive =
    !!loaded &&
    (liveFileId ? loadedFileId === liveFileId : loaded.id === session.quizId);
  if (loadedIsLive) {
    if (held?.key !== key || held.data !== loaded)
      setHeld({ key, data: loaded });
    return loaded;
  }
  return held?.key === key ? held.data : null;
}
