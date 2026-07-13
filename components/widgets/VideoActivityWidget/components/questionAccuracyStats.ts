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

type AnswerLike = { questionId: string; answer: string };
type ResponseLike = Pick<VideoActivityResponse, 'answers'>;

/** The first answer a response submitted for `questionId`, ignoring later duplicates. */
function firstAnswerFor(
  response: ResponseLike,
  questionId: string
): AnswerLike | undefined {
  return response.answers.find((a) => a.questionId === questionId);
}

/** Whether a response's (first, authoritative) answer to `question` is correct. */
export function isResponseCorrectForQuestion(
  response: ResponseLike,
  question: VideoActivityQuestion
): boolean {
  const answer = firstAnswerFor(response, question.id);
  return (
    !!answer && gradeVideoActivityAnswer(question, answer.answer).isCorrect
  );
}

/** Percentage of respondents who got `question` right, deduped per response. */
export function computeQuestionAccuracy(
  question: VideoActivityQuestion,
  responses: ResponseLike[]
): number {
  const answered = responses.filter(
    (r) => firstAnswerFor(r, question.id) !== undefined
  );
  if (answered.length === 0) return 0;
  const correct = answered.filter((r) =>
    isResponseCorrectForQuestion(r, question)
  ).length;
  return Math.round((correct / answered.length) * 100);
}

/** Count of questions a response answered correctly, deduped per question. */
export function countCorrectAnswers(
  response: ResponseLike,
  questions: VideoActivityQuestion[]
): number {
  return questions.filter((q) => isResponseCorrectForQuestion(response, q))
    .length;
}
