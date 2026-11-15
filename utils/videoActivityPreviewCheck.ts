// Grades a teacher's View Student Page answers locally from the session's key.
import type { VideoActivityCheckResult, VideoActivityQuestion } from '@/types';
import { gradeVideoActivityAnswer } from '@/utils/videoActivityGrading';

/** Grades against the teacher's key the way the server check does, hiding what the session hides. */
export function previewCheckAnswer(
  key: readonly VideoActivityQuestion[],
  showResult: boolean,
  questionId: string,
  answer: string
): VideoActivityCheckResult {
  const question = key.find((q) => q.id === questionId);
  if (!question) return { isCorrect: null, correctAnswer: '' };
  const correctAnswer = question.correctAnswer ?? '';
  if (!showResult || (question.type ?? 'MC') === 'SA') {
    return { isCorrect: null, correctAnswer };
  }
  return {
    isCorrect: gradeVideoActivityAnswer(question, answer).isCorrect,
    correctAnswer,
  };
}
