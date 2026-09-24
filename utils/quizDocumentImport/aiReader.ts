/**
 * The AI reader's client half (docs/plans/QUIZ_DOCUMENT_IMPORT.md D1, D3).
 *
 * The Cloud Function does the reading; this maps what comes back onto the
 * same `ExtractedQuiz` the browser reader produces, so the review table and
 * the create step never learn which reader ran.
 */

import { readDocx } from './docxReader';
import { parseQuestionLines } from './parseQuestions';
import { applyAnswerKey, findAnswerKey } from './answerKey';
import { UNREADABLE_FILE, documentKind, titleFromFileName } from './fileKind';
import { assertWithinByteLimit } from './limits';
import type {
  DocLine,
  ExtractedImage,
  ExtractedOption,
  ExtractedQuestion,
  ExtractedQuiz,
  ReaderOptions,
} from './types';
import {
  cropPdfFigures,
  figureKey,
  type FigureBox,
  type PdfCropperDeps,
} from './pdfFigures';
import type { QuizQuestionType } from '@/types';

/** What the callable answers with; mirrors `AiExtractedQuiz` on the server. */
export interface AiExtractedQuiz {
  title: string;
  questions: {
    number: number;
    text: string;
    type: QuizQuestionType;
    options: { letter: string; text: string }[];
    correctAnswer: string;
    figures?: FigureBox[];
    warnings: string[];
  }[];
  warnings: string[];
}

/** The one call this reader makes; the browser wiring lives in `aiReaderApi`. */
export type AiExtractFn = (input: {
  fileName: string;
  mimeType: string;
  /** The document, base64, no data-URL prefix. */
  data: string;
  /** Ask for choose-all-that-apply questions; omitted keeps the old types. */
  multiAnswer?: boolean;
}) => Promise<AiExtractedQuiz>;

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const QUESTION_TYPES = new Set<string>([
  'MC',
  'FIB',
  'Matching',
  'Ordering',
  'free-response',
]);

