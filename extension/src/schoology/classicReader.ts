// Reads a classic Schoology Test/Quiz from its question edit forms (SCHOOLOGY_QUIZ_IMPORT "Page probe").

import type { ExtractedQuestion } from '@/utils/quizDocumentImport/types';
import { joinBlanks } from '@/utils/quizFibBlanks';
import { multiAnswerKey } from '@/utils/quizDocumentImport/types';
import {
  asOptions,
  finishRead,
  htmlContent,
  matchingKey,
  orderingKey,
  placeholderQuestion,
  SchoologyReadError,
  type SchoologyQuizSettings,
  type SchoologyRead,
} from './readResult';

/** Form fields as the browser would submit them: name, value. */
export type FormEntries = [string, string][];

export interface ClassicQuestionInput {
  /** The list row's `component-*` class without the prefix, e.g. `multiple_choice`. */
  type: string;
  entries: FormEntries;
}

export interface ClassicQuizInput {
  title: string;
  questions: ClassicQuestionInput[];
  /** The settings form, when it could be read. */
  settings?: FormEntries;
  /** Resolves relative picture links, e.g. `https://orono.schoology.com`. */
  origin?: string;
}

export interface ClassicListRow {
  type: string;
  questionId: string;
}

/** The question rows of `/assignment/{id}/assessment_questions`, in quiz order. */
export function classicQuestionList(html: string): ClassicListRow[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows: ClassicListRow[] = [];
  for (const row of Array.from(
    doc.querySelectorAll('.component-summary-wrapper')
  )) {
    const type = Array.from(row.classList)
      .find(
        (c) => c.startsWith('component-') && c !== 'component-summary-wrapper'
      )
      ?.slice('component-'.length);
    const href =
      row.querySelector('a[href*="edit_question/"]')?.getAttribute('href') ??
      '';
    const questionId = /edit_question\/(\d+)/.exec(href)?.[1];
    if (type && questionId) rows.push({ type, questionId });
  }
  return rows;
}

/** The largest form on a page, as the fields a submit would send; nothing is submitted. */
export function classicFormEntries(html: string): FormEntries {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const form = Array.from(doc.forms).sort(
    (a, b) => b.elements.length - a.elements.length
  )[0];
  if (!form) throw new SchoologyReadError('the question form is missing.');
  const entries: FormEntries = [];
  for (const el of Array.from(form.elements)) {
    const name = el.getAttribute('name');
    if (!name) continue;
    if (el instanceof HTMLSelectElement) {
      entries.push([name, el.value]);
    } else if (el instanceof HTMLTextAreaElement) {
      entries.push([name, el.value]);
    } else if (el instanceof HTMLInputElement) {
      const type = el.type.toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        if (el.checked) entries.push([name, el.value]);
      } else if (type !== 'submit' && type !== 'button' && type !== 'file') {
        entries.push([name, el.value]);
      }
    }
  }
  return entries;
}

const field = (entries: FormEntries, name: string): string =>
  entries.find(([n]) => n === name)?.[1] ?? '';

