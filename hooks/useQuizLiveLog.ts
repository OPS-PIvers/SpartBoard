import { useEffect, useMemo, useState } from 'react';
import type { QuizLiveLogEntry, QuizSession } from '@/types';
import { logError } from '@/utils/logError';
import { loadLiveLog } from '@/utils/quizLiveViewStore';

/** Loads an assignment's Live view log once, grouped by response key; null skips the read. */
export function useQuizLiveLog(
  session: Pick<QuizSession, 'id' | 'teacherUid' | 'assignmentId'> | null
): ReadonlyMap<string, QuizLiveLogEntry[]> | undefined {
  const teacherUid = session?.teacherUid;
  const assignmentId = session ? session.assignmentId || session.id : undefined;
  const [loaded, setLoaded] = useState<{
    assignmentId: string;
    entries: QuizLiveLogEntry[];
  } | null>(null);
  useEffect(() => {
    if (!teacherUid || !assignmentId) return;
    let stale = false;
    loadLiveLog(teacherUid, assignmentId)
      .then((entries) => {
        if (!stale) setLoaded({ assignmentId, entries });
      })
      .catch((err: unknown) =>
        logError('QuizLiveLog.load', err, { assignmentId })
      );
    return () => {
      stale = true;
    };
  }, [teacherUid, assignmentId]);
  return useMemo(() => {
    if (!assignmentId || loaded?.assignmentId !== assignmentId)
      return undefined;
    const byKey = new Map<string, QuizLiveLogEntry[]>();
    for (const entry of loaded.entries) {
      const list = byKey.get(entry.responseKey);
      if (list) list.push(entry);
      else byKey.set(entry.responseKey, [entry]);
    }
    return byKey;
  }, [loaded, assignmentId]);
}
