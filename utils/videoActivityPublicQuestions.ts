// VA session questions: student-safe `publicQuestions` + teacher-only key doc (mirrored in functions/src/videoActivityKey.ts).

import type {
  VideoActivityPublicQuestion,
  VideoActivityQuestion,
  VideoActivitySession,
} from '@/types';
import { dedupeQuestionsById } from '@/utils/videoActivityGrading';

export const VA_KEY_SUBCOLLECTION = 'key';
export const VA_KEY_DOC_ID = 'answers';

export interface VideoActivitySessionKeyDoc {
  questions: VideoActivityQuestion[];
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function toVideoActivityPublicQuestion(
  q: VideoActivityQuestion
): VideoActivityPublicQuestion {
  const type = q.type ?? 'MC';
  const base: VideoActivityPublicQuestion = {
    id: q.id,
    timestamp: q.timestamp,
    text: q.text,
    type,
  };
  const incorrect = (q.incorrectAnswers ?? []).filter((s) => s.length > 0);
  if (type === 'MC') {
    const correct = q.correctAnswer ? [q.correctAnswer] : [];
    base.options = shuffled([...correct, ...incorrect]);
  } else if (type === 'MA') {
    const correct = (q.correctAnswer ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    base.options = shuffled(Array.from(new Set([...correct, ...incorrect])));
  }
  return base;
}

/** Session-doc fields plus the key doc for a new or re-synced question set. */
export function splitVideoActivitySessionQuestions(
  questions: VideoActivityQuestion[]
): {
  sessionFields: Pick<VideoActivitySession, 'questions' | 'publicQuestions'>;
  key: VideoActivitySessionKeyDoc;
} {
  const deduped = dedupeQuestionsById(questions);
  return {
    sessionFields: {
      questions: [],
      publicQuestions: deduped.map(toVideoActivityPublicQuestion),
    },
    key: { questions: deduped },
  };
}

/** True when stored questions still carry their key (docs written before the split). */
export function hasEmbeddedAnswerKey(
  questions: VideoActivityQuestion[] | undefined
): boolean {
  return (questions ?? []).some((q) => typeof q?.correctAnswer === 'string');
}

/** The question list a student plays, from either stored shape. */
export function studentQuestionsFromSession(
  session: Pick<VideoActivitySession, 'questions' | 'publicQuestions'>
): VideoActivityPublicQuestion[] {
  if (session.publicQuestions) return session.publicQuestions;
  return dedupeQuestionsById(session.questions ?? []).map(
    toVideoActivityPublicQuestion
  );
}
