/**
 * Turns what the reader found into a real quiz
 * (docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D5, D12).
 *
 * Questions the reader couldn't find an answer for are carried across with
 * `needsKey`, which is what lets the quiz save and open in the editor while
 * Assign stays shut until a teacher fills them in.
 */

import {
  findStandardRuns,
  normalizeStandardCode,
  removeRuns,
} from '@/utils/standardsInText';
import type {
  QuizData,
  QuizOrderEntry,
  QuizQuestion,
  QuizSection,
  QuizStimulus,
} from '@/types';
import { sectionsForQuestions } from '@/utils/quizSections';
import { questionFromRows } from '@/utils/quizChoiceRows';
import { importSections } from './importSections';
import { mathMarker } from './mathMarkup';
import {
  multiAnswerPart,
  type ExtractedOption,
  type ExtractedQuestion,
  type ExtractedQuiz,
  type SuggestedTarget,
} from './types';

/** An ordering item the key never put in order can't be stored as Ordering, so it is listed. */
function unkeyedOrdering(q: ExtractedQuestion): QuizQuestion {
  const items = q.options.map((o) => `${o.letter}. ${o.text}`).join(' / ');
  return {
    id: crypto.randomUUID(),
    timeLimit: 0,
    text: `${q.text} ${items}`.trim(),
    type: 'free-response',
    correctAnswer: '',
    incorrectAnswers: [],
    ...(q.points !== undefined ? { points: q.points } : {}),
    ...(q.sourceLabel ? { sourceLabel: q.sourceLabel } : {}),
    ...(q.imageIds.length > 0 ? { stimulusIds: [...q.imageIds] } : {}),
  };
}

/** A reader's extra accepted answers, as one-blank `alternateAnswers` or per-blank `blankAlternates`. */
function fibAlternates(
  q: ExtractedQuestion
): Pick<QuizQuestion, 'alternateAnswers' | 'blankAlternates'> {
  const alternates = q.blankAlternates;
  if (q.type !== 'FIB' || !alternates?.some((a) => a.answers.length > 0))
    return {};
  if (alternates.length === 1)
    return { alternateAnswers: [...alternates[0].answers] };
  return {
    blankAlternates: alternates.map((a) => ({ answers: [...a.answers] })),
  };
}

export function toQuizQuestion(q: ExtractedQuestion): QuizQuestion {
  if (q.type === 'Ordering') {
    const order = q.correctAnswer.trim();
    if (!order) return unkeyedOrdering(q);
    return {
      id: crypto.randomUUID(),
      timeLimit: 0,
      text: q.text,
      type: 'Ordering',
      correctAnswer: order,
      incorrectAnswers: [],
      ...(q.points !== undefined ? { points: q.points } : {}),
      ...(q.sourceLabel ? { sourceLabel: q.sourceLabel } : {}),
      ...(q.imageIds.length > 0 ? { stimulusIds: [...q.imageIds] } : {}),
    };
  }
  const isMulti = q.type === 'MA';
  const optionTexts = q.options.map((o) =>
    isMulti ? multiAnswerPart(o.text) : o.text
  );
  const answer = q.correctAnswer.trim();
  const isWritten = q.type === 'free-response';
  const rightSet = new Set(isMulti ? answer.split('|') : [answer]);

  // The answer is one of the options, so the rest are the distractors. With
  // no answer yet, every option stays a distractor and the teacher picks one
  // in the editor — nothing is dropped either way.
  const incorrectAnswers = answer
    ? optionTexts.filter((text) => !rightSet.has(text))
    : optionTexts;

  // The editor lists the choices in the order the test printed them.
  const printedOrder =
    q.type === 'MC' && answer
      ? questionFromRows(
          optionTexts.map((text, i) => ({
            text,
            correct: optionTexts.indexOf(answer) === i,
          })),
          false
        ).optionOrder
      : undefined;

  return {
    id: crypto.randomUUID(),
    timeLimit: 0,
    text: q.text,
    type: q.type,
    correctAnswer: isWritten ? '' : answer,
    ...(printedOrder ? { optionOrder: printedOrder } : {}),
    incorrectAnswers: isWritten ? [] : incorrectAnswers,
    ...(!isWritten && !answer ? { needsKey: true } : {}),
    ...(q.points !== undefined ? { points: q.points } : {}),
    ...(q.sourceLabel ? { sourceLabel: q.sourceLabel } : {}),
    ...(q.matchingDistractors?.length
      ? { matchingDistractors: [...q.matchingDistractors] }
      : {}),
    ...(q.allowPartialCredit ? { allowPartialCredit: true } : {}),
    ...(isWritten ? {} : choicePictures(q.options, optionTexts)),
    ...fibAlternates(q),
    // The reader's own image ids. `attachDocumentImages` swaps them for real
    // stimulus ids at save; nothing persists a quiz before that runs.
    ...(q.imageIds.length > 0 ? { stimulusIds: [...q.imageIds] } : {}),
  };
}

