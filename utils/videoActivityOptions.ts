import type { VideoActivityPublicQuestion } from '@/types';
import { seededShuffle } from '@/utils/quizShuffle';

/** Deterministic Fisher–Yates shuffle keyed by the question id. */
export function shuffleByQuestionId<T>(arr: T[], questionId: string): T[] {
  const out = [...arr];
  let seed = questionId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0x100000000;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** MC/MA options in display order: one order for the class, or per student when `studentSeed` is set. */
export const questionOptions = (
  question: VideoActivityPublicQuestion,
  studentSeed?: string | null
): string[] => {
  const type = question.type ?? 'MC';
  if (type === 'FIB' || type === 'SA') return [];
  const options = question.options ?? [];
  return studentSeed
    ? seededShuffle(options, `${studentSeed}:${question.id}`)
    : shuffleByQuestionId(options, question.id);
};
