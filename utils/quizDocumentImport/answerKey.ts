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
  type KeyItem,
  type KeySection,
  type ReaderOptions,
} from './types';

/** What may trail an entry (R11): `2pts`, `(p. 4)`, `PTS: 1`; groups 3–4 are points. */
const ENTRY_EXTRAS = String.raw`(?:\s*(?:\(\s*(?:p|pg|page)s?\.?\s*\d{1,4}(?:\s*[-–]\s*\d{1,4})?\s*\)|(\d{1,2}(?:\.\d+)?)\s*(?:pts?|points?)\b\.?|PTS\s*:\s*(\d{1,2}(?:\.\d+)?)))*`;

/** `1. B`, `1) b`, `1-B`, `1: B`, `1 B`, `1. T`, `1. True` — alone on the line. */
const KEY_ENTRY = new RegExp(
  String.raw`(\d{1,3})\s*[.):\-–]?\s*(true|false|[a-ft])(?![a-z0-9])` +
    ENTRY_EXTRAS,
  'gi'
);

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

/** Every bookkeeping field and its value, `OBJ: 1.2 Describe…` (E10). */
const TEST_BANK_FIELDS =
  /\b(PTS|DIF|REF|OBJ|TOP|KEY|MSC|NAT|STA|LOC|BLM|NOT|RTN|FEEDBACK)\s*:\s*/g;

/** A test bank's fields by name; a repeated field keeps its first value. */
export function testBankFields(text: string): Map<string, string> {
  const fields = new Map<string, string>();
  const marks = [...text.matchAll(TEST_BANK_FIELDS)];
  marks.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = marks[i + 1]?.index ?? text.length;
    const value = tidy(text.slice(start, end));
    if (value && !fields.has(m[1])) fields.set(m[1], value);
  });
  return fields;
}

/** A key item's `OBJ`, `TOP`, `NAT` and `STA` (E10). */
export function metadataOf(
  text: string
): Pick<KeyItem, 'objective' | 'topic' | 'standards'> {
  const fields = testBankFields(text);
  const standards = [fields.get('NAT'), fields.get('STA')]
    .flatMap((v) => (v ? v.split(/\s*[|,;]\s*/) : []))
    .map((v) => v.trim())
    .filter(Boolean);
  const objective = fields.get('OBJ');
  const topic = fields.get('TOP');
  return {
    ...(objective ? { objective } : {}),
    ...(topic ? { topic } : {}),
    ...(standards.length > 0 ? { standards: [...new Set(standards)] } : {}),
  };
}

/** A test bank's `PTS: 2`. */
const TEST_BANK_POINTS = /\bPTS\s*:\s*(\d{1,2}(?:\.\d+)?)/;

/** The points and metadata printed with an inline `ANS:` (E10). */
export function keyItemFields(
  text: string
): Pick<KeyItem, 'points' | 'objective' | 'topic' | 'standards'> {
  const points = TEST_BANK_POINTS.exec(text);
  return {
    ...(points ? { points: Number(points[1]) } : {}),
    ...metadataOf(text),
  };
}

/** A line that is nothing but test-bank bookkeeping. */
export const TEST_BANK_FIELD_LINE = new RegExp(
  `^\\s*${TEST_BANK_FIELD.source}`
);

/** The question-type headings a test bank's answer section is split by. */
export const TEST_BANK_SECTION =
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

/** Number, answer, and the points printed beside it. */
export type KeyEntry = [number, string, number?];

export interface ParsedKey {
  /** Answer by question number: an uppercase letter, T/F, True/False or written text. */
  answerByNumber: Map<number, string>;
  /** Every entry in order, with its section when the key has several (R10). */
  items: KeyItem[];
  /** Indexes into the input that belong to the key, not to a question. */
  keyLineIndexes: Set<number>;
}

const EMPTY: ParsedKey = {
  answerByNumber: new Map(),
  items: [],
  keyLineIndexes: new Set(),
};

