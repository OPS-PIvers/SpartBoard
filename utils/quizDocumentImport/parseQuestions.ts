/**
 * Turns a document's lines into questions
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D2, D12; QUIZ_IMPORT_RELIABILITY.md R5–R9, R23, R25).
 *
 * Extract, never invent: a stem is what the document printed, options are
 * kept as written with no minimum count, and a question the reader cannot
 * type becomes free-response carrying a warning rather than a guess.
 */

import type { QuizQuestionType } from '@/types';
import { matchQuestionOpening } from '@/utils/questionNumbering';
import {
  INLINE_TEST_BANK_ANSWER,
  TEST_BANK_FIELD_LINE,
  answerBeforeFields,
  applyKeyAnswer,
  entriesOnLine,
  findAnswerKey,
  isHeading,
} from './answerKey';
import { EXAMVIEW_TYPE_HEADING, WRITTEN_SECTION, isExamView } from './examView';
import { keyedQuestionIndexes, mergeAnswerKey } from './mergeKey';
import {
  SELECT_ALL_WORDING,
  lineSegments,
  multiAnswerKey,
  type DocLine,
  type DocSegment,
  type ExtractedOption,
  type ExtractedQuestion,
  type ExtractedText,
  type KeySummary,
  type QuestionRef,
  type ReaderOptions,
  type SuggestedTarget,
} from './types';

/** `A.` / `b)` / `(C)` opening an option, optionally starred as the answer. */
const OPTION = /^\s*(\*\s*)?\(?([A-Fa-f])[.)]\s*(.*)$/;
/** A bare `(C)` form, where the letter is wrapped rather than punctuated. */
const OPTION_PAREN = /^\s*(\*\s*)?\(([A-Fa-f])\)\s*(.*)$/;

const TRUE_FALSE = /^(true|false|t|f)$/i;

/** `Part A` / `Part B:` inside one numbered item (R9). */
const PART = /^\s*part\s+([a-d])\b\s*[:.)\-–—]?\s*(.*)$/i;

/** `Section 2`, `Part II`, `Unit 3: Reading` (R7). */
const NUMBERED_SECTION =
  /^\s*(section|part|unit|chapter)\s+(\d{1,2}|[IVXLC]{1,5}|[A-Z])\b\s*[:.\-–—]?\s*([^?]{0,80})$/i;

/** A short standalone heading naming a kind of question (R7). */
const NAMED_SECTION =
  /^\s*(?:multiple[\s-]+choice|short[\s-]+answers?|true\s*(?:\/|or|-|and)\s*false|matching|essays?|completion|fill[\s-]+in[\s-]+the[\s-]+blanks?|constructed[\s-]+response|extended[\s-]+response|open[\s-]+(?:ended|response)|graphing(?:\s+problems?)?|word\s+problems?|problems?|vocabulary|reading(?:\s+comprehension)?|writing|bonus|self[\s-]?reflection|reflection|survey|fluency|critical\s+thinking)\b[^?]{0,50}$/i;

/** Items under these headings are not graded questions (R9). */
const UNGRADED_SECTION =
  /self[\s-]?(?:reflection|assessment)|\bsurvey\b|\breflection\b/i;

/** `ELT 1.1-I can explain…`, `LT3: I can…`, or a bare `I can…` (R9). */
const TARGET =
  /^\s*(?:([A-Z]{1,6}[\s-]?\d+(?:\.\d+)*[A-Za-z]?)\s*[-–—:]?\s*)?(I\s+can\b.*)$/;

/** "Read the passage and answer questions 3–5", "Questions 6-8 refer to…" (R25). */
const RANGE_INSTRUCTION =
  /\b(?:questions?|items?|numbers?)\s+(\d{1,3})\s*(?:-|–|—|to|through|and)\s*(\d{1,3})\b/i;

/** A lead-in sentence that tells students what to read, kept in the stem (R25). */
const READ_INSTRUCTION =
  /^\s*(?:read|reread|re-read|look\s+at|use|study|refer\s+to|listen\s+to)\b/i;

/** An imperative "Number/Put/Arrange … in order" sentence, not a question about order. */
const ORDERING =
  /(?:^|[.!:;]\s+)(?:number|put|place|arrange|rearrange|list|write)\b[^.?]*\bin\s+(?:the\s+)?(?:correct\s+|right\s+|chronological\s+|time\s+)?order\b/i;

const SORTING =
  /\bdraw\s+a\s+line\s+to\s+sort\b|\bsort\s+(?:the|each|these)?\s*[^.?]*\binto\b|\bsort\s+(?:them|each)\b/i;

/** "Read the poem below", which makes an unranged preamble a shared passage. */
const PASSAGE_CUE =
  /\b(?:read|reread|re-read)\b[^.?!]*\b(?:passage|poem|story|article|excerpt|text|paragraphs?|selection|letter|speech)\b/i;

/** A shared lead-in at or under this length is copied into each stem (R25). */
const SHORT_LEAD_IN = 150;

