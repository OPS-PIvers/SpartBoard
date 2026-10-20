// Mutated references (§8, after Kanters et al.): a native clip judged against a reference with one token changed.
import type { SpeakLanguage } from '@/types';
import {
  PRONUNCIATION_GROUPS,
  RECOGNIZER_TOLERANCE,
  type PronunciationPair,
} from '@/config/pronunciationGroups';

/** High-functional-load swaps, applied in both directions; none is a learner near-miss the groups forgive. */
export const HIGH_LOAD_SWAPS: ReadonlyArray<readonly [string, string]> = [
  ['l', 'n'],
  ['s', 'ʃ'],
  ['p', 'b'],
  ['i', 'e'],
  ['m', 'n'],
  ['k', 't'],
  ['a', 'i'],
  ['f', 's'],
];

export interface Mutation {
  /** 0-based index into the reference tokens. */
  position: number;
  /** The token the native speaker said (the original reference token). */
  spoken: string;
  /** The token the mutated reference expects instead. */
  target: string;
  kind: 'high-load' | 'group';
  groupId?: string;
}

const applies = (pair: PronunciationPair, position: number, last: number) =>
  !pair.final || position === last;

const matches = (
  pair: PronunciationPair,
  target: string,
  spoken: string,
  position: number,
  last: number
) =>
  pair.target === target &&
  pair.spoken === spoken &&
  applies(pair, position, last);

/** Every one-token change of `tokens` the gate checks, in position order. */
export function generateMutations(
  tokens: readonly string[],
  language: SpeakLanguage
): Mutation[] {
  const last = tokens.length - 1;
  const groups = PRONUNCIATION_GROUPS[language];
  const tolerance = RECOGNIZER_TOLERANCE[language];
  const out: Mutation[] = [];
  tokens.forEach((spoken, position) => {
    // A group pair "target → spoken": the reference now expects `target` where the speaker said `spoken`.
    for (const group of groups) {
      for (const pair of group.pairs) {
        if (pair.spoken === spoken && applies(pair, position, last)) {
          out.push({
            position,
            spoken,
            target: pair.target,
            kind: 'group',
            groupId: group.id,
          });
        }
      }
    }
    for (const [a, b] of HIGH_LOAD_SWAPS) {
      const target = spoken === a ? b : spoken === b ? a : null;
      if (target === null) continue;
      const named = [...tolerance, ...groups.flatMap((g) => g.pairs)].some(
        (p) => matches(p, target, spoken, position, last)
      );
      if (!named) out.push({ position, spoken, target, kind: 'high-load' });
    }
  });
  return out;
}

export function applyMutation(
  tokens: readonly string[],
  m: Mutation
): string[] {
  if (tokens[m.position] !== m.spoken) {
    throw new Error(
      `Token ${m.position} is ${tokens[m.position]}, not ${m.spoken}`
    );
  }
  const out = [...tokens];
  out[m.position] = m.target;
  return out;
}
