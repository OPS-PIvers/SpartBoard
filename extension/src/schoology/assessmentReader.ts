// Reads a Schoology Assessment from the `/iapi2/test-quiz` JSON its editor loads; questions are Learnosity definitions.

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
  type HtmlContent,
  type SchoologyQuizSettings,
  type SchoologyRead,
} from './readResult';

export interface AssessmentInput {
  /** `GET /iapi2/test-quiz/{commonAssessmentId}`. */
  assessment: unknown;
  /** `GET /iapi2/test-quiz/{activeVersionId}/components`. */
  components: unknown;
  origin?: string;
}

/** The parts of a Learnosity question definition the readers use. */
interface LearnosityQuestion {
  type?: string;
  stimulus?: string;
  template?: string;
  options?: { label?: string; value?: string }[] | null;
  multiple_responses?: boolean;
  stimulus_list?: string[];
  possible_responses?: unknown[];
  list?: string[];
  validation?: {
    valid_response?: { value?: unknown };
    alt_responses?: { value?: unknown }[];
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const at = (v: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((o, k) => (isRecord(o) ? o[k] : undefined), v);

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (x == null ? '' : String(x))) : [];

/** A Learnosity `{{response}}` is a blank. */
const RESPONSE = /\{\{\s*response\s*\}\}/g;

function blanksOf(
  def: LearnosityQuestion,
  origin?: string
): { content: HtmlContent; count: number } {
  const stem = [def.stimulus ?? '', def.template ?? ''].filter(Boolean);
  const content = htmlContent(stem.join('\n'), origin);
  const text = content.text.replace(RESPONSE, '___');
  return {
    content: { ...content, text },
    count: (def.template ?? '').match(RESPONSE)?.length ?? 0,
  };
}

/** Per blank: the key's answer, then each alternate response's answer. */
function acceptedPerBlank(def: LearnosityQuestion, count: number): string[][] {
  const main = strings(def.validation?.valid_response?.value);
  const alts = (def.validation?.alt_responses ?? []).map((r) =>
    strings(r.value)
  );
  return Array.from({ length: Math.max(count, main.length) }, (_, i) => [
    ...new Set(
      [main[i] ?? '', ...alts.map((a) => a[i] ?? '')]
        .map((a) => a.trim())
        .filter(Boolean)
    ),
  ]);
}

function fibFrom(
  number: number,
  def: LearnosityQuestion,
  warnings: string[],
  origin?: string
): ExtractedQuestion {
  const { content, count } = blanksOf(def, origin);
  const accepted = acceptedPerBlank(def, count);
  return {
    number,
    text: content.text,
    type: 'FIB',
    options: [],
    correctAnswer: joinBlanks(accepted.map((a) => a[0] ?? '')),
    imageIds: content.imageUrls,
    ...(accepted.some((a) => a.length > 1)
      ? { blankAlternates: accepted.map((a) => a.slice(1)) }
      : {}),
    warnings,
  };
}

function mcq(
  number: number,
  def: LearnosityQuestion,
  origin?: string
): ExtractedQuestion {
  const prompt = htmlContent(def.stimulus ?? '', origin);
  const warnings: string[] = [];
  const imageIds = [...prompt.imageUrls];
  const options = (def.options ?? []).map((option, index) => {
    const content = htmlContent(option.label ?? '', origin);
    if (content.imageUrls.length > 0) {
      imageIds.push(...content.imageUrls);
      warnings.push(
        `Choice ${String.fromCharCode(65 + index)} had a picture, which was added to the question because choices are text only.`
      );
    }
    return {
      value: option.value ?? String(index),
      text: content.text || `Picture ${String.fromCharCode(65 + index)}`,
    };
  });
  const keyed = new Set(strings(def.validation?.valid_response?.value));
  const right = options.filter((o) => keyed.has(o.value)).map((o) => o.text);
  const multi = right.length > 1 || (def.multiple_responses && right.length > 0);
  return {
    number,
    text: prompt.text,
    type: multi ? 'MA' : 'MC',
    options: asOptions(options.map((o) => o.text)),
    correctAnswer: multi ? multiAnswerKey(right) : (right[0] ?? ''),
    imageIds,
    warnings,
  };
}

function association(
  number: number,
  def: LearnosityQuestion,
  origin?: string
): ExtractedQuestion {
  const prompt = htmlContent(def.stimulus ?? '', origin);
  const terms = strings(def.stimulus_list).map((t) => htmlContent(t, origin).text);
  const matches = strings(def.validation?.valid_response?.value).map(
    (m) => htmlContent(m, origin).text
  );
  const key = matchingKey(terms.map((t, i) => [t, matches[i] ?? ''] as const));
  const used = new Set(matches);
  const distractors = strings(def.possible_responses)
    .map((r) => htmlContent(r, origin).text)
    .filter((r) => r && !used.has(r));
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

function orderlist(
  number: number,
  def: LearnosityQuestion,
  origin?: string
): ExtractedQuestion {
  const prompt = htmlContent(def.stimulus ?? '', origin);
  const list = strings(def.list).map((item) => htmlContent(item, origin).text);
  const order = (def.validation?.valid_response?.value as unknown[]) ?? [];
  const inOrder = Array.isArray(order)
    ? order.map((i) => list[Number(i)]).filter((x): x is string => !!x)
    : [];
  const keyed = inOrder.length === list.length;
  return {
    number,
    text: prompt.text,
    type: 'Ordering',
    options: asOptions(list),
    correctAnswer: keyed ? orderingKey(inOrder) : '',
    imageIds: prompt.imageUrls,
    warnings: [],
  };
}

function written(
  number: number,
  def: LearnosityQuestion,
  origin?: string
): ExtractedQuestion {
  const prompt = htmlContent(def.stimulus ?? '', origin);
  return {
    number,
    text: prompt.text,
    type: 'free-response',
    options: [],
    correctAnswer: '',
    imageIds: prompt.imageUrls,
    warnings: [],
  };
}

/** A dropdown blank: one blank becomes multiple choice, several become typed blanks. */
function clozedropdown(
  number: number,
  def: LearnosityQuestion,
  origin?: string
): ExtractedQuestion {
  const { content, count } = blanksOf(def, origin);
  const lists = Array.isArray(def.possible_responses)
    ? def.possible_responses.map(strings)
    : [];
  if (count === 1 && lists[0]?.length) {
    const key = strings(def.validation?.valid_response?.value)[0] ?? '';
    return {
      number,
      text: content.text,
      type: 'MC',
      options: asOptions(lists[0]),
      correctAnswer: lists[0].includes(key) ? key : '',
      imageIds: content.imageUrls,
      warnings: [],
    };
  }
  return fibFrom(
    number,
    def,
    ['Schoology showed a dropdown for each blank; students type the answers here.'],
    origin
  );
}

type Reader = (
  number: number,
  def: LearnosityQuestion,
  origin?: string
) => ExtractedQuestion;

const READERS: Record<string, Reader> = {
  mcq,
  association,
  orderlist,
  clozetext: (n, d, o) => fibFrom(n, d, [], o),
  clozeassociation: (n, d, o) =>
    fibFrom(
      n,
      d,
      ['Schoology had students drag words into the blanks; students type them here.'],
      o
    ),
  clozedropdown,
  shorttext: (n, d, o) => fibFrom(n, { ...d, template: '' }, [], o),
  longtextV2: written,
  longtext: written,
  plaintext: written,
};

/** Learnosity keeps one short-answer key outside any blank. */
function shortTextKey(def: LearnosityQuestion): LearnosityQuestion {
  return def.type === 'shorttext'
    ? {
        ...def,
        validation: {
          valid_response: { value: [def.validation?.valid_response?.value] },
          alt_responses: (def.validation?.alt_responses ?? []).map((r) => ({
            value: [r.value],
          })),
        },
      }
    : def;
}

function assessmentSettings(raw: unknown): SchoologyQuizSettings {
  const minutes = Number(at(raw, 'time_limit'));
  const attempts = Number(at(raw, 'attempts'));
  return {
    shuffleQuestions: !!at(raw, 'randomize_order'),
    ...(minutes > 0 ? { timeLimitMinutes: minutes } : {}),
    ...(attempts > 0 ? { attempts } : {}),
  };
}

function parseDefinition(raw: unknown): LearnosityQuestion | null {
  if (typeof raw !== 'string') return isRecord(raw) ? raw : null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readAssessment(input: AssessmentInput): SchoologyRead {
  const quiz = at(input.assessment, 'data', 'commonAssessment');
  const components = at(input.components, 'data', 'components');
  if (!isRecord(quiz) || !Array.isArray(components)) {
    throw new SchoologyReadError('Schoology sent the assessment in a shape this reader does not know.');
  }
  const warnings: string[] = [];
  const unsupported: number[] = [];
  const questions: ExtractedQuestion[] = [];
  for (const component of components) {
    const version = at(component, 'metadata', 'question_domain', 'current_version');
    if (!isRecord(version)) {
      warnings.push('One item on the assessment was not a question and was left out.');
      continue;
    }
    const number = questions.length + 1;
    const pointsRaw = Number(at(component, 'metadata', 'points'));
    const points = Number.isFinite(pointsRaw) ? pointsRaw : undefined;
    const def = parseDefinition(version.definition);
    const reader = def?.type ? READERS[def.type] : undefined;
    if (!def || !reader) {
      unsupported.push(number);
      const prompt =
        def?.stimulus ?? (typeof version.stimulus === 'string' ? version.stimulus : '');
      questions.push(
        placeholderQuestion(number, htmlContent(prompt, input.origin), def?.type ?? 'unknown', points)
      );
      continue;
    }
    const question = reader(number, shortTextKey(def), input.origin);
    if (points !== undefined) question.points = points;
    if (!question.text) question.warnings.push('No question text was found.');
    questions.push(question);
  }
  if (questions.length === 0) {
    throw new SchoologyReadError('no questions were found.');
  }
  const title = typeof quiz.title === 'string' ? quiz.title.trim() : '';
  return finishRead(
    title || 'Schoology assessment',
    questions,
    unsupported,
    assessmentSettings(quiz.common_assessment_settings_domain),
    warnings
  );
}