const tidy = (s: string): string => s.replace(/\s+/g, ' ').trim();

const isOptionText = (text: string): boolean =>
  OPTION_PAREN.test(text) || OPTION.test(text);

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const romanValue = (s: string): number => {
  let total = 0;
  for (let i = 0; i < s.length; i += 1) {
    const v = ROMAN[s[i]] ?? 0;
    const next = ROMAN[s[i + 1]] ?? 0;
    total += v < next ? -v : v;
  }
  return total;
};

/** Lines a column split produced, so out-of-order letters there are expected. */
const columnLines = new WeakSet<DocLine>();

/** Two or more spaces before an option marker: a column gap typed with the space bar (E2). */
const SPACED_OPTION = /\s{2,}(?=(?:\([A-Fa-f]\)|[A-Fa-f][.)])(?:\s|$))/;
const OPTION_MARKER = /^\s*(?:\(([A-Fa-f])\)|([A-Fa-f])[.)])(?:\s|$)/;

/** `____`, an answer blank printed in a column of its own. */
const isBlankGroup = (group: readonly DocSegment[] | undefined): boolean =>
  group !== undefined &&
  group.length > 0 &&
  group.every((s) => /^_{2,}$/.test(s.text.trim()));

/** Letters that step evenly upward, `a b c` or a grid row's `a d`. */
function isOptionRun(letters: readonly string[]): boolean {
  if (letters.length < 2) return false;
  const sameCase = letters.every(
    (l) => (l === l.toUpperCase()) === (letters[0] === letters[0].toUpperCase())
  );
  const codes = letters.map((l) => l.toUpperCase().charCodeAt(0));
  const step = codes[1] - codes[0];
  return (
    sameCase && step > 0 && codes.every((c, i) => c === codes[0] + i * step)
  );
}

/** Split `a. one    b. two` at its space-bar gaps when the markers form a run (E2). */
function splitSpacedOptions(line: DocLine): DocLine {
  const pieces: DocSegment[] = [];
  let split = false;
  for (const segment of lineSegments(line)) {
    const parts = segment.text.split(SPACED_OPTION);
    if (parts.length > 1) split = true;
    parts.forEach((text, i) => {
      // Only the first piece keeps the segment's position.
      pieces.push(
        i === 0
          ? { ...segment, text }
          : { text, ...(segment.emphasized ? { emphasized: true } : {}) }
      );
    });
  }
  if (!split) return line;
  const filled = pieces.filter((p) => p.text.trim());
  if (!OPTION_MARKER.test(filled[0]?.text ?? '')) return line;
  const letters = filled
    .map((p) => OPTION_MARKER.exec(p.text))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1] ?? m[2]);
  return isOptionRun(letters) ? { ...line, segments: pieces } : line;
}

/**
 * A column gap that opens an option or a question starts a line of its own
 * (R5), so a table row `A. Rome | B. Paris` reads as two options. A marker
 * inside one segment splits only at a run of spaces (E2).
 */
export function splitAtColumnMarkers(lines: readonly DocLine[]): DocLine[] {
  const out: DocLine[] = [];
  for (const original of lines) {
    const line = splitSpacedOptions(original);
    const filled = (line.segments ?? []).filter((s) => s.text.trim());
    if (filled.length < 2) {
      out.push(line);
      continue;
    }
    // Word and RTF print the number first on its line or after a `____` blank (E1).
    const positioned = filled.some((s) => s.x !== undefined);
    const groups: DocSegment[][] = [];
    for (const segment of lineSegments(line)) {
      const text = segment.text.trim();
      if (!text) continue;
      const last = groups[groups.length - 1];
      const question =
        matchQuestionOpening(text) !== null &&
        (positioned || !last || isBlankGroup(last));
      const opens = isOptionText(text) || question;
      if (last && (!opens || (question && isBlankGroup(last)))) {
        last.push(segment);
      } else groups.push([segment]);
    }
    if (groups.length < 2) {
      columnLines.add(line);
      out.push(line);
      continue;
    }
    groups.forEach((segments, i) => {
      const emphasized = segments.some((s) => s.emphasized);
      const piece: DocLine = {
        text: segments.map((s) => s.text.trim()).join(' '),
        segments,
        ...(emphasized ? { emphasized: true } : {}),
        ...(line.page !== undefined ? { page: line.page } : {}),
        ...(line.y !== undefined ? { y: line.y } : {}),
        ...(i === 0 && line.imageIds ? { imageIds: line.imageIds } : {}),
      };
      columnLines.add(piece);
      out.push(piece);
    });
  }
  return out;
}

interface OptionDraft extends ExtractedOption {
  /** The document marked this one as the answer. */
  marked: boolean;
  line: DocLine;
  /** Lines appended as wraps, which the last question may have to give back (R8). */
  wraps: DocLine[];
}

function matchOption(
  line: DocLine
): { letter: string; text: string; marked: boolean } | null {
  const m = OPTION_PAREN.exec(line.text) ?? OPTION.exec(line.text);
  if (!m) return null;
  return {
    letter: m[2].toUpperCase(),
    text: tidy(m[3]),
    marked: Boolean(m[1]) || line.emphasized === true,
  };
}

