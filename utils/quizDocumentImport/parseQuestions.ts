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
import { mergeAnswerKey } from './mergeKey';
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

const ORDERING =
  /\b(?:number|put|place|arrange|list|write)\b[^.?]*\bin\s+(?:the\s+)?(?:correct\s+|right\s+|chronological\s+|time\s+)?order\b|\bsequence\b|\bchronological\s+order\b|\border\s+(?:in\s+which|that)\s+(?:they|the\s+events)\b/i;

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

/**
 * A column gap that opens an option or a question starts a line of its own
 * (R5), so a table row `A. Rome | B. Paris` reads as two options. A marker
 * inside one segment never splits.
 */
export function splitAtColumnMarkers(lines: readonly DocLine[]): DocLine[] {
  const out: DocLine[] = [];
  for (const line of lines) {
    const filled = (line.segments ?? []).filter((s) => s.text.trim());
    if (filled.length < 2) {
      out.push(line);
      continue;
    }
    const groups: DocSegment[][] = [];
    for (const segment of lineSegments(line)) {
      const text = segment.text.trim();
      if (!text) continue;
      const opens = isOptionText(text) || matchQuestionOpening(text) !== null;
      const last = groups[groups.length - 1];
      if (last && !opens) last.push(segment);
      else groups.push([segment]);
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
  if (ORDERING.test(stem) && options.length >= 2) return 'Ordering';
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
  multi: boolean
): ExtractedQuestion {
  const warnings: string[] = [];
  const stem = tidy(draft.textParts.join(' '));
  let text = draft.instruction ? tidy(`${draft.instruction} ${stem}`) : stem;
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
  if (question.type !== 'free-response' || sorting) return question;
  return {
    ...question,
    warnings: [
      'No answer choices were found, so this came in as a written-response question.',
      ...question.warnings,
    ],
  };
}

/** Does this line name a new section? The caller has ruled out Part A/B. */
function sectionHeading(
  text: string
): { name: string; printed?: number; ungraded: boolean } | null {
  const trimmed = tidy(text);
  if (!trimmed || trimmed.endsWith('?')) return null;
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
        ...(waiting.range ? { range: waiting.range } : {}),
        section: waiting.section,
        instruction,
      };
    }
  };

  const openQuestion = (item: number, text: string, line: DocLine): void => {
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
    if (cover && !covered && cover.range) covering = null;
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
    };
    lastOption = null;
    drafts.push(current);
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
    const heading = midSentence ? null : sectionHeading(text);
    if (heading) {
      startSection(heading);
      return;
    }

    const opening = matchQuestionOpening(text);
    if (opening) {
      const restart =
        opening.number === 1 &&
        section.questionCount >= 2 &&
        section.lastItem > 1;
      if (restart) startSection();
      if (
        opening.number > section.lastItem ||
        section.questionCount === 0 ||
        restart
      ) {
        openQuestion(opening.number, opening.text, line);
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

  const keyedItems = new Set(keyItems.map((k) => k.item));
  const finished = drafts.map((d, i) =>
    finish(d, i + 1, labelOf(d), keyedItems.has(d.item), multi)
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