/** "Section 2", "Part II" inside a key; Part A/B is never one. */
const KEY_SECTION = /^\s*(?:section|part)\s+(\d{1,2}|[ivx]{1,4})\b[^?]{0,60}$/i;

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10 };
const romanValue = (text: string): number => {
  let total = 0;
  const chars = text.toLowerCase().split('');
  chars.forEach((c, i) => {
    const value = ROMAN[c] ?? 0;
    total += value < (ROMAN[chars[i + 1]] ?? 0) ? -value : value;
  });
  return total;
};

/** A key's section heading, with the number it printed; null when the line isn't one. */
export function keySectionHeading(text: string): { printed?: number } | null {
  if (isHeading(text)) return null;
  const numbered = KEY_SECTION.exec(text);
  if (numbered) {
    const raw = numbered[1];
    const printed = /^\d+$/.test(raw) ? Number(raw) : romanValue(raw);
    return printed > 0 ? { printed } : {};
  }
  return TEST_BANK_SECTION.test(text) ? {} : null;
}

/** An item, or a section heading met between items. */
export type RawKeyItem = KeyItem | { heading: { printed?: number } };

/**
 * Gives key items their sections: a heading, or numbering that drops back,
 * starts the next one. A key with one section carries none.
 */
export function withKeySections(raws: readonly RawKeyItem[]): KeyItem[] {
  const items: KeyItem[] = [];
  const headed = new Set<number>();
  let ordinal = 0;
  let printed: number | undefined;
  let heading: { printed?: number } | null = null;
  let first: KeyItem | null = null;
  for (const raw of raws) {
    if ('heading' in raw) {
      heading = raw.heading;
      continue;
    }
    // Only a drop back to the section's first number restarts, so a
    // two-column key read row by row (1, 4, 2, 5 …) stays one section.
    const restarted =
      first !== null &&
      (raw.item < first.item ||
        (raw.item === first.item && (raw.part ?? '') <= (first.part ?? '')));
    if (first === null || heading || restarted) {
      ordinal += 1;
      printed = heading?.printed;
      if (heading) headed.add(ordinal);
      heading = null;
      first = raw;
    }
    items.push({
      ...raw,
      section: { ordinal, ...(printed ? { printed } : {}) },
    });
  }

  // A key printed twice without a heading is one key, not two sections.
  const sectionItems = (n: number) =>
    items
      .filter((k) => k.section?.ordinal === n)
      .map((k) => `${k.item}${k.part ?? ''}=${k.answer}`)
      .join(';');
  const repeats = new Set<number>();
  for (let n = 2; n <= ordinal; n += 1) {
    if (!headed.has(n) && sectionItems(n) === sectionItems(n - 1)) {
      repeats.add(n);
    }
  }
  const kept = items.filter((k) => !repeats.has(k.section?.ordinal ?? 0));
  const ordinals = [...new Set(kept.map((k) => k.section?.ordinal ?? 0))];
  if (ordinals.length > 1) {
    return kept.map((k) => ({
      ...k,
      section: {
        ...(k.section as KeySection),
        ordinal: ordinals.indexOf(k.section?.ordinal ?? 0) + 1,
      },
    }));
  }
  return kept.map(({ section: _section, ...rest }) => rest);
}

