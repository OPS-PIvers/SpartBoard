/** Word-cloud helpers shared by the widget, gallery, and wall render package. */

import type { ActivityWallSubmission } from '@/types';

export interface WordWeight {
  word: string;
  count: number;
  weight: number;
}

/** Maximum words rendered in a cloud (redesign plan P2-1). */
export const WORD_CLOUD_MAX_WORDS = 80;

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'it',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'and',
  'or',
  'but',
  'not',
  'with',
  'be',
  'was',
  'are',
  'were',
  'by',
  'from',
  'as',
  'i',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'they',
  'their',
  'its',
  'this',
  'that',
  'do',
  'did',
  'so',
  'if',
  'up',
  'out',
  'no',
  'can',
  'has',
  'have',
  'had',
  'will',
  'just',
  'me',
  'am',
  'been',
]);

/** Deterministic per-word hue; unchanged from the original widget helper. */
export const wordColor = (word: string): string => {
  let hash = 0;
  for (let i = 0; i < word.length; i++) {
    hash = word.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 65%, 38%)`;
};

/** Counts words across submissions, drops stop words, and caps the result. */
export const buildWordCloud = (
  submissions: Pick<ActivityWallSubmission, 'content'>[],
  maxWords: number = WORD_CLOUD_MAX_WORDS
): WordWeight[] => {
  const counts: Record<string, number> = {};
  for (const sub of submissions) {
    const words = sub.content.toLowerCase().match(/\b[a-z']{2,}\b/g) ?? [];
    for (const word of words) {
      if (!STOP_WORDS.has(word)) {
        counts[word] = (counts[word] ?? 0) + 1;
      }
    }
  }
  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxWords);
  const maxCount = entries[0]?.[1] ?? 1;
  return entries.map(([word, count]) => ({
    word,
    count,
    weight: count / maxCount,
  }));
};
