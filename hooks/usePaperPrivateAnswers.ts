import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { PaperPrivateAnswer, QuizResponse } from '@/types';
import { isPaperWrittenAnswer } from '@/utils/paperWritten';
import { paperPrivateKey } from '@/utils/paperCropFetch';

const QUIZ_SESSIONS = 'quiz_sessions';
const RESPONSES = 'responses';
const PAPER_PRIVATE = 'paperPrivate';
const EMPTY: ReadonlyMap<string, PaperPrivateAnswer> = new Map();

/** Response keys that carry at least one handwritten paper answer. */
export function paperResponseKeys(
  responses: readonly QuizResponse[]
): string[] {
  const keys: string[] = [];
  for (const r of responses) {
    const key = r._responseKey ?? r.studentUid;
    if (key && r.answers?.some((a) => isPaperWrittenAnswer(a))) keys.push(key);
  }
  return keys.sort();
}

/** Teacher-only transcription records, keyed by `paperPrivateKey`. */
export function usePaperPrivateAnswers(
  sessionId: string | undefined,
  responses: readonly QuizResponse[],
  enabled: boolean
): ReadonlyMap<string, PaperPrivateAnswer> {
  const keys = useMemo(() => paperResponseKeys(responses), [responses]);
  const sig =
    enabled && sessionId && keys.length > 0
      ? `${sessionId}|${keys.join('|')}`
      : '';
  const [loaded, setLoaded] = useState<{
    sig: string;
    byKey: ReadonlyMap<string, PaperPrivateAnswer>;
  }>({ sig: '', byKey: EMPTY });

  useEffect(() => {
    if (!sig) return;
    const [sid, ...responseKeys] = sig.split('|');
    const perResponse = new Map<string, Map<string, PaperPrivateAnswer>>();
    const publish = () => {
      const next = new Map<string, PaperPrivateAnswer>();
      for (const [rk, docs] of perResponse)
        for (const [qid, d] of docs) next.set(paperPrivateKey(rk, qid), d);
      setLoaded({ sig, byKey: next });
    };
    const unsubs = responseKeys.map((rk) =>
      onSnapshot(
        collection(db, QUIZ_SESSIONS, sid, RESPONSES, rk, PAPER_PRIVATE),
        (snap) => {
          const docs = new Map<string, PaperPrivateAnswer>();
          snap.forEach((d) => docs.set(d.id, d.data() as PaperPrivateAnswer));
          perResponse.set(rk, docs);
          publish();
        },
        () => {
          // Not the session teacher, or offline: the grader falls back to the public state.
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [sig]);

  return sig && loaded.sig === sig ? loaded.byKey : EMPTY;
}
