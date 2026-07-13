/**
 * Teacher-facing "per question" and "per student" correctness stats for the
 * VA Results view.
 *
 * `VideoActivityResponse.answers` can contain more than one entry for the
 * same `questionId` (Firestore `arrayUnion` races, or a student re-answering
 * a question after rewinding). The authoritative score
 * (`computeVideoActivityScorePct` in `utils/videoActivityGrading.ts`) already
 * credits only the FIRST answer per question. These display-only stats must
 * use the same first-occurrence rule, or they silently disagree with the
 * score shown right next to them — e.g. a duplicate correct answer can push
 * a "X/Y correct" badge to X > Y, or a per-question accuracy bar above the
 * percentage the student's own graded answer actually earned.
 */

import { VideoActivityQuestion, VideoActivityResponse } from '@/types';
import { gradeVideoActivityAnswer } from '@/utils/videoActivityGrading';

type ResponseLike = Pick<VideoActivityResponse, 'answers'>;

/** Percentage of respondents who got `question` right, deduped per response. */
export function computeQuestionAccuracy(
  question: VideoActivityQuestion,
  responses: ResponseLike[]
): number {
  let answeredCount = 0;
  let correctCount = 0;
  for (const r of responses) {
    const answer = r.answers.find((a) => a.questionId === question.id);
    if (answer === undefined) continue;
    answeredCount++;
    if (gradeVideoActivityAnswer(question, answer.answer).isCorrect) {
      correctCount++;
    }
  }
  if (answeredCount === 0) return 0;
  return Math.round((correctCount / answeredCount) * 100);
}

/** Count of questions a response answered correctly, deduped per question. */
export function countCorrectAnswers(
  response: ResponseLike,
  questions: VideoActivityQuestion[]
): number {
  const firstAnswers = new Map<string, string>();
  for (const a of response.answers) {
    if (!firstAnswers.has(a.questionId)) {
      firstAnswers.set(a.questionId, a.answer);
    }
  }
  let correctCount = 0;
  for (const q of questions) {
    const answer = firstAnswers.get(q.id);
    if (answer !== undefined && gradeVideoActivityAnswer(q, answer).isCorrect) {
      correctCount++;
    }
  }
  return correctCount;
}
