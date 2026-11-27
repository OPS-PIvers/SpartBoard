import {
  collection,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  runTransaction,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  QuizAssignment,
  QuizData,
  QuizPublicQuestion,
  QuizResponse,
  QuizSession,
  Rubric,
} from '@/types';
import { projectRubricForStudents } from '@/hooks/useQuizSession';
import {
  QUIZ_SESSIONS_COLLECTION,
  RESPONSES_COLLECTION,
} from '@/hooks/quizSession/collections';
import { QUIZ_ASSIGNMENTS_COLLECTION } from '@/hooks/quizAssignments/writers';
import {
  buildResponseGradingContext,
  gradeResponseForPublish,
  publishScoreFields,
  refreshedKeyFields,
} from '@/hooks/quizAssignments/publishGrading';
import {
  QUIZ_CONTENT_COLLECTION,
  QUIZ_CONTENT_DOC,
} from '@/utils/quizSessionContent';
import { SCORE_ON_SUBMIT_KEY_DOC } from '@/utils/quizScoreOnSubmit';
import { assignmentFrozenFileId } from '@/utils/quizAssignBankDraw';
import {
  applyRubricEdit,
  rescoreRubricGrades,
  rubricMaxPoints,
  rubricPointsChanged,
  sameRubric,
} from '@/utils/rubricPoints';

/** A translated rubric keeps its wording; each level takes the edited rubric's points. */
function repointRubricLevels(translated: Rubric, edited: Rubric): Rubric {
  const points = new Map(
    edited.criteria.flatMap((c) =>
      c.levels.map((l): [string, number] => [`${c.id}|${l.id}`, l.points])
    )
  );
  return {
    ...translated,
    criteria: translated.criteria.map((c) => ({
      ...c,
      levels: c.levels.map((l) => ({
        ...l,
        points: points.get(`${c.id}|${l.id}`) ?? l.points,
      })),
    })),
  };
}

const servedPointsDiffer = (served: Rubric | undefined, rubric: Rubric) =>
  !served || rubricPointsChanged(served, rubric);

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
    // Already serving these points: a label-only edit, or a refresh that already landed.
    if (
      (!isMain ||
        (q.points === total &&
          !servedPointsDiffer(q.rubricSnapshot, rubric))) &&
      (!isModified || !servedPointsDiffer(q.modifiedRubricSnapshot, rubric))
    )
      return q;
    const projected = projectRubricForStudents(rubric, q.rubricHidden === true);
    if (isMain) repointedIds.push(q.id);
    const localized =
      isMain && q.localized
        ? Object.fromEntries(
            Object.entries(q.localized).map(([loc, strings]) => [
              loc,
              strings.rubricSnapshot
                ? {
                    ...strings,
                    rubricSnapshot: repointRubricLevels(
                      strings.rubricSnapshot,
                      rubric
                    ),
                  }
                : strings,
            ])
          )
        : undefined;
    return {
      ...q,
      ...(isMain ? { rubricSnapshot: projected, points: total } : {}),
      ...(localized ? { localized } : {}),
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
    // The session write wakes the gradebook and PLC triggers, which never watch the content doc.
    const touched = { rubricRefreshedAt: Date.now() };
    if (inContent) {
      tx.update(contentRef, { publicQuestions: questions });
      tx.update(sessionRef, touched);
    } else {
      tx.update(sessionRef, { publicQuestions: questions, ...touched });
    }
    if (!keySnap.exists()) return;
    const key = repointScoreKey(
      keySnap.data()?.questions,
      repointedIds,
      rubricMaxPoints(opts.rubric)
    );
    if (key.changed) tx.update(keyRef, { questions: key.questions });
  });
}

/** The first served question whose main rubric is this one. */
async function readServedRubric(
  sessionId: string,
  rubric: Rubric
): Promise<QuizPublicQuestion | undefined> {
  const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, sessionId);
  const session = (await getDoc(sessionRef)).data() as QuizSession | undefined;
  const served =
    session?.questionsInContent === true
      ? ((
          await getDoc(
            doc(sessionRef, QUIZ_CONTENT_COLLECTION, QUIZ_CONTENT_DOC)
          )
        ).data()?.publicQuestions as QuizPublicQuestion[] | undefined)
      : session?.publicQuestions;
  return served?.find((q) => sameRubric(q.rubricSnapshot, rubric));
}

type FieldUpdate = [string | FieldPath, unknown];