const entryItem = ([item, answer, points]: KeyEntry): KeyItem => ({
  item,
  answer,
  ...(points !== undefined ? { points } : {}),
});

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
    const points = m[3] ?? m[4];
    found.push([
      Number(m[1]),
      normalizeAnswer(m[2]),
      ...(points ? [Number(points)] : []),
    ] as KeyEntry);
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
  const raws: RawKeyItem[] = [];
  let open: {
    number: number;
    parts: string[];
    points?: number;
    fields: string[];
  } | null = null;
  const close = () => {
    if (open) {
      const answer = normalizeAnswer(open.parts.join(' '), multi);
      if (answer && !answerByNumber.has(open.number)) {
        answerByNumber.set(open.number, answer);
      }
      if (answer || open.points !== undefined) {
        raws.push({
          item: open.number,
          answer,
          ...(open.points !== undefined ? { points: open.points } : {}),
          ...metadataOf(open.fields.join(' ')),
        });
      }
    }
    open = null;
  };

  let collecting = false;
  for (let i = first; i < lines.length; i += 1) {
    const text = lines[i].text;
    const points = TEST_BANK_POINTS.exec(text);
    const entry = TEST_BANK_ENTRY.exec(text);
    if (entry) {
      close();
      const answer = answerBeforeFields(entry[2]);
      open = {
        number: Number(entry[1]),
        parts: answer ? [answer] : [],
        fields: [entry[2]],
      };
      if (points) open.points = Number(points[1]);
      // A blank `ANS:` means the written answer is on the lines below.
      collecting = !answer && !TEST_BANK_FIELD.test(entry[2]);
      continue;
    }
    if (open && points && open.points === undefined) {
      open.points = Number(points[1]);
    }
    if (open && TEST_BANK_FIELD.test(text)) open.fields.push(text);
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

  return { answerByNumber, items: withKeySections(raws), keyLineIndexes };
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

  type Run = { start: number; end: number; raws: RawKeyItem[] };
  let best: Run | null = null;
  let last: Run | null = null;

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
    const start = headed ? headingAt : sectionHeadingsAbove(lines, i);
    const raws: RawKeyItem[] = [];
    for (let n = start; n < i; n += 1) {
      const heading = keySectionHeading(lines[n].text);
      if (heading) raws.push({ heading });
    }
    while (i < lines.length) {
      if (!lines[i].text.trim()) {
        i += 1;
        continue;
      }
      const more = entriesAt(lines, i, headed, asked, multi);
      if (!more) {
        // "Section 2" between runs of entries continues the key.
        const heading = keySectionHeading(lines[i].text);
        const next = nextFilled(lines, i + 1);
        if (
          heading &&
          next !== -1 &&
          entriesAt(lines, next, headed, asked, multi)
        ) {
          raws.push({ heading });
          i = next;
          continue;
        }
        break;
      }
      raws.push(...more.entries.map(entryItem));
      i += more.used;
    }
    const count = raws.filter((r) => !('heading' in r)).length;
    last = { start, end: i, raws };
    if (headed || count >= MIN_RUN) best = last;
  }

  // One or two bare entries closing the document, repeating asked numbers (R8).
  if (!best && last && nextFilled(lines, last.end) === -1) {
    const asked = numbersAbove(lines, last.start);
    const numbers = last.raws.flatMap((r) => ('heading' in r ? [] : [r.item]));
    if (asked.size > 0 && numbers.every((n) => asked.has(n))) best = last;
  }

  if (!best) return EMPTY;

  const items = withKeySections(best.raws);
  const answerByNumber = new Map<number, string>();
  for (const { item, answer } of items) {
    // A repeated number means the block is not a key; keep the first.
    if (!answerByNumber.has(item)) answerByNumber.set(item, answer);
  }

  const keyLineIndexes = new Set<number>();
  for (let n = best.start; n < best.end; n += 1) keyLineIndexes.add(n);
  return { answerByNumber, items, keyLineIndexes };
}

/** The next non-blank line at or after `from`, or -1. */
function nextFilled(lines: readonly DocLine[], from: number): number {
  for (let n = from; n < lines.length; n += 1) {
    if (lines[n].text.trim()) return n;
  }
  return -1;
}

/** The first of the key section headings directly above `index`, or `index`. */
function sectionHeadingsAbove(
  lines: readonly DocLine[],
  index: number
): number {
  let start = index;
  let n = index - 1;
  while (n >= 0) {
    const text = lines[n].text;
    if (text.trim() && !keySectionHeading(text)) break;
    if (text.trim()) start = n;
    n -= 1;
  }
  return start;
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
  while (
    n >= 0 &&
    (!lines[n].text.trim() || keySectionHeading(lines[n].text) !== null)
  ) {
    n -= 1;
  }
  return n >= 0 && isHeading(lines[n].text) ? n : -1;
}

/**
 * Every entry in a file that is nothing but a key. A test-bank key is read the
 * same way as at the back of a test; otherwise each line stands on its own.
 */
