/**
 * Turns a document's lines into questions
 * (docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D2, D12; QUIZ_IMPORT_RELIABILITY.md R5–R9, R23, R25).
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
  keyItemFields,
  entriesOnLine,
  findAnswerKey,
  isHeading,
} from './answerKey';
import {
  EXAMVIEW_TYPE_HEADING,
  applyExamViewAfterKey,
  applyExamViewTypes,
  examViewKindOf,
  isExamView,
} from './examView';
import { keyedQuestionIndexes, mergeAnswerKey } from './mergeKey';
import { captionLabels } from './pdfPictures';
import {
  SELECT_ALL_WORDING,
  lineSegments,
  multiAnswerKey,
  type DocLine,
  type DocSegment,
  type ExtractedOption,
  type ExtractedQuestion,
  type ExtractedText,
  type KeyItem,
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
  /^\s*(section|part|unit|chapter|topic)\s+(\d{1,2}|[IVXLC]{1,5}|[A-Z])\b\s*[:.\-–—]?\s*([^?]{0,80})$/i;

/** `II. Multiple Choice: …`, `Part B - True or False: …`: the type, then its directions. */
const TYPED_SECTION =
  /^(?:(?:[IVX]{1,4}|[A-D]|(?:part|section)\s+(?:\d|[IVX]{1,4}|[A-D]))[.):\-–—]\s+)([A-Za-z][A-Za-z /-]{3,30}?)\s*[:\-–—]\s+\S.*$/i;
/** A section of statements to mark true or false. */
const TRUE_FALSE_SECTION = /^\s*true\s*(?:\/|or|-|and)\s*false\b/i;

/** A statement under a True or False heading is answered True or False. */
const asTrueFalse = (q: ExtractedQuestion): ExtractedQuestion =>
  q.type === 'free-response' &&
  q.options.length === 0 &&
  TRUE_FALSE_SECTION.test(q.ref?.sectionName ?? '') &&
  !/_{3,}/.test(q.text) &&
  !q.text.trim().endsWith('?')
    ? {
        ...q,
        type: 'MC',
        options: [
          { letter: 'A', text: 'True' },
          { letter: 'B', text: 'False' },
        ],
      }
    : q;

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
  /\b(?:questions?|items?|numbers?)\s*#?\s*(\d{1,3})\s*(?:-|–|—|to|through|and|&)\s*#?\s*(\d{1,3})\b/i;

/** "For 2 – 4, state the form…": a range named without the word "questions". */
const FOR_RANGE =
  /^\s*for\s+#?\s*(\d{1,3})\s*(?:-|–|—|to|through|and|&)\s*#?\s*(\d{1,3})\s*[,:]/i;
/** How a line of directions opens. */
const DIRECTIONS_START =
  /^\s*(?:for|use|using|read|refer|look|study|answer|questions?)\b/i;

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

/** Test-taking directions: "Read each sentence carefully", "show all steps", "General Directions". */
const TEST_DIRECTIONS =
  /\b(?:directions|instructions)\b|\b(?:read|answer|choose|select|circle|show|write)\b[^.?!]*\b(?:each|all|every|your)\b/i;

/** A shared lead-in at or under this length is copied into each stem (R25). */
const SHORT_LEAD_IN = 150;

/** Prose this long, in two or more sentences, reads as a passage rather than an instruction. */
const PASSAGE_MIN = 200;
const INSTRUCTIONS_OPENING = /^\s*(?:directions|instructions)\b/i;
/** "Case Study: FreshFuel Bowls", "Passage 2", "Excerpt from The Giver". */
const PASSAGE_TITLE =
  /^\s*(?:case\s+study|passage|excerpt|article|story|poem|scenario|reading|source|text)\b[^.!?]{0,80}$/i;
