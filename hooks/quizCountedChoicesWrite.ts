import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizData, QuizResponse, QuizSession } from '@/types';
import {
  countedChoicesPatch,
  sectionsWithCounts,
} from '@/utils/quizCountedChoices';
export { chooseCountChanges } from '@/utils/quizCountedChoices';
import {
  buildResponseGradingContext,
  gradeResponseForPublish,
} from '@/hooks/useQuizAssignments';
import {
  QUIZ_SESSIONS_COLLECTION,
  RESPONSES_COLLECTION,
} from '@/hooks/useQuizSession';
import { answersWithoutVerdicts } from '@/utils/quizResultsVisibility';

/** Saves which answers count in one section; a response that already has a score is scored again. */
export async function saveCountedChoices(opts: {
  sessionId: string;
  responseKey: string;
  sectionId: string;
  /** Question ids that count; null goes back to the first N in order. */
  picked: readonly string[] | null;
  quiz: QuizData;
}): Promise<void> {
  const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, opts.sessionId);
  const sessionSnap = await getDoc(sessionRef);
  const session = sessionSnap.data() as QuizSession | undefined;
  if (!session) throw new Error('This assignment is no longer available.');
  const sections = session.sections?.length ? session.sections : undefined;
  const assignmentSnap = await getDoc(
    doc(
      db,
      'users',
      session.teacherUid,
      'quiz_assignments',
      session.assignmentId ?? opts.sessionId
    )
  );
  const ctx = {
    ...buildResponseGradingContext(opts.quiz, assignmentSnap.data()),
    sections,
  };
  const responseRef = doc(sessionRef, RESPONSES_COLLECTION, opts.responseKey);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(responseRef);
    const data = snap.data() as QuizResponse | undefined;
    if (!data) throw new Error('This student is no longer in the assignment.');
    const patch = countedChoicesPatch(
      data,
      sections,
      opts.sectionId,
      opts.picked
    );
    if (!patch)
      throw new Error('Could not save. Reopen results and try again.');
    const next: QuizResponse = {
      ...data,
      answers: patch.answers,
      countedChoices: patch.countedChoices ?? undefined,
    };
    const update: Record<string, unknown> = {
      countedChoices: patch.countedChoices ?? deleteField(),
      answers: patch.answers,
    };
    // A score the student or gradebook already has must follow the new pick.
    if (typeof data.score === 'number') {
      const graded = gradeResponseForPublish(next, ctx);
      const hadVerdicts = (data.answers ?? []).some(
        (a) => typeof a.isCorrect === 'boolean'
      );
      update.score = graded.score ?? deleteField();
      update.answers = hadVerdicts
        ? graded.answers
        : answersWithoutVerdicts(graded.answers);
    }
    tx.update(responseRef, update);
  });
}

/** True when the assignment's session has a section whose count would change. */
export async function sessionNeedsCounts(
  sessionId: string,
  changes: ReadonlyMap<string, number | undefined>
): Promise<boolean> {
  const snap = await getDoc(doc(db, QUIZ_SESSIONS_COLLECTION, sessionId));
  const session = snap.data() as QuizSession | undefined;
  return sectionsWithCounts(session?.sections, changes) !== null;
}

/** Writes the new counts onto an assignment's session and re-scores every response that has a score. */
export async function applySectionCounts(opts: {
  sessionId: string;
  changes: ReadonlyMap<string, number | undefined>;
  /** The quiz this assignment grades against. */
  quiz: QuizData;
}): Promise<void> {
  const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, opts.sessionId);
  const session = (await getDoc(sessionRef)).data() as QuizSession | undefined;
  if (!session) return;
  const sections = sectionsWithCounts(session.sections, opts.changes);
  if (!sections) return;
  await updateDoc(sessionRef, { sections });
  const assignmentSnap = await getDoc(
    doc(
      db,
      'users',
      session.teacherUid,
      'quiz_assignments',
      session.assignmentId ?? opts.sessionId
    )
  );
  const ctx = {
    ...buildResponseGradingContext(opts.quiz, assignmentSnap.data()),
    sections,
  };
  const responses = await getDocs(collection(sessionRef, RESPONSES_COLLECTION));
  let batch = writeBatch(db);
  let n = 0;
  for (const d of responses.docs) {
    const data = d.data() as QuizResponse;
    if (typeof data.score !== 'number') continue;
    const graded = gradeResponseForPublish(data, ctx);
    const hadVerdicts = (data.answers ?? []).some(
      (a) => typeof a.isCorrect === 'boolean'
    );
    batch.update(d.ref, {
      score: graded.score ?? deleteField(),
      answers: hadVerdicts
        ? graded.answers
        : answersWithoutVerdicts(graded.answers),
    });
    n += 1;
    if (n % 400 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }
  if (n % 400 !== 0) await batch.commit();
}