/** Choices printed only as pictures; each `url` holds the reader's image id until `attachDocumentImages` uploads it. */
function choicePictures(
  options: readonly ExtractedOption[],
  texts: readonly string[]
): Pick<QuizQuestion, 'answerImages' | 'imageOnlyAnswers'> {
  const pictured = options.flatMap((o, i) =>
    o.imageId ? [{ text: texts[i], url: o.imageId }] : []
  );
  if (pictured.length === 0) return {};
  return {
    answerImages: pictured,
    imageOnlyAnswers: pictured.map(({ text }) => ({ text })),
  };
}

/** A choice question with the math in its choices and key marked the same way. */
function markChoices(
  q: ExtractedQuestion,
  mark: (text: string) => string
): ExtractedQuestion {
  if (q.type !== 'MC' && q.type !== 'MA') return q;
  const part = (text: string) =>
    q.type === 'MA' ? multiAnswerPart(text) : text;
  const marked = new Map<string, string>();
  for (const o of q.options) {
    const text = part(o.text);
    const drawn = mark(text);
    // `|` separates choose-all answers, so a choice holding one stays text.
    marked.set(text, drawn.includes('|') ? text : drawn);
  }
  if (new Set(marked.values()).size !== marked.size) return q;
  const swap = (text: string) => marked.get(text) ?? text;
  const answer = q.correctAnswer.trim();
  return {
    ...q,
    options: q.options.map((o) => ({ ...o, text: swap(part(o.text)) })),
    correctAnswer:
      q.type === 'MA' ? answer.split('|').map(swap).join('|') : swap(answer),
  };
}

/** What the reader was unsure of on one question, shown on its review row. */
export const readerNotes = (q: ExtractedQuestion): string[] => [
  ...q.warnings,
  ...(q.type === 'Ordering' && !q.correctAnswer.trim()
    ? [
        'This looks like an ordering question, but no order was given, so it came in as a written question with the items listed.',
      ]
    : []),
];

/** What the review table needs beyond the quiz itself, keyed by the quiz it came with. */
export interface ReviewExtras {
  /** Every question read, including rows that start unticked. */
  allQuestions: QuizQuestion[];
  /** Question ids that start unticked (R9), with the reason. */
  untick: ReadonlyMap<string, string>;
  /** What the reader was unsure of, by question id. */
  notes: ReadonlyMap<string, readonly string[]>;
  /** Learning-target lines by question id (R20). */
  suggestedTargets: ReadonlyMap<string, SuggestedTarget>;
  /** Standard codes a test bank key listed, by question id (QUIZ_EXAMVIEW_IMPORT E10). */
  standardCodes: ReadonlyMap<string, readonly string[]>;
  /** How the answer key matched, for the review banner (R19). */
  keySummary?: ExtractedQuiz['keySummary'];
  /** Every question's place among the imported sections, unticked rows included (E16). */
  order?: QuizOrderEntry[];
  sections?: QuizSection[];
}

// By id too: review edits hand back a copy of the quiz with the same id.
const reviewExtras = new Map<string, ReviewExtras>();

/** The review extras for a quiz `extractedToQuizData` built, or an edited copy of it. */
export const reviewExtrasFor = (data: QuizData): ReviewExtras | undefined =>
  reviewExtras.get(data.id);

/**
 * Build a quiz from a read document. Rows the reader suggests unticking are
 * left out of the quiz and kept in `reviewExtrasFor`, so review shows them unticked.
 */
