/**
 * The AI reader's client half (docs/plans/QUIZ_DOCUMENT_IMPORT.md D1, D3).
 *
 * The Cloud Function does the reading; this maps what comes back onto the
 * same `ExtractedQuiz` the browser reader produces, so the review table and
 * the create step never learn which reader ran.
 */

import { readDocx } from './docxReader';
import { parseQuestionLines } from './parseQuestions';
import { documentKind, titleFromFileName } from './fileKind';
import { assertWithinByteLimit } from './limits';
import type {
  ExtractedImage,
  ExtractedOption,
  ExtractedQuestion,
  ExtractedQuiz,
} from './types';
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
  index: number
): ExtractedQuestion {
  const type: QuizQuestionType = QUESTION_TYPES.has(raw.type)
    ? raw.type
    : 'free-response';
  return {
    number: Number.isInteger(raw.number) ? raw.number : index + 1,
    text: typeof raw.text === 'string' ? raw.text : '',
    type,
    options: type === 'MC' ? (raw.options ?? []).map(toOption) : [],
    correctAnswer:
      typeof raw.correctAnswer === 'string' ? raw.correctAnswer : '',
    imageIds: [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter(Boolean) : [],
  };
}

export function aiQuizToExtracted(
  ai: AiExtractedQuiz,
  fallbackTitle: string
): ExtractedQuiz {
  const questions = Array.isArray(ai.questions) ? ai.questions : [];
  return {
    title: (ai.title || '').trim() || fallbackTitle,
    questions: questions.map(toExtractedQuestion),
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

export interface AiReadOptions {
  fileName?: string;
  extract: AiExtractFn;
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
  if (!kind) {
    throw new Error(
      'That file type can’t be read. Upload a PDF, a Word file (.docx) or a Google Doc.'
    );
  }
  assertWithinByteLimit(file);

  const ai = await options.extract({
    fileName,
    mimeType: kind === 'pdf' ? 'application/pdf' : DOCX_MIME,
    data: await blobToBase64(file),
  });
  const quiz = aiQuizToExtracted(ai, titleFromFileName(fileName));

  if (kind !== 'docx') {
    // D13: cropping a PDF's figures comes later, so say so rather than
    // leaving a question whose picture silently isn't there.
    return {
      ...quiz,
      warnings: [
        ...quiz.warnings,
        'Pictures in a PDF aren’t brought in — add them to the questions that need them in the editor.',
      ],
    };
  }

  try {
    const { lines, images } = await readDocx(file);
    return graftDocxImages(quiz, parseQuestionLines(lines), images);
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
