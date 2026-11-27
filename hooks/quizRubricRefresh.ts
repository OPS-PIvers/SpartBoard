import { doc, runTransaction } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizPublicQuestion, QuizSession, Rubric } from '@/types';
import { projectRubricForStudents } from '@/hooks/useQuizSession';
import { QUIZ_SESSIONS_COLLECTION } from '@/hooks/quizSession/collections';
import { QUIZ_ASSIGNMENTS_COLLECTION } from '@/hooks/quizAssignments/writers';
import {
  QUIZ_CONTENT_COLLECTION,
  QUIZ_CONTENT_DOC,
} from '@/utils/quizSessionContent';
import { SCORE_ON_SUBMIT_KEY_DOC } from '@/utils/quizScoreOnSubmit';
import { rubricMaxPoints, sameRubric } from '@/utils/rubricPoints';

/** Swaps an edited rubric into served questions; ids whose points follow the new total are returned. */
export function applyRubricEditToPublicQuestions(
  questions: QuizPublicQuestion[],
  rubric: Rubric
): { questions: QuizPublicQuestion[]; repointedIds: string[] } {
  const total = rubricMaxPoints(rubric);
  const repointedIds: string[] = [];
  const next = questions.map((q) => {
    const isMain = sameRubric(q.rubricSnapshot, rubric);
    const isModified = sameRubric(q.modifiedRubricSnapshot, rubric);
    if (!isMain && !isModified) return q;
    const projected = projectRubricForStudents(rubric, q.rubricHidden === true);
    if (isMain) repointedIds.push(q.id);
    return {
      ...q,
      ...(isMain ? { rubricSnapshot: projected, points: total } : {}),
      ...(isModified ? { modifiedRubricSnapshot: projected } : {}),
    };
  });
  return { questions: next, repointedIds };
}

/** Sets the server answer key's points for the given question ids. */
export function repointScoreKey(
  existing: unknown,
  ids: readonly string[],
  points: number
): { questions: unknown[]; changed: boolean } {
  const wanted = new Set(ids);
  let changed = false;
  const questions = (Array.isArray(existing) ? existing : []).map(
    (entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) return entry;
      const e = entry as { id?: unknown; points?: unknown };
      if (typeof e.id !== 'string' || !wanted.has(e.id) || e.points === points)
        return entry;
      changed = true;
      return { ...e, points };
    }
  );
  return { questions, changed };
}

/** Carries a grader rubric edit into the assignment's served questions and server answer key. */
export async function refreshAssignmentRubric(opts: {
  sessionId: string;
  rubric: Rubric;
}): Promise<void> {
  const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, opts.sessionId);
  const contentRef = doc(sessionRef, QUIZ_CONTENT_COLLECTION, QUIZ_CONTENT_DOC);
  await runTransaction(db, async (tx) => {
    const session = (await tx.get(sessionRef)).data() as
      QuizSession | undefined;
    if (!session) return;
    const keyRef = doc(
      db,
      'users',
      session.teacherUid,
      QUIZ_ASSIGNMENTS_COLLECTION,
      session.assignmentId ?? opts.sessionId,
      'key',
      SCORE_ON_SUBMIT_KEY_DOC
    );
    const inContent = session.questionsInContent === true;
    const [contentSnap, keySnap] = await Promise.all([
      inContent ? tx.get(contentRef) : Promise.resolve(null),
      tx.get(keyRef),
    ]);
    const served = inContent
      ? (contentSnap?.data()?.publicQuestions as
          QuizPublicQuestion[] | undefined)
      : session.publicQuestions;
    const { questions, repointedIds } = applyRubricEditToPublicQuestions(
      served ?? [],
      opts.rubric
    );
    if (questions.every((q, i) => q === served?.[i])) return;
    tx.update(inContent ? contentRef : sessionRef, {
      publicQuestions: questions,
    });
    if (!keySnap.exists()) return;
    const key = repointScoreKey(
      keySnap.data()?.questions,
      repointedIds,
      rubricMaxPoints(opts.rubric)
    );
    if (key.changed) tx.update(keyRef, { questions: key.questions });
  });
}