export function extractedToQuizData(
  extracted: ExtractedQuiz,
  /** `sections` turns printed headings into quiz sections (E16). */
  options: {
    title?: string;
    now?: number;
    sections?: boolean;
    /** Known catalog codes; printed codes beside a stem move to `standardCodes` only when every one is known. */
    standardsFromText?: ReadonlySet<string>;
    /** Fractions, powers and roots in a question and its choices become equations the quiz draws (`quiz-import-equations`). */
    equations?: boolean;
  } = {}
): QuizData {
  const now = options.now ?? Date.now();
  const stimulusIdByText = new Map<string, string>();
  const stimuli: QuizStimulus[] = (extracted.texts ?? []).map((t) => {
    const id = crypto.randomUUID();
    stimulusIdByText.set(t.id, id);
    return {
      id,
      type: 'text',
      url: '',
      text: t.text,
      label: t.label,
      readAloudSource: 'text',
    };
  });

  const found = options.sections ? importSections(extracted.questions) : [];
  const sections: QuizSection[] = found.map((s) => ({
    id: crypto.randomUUID(),
    title: s.title,
    ...(s.directions ? { directions: s.directions } : {}),
    ...(s.chooseCount ? { chooseCount: s.chooseCount } : {}),
  }));
  /** Question index → the section whose first question it is. */
  const opens = new Map(
    found.map((s, i) => [s.questionIndexes[0], sections[i]])
  );

  const untick = new Map<string, string>();
  const notes = new Map<string, readonly string[]>();
  const suggestedTargets = new Map<string, SuggestedTarget>();
  const standardCodes = new Map<string, readonly string[]>();
  const markMath = options.equations
    ? mathMarker(
        // One text per question, so one question's date choices can't make a math test.
        extracted.questions.map((q) =>
          [q.text, ...q.options.map((o) => o.text)].join('\n')
        )
      )
    : null;
  const allQuestions = extracted.questions.map((read, index) => {
    // The section shows its directions, so the first stem gives them back.
    const leadIn = opens.get(index)?.directions ? read.directionsLeadIn : '';
    const trimmed =
      leadIn && read.text.startsWith(leadIn)
        ? { ...read, text: read.text.slice(leadIn.length).trim() }
        : read;
    const known = options.standardsFromText;
    const runs = known
      ? findStandardRuns(trimmed.text).filter((r) =>
          r.codes.every((c) => known.has(normalizeStandardCode(c)))
        )
      : [];
    const q =
      runs.length > 0
        ? {
            ...trimmed,
            text: removeRuns(trimmed.text, runs),
            standardCodes: [
              ...new Set([
                ...(trimmed.standardCodes ?? []),
                ...runs.flatMap((r) => r.codes),
              ]),
            ],
          }
        : trimmed;
    const plain = toQuizQuestion(markMath ? markChoices(q, markMath) : q);
    const built = markMath ? { ...plain, text: markMath(plain.text) } : plain;
    const shared = q.sharedTextId
      ? stimulusIdByText.get(q.sharedTextId)
      : undefined;
    const question = shared
      ? { ...built, stimulusIds: [shared, ...(built.stimulusIds ?? [])] }
      : built;
    if (q.suggestUntick) untick.set(question.id, q.suggestUntick);
    const unsure = readerNotes(read);
    if (unsure.length > 0) notes.set(question.id, unsure);
    if (q.suggestedTarget) suggestedTargets.set(question.id, q.suggestedTarget);
    if (q.standardCodes?.length)
      standardCodes.set(question.id, q.standardCodes);
    return question;
  });

  const order: QuizOrderEntry[] = allQuestions.flatMap((q, index) => {
    const section = opens.get(index);
    return [
      ...(section ? [{ kind: 'section' as const, id: section.id }] : []),
      { kind: 'question' as const, id: q.id },
    ];
  });
  const questions = allQuestions.filter((q) => !untick.has(q.id));
  const placed =
    sections.length > 0
      ? sectionsForQuestions({ questions, order, sections })
      : {};
  const data: QuizData = {
    id: crypto.randomUUID(),
    title: (options.title ?? extracted.title).trim() || 'Imported Quiz',
    questions,
    ...(placed.sections
      ? { order: placed.order, sections: placed.sections }
      : {}),
    ...(stimuli.length > 0 ? { stimuli } : {}),
    createdAt: now,
    updatedAt: now,
  };
  // A few recent reads are kept, so the map never grows with a long session.
  if (reviewExtras.size >= 8) {
    reviewExtras.delete(reviewExtras.keys().next().value as string);
  }
  reviewExtras.set(data.id, {
    allQuestions,
    ...(sections.length > 0 ? { order, sections } : {}),
    untick,
    notes,
    suggestedTargets,
    standardCodes,
    ...(extracted.keySummary ? { keySummary: extracted.keySummary } : {}),
  });
  return data;
}
