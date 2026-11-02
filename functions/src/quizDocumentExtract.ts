// The AI reader for quiz document import
// (docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D1, D3, D18, D19, D20).
//
// The browser reader handles a tidy numbered test. This one reads the PDF
// itself rather than a transcription of it, so layout, bold and a key laid
// out in a table all count. It returns the same shape the browser reader
// does, so the review table never learns which one ran.
//
// It extracts and never invents: no question the document does not contain,
// no rewording, and no guessed answer. A question it cannot place comes back
// as a written response with a note, which the teacher fixes in the review
// table — an invented answer key would be marked wrong on a student's paper.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import type { Firestore } from 'firebase-admin/firestore';
import { Type, type Schema } from '@google/genai';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { isGlobalFeatureGranted } from './quizMediaArchive';
import { parseGeminiJson } from './parseGeminiJson';
import './functionsInit';
import { ANTHROPIC_API_KEY } from './secrets';
import { assertViewAsAllowed } from './viewAsGuard';
import { assertAiTeacherCaller } from './aiCallerGate';

export const QUIZ_DOCUMENT_IMPORT_FEATURE_ID = 'quiz-document-import';
export const QUIZ_IMPORT_VERSIONS_FEATURE_ID = 'quiz-import-versions';
export const GEMINI_FEATURE_ID = 'gemini-functions';
/** D19: one import is one use; the AI reader row has its own daily limit. */
export const QUIZ_QUOTA_FEATURE_ID = 'quiz-document-ai-reader';
export const DEFAULT_QUIZ_DAILY_LIMIT = 20;
/** D18, matching the browser reader's `utils/quizDocumentImport/limits.ts`. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 20;
export const EXTRACT_DEADLINE_MS = 110_000;
/** Gemini occasionally runs long on a dense test; more than this is a bug. */
export const MAX_QUESTIONS = 200;
export const MAX_OPTIONS = 6;
/** Per question. A stem needing more pictures than this misread the page. */
export const MAX_FIGURES = 4;

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Question types the quiz supports; anything else becomes a written response. */
const QUESTION_TYPES = [
  'MC',
  'FIB',
  'Matching',
  'Ordering',
  'free-response',
] as const;
/** Choose all that apply; only offered when the request asks for it. */
const MULTI_ANSWER_TYPE = 'MA';
export type QuestionType =
  (typeof QUESTION_TYPES)[number] | typeof MULTI_ANSWER_TYPE;

export interface ExtractDocumentRequest {
  fileName: string;
  mimeType: string;
  /** The document itself, base64. Held in memory and never stored (D20). */
  bytes: Buffer;
  /** The teacher has choose-all-that-apply, so the model may return MA. */
  multiAnswer?: boolean;
  /** Look for versions first (QUIZ_IMPORT_VERSIONS V7); only honoured with the flag. */
  versions?: boolean;
}

export interface AiExtractedOption {
  letter: string;
  text: string;
}

/**
 * Where a figure sits on the page, as fractions of it from the top-left
 * (D13). Fractions rather than points so the client can crop from a render at
 * whatever scale it chose.
 */
export interface AiFigureBox {
  /** 1-based. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AiExtractedQuestion {
  number: number;
  /** The section heading as printed, e.g. "Section 2"; absent when none. */
  section?: string;
  /** The question's number as printed, e.g. "3" or "5A"; absent when unknown. */
  label?: string;
  text: string;
  type: QuestionType;
  options: AiExtractedOption[];
  /** '' when the document gave no answer — never a guess (D5). */
  correctAnswer: string;
  /** Pictures the question cannot be answered without (D13). */
  figures: AiFigureBox[];
  warnings: string[];
}

export interface AiExtractedQuiz {
  title: string;
  questions: AiExtractedQuestion[];
  warnings: string[];
}

export interface ExtractDocumentDeps {
  db: Firestore;
  isImportGranted: (uid: string, email: string | null) => Promise<boolean>;
  isGeminiGranted: (uid: string, email: string | null) => Promise<boolean>;
  isAiReaderGranted: (uid: string, email: string | null) => Promise<boolean>;
  /** Throws `resource-exhausted` past the teacher's daily quiz allowance. */
  chargeQuiz: (uid: string, email: string | null) => Promise<void>;
  /** PDFs only; a Word file has no fixed page count. */
  pdfPageCount: (bytes: Buffer) => Promise<number>;
  extract: (
    bytes: Buffer,
    mimeType: string,
    multiAnswer: boolean
  ) => Promise<string>;
  isVersionsGranted: (uid: string, email: string | null) => Promise<boolean>;
  /** One model call over a document with its own prompt and schema (V11). */
  generate: (
    bytes: Buffer,
    mimeType: string,
    prompt: string,
    schema: Schema
  ) => Promise<string>;
  /** A new PDF holding just these 1-based pages, in order. */
  slicePdf: (bytes: Buffer, pages: number[]) => Promise<Buffer>;
  now: () => number;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/** What the file is, by declared type then by name; null when neither. */
export function documentMimeType(
  mimeType: string,
  fileName: string
): typeof PDF_MIME | typeof DOCX_MIME | null {
  const name = fileName.toLowerCase();
  if (mimeType === PDF_MIME || name.endsWith('.pdf')) return PDF_MIME;
  if (mimeType === DOCX_MIME || name.endsWith('.docx')) return DOCX_MIME;
  return null;
}

export function parseExtractDocumentRequest(
  raw: unknown
): ExtractDocumentRequest {
  const d = (raw ?? {}) as Record<string, unknown>;
  const fileName = typeof d.fileName === 'string' ? d.fileName.trim() : '';
  if (!fileName)
    throw new HttpsError('invalid-argument', 'fileName is required.');
  const declared = typeof d.mimeType === 'string' ? d.mimeType.trim() : '';
  const mimeType = documentMimeType(declared, fileName);
  if (!mimeType)
    throw new HttpsError(
      'invalid-argument',
      'Only a PDF or a Word file (.docx) can be read.'
    );
  const data = typeof d.data === 'string' ? d.data : '';
  if (!data) throw new HttpsError('invalid-argument', 'data is required.');
  // Base64 inflates by 4/3, so the encoded length bounds the decode before it
  // allocates — a caller cannot spend the function's memory to learn the cap.
  if (data.length > Math.ceil((MAX_DOCUMENT_BYTES * 4) / 3) + 4)
    throw new HttpsError(
      'invalid-argument',
      'That file is too large to read. Split it and import the parts.'
    );
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length === 0)
    throw new HttpsError('invalid-argument', 'That file is empty.');
  if (bytes.length > MAX_DOCUMENT_BYTES)
    throw new HttpsError(
      'invalid-argument',
      'That file is too large to read. Split it and import the parts.'
    );
  return {
    fileName,
    mimeType,
    bytes,
    multiAnswer: d.multiAnswer === true,
    ...(d.versions === true ? { versions: true } : {}),
  };
}