/** Rescores picked rubric levels, then the published score of a scored response, against the new total. */
async function rescoreSessionResponses(opts: {
  sessionId: string;
  rubric: Rubric;
  before: Rubric;
  quiz: QuizData;
}): Promise<void> {
  const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, opts.sessionId);
  const session = (await getDoc(sessionRef)).data() as QuizSession | undefined;
  if (!session) return;
  const assignmentSnap = await getDoc(
    doc(
      db,
      'users',
      session.teacherUid,
      QUIZ_ASSIGNMENTS_COLLECTION,
      session.assignmentId ?? opts.sessionId
    )
  );
  const ctx = {
    ...buildResponseGradingContext(opts.quiz, assignmentSnap.data()),
    sections: session.sections?.length ? session.sections : undefined,
  };
  const responses = await getDocs(collection(sessionRef, RESPONSES_COLLECTION));
  const touched = responses.docs.filter((d) => {
    const data = d.data() as QuizResponse;
    return !!data.grading || typeof data.score === 'number';
  });
  const failures: unknown[] = [];
  for (let i = 0; i < touched.length; i += 20) {
    const results = await Promise.allSettled(
      touched.slice(i, i + 20).map((d) =>
        runTransaction(db, async (tx) => {
          const data = (await tx.get(d.ref)).data() as QuizResponse | undefined;
          if (!data) return;
          const regraded = data.grading
            ? rescoreRubricGrades(opts.before, opts.rubric, data.grading)
            : [];
          const fields: FieldUpdate[] = regraded.map(([key, grade]) => [
            new FieldPath('grading', key),
            grade,
          ]);
          if (typeof data.score === 'number') {
            const next: QuizResponse = regraded.length
              ? {
                  ...data,
                  grading: { ...data.grading, ...Object.fromEntries(regraded) },
                }
              : data;
            const graded = gradeResponseForPublish(next, ctx, d.id);
            // A slot still owed a grade keeps the saved score until the teacher grades it.
            if (graded.score !== null) {
              fields.push(
                ...Object.entries({
                  ...publishScoreFields(graded),
                  ...refreshedKeyFields(next, graded, opts.quiz, d.id, ctx),
                })
              );
              // Verdicts a student can already see follow the new total; hidden ones stay hidden.
              if (
                (data.answers ?? []).some(
                  (a) => typeof a.isCorrect === 'boolean'
                )
              )
                fields.push(['answers', graded.answers]);
            }
          }
          if (fields.length === 0) return;
          const [[field, value], ...rest] = fields;
          tx.update(d.ref, field, value, ...rest.flat());
        })
      )
    );
    for (const r of results)
      if (r.status === 'rejected') failures.push(r.reason);
  }
  // One bad response never stops the rest; the first failure is still reported.
  if (failures.length) throw failures[0];
}

/** Whether a session still serves other points for this rubric, and the rubric its grades were made against. */
async function servedRubricState(
  sessionId: string,
  rubric: Rubric,
  fallbackBefore: Rubric
): Promise<{ stale: boolean; before: Rubric }> {
  const served = await readServedRubric(sessionId, rubric);
  // What students were graded against wins over the loaded quiz, which may already hold the edit.
  if (!served?.rubricSnapshot)
    return {
      stale: rubricPointsChanged(fallbackBefore, rubric),
      before: fallbackBefore,
    };
  return {
    stale:
      served.points !== rubricMaxPoints(rubric) ||
      rubricPointsChanged(served.rubricSnapshot, rubric),
    before: served.rubricSnapshot,
  };
}

/** Refreshes one assignment for a rubric edit; it stays stale until every response is rescored, so a retry repairs it. */
export async function refreshRubricForSession(opts: {
  sessionId: string;
  rubric: Rubric;
  before: Rubric;
  /** The quiz this assignment grades against, with the edit applied. */
  quiz: QuizData;
}): Promise<void> {
  const { stale, before } = await servedRubricState(
    opts.sessionId,
    opts.rubric,
    opts.before
  );
  if (!stale) return;
  await rescoreSessionResponses({ ...opts, before });
  await refreshAssignmentRubric(opts);
}

/** Reads and rewrites an assignment's frozen Drive copy. */
export interface FrozenCopyIo {
  load: (driveFileId: string) => Promise<QuizData>;
  save: (quiz: QuizData, driveFileId: string) => Promise<string>;
}

/** Writes the edited rubric and its total into a frozen copy's matching questions only; false when none match. */
export async function writeRubricToFrozenCopy(
  driveFileId: string,
  rubric: Rubric,
  io: FrozenCopyIo
): Promise<boolean> {
  const frozen = await io.load(driveFileId);
  const edit = applyRubricEdit(frozen.questions, rubric);
  if (!edit.before) return false;
  const saved = await io.save(
    { ...frozen, questions: edit.questions },
    driveFileId
  );
  // Grading must never run ahead of the copy that grades on reload.
  if (saved !== driveFileId)
    throw new Error('Failed to upload quiz content to Drive');
  return true;
}

/** Refreshes the teacher's other assignments of a quiz one at a time, frozen copies included; false when any failed. */
export async function refreshRubricPeers(
  assignments: readonly QuizAssignment[],
  opts: {
    quizId: string;
    libraryDriveFileId: string;
    activeAssignmentId?: string | null;
    teacherUid: string;
    rubric: Rubric;
    before: Rubric;
    frozenCopies: FrozenCopyIo;
    /** The quiz an assignment grades against, read after its frozen copy is written. */
    loadGradingQuiz: (assignment: QuizAssignment) => Promise<QuizData | null>;
  }
): Promise<boolean> {
  let ok = true;
  for (const a of assignments) {
    if (
      a.quizId !== opts.quizId ||
      a.id === opts.activeAssignmentId ||
      a.teacherUid !== opts.teacherUid
    )
      continue;
    try {
      // Decided per peer from what it serves, so a retry repairs one that failed before.
      const { stale } = await servedRubricState(a.id, opts.rubric, opts.before);
      if (!stale) continue;
      const frozenId = assignmentFrozenFileId(a);
      if (frozenId && frozenId !== opts.libraryDriveFileId) {
        const held = await writeRubricToFrozenCopy(
          frozenId,
          opts.rubric,
          opts.frozenCopies
        );
        // A bank draw that never dealt this question has nothing to refresh.
        if (!held && a.resolvedDriveFileId) continue;
      }
      const quiz = await opts.loadGradingQuiz(a);
      if (!quiz) {
        ok = false;
        continue;
      }
      await refreshRubricForSession({
        sessionId: a.id,
        rubric: opts.rubric,
        before: opts.before,
        quiz,
      });
    } catch {
      ok = false;
    }
  }
  return ok;
}