interface Section {
  ordinal: number;
  name?: string;
  /** The number the heading printed, when it printed one. */
  printed?: number;
  ungraded: boolean;
  questionCount: number;
  /** The last item number opened here. */
  lastItem: number;
}

interface Draft {
  item: number;
  part?: string;
  section: Section;
  textParts: string[];
  /** Text before `Part A`, shared by every part of the item (R25). */
  leadIn?: { parts: string[] };
  options: OptionDraft[];
  /** An option letter arrived out of order from a column layout. */
  gridded: boolean;
  imageIds: string[];
  /** A test bank's `ANS:` line printed under the question. */
  inlineAnswer?: string;
  target?: SuggestedTarget;
  sharedTextId?: string;
  /** "Read paragraph 8." copied into this stem from a shared lead-in. */
  instruction?: string;
  /** Every line read into this question, for rebuilding a sorting table. */
  rawLines: DocLine[];
  /** `I.`–`VIII.` statements in the stem, and where in `textParts` they sat (E3). */
  statements?: { at: number; items: { n: number; text: string }[] };
  /** The printed number before this one, when the numbering skipped (E1). */
  skippedFrom?: number;
  /** The PDF line holding a target that filled the opening line, while it may still wrap. */
  targetLine?: DocLine;
}

/** `I.` … `VIII.` opening a statement in a stem (E3). */
const ROMAN_STATEMENT = /^\s*\(?(VIII|VII|VI|IV|V|III|II|I)[.)](?:\s+|$)(.*)$/;
/** Two or more spaces before the next statement's numeral. */
const SPACED_ROMAN = /\s{2,}(?=\(?(?:VIII|VII|VI|IV|V|III|II|I)[.)](?:\s|$))/;

/** A line's statements, split at column gaps and space runs; null when it opens none. */
function romanStatements(line: DocLine): { n: number; text: string }[] | null {
  const pieces = lineSegments(line)
    .flatMap((s) => s.text.split(SPACED_ROMAN))
    .map((t) => t.trim())
    .filter(Boolean);
  if (!ROMAN_STATEMENT.test(pieces[0] ?? '')) return null;
  const items: { n: number; text: string }[] = [];
  for (const piece of pieces) {
    const m = ROMAN_STATEMENT.exec(piece);
    if (m) items.push({ n: romanValue(m[1]), text: tidy(m[2]) });
    else
      items[items.length - 1].text = tidy(
        `${items[items.length - 1].text} ${piece}`
      );
  }
  return items;
}

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** The stem as printed, with an I–VIII list sorted onto lines of its own (E3). */
function stemText(draft: Draft): string {
  const statements = draft.statements;
  if (!statements) return tidy(draft.textParts.join(' '));
  const sorted = [...statements.items].sort((a, b) => a.n - b.n);
  const contiguous = sorted.every((s, i) => s.n === i + 1);
  const list = (contiguous ? sorted : statements.items).map(
    (s) => `${ROMAN_NUMERALS[s.n - 1] ?? s.n}. ${s.text}`
  );
  const before = tidy(draft.textParts.slice(0, statements.at).join(' '));
  const after = tidy(draft.textParts.slice(statements.at).join(' '));
  return [before, ...list, after].filter(Boolean).join('\n');
}

/** One paragraph of instructions or a passage waiting for the questions it covers. */
interface Preamble {
  lines: string[];
  range?: [number, number];
  section: Section;
}

function typeFor(draft: Draft, stem: string, multi: boolean): QuizQuestionType {
  const options = draft.options;
  if (options.length === 0) return 'free-response';
  if (SORTING.test(stem)) return 'free-response';
  const starred =
    options.some((o) => o.marked) && !options.every((o) => o.marked);
  if (
    ORDERING.test(stem) &&
    !stem.includes('?') &&
    !starred &&
    options.length >= 2
  ) {
    return 'Ordering';
  }
  if (!multi) return 'MC';
  const marked = options.filter((o) => o.marked).length;
  // Some but not all marked reads as several answers; all marked is formatting.
  if (
    SELECT_ALL_WORDING.test(stem) ||
    (marked > 1 && marked < options.length)
  ) {
    return 'MA';
  }
  return 'MC';
}

/** A sorting table's columns, `Literal: a; b / Figurative: c` (R9). */
function sortingColumns(draft: Draft): string | null {
  const rows = draft.rawLines
    .map((l) => lineSegments(l).map((s) => tidy(s.text)))
    .filter((cells) => cells.filter(Boolean).length >= 2);
  if (rows.length < 2) return null;
  const [header, ...body] = rows;
  const columns = header.map((name, i) => ({
    name: name.replace(/:$/, ''),
    items: body.map((cells) => cells[i] ?? '').filter(Boolean),
  }));
  return columns
    .filter((c) => c.name)
    .map((c) => `${c.name}: ${c.items.join('; ')}`)
    .join(' / ');
}