/** Rows of an indexed field family, e.g. `rows[delta][0][question]`, by index in index order. */
function indexed(
  entries: FormEntries,
  pattern: RegExp
): Record<string, string>[] {
  const byIndex = new Map<number, Record<string, string>>();
  for (const [name, value] of entries) {
    const match = pattern.exec(name);
    if (!match) continue;
    const index = Number(match[1]);
    const row = byIndex.get(index) ?? {};
    row[match[2]] = value;
    byIndex.set(index, row);
  }
  return [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

const pointsOf = (entries: FormEntries): number | undefined => {
  const points = Number.parseFloat(field(entries, 'points'));
  return Number.isFinite(points) ? points : undefined;
};

/** A lone `_` is how Schoology writes a blank; SpartBoard writes `___`. */
const SCHOOLOGY_BLANK = /(?<![\w_])_(?![\w_])/g;

function trueFalse(
  number: number,
  entries: FormEntries,
  origin?: string
): ExtractedQuestion {
  const prompt = htmlContent(field(entries, 'title'), origin);
  const trueText = field(entries, 'true_text').trim() || 'True';
  const falseText = field(entries, 'false_text').trim() || 'False';
  const correct = field(entries, 'correct');
  const warnings: string[] = [];
  if (field(entries, 'require_correction')) {
    warnings.push(
      'Schoology asked students to correct a false statement; SpartBoard only asks True or False.'
    );
  }
  return {
    number,
    text: prompt.text,
    type: 'MC',
    options: asOptions([trueText, falseText]),
    correctAnswer:
      correct === 't' ? trueText : correct === 'f' ? falseText : '',
    imageIds: prompt.imageUrls,
    warnings,
  };
}

function multipleChoice(
  number: number,
  entries: FormEntries,
  origin?: string
): ExtractedQuestion {
  const prompt = htmlContent(field(entries, 'title'), origin);
  const warnings: string[] = [];
  const imageIds = [...prompt.imageUrls];
  const choices = indexed(
    entries,
    /^multiple_choice\[choice\]\[(\d+)\]\[(\w+)\]$/
  ).filter((c) => (c.text ?? '').trim());
  const texts = choices.map((choice, index) => {
    const content = htmlContent(choice.text ?? '', origin);
    if (content.imageUrls.length > 0) {
      imageIds.push(...content.imageUrls);
      warnings.push(
        `Choice ${String.fromCharCode(65 + index)} had a picture, which was added to the question because choices are text only.`
      );
    }
    return content.text || `Picture ${String.fromCharCode(65 + index)}`;
  });
  const right = texts.filter((_, i) => choices[i].is_answer === '1');
  const multi = right.length > 1;
  return {
    number,
    text: prompt.text,
    type: multi ? 'MA' : 'MC',
    options: asOptions(texts),
    correctAnswer: multi ? multiAnswerKey(right) : (right[0] ?? ''),
    imageIds,
    ...(multi && field(entries, 'partial_credit') === '1'
      ? { allowPartialCredit: true }
      : {}),
    warnings,
  };
}

function ordering(
  number: number,
  entries: FormEntries,
  origin?: string
): ExtractedQuestion {
  const prompt = htmlContent(field(entries, 'title'), origin);
  const items = indexed(entries, /^ordering\[choices\]\[(\d+)\]\[(\w+)\]$/)
    .map((row, index) => ({
      text: htmlContent(row.text ?? '', origin).text,
      weight: Number.parseFloat(row.weight ?? '') || index,
    }))
    .filter((item) => item.text)
    .sort((a, b) => a.weight - b.weight)
    .map((item) => item.text);
  return {
    number,
    text: prompt.text,
    type: 'Ordering',
    options: asOptions(items),
    correctAnswer: orderingKey(items),
    imageIds: prompt.imageUrls,
    ...(field(entries, 'partial_credit') === '1'
      ? { allowPartialCredit: true }
      : {}),
    warnings: [],
  };
}

function matching(
  number: number,
  entries: FormEntries,
  origin?: string
): ExtractedQuestion {
  const prompt = htmlContent(field(entries, 'title'), origin);
  const pairs = indexed(entries, /^rows\[delta\]\[(\d+)\]\[(\w+)\]$/).map(
    (row) =>
      [
        htmlContent(row.question ?? '', origin).text,
        htmlContent(row.answer ?? '', origin).text,
      ] as const
  );
  const key = matchingKey(pairs);
  const distractors = indexed(
    entries,
    /^fillword_rows\[delta\]\[(\d+)\]\[(\w+)\]$/
  )
    .map((row) => htmlContent(row.question ?? '', origin).text)
    .filter(Boolean);
  return {
    number,
    text: prompt.text,
    type: 'Matching',
    options: [],
    correctAnswer: key.answer,
    imageIds: prompt.imageUrls,
    ...(distractors.length > 0 ? { matchingDistractors: distractors } : {}),
    warnings: key.warnings,
  };
}

function fillInBlank(
  number: number,
  entries: FormEntries,
  origin?: string
): ExtractedQuestion {
  const prompt = htmlContent(field(entries, 'title'), origin);
  const warnings: string[] = [];
  const blanks = indexed(
    entries,
    /^blanks\[delta\]\[(\d+)\]\[answer\]\[(\d+)\]$/
  );
  const accepted = blanks.map((row) =>
    Object.keys(row)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => row[k].trim())
      .filter(Boolean)
  );
  const text = prompt.text.replace(SCHOOLOGY_BLANK, '___');
  const printed = (text.match(/_{3}/g) ?? []).length;
  if (printed !== accepted.length) {
    warnings.push(
      `The question shows ${printed} blank${printed === 1 ? '' : 's'} but Schoology has answers for ${accepted.length}. Check the blanks in the editor.`
    );
  }
  if (field(entries, 'case_sensitive') === '1') {
    warnings.push(
      'Schoology checked capital letters on this question; SpartBoard does not.'
    );
  }
  if (field(entries, 'word_bank') === '1') {
    warnings.push('Schoology showed a word bank, which SpartBoard does not.');
  }
  return {
    number,
    text,
    type: 'FIB',
    options: [],
    correctAnswer: joinBlanks(accepted.map((a) => a[0] ?? '')),
    imageIds: prompt.imageUrls,
    ...(accepted.some((a) => a.length > 1)
      ? {
          blankAlternates: accepted.map((a) => ({ answers: a.slice(1) })),
        }
      : {}),
    warnings,
  };
}

function essay(
  number: number,
  entries: FormEntries,
  origin?: string
): ExtractedQuestion {
  const prompt = htmlContent(field(entries, 'title'), origin);
  const limit = Number.parseInt(field(entries, 'character_limit'), 10);
  return {
    number,
    text: prompt.text,
    type: 'free-response',
    options: [],
    correctAnswer: '',
    imageIds: prompt.imageUrls,
    warnings:
      limit > 0
        ? [
            `Schoology limited answers to ${limit} characters; SpartBoard limits words, so no limit was set.`,
          ]
        : [],
  };
}

const READERS: Record<
  string,
  (number: number, entries: FormEntries, origin?: string) => ExtractedQuestion
> = {
  true_false: trueFalse,
  multiple_choice: multipleChoice,
  ordering,
  matching,
  fitb: fillInBlank,
  essay,
};

function classicSettings(
  entries: FormEntries | undefined
): SchoologyQuizSettings {
  if (!entries) return {};
  const minutes = Number.parseInt(field(entries, 'time_limit'), 10);
  const attempts = Number.parseInt(field(entries, 'attempts'), 10);
  return {
    shuffleQuestions: field(entries, 'randomize_order') === '1',
    ...(field(entries, 'has_time_limit') === '1' && minutes > 0
      ? { timeLimitMinutes: minutes }
      : {}),
    ...(attempts > 0 ? { attempts } : {}),
  };
}

export function readClassicQuiz(input: ClassicQuizInput): SchoologyRead {
  if (input.questions.length === 0) {
    throw new SchoologyReadError('no questions were found.');
  }
  const unsupported: number[] = [];
  const questions = input.questions.map(({ type, entries }, index) => {
    const number = index + 1;
    const points = pointsOf(entries);
    const reader = READERS[type];
    if (!reader) {
      unsupported.push(number);
      return placeholderQuestion(
        number,
        htmlContent(field(entries, 'title'), input.origin),
        type,
        points
      );
    }
    const question = reader(number, entries, input.origin);
    if (points !== undefined) question.points = points;
    if (!question.text) question.warnings.push('No question text was found.');
    return question;
  });
  return finishRead(
    input.title.trim() || 'Schoology quiz',
    questions,
    unsupported,
    classicSettings(input.settings)
  );
}
