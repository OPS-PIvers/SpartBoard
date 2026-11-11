// Blank types for fill-in-the-blank (docs/plans/QUIZ_MCA_PRACTICE.md M6–M10); mirrored in functions/src/subLaunchAssignment.ts.
import type { FibBlankType, QuizPublicQuestion, QuizQuestion } from '@/types';
import { FIB_BLANK_SEP, fibBlankCount, splitBlanks } from './quizFibBlanks';

type BlankKey = Pick<
  QuizQuestion,
  | 'type'
  | 'correctAnswer'
  | 'blankType'
  | 'blankChoices'
  | 'wordBank'
  | 'wordBankReuse'
>;

/** Typed unless a FIB question says dropdown or drag. */
export function blankTypeOf(q: Pick<QuizQuestion, 'type' | 'blankType'>) {
  if (q.type !== 'FIB') return 'typed';
  return q.blankType === 'dropdown' || q.blankType === 'drag'
    ? q.blankType
    : 'typed';
}

// The blank separator can never sit inside a choice.
const cleanWord = (s: unknown): string =>
  typeof s === 'string' ? s.split(FIB_BLANK_SEP).join('').trim() : '';

/** Each blank's dropdown choices, trimmed, blanks and case-insensitive repeats dropped, authored order kept. */
export function dropdownChoices(q: BlankKey): string[][] {
  const count = fibBlankCount(q);
  return Array.from({ length: count }, (_, i) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of q.blankChoices?.[i]?.choices ?? []) {
      const c = cleanWord(raw);
      if (!c || seen.has(c.toLowerCase())) continue;
      seen.add(c.toLowerCase());
      out.push(c);
    }
    return out;
  });
}

/** The drag word bank before shuffling: blanks dropped, repeats kept only when a word cannot be reused. */
export function wordBankWords(q: BlankKey): string[] {
  const reuse = q.wordBankReuse === true;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of q.wordBank ?? []) {
    const w = cleanWord(raw);
    if (!w) continue;
    if (reuse && seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase());
    out.push(w);
  }
  return out;
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Student-facing blank fields for the public question; the key itself never travels. */
export function publicBlankFields(
  q: BlankKey,
  shuffle: <T>(items: readonly T[]) => T[] = shuffled
): Pick<
  QuizPublicQuestion,
  'blankType' | 'blankChoices' | 'wordBank' | 'wordBankReuse'
> {
  const type = blankTypeOf(q);
  if (type === 'dropdown') {
    const lists = dropdownChoices(q);
    if (lists.some((l) => l.length === 0)) return {};
    return {
      blankType: 'dropdown',
      blankChoices: lists.map((choices) => ({ choices })),
    };
  }
  if (type === 'drag') {
    const bank = wordBankWords(q);
    if (bank.length === 0) return {};
    return {
      blankType: 'drag',
      wordBank: shuffle(bank),
      ...(q.wordBankReuse === true ? { wordBankReuse: true } : {}),
    };
  }
  return {};
}

/** Why a dropdown or drag question cannot be graded as authored; null when it can. */
export function blankTypeProblem(q: BlankKey): string | null {
  const type = blankTypeOf(q);
  if (type === 'typed') return null;
  const answers = splitBlanks(q.correctAnswer).map(cleanWord);
  if (type === 'dropdown') {
    const lists = dropdownChoices(q);
    for (let i = 0; i < lists.length; i++) {
      const label = lists.length > 1 ? `blank ${i + 1}` : 'the blank';
      if (lists[i].length < 2) return `give ${label} at least two choices`;
      const written = (q.blankChoices?.[i]?.choices ?? [])
        .map(cleanWord)
        .filter(Boolean);
      if (written.length > lists[i].length)
        return `remove the repeated choice in ${label}`;
      const answer = answers[i]?.toLowerCase() ?? '';
      if (answer && !lists[i].some((c) => c.toLowerCase() === answer))
        return `pick the right choice for ${label}`;
    }
    return null;
  }
  const bank = wordBankWords(q).map((w) => w.toLowerCase());
  if (bank.length < 2) return 'add at least two words to the word bank';
  const reuse = q.wordBankReuse === true;
  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i].toLowerCase();
    if (!answer) continue;
    const label = answers.length > 1 ? `blank ${i + 1}'s answer` : 'the answer';
    const need = reuse
      ? 1
      : answers.filter((a) => a.toLowerCase() === answer).length;
    if (bank.filter((w) => w === answer).length < need)
      return `add ${label} to the word bank`;
  }
  return null;
}

/** What read-aloud speaks after the sentence: every dropdown choice once, or the word bank. */
export function spokenBlankChoices(
  q: Pick<
    QuizPublicQuestion,
    'type' | 'blankType' | 'blankChoices' | 'wordBank'
  >
): string[] {
  if (q.type !== 'FIB') return [];
  if (q.blankType === 'drag') return [...new Set(q.wordBank ?? [])];
  if (q.blankType !== 'dropdown') return [];
  const out: string[] = [];
  for (const blank of q.blankChoices ?? []) {
    for (const c of blank.choices ?? []) if (!out.includes(c)) out.push(c);
  }
  return out;
}

/** Switching blank type keeps the key and drops the other type's lists; a new list starts from the answers. */
export function blankTypeUpdate(
  q: Pick<QuizQuestion, 'correctAnswer' | 'blankChoices' | 'wordBank'>,
  next: FibBlankType
): Partial<QuizQuestion> {
  const answers = splitBlanks(q.correctAnswer).map(cleanWord);
  if (next === 'typed')
    return {
      blankType: undefined,
      blankChoices: undefined,
      wordBank: undefined,
      wordBankReuse: undefined,
    };
  if (next === 'dropdown')
    return {
      blankType: 'dropdown',
      wordBank: undefined,
      wordBankReuse: undefined,
      blankChoices: answers.map((answer, i) => {
        const kept = q.blankChoices?.[i]?.choices ?? [];
        return {
          choices: kept.length > 0 ? kept : [answer, '', ''],
        };
      }),
    };
  return {
    blankType: 'drag',
    blankChoices: undefined,
    wordBank:
      q.wordBank && q.wordBank.length > 0
        ? q.wordBank
        : [...answers.filter(Boolean), ''],
  };
}

/** True when the public question carries a usable dropdown or drag layout. */
export function hasChoiceBlanks(q: QuizPublicQuestion): boolean {
  if (q.type !== 'FIB') return false;
  if (q.blankType === 'dropdown')
    return (q.blankChoices?.length ?? 0) === (q.blankCount ?? 1);
  if (q.blankType === 'drag') return (q.wordBank?.length ?? 0) > 0;
  return false;
}

/** Which bank word fills each blank, read back from the saved answer; unknown text leaves the blank empty. */
export function placementsFromValue(
  value: string,
  bank: readonly string[],
  count: number,
  reuse: boolean
): (number | null)[] {
  const parts = splitBlanks(value);
  const used = new Set<number>();
  return Array.from({ length: count }, (_, i) => {
    const word = (parts[i] ?? '').trim();
    if (!word) return null;
    const idx = bank.findIndex((w, j) => w === word && (reuse || !used.has(j)));
    if (idx < 0) return null;
    used.add(idx);
    return idx;
  });
}