/** Options sorted A→F; a gap or repeat keeps the letters as read and says so (R6). */
function orderedOptions(draft: Draft): {
  options: OptionDraft[];
  outOfPlace: boolean;
} {
  const letters = draft.options.map((o) => o.letter);
  const unique = new Set(letters);
  const sorted = [...draft.options].sort((a, b) =>
    a.letter.localeCompare(b.letter)
  );
  const contiguous =
    unique.size === letters.length &&
    sorted.every((o, i) => o.letter === String.fromCharCode(65 + i));
  return contiguous
    ? { options: sorted, outOfPlace: false }
    : { options: draft.options, outOfPlace: true };
}

function finish(
  draft: Draft,
  position: number,
  label: string,
  /** The document's key has an entry for this item, so markings don't decide. */
  keyed: boolean,
  multi: boolean,
  examView = false
): ExtractedQuestion {
  const warnings: string[] = [];
  const stem = tidy(draft.textParts.join(' '));
  const printed = stemText(draft);
  let text = draft.instruction
    ? `${tidy(draft.instruction)} ${printed}`
    : printed;
  if (draft.skippedFrom !== undefined) {
    warnings.push(
      `The numbering skips from ${draft.skippedFrom} to ${draft.item}. Check that no question is missing.`
    );
  }
  const type = typeFor(draft, stem, multi);
  const { options: sortedOptions, outOfPlace } = orderedOptions(draft);
  if (outOfPlace && draft.options.length > 1) {
    warnings.push('Answer choices may be out of place — check them.');
  }

  let options: ExtractedOption[] = sortedOptions.map((o) => ({
    letter: o.letter,
    text: o.text,
  }));

  if (SORTING.test(stem)) {
    const columns = sortingColumns(draft);
    if (columns) {
      // The table's own cells were read into the stem; the columns replace them.
      const tableTexts = new Set(
        draft.rawLines
          .filter(
            (l) => lineSegments(l).filter((c) => c.text.trim()).length >= 2
          )
          .map((l) => l.text.trim())
      );
      const cut = draft.textParts.findIndex((p) => tableTexts.has(p.trim()));
      const kept = cut === -1 ? draft.textParts : draft.textParts.slice(0, cut);
      text = tidy(`${draft.instruction ?? ''} ${kept.join(' ')}`);
    }
    const listed =
      columns ?? sortedOptions.map((o) => `${o.letter}. ${o.text}`).join(' / ');
    if (listed) text = tidy(`${text} ${listed}`);
    options = [];
    warnings.push(
      'This is a sorting question. Its items are listed in the text; rebuild it in the editor.'
    );
  }

  let correctAnswer = '';
  if (type === 'MC') {
    const marked = sortedOptions.filter((o) => o.marked);
    if (marked.length === 1) {
      correctAnswer = marked[0].text;
    } else if (marked.length > 1 && !keyed && !draft.inlineAnswer) {
      warnings.push(
        'More than one answer choice is marked, so the answer was left blank.'
      );
    }
    if (sortedOptions.length === 1) {
      warnings.push('Only one answer choice was found.');
    }
  } else if (type === 'MA') {
    const marked = sortedOptions.filter((o) => o.marked);
    if (marked.length > 0 && marked.length < sortedOptions.length) {
      correctAnswer = multiAnswerKey(marked.map((o) => o.text));
    } else if (marked.length > 0 && !keyed && !draft.inlineAnswer) {
      warnings.push(
        'Every answer choice is marked, so the answers were left blank.'
      );
    }
  }

  if (!text) warnings.push('No question text was found.');
  if (draft.part && draft.part !== 'A') {
    warnings.push(`Part ${draft.part} credit doesn’t depend on Part A here.`);
  }

  const ref: QuestionRef = {
    section: draft.section.ordinal,
    ...(draft.section.name ? { sectionName: draft.section.name } : {}),
    ...(draft.section.printed ? { sectionNumber: draft.section.printed } : {}),
    item: draft.item,
    ...(draft.part ? { part: draft.part } : {}),
  };

  const question: ExtractedQuestion = {
    number: position,
    ref,
    ...(label !== String(position) ? { sourceLabel: label } : {}),
    text,
    type,
    options,
    correctAnswer,
    imageIds: draft.imageIds,
    warnings,
    ...(draft.target ? { suggestedTarget: draft.target } : {}),
    ...(draft.sharedTextId ? { sharedTextId: draft.sharedTextId } : {}),
    ...(draft.section.ungraded
      ? {
          suggestUntick:
            'This looks like a self-reflection item rather than a graded question.',
        }
      : {}),
    ...(examView &&
    type === 'free-response' &&
    WRITTEN_SECTION.test(draft.section.name ?? '')
      ? { keepWritten: true }
      : {}),
  };
  // The key at the back is merged afterwards and wins over this.
  return draft.inlineAnswer && type !== 'Ordering'
    ? applyKeyAnswer(question, draft.inlineAnswer, 'document', multi)
    : question;
}

