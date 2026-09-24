/**
 * Finds and applies an answer key (docs/plans/QUIZ_DOCUMENT_IMPORT.md D2, D8).
 *
 * Teachers rarely mark the answer on the question; they print a key at the
 * back. The hard part is that a key entry ("1. B") is written exactly like a
 * numbered question whose text happens to be "B". Three things separate them:
 * a key entry is a number and an answer and nothing else, key entries come in
 * runs, and the run repeats numbers the questions already used. So the key is
 * found first and those lines are withheld from the question parser, rather
 * than the parser trying to tell them apart one line at a time.
 *
 * Test-bank exports (ExamView and its clones) print their own shape: an
 * "Answer Section" of `1. ANS: B PTS: 1` entries, with written answers on the
 * line below `ANS:`. That shape is unambiguous, so it is read first.
 */

import {
  multiAnswerKey,
  type DocLine,
  type ExtractedQuestion,
  type ExtractedQuiz,
  type ReaderOptions,
} from './types';

/** `1. B`, `1) b`, `1-B`, `1: B`, `1 B`, `1. T`, `1. True` — alone on the line. */
const KEY_ENTRY = /(\d{1,3})\s*[.):\-–]?\s*(true|false|[a-ft])(?![a-z0-9])/gi;

/** `1. B - producer`, `1. B. producer`: a letter, then the choice it names. */
const LETTER_WITH_TEXT = /^\s*(\d{1,3})\s*[.):\-–]\s*([a-f])\s*[.):\-–—]\s+\S/i;

/** `3. A, C` / `3. A and C`: one question keyed with several letters. */
const LETTER_LIST_ENTRY =
  /^\s*(\d{1,3})\s*[.):\-–]?\s*([a-f](?:\s*(?:,|;|&|\band\b)\s*[a-f]|\s+[a-f])+)\s*$/i;

/** A key answer naming several letters, already normalized to `A, C`. */
const LETTER_LIST = /^[A-F](?:, [A-F])+$/;

/** Any numbered line, which under a key heading is an entry with a written answer. */
const NUMBERED_ENTRY = /^\s*(\d{1,3})\s*[.):\-–]\s*(.+)$/;

/** A number on its own line, as a Word key table's first column comes out. */
const NUMBER_ONLY = /^\s*(\d{1,3})\s*[.)]?\s*$/;

/** ExamView-style `1. ANS: B PTS: 1`; the answer may be on the next line. */
const TEST_BANK_ENTRY = /^\s*(\d{1,3})\s*[.)]?\s*ANS\s*:\s*(.*)$/i;

/** `ANS: B` printed under its own question rather than in a section at the back. */
export const INLINE_TEST_BANK_ANSWER = /^\s*ANS\s*:\s*(.*)$/i;

/** The bookkeeping fields a test bank prints after the answer. Case-sensitive. */
const TEST_BANK_FIELD =
  /(?:PTS|DIF|REF|OBJ|TOP|KEY|MSC|NAT|STA|LOC|BLM|NOT|RTN|FEEDBACK)\s*:/;

/** A line that is nothing but test-bank bookkeeping. */
export const TEST_BANK_FIELD_LINE = new RegExp(
  `^\\s*${TEST_BANK_FIELD.source}`
);

/** The question-type headings a test bank's answer section is split by. */
const TEST_BANK_SECTION =
  /^\s*(?:multiple\s+choice|multiple\s+response|modified\s+true\s*\/\s*false|true\s*\/\s*false|yes\s*\/\s*no|completion|matching|short\s+answer|essay|problem|other|numeric\s+response)\s*$/i;

/** "Answer Key", "Answer Section", "Unit 3 Test - Answer Key". */
const STRONG_HEADING =
  /^\s*(?:(?:answer\s*(?:key|section|sheet)s?|correct\s+answers)\b.{0,60}|.{0,60}\banswer\s*(?:key|section)\s*:?)\s*$/i;