/** A label with nothing after it, like "Questions:". */
const LABEL_ONLY = /^[\p{L}’' ]{1,20}:$/u;

const tidy = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** A matching bank's term, `A.` through `Z.`, `(k)` or `k)`, with a space after it. */
const TERM = /^\s*\(?([A-Za-z])[.)](?:\s+|$)(.*)$/;
/** Two or more spaces before the next term's letter. */
const SPACED_TERM = /(?<!\s)\s{2,}(?=\(?[A-Za-z][.)](?:\s|$))/;
/** "Match each term…", "Directions: Match the…", which open a term list. */
const MATCH_DIRECTIONS =
  /^\s*(?:(?:directions|matching)\s*[:.\-–—]\s*)?match\b/i;

const PICTURE_WORDS = 'figure|graph|table|diagram|chart|image|picture|map';
/** "Figure 2", "Graph 1", "Table A": a picture named by its caption. */
const FIGURE_REF = new RegExp(
  `\\b(fig\\.?|(?:${PICTURE_WORDS})s?)\\s*#?\\s*(\\d{1,3}|[A-Z])\\b`,
  'gi'
);
/** ", 4", " and 4" after "Figures 3". */
const FIGURE_REF_MORE = /^\s*(?:,|and|&|or)\s*#?\s*(\d{1,3}|[A-Z])\b/;
/** "the above figures", "the graph above": the pictures the question before it used. */
const FIGURE_ABOVE = new RegExp(
  `\\b(?:above|previous|preceding|same)\\s+(?:${PICTURE_WORDS})s?\\b|\\b(?:${PICTURE_WORDS})s?\\s+(?:shown\\s+)?above\\b`,
  'i'
);
/** A stem that asks for a label on a picture: "which letter…", "represented by which number?". */
const LABEL_ASKED =
  /\bwhich\s+(?:number|letter|label|arrow|structure)\b|\b(?:represented|indicated|shown|marked|labell?ed)\s+by\s+(?:which|what)\b/i;
/** A lead-in that points at a picture, "Use the diagram to answer questions 17-20". */
const PICTURE_LEAD = new RegExp(`\\b(?:fig\\.|(?:${PICTURE_WORDS})s?)\\b`, 'i');
/** How many lines a Word caption may sit from its picture. */
const CAPTION_REACH = 8;
/** A stem that leans on what was printed before it. */
const REFERS_BACK = new RegExp(
  `\\b(?:above|passage|data|information|fig\\.|(?:${PICTURE_WORDS})s?)\\b`,
  'i'
);

const pictureKind = (word: string): string =>
  /^fig/i.test(word) ? 'figure' : word.toLowerCase().replace(/s$/, '');

/** Every captioned picture a text names, as `figure 2`. */
function figureRefs(text: string): Set<string> {
  const found = new Set<string>();
  for (const m of text.matchAll(FIGURE_REF)) {
    const kind = pictureKind(m[1]);
    found.add(`${kind} ${m[2].toLowerCase()}`);
    let rest = text.slice((m.index ?? 0) + m[0].length);
    let more = FIGURE_REF_MORE.exec(rest);
    while (more) {
      found.add(`${kind} ${more[1].toLowerCase()}`);
      rest = rest.slice(more[0].length);
      more = FIGURE_REF_MORE.exec(rest);
    }
  }
  return found;
}
/** A letter written in an item's answer blank, `__C__ definition`. */
const FILLED_BLANK = /^_+\s*([A-Za-z])\s*_+\s*/;

/** A line's lettered terms, and any text before the first one; null when it holds none. */
function matchingTerms(
  line: DocLine
): { lead?: string; terms: ExtractedOption[] } | null {
  const pieces = lineSegments(line)
    .flatMap((s) => s.text.split(SPACED_TERM))
    .map((t) => t.trim())
    .filter(Boolean);
  const lead: string[] = [];
  const terms: ExtractedOption[] = [];
  for (const piece of pieces) {
    const m = TERM.exec(piece);
    if (m) terms.push({ letter: m[1].toUpperCase(), text: tidy(m[2]) });
    else if (terms.length > 0) {
      const last = terms[terms.length - 1];
      last.text = tidy(`${last.text} ${piece}`);
    } else lead.push(piece);
  }
  if (terms.length === 0) return null;
  return lead.length > 0 ? { lead: tidy(lead.join(' ')), terms } : { terms };
}

/** "Passage 2" counts passages only, not the short texts labelled Directions. */
const nextPassageLabel = (texts: readonly { label: string }[]): string =>
  `Passage ${texts.filter((t) => /^Passage d+$/.test(t.label)).length + 1}`;

/** A block of lines as a passage: its title, prose and any "Read…" instruction; null when it isn't prose. */
function passageOf(
  lines: readonly string[]
): { label?: string; text: string; instruction?: string } | null {
  const kept = lines.map(tidy).filter(Boolean);
  while (kept.length > 0 && LABEL_ONLY.test(kept[kept.length - 1])) kept.pop();
  const title =
    kept.length > 1 && PASSAGE_TITLE.test(kept[0]) ? kept.shift() : undefined;
  const sentences = tidy(kept.join(' '))
    .split(/(?<=[.?!])\s+/)
    .filter((s) => !RANGE_INSTRUCTION.test(s));
  const instruction = sentences.find((s) => READ_INSTRUCTION.test(s));
  const prose = sentences.filter((s) => s !== instruction);
  const text = prose.join(' ');
  if (
    text.length < PASSAGE_MIN ||
    prose.length < 2 ||
    INSTRUCTIONS_OPENING.test(text)
  ) {
    return null;
  }
  return {
    ...(title ? { label: title.replace(/:$/, '') } : {}),
    text,
    ...(instruction ? { instruction } : {}),
  };
}

/** A matching set's directions: the section's own, unless they are only labels like "Terms:", else the heading's parenthetical. */
function setDirections(section: {
  name?: string;
  directions?: string;
}): string | undefined {
  const own = section.directions;
  if (own && !/^(?:[\p{L}’' ]{1,20}:\s*)+$/u.test(own)) return own;
  return /\(([^()]+)\)\s*$/.exec(section.name ?? '')?.[1]?.trim();
}

/** "Write the letter on the line…" only makes sense on paper. */
const PAPER_ONLY =
  /\b(?:write|print|put|place)\b.*\b(?:letter|number|answer)s?\b|\b(?:on|in) the (?:line|blank|space)s?\b/i;

/** Directions without their paper-only sentences; none left falls back to the default text. */
function onScreen(directions: string | undefined): string | undefined {
  const kept = (directions ?? '')
    .split(/(?<=[.?!])\s+/)
    .filter((s) => s.trim() && !PAPER_ONLY.test(s));
  return kept.length > 0 ? kept.join(' ') : undefined;
}

/** Lines between two printings of a running header, at the least, off a PDF. */
const HEADER_MIN_GAP = 5;
/** An answer printed on its own line, which repeats without being a header. */
const ANSWER_TOKEN = /^(?:true|false|t|f|yes|no|n\/?a|none)\.?$/i;

/** A running header or footer, like "VERSION A" on every page, is never a heading. */
function runningHeaders(lines: readonly DocLine[]): Set<string> {
  const seen = new Map<string, number[]>();
  lines.forEach((line, i) => {
    const text = tidy(line.text);
    if (text) seen.set(text, [...(seen.get(text) ?? []), i]);
  });
  // A header repeats once a page: on different PDF pages, or well apart elsewhere.
  const spread = (at: number[]): boolean =>
    at.every((i, n) => {
      if (n === 0) return true;
      const page = lines[i].page;
      const before = lines[at[n - 1]].page;
      return page !== undefined && before !== undefined
        ? page !== before
        : i - at[n - 1] >= HEADER_MIN_GAP;
    });
  const headers = new Set<string>();
  for (const [text, at] of seen) {
    if (
      at.length >= 3 &&
      spread(at) &&
      !ANSWER_TOKEN.test(text) &&
      /[A-Z]/.test(text) &&
      !/[a-z]/.test(text) &&
      text.split(' ').length <= 8 &&
      !NAMED_SECTION.test(text) &&
      !NUMBERED_SECTION.test(text) &&
      !EXAMVIEW_TYPE_HEADING.test(text) &&
      !matchQuestionOpening(text) &&
      !TERM.test(text)
    ) {
      headers.add(text);
    }
  }
  return headers;
}

/** A section whose heading names it Matching. */
const namedMatching = (name: string | undefined): boolean =>
  /\bmatching\b/i.test(name ?? '');

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
const SPACED_OPTION = /(?<!\s)\s{2,}(?=(?:\([A-Fa-f]\)|[A-Fa-f][.)])(?:\s|$))/;
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

/** One space before an option marker: choices typed one after another on a line. */
const INLINE_OPTION = /(?<=\S)\s(?=(?:\([A-Fa-f]\)|[A-Fa-f][.)])(?:\s|$))/;
/** A choice never ends on a joining word, so `a. Plan A and b. …` is one choice. */
const JOINS_ON = /(?:\b(?:and|or|vs|versus|to)|[,;:&])$/i;

/** `A. one B. two C. three`: split when every marker is the next letter in the same style. */
function splitInlineOptions(line: DocLine): DocLine {
  if (line.segments && line.segments.length > 1) return line;
  const pieces = line.text.split(INLINE_OPTION);
  if (pieces.length < 2) return line;
  const marks = pieces.map((p) => OPTION_MARKER.exec(p));
  if (marks.some((m) => m === null)) return line;
  const letters = marks.map(
    (m) => (m as RegExpExecArray)[1] ?? (m as RegExpExecArray)[2]
  );
  const style = (m: RegExpExecArray) => m[0].trim().replace(/[A-Fa-f]/, 'x');
  const first = style(marks[0] as RegExpExecArray);
  const consecutive = letters.every(
    (l, i) => i === 0 || l.charCodeAt(0) === letters[i - 1].charCodeAt(0) + 1
  );
  if (!consecutive) return line;
  if (marks.some((m) => style(m as RegExpExecArray) !== first)) return line;
  if (pieces.slice(0, -1).some((p) => JOINS_ON.test(p.trim()))) return line;
  const emphasized = line.emphasized ? { emphasized: true } : {};
  return {
    ...line,
    segments: pieces.map((text, i) => ({
      text,
      ...(i === 0 && line.segments?.[0]?.x !== undefined
        ? { x: line.segments[0].x }
        : {}),
      ...emphasized,
    })),
  };
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
    const line = splitInlineOptions(splitSpacedOptions(original));
    const filled = (line.segments ?? []).filter((s) => s.text.trim());
    if (filled.length < 2) {
      out.push(line);
      continue;
    }
    // Word and RTF print the number first on its line or after a `____` blank (E1).
    const positioned = filled.some((s) => s.x !== undefined);
    // Only an ExamView row, led by a `____` blank, holds its number to the blank.
    const blankFirst = /^_{2,}$/.test(filled[0].text.trim());
    const groups: DocSegment[][] = [];
    for (const segment of lineSegments(line)) {
      const text = segment.text.trim();
      if (!text) continue;
      const last = groups[groups.length - 1];
      const question =
        matchQuestionOpening(text) !== null &&
        (positioned || !last || !blankFirst || isBlankGroup(last));
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
        ...(i === 0 && line.mathPicture ? { mathPicture: true } : {}),
        ...(i === 0 && line.besideIds ? { besideIds: line.besideIds } : {}),
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
  /** A caption or heading ended this choice; nothing later joins it. */
  closed?: boolean;
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
  /** The paragraph between the heading and its first question (E16). */
  directions?: string;
  questionCount: number;
  /** The last item number opened here. */
  lastItem: number;
  /** ExamView's matching term list the next items answer from (E6). */
  matching?: MatchingGroup;
}

interface MatchingGroup {
  id: string;
  terms: ExtractedOption[];
  directions?: string;
  items: number;
  /** The term list came after its items, so the next item starts another set. */
  termsAfterItems?: boolean;
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
  /** The bookkeeping printed with an inline `ANS:`, and whether written answer lines follow. */
  inlineFields?: string[];
  inlineCollecting?: boolean;
  matching?: MatchingGroup;
  target?: SuggestedTarget;
  sharedTextId?: string;
  /** The lead-in whose questions all use one picture. */
  pictureGroup?: object;
  /** A Word table inside the stem, and where in `textParts` it sat. */
  table?: { at: number; rows: string[] };
  /** Row notes about this question's pictures. */
  pictureNotes?: string[];
  /** "Read paragraph 8." copied into this stem from a shared lead-in. */
  instruction?: string;
  /** The instruction is the section's directions, which a real section takes back (E16). */
  instructionFromDirections?: boolean;
  /** Every line read into this question, for rebuilding a sorting table. */
  rawLines: DocLine[];
  /** `I.`–`VIII.` statements in the stem, and where in `textParts` they sat (E3). */
  statements?: { at: number; items: { n: number; text: string }[] };
  /** The printed number before this one, when the numbering skipped (E1). */
  skippedFrom?: number;
  /** The PDF line holding a target that filled the opening line, while it may still wrap. */
  targetLine?: DocLine;
  /** A written item's lettered parts and part labels, one line each (E5). */
  partLines?: string[];
}

/** `I.` … `VIII.` opening a statement in a stem (E3). */
const ROMAN_STATEMENT = /^\s*\(?(VIII|VII|VI|IV|V|III|II|I)[.)](?:\s+|$)(.*)$/;
/** Two or more spaces before the next statement's numeral. */
const SPACED_ROMAN =
  /(?<!\s)\s{2,}(?=\(?(?:VIII|VII|VI|IV|V|III|II|I)[.)](?:\s|$))/;

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
  const table = draft.table;
  if (!statements && table) {
    const before = tidy(draft.textParts.slice(0, table.at).join(' '));
    const after = tidy(draft.textParts.slice(table.at).join(' '));
    return [before, ...table.rows, after].filter(Boolean).join('\n');
  }
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
  /** Printed under a question's choices, so it leads into the questions after it. */
  midTest?: boolean;
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
  const printed = [stemText(draft), ...(draft.partLines ?? [])]
    .filter(Boolean)
    .join('\n');
  let text =
    draft.instruction && !draft.matching
      ? `${tidy(draft.instruction)} ${printed}`
      : printed;
  let blankAnswer: string | undefined;
  if (draft.matching) {
    // A letter written in the answer blank is the key.
    blankAnswer = FILLED_BLANK.exec(text)?.[1]?.toUpperCase();
    text = text
      .replace(FILLED_BLANK, '')
      .replace(/^_{2,}\s*/, '')
      .replace(/\s*_{2,}$/, '');
  }
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
    } else if (
      marked.length > 1 &&
      // Three or more choices all marked is how the test is formatted, not an answer.
      (marked.length < sortedOptions.length || marked.length < 3) &&
      !keyed &&
      !draft.inlineAnswer
    ) {
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
  warnings.push(...(draft.pictureNotes ?? []));
  if (draft.part && draft.part !== 'A') {
    warnings.push(`Part ${draft.part} credit doesn’t depend on Part A here.`);
  }

  const ref: QuestionRef = {
    section: draft.section.ordinal,
    ...(draft.section.name ? { sectionName: draft.section.name } : {}),
    ...(draft.section.directions
      ? { sectionDirections: draft.section.directions }
      : {}),
    ...(draft.section.printed ? { sectionNumber: draft.section.printed } : {}),
    item: draft.item,
    ...(draft.part ? { part: draft.part } : {}),
  };

  const matchingDirections = draft.matching
    ? onScreen(draft.matching.directions ?? setDirections(draft.section))
    : undefined;
  const question: ExtractedQuestion = {
    number: position,
    ref,
    ...(label !== String(position) ? { sourceLabel: label } : {}),
    text,
    type,
    options,
    correctAnswer,
    imageIds: [...new Set(draft.imageIds)],
    warnings,
    ...(draft.target ? { suggestedTarget: draft.target } : {}),
    ...(draft.sharedTextId ? { sharedTextId: draft.sharedTextId } : {}),
    ...(draft.instruction && draft.instructionFromDirections
      ? { directionsLeadIn: tidy(draft.instruction) }
      : {}),
    ...(draft.section.ungraded
      ? {
          suggestUntick:
            'This looks like a self-reflection item rather than a graded question.',
        }
      : {}),
    ...(draft.matching
      ? {
          matchingGroup: draft.matching.id,
          ...(matchingDirections ? { matchingDirections } : {}),
        }
      : {}),
  };
  const inlineAnswer = draft.inlineAnswer ?? blankAnswer;
  // The key at the back is merged afterwards and wins over this; ExamView's goes in as a key.
  return inlineAnswer && type !== 'Ordering' && !examView
    ? applyKeyAnswer(question, inlineAnswer, 'document', multi)
    : question;
}

/** A written question the reader expected choices on says so, after any key has had its say. */
function noteMissingChoices(
  question: ExtractedQuestion,
  sorting: boolean
): ExtractedQuestion {
  if (
    question.type !== 'free-response' ||
    sorting ||
    question.examView === 'written'
  ) {
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
  // "II. Multiple Choice: Choose the one best answer…": a type heading with its directions.
  const typed = TYPED_SECTION.exec(trimmed);
  if (typed && NAMED_SECTION.test(tidy(typed[1]))) {
    return { name: tidy(typed[1]), ungraded: false };
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
  // "Matching (Write the letter on the line…)": the parenthetical is directions, not the name.
  const bare = trimmed.replace(/\s*\([^()]*\)$/, '') || trimmed;
  const words = bare.split(' ').length;
  if (words > 8) return null;
  if (NAMED_SECTION.test(bare)) {
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
  // The question under a bold target, or one that asks something, is not its wrap.
  if (Boolean(previous.emphasized) !== Boolean(line.emphasized)) return false;
  if (/\?\s*$/.test(line.text)) return false;
  const gap = previous.y - line.y;
  return gap > 0 && gap < TARGET_WRAP_GAP;
}

/** "Use the following for the next 3 questions": one list of choices for several questions. */
const SHARED_CHOICES =
  /\b(?:use|refer\s+to)\b.{0,40}\b(?:for|to\s+answer)\s+(?:the\s+)?next\s+(\d{1,2}|two|three|four|five|six)\s+(?:questions|items)\b/i;
const COUNT_WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

const NON_CHOICE_LINE =
  /^(?:\(?(?:figure|fig\.|graph|table|diagram)\s*\d+\)?\.?$|use\s+(?:the\s+)?(?:figure|graph|table|diagram)\b|topic\s+\d+\s*:)/i;

/** `Name: ____`, `Class:`, `Date`: the fields printed across the top of a page. */
const PAGE_HEADER_FIELD =
  /^\s*(?:name|class|date|period|hour|block|teacher|student)\b\s*[:_]/i;

/** `Article: Cuba Goes Dark`, `Reading: The Water Cycle`. */
const LABELLED_TITLE = /^[A-Z][A-Za-z]{2,}\s*:\s+\S/;

/** How far a wrapped piece may sit from the choice text above it, in points. */
const COLUMN_WRAP_TOLERANCE = 3;

/** `Name: ____` printed on the same line as a heading. */
const TRAILING_HEADER_FIELD =
  /\s*\b(?:name|date|class|period|hour|block)\b\s*:?\s*_{3,}.*$/i;

/** A line telling students what to do, which is a lead-in and never a heading. */
const DIRECTION_OPENING =
  /^(?:use|using|refer|read|answer|choose|circle|write|match|for|look|based|according|note|directions?)\b/i;

/** A bold line of a few words that is no question, choice or sentence. */
function isBoldHeading(line: DocLine, text: string): boolean {
  const trimmed = tidy(text);
  return (
    line.emphasized === true &&
    // Word marks emphasis far more loosely than a PDF's bold font does.
    line.page !== undefined &&
    trimmed.split(' ').length <= 10 &&
    /^[A-Z0-9]/.test(trimmed) &&
    /\p{L}{3,}/u.test(trimmed) &&
    !/[.?!,;)]$/.test(trimmed) &&
    !DIRECTION_OPENING.test(trimmed) &&
    !RANGE_INSTRUCTION.test(trimmed) &&
    captionLabels(trimmed).length === 0 &&
    !/_{3,}/.test(trimmed) &&
    !matchQuestionOpening(trimmed) &&
    !isOptionText(trimmed) &&
    !targetOf(trimmed)
  );
}

/** Text after a choice that can't be its wrap: a caption, instruction, heading, or a line starting left of the choice. */
function isNotChoiceText(
  option: DocLine,
  previous: DocLine,
  line: DocLine,
  text: string
): boolean {
  if (NON_CHOICE_LINE.test(text.trim())) return true;
  if (line.page === undefined) return false;
  // A bold line under a plain choice is a heading.
  if (line.emphasized && !option.emphasized) return true;
  if (line.page !== previous.page) {
    // Over a page break only an unfinished sentence carries on; a header or heading does not.
    return (
      /[.?!]["”’)]?\s*$/.test(previous.text) || PAGE_HEADER_FIELD.test(text)
    );
  }
  if (line.page !== option.page) return false;
  const x = lineSegments(line)[0]?.x;
  const optionX = lineSegments(option)[0]?.x;
  // A line a line-height under is a wrap back to the margin; only a paragraph gap ends the choice.
  return (
    x !== undefined &&
    optionX !== undefined &&
    x < optionX - 1 &&
    !isTargetWrap(previous, line)
  );
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
  const headers = runningHeaders(lines);
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
  /** Choices printed once for the next few questions. */
  let choiceBank: {
    remaining: number;
    options: OptionDraft[];
    collecting: boolean;
  } | null = null;
  /** Questions opened on one printed row, with where each number sits. */
  let rowMates: Array<{ draft: Draft; x: number }> = [];
  /** A target line met between questions, for the wrap under it. */
  let looseTarget: DocLine | null = null;
  /** A preamble already turned into shared text, still covering later items. */
  let covering: {
    range?: [number, number];
    section: Section;
    textId?: string;
    instruction?: string;
    /** An instruction with no question range covers only the next question. */
    once?: boolean;
    /** A lead-in with no range covers the next question, then each one that refers back. */
    whileReferring?: boolean;
    used?: boolean;
    /** The lead-in points at a picture every question in its range uses. */
    sharesPictures?: boolean;
  } | null = null;
  /** Pictures waiting for the question printed under them. */
  let pendingPictures: string[] = [];
  /** Matching directions that may still wrap onto the next line. */
  let directionsOpen: MatchingGroup | null = null;

  /** Each picture's printed captions, and lettering printed with it that its file doesn't hold. */
  const captions = new Map<string, string[]>();
  const lostLabels = new Map<string, string[]>();
  for (const line of lines) {
    for (const [id, labels] of Object.entries(line.figureLabels ?? {})) {
      captions.set(id, labels);
    }
    for (const id of line.lostLabels ? (line.imageIds ?? []) : []) {
      lostLabels.set(id, line.lostLabels ?? []);
    }
  }
  const hasPicture = (line: DocLine | undefined): boolean =>
    (line?.imageIds?.length ?? 0) > 0;
  const uncaptioned = (line: DocLine | undefined): boolean =>
    (line?.imageIds ?? []).some((id) => !captions.has(id));
  /** "A", "B": a few words beside a picture that open no question or choice. */
  const isLettering = (line: DocLine | undefined): boolean => {
    const text = line?.text.trim() ?? '';
    return (
      line !== undefined &&
      text.length <= 24 &&
      text.split(/\s+/).length <= 3 &&
      /[\p{L}\d]/u.test(text) &&
      !/[.?!:,;]$/.test(text) &&
      !matchQuestionOpening(text) &&
      !matchOption(line) &&
      captionLabels(text).length === 0
    );
  };
  // A Word caption is a line of its own near its picture; a PDF's was read off the page.
  lines.forEach((line, i) => {
    if (line.page !== undefined) return;
    const labels = captionLabels(line.text);
    if (labels.length === 0) return;
    const near: number[] = [];
    for (let d = 1; d <= CAPTION_REACH && near.length < labels.length; d += 1) {
      for (const at of [i - d, i + d]) {
        if (near.length < labels.length && uncaptioned(lines[at])) {
          near.push(at);
        }
      }
    }
    near.sort((a, b) => a - b);
    near.forEach((at, n) => {
      const own = near.length === labels.length ? [labels[n]] : labels;
      // One caption also names the pictures joined to its own by nothing but lettering.
      const block = [at];
      const letters: string[] = [];
      if (near.length === 1) {
        for (const step of [-1, 1]) {
          for (let k = at + step; k !== i && lines[k]; k += step) {
            const other = lines[k];
            if (hasPicture(other) && !other.text.trim()) block.push(k);
            else if (isLettering(other)) letters.push(other.text.trim());
            else break;
          }
        }
      }
      for (const k of block) {
        for (const id of lines[k].imageIds ?? []) {
          if (!captions.has(id)) captions.set(id, own);
          if (letters.length > 0 && !lostLabels.has(id)) {
            lostLabels.set(id, letters);
          }
        }
      }
    });
  });

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
      ...(heading?.name
        ? {
            name:
              heading.name.replace(TRAILING_HEADER_FIELD, '') || heading.name,
          }
        : {}),
      ...(heading?.printed ? { printed: heading.printed } : {}),
      ungraded: heading?.ungraded ?? false,
      questionCount: 0,
      lastItem: 0,
    };
    target = undefined;
    preamble = null;
    covering = null;
  };

  /** Passages found without a cue or a question range. */
  const guessedTexts = new Set<string>();

  /** Does a passage start at `index`: prose running from here to the next question, option or heading? */
  const passageStartsAt = (index: number): boolean => {
    const block: string[] = [];
    for (let n = index; n < lines.length; n += 1) {
      if (keyLineIndexes.has(n)) break;
      const text = lines[n].text.trim();
      if (!text) continue;
      if (
        matchQuestionOpening(text) ||
        matchOption(lines[n]) ||
        sectionHeading(text, examView) ||
        RANGE_INSTRUCTION.test(text)
      ) {
        break;
      }
      block.push(text);
    }
    return passageOf(block) !== null;
  };

  /** Settles the preamble, and notes when its question range shares a picture. */
  const settlePreamble = (): void => {
    const waiting = preamble;
    settleText();
    const range = waiting?.range;
    if (!waiting || !range || !PICTURE_LEAD.test(waiting.lines.join(' '))) {
      return;
    }
    if (covering?.range !== range) {
      covering = { range, section: waiting.section };
    }
    covering.sharesPictures = true;
  };

  /** Turn a waiting preamble into shared text for the questions it covers (R25). */
  const settleText = (): void => {
    const waiting = preamble;
    preamble = null;
    if (!waiting) return;
    const all = tidy(waiting.lines.join(' '));
    if (!all) return;
    // Directions heading the test tell students how to take it; they are no passage.
    const heading =
      drafts.length === 0 &&
      !waiting.range &&
      !PASSAGE_CUE.test(all) &&
      TEST_DIRECTIONS.test(all);
    const found =
      options.passages && !heading ? passageOf(waiting.lines) : null;
    if (found) {
      const id = `text-${texts.length + 1}`;
      texts.push({
        id,
        text: found.text,
        label: found.label ?? nextPassageLabel(texts),
      });
      // Found by length alone, so the review asks the teacher to check the link.
      const guessed = !waiting.range && !PASSAGE_CUE.test(all);
      if (guessed) guessedTexts.add(id);
      covering = {
        ...(waiting.range ? { range: waiting.range } : {}),
        section: waiting.section,
        textId: id,
        ...(found.instruction ? { instruction: found.instruction } : {}),
        // A note about the figures stays with the questions that keep pointing at them.
        ...(guessed && PICTURE_LEAD.test(found.text)
          ? { whileReferring: true }
          : {}),
      };
      return;
    }
    const sentences = all.split(/(?<=[.?!])\s+/);
    const instruction =
      sentences.find(
        (s) => READ_INSTRUCTION.test(s) && !RANGE_INSTRUCTION.test(s)
      ) ?? undefined;
    const passage = sentences
      .filter((s) => s !== instruction && !RANGE_INSTRUCTION.test(s))
      .join(' ');
    /** A paragraph under a question's choices goes with what follows, never nowhere. */
    const leadIn = (): void => {
      const lead = sentences
        .filter((s) => !RANGE_INSTRUCTION.test(s))
        .join(' ');
      if (!lead) return;
      if (lead.length <= SHORT_LEAD_IN) {
        covering = { once: true, section: waiting.section, instruction: lead };
        return;
      }
      const id = `text-${texts.length + 1}`;
      texts.push({ id, text: lead, label: nextPassageLabel(texts) });
      guessedTexts.add(id);
      covering = { section: waiting.section, textId: id, whileReferring: true };
    };
    if (passage.length > SHORT_LEAD_IN || (!instruction && passage)) {
      // Without a question range, only a "read the passage" cue makes it shared text.
      if (
        !waiting.range &&
        (!PASSAGE_CUE.test(all) || passage.length <= SHORT_LEAD_IN)
      ) {
        if (waiting.midTest) leadIn();
        return;
      }
      const id = `text-${texts.length + 1}`;
      texts.push({
        id,
        text: passage,
        label:
          passage.length <= SHORT_LEAD_IN
            ? 'Directions'
            : nextPassageLabel(texts),
      });
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

  const newGroup = (directions?: string): MatchingGroup => ({
    id: `m${drafts.length + 1}`,
    terms: [],
    items: 0,
    ...(directions ? { directions } : {}),
  });

  /** The line that opened the current question, for a term printed beside it. */
  let openedAt = -1;

  const openQuestion = (item: number, text: string, line: DocLine): Draft => {
    // Text between a heading and its first question is the section's directions (E16).
    const directions =
      preamble &&
      preamble.section === section &&
      section.questionCount === 0 &&
      section.name &&
      !preamble.range
        ? tidy(preamble.lines.join(' '))
        : undefined;
    const textCount = texts.length;
    settlePreamble();
    if (directions && texts.length === textCount) {
      section.directions = directions;
    }
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
    const lapsed =
      cover?.whileReferring === true &&
      cover.used === true &&
      !REFERS_BACK.test(stem);
    const covered =
      cover &&
      !lapsed &&
      cover.section === section &&
      (!cover.range || (item >= cover.range[0] && item <= cover.range[1]));
    if (cover && ((!covered && cover.range) || cover.once || lapsed)) {
      covering = null;
    }
    if (cover && covered) cover.used = true;
    const waitingPictures = pendingPictures;
    pendingPictures = [];
    // The next question under a shared list of choices takes a copy of it.
    const banked =
      choiceBank && choiceBank.options.length >= 2
        ? [...choiceBank.options]
            .sort((p, q) => p.letter.localeCompare(q.letter))
            .map((o) => ({ ...o, wraps: [], closed: true }))
        : [];
    if (choiceBank) {
      choiceBank.collecting = false;
      choiceBank.remaining -= 1;
      if (choiceBank.remaining <= 0) choiceBank = null;
    }
    current = {
      item,
      ...(part && part[1].toUpperCase() === 'A' ? { part: 'A' } : {}),
      section,
      textParts: [part && part[1].toUpperCase() === 'A' ? part[2] : stem],
      ...(part && part[1].toUpperCase() === 'A'
        ? { leadIn: { parts: [] } }
        : {}),
      options: banked,
      gridded: false,
      imageIds: [...waitingPictures, ...(line.imageIds ?? [])],
      ...(target ? { target } : {}),
      ...(covered && cover?.textId ? { sharedTextId: cover.textId } : {}),
      ...(covered && cover?.sharesPictures ? { pictureGroup: cover } : {}),
      ...(covered && cover?.instruction
        ? {
            instruction: cover.instruction,
            ...(section.directions && section.questionCount === 1
              ? { instructionFromDirections: true }
              : {}),
          }
        : {}),
      rawLines: [],
      ...(inlineTarget && !inlineTarget.rest && line.y !== undefined
        ? { targetLine: line }
        : {}),
    };
    let group = section.matching;
    if (group?.termsAfterItems) {
      // A set printed items first is over; only a Matching section starts another.
      group = namedMatching(section.name) ? newGroup() : undefined;
      section.matching = group;
    } else if (!group && namedMatching(section.name)) {
      group = newGroup();
      section.matching = group;
    }
    if (group) {
      group.items += 1;
      current.matching = group;
    }
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
      if (!line.imageIds?.length) return;
      // A picture heading its page, or set in a lead-in, belongs to the question under it.
      if (line.leads || (!open && drafts.length > 0)) {
        pendingPictures.push(...line.imageIds);
      } else if (open) {
        open.imageIds.push(...line.imageIds);
      }
      return;
    }
    if (headers.has(tidy(text))) return;

    const wrappingDirections = directionsOpen;
    directionsOpen = null;
    if (
      wrappingDirections &&
      !/[.!?:]$/.test(wrappingDirections.directions ?? '') &&
      !matchQuestionOpening(text) &&
      !matchingTerms(line)
    ) {
      wrappingDirections.directions = tidy(
        `${wrappingDirections.directions ?? ''} ${text}`
      );
      directionsOpen = wrappingDirections;
      return;
    }

    const open = current;

    // A written item's parts, and a label like "20 A" naming its own number, stay in its prompt.
    if (
      open &&
      examView &&
      examViewKindOf(open.section.name) === 'written' &&
      open.options.length === 0
    ) {
      const entries = entriesOnLine(text, multi);
      const ownLabel = entries.length === 1 && entries[0][0] === open.item;
      const part = Boolean(matchOption(line));
      const opening = matchQuestionOpening(text);
      const elsewhere =
        (opening !== null && opening.number > open.item && !ownLabel) ||
        isHeading(text) ||
        Boolean(sectionHeading(text, examView)) ||
        INLINE_TEST_BANK_ANSWER.test(text) ||
        TEST_BANK_FIELD_LINE.test(text) ||
        Boolean(targetOf(text));
      const parts = open.partLines;
      if (!elsewhere && (ownLabel || part || parts)) {
        const tidied = tidy(text);
        if (!parts) open.partLines = [tidied];
        else if (ownLabel || part) parts.push(tidied);
        else
          parts[parts.length - 1] = tidy(`${parts[parts.length - 1]} ${text}`);
        open.imageIds.push(...(line.imageIds ?? []));
        return;
      }
    }

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

    // One list of choices printed above the questions that share it.
    const shared = matchQuestionOpening(text)
      ? null
      : SHARED_CHOICES.exec(text);
    if (shared) {
      endQuestion();
      const count = COUNT_WORDS[shared[1].toLowerCase()] ?? Number(shared[1]);
      choiceBank = { remaining: count, options: [], collecting: true };
      return;
    }
    if (choiceBank?.collecting && !open) {
      const banked = matchOption(line);
      if (banked) {
        choiceBank.options.push({ ...banked, marked: false, line, wraps: [] });
        return;
      }
      if (!matchQuestionOpening(text)) choiceBank = null;
    }

    // A target that wrapped, when it stands between questions.
    if (
      looseTarget &&
      target &&
      !/[.!?]$/.test(target.label) &&
      isTargetWrap(looseTarget, line)
    ) {
      target = { ...target, label: tidy(`${target.label} ${text}`) };
      looseTarget = line;
      return;
    }
    looseTarget = null;

    const lineTarget = targetOf(text);
    if (lineTarget) {
      target = lineTarget;
      // Inside a stem it belongs to this question; after the options, to the next.
      if (open && open.options.length === 0) {
        open.target = lineTarget;
        open.targetLine = line;
      } else {
        endQuestion();
        looseTarget = line;
      }
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
      if (open) {
        if (answer) open.inlineAnswer = answer;
        open.inlineFields = [inline[1]];
        // A blank `ANS:` means the written answer is on the lines below.
        open.inlineCollecting =
          !answer && !TEST_BANK_FIELD_LINE.test(inline[1].trim());
      }
      lastOption = null;
      return;
    }
    if (TEST_BANK_FIELD_LINE.test(text)) {
      if (open?.inlineFields) {
        open.inlineFields.push(text);
        open.inlineCollecting = false;
      }
      return;
    }
    if (open?.inlineCollecting && !matchQuestionOpening(text)) {
      open.inlineAnswer = tidy(`${open.inlineAnswer ?? ''} ${text}`);
      return;
    }

    // A matching set's lettered terms, above or below its items (E6).
    const inMatching =
      section.matching !== undefined || namedMatching(section.name);
    const bank = inMatching ? matchingTerms(line) : null;
    if (bank && !bank.lead && (!open || open.matching)) {
      const letters = bank.terms.map((t) => t.letter);
      const group = section.matching;
      const repeats =
        group?.terms.some((t) => letters.includes(t.letter)) ?? false;
      if (
        group &&
        repeats &&
        open?.matching === group &&
        !namedMatching(section.name)
      ) {
        // Directions alone opened the set, so letters starting over are this question's own choices.
        group.items -= 1;
        open.matching = undefined;
        section.matching = undefined;
      } else {
        let into = group;
        if (!into || repeats) {
          into = newGroup();
          section.matching = into;
        }
        // A term in the column beside an item isn't a list printed after the items.
        const besideItem =
          index === openedAt + 1 &&
          columnLines.has(line) &&
          columnLines.has(lines[openedAt]);
        if (into.items > 0 && !besideItem) into.termsAfterItems = true;
        into.terms.push(...bank.terms);
        endQuestion();
        return;
      }
    }

    // A heading can't interrupt a sentence that is still running.
    const midSentence =
      open &&
      !open.matching &&
      open.options.length === 0 &&
      !/(?:[.?!:)]|_{3,})\s*$/.test(open.textParts.join(' ').trim());
    const heading = midSentence ? null : sectionHeading(text, examView);
    if (heading) {
      startSection(heading);
      return;
    }
    const betweenQuestions = !open || open.options.length > 0;
    // The name and date fields across the top of a page are not part of any question.
    if (
      betweenQuestions &&
      line.page !== undefined &&
      PAGE_HEADER_FIELD.test(text)
    ) {
      return;
    }
    // A short bold line between questions heads the ones under it: "Article: Cuba Goes Dark".
    if (
      betweenQuestions &&
      isBoldHeading(line, text) &&
      !lastOption?.line.emphasized &&
      (drafts.length > 0 || Boolean(open) || LABELLED_TITLE.test(text))
    ) {
      startSection({ name: tidy(text), ungraded: false });
      return;
    }

    // "Match each term…" opens a term list, under a Matching heading or not.
    if (
      MATCH_DIRECTIONS.test(text) &&
      !matchQuestionOpening(text) &&
      (!open || open.matching || open.options.length > 0)
    ) {
      endQuestion();
      section.matching = newGroup(tidy(text));
      directionsOpen = section.matching;
      return;
    }

    // `1. ____ definition    G. term`: the term beside the item joins its set.
    const beside =
      inMatching && matchQuestionOpening(text) ? matchingTerms(line) : null;
    const opening = matchQuestionOpening(beside?.lead ?? text);
    const numberX =
      opening && !opening.labelled ? numberPosition(line) : undefined;
    // `5. …    6. …`: the next number printed beside the last one is a question, however far across.
    const besideLast =
      opening !== null &&
      columnLines.has(line) &&
      line.y !== undefined &&
      lines[openedAt]?.y === line.y &&
      lines[openedAt]?.page === line.page &&
      opening.number === section.lastItem + 1;
    if (opening && (besideLast || atNumberPosition(numberXs, numberX))) {
      const n = opening.number;
      // ExamView numbers straight through, so only a heading restarts it.
      // A `1.` inside a stem that hasn't reached its options is a list, not a restart.
      const restart =
        !examView &&
        n === 1 &&
        section.questionCount >= 2 &&
        section.lastItem > 1 &&
        (!open ||
          open.options.length > 0 ||
          drafts.every((d) => d.section !== section || d.options.length === 0));
      const skip = n - section.lastItem;
      const first = section.questionCount === 0;
      if (restart || first || skip >= 1) {
        if (restart) startSection();
        const opened = openQuestion(n, opening.text, line);
        openedAt = index;
        const mate = { draft: opened, x: numberX ?? 0 };
        rowMates = besideLast ? [...rowMates, mate] : [mate];
        if (beside?.lead && opened.matching) {
          opened.matching.terms.push(...beside.terms);
        }
        if (!restart && !first && skip > 1) opened.skippedFrom = n - skip;
        if (
          numberX !== undefined &&
          !numberXs.some((x) => Math.abs(x - numberX) <= NUMBER_X_TOLERANCE)
        ) {
          numberXs.push(numberX);
        }
        return;
      }
      // `5. ______`: the answer blank for a question already read.
      if (n <= section.lastItem && /^_{3,}$/.test(opening.text.trim())) return;
    }

    const range = RANGE_INSTRUCTION.exec(text) ?? FOR_RANGE.exec(text);
    // Directions for the questions that come next end a written question above them.
    const leadsNext =
      range !== null &&
      Number(range[1]) === section.lastItem + 1 &&
      Number(range[2]) > Number(range[1]) &&
      DIRECTIONS_START.test(text);
    if (
      range &&
      (!open || open.matching || open.options.length > 0 || leadsNext)
    ) {
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
      // A caption names its picture; it isn't part of a lead-in.
      if (captionLabels(text).length > 0) return;
      // The name and hour blanks beside a title are not part of the lead-in.
      const kept =
        line.page === undefined
          ? text
          : text.replace(TRAILING_HEADER_FIELD, '').trim();
      if (!/[\p{L}\d]/u.test(kept)) return;
      if (preamble) preamble.lines.push(kept);
      else preamble = { lines: [kept], section };
      return;
    }

    // Under questions printed side by side, each column's next line returns to its own question.
    if (rowMates.length > 1) {
      const mates = rowMates;
      const pieces = lineSegments(line).filter((p) => p.text.trim());
      const owners = pieces.map((p) => {
        const x = p.x;
        if (x === undefined) return undefined;
        let at = -1;
        mates.forEach((m, i) => {
          if (x >= m.x - NUMBER_X_TOLERANCE) at = i;
        });
        const next = mates[at + 1];
        const fits = !next || p.xEnd === undefined || p.xEnd <= next.x;
        return at >= 0 && fits ? mates[at] : undefined;
      });
      if (
        line.page === lines[openedAt]?.page &&
        mates.every((m) => m.draft.options.length === 0) &&
        !matchOption(line) &&
        owners.every(Boolean)
      ) {
        pieces.forEach((p, i) => {
          owners[i]?.draft.textParts.push(tidy(p.text));
        });
        return;
      }
      rowMates = [];
    }

    // A starred bold note under a written question is the teacher's, not the question's.
    if (
      open.options.length === 0 &&
      line.page !== undefined &&
      line.emphasized &&
      !lines[openedAt]?.emphasized &&
      text.startsWith('*')
    ) {
      endQuestion();
      preamble = { lines: [text], section };
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

    // A passage after the choices, or a titled one after a written stem, belongs to the questions after it.
    const choice = lastOption;
    const afterChoice = choice
      ? !isWrapOf(choice.line, choice.wraps.at(-1) ?? choice.line, line)
      : open.options.length === 0 && PASSAGE_TITLE.test(text);
    if (options.passages && afterChoice && passageStartsAt(index)) {
      open.rawLines.pop();
      endQuestion();
      // A ruled line above the passage is not part of it.
      preamble = { lines: /[\p{L}\d]/u.test(text) ? [text] : [], section };
      return;
    }

    // A wrapped line: continues the option it follows, or the stem if the
    // question hasn't reached its options yet.
    const wrapping = lastOption;
    if (wrapping) {
      // A caption, a rule or a paragraph under the choices ends them; a paragraph leads into the next question.
      if (
        wrapping.closed ||
        !/[\p{L}\d]/u.test(text) ||
        isNotChoiceText(
          wrapping.line,
          wrapping.wraps.at(-1) ?? wrapping.line,
          line,
          text
        )
      ) {
        wrapping.closed = true;
        open.rawLines.pop();
        open.imageIds.push(...(line.imageIds ?? []));
        if (captionLabels(text).length > 0 || !/[\p{L}\d]/u.test(text)) {
          return;
        }
        endQuestion();
        preamble = { lines: [text], section, midTest: true };
        return;
      }
      const pieces = lineSegments(line).filter((p) => p.text.trim());
      const owners = pieces.map((p) =>
        [...open.options]
          .reverse()
          .find((o) =>
            lineSegments(o.line).some(
              (g) =>
                p.x !== undefined &&
                g.x !== undefined &&
                Math.abs(g.x - p.x) <= COLUMN_WRAP_TOLERANCE
            )
          )
      );
      if (
        pieces.length > 1 &&
        owners.every(Boolean) &&
        new Set(owners).size === pieces.length
      ) {
        // Choices in two columns wrap side by side; each piece returns to the choice above it.
        pieces.forEach((p, i) => {
          const owner = owners[i] as OptionDraft;
          owner.text = tidy(`${owner.text} ${p.text}`);
        });
      } else {
        wrapping.text = tidy(`${wrapping.text} ${text}`);
      }
      wrapping.wraps.push(line);
    } else if (
      line.tableRow &&
      !open.statements &&
      !SORTING.test(open.textParts.join(' '))
    ) {
      // A Word table in the stem keeps its rows, one to a line.
      open.table ??= { at: open.textParts.length, rows: [] };
      open.table.rows.push(
        lineSegments(line)
          .map((cell) => tidy(cell.text))
          .filter(Boolean)
          .join(' | ')
      );
    } else {
      open.textParts.push(text);
    }
    open.imageIds.push(...(line.imageIds ?? []));
  });

  // A picture a question names by its caption goes to that question, wherever it was printed.
  const namedIn = (draft: Draft): Set<string> =>
    figureRefs(
      [
        draft.instruction ?? '',
        ...(draft.leadIn?.parts ?? []),
        ...draft.textParts,
        texts.find((t) => t.id === draft.sharedTextId)?.text ?? '',
      ].join(' ')
    );
  for (const [id, labels] of captions) {
    const naming = new Set(
      drafts.filter((d) => labels.some((label) => namedIn(d).has(label)))
    );
    if (naming.size === 0) continue;
    const kinds = [...new Set(labels.map((label) => label.split(' ')[0]))];
    // "the graph to the right" keeps the picture printed beside it.
    const unnamed = new RegExp(
      `\\b(?:the|this|that)\\s+(?:${kinds.join('|')})s?\\b(?!\\s*#?\\s*\\d)`,
      'i'
    );
    for (const draft of drafts) {
      const has = draft.imageIds.includes(id);
      if (naming.has(draft)) {
        if (!has) draft.imageIds.push(id);
      } else if (has && !unnamed.test(draft.textParts.join(' '))) {
        draft.imageIds = draft.imageIds.filter((other) => other !== id);
      }
    }
    // "the graph" in the question next to one that names Graph 1 is the same graph.
    const holders = drafts.map((d) => d.imageIds.includes(id));
    drafts.forEach((draft, i) => {
      if (
        !holders[i] &&
        (holders[i - 1] || holders[i + 1]) &&
        unnamed.test(draft.textParts.join(' '))
      ) {
        draft.imageIds.push(id);
      }
    });
  }
  // "Use the diagram to answer questions 17-20" puts the diagram on all four.
  const groups = new Map<object, Draft[]>();
  for (const draft of drafts) {
    if (!draft.pictureGroup) continue;
    groups.set(draft.pictureGroup, [
      ...(groups.get(draft.pictureGroup) ?? []),
      draft,
    ]);
  }
  for (const members of groups.values()) {
    const shared = [...new Set(members.flatMap((d) => d.imageIds))];
    for (const draft of members) draft.imageIds = [...shared];
  }
  drafts.forEach((draft, i) => {
    const before = drafts[i - 1];
    if (
      draft.imageIds.length === 0 &&
      before &&
      before.section === draft.section &&
      before.imageIds.length > 0
    ) {
      const stem = draft.textParts.join(' ');
      if (FIGURE_ABOVE.test(stem)) draft.imageIds = [...before.imageIds];
      else if (LABEL_ASKED.test(stem)) {
        // "…represented by which number?" needs the diagram the question before it used.
        draft.imageIds = [...before.imageIds];
        draft.pictureNotes = [
          'This question asks about a label on a picture, so it was given the picture from the question before it. Check that it is the right one.',
        ];
      }
    }
  });

  const besideIds = new Set(lines.flatMap((line) => line.besideIds ?? []));
  for (const draft of drafts) {
    const stem = draft.textParts.join(' ');
    if (
      !draft.imageIds.some((id) => besideIds.has(id)) ||
      REFERS_BACK.test(stem) ||
      LABEL_ASKED.test(stem)
    ) {
      continue;
    }
    draft.pictureNotes = [
      ...(draft.pictureNotes ?? []),
      'This picture is printed beside more than one question, so it was added to each of them. Remove it here if this question doesn’t use it.',
    ];
  }

  const mathPictures = new Set(
    lines.flatMap((line) => (line.mathPicture ? (line.imageIds ?? []) : []))
  );
  for (const draft of drafts) {
    if (!draft.imageIds.some((id) => mathPictures.has(id))) continue;
    draft.pictureNotes = [
      ...(draft.pictureNotes ?? []),
      'This question has math that plain text can’t show in full, so that line was also added as a picture. Check the question’s text against it.',
    ];
  }

  for (const draft of drafts) {
    const lost = [
      ...new Set(draft.imageIds.flatMap((id) => lostLabels.get(id) ?? [])),
    ];
    if (lost.length === 0) continue;
    draft.pictureNotes = [
      ...(draft.pictureNotes ?? []),
      `The lettering printed with this question’s picture (${lost.join(', ')}) isn’t part of the picture in a Word file or Google Doc. Add it to the picture, or import the test as a PDF.`,
    ];
  }

  // Every item in a set answers from its whole term list, wherever that was printed.
  for (const draft of drafts) {
    const group = draft.matching;
    if (!group) continue;
    if (group.terms.length === 0) {
      draft.matching = undefined;
      continue;
    }
    const line = draft.rawLines[0] ?? { text: '' };
    draft.options = [...group.terms]
      .sort((a, b) => a.letter.localeCompare(b.letter))
      .map((t) => ({ ...t, marked: false, line, wraps: [] }));
  }

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
      texts.push({ id, text: passage, label: nextPassageLabel(texts) });
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
  const refKey = (r: { section: number; item: number; part?: string }) =>
    `${r.section}:${r.item}${r.part ?? ''}`;
  const sorting = new Set(
    drafts
      .filter((d) => SORTING.test(tidy(d.textParts.join(' '))))
      .map((d) =>
        refKey({ section: d.section.ordinal, item: d.item, part: d.part })
      )
  );
  // ExamView's answers printed under each question go in like a key, once the types are set.
  const inlineItems: KeyItem[] = examView
    ? drafts.flatMap((d) =>
        d.inlineAnswer || d.inlineFields
          ? [
              {
                item: d.item,
                ...(d.part ? { part: d.part } : {}),
                answer: d.inlineAnswer ?? '',
                ...keyItemFields((d.inlineFields ?? []).join(' ')),
              },
            ]
          : []
      )
    : [];
  const typed = (examView ? applyExamViewTypes(finished) : finished).map(
    asTrueFalse
  );
  const inlineKeyed = mergeAnswerKey(
    { title: '', questions: typed, images: [], warnings: [] },
    inlineItems,
    'document',
    options
  );
  const merged = mergeAnswerKey(inlineKeyed, keyItems, 'document', options);
  const questions = applyExamViewAfterKey(merged.questions).map((q) =>
    noteMissingChoices(q, Boolean(q.ref && sorting.has(refKey(q.ref))))
  );
  const used = new Set(questions.map((q) => q.sharedTextId).filter(Boolean));
  // One note per guessed passage, on the first question it was attached to.
  const noted = questions.map((q) => {
    const text = texts.find((t) => t.id === q.sharedTextId);
    if (!text || !guessedTexts.has(text.id)) return q;
    const linked = questions.filter((o) => o.sharedTextId === text.id);
    if (linked[0] !== q) return q;
    // No question numbers: combining and unticking renumber the rows.
    const span =
      linked.length > 1
        ? `${linked.length} questions, starting with this one,`
        : 'this question';
    return {
      ...q,
      warnings: [
        ...q.warnings,
        `“${text.label}” was attached to ${span} as a passage. Check that it belongs there.`,
      ],
    };
  });
  return {
    questions: noted,
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