/**
 * The structured shape Gemini must answer in. Making every field required
 * is what stops a half-filled question arriving as `undefined` downstream;
 * `correctAnswer` is required but may be empty, which is how the model says
 * the document gave no key rather than inventing one.
 */
export function buildDocumentResponseSchema(multiAnswer = false): Schema {
  const types: string[] = multiAnswer
    ? [...QUESTION_TYPES, MULTI_ANSWER_TYPE]
    : [...QUESTION_TYPES];
  return {
    type: Type.OBJECT,
    required: ['title', 'questions'],
    properties: {
      title: { type: Type.STRING },
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: [
            'number',
            'text',
            'type',
            'options',
            'correctAnswer',
            'warnings',
          ],
          properties: {
            number: { type: Type.INTEGER },
            section: { type: Type.STRING },
            label: { type: Type.STRING },
            text: { type: Type.STRING },
            type: { type: Type.STRING, enum: types },
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['letter', 'text'],
                properties: {
                  letter: { type: Type.STRING },
                  text: { type: Type.STRING },
                },
              },
            },
            correctAnswer: { type: Type.STRING },
            figures: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['page', 'x', 'y', 'width', 'height'],
                properties: {
                  page: { type: Type.INTEGER },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  width: { type: Type.NUMBER },
                  height: { type: Type.NUMBER },
                },
              },
            },
            warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
    },
  };
}

export const EXTRACT_PROMPT = [
  'You are reading a teacher’s printed test and transcribing it. Extract only',
  'what the document contains. Never invent a question, never reword one, and',
  'never guess an answer.',
  '',
  'For each numbered question, return its number as printed, its full text,',
  'its answer choices exactly as written, and its type.',
  'Give each question its printed number and section heading exactly as',
  'printed: label is the number as printed (for example "3" or "5A"), and',
  'section is the heading it sits under (for example "Section 2"), or empty',
  'when the test has no sections.',
  '',
  'correctAnswer must be the exact text of the choice the document marks as',
  'correct — from an answer key, an answer table, a bolded or highlighted or',
  'underlined choice, or a leading asterisk. Answer keys are usually printed',
  'at the end of the document, for example an "Answer Section" of lines like',
  '"1. ANS: B PTS: 1", or a list like "1. B" under an "Answer Key" heading.',
  'Match each key entry to its question by number and return the text of the',
  'choice with that letter; a written answer from the key goes in',
  'correctAnswer for a fill in the blank question. The key is not a question.',
  'If the document does not say',
  'which answer is correct, return an empty string. An empty string is always',
  'the right answer when you are unsure; a guess would be marked wrong on a',
  'student’s paper.',
  '',
  'Types: MC for multiple choice including true/false, FIB for fill in the',
  'blank, Matching, Ordering, and free-response for anything open-ended.',
  'A question that fits none of these is free-response, with a warning saying',
  'what it actually was.',
  '',
  'Use warnings for anything the teacher should check: a question you could',
  'not fully read, two answers marked, a key entry with no matching choice.',
  'Leave warnings empty when there is nothing to say.',
  '',
  'When a question depends on a picture, diagram, map or chart printed with',
  'it, return that picture in figures: its 1-based page, and the box around',
  'it as fractions of the page from the top-left corner, so x 0.1 y 0.2 width',
  '0.5 height 0.3 means a box starting a tenth across and a fifth down that',
  'covers half the width and under a third of the height. Include a caption',
  'or axis labels inside the box. Return figures only for a picture the',
  'question cannot be answered without; leave it empty for decoration, a',
  'school logo or a page border. Two questions about the same picture return',
  'the same box, and the picture is brought in once.',
].join('\n');

const MULTI_ANSWER_PROMPT = [
  '',
  'Also use MA for choose all that apply: a question that asks students to',
  'select every correct choice, or whose key or markings give more than one',
  'correct choice. For MA, return every choice in options, and correctAnswer is',
  'the exact text of each correct choice joined with | (for example',
  '"Whale|Bat"), or an empty string when the document does not say.',
].join('\n');

/** The prompt, with choose-all-that-apply only when the request asks for it. */
export function buildExtractPrompt(multiAnswer = false): string {
  return multiAnswer
    ? `${EXTRACT_PROMPT}\n${MULTI_ANSWER_PROMPT}`
    : EXTRACT_PROMPT;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function coerceType(value: unknown, multiAnswer: boolean): QuestionType {
  if (multiAnswer && value === MULTI_ANSWER_TYPE) return MULTI_ANSWER_TYPE;
  return (QUESTION_TYPES as readonly unknown[]).includes(value)
    ? (value as QuestionType)
    : 'free-response';
}

function coerceOptions(value: unknown): AiExtractedOption[] {
  if (!Array.isArray(value)) return [];
  const options: AiExtractedOption[] = [];
  for (const raw of value) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const text = asString(o.text).trim();
    if (!text) continue;
    options.push({ letter: asString(o.letter).trim().toUpperCase(), text });
    if (options.length >= MAX_OPTIONS) break;
  }
  return options;
}

