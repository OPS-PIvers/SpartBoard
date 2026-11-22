import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { QuizData, QuizSession } from '@/types';

// The quiz a live session grades and reveals against: the loaded quiz when it is the session's own, else the copy held from when it was.
export function useLiveSessionQuiz(
  loaded: QuizData | null,
  loadedFileId: string | null,
  session: Pick<QuizSession, 'id' | 'quizId'> | null,
  liveFileId: string | undefined,
  // Reads the session's frozen copy again, under today's answer keys.
  reloadLive?: () => Promise<QuizData | null>
): QuizData | null {
  const [held, setHeld] = useState<{ key: string; data: QuizData } | null>(
    null
  );
  const key = session ? `${session.id}:${liveFileId ?? ''}` : null;
  // The session's library quiz, loaded while the session grades a frozen copy of it.
  const libraryQuiz =
    session &&
    liveFileId &&
    loaded?.id === session.quizId &&
    loadedFileId !== liveFileId
      ? loaded
      : null;
  const seenLibraryQuiz = useRef<{ key: string; data: QuizData } | null>(null);
  const reload = useEffectEvent(() => reloadLive?.() ?? Promise.resolve(null));
  useEffect(() => {
    if (!key || !libraryQuiz) {
      seenLibraryQuiz.current = null;
      return;
    }
    const seen = seenLibraryQuiz.current;
    seenLibraryQuiz.current = { key, data: libraryQuiz };
    // The first sight is the editor opening; a new object after that is a save.
    if (seen?.key !== key || seen.data === libraryQuiz) return;
    let stale = false;
    void reload().then((data) => {
      if (!stale && data) setHeld({ key, data });
    });
    return () => {
      stale = true;
    };
  }, [key, libraryQuiz]);

  if (!session || !key) return null;
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
