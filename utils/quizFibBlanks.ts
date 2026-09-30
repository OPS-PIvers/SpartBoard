import type { QuizQuestion } from '@/types';

// Joins per-blank values in a multi-blank key or answer; no keyboard types it. Mirrored in functions/src/plcAssessmentMath.ts.
export const FIB_BLANK_SEP = '\u001F';

// A revealed multi-blank key joins each blank's accepted answers with this, then blanks with FIB_BLANK_SEP.
const ACCEPTED_SEP = '\n';

type FibKey = Pick<QuizQuestion, 'type' | 'correctAnswer' | 'blankAlternates'>;

/** A run of two or more underscores is how a FIB stem writes a blank. */
const FIB_BLANK_RE = /_{2,}/g;

export function countTextBlanks(text: string): number {
  return (text ?? '').match(FIB_BLANK_RE)?.length ?? 0;
}

export function isMultiBlank(q: Pick<QuizQuestion, 'type' | 'correctAnswer'>) {
  return q.type === 'FIB' && (q.correctAnswer ?? '').includes(FIB_BLANK_SEP);
}

export function splitBlanks(value: string): string[] {
  return (value ?? '').split(FIB_BLANK_SEP);
}

export function joinBlanks(parts: readonly string[]): string {
  return parts.map((p) => p.split(FIB_BLANK_SEP).join('')).join(FIB_BLANK_SEP);
}

/** 1 for every single-answer question. */
export function fibBlankCount(q: Pick<QuizQuestion, 'type' | 'correctAnswer'>) {
  return isMultiBlank(q) ? splitBlanks(q.correctAnswer).length : 1;
}

/** Per blank: the main answer, then its alternates, blanks and repeats dropped. */
export function fibBlankAccepted(q: FibKey): string[][] {
  const mains = splitBlanks(q.correctAnswer);
  return mains.map((main, i) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of [main, ...(q.blankAlternates?.[i]?.answers ?? [])]) {
      const a = raw.trim();
      if (!a || seen.has(a.toLowerCase())) continue;
      seen.add(a.toLowerCase());
      out.push(a);
    }
    return out;
  });
}

/** Resize a key to `count` blanks, moving blank 1's alternates to and from `alternateAnswers`. */
export function reshapeFibBlanks(
  q: Pick<
    QuizQuestion,
    'correctAnswer' | 'alternateAnswers' | 'blankAlternates'
  >,
  count: number
): Pick<
  QuizQuestion,
  'correctAnswer' | 'alternateAnswers' | 'blankAlternates'
> {
  const multi = q.correctAnswer.includes(FIB_BLANK_SEP);
  const mains = splitBlanks(q.correctAnswer);
  const alts = multi
    ? (q.blankAlternates ?? []).map((b) => b.answers)
    : [q.alternateAnswers ?? []];
  if (count < 2) {
    const first = alts[0] ?? [];
    return {
      correctAnswer: mains[0],
      alternateAnswers: first.length > 0 ? first : undefined,
      blankAlternates: undefined,
    };
  }
  const blankAlternates = Array.from({ length: count }, (_, i) => ({
    answers: alts[i] ?? [],
  }));
  return {
    correctAnswer: joinBlanks(
      Array.from({ length: count }, (_, i) => mains[i] ?? '')
    ),
    alternateAnswers: undefined,
    blankAlternates: blankAlternates.some((b) => b.answers.length > 0)
      ? blankAlternates
      : undefined,
  };
}

/** How many blanks `given` fills correctly; `extra` are translated keys joined the same way. */
export function scoreFibBlanks(
  q: FibKey,
  given: string,
  normalize: (s: string) => string,
  extra: readonly string[] = []
): { correct: number; total: number } {
  const accepted = fibBlankAccepted(q);
  const typed = splitBlanks(given);
  const extraParts = extra.map(splitBlanks);
  let correct = 0;
  accepted.forEach((answers, i) => {
    const t = normalize(typed[i] ?? '');
    if (t === '') return;
    const pool = [...answers, ...extraParts.map((p) => p[i] ?? '')];
    if (pool.some((a) => a.trim() !== '' && normalize(a) === t)) correct++;
  });
  return { correct, total: accepted.length };
}

/** The value written to `revealedAnswers` for a multi-blank question. */
export function revealMultiBlank(q: FibKey): string {
  return fibBlankAccepted(q)
    .map((answers) => answers.join(ACCEPTED_SEP))
    .join(FIB_BLANK_SEP);
}

/** Client-side check of a typed multi-blank answer against a revealed value. */
export function revealedBlanksMatch(
  revealed: string,
  given: string,
  normalize: (s: string) => string
): boolean {
  const keys = splitBlanks(revealed);
  const typed = splitBlanks(given);
  return keys.every((k, i) => {
    const t = normalize(typed[i] ?? '');
    return t !== '' && k.split(ACCEPTED_SEP).some((a) => normalize(a) === t);
  });
}

/** "red · blue" for a multi-blank answer or key; empty blanks show a dash. */
export function formatBlanks(
  value: string,
  formatOne: (part: string) => string = (p) => p
): string {
  return splitBlanks(value)
    .map((p) => (p.trim() ? formatOne(p) : '—'))
    .join(' · ');
}

/** What a student submits: each blank trimmed, or '' when every blank is empty. */
export function cleanBlankAnswer(value: string): string {
  if (!value.includes(FIB_BLANK_SEP)) return value.trim();
  const parts = splitBlanks(value).map((p) => p.trim());
  return parts.some(Boolean) ? parts.join(FIB_BLANK_SEP) : '';
}

/** A stored answer as a teacher reads it; single-blank answers are unchanged. */
export function displayFibAnswer(raw: string): string {
  return raw.includes(FIB_BLANK_SEP) ? formatBlanks(raw) : raw;
}

/** A sheet's "red|blue" answer cell becomes a multi-blank key when it names one answer per ___ in the text. */
export function fibKeyFromSheetCell(text: string, cell: string): string {
  const parts = cell.split('|').map((p) => p.trim());
  const blanks = countTextBlanks(text);
  return blanks >= 2 && parts.length === blanks && parts.every(Boolean)
    ? joinBlanks(parts)
    : cell;
}