/** "Answers", "Key:", "Question  Answer" — only when that is the whole line. */
const WEAK_HEADING =
  /^\s*(?:answers?|keys?|solutions?|(?:question|item|no\.?|#|number)\s*[|:]?\s*(?:answer|key))\s*(?:[:\-–—(|].{0,40})?$/i;

export const isHeading = (text: string): boolean =>
  !/^\s*\d/.test(text) &&
  (STRONG_HEADING.test(text) || WEAK_HEADING.test(text));

/** Shortest run of bare entries trusted without a heading above it. */
const MIN_RUN = 3;

/** An option line, which must never be taken for a title above a key. */
const OPTION_LIKE = /^\s*\(?[a-f][.)]\s/i;

export type KeyEntry = [number, string];

export interface ParsedKey {
  /** Answer by question number: an uppercase letter, T/F, True/False or written text. */
  answerByNumber: Map<number, string>;
  /** Indexes into the input that belong to the key, not to a question. */
  keyLineIndexes: Set<number>;
}

const EMPTY: ParsedKey = {
  answerByNumber: new Map(),
  keyLineIndexes: new Set(),
};

const tidy = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** The letters of `a and c` / `A, C`, uppercased. */
const listedLetters = (text: string): string[] =>
  text
    .replace(/\band\b/gi, ' ')
    .toUpperCase()
    .match(/[A-F]/g) ?? [];

/** Uppercase a letter, title-case True/False, leave written answers as printed. */
function normalizeAnswer(raw: string, multi = false): string {
  const text = tidy(raw);
  if (/^[a-ft]$/i.test(text)) return text.toUpperCase();
  if (multi && /^[a-f](?:\s*(?:,|;|&|\band\b)\s*[a-f])+$/i.test(text)) {
    return listedLetters(text).join(', ');
  }
  if (/^true$/i.test(text)) return 'True';
  if (/^false$/i.test(text)) return 'False';
  return text;
}

/**
 * Entries on one line, but only if the line is *nothing but* entries — so
 * "1. B" and "1. B 2. C 3. A" count while "1. Because the moon..." does not.
 */
export function entriesOnLine(text: string, multi = false): KeyEntry[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const list = multi ? LETTER_LIST_ENTRY.exec(trimmed) : null;
  if (list) {
    return [[Number(list[1]), listedLetters(list[2]).join(', ')]];
  }
  const withText = LETTER_WITH_TEXT.exec(trimmed);
  if (withText) return [[Number(withText[1]), withText[2].toUpperCase()]];
  const found: KeyEntry[] = [];
  for (const m of trimmed.matchAll(KEY_ENTRY)) {
    found.push([Number(m[1]), normalizeAnswer(m[2])]);
  }
  if (found.length === 0) return [];
  // Whatever sits between entries must be separators, never words.
  const leftover = trimmed.replace(KEY_ENTRY, '').replace(/[\s,;|]/g, '');
  return leftover.length > 0 ? [] : found;
}

/** The answer text after `ANS:`, cut off where the bookkeeping starts. */
export const answerBeforeFields = (text: string): string => {
  const at = text.search(TEST_BANK_FIELD);
  return tidy(at === -1 ? text : text.slice(0, at));
};

/** A test bank's answer section, from its first entry to the end of the document. */
function findTestBankKey(
  lines: readonly DocLine[],
  multi = false
): ParsedKey | null {
  const first = lines.findIndex((l) => TEST_BANK_ENTRY.test(l.text));
  if (first === -1) return null;

  const answerByNumber = new Map<number, string>();
  let open: { number: number; parts: string[] } | null = null;
  const close = () => {
    if (open && !answerByNumber.has(open.number)) {
      const answer = normalizeAnswer(open.parts.join(' '), multi);
      if (answer) answerByNumber.set(open.number, answer);
    }
    open = null;
  };

  let collecting = false;
  for (let i = first; i < lines.length; i += 1) {
    const text = lines[i].text;
    const entry = TEST_BANK_ENTRY.exec(text);
    if (entry) {
      close();
      const answer = answerBeforeFields(entry[2]);
      open = { number: Number(entry[1]), parts: answer ? [answer] : [] };
      // A blank `ANS:` means the written answer is on the lines below.
      collecting = !answer && !TEST_BANK_FIELD.test(entry[2]);
      continue;
    }
    if (!open || !collecting) continue;
    if (
      !text.trim() ||
      TEST_BANK_FIELD_LINE.test(text) ||
      TEST_BANK_SECTION.test(text)
    ) {
      if (text.trim()) collecting = false;
      continue;
    }
    const answer = answerBeforeFields(text);
    if (answer) open.parts.push(answer);
    if (TEST_BANK_FIELD.test(text)) collecting = false;
  }
  close();

  const keyLineIndexes = new Set<number>();
  for (let n = first; n < lines.length; n += 1) keyLineIndexes.add(n);
  // Walk up over "MULTIPLE CHOICE", "Answer Section" and the title printed above it.
  let n = first - 1;
  while (n >= 0) {
    const text = lines[n].text;
    if (!text.trim() || TEST_BANK_SECTION.test(text)) {
      keyLineIndexes.add(n);
      n -= 1;
      continue;
    }
    if (isHeading(text)) {
      keyLineIndexes.add(n);
      const above = lines[n - 1]?.text ?? '';
      if (above.trim() && !OPTION_LIKE.test(above) && !/^\s*\d/.test(above)) {
        keyLineIndexes.add(n - 1);
      }
    }
    break;
  }

  return { answerByNumber, keyLineIndexes };
}

/**
 * One key entry starting at `index`, and how many lines it used. A headed run
 * also takes numbered lines with a written answer; a bare run takes letters only.
 */
function entriesAt(
  lines: readonly DocLine[],
  index: number,
  headed: boolean,
  /** In a test, a written answer must repeat a question number printed above it. */
  askedNumbers?: ReadonlySet<number>,
  multi = false
): { entries: KeyEntry[]; used: number } | null {
  const text = lines[index].text;
  const entries = entriesOnLine(text, multi);
  if (entries.length > 0) return { entries, used: 1 };

  // A Word table puts the number and the answer in separate paragraphs.
  const number = NUMBER_ONLY.exec(text);
  const next = lines[index + 1]?.text.trim() ?? '';
  if (number && /^(?:true|false|[a-ft])$/i.test(next)) {
    return { entries: [[Number(number[1]), normalizeAnswer(next)]], used: 2 };
  }

  if (headed) {
    const numbered = NUMBERED_ENTRY.exec(text);
    if (numbered && (!askedNumbers || askedNumbers.has(Number(numbered[1])))) {
      return {
        entries: [[Number(numbered[1]), normalizeAnswer(numbered[2], multi)]],
        used: 1,
      };
    }
  }
  return null;
}

/**
 * The key block is the LAST run of entry lines in the document: a test that
 * prints its key does it at the back, and a stray "1. B" early on is not a
 * run. A run directly under an "Answer Key" heading is taken at any length,
 * and may carry written answers as well as letters.
 */
export function findAnswerKey(
  lines: readonly DocLine[],
  options: ReaderOptions = {}
): ParsedKey {
  const multi = options.multiAnswer === true;
  const testBank = findTestBankKey(lines, multi);
  if (testBank) return testBank;

  let best: { start: number; end: number; entries: KeyEntry[] } | null = null;

  let i = 0;
  while (i < lines.length) {
    const headingAt = headingAbove(lines, i);
    const headed = headingAt !== -1;
    const asked = headed ? numbersAbove(lines, headingAt) : undefined;
    const first = entriesAt(lines, i, headed, asked, multi);
    if (!first) {
      i += 1;
      continue;
    }
    const start = headed ? headingAt : i;
    const run: KeyEntry[] = [];
    while (i < lines.length) {
      if (!lines[i].text.trim()) {
        i += 1;
        continue;
      }
      const more = entriesAt(lines, i, headed, asked, multi);
      if (!more) break;
      run.push(...more.entries);
      i += more.used;
    }
    if (headed || run.length >= MIN_RUN) {
      best = { start, end: i, entries: run };
    }
  }

  if (!best) return EMPTY;

  const answerByNumber = new Map<number, string>();
  for (const [n, answer] of best.entries) {
    // A repeated number means the block is not a key; keep the first.
    if (!answerByNumber.has(n)) answerByNumber.set(n, answer);
  }

  const keyLineIndexes = new Set<number>();
  for (let n = best.start; n < best.end; n += 1) keyLineIndexes.add(n);
  return { answerByNumber, keyLineIndexes };
}

/** Question numbers opened before `end`, so "Key: Vocabulary" over new questions isn't a key. */
function numbersAbove(lines: readonly DocLine[], end: number): Set<number> {
  const numbers = new Set<number>();
  for (let n = 0; n < end; n += 1) {
    const m = NUMBERED_ENTRY.exec(lines[n].text);
    if (m) numbers.add(Number(m[1]));
  }
  return numbers;
}

/** Index of a key heading directly above `index` (blank lines between allowed), or -1. */
function headingAbove(lines: readonly DocLine[], index: number): number {
  let n = index - 1;
  while (n >= 0 && !lines[n].text.trim()) n -= 1;
  return n >= 0 && isHeading(lines[n].text) ? n : -1;
}

/**
 * Every entry in a file that is nothing but a key. A test-bank key is read the
 * same way as at the back of a test; otherwise each line stands on its own.
 */
export function keyFromLines(
  lines: readonly DocLine[],
  options: ReaderOptions = {}
): Map<number, string> {
  const multi = options.multiAnswer === true;
  const testBank = findTestBankKey(lines, multi);
  if (testBank) return testBank.answerByNumber;

  const headed = lines.some((l) => isHeading(l.text));
  const byNumber = new Map<number, string>();
  let i = 0;
  while (i < lines.length) {
    const found = lines[i].text.trim()
      ? entriesAt(lines, i, headed, undefined, multi)
      : null;
    if (!found) {
      i += 1;
      continue;
    }
    for (const [number, answer] of found.entries) {
      // First wins: a key printed twice is likelier a header repeat than a
      // correction, and silently taking the later one would be invisible.
      if (!byNumber.has(number)) byNumber.set(number, answer);
    }
    i += found.used;
  }
  return byNumber;
}

/* ─── Applying a key ──────────────────────────────────────────────────────── */

/** Where the key came from, which only changes how the notes read. */
export type KeySource = 'document' | 'file';

const isLetter = (answer: string): boolean => /^[A-F]$/.test(answer);
const TRUE_ANSWER = /^(?:t|true)$/i;
const FALSE_ANSWER = /^(?:f|false)$/i;

/** Short enough to grade as fill in the blank; "Answers will vary" is not. */
const isShortAnswer = (answer: string): boolean =>
  answer.split(/\s+/).length <= 4 && !/\bvar(?:y|ies)\b/i.test(answer);

function choiceFor(
  question: ExtractedQuestion,
  answer: string
): ExtractedQuestion['options'][number] | undefined {
  const byLetter = question.options.find((o) => o.letter === answer);
  if (byLetter) return byLetter;
  if (TRUE_ANSWER.test(answer)) {
    return question.options.find((o) => TRUE_ANSWER.test(o.text.trim()));
  }
  if (FALSE_ANSWER.test(answer)) {
    return question.options.find((o) => FALSE_ANSWER.test(o.text.trim()));
  }
  const lower = answer.toLowerCase();
  return question.options.find((o) => o.text.trim().toLowerCase() === lower);
}

const note = (
  question: ExtractedQuestion,
  text: string
): ExtractedQuestion => ({
  ...question,
  warnings: [...question.warnings, text],
});

/** Put one key answer on one question, or say why it couldn't be. */
export function applyKeyAnswer(
  question: ExtractedQuestion,
  answer: string,
  source: KeySource = 'file',
  multi = false
): ExtractedQuestion {
  const isList = multi && LETTER_LIST.test(answer);
  const said = isLetter(answer) || isList ? answer : `“${answer}”`;

  if ((question.type === 'MC' || question.type === 'MA') && isList) {
    return applyLetterList(question, answer, source);
  }

  if (question.type === 'MA') {
    const option = choiceFor(question, answer);
    if (!option) {
      return note(
        question,
        `The answer key says ${said}, which doesn’t match any of this question’s choices.`
      );
    }
    return withKeyedAnswers(question, multiAnswerKey([option.text]), source);
  }

  if (question.type === 'MC') {
    const option = choiceFor(question, answer);
    if (!option) {
      return note(
        question,
        isLetter(answer)
          ? `The answer key says ${answer}, but this question has no option ${answer}.`
          : `The answer key says ${said}, which doesn’t match any of this question’s choices.`
      );
    }
    const previous = question.correctAnswer.trim();
    const disagrees = previous && previous !== option.text;
    const next = { ...question, correctAnswer: option.text };
    if (!disagrees) return next;
    return note(
      next,
      source === 'file'
        ? `The test document answered this differently (${previous}); the key file’s answer was used.`
        : `This question was marked with a different answer (${previous}); the answer key’s answer was used.`
    );
  }

  if (question.type === 'FIB' && !isLetter(answer) && !isList) {
    return { ...question, correctAnswer: answer };
  }

  if (question.type === 'free-response') {
    if (
      isLetter(answer) ||
      isList ||
      TRUE_ANSWER.test(answer) ||
      FALSE_ANSWER.test(answer)
    ) {
      return note(
        question,
        `The answer key says ${answer} for this question, so its answer choices were probably missed.`
      );
    }
    // A question the reader already flagged (a graph, a drawing) stays written.
    if (isShortAnswer(answer) && question.warnings.length === 0) {
      return note(
        { ...question, type: 'FIB', correctAnswer: answer },
        `The answer key gives a short answer (${said}), so this came in as fill in the blank. Change it back if students should write more.`
      );
    }
    return note(question, `The answer key says: ${said}`);
  }

  return note(
    question,
    `The key gives ${said} for this question, but it isn’t multiple choice, so it was left as read.`
  );
}

/** Several letters key a choose-all question; an MC question becomes one. */
function applyLetterList(
  question: ExtractedQuestion,
  answer: string,
  source: KeySource
): ExtractedQuestion {
  const letters = answer.split(', ');
  const missing = letters.filter(
    (l) => !question.options.some((o) => o.letter === l)
  );
  if (missing.length > 0) {
    return note(
      question,
      `The answer key says ${answer}, but this question has no option ${missing.join(', ')}.`
    );
  }
  const texts = question.options
    .filter((o) => letters.includes(o.letter))
    .map((o) => o.text);
  const keyed = withKeyedAnswers(
    { ...question, type: 'MA' },
    multiAnswerKey(texts),
    source
  );
  return question.type === 'MA'
    ? keyed
    : note(
        keyed,
        `The answer key gives more than one answer (${answer}), so this came in as choose all that apply.`
      );
}

/** Set a choose-all key, noting when it overrides a different marked answer. */
function withKeyedAnswers(
  question: ExtractedQuestion,
  key: string,
  source: KeySource
): ExtractedQuestion {
  const previous = question.correctAnswer.trim();
  const next = { ...question, correctAnswer: key };
  if (!previous || previous === key) return next;
  const shown = previous.split('|').join(', ');
  return note(
    next,
    source === 'file'
      ? `The test document answered this differently (${shown}); the key file’s answer was used.`
      : `This question was marked with a different answer (${shown}); the answer key’s answer was used.`
  );
}

const ordinal = (numbers: number[]): string =>
  numbers.length === 1
    ? `question ${numbers[0]}`
    : `questions ${numbers.join(', ')}`;

/**
 * Matches a key onto the questions by number. The key wins over an answer
 * marked on the question, because a key is what a teacher grades from.
 */
export function applyAnswerKey(
  quiz: ExtractedQuiz,
  key: ReadonlyMap<number, string>,
  source: KeySource = 'file',
  options: ReaderOptions = {}
): ExtractedQuiz {
  if (key.size === 0) return quiz;

  const questions = quiz.questions.map((question) => {
    const answer = key.get(question.number);
    return answer
      ? applyKeyAnswer(question, answer, source, options.multiAnswer === true)
      : question;
  });

  const numbers = new Set(quiz.questions.map((q) => q.number));
  const unmatched = [...key.keys()]
    .filter((n) => !numbers.has(n))
    .sort((a, b) => a - b);
  const warnings = [...quiz.warnings];
  if (unmatched.length > 0) {
    const verb = unmatched.length === 1 ? 'isn’t' : 'aren’t';
    warnings.push(
      source === 'file'
        ? `The answer key has an answer for ${ordinal(unmatched)}, which ${verb} in this test.`
        : `The answer key at the end of the document has an answer for ${ordinal(unmatched)}, which ${verb} among the questions read.`
    );
  }

  return { ...quiz, questions, warnings };
}