/** Base64 for the wire; `FileReader` is the one encoder every browser has. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      // readAsDataURL prefixes `data:<type>;base64,`, which the function's
      // decoder would take as part of the document.
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function toOption(raw: { letter?: unknown; text?: unknown }): ExtractedOption {
  return {
    letter: typeof raw.letter === 'string' ? raw.letter.toUpperCase() : '',
    text: typeof raw.text === 'string' ? raw.text : '',
  };
}

/** Maps one AI question onto the shared shape; pictures are grafted separately. */
function toExtractedQuestion(
  raw: AiExtractedQuiz['questions'][number],
  index: number,
  multi: boolean
): ExtractedQuestion {
  const type: QuizQuestionType =
    QUESTION_TYPES.has(raw.type) || (multi && raw.type === 'MA')
      ? raw.type
      : 'free-response';
  return {
    number: Number.isInteger(raw.number) ? raw.number : index + 1,
    text: typeof raw.text === 'string' ? raw.text : '',
    type,
    options:
      type === 'MC' || type === 'MA' ? (raw.options ?? []).map(toOption) : [],
    correctAnswer:
      typeof raw.correctAnswer === 'string' ? raw.correctAnswer : '',
    imageIds: [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter(Boolean) : [],
  };
}

export function aiQuizToExtracted(
  ai: AiExtractedQuiz,
  fallbackTitle: string,
  options: ReaderOptions = {}
): ExtractedQuiz {
  const questions = Array.isArray(ai.questions) ? ai.questions : [];
  const multi = options.multiAnswer === true;
  return {
    title: (ai.title || '').trim() || fallbackTitle,
    questions: questions.map((q, i) => toExtractedQuestion(q, i, multi)),
    images: [],
    warnings: Array.isArray(ai.warnings) ? ai.warnings.filter(Boolean) : [],
  };
}

/**
 * Puts a Word file's pictures back on the AI's questions. The model reads the
 * document as text and never sees the picture ids, so the browser reader
 * supplies the anchoring and the two are matched by question number — without
 * this, turning AI access on would lose the pictures that import today.
 */
export function graftDocxImages(
  quiz: ExtractedQuiz,
  anchored: readonly ExtractedQuestion[],
  images: readonly ExtractedImage[]
): ExtractedQuiz {
  const byNumber = new Map(anchored.map((q) => [q.number, q.imageIds]));
  const questions = quiz.questions.map((q) => {
    const imageIds = byNumber.get(q.number);
    return imageIds && imageIds.length > 0
      ? { ...q, imageIds: [...imageIds] }
      : q;
  });
  const used = new Set(questions.flatMap((q) => q.imageIds));
  return {
    ...quiz,
    questions,
    images: images.filter((img) => used.has(img.id)),
  };
}

/**
 * Crops the figures the reader pointed at and links them to their questions
 * (D13). A question whose picture could not be cropped keeps its text; the
 * teacher is told which, because a diagram question without its diagram is
 * unanswerable and they need to know to add it.
 */
async function attachPdfFigures(
  quiz: ExtractedQuiz,
  ai: AiExtractedQuiz,
  file: Blob,
  makeCropper: AiReadOptions['cropper']
): Promise<ExtractedQuiz> {
  const boxes = (ai.questions ?? []).flatMap((q) => q.figures ?? []);
  if (boxes.length === 0) return quiz;

  if (!makeCropper) {
    return {
      ...quiz,
      warnings: [
        ...quiz.warnings,
        'Pictures in a PDF aren’t brought in — add them to the questions that need them in the editor.',
      ],
    };
  }

  let cropped;
  try {
    cropped = await cropPdfFigures(boxes, await makeCropper(file));
  } catch (err) {
    console.warn('[quizDocumentImport] could not crop the PDF', err);
    return {
      ...quiz,
      warnings: [
        ...quiz.warnings,
        'Pictures in this PDF couldn’t be brought in — add them in the editor.',
      ],
    };
  }

  // aiQuizToExtracted maps one to one with no filtering, so the two lists
  // stay index-aligned.
  const questions = quiz.questions.map((question, index) => {
    const figures = ai.questions?.[index]?.figures ?? [];
    const imageIds = figures
      .map((box) => cropped.idByBox.get(figureKey(box)))
      .filter((id): id is string => typeof id === 'string');
    return imageIds.length > 0 ? { ...question, imageIds } : question;
  });

  return {
    ...quiz,
    questions,
    images: cropped.images,
    warnings: [...quiz.warnings, ...cropped.warnings],
  };
}

export interface AiReadOptions {
  fileName?: string;
  extract: AiExtractFn;
  /** Crops a PDF's figures out of the page (D13); omitted skips them. */
  cropper?: (file: Blob) => Promise<PdfCropperDeps>;
  /** A PDF's text layer, read to check the model against the key at the back. */
  readPdfLines?: (file: Blob) => Promise<DocLine[]>;
  /** Lets the read produce choose-all-that-apply questions. */
  multiAnswer?: boolean;
}

/**
 * The key printed at the back of the document, read the plain way. The model
 * often leaves a test-bank answer section unmatched, and a letter-to-choice
 * lookup is exactly what code does better, so the key found here wins.
 */
function withDocumentKey(
  quiz: ExtractedQuiz,
  lines: readonly DocLine[],
  reader: ReaderOptions
): ExtractedQuiz {
  return applyAnswerKey(
    quiz,
    findAnswerKey(lines, reader).answerByNumber,
    'document',
    reader
  );
}

async function withPdfKey(
  quiz: ExtractedQuiz,
  file: Blob,
  readLines: AiReadOptions['readPdfLines'],
  reader: ReaderOptions
): Promise<ExtractedQuiz> {
  if (!readLines) return quiz;
  try {
    return withDocumentKey(quiz, await readLines(file), reader);
  } catch (err) {
    // The model's answers stand; a text layer that won't open costs nothing more.
    console.warn('[quizDocumentImport] could not read the answer key', err);
    return quiz;
  }
}

/**
 * Read one document through the Cloud Function. A Word file is also opened
 * locally, for its pictures alone.
 */
export async function readQuizDocumentWithAi(
  file: Blob,
  options: AiReadOptions
): Promise<ExtractedQuiz> {
  const fileName = options.fileName ?? (file as File).name ?? '';
  const kind = documentKind(file, fileName);
  if (!kind) throw new Error(UNREADABLE_FILE);
  // Rich text never reaches the callable, which takes a PDF or a Word file.
  if (kind !== 'pdf' && kind !== 'docx') {
    throw new Error('The smarter reader only takes a PDF or a Word file.');
  }
  assertWithinByteLimit(file);

  const reader: ReaderOptions = { multiAnswer: options.multiAnswer === true };
  const ai = await options.extract({
    fileName,
    mimeType: kind === 'pdf' ? 'application/pdf' : DOCX_MIME,
    data: await blobToBase64(file),
    ...(reader.multiAnswer ? { multiAnswer: true } : {}),
  });
  const quiz = aiQuizToExtracted(ai, titleFromFileName(fileName), reader);

  if (kind !== 'docx') {
    const withFigures = await attachPdfFigures(quiz, ai, file, options.cropper);
    return withPdfKey(withFigures, file, options.readPdfLines, reader);
  }

  try {
    const { lines, images } = await readDocx(file);
    return withDocumentKey(
      graftDocxImages(quiz, parseQuestionLines(lines, reader), images),
      lines,
      reader
    );
  } catch (err) {
    // The questions are already read; losing the pictures is worth a note,
    // not an error that throws the import away.
    console.warn('[quizDocumentImport] could not read pictures', err);
    return {
      ...quiz,
      warnings: [
        ...quiz.warnings,
        'Pictures in this file couldn’t be brought in — add them in the editor.',
      ],
    };
  }
}
