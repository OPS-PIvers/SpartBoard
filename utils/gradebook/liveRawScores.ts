import type {
  GuidedLearningResponse,
  QuizQuestion,
  QuizResponse,
  VideoActivityQuestion,
  VideoActivityResponse,
} from '@/types';
import type { FibGradingContext } from '@/utils/quizFibAnswers';
import {
  canScoreResponse,
  getEarnedPoints,
  isResponseAwaitingGrade,
} from '@/components/widgets/QuizWidget/utils/quizScoreboard';
import { questionPointsFor } from '@/utils/mediaGrading';
import { dedupeQuestionsById } from '@/utils/quizMaxPoints';
import {
  canScoreVideoActivityResponse,
  gradeVideoActivityAnswer,
} from '@/utils/videoActivityGrading';
import type { LiveRawScore } from '@/utils/gradebook/finalScoreOverlay';

const NOT_SCORED: LiveRawScore = {
  points: null,
  max: null,
  state: 'not-attempted',
  submittedAt: null,
};

/** Quiz raw for D9: correctness points over the student's own denominator, as the LMS push scores it. */
export function quizLiveRaw(
  r: QuizResponse,
  questions: QuizQuestion[],
  fibGrading?: FibGradingContext | null
): LiveRawScore {
  if (r.status !== 'completed') return NOT_SCORED;
  const deduped = dedupeQuestionsById(questions);
  const submittedAt = r.submittedAt ?? null;
  if (!canScoreResponse(r, deduped)) return { ...NOT_SCORED, submittedAt };
  const max = deduped.reduce((s, q) => s + questionPointsFor(q, r), 0);
  if (isResponseAwaitingGrade(r, deduped)) {
    return { points: null, max, state: 'awaiting-grade', submittedAt };
  }
  const earned = getEarnedPoints(r, deduped, undefined, fibGrading);
  return {
    points: Number.isFinite(earned) ? earned : 0,
    max,
    state: 'scored',
    submittedAt,
  };
}

/** VA raw for D9: summed question points, matching `computeVideoActivityScorePct` before rounding. */
export function videoActivityLiveRaw(
  r: VideoActivityResponse,
  questions: VideoActivityQuestion[]
): LiveRawScore {
  if (r.completedAt === null) return NOT_SCORED;
  const submittedAt = r.completedAt;
  if (!canScoreVideoActivityResponse(questions, r.answers)) {
    return { ...NOT_SCORED, submittedAt };
  }
  const seen = new Set<string>();
  let points = 0;
  let max = 0;
  for (const q of questions) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    max += q.points ?? 1;
    const a = r.answers.find((x) => x.questionId === q.id);
    if (a) points += gradeVideoActivityAnswer(q, a.answer).pointsEarned;
  }
  if (max === 0) return { ...NOT_SCORED, submittedAt };
  return { points, max, state: 'scored', submittedAt };
}

/** GL raw for D9: correct question steps over question steps, as the Results list shows it. */
export function guidedLearningLiveRaw(
  r: GuidedLearningResponse,
  qCorrect: number,
  questionCount: number
): LiveRawScore {
  if (r.completedAt === null) return NOT_SCORED;
  if (questionCount === 0) return { ...NOT_SCORED, submittedAt: r.completedAt };
  return {
    points: qCorrect,
    max: questionCount,
    state: 'scored',
    submittedAt: r.completedAt,
  };
}
