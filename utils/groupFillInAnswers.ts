import type { VideoActivityQuestion } from '@/types';
import { normalizeVideoActivityAnswer } from '@/utils/videoActivityGrading';

export interface FillInAnswerGroup {
  /** The most common spelling in the group, or the key's wording for the correct group. */
  label: string;
  count: number;
  isCorrect: boolean;
}

export interface FillInAnswerGroups {
  groups: FillInAnswerGroup[];
  /** Answers outside the top groups. */
  otherCount: number;
  totalAnswered: number;
}

/** Groups fill-in answers by normalized text, ranked by count, with an "Other" bucket (D16). */
export function groupFillInAnswers(
  answers: string[],
  question: Pick<VideoActivityQuestion, 'correctAnswer' | 'acceptableVariants'>,
  topN = 5
): FillInAnswerGroups {
  const accepted = new Set(
    [question.correctAnswer ?? '', ...(question.acceptableVariants ?? [])]
      .map(normalizeVideoActivityAnswer)
      .filter((a) => a.length > 0)
  );
  const CORRECT = '\u0000correct';
  const buckets = new Map<
    string,
    { count: number; spellings: Map<string, number>; isCorrect: boolean }
  >();
  let totalAnswered = 0;
  for (const raw of answers) {
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    const norm = normalizeVideoActivityAnswer(trimmed);
    if (norm.length === 0) continue;
    totalAnswered++;
    const isCorrect = accepted.has(norm);
    const key = isCorrect ? CORRECT : norm;
    const bucket = buckets.get(key) ?? {
      count: 0,
      spellings: new Map<string, number>(),
      isCorrect,
    };
    bucket.count++;
    bucket.spellings.set(trimmed, (bucket.spellings.get(trimmed) ?? 0) + 1);
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.entries()]
    .map(([key, b]) => ({
      label:
        key === CORRECT && question.correctAnswer
          ? question.correctAnswer
          : mostCommon(b.spellings),
      count: b.count,
      isCorrect: b.isCorrect,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const groups = ranked.slice(0, Math.max(0, topN));
  const otherCount = ranked
    .slice(groups.length)
    .reduce((sum, g) => sum + g.count, 0);
  return { groups, otherCount, totalAnswered };
}

function mostCommon(spellings: Map<string, number>): string {
  let best = '';
  let bestCount = -1;
  for (const [spelling, count] of spellings) {
    if (count > bestCount) {
      best = spelling;
      bestCount = count;
    }
  }
  return best;
}
