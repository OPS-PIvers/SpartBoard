/**
 * The ExamView profile (docs/plans/QUIZ_EXAMVIEW_IMPORT.md E4–E10): how a
 * test ExamView printed or exported is recognised, and what its section
 * headings do to the items under them. Both readers run the same steps (E17).
 */

import { TEST_BANK_SECTION } from './answerKey';
import type {
  DocLine,
  ExamViewKind,
  ExtractedOption,
  ExtractedQuestion,
} from './types';

const tidy = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** `____ 1.`, the answer blank ExamView prints before each number. */
const ANSWER_BLANK = /^\s*_{2,}\s*\d{1,3}\s*[.)]/;

const ANSWER_SECTION = /^\s*answer\s+section\s*$/i;

const ANS_FIELD = /\bANS\s*:/;
const PTS_FIELD = /\bPTS\s*:/;

/** ExamView's stock multiple-choice directions. */
const DIRECTIONS =
  /identify\s+the\s+letter\s+of\s+the\s+choice\s+that\s+best\s+completes\s+the\s+statement\s+or\s+answers\s+the\s+question/i;

/** An ExamView type heading, which may carry points or directions after it. */
export const EXAMVIEW_TYPE_HEADING =
  /^\s*(?:multiple\s+choice|multiple\s+response|modified\s+true\s*\/\s*false|true\s*\/\s*false|completion|matching|short\s+answers?|essays?|problems?|other|numeric\s+response)\s*(?:[-–—:(].{0,100})?$/i;

/** Items under these headings are written, so a key's text is a sample answer (E8). */
export const WRITTEN_SECTION =
  /\b(?:short\s+answers?|problems?|essays?|other)\b/i;

/** ExamView's matching directions, which open a new term list. */
export const MATCHING_DIRECTIONS = /^\s*match\s+each\b/i;

/** Two of ExamView's five fingerprints mark the document as ExamView (E4). */
export function isExamView(lines: readonly DocLine[]): boolean {
  let blanks = 0;
  let answerSection = false;
  let ans = false;
  let pts = false;
  let typeHeading = false;
  let directions = false;
  for (const line of lines) {
    const text = line.text;
    if (ANSWER_BLANK.test(text)) blanks += 1;
    if (ANSWER_SECTION.test(text)) answerSection = true;
    if (ANS_FIELD.test(text)) ans = true;
    if (PTS_FIELD.test(text)) pts = true;
    if (TEST_BANK_SECTION.test(text)) typeHeading = true;
    if (DIRECTIONS.test(text)) directions = true;
  }
  const signals = [
    blanks >= 2,
    answerSection,
    ans && pts,
    typeHeading,
    directions,
  ];
  return signals.filter(Boolean).length >= 2;
}

/** What a section heading says its items are; undefined when it names no ExamView type (E5). */
export function examViewKindOf(
  sectionName: string | undefined
): ExamViewKind | undefined {
  const name = sectionName ?? '';
  if (/\bmodified\s+true\s*\/\s*false\b/i.test(name)) return 'modifiedTf';
  if (/\btrue\s*\/\s*false\b/i.test(name)) return 'tf';
  if (/\bmatching\b/i.test(name)) return 'matching';
  if (/\bcompletion\b/i.test(name)) return 'completion';
  if (/\bnumeric\s+response\b/i.test(name)) return 'numeric';
  if (/\bmultiple\s+(?:choice|response)\b/i.test(name)) return 'mc';
  if (WRITTEN_SECTION.test(name)) return 'written';
  return undefined;
}

const TRUE_FALSE_OPTIONS: ExtractedOption[] = [
  { letter: 'A', text: 'True' },
  { letter: 'B', text: 'False' },
];

/** The type a section's kind gives a question read with no choices, or null to leave it (E5). */
function typed(
  q: ExtractedQuestion,
  kind: ExamViewKind
): ExtractedQuestion | null {
  switch (kind) {
    case 'tf':
    case 'modifiedTf':
      if (q.options.length > 0) return q;
      return q.type === 'free-response'
        ? {
            ...q,
            // Modified True/False prints a blank for the correction after the statement.
            text: q.text.replace(/\s*_{3,}\s*$/, ''),
            type: 'MC',
            options: TRUE_FALSE_OPTIONS,
          }
        : null;
    case 'completion':
    case 'numeric':
      return q.type === 'free-response' ? { ...q, type: 'FIB' } : q;
    case 'written':
      if (q.type === 'free-response') return q;
      // The AI reader can key a written item from the sample answer (E17).
      return q.type === 'FIB'
        ? {
            ...q,
            type: 'free-response',
            correctAnswer: '',
            warnings: q.correctAnswer.trim()
              ? [
                  ...q.warnings,
                  `Key’s sample answer: ${q.correctAnswer.trim()}`,
                ]
              : q.warnings,
          }
        : null;
    case 'matching':
      return q.options.length > 0 ? q : null;
    case 'mc':
      return q;
  }
}

/** Each question takes the type its section heading names, before any key is applied (E5, E8). */
export function applyExamViewTypes(
  questions: readonly ExtractedQuestion[]
): ExtractedQuestion[] {
  let group = '';
  let previous: ExtractedQuestion | undefined;
  return questions.map((q) => {
    const kind = q.examView ?? examViewKindOf(q.ref?.sectionName);
    const next = kind ? typed(q, kind) : null;
    if (!kind || !next) {
      previous = q;
      return q;
    }
    let kept: ExtractedQuestion = { ...next, examView: kind };
    if (kind === 'matching' && !q.matchingGroup) {
      // An AI read carries no group id, so consecutive items sharing a term list share one.
      const signature = q.options.map((o) => o.text).join('|');
      const same =
        previous?.examView === 'matching' &&
        previous.ref?.section === q.ref?.section &&
        previous.options.map((o) => o.text).join('|') === signature;
      if (!same) group = `m${q.number}`;
      kept = { ...kept, matchingGroup: group };
    }
    previous = kept;
    return kept;
  });
}

/** The printed label of a question, for `nA`/`nB` and ranges. */
const labelOf = (q: ExtractedQuestion): string =>
  q.sourceLabel ?? String(q.ref?.item ?? q.number);

const withNote = (q: ExtractedQuestion, text: string): ExtractedQuestion =>
  q.warnings.includes(text) ? q : { ...q, warnings: [...q.warnings, text] };

const PARTS_NOTE =
  'Part A (true or false) and Part B (the correction) are scored separately.';

/** A false Modified True/False item becomes the True/False part and the correction part (E7). */
function splitModifiedTrueFalse(q: ExtractedQuestion): ExtractedQuestion[] {
  if (q.examView !== 'modifiedTf' || !q.correction) return [q];
  const { correction, ...rest } = q;
  const label = labelOf(q);
  const half =
    q.points !== undefined ? Math.round((q.points / 2) * 100) / 100 : undefined;
  const ref = q.ref ?? { section: 1, item: q.number };
  const partA = withNote(
    {
      ...rest,
      ref: { ...ref, part: 'A' },
      sourceLabel: `${label}A`,
      ...(half !== undefined ? { points: half } : {}),
    },
    PARTS_NOTE
  );
  const partB: ExtractedQuestion = {
    number: q.number,
    ref: { ...ref, part: 'B' },
    sourceLabel: `${label}B`,
    text: `If false, write the word or phrase that makes it true: ${q.text}`,
    type: 'FIB',
    options: [],
    correctAnswer: correction,
    imageIds: [],
    warnings: [PARTS_NOTE],
    examView: 'completion',
    ...(half !== undefined ? { points: half } : {}),
    ...(q.suggestedTarget ? { suggestedTarget: q.suggestedTarget } : {}),
    ...(q.standardCodes ? { standardCodes: q.standardCodes } : {}),
  };
  return [partA, partB];
}

const REUSED_TERM_NOTE =
  'Two items in this matching set share an answer, which a matching question can’t hold, so each item came in as its own multiple-choice question.';

/** Keeps a pair's text from breaking the stored `left:right|…` form. */
const pairText = (text: string, left: boolean): string => {
  const safe = text.replace(/\|/g, '/').trim();
  return left ? safe.replace(/:/g, '꞉') : safe;
};

/** A keyed matching group becomes one Matching question (E6). */
function combineMatching(items: ExtractedQuestion[]): ExtractedQuestion[] {
  if (items.some((q) => !q.correctAnswer.trim())) return items;
  const answers = items.map((q) => q.correctAnswer.trim());
  if (new Set(answers).size !== answers.length) {
    return items.map((q) => withNote(q, REUSED_TERM_NOTE));
  }
  const first = items[0];
  const last = items[items.length - 1];
  const used = new Set(answers);
  const unused = first.options.map((o) => o.text).filter((t) => !used.has(t));
  const standardCodes = [
    ...new Set(items.flatMap((q) => q.standardCodes ?? [])),
  ];
  return [
    {
      number: first.number,
      ...(first.ref ? { ref: first.ref } : {}),
      sourceLabel:
        items.length > 1
          ? `${labelOf(first)}–${labelOf(last)}`
          : labelOf(first),
      text:
        first.matchingDirections ?? 'Match each item with the correct term.',
      type: 'Matching',
      options: [],
      correctAnswer: items
        .map(
          (q) => `${pairText(q.text, true)}:${pairText(q.correctAnswer, false)}`
        )
        .join('|'),
      ...(unused.length > 0 ? { matchingDistractors: unused } : {}),
      allowPartialCredit: true,
      points: items.length,
      imageIds: [...new Set(items.flatMap((q) => q.imageIds))],
      warnings: [...new Set(items.flatMap((q) => q.warnings))],
      examView: 'matching',
      ...(first.suggestedTarget
        ? { suggestedTarget: first.suggestedTarget }
        : {}),
      ...(standardCodes.length > 0 ? { standardCodes } : {}),
    },
  ];
}

/** `3 points each`, or `5 points` for a one-item section (E9). */
function headingPoints(
  name: string | undefined
): { points: number; each: boolean } | null {
  const m = /(\d{1,3}(?:\.\d+)?)\s*(?:pts?|points?)\b(\s*each)?/i.exec(
    name ?? ''
  );
  return m ? { points: Number(m[1]), each: Boolean(m[2]) } : null;
}

/** A heading's points beat ExamView's untouched `PTS: 1`; any other PTS wins with a note (E9). */
function applyHeadingPoints(
  questions: readonly ExtractedQuestion[]
): ExtractedQuestion[] {
  const bySection = new Map<number, number[]>();
  questions.forEach((q, i) => {
    if (!q.ref || q.ref.part || q.examView === 'matching') return;
    const list = bySection.get(q.ref.section) ?? [];
    list.push(i);
    bySection.set(q.ref.section, list);
  });
  const out = [...questions];
  for (const indexes of bySection.values()) {
    const heading = headingPoints(out[indexes[0]].ref?.sectionName);
    if (!heading || (!heading.each && indexes.length !== 1)) continue;
    const untouched = indexes.every(
      (i) => out[i].points === undefined || out[i].points === 1
    );
    for (const i of indexes) {
      const q = out[i];
      if (untouched) {
        out[i] = { ...q, points: heading.points };
      } else if (q.points !== undefined && q.points !== heading.points) {
        out[i] = withNote(
          q,
          `The heading gives ${heading.points} points, but the key gives ${q.points}, so the key’s points were used.`
        );
      }
    }
  }
  return out;
}

/** Splits, combines and scores ExamView items once their key is in; safe to run again (E6, E7, E9). */
export function applyExamViewAfterKey(
  questions: readonly ExtractedQuestion[]
): ExtractedQuestion[] {
  if (!questions.some((q) => q.examView)) return [...questions];
  const split = questions.flatMap(splitModifiedTrueFalse);
  const combined: ExtractedQuestion[] = [];
  let i = 0;
  while (i < split.length) {
    const q = split[i];
    if (
      q.examView !== 'matching' ||
      q.type === 'Matching' ||
      !q.matchingGroup
    ) {
      combined.push(q);
      i += 1;
      continue;
    }
    let end = i + 1;
    while (
      end < split.length &&
      split[end].matchingGroup === q.matchingGroup &&
      split[end].type !== 'Matching'
    ) {
      end += 1;
    }
    combined.push(...combineMatching(split.slice(i, end)));
    i = end;
  }
  return applyHeadingPoints(combined).map((q, n) => ({ ...q, number: n + 1 }));
}

/** `OBJ: 1.2 Describe the cycling of…` as a suggested target (E10). */
export function objectiveTarget(
  text: string
): { code?: string; label: string } | null {
  const trimmed = tidy(text);
  if (!trimmed) return null;
  const coded =
    /^((?:[A-Za-z]{1,6}[\s-]?)?\d+(?:\.\d+)*[A-Za-z]?)\s*[-–—:.|]?\s+(.+)$/.exec(
      trimmed
    );
  if (coded) return { code: coded[1], label: coded[2] };
  return /^(?:[A-Za-z]{1,6}[\s-]?)?\d+(?:\.\d+)*[A-Za-z]?$/.test(trimmed)
    ? { code: trimmed, label: trimmed }
    : { label: trimmed };
}