export function listKeyItems(
  lines: readonly DocLine[],
  options: ReaderOptions = {}
): KeyItem[] {
  const multi = options.multiAnswer === true;
  const testBank = findTestBankKey(lines, multi);
  if (testBank) return testBank.items;

  const headed = lines.some((l) => isHeading(l.text));
  const raws: RawKeyItem[] = [];
  let i = 0;
  while (i < lines.length) {
    const text = lines[i].text;
    const found = text.trim()
      ? entriesAt(lines, i, headed, undefined, multi)
      : null;
    if (!found) {
      const heading = text.trim() ? keySectionHeading(text) : null;
      if (heading) raws.push({ heading });
      i += 1;
      continue;
    }
    raws.push(...found.entries.map(entryItem));
    i += found.used;
  }
  return withKeySections(raws);
}

/** A key file's answers by number; the first answer for a number wins. */
export function keyFromLines(
  lines: readonly DocLine[],
  options: ReaderOptions = {}
): Map<number, string> {
  const byNumber = new Map<number, string>();
  for (const { item, answer } of listKeyItems(lines, options)) {
    // A key printed twice is likelier a header repeat than a correction.
    if (!byNumber.has(item)) byNumber.set(item, answer);
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

  if (question.examView === 'modifiedTf') {
    return applyModifiedTrueFalse(question, answer);
  }

  if (
    (question.examView === 'completion' || question.examView === 'numeric') &&
    question.type === 'FIB'
  ) {
    return { ...question, correctAnswer: answer };
  }

  if (question.type === 'MC' && !multi && LETTER_LIST.test(answer)) {
    return note(
      question,
      `The answer key gives more than one answer (${answer}) for a one-answer question, so pick the answer in the editor.`
    );
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
        ? overruled(shownAs(question, [previous]), option.letter || said)
        : `This question was marked with a different answer (${previous}); the answer key’s answer was used.`
    );
  }

  if (question.type === 'FIB' && !isLetter(answer) && !isList) {
    return { ...question, correctAnswer: answer };
  }

  if (question.type === 'free-response') {
    if (question.examView === 'written') {
      return note(question, `Key’s sample answer: ${answer}`);
    }
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

/** `T`, or `F, producers`: the answer, and the word that makes a false statement true (E7). */
const MODIFIED_TRUE_FALSE = /^(true|false|t|f)\b\s*[,;:.\-–—]?\s*(.*)$/i;

function applyModifiedTrueFalse(
  question: ExtractedQuestion,
  answer: string
): ExtractedQuestion {
  const m = MODIFIED_TRUE_FALSE.exec(answer.trim());
  if (!m) {
    return note(
      question,
      `The answer key says “${answer}”, which isn’t True or False.`
    );
  }
  const isTrue = TRUE_ANSWER.test(m[1]);
  const option = question.options.find((o) =>
    (isTrue ? TRUE_ANSWER : FALSE_ANSWER).test(o.text.trim())
  );
  const keyed = { ...question, correctAnswer: option?.text ?? '' };
  const correction = tidy(m[2]);
  if (isTrue || !correction) {
    const { correction: _dropped, ...rest } = keyed;
    return isTrue
      ? rest
      : note(
          rest,
          'The answer key says False but doesn’t give the word that makes it true.'
        );
  }
  return { ...keyed, correction };
}

/** Answer texts as the letters the test printed, where they have one. */
function shownAs(
  question: ExtractedQuestion,
  texts: readonly string[]
): string {
  return texts
    .map((text) => {
      // An AI-read option can carry an empty letter.
      const option = question.options.find(
        (o) =>
          o.letter && (o.text === text || multiAnswerKey([o.text]) === text)
      );
      return option?.letter ?? text;
    })
    .join(', ');
}

/** R10: the key file wins, and the row says what it overruled. */
const overruled = (test: string, key: string): string =>
  `Test file said ${test}, key file said ${key} — using ${key}.`;

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
      ? overruled(
          shownAs(question, previous.split('|')),
          shownAs(question, key.split('|'))
        )
      : `This question was marked with a different answer (${shown}); the answer key’s answer was used.`
  );
}
