import {
  deleteField,
  doc,
  getDoc,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  GuidedLearningResponse,
  GuidedLearningStep,
  QuizScoreVisibility,
  VideoActivityAnswer,
  VideoActivityQuestion,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';
import { selectRepresentativeAnswers } from '@/utils/answerTakeOrdering';
import { scoredVideoActivityQuestions } from '@/utils/videoActivityLive';
import {
  dedupeQuestionsById,
  gradeVideoActivityAnswer,
} from '@/utils/videoActivityGrading';
import {
  dedupeStepsById,
  isAnswerCorrect,
} from '@/hooks/useGuidedLearningSession';

type ShownVisibility = Exclude<QuizScoreVisibility, 'none'>;

export const VA_SESSIONS_COLLECTION = 'video_activity_sessions';
export const GL_SESSIONS_COLLECTION = 'guided_learning_sessions';
const RESPONSES = 'responses';
const MAX_BATCH_WRITES = 400;

export interface PublishForStudentsResult {
  responsesUpdated: number;
  skipped: number;
}

/** A step's correct answer as review text; null for steps with no question. */
export function formatCanonicalAnswer(step: GuidedLearningStep): string | null {
  const q = step.question;
  if (!q) return null;
  switch (q.type) {
    case 'multiple-choice':
      return q.correctAnswer ?? null;
    case 'matching':
      if (!q.matchingPairs?.length) return null;
      return q.matchingPairs.map((p) => `${p.left} → ${p.right}`).join('\n');
    case 'sorting':
      if (!q.sortingItems?.length) return null;
      return q.sortingItems.join(' → ');
    default: {
      const _exhaustiveCheck: never = q.type;
      void _exhaustiveCheck;
      return null;
    }
  }
}

/** Grades one VA response the way a class publish does. */
export function gradeVideoActivityResponseForPublish(
  data: VideoActivityResponse,
  questionsById: ReadonlyMap<string, VideoActivityQuestion>
): { score: number; answers: VideoActivityAnswer[] } {
  const answers = Array.isArray(data.answers) ? data.answers : [];
  let pointsEarned = 0;
  let pointsMax = 0;
  // One representative answer per question, so duplicates can't inflate the totals.
  const representativeAnswers = selectRepresentativeAnswers(answers);
  const gradedAnswers: VideoActivityAnswer[] = answers.map((a) => {
    const q = questionsById.get(a.questionId);
    if (!q) {
      const { isCorrect: _stale, ...rest } = a;
      void _stale;
      return rest;
    }
    const result = gradeVideoActivityAnswer(q, a.answer);
    if (representativeAnswers.get(a.questionId) === a) {
      pointsEarned += result.pointsEarned;
      pointsMax += result.pointsMax;
    }
    return { ...a, isCorrect: result.isCorrect };
  });
  // Unanswered questions count toward the denominator, so a blank response scores 0%.
  const answered = new Set(answers.map((a) => a.questionId));
  for (const [qId, q] of questionsById) {
    if (!answered.has(qId)) pointsMax += q.points ?? 1;
  }
  const score =
    pointsMax === 0 ? 0 : Math.round((pointsEarned / pointsMax) * 100);
  return { score, answers: gradedAnswers };
}

/** Grades one GL response the way a class publish does. */
export function gradeGuidedLearningResponseForPublish(
  data: GuidedLearningResponse,
  stepsById: ReadonlyMap<string, GuidedLearningStep>,
  gradableCount: number
): { score: number; answers: GuidedLearningResponse['answers'] } {
  const answers = Array.isArray(data.answers) ? data.answers : [];
  let correctCount = 0;
  // First answer per step counts, so a duplicate can't inflate the score.
  const scoredStepIds = new Set<string>();
  const gradedAnswers = answers.map((a) => {
    const step = stepsById.get(a.stepId);
    if (!step || !step.question) return { ...a, isCorrect: null };
    const correct = isAnswerCorrect(step, a.answer);
    if (!scoredStepIds.has(a.stepId)) {
      scoredStepIds.add(a.stepId);
      if (correct) correctCount += 1;
    }
    return { ...a, isCorrect: correct };
  });
  const score =
    gradableCount === 0 ? 0 : Math.round((correctCount / gradableCount) * 100);
  return { score, answers: gradedAnswers };
}

const responseRef = (
  collectionName: string,
  sessionId: string,
  key: string
): DocumentReference => doc(db, collectionName, sessionId, RESPONSES, key);

async function commitPatches(
  patches: { ref: DocumentReference; patch: Record<string, unknown> }[]
): Promise<void> {
  for (let i = 0; i < patches.length; i += MAX_BATCH_WRITES) {
    const batch = writeBatch(db);
    for (const { ref, patch } of patches.slice(i, i + MAX_BATCH_WRITES)) {
      batch.update(ref, patch);
    }
    await batch.commit();
  }
}

function shownOverride(
  visibility: ShownVisibility,
  expiresAt: number | null,
  revealedAnswers: Record<string, string>
) {
  return {
    mode: 'shown',
    visibility,
    publishedAt: Date.now(),
    expiresAt,
    ...(visibility === 'score-responses-and-answers'
      ? { revealedAnswers }
      : {}),
  };
}

async function publishForStudents<T extends { completedAt: number | null }>(
  collectionName: string,
  sessionId: string,
  responseKeys: string[],
  buildPatch: (data: T) => Record<string, unknown>
): Promise<PublishForStudentsResult> {
  const snaps = await Promise.all(
    Array.from(new Set(responseKeys)).map((key) =>
      getDoc(responseRef(collectionName, sessionId, key))
    )
  );
  const patches: { ref: DocumentReference; patch: Record<string, unknown> }[] =
    [];
  let skipped = 0;
  for (const snap of snaps) {
    const data = snap.exists() ? (snap.data() as T) : null;
    // Only a finished response can be shown.
    if (!data || typeof data.completedAt !== 'number') {
      skipped += 1;
      continue;
    }
    patches.push({ ref: snap.ref, patch: buildPatch(data) });
  }
  await commitPatches(patches);
  return { responsesUpdated: patches.length, skipped };
}

/** Grades and shows results to chosen VA students, independent of the class setting. */
export async function publishVideoActivityResultsForStudents(
  sessionId: string,
  questions: VideoActivityQuestion[],
  responseKeys: string[],
  visibility: ShownVisibility,
  expiresAt: number | null
): Promise<PublishForStudentsResult> {
  const sessionSnap = await getDoc(doc(db, VA_SESSIONS_COLLECTION, sessionId));
  const deduped = dedupeQuestionsById(questions);
  const scored = scoredVideoActivityQuestions(
    sessionSnap.data() as Partial<VideoActivitySession> | undefined,
    deduped
  );
  const questionsById = new Map(scored.map((q) => [q.id, q]));
  const revealedAnswers: Record<string, string> = {};
  for (const q of deduped) revealedAnswers[q.id] = q.correctAnswer;
  return publishForStudents<VideoActivityResponse>(
    VA_SESSIONS_COLLECTION,
    sessionId,
    responseKeys,
    (data) => ({
      ...gradeVideoActivityResponseForPublish(data, questionsById),
      resultsOverride: shownOverride(visibility, expiresAt, revealedAnswers),
    })
  );
}

/** Grades and shows results to chosen GL students, independent of the class setting. */
export async function publishGuidedLearningResultsForStudents(
  sessionId: string,
  steps: GuidedLearningStep[],
  responseKeys: string[],
  visibility: ShownVisibility,
  expiresAt: number | null
): Promise<PublishForStudentsResult> {
  const deduped = dedupeStepsById(steps);
  const stepsById = new Map(deduped.map((s) => [s.id, s]));
  const gradableCount = deduped.filter((s) => !!s.question).length;
  const revealedAnswers: Record<string, string> = {};
  for (const s of deduped) {
    const formatted = formatCanonicalAnswer(s);
    if (formatted !== null) revealedAnswers[s.id] = formatted;
  }
  return publishForStudents<GuidedLearningResponse>(
    GL_SESSIONS_COLLECTION,
    sessionId,
    responseKeys,
    (data) => ({
      ...gradeGuidedLearningResponseForPublish(data, stepsById, gradableCount),
      resultsOverride: shownOverride(visibility, expiresAt, revealedAnswers),
    })
  );
}

/** Hides results from chosen students even when the class is published. */
export async function hideResultsForStudents(
  collectionName: string,
  sessionId: string,
  responseKeys: string[]
): Promise<void> {
  await commitPatches(
    Array.from(new Set(responseKeys)).map((key) => ({
      ref: responseRef(collectionName, sessionId, key),
      patch: { resultsOverride: { mode: 'hidden', publishedAt: Date.now() } },
    }))
  );
}

/** Returns chosen students to the class setting. */
export async function clearResultsOverride(
  collectionName: string,
  sessionId: string,
  responseKeys: string[]
): Promise<void> {
  await commitPatches(
    Array.from(new Set(responseKeys)).map((key) => ({
      ref: responseRef(collectionName, sessionId, key),
      patch: { resultsOverride: deleteField() },
    }))
  );
}
