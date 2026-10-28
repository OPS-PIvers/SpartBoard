import type { PollQuestion, PollQuestionKind } from '@/types';
import {
  aggregateVotes,
  answerTime,
  type PollVoteEntry,
} from '@/components/poll/pollSession';
import {
  isScaleQuestion,
  isTextQuestion,
  scaleAverage,
} from '@/utils/pollQuestions';

export interface PollOptionSummary {
  label: string;
  count: number;
  /** Share of this question's answers, 0 to 100, rounded. */
  percent: number;
  correct: boolean;
}

export interface PollQuestionSummary {
  question: string;
  kind: PollQuestionKind;
  answered: number;
  options: PollOptionSummary[];
  /** Rating scale questions only; null with no votes. */
  average: number | null;
  /** Typed answers, newest first; word clouds are grouped with counts. */
  texts: { text: string; count: number }[];
}

const percentOf = (count: number, total: number): number =>
  total === 0 ? 0 : Math.round((count / total) * 100);

/** Word cloud matching: ignore case and spacing. */
export const cloudKey = (text: string): string =>
  text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

// cyrb53: words hidden before owner-only hidden_words were stored in board config as this hash.
const hashWord = (word: string): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < word.length; i++) {
    const ch = word.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

/** Legacy `hiddenResponses` key for a word cloud word (`word` is already a cloudKey); still honoured, never written. */
export const legacyHiddenWordKey = (questionId: string, word: string): string =>
  `${questionId}#${hashWord(word)}`;

const typedAnswers = (answers: PollVoteEntry[]): PollVoteEntry[] =>
  answers
    .filter((a) => typeof a.text === 'string' && a.text.trim() !== '')
    .sort((a, b) => answerTime(b) - answerTime(a));

/** Answers the teacher hid on the board stay out of the list, as they do on the board. */
const summarizeTexts = (
  q: PollQuestion,
  answers: PollVoteEntry[],
  hidden: ReadonlySet<string>,
  hiddenWords: ReadonlySet<string>
): { text: string; count: number }[] => {
  const shown = answers
    .filter((a) => !hidden.has(`${q.id}:${a.id}`))
    .map((a) => (a.text ?? '').trim());
  if (q.kind !== 'words') return shown.map((text) => ({ text, count: 1 }));
  const counts = new Map<string, number>();
  for (const text of shown) {
    const key = cloudKey(text);
    if (!hiddenWords.has(key) && !hidden.has(legacyHiddenWordKey(q.id, key)))
      counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([text, count]) => ({ text, count }));
};

/** Per-question results from a session's votes and typed answers. */
export const summarizePoll = (
  questions: PollQuestion[],
  votes: PollVoteEntry[],
  answers: PollVoteEntry[],
  hiddenResponses: readonly string[] = [],
  /** Word cloud words the owner hid, by question id. */
  hiddenWords: ReadonlyMap<string, readonly string[]> = new Map()
): PollQuestionSummary[] => {
  const hidden = new Set(hiddenResponses);
  return questions.map((q, index) => {
    const kind = q.kind ?? 'choice';
    if (isTextQuestion(q)) {
      const mine = typedAnswers(
        answers.filter((a) => a.questionIndex === index)
      );
      return {
        question: q.question,
        kind,
        answered: mine.length,
        options: [],
        average: null,
        texts: summarizeTexts(
          q,
          mine,
          hidden,
          new Set(hiddenWords.get(q.id) ?? [])
        ),
      };
    }
    const counts = aggregateVotes(votes, index, q.options.length);
    const answered = counts.reduce((sum, n) => sum + n, 0);
    return {
      question: q.question,
      kind,
      answered,
      options: q.options.map((o, i) => ({
        label: o.label,
        count: counts[i] ?? 0,
        percent: percentOf(counts[i] ?? 0, answered),
        correct: o.correct === true,
      })),
      average: isScaleQuestion(q) ? scaleAverage(counts) : null,
      texts: [],
    };
  });
};

/** Results from the board's own tallies, for a poll that never ran on devices. */
export const summarizeLocalPoll = (
  questions: PollQuestion[]
): PollQuestionSummary[] =>
  questions.map((q) => {
    const counts = q.options.map((o) => o.votes);
    const answered = counts.reduce((sum, n) => sum + n, 0);
    return {
      question: q.question,
      kind: q.kind ?? 'choice',
      answered,
      options: q.options.map((o) => ({
        label: o.label,
        count: o.votes,
        percent: percentOf(o.votes, answered),
        correct: o.correct === true,
      })),
      average: isScaleQuestion(q) ? scaleAverage(counts) : null,
      texts: [],
    };
  });

// Quote every field, and defuse values a spreadsheet would run as a formula.
const csvField = (value: string | number): string => {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** One row per option or typed answer, plus an Average row for rating scales. */
export const pollResultsCsv = (summaries: PollQuestionSummary[]): string => {
  const rows: (string | number)[][] = [
    ['Question', 'Answer', 'Count', 'Percent', 'Correct'],
  ];
  for (const s of summaries) {
    for (const o of s.options) {
      rows.push([
        s.question,
        o.label,
        o.count,
        o.percent,
        o.correct ? 'Yes' : '',
      ]);
    }
    if (s.average !== null) {
      rows.push([s.question, 'Average', s.average.toFixed(1), '', '']);
    }
    for (const t of s.texts) {
      rows.push([
        s.question,
        t.text,
        t.count,
        percentOf(t.count, s.answered),
        '',
      ]);
    }
  }
  return rows.map((r) => r.map(csvField).join(',')).join('\n');
};