/** A written question the reader expected choices on says so, after any key has had its say. */
function noteMissingChoices(
  question: ExtractedQuestion,
  sorting: boolean
): ExtractedQuestion {
  if (question.type !== 'free-response' || sorting || question.keepWritten) {
    return question;
  }
  return {
    ...question,
    warnings: [
      'No answer choices were found, so this came in as a written-response question.',
      ...question.warnings,
    ],
  };
}

/** A forward jump in printed numbers this big still opens a question, with a note (E1). */
const MAX_SKIP = 5;
/** Question numbers on a PDF page line up within this many points (E1). */
const NUMBER_X_TOLERANCE = 12;
/** A target's wrapped line sits closer than this under it; a new paragraph sits further. */
const TARGET_WRAP_GAP = 21;
/** A number indented this far past the others is a list inside a stem. */
const NUMBER_INDENT_MAX = 120;

/** Left edge of a PDF line's number, skipping a `____` blank; undefined off a PDF. */
function numberPosition(line: DocLine): number | undefined {
  const segment = lineSegments(line).find(
    (s) => s.text.trim() && !/^_{2,}$/.test(s.text.trim())
  );
  return segment?.x;
}

/** A number indented past the accepted ones, but not a whole column over, isn't a question (E1). */
function atNumberPosition(
  accepted: readonly number[],
  x: number | undefined
): boolean {
  if (x === undefined || accepted.length === 0) return true;
  if (accepted.some((a) => Math.abs(x - a) <= NUMBER_X_TOLERANCE)) return true;
  return !accepted.some(
    (a) => x - a > NUMBER_X_TOLERANCE && x - a < NUMBER_INDENT_MAX
  );
}

/** Does this line name a new section? The caller has ruled out Part A/B. */
function sectionHeading(
  text: string,
  examView = false
): { name: string; printed?: number; ungraded: boolean } | null {
  const trimmed = tidy(text);
  if (!trimmed || trimmed.endsWith('?')) return null;
  // "Short Answer-PICK TWO (2) QUESTIONS…" is ExamView's heading with its directions.
  if (examView && EXAMVIEW_TYPE_HEADING.test(trimmed)) {
    return { name: trimmed, ungraded: false };
  }
  const numbered = NUMBERED_SECTION.exec(trimmed);
  if (numbered) {
    const raw = numbered[2];
    const printed = /^\d+$/.test(raw)
      ? Number(raw)
      : /^[IVXLC]+$/i.test(raw) && raw.length > 1
        ? romanValue(raw.toUpperCase())
        : /^[IVX]$/.test(raw)
          ? romanValue(raw)
          : undefined;
    return {
      name: trimmed,
      ...(printed ? { printed } : {}),
      ungraded: UNGRADED_SECTION.test(trimmed),
    };
  }
  const words = trimmed.split(' ').length;
  if (words > 8) return null;
  if (NAMED_SECTION.test(trimmed)) {
    return { name: trimmed, ungraded: UNGRADED_SECTION.test(trimmed) };
  }
  // An all-caps line of a few words: "VOCABULARY", "PART ONE — READING".
  if (
    /[A-Z]{3,}/.test(trimmed) &&
    !/[a-z]/.test(trimmed) &&
    !isOptionText(trimmed) &&
    !matchQuestionOpening(trimmed)
  ) {
    return { name: trimmed, ungraded: UNGRADED_SECTION.test(trimmed) };
  }
  return null;
}

function targetOf(text: string): SuggestedTarget | null {
  const m = TARGET.exec(text);
  if (!m) return null;
  return { ...(m[1] ? { code: tidy(m[1]) } : {}), label: tidy(m[2]) };
}

/** A target printed at the start of a stem: its first sentence, and the rest. */
function splitTargetFromStem(
  text: string
): { target: SuggestedTarget; rest: string } | null {
  const target = targetOf(text);
  if (!target) return null;
  const sentence = /^(I\s+can\b[^.!?]*[.!?])\s*(.*)$/i.exec(target.label);
  if (!sentence) return { target, rest: '' };
  return {
    target: { ...target, label: sentence[1] },
    rest: sentence[2],
  };
}

/** The next PDF line sits a line's height under the target, not a paragraph gap below it. */
function isTargetWrap(previous: DocLine, line: DocLine): boolean {
  if (line.page !== previous.page) return false;
  if (line.y === undefined || previous.y === undefined) return false;
  const gap = previous.y - line.y;
  return gap > 0 && gap < TARGET_WRAP_GAP;
}

/** A continuation after a question's last option that is plainly its wrap (R8). */
function isWrapOf(option: DocLine, previous: DocLine, line: DocLine): boolean {
  // Word and RTF wrap inside one paragraph, so a new one is never a wrap.
  if (line.page === undefined) return false;
  // OCR read without positions can't be judged, so it keeps today's behaviour.
  if (line.y === undefined || previous.y === undefined) return true;
  if (line.page !== previous.page) return false;
  const x = lineSegments(line)[0]?.x;
  const optionX = lineSegments(option)[0]?.x;
  if (x === undefined || optionX === undefined) return true;
  return x > optionX + 1 && previous.y - line.y < 30;
}