/**
 * A box is only usable if it is on a real page and encloses something. A
 * model that answers with a zero-width box or a page that isn't there would
 * otherwise become a crop of nothing.
 */
function coerceBox(raw: unknown): AiFigureBox | null {
  const f = (raw ?? {}) as Record<string, unknown>;
  const page = Number(f.page);
  const x = Number(f.x);
  const y = Number(f.y);
  const width = Number(f.width);
  const height = Number(f.height);
  if (!Number.isInteger(page) || page < 1) return null;
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  if (width <= 0 || height <= 0) return null;
  if (x < 0 || y < 0 || x >= 1 || y >= 1) return null;
  return { page, x, y, width, height };
}

function coerceFigures(value: unknown): AiFigureBox[] {
  if (!Array.isArray(value)) return [];
  const figures: AiFigureBox[] = [];
  for (const raw of value) {
    const box = coerceBox(raw);
    if (!box) continue;
    figures.push(box);
    if (figures.length >= MAX_FIGURES) break;
  }
  return figures;
}

/** Each `|` part matched to a choice (case-insensitively); '' if any part has no match. */
function matchMultiAnswer(
  answer: string,
  options: readonly AiExtractedOption[]
): string {
  const parts = answer
    .split('|')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const hits = options.filter((o) => parts.includes(o.text.toLowerCase()));
  const matched = new Set(hits.map((o) => o.text.toLowerCase()));
  if (parts.length === 0 || parts.some((p) => !matched.has(p))) return '';
  return [...new Set(hits.map((o) => o.text))].join('|');
}

/**
 * Turns whatever Gemini returned into the shape the client expects, dropping
 * anything unusable rather than trusting the schema to have been honoured.
 *
 * An answer the document's own choices do not contain is the important case:
 * the model paraphrasing a choice would silently mark the wrong option
 * correct, so it becomes a keyless question with a note instead.
 */
export function normalizeAiQuiz(
  parsed: unknown,
  fallbackTitle: string,
  multiAnswer = false
): AiExtractedQuiz {
  const root = (parsed ?? {}) as Record<string, unknown>;
  const rawQuestions = Array.isArray(root.questions) ? root.questions : [];
  const warnings: string[] = [];
  const questions: AiExtractedQuestion[] = [];

  for (const raw of rawQuestions.slice(0, MAX_QUESTIONS)) {
    const q = (raw ?? {}) as Record<string, unknown>;
    const text = asString(q.text).trim();
    if (!text) continue;

    const type = coerceType(q.type, multiAnswer);
    const isMulti = type === MULTI_ANSWER_TYPE;
    const options =
      type === 'MC'
        ? coerceOptions(q.options)
        : isMulti
          ? coerceOptions(q.options).map((o) => ({
              ...o,
              // `|` separates the stored right options, so it can't sit inside one.
              text: o.text.replace(/\|/g, '/'),
            }))
          : [];
    const questionWarnings = Array.isArray(q.warnings)
      ? q.warnings.map(asString).filter(Boolean)
      : [];

    let correctAnswer = asString(q.correctAnswer).trim();
    if (correctAnswer && type === 'MC') {
      const match = options.find((o) => o.text === correctAnswer);
      if (!match) {
        const loose = options.find(
          (o) => o.text.toLowerCase() === correctAnswer.toLowerCase()
        );
        if (loose) {
          correctAnswer = loose.text;
        } else {
          questionWarnings.push(
            'The answer given does not match any of the choices, so it was left blank.'
          );
          correctAnswer = '';
        }
      }
    }
    if (correctAnswer && isMulti) {
      correctAnswer = matchMultiAnswer(correctAnswer, options);
      if (!correctAnswer) {
        questionWarnings.push(
          'The answers given do not all match the choices, so they were left blank.'
        );
      }
    }
    // A written response is graded by hand and never carries a key.
    if (type === 'free-response') correctAnswer = '';

    const number = Number.isInteger(q.number)
      ? (q.number as number)
      : questions.length + 1;

    const section = asString(q.section).trim();
    const label = asString(q.label).trim();
    questions.push({
      number,
      ...(section ? { section } : {}),
      ...(label ? { label } : {}),
      text,
      type,
      options,
      correctAnswer,
      figures: coerceFigures(q.figures),
      warnings: questionWarnings,
    });
  }

  if (rawQuestions.length > MAX_QUESTIONS) {
    warnings.push(
      `Only the first ${MAX_QUESTIONS} questions were read. Split the file to import the rest.`
    );
  }

  const title = asString(root.title).trim() || fallbackTitle;
  return { title, questions, warnings };
}

