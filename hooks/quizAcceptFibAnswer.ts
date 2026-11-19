import {
  arrayUnion,
  collection,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizData, QuizResponse, QuizSession } from '@/types';
import {
  buildResponseGradingContext,
  gradeResponseForPublish,
  publishScoreFields,
} from '@/hooks/useQuizAssignments';
import {
  QUIZ_SESSIONS_COLLECTION,
  RESPONSES_COLLECTION,
} from '@/hooks/useQuizSession';
import { ANY_LOCALE } from '@/utils/quizFibAnswers';

/** Adds a typed answer to this assignment's key for every student, then re-scores each scored response. */
export async function acceptFibAnswer(opts: {
  sessionId: string;
  questionId: string;
  answer: string;
  quiz: QuizData;
}): Promise<void> {
  const answer = opts.answer.trim();
  if (!answer) return;
  const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, opts.sessionId);
  const session = (await getDoc(sessionRef)).data() as QuizSession | undefined;
  if (!session) throw new Error('This assignment is no longer available.');
  const assignmentRef = doc(
    db,
    'users',
    session.teacherUid,
    'quiz_assignments',
    session.assignmentId ?? opts.sessionId
  );
  await updateDoc(
    assignmentRef,
    new FieldPath('localizedFibAnswers', opts.questionId, ANY_LOCALE),
    arrayUnion(answer)
  );
  const ctx = {
    ...buildResponseGradingContext(
      opts.quiz,
      (await getDoc(assignmentRef)).data()
    ),
    sections: session.sections?.length ? session.sections : undefined,
  };
  const responses = await getDocs(collection(sessionRef, RESPONSES_COLLECTION));
  const scored = responses.docs.filter(
    (d) => typeof (d.data() as QuizResponse).score === 'number'
  );
  for (let i = 0; i < scored.length; i += 20) {
    await Promise.all(
      scored.slice(i, i + 20).map((d) =>
        runTransaction(db, async (tx) => {
          const fresh = await tx.get(d.ref);
          const data = fresh.data() as QuizResponse | undefined;
          if (!data || typeof data.score !== 'number') return;
          const graded = gradeResponseForPublish(data, ctx);
          // A slot still owed a grade keeps the saved score until the teacher grades it.
          if (graded.score === null) return;
          // Verdicts a student can already see follow the new key; hidden ones stay hidden.
          const hadVerdicts = (data.answers ?? []).some(
            (a) => typeof a.isCorrect === 'boolean'
          );
          tx.update(d.ref, {
            ...publishScoreFields(graded),
            ...(hadVerdicts ? { answers: graded.answers } : {}),
          });
        })
      )
    );
  }
}