/**
 * Walk the lines once. A numbered line opens a question, option lines attach
 * to it, and anything else extends whichever part is open. Numbers ascend
 * within a section; a heading or a restart at 1 opens the next section (R7).
 */
export function parseDocument(
  documentLines: readonly DocLine[],
  options: ReaderOptions = {}
): {
  questions: ExtractedQuestion[];
  texts: ExtractedText[];
  /** Notes about the whole document, such as key entries with no question. */
  warnings: string[];
  keySummary?: KeySummary;
} {
  const multi = options.multiAnswer === true;
  const lines = splitAtColumnMarkers(documentLines);
  const examView = isExamView(lines);
  /** Where accepted question numbers sit on a PDF page (E1). */
  const numberXs: number[] = [];
  const { keyLineIndexes, items: keyItems } = findAnswerKey(lines, options);

  const drafts: Draft[] = [];
  const texts: ExtractedText[] = [];
  const sections: Section[] = [];
  let section: Section = {
    ordinal: 0,
    ungraded: false,
    questionCount: 0,
    lastItem: 0,
  };
  let current: Draft | null = null;
  let lastOption: OptionDraft | null = null;
  let target: SuggestedTarget | undefined;
  let preamble: Preamble | null = null;
  /** A preamble already turned into shared text, still covering later items. */
  let covering: {
    range?: [number, number];
    section: Section;
    textId?: string;
    instruction?: string;
    /** An instruction with no question range covers only the next question. */
    once?: boolean;
  } | null = null;

  const endQuestion = (): void => {
    current = null;
    lastOption = null;
  };

  const startSection = (heading?: {
    name: string;
    printed?: number;
    ungraded: boolean;
  }): void => {
    endQuestion();
    section = {
      ordinal: 0,
      ...(heading?.name ? { name: heading.name } : {}),
      ...(heading?.printed ? { printed: heading.printed } : {}),
      ungraded: heading?.ungraded ?? false,
      questionCount: 0,
      lastItem: 0,
    };
    target = undefined;
    preamble = null;
    covering = null;
  };

  /** Turn a waiting preamble into shared text for the questions it covers (R25). */
  const settlePreamble = (): void => {
    const waiting = preamble;
    preamble = null;
    if (!waiting) return;
    const all = tidy(waiting.lines.join(' '));
    if (!all) return;
    const sentences = all.split(/(?<=[.?!])\s+/);
    const instruction =
      sentences.find(
        (s) => READ_INSTRUCTION.test(s) && !RANGE_INSTRUCTION.test(s)
      ) ?? undefined;
    const passage = sentences
      .filter((s) => s !== instruction && !RANGE_INSTRUCTION.test(s))
      .join(' ');
    if (passage.length > SHORT_LEAD_IN || (!instruction && passage)) {
      // Without a question range, only a "read the passage" cue makes it shared text.
      if (!waiting.range && !PASSAGE_CUE.test(all)) return;
      if (passage.length <= SHORT_LEAD_IN && !waiting.range) return;
      const id = `text-${texts.length + 1}`;
      texts.push({ id, text: passage, label: `Passage ${texts.length + 1}` });
      covering = {
        ...(waiting.range ? { range: waiting.range } : {}),
        section: waiting.section,
        textId: id,
        ...(instruction ? { instruction } : {}),
      };
      return;
    }
    if (instruction) {
      covering = {
        ...(waiting.range ? { range: waiting.range } : { once: true }),
        section: waiting.section,
        instruction,
      };
    }
  };

  const openQuestion = (item: number, text: string, line: DocLine): Draft => {
    settlePreamble();
    if (section.ordinal === 0) {
      sections.push(section);
      section.ordinal = sections.length;
    }
    section.questionCount += 1;
    section.lastItem = item;
    let stem = text;
    const inlineTarget = splitTargetFromStem(text);
    if (inlineTarget) {
      target = inlineTarget.target;
      stem = inlineTarget.rest;
    }
    const part = PART.exec(stem);
    const cover = covering;
    const covered =
      cover &&
      cover.section === section &&
      (!cover.range || (item >= cover.range[0] && item <= cover.range[1]));
    if (cover && ((!covered && cover.range) || cover.once)) covering = null;
    current = {
      item,
      ...(part && part[1].toUpperCase() === 'A' ? { part: 'A' } : {}),
      section,
      textParts: [part && part[1].toUpperCase() === 'A' ? part[2] : stem],
      ...(part && part[1].toUpperCase() === 'A'
        ? { leadIn: { parts: [] } }
        : {}),
      options: [],
      gridded: false,
      imageIds: [...(line.imageIds ?? [])],
      ...(target ? { target } : {}),
      ...(covered && cover?.textId ? { sharedTextId: cover.textId } : {}),
      ...(covered && cover?.instruction
        ? { instruction: cover.instruction }
        : {}),
      rawLines: [],
      ...(inlineTarget && !inlineTarget.rest && line.y !== undefined
        ? { targetLine: line }
        : {}),
    };
    lastOption = null;
    drafts.push(current);
    return current;
  };

  lines.forEach((line, index) => {
    if (keyLineIndexes.has(index)) return;
    const text = line.text.trim();
    if (!text) {
      // A paragraph holding nothing but a picture still belongs to the
      // question it sits under.
      const open = current;
      if (open && line.imageIds?.length) {
        open.imageIds.push(...line.imageIds);
      }
      return;
    }

    const open = current;

    // A key entry never continues a question or opens one (R8).
    if (entriesOnLine(text, multi).length > 0) {
      endQuestion();
      return;
    }

    const part = PART.exec(text);
    if (part && open) {
      const letter = part[1].toUpperCase();
      if (letter === 'A' && !open.part && open.options.length === 0) {
        open.leadIn = { parts: open.textParts };
        open.textParts = [part[2]];
        open.part = 'A';
        return;
      }
      if (letter !== 'A' && open.part) {
        current = {
          item: open.item,
          part: letter,
          section: open.section,
          textParts: [part[2]],
          ...(open.leadIn ? { leadIn: open.leadIn } : {}),
          options: [],
          gridded: false,
          imageIds: [...(line.imageIds ?? [])],
          ...(open.target ? { target: open.target } : {}),
          ...(open.sharedTextId ? { sharedTextId: open.sharedTextId } : {}),
          ...(open.instruction ? { instruction: open.instruction } : {}),
          rawLines: [],
        };
        lastOption = null;
        drafts.push(current);
        return;
      }
    }

    const lineTarget = targetOf(text);
    if (lineTarget) {
      target = lineTarget;
      // Inside a stem it belongs to this question; after the options, to the next.
      if (open && open.options.length === 0) open.target = lineTarget;
      else endQuestion();
      return;
    }

    if (isHeading(text)) {
      endQuestion();
      return;
    }

    // A test bank's `ANS:` and bookkeeping lines under the question.
    const inline = INLINE_TEST_BANK_ANSWER.exec(text);
    if (inline) {
      const answer = answerBeforeFields(inline[1]);
      if (open && answer) open.inlineAnswer = answer;
      lastOption = null;
      return;
    }
    if (TEST_BANK_FIELD_LINE.test(text)) return;

    // A heading can't interrupt a sentence that is still running.
    const midSentence =
      open &&
      open.options.length === 0 &&
      !/[.?!:)]\s*$/.test(open.textParts.join(' ').trim());
    const heading = midSentence ? null : sectionHeading(text, examView);
    if (heading) {
      startSection(heading);
      return;
    }

    const opening = matchQuestionOpening(text);
    const numberX =
      opening && !opening.labelled ? numberPosition(line) : undefined;
    if (opening && atNumberPosition(numberXs, numberX)) {
      const n = opening.number;
      // ExamView numbers straight through, so only a heading restarts it.
      // A `1.` inside a stem that hasn't reached its options is a list, not a restart.
      const restart =
        !examView &&
        n === 1 &&
        section.questionCount >= 2 &&
        section.lastItem > 1 &&
        (!open || open.options.length > 0);
      const skip = n - section.lastItem;
      const first = section.questionCount === 0;
      if (restart || first || (skip >= 1 && skip <= MAX_SKIP)) {
        if (restart) startSection();
        const opened = openQuestion(n, opening.text, line);
        if (!restart && !first && skip > 1) opened.skippedFrom = n - skip;
        if (
          numberX !== undefined &&
          !numberXs.some((x) => Math.abs(x - numberX) <= NUMBER_X_TOLERANCE)
        ) {
          numberXs.push(numberX);
        }
        return;
      }
    }

    const range = RANGE_INSTRUCTION.exec(text);
    if (range && (!open || open.options.length > 0)) {
      endQuestion();
      settlePreamble();
      preamble = {
        lines: [text],
        range: [Number(range[1]), Number(range[2])],
        section,
      };
      return;
    }

    if (!open) {
      if (preamble) preamble.lines.push(text);
      else preamble = { lines: [text], section };
      return;
    }
    open.rawLines.push(line);

    // A PDF target that wrapped onto the next line, before the stem starts.
    const targetLine = open.targetLine;
    open.targetLine = undefined;
    if (
      targetLine &&
      open.target &&
      !open.textParts.join('').trim() &&
      !/[.!?]$/.test(open.target.label) &&
      isTargetWrap(targetLine, line)
    ) {
      target = { ...open.target, label: tidy(`${open.target.label} ${text}`) };
      open.target = target;
      open.targetLine = line;
      return;
    }

    // An I–VIII statement list inside the stem, before any option (E3).
    if (open.options.length === 0 && !lastOption) {
      const statements = romanStatements(line);
      if (statements) {
        open.statements ??= { at: open.textParts.length, items: [] };
        open.statements.items.push(...statements);
        open.imageIds.push(...(line.imageIds ?? []));
        return;
      }
    }

    const option = matchOption(line);
    if (option) {
      const seen = open.options.map((o) => o.letter);
      const next =
        seen.length === 0
          ? option.letter === 'A'
          : option.letter ===
            String.fromCharCode(
              Math.max(...seen.map((l) => l.charCodeAt(0))) + 1
            );
      const fromColumns = columnLines.has(line) || open.gridded;
      const accepted =
        next ||
        (fromColumns && seen.length > 0 && !seen.includes(option.letter));
      if (accepted) {
        if (!next) open.gridded = true;
        if (columnLines.has(line)) open.gridded = true;
        lastOption = { ...option, line, wraps: [] };
        open.options.push(lastOption);
        open.imageIds.push(...(line.imageIds ?? []));
        return;
      }
    }

    // A wrapped line: continues the option it follows, or the stem if the
    // question hasn't reached its options yet.
    const wrapping = lastOption;
    if (wrapping) {
      wrapping.text = tidy(`${wrapping.text} ${text}`);
      wrapping.wraps.push(line);
    } else {
      open.textParts.push(text);
    }
    open.imageIds.push(...(line.imageIds ?? []));
  });

  // After the last question nothing is appended but a plain wrap (R8).
  const final = drafts[drafts.length - 1];
  const finalOption = final?.options[final.options.length - 1];
  if (finalOption && finalOption.wraps.length > 0) {
    const kept: DocLine[] = [];
    let previous = finalOption.line;
    for (const wrap of finalOption.wraps) {
      if (!isWrapOf(finalOption.line, previous, wrap)) break;
      kept.push(wrap);
      previous = wrap;
    }
    if (kept.length < finalOption.wraps.length) {
      const base = matchOption(finalOption.line)?.text ?? '';
      finalOption.text = tidy(
        [base, ...kept.map((l) => l.text.trim())].join(' ')
      );
    }
  }

  // A Part A/B lead-in: short text joins each stem, a longer one becomes a passage (R25).
  const leadIns = new Map<{ parts: string[] }, string>();
  for (const draft of drafts) {
    if (!draft.leadIn) continue;
    let id = leadIns.get(draft.leadIn);
    const all = tidy(draft.leadIn.parts.join(' '));
    if (!all) continue;
    const sentences = all.split(/(?<=[.?!])\s+/);
    const instruction = sentences.find((s) => READ_INSTRUCTION.test(s));
    const passage = sentences.filter((s) => s !== instruction).join(' ');
    if (all.length <= SHORT_LEAD_IN && sentences.length === 1) {
      draft.instruction = tidy(`${draft.instruction ?? ''} ${all}`);
      continue;
    }
    if (instruction) {
      draft.instruction = tidy(`${draft.instruction ?? ''} ${instruction}`);
    }
    if (!passage) continue;
    if (!id) {
      id = `text-${texts.length + 1}`;
      texts.push({ id, text: passage, label: `Passage ${texts.length + 1}` });
      leadIns.set(draft.leadIn, id);
    }
    draft.sharedTextId = id;
  }

  // Printed labels carry the section only when numbering restarted (R23).
  const itemKeys = drafts.map((d) => `${d.item}${d.part ?? ''}`);
  const restarted = new Set(itemKeys).size !== itemKeys.length;
  const labelOf = (d: Draft): string => {
    const item = `${d.item}${d.part ?? ''}`;
    if (!restarted) return item;
    return `${d.section.printed ?? d.section.ordinal}·${item}`;
  };

  const unkeyed = drafts.map((d, i) =>
    finish(d, i + 1, labelOf(d), false, multi, examView)
  );
  const keyed = keyedQuestionIndexes(unkeyed, keyItems);
  const finished = unkeyed.map((q, i) =>
    keyed.has(i)
      ? finish(drafts[i], i + 1, labelOf(drafts[i]), true, multi, examView)
      : q
  );
  const merged = mergeAnswerKey(
    { title: '', questions: finished, images: [], warnings: [] },
    keyItems,
    'document',
    options
  );
  const questions = merged.questions.map((q, i) =>
    noteMissingChoices(q, SORTING.test(tidy(drafts[i].textParts.join(' '))))
  );
  const used = new Set(questions.map((q) => q.sharedTextId).filter(Boolean));
  return {
    questions,
    texts: texts.filter((t) => used.has(t.id)),
    warnings: merged.warnings,
    ...(merged.keySummary ? { keySummary: merged.keySummary } : {}),
  };
}

/** The questions alone, for callers that don't carry shared text. */
export function parseQuestionLines(
  lines: readonly DocLine[],
  options: ReaderOptions = {}
): ExtractedQuestion[] {
  return parseDocument(lines, options).questions;
}

/** True/False written as two options — kept as MC, which is how Quiz stores it. */
export const isTrueFalse = (q: ExtractedQuestion): boolean =>
  q.options.length === 2 && q.options.every((o) => TRUE_FALSE.test(o.text));