async function withDeadline<T>(
  work: Promise<T>,
  ms: number
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  try {
    return await Promise.race([
      work.then((value) => ({ timedOut: false as const, value })),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Versioned tests (docs/plans/shipped/QUIZ_IMPORT_VERSIONS.md V7, V11, V12) ────

export type DocumentSectionKind = 'version' | 'rubric' | 'answer-key' | 'other';
export type VersionGroupKind = 'parallel' | 'retake' | 'split';

const SECTION_KINDS: readonly DocumentSectionKind[] = [
  'version',
  'rubric',
  'answer-key',
  'other',
];
const GROUP_KINDS: readonly VersionGroupKind[] = [
  'parallel',
  'retake',
  'split',
];

/** 1-based, inclusive. */
export interface PageRange {
  start: number;
  end: number;
}

export interface ExtractedVersion {
  /** The heading as printed, e.g. "Version A" or "Unit 3 REASSESSMENT". */
  label: string;
  /** Absent for a Word file, which has no fixed pages. */
  pages?: PageRange;
  title: string;
  /** Figure pages are the original file's, not the slice's. */
  questions: AiExtractedQuestion[];
  warnings: string[];
}

export interface AiRubricCriterion {
  /** The row's letter as printed, e.g. "A". */
  letter: string;
  prompt: string;
  /** The row's maximum, from the points column. */
  points: number;
  /** "Credit received for" lines, verbatim (V3). */
  credit: string[];
  /** "NOT ACCEPTABLE" and "NO POINTS AWARDED IF" lines, verbatim (V3). */
  notes: string[];
}

/** A rubric as printed; pairing it with a version is the client's job (V14). */
export interface ExtractedRubric {
  label: string;
  pages?: PageRange;
  title: string;
  /** The total the rubric prints, when it prints one (V16 checks the sum). */
  printedTotal?: number;
  criteria: AiRubricCriterion[];
  warnings: string[];
}

/** The AI's proposed relationship between versions, confirmed in review (V8). */
export interface VersionGroup {
  kind: VersionGroupKind;
  name: string;
  /** Indexes into `ExtractedTestSet.versions`. */
  versions: number[];
}

/** A picture pass 1 saw, with every version that prints it. */
export interface SharedFigure extends AiFigureBox {
  label?: string;
  versions: number[];
}

export interface ExtractedTestSet {
  kind: 'test-set';
  title: string;
  versions: ExtractedVersion[];
  rubrics: ExtractedRubric[];
  groups: VersionGroup[];
  figures: SharedFigure[];
  warnings: string[];
}

/** V12: 26-page reference file plus headroom (not latency-measured); each pass-2 call still holds MAX_DOCUMENT_PAGES. */
export const MAX_VERSIONED_DOCUMENT_PAGES = 40;
export const VERSIONED_DEADLINE_MS = 230_000;
export const MAX_VERSIONS = 12;
export const MAX_RUBRICS = 12;
export const MAX_CRITERIA = 26;
export const MAX_SHARED_FIGURES = 24;

export interface MappedSection {
  label: string;
  pages?: PageRange;
}

/** Pass 1's answer, cleaned up. */
export interface DocumentMap {
  title: string;
  versions: MappedSection[];
  rubrics: MappedSection[];
  /** Answer keys; `forVersion` absent means the key covers every version. */
  keys: (MappedSection & { forVersion?: number })[];
  groups: VersionGroup[];
  figures: SharedFigure[];
  warnings: string[];
}

export function buildDocumentMapSchema(): Schema {
  const box = {
    page: { type: Type.INTEGER },
    x: { type: Type.NUMBER },
    y: { type: Type.NUMBER },
    width: { type: Type.NUMBER },
    height: { type: Type.NUMBER },
  };
  return {
    type: Type.OBJECT,
    required: ['title', 'sections', 'figures', 'groups'],
    properties: {
      title: { type: Type.STRING },
      sections: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: ['kind', 'label', 'startPage'],
          properties: {
            kind: { type: Type.STRING, enum: [...SECTION_KINDS] },
            label: { type: Type.STRING },
            startPage: { type: Type.INTEGER },
            forVersion: { type: Type.STRING },
          },
        },
      },
      figures: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: ['page', 'x', 'y', 'width', 'height', 'versions'],
          properties: {
            ...box,
            label: { type: Type.STRING },
            versions: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
      groups: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: ['kind', 'name', 'versions'],
          properties: {
            kind: { type: Type.STRING, enum: [...GROUP_KINDS] },
            name: { type: Type.STRING },
            versions: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
    },
  };
}

export const DOCUMENT_MAP_PROMPT = [
  'You are mapping a teacher’s test document before it is read in detail.',
  'Do not transcribe any questions.',
  '',
  'Some files hold several versions of one test. Each version starts on a new',
  'page with a heading near the top of that page, such as "Version A",',
  '"Form 2", "Unit 3 Version C", "Reassessment", "Retake" or',
  '"Version Split Pt 1". The file may also hold rubrics, scoring guides and',
  'answer keys.',
  '',
  'sections: every section of the document in page order, each with the',
  '1-based page it starts on and its kind:',
  '- version: one version of the test. label is its heading exactly as printed.',
  '- rubric: a rubric or scoring guide. label is its heading as printed; when',
  '  several rubrics print the same heading, add its position, e.g. "RUBRIC (2)".',
  '- answer-key: an answer key. forVersion is the label of the version it',
  '  belongs to, or empty when it covers every version.',
  '- other: anything else, such as a cover page or general directions.',
  'A section starts only where a heading near the top of a page begins it. A',
  'page that continues the section before it (lined answer space, a Name line,',
  'the rest of a rubric table) is not a new section.',
  'A single test with no version headings has no version sections.',
  '',
  'figures: each picture, map, diagram or chart printed in a version, as its',
  '1-based page and its box as fractions of the page from the top-left corner,',
  'with its printed label (for example "MAP #1") and the labels of every',
  'version that prints the same picture. Leave out logos and decoration.',
  '',
  'groups: how the versions relate, judged from their headings and content.',
  '- parallel: versions given at the same sitting to different students, such',
  '  as Version A and Version B.',
  '- retake: versions for students taking the test again, such as a',
  '  Reassessment or Retake.',
  '- split: one test given in parts, such as Pt 1 and Pt 2.',
  'name each group the way a teacher would name the quiz, for example',
  '"Unit 3 FRQ" or "Unit 3 FRQ Retake". Each version belongs to one group at',
  'most. Leave groups empty when there are no versions.',
  '',
  'title is the test’s name as printed, or empty when it prints none.',
].join('\n');

/** Pass 2, one version: today's prompt, scoped to the version (V1). */
export function buildVersionPrompt(
  label: string,
  multiAnswer: boolean,
  wholeDocument: boolean
): string {
  const scope = wholeDocument
    ? [
        'This document holds several versions of a test. Read only the version',
        `headed "${label}", and its answer key if it has one. Ignore every other`,
        'version and every rubric.',
      ]
    : [
        `These pages are one version of a test, headed "${label}". Any pages`,
        'after it are that version’s answer key. Read only this version.',
      ];
  return [
    ...scope,
    '',
    'A prompt with lettered parts (A, B, C …) that share one answer space is',
    'ONE free-response question. Keep its introduction and the whole lettered',
    'list in its text, in order, exactly as printed. Never split the lettered',
    'parts into separate questions. Lined answer space and a Name line are not',
    'questions.',
    '',
    buildExtractPrompt(multiAnswer),
  ].join('\n');
}

export function buildRubricSchema(): Schema {
  return {
    type: Type.OBJECT,
    required: ['title', 'printedTotal', 'criteria', 'warnings'],
    properties: {
      title: { type: Type.STRING },
      printedTotal: { type: Type.NUMBER },
      criteria: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: ['letter', 'prompt', 'points', 'credit', 'notes'],
          properties: {
            letter: { type: Type.STRING },
            prompt: { type: Type.STRING },
            points: { type: Type.NUMBER },
            credit: { type: Type.ARRAY, items: { type: Type.STRING } },
            notes: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
      warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
  };
}

/** Pass 2, one rubric: a transcription, never a summary (V3). */
export function buildRubricPrompt(
  label: string,
  wholeDocument: boolean
): string {
  const scope = wholeDocument
    ? `This document holds a test and its rubrics. Read only the rubric headed "${label}".`
    : `These pages are one rubric from a teacher’s test, headed "${label}".`;
  return [
    scope,
    'Transcribe it exactly. Never reword, summarize or correct it, and keep',
    'spelling mistakes as printed.',
    '',
    'title: the rubric’s heading as printed.',
    'criteria: one per lettered row, in order:',
    '- letter: the row’s letter as printed (A, B, C …).',
    '- prompt: the prompt or criterion text for that row, exactly as printed.',
    '- points: the most points the row is worth, from its points column (for',
    '  "/2" or "0 1 2" that is 2).',
    '- credit: each line under "Credit received for" or similar, exactly as',
    '  printed, one item per bullet or sub-bullet, without the bullet mark.',
    '- notes: each "NOT ACCEPTABLE", "NO POINTS AWARDED IF" or similar line',
    '  that says what earns no credit, exactly as printed.',
    'Leave out "Teacher Comments" space and blank score lines.',
    'printedTotal: the total points the rubric prints, or 0 when it prints none.',
    'Use warnings for anything you could not read.',
  ].join('\n');
}

const labelKey = (label: string): string =>
  label.toLowerCase().replace(/\s+/g, ' ').trim();

/** Two sections can't share a label, or groups and keys couldn't find them. */
function uniqueLabel(label: string, taken: Set<string>): string {
  let out = label;
  for (let n = 2; taken.has(labelKey(out)); n++) out = `${label} (${n})`;
  taken.add(labelKey(out));
  return out;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map(asString)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

/**
 * Pass 1's answer as sections with page ranges. A range runs to the page
 * before the next section starts, so a model that only names start pages
 * still gives every page to exactly one section. `pageCount` is null for a
 * Word file, whose sections keep the model's order and have no pages.
 */
export function normalizeDocumentMap(
  parsed: unknown,
  pageCount: number | null,
  fallbackTitle: string
): DocumentMap {
  const root = (parsed ?? {}) as Record<string, unknown>;
  const warnings: string[] = [];
  type Raw = {
    kind: DocumentSectionKind;
    label: string;
    start: number;
    forVersion: string;
  };
  let raws: Raw[] = [];
  for (const item of Array.isArray(root.sections) ? root.sections : []) {
    const s = (item ?? {}) as Record<string, unknown>;
    const kind = s.kind as DocumentSectionKind;
    if (!SECTION_KINDS.includes(kind)) continue;
    const start = Number(s.startPage);
    if (pageCount !== null) {
      if (!Number.isInteger(start) || start < 1 || start > pageCount) continue;
    }
    raws.push({
      kind,
      label: asString(s.label).trim(),
      start: Number.isInteger(start) ? start : 0,
      forVersion: asString(s.forVersion).trim(),
    });
  }
  if (pageCount !== null) {
    // Stable sort, then one section per start page: the first one named wins.
    raws = raws
      .map((r, i) => ({ r, i }))
      .sort((a, b) => a.r.start - b.r.start || a.i - b.i)
      .map(({ r }) => r)
      .filter((r, i, all) => i === 0 || all[i - 1].start !== r.start);
  }

  const pagesOf = (i: number): PageRange | undefined => {
    if (pageCount === null) return undefined;
    const next = raws[i + 1];
    return { start: raws[i].start, end: next ? next.start - 1 : pageCount };
  };

  const taken = new Set<string>();
  const versions: MappedSection[] = [];
  const rubrics: MappedSection[] = [];
  const rawKeys: (MappedSection & { forLabel: string })[] = [];
  raws.forEach((r, i) => {
    const pages = pagesOf(i);
    const at = pages ? { pages } : {};
    if (r.kind === 'version') {
      if (versions.length >= MAX_VERSIONS) return;
      const label = uniqueLabel(
        r.label || `Version ${versions.length + 1}`,
        taken
      );
      versions.push({ label, ...at });
    } else if (r.kind === 'rubric') {
      if (rubrics.length >= MAX_RUBRICS) return;
      const label = uniqueLabel(
        r.label || `Rubric ${rubrics.length + 1}`,
        taken
      );
      rubrics.push({ label, ...at });
    } else if (r.kind === 'answer-key') {
      rawKeys.push({
        label: r.label || 'Answer key',
        forLabel: r.forVersion,
        ...at,
      });
    }
  });
  const versionCount = raws.filter((r) => r.kind === 'version').length;
  if (versionCount > MAX_VERSIONS)
    warnings.push(
      `Only the first ${MAX_VERSIONS} versions were read. Split the file to import the rest.`
    );
  const rubricCount = raws.filter((r) => r.kind === 'rubric').length;
  if (rubricCount > MAX_RUBRICS)
    warnings.push(
      `Only the first ${MAX_RUBRICS} rubrics were read. Split the file to import the rest.`
    );

  const indexByLabel = new Map(versions.map((v, i) => [labelKey(v.label), i]));
  const versionIndexes = (value: unknown): number[] => [
    ...new Set(
      asStringList(value)
        .map((l) => indexByLabel.get(labelKey(l)))
        .filter((i): i is number => i !== undefined)
    ),
  ];

  const keys = rawKeys.map(({ forLabel, ...key }) => {
    const forVersion = forLabel
      ? indexByLabel.get(labelKey(forLabel))
      : undefined;
    return forVersion === undefined ? key : { ...key, forVersion };
  });

  const grouped = new Set<number>();
  const groups: VersionGroup[] = [];
  for (const item of Array.isArray(root.groups) ? root.groups : []) {
    const g = (item ?? {}) as Record<string, unknown>;
    const kind = g.kind as VersionGroupKind;
    if (!GROUP_KINDS.includes(kind)) continue;
    const members = versionIndexes(g.versions).filter((i) => !grouped.has(i));
    if (members.length === 0) continue;
    members.forEach((i) => grouped.add(i));
    const name =
      asString(g.name).trim() ||
      members.map((i) => versions[i].label).join(' / ');
    groups.push({ kind, name, versions: members.sort((a, b) => a - b) });
  }

  const figures: SharedFigure[] = [];
  for (const item of Array.isArray(root.figures) ? root.figures : []) {
    const box = coerceBox(item);
    if (!box || (pageCount !== null && box.page > pageCount)) continue;
    const f = (item ?? {}) as Record<string, unknown>;
    const label = asString(f.label).trim();
    figures.push({
      ...box,
      ...(label ? { label } : {}),
      versions: versionIndexes(f.versions),
    });
    if (figures.length >= MAX_SHARED_FIGURES) break;
  }

  return {
    title: asString(root.title).trim() || fallbackTitle,
    versions,
    rubrics,
    keys,
    groups,
    figures,
    warnings,
  };
}

/** A version's pass-2 pages: its own, then its keys, held to the per-call cap (V12). */
export function versionCallPages(
  map: DocumentMap,
  index: number
): { pages: number[]; truncated: boolean } {
  const own = map.versions[index].pages;
  if (!own) return { pages: [], truncated: false };
  const pages: number[] = [];
  const add = (range: PageRange) => {
    for (let p = range.start; p <= range.end; p++)
      if (!pages.includes(p)) pages.push(p);
  };
  add(own);
  for (const key of map.keys)
    if (key.pages && (key.forVersion === undefined || key.forVersion === index))
      add(key.pages);
  return {
    pages: pages.slice(0, MAX_DOCUMENT_PAGES),
    truncated: pages.length > MAX_DOCUMENT_PAGES,
  };
}

function rangePages(range: PageRange): number[] {
  const pages: number[] = [];
  for (let p = range.start; p <= range.end; p++) pages.push(p);
  return pages;
}

/** Figure pages in a slice back to the original file's; a page outside the slice is dropped. */
export function remapFigurePages(
  questions: AiExtractedQuestion[],
  pages: readonly number[]
): AiExtractedQuestion[] {
  if (pages.length === 0) return questions;
  return questions.map((q) => ({
    ...q,
    figures: q.figures
      .filter((f) => f.page <= pages.length)
      .map((f) => ({ ...f, page: pages[f.page - 1] })),
  }));
}

export function normalizeAiRubric(
  parsed: unknown,
  label: string
): Omit<ExtractedRubric, 'label' | 'pages'> {
  const root = (parsed ?? {}) as Record<string, unknown>;
  const warnings = asStringList(root.warnings);
  const criteria: AiRubricCriterion[] = [];
  const rows = Array.isArray(root.criteria) ? root.criteria : [];
  for (const item of rows.slice(0, MAX_CRITERIA)) {
    const c = (item ?? {}) as Record<string, unknown>;
    const prompt = asString(c.prompt).trim();
    const letter = asString(c.letter).trim().toUpperCase();
    if (!prompt && !letter) continue;
    const raw = Number(c.points);
    const points = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    if (points !== raw)
      warnings.push(
        `Row ${letter || criteria.length + 1} has no readable points, so it was set to 0.`
      );
    criteria.push({
      letter,
      prompt,
      points,
      credit: asStringList(c.credit),
      notes: asStringList(c.notes),
    });
  }
  if (rows.length > MAX_CRITERIA)
    warnings.push(`Only the first ${MAX_CRITERIA} rubric rows were read.`);
  const total = Number(root.printedTotal);
  return {
    title: asString(root.title).trim() || label,
    ...(Number.isFinite(total) && total > 0 ? { printedTotal: total } : {}),
    criteria,
    warnings,
  };
}

// ── Core ───────────────────────────────────────────────────────────────────

const TOO_LONG = 'Reading the document took too long. Try a shorter file.';

/** One model call held to the time left, parsed; a failure is the error the teacher sees. */
async function runCall(
  work: () => Promise<string>,
  ms: number,
  what: string
): Promise<unknown> {
  if (ms <= 0) throw new HttpsError('deadline-exceeded', TOO_LONG);
  let outcome: Awaited<ReturnType<typeof withDeadline<string>>>;
  try {
    outcome = await withDeadline(work(), ms);
  } catch (err) {
    console.error(`[quizDocumentExtract] ${what} failed`, err);
    throw new HttpsError('unavailable', 'Reading the document failed.');
  }
  if (outcome.timedOut) throw new HttpsError('deadline-exceeded', TOO_LONG);
  try {
    return parseGeminiJson<Record<string, unknown>>(outcome.value);
  } catch (err) {
    console.error(`[quizDocumentExtract] ${what}: unparseable response`, err);
    throw new HttpsError('unavailable', 'Reading the document failed.');
  }
}

/**
 * Pass 1 maps the file, then pass 2 reads every version and rubric in its
 * own call, all at once (V11). Null when the map finds fewer than two
 * versions, so the caller imports the file the way it always has (V7).
 */
async function extractTestSet(
  request: ExtractDocumentRequest,
  pageCount: number | null,
  fallbackTitle: string,
  left: () => number,
  deps: ExtractDocumentDeps
): Promise<ExtractedTestSet | null> {
  const map = normalizeDocumentMap(
    await runCall(
      () =>
        deps.generate(
          request.bytes,
          request.mimeType,
          DOCUMENT_MAP_PROMPT,
          buildDocumentMapSchema()
        ),
      left(),
      'document map'
    ),
    pageCount,
    fallbackTitle
  );
  if (map.versions.length < 2) return null;

  const multi = request.multiAnswer === true;
  // A Word file has no pages to slice, so each call reads it whole.
  const whole = pageCount === null;
  const read = async (
    pages: number[],
    prompt: string,
    schema: Schema,
    what: string
  ) => {
    const bytes = whole
      ? request.bytes
      : await deps.slicePdf(request.bytes, pages);
    return runCall(
      () => deps.generate(bytes, request.mimeType, prompt, schema),
      left(),
      what
    );
  };

  const versions = map.versions.map(async (v, i): Promise<ExtractedVersion> => {
    const { pages, truncated } = versionCallPages(map, i);
    const at = v.pages ? { pages: v.pages } : {};
    const warnings = truncated
      ? [
          `Only the first ${MAX_DOCUMENT_PAGES} pages of this version were read.`,
        ]
      : [];
    try {
      const quiz = normalizeAiQuiz(
        await read(
          pages,
          buildVersionPrompt(v.label, multi, whole),
          buildDocumentResponseSchema(multi),
          `version "${v.label}"`
        ),
        v.label,
        multi
      );
      return {
        label: v.label,
        ...at,
        title: quiz.title,
        questions: remapFigurePages(quiz.questions, pages),
        warnings: [...warnings, ...quiz.warnings],
      };
    } catch {
      return {
        label: v.label,
        ...at,
        title: v.label,
        questions: [],
        warnings: [
          ...warnings,
          'This version could not be read. Import the file again, or add its questions in the editor.',
        ],
      };
    }
  });

  const rubrics = map.rubrics.map(async (r): Promise<ExtractedRubric> => {
    const all = r.pages ? rangePages(r.pages) : [];
    const pages = all.slice(0, MAX_DOCUMENT_PAGES);
    const at = r.pages ? { pages: r.pages } : {};
    const warnings =
      all.length > pages.length
        ? [
            `Only the first ${MAX_DOCUMENT_PAGES} pages of this rubric were read.`,
          ]
        : [];
    try {
      const rubric = normalizeAiRubric(
        await read(
          pages,
          buildRubricPrompt(r.label, whole),
          buildRubricSchema(),
          `rubric "${r.label}"`
        ),
        r.label
      );
      return {
        label: r.label,
        ...at,
        ...rubric,
        warnings: [...warnings, ...rubric.warnings],
      };
    } catch {
      return {
        label: r.label,
        ...at,
        title: r.label,
        criteria: [],
        warnings: [
          ...warnings,
          'This rubric could not be read. Add it in the Rubrics library.',
        ],
      };
    }
  });

  const [readVersions, readRubrics] = await Promise.all([
    Promise.all(versions),
    Promise.all(rubrics),
  ]);
  if (readVersions.every((v) => v.questions.length === 0)) {
    if (left() <= 0) throw new HttpsError('deadline-exceeded', TOO_LONG);
    throw new HttpsError(
      'not-found',
      'No questions could be read from that document.'
    );
  }
  return {
    kind: 'test-set',
    title: map.title,
    versions: readVersions,
    rubrics: readRubrics,
    groups: map.groups,
    figures: map.figures,
    warnings: map.warnings,
  };
}

export async function extractQuizFromDocument(
  request: ExtractDocumentRequest,
  caller: {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    studentRole: boolean;
  },
  deps: ExtractDocumentDeps
): Promise<AiExtractedQuiz | ExtractedTestSet> {
  if (caller.studentRole)
    throw new HttpsError('permission-denied', 'Teacher account required.');
  // An unverified (self-reported) email must never reach the admin bypass
  // inside either gate.
  const email = caller.emailVerified ? caller.email : null;

  const [importGranted, geminiGranted, aiReaderGranted, versioned] =
    await Promise.all([
      deps.isImportGranted(caller.uid, email),
      deps.isGeminiGranted(caller.uid, email),
      deps.isAiReaderGranted(caller.uid, email),
      request.versions === true
        ? deps.isVersionsGranted(caller.uid, email)
        : Promise.resolve(false),
    ]);
  if (!importGranted)
    throw new HttpsError(
      'permission-denied',
      'Importing a quiz from a document is not enabled for this account.'
    );
  if (!geminiGranted)
    throw new HttpsError(
      'permission-denied',
      'AI features are not enabled for this account.'
    );
  if (!aiReaderGranted)
    throw new HttpsError(
      'permission-denied',
      'Reading documents with AI is not enabled for this account.'
    );

  const startedAt = deps.now();

  let pageCount: number | null = null;
  if (request.mimeType === PDF_MIME) {
    try {
      pageCount = await deps.pdfPageCount(request.bytes);
    } catch (err) {
      console.warn('[quizDocumentExtract] page count failed', err);
      throw new HttpsError(
        'invalid-argument',
        'That PDF could not be opened. It may be password protected.'
      );
    }
    // Checked before anything is sent, so an over-long file costs nothing.
    const limit = versioned ? MAX_VERSIONED_DOCUMENT_PAGES : MAX_DOCUMENT_PAGES;
    if (pageCount > limit)
      throw new HttpsError(
        'invalid-argument',
        `That file is ${pageCount} pages and the limit is ${limit}. Split it and import the parts.`
      );
  }

  // Checked before the charge: a request that bails out here never reaches
  // Gemini, so it must not spend one of the teacher's daily uses either.
  const deadline = versioned ? VERSIONED_DEADLINE_MS : EXTRACT_DEADLINE_MS;
  const left = () => deadline - (deps.now() - startedAt);
  if (left() <= 0) throw new HttpsError('deadline-exceeded', TOO_LONG);

  // Charged once the request is going to be sent, and once per import
  // whatever the page count or the number of calls (D19, V11).
  await deps.chargeQuiz(caller.uid, email);

  const fallbackTitle =
    request.fileName.replace(/\.[^.]+$/, '').trim() || 'Imported Quiz';

  if (versioned) {
    const set = await extractTestSet(
      request,
      pageCount,
      fallbackTitle,
      left,
      deps
    );
    if (set) return set;
    // No versions, so the file imports as today and today's cap applies.
    if (pageCount !== null && pageCount > MAX_DOCUMENT_PAGES)
      throw new HttpsError(
        'invalid-argument',
        `That file is ${pageCount} pages with no versions, and the limit is ${MAX_DOCUMENT_PAGES}. Split it and import the parts.`
      );
  }

  const quiz = normalizeAiQuiz(
    await runCall(
      () =>
        deps.extract(
          request.bytes,
          request.mimeType,
          request.multiAnswer === true
        ),
      left(),
      'extraction'
    ),
    fallbackTitle,
    request.multiAnswer === true
  );
  if (quiz.questions.length === 0)
    throw new HttpsError(
      'not-found',
      'No questions could be read from that document.'
    );
  return quiz;
}

// ── Default deps ───────────────────────────────────────────────────────────

async function pdfPageCountOf(bytes: Buffer): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

function geminiExtract(
  bytes: Buffer,
  mimeType: string,
  multiAnswer: boolean
): Promise<string> {
  return geminiGenerate(
    bytes,
    mimeType,
    buildExtractPrompt(multiAnswer),
    buildDocumentResponseSchema(multiAnswer)
  );
}

async function geminiGenerate(
  bytes: Buffer,
  mimeType: string,
  prompt: string,
  schema: Schema
): Promise<string> {
  const { generateAi } = await import('./aiRouter');
  // A .docx goes to Gemini even when Claude is chosen; Claude reads PDFs only.
  const result = await generateAi(admin.firestore(), {
    integration: 'quiz-document-import',
    // Leaves a long PDF's Gemini retry room inside the function timeout.
    claudeTimeoutMs: 45_000,
    parts: [
      { text: prompt },
      { inlineData: { mimeType, data: bytes.toString('base64') } },
    ],
    responseMimeType: 'application/json',
    responseSchema: schema,
  });
  return result.text;
}

async function slicePdfPages(bytes: Buffer, pages: number[]): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    source,
    pages.map((p) => p - 1)
  );
  copied.forEach((page) => out.addPage(page));
  return Buffer.from(await out.save());
}

/** Mirrors generateWithAI's per-feature counter; admins are uncapped. */
export async function chargeQuizQuota(
  db: Firestore,
  uid: string,
  email: string | null,
  nowMs: number
): Promise<void> {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const isAdmin = email
    ? (await db.collection('admins').doc(email.toLowerCase()).get()).exists
    : false;
  const overallRef = db.collection('ai_usage').doc(`${uid}_${today}`);
  const specificRef = db
    .collection('ai_usage')
    .doc(`${uid}_${QUIZ_QUOTA_FEATURE_ID}_${today}`);
  const permRef = db
    .collection('global_permissions')
    .doc(QUIZ_QUOTA_FEATURE_ID);
  await db.runTransaction(async (tx) => {
    const [specific, perm] = await Promise.all([
      tx.get(specificRef),
      tx.get(permRef),
    ]);
    const used = specific.exists ? Number(specific.data()?.count ?? 0) : 0;
    const config = (perm.data()?.config ?? {}) as {
      dailyLimit?: unknown;
      dailyLimitEnabled?: unknown;
    };
    const limit =
      typeof config.dailyLimit === 'number'
        ? config.dailyLimit
        : DEFAULT_QUIZ_DAILY_LIMIT;
    if (!isAdmin && config.dailyLimitEnabled !== false && used >= limit)
      throw new HttpsError(
        'resource-exhausted',
        `Daily limit for AI quiz import reached (${limit} per day). Please try again tomorrow.`
      );
    const inc = (n: number) => admin.firestore.FieldValue.increment(n);
    const stamp = admin.firestore.FieldValue.serverTimestamp();
    tx.set(
      specificRef,
      { count: inc(1), lastUsed: stamp, featureId: QUIZ_QUOTA_FEATURE_ID },
      { merge: true }
    );
    tx.set(overallRef, { count: inc(1), lastUsed: stamp }, { merge: true });
  });
}

export function buildDefaultExtractDocumentDeps(): ExtractDocumentDeps {
  const db = admin.firestore();
  return {
    db,
    isImportGranted: (uid, email) =>
      isGlobalFeatureGranted(db, QUIZ_DOCUMENT_IMPORT_FEATURE_ID, email, uid),
    isGeminiGranted: (uid, email) =>
      isGlobalFeatureGranted(db, GEMINI_FEATURE_ID, email, uid),
    isAiReaderGranted: (uid, email) =>
      isGlobalFeatureGranted(db, QUIZ_QUOTA_FEATURE_ID, email, uid),
    chargeQuiz: (uid, email) => chargeQuizQuota(db, uid, email, Date.now()),
    pdfPageCount: pdfPageCountOf,
    extract: geminiExtract,
    isVersionsGranted: (uid, email) =>
      isGlobalFeatureGranted(db, QUIZ_IMPORT_VERSIONS_FEATURE_ID, email, uid),
    generate: geminiGenerate,
    slicePdf: slicePdfPages,
    now: () => Date.now(),
  };
}

// ── Callable ───────────────────────────────────────────────────────────────

export const extractQuizFromDocumentV1 = onCall(
  {
    memory: '1GiB',
    // A versioned import runs two passes (VERSIONED_DEADLINE_MS).
    timeoutSeconds: 240,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
    secrets: [ANTHROPIC_API_KEY],
  },
  async (request) => {
    assertViewAsAllowed(request, { outward: true });
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in required.');
    await assertAiTeacherCaller(admin.firestore(), request.auth.token);
    const parsed = parseExtractDocumentRequest(request.data);
    return extractQuizFromDocument(
      parsed,
      {
        uid: request.auth.uid,
        email: request.auth.token.email ?? null,
        emailVerified: request.auth.token.email_verified === true,
        studentRole: request.auth.token.studentRole === true,
      },
      buildDefaultExtractDocumentDeps()
    );
  }
);
