import { readableText } from '@/utils/quizDocumentImport/cartridgeHtml';
import type {
  ExtractedOption,
  ExtractedQuestion,
  ExtractedQuiz,
} from '@/utils/quizDocumentImport/types';

/** Quiz-level Schoology settings SpartBoard has an equivalent for (SCHOOLOGY_QUIZ_IMPORT Q12). */
export interface SchoologyQuizSettings {
  shuffleQuestions?: boolean;
  timeLimitMinutes?: number;
  attempts?: number;
}

/** What a Schoology reader hands the inbox; `quiz.images` stays empty until the pictures are downloaded. */
export interface SchoologyRead {
  quiz: ExtractedQuiz;
  /** Every picture the questions use; each question's `imageIds` are these URLs. */
  imageUrls: string[];
  /** Question numbers imported as "needs a look" placeholders (Q6). */
  unsupported: number[];
  settings: SchoologyQuizSettings;
  /** A Resources item's folders, collection first; course items file under the course name instead. */
  folderPath?: string[];
}

/** Thrown when Schoology's page or data no longer has the shape a reader expects. */
export class SchoologyReadError extends Error {
  constructor(detail: string) {
    super(`Couldn't read this quiz: ${detail}`);
    this.name = 'SchoologyReadError';
  }
}

export interface HtmlContent {
  text: string;
  imageUrls: string[];
}

/** Schoology rich text to plain lines plus the pictures it shows. */
export function htmlContent(html: string, origin?: string): HtmlContent {
  if (!/[<&]/.test(html)) return { text: html.trim(), imageUrls: [] };
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imageUrls = Array.from(doc.getElementsByTagName('img'))
    .map((img) => img.getAttribute('src') ?? '')
    .filter(Boolean)
    .map((src) => absoluteUrl(src, origin));
  return { text: readableText(doc.body), imageUrls };
}

function absoluteUrl(src: string, origin?: string): string {
  if (!origin) return src;
  try {
    return new URL(src, origin).toString();
  } catch {
    return src;
  }
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const asOptions = (texts: readonly string[]): ExtractedOption[] =>
  texts.map((text, index) => ({ letter: LETTERS[index] ?? '', text }));

/** A question SpartBoard has no type for: its prompt, kept as a written question to look at. */
export function placeholderQuestion(
  number: number,
  content: HtmlContent,
  schoologyType: string,
  points?: number
): ExtractedQuestion {
  return {
    number,
    text: content.text,
    type: 'free-response',
    options: [],
    correctAnswer: '',
    imageIds: content.imageUrls,
    ...(points !== undefined ? { points } : {}),
    warnings: [
      `Schoology's "${schoologyType}" question has no match in SpartBoard, so it came in as a written question. Rebuild it or delete it.`,
    ],
  };
}

/** `term:match` pairs; a colon or pipe would break the stored key, so those pairs are left out. */
export function matchingKey(pairs: readonly (readonly [string, string])[]): {
  answer: string;
  warnings: string[];
} {
  const kept: string[] = [];
  const warnings: string[] = [];
  for (const [term, match] of pairs) {
    if (!term || !match) continue;
    if (/[:|]/.test(term) || match.includes('|')) {
      warnings.push(
        `The pair "${term}" contains a colon or a pipe, which this quiz uses to separate pairs, so it was left out. Add it in the editor.`
      );
      continue;
    }
    kept.push(`${term}:${match}`);
  }
  return { answer: kept.join('|'), warnings };
}

/** Ordering items joined with `|`, which can't appear inside one. */
export const orderingKey = (items: readonly string[]): string =>
  items.map((item) => item.replace(/\|/g, '/').trim()).join('|');

/** Gathers the result, numbering questions in order and collecting their pictures. */
export function finishRead(
  title: string,
  questions: ExtractedQuestion[],
  unsupported: number[],
  settings: SchoologyQuizSettings,
  warnings: string[] = []
): SchoologyRead {
  const imageUrls = [...new Set(questions.flatMap((q) => q.imageIds))];
  return {
    quiz: { title, questions, images: [], warnings },
    imageUrls,
    unsupported,
    settings,
  };
}
