/**
 * The shape both document readers return
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D1). The review table and the create
 * step work off this alone, so they never need to know whether the browser
 * reader or the AI reader produced it.
 */

import type { QuizQuestionType } from '@/types';

/** One line of a document, with the little formatting the parser cares about. */
export interface DocLine {
  text: string;
  /**
   * The line was bold, underlined or highlighted. Only meaningful on an
   * option line, where it is how a teacher marks the answer in Word.
   */
  emphasized?: boolean;
  /** 1-based page the line came from; PDFs only. */
  page?: number;
  /** Ids of pictures anchored to this line, into `ExtractedQuiz.images`. */
  imageIds?: string[];
}

/** An answer choice as the document wrote it. */
export interface ExtractedOption {
  /** The letter as printed, uppercased: A–F. */
  letter: string;
  text: string;
}

/** A picture lifted out of the document, not yet uploaded anywhere. */
export interface ExtractedImage {
  /** Stable within one extraction; questions point at it by id. */
  id: string;
  blob: Blob;
  contentType: string;
  /** Name inside the document archive, used as the stimulus label. */
  name: string;
}

export interface ExtractedQuestion {
  /** The number as printed, 1-based. */
  number: number;
  text: string;
  type: QuizQuestionType;
  /** Empty for anything that isn't multiple choice. */
  options: ExtractedOption[];
  /** The answer text, or '' when the document never gave one. */
  correctAnswer: string;
  /** Pictures this question uses, by `ExtractedImage.id`. */
  imageIds: string[];
  /** Row notes for the review table; never fatal. */
  warnings: string[];
}

export interface ExtractedQuiz {
  /** Defaults to the document's name (D11). */
  title: string;
  questions: ExtractedQuestion[];
  images: ExtractedImage[];
  /** Notes about the document as a whole. */
  warnings: string[];
  /** Which reader ran; set only for a teacher who has AI access. */
  readBy?: 'ai' | 'plain';
}

/** The neutral status line naming the reader, or '' when there is none. */
export const readByLabel = (readBy: ExtractedQuiz['readBy']): string =>
  readBy === 'ai'
    ? 'Read with AI.'
    : readBy === 'plain'
      ? 'Read without AI.'
      : '';

/** True when the reader found the question but no answer for it (D5). */
export const questionNeedsKey = (q: ExtractedQuestion): boolean =>
  q.type !== 'free-response' && !q.correctAnswer.trim();

/** An option as a choose-all key part; `|` separates the parts, so it can't appear inside one. */
export const multiAnswerPart = (text: string): string =>
  text.replace(/\|/g, '/').trim();

/** The `|`-joined key `QuizQuestion` stores for choose-all-that-apply. */
export const multiAnswerKey = (texts: readonly string[]): string =>
  texts.map(multiAnswerPart).filter(Boolean).join('|');

/** "Select all that apply" and its cousins, in a question's own wording. */
export const SELECT_ALL_WORDING =
  /\b(?:select|choose|mark|check|circle|pick|identify|click)\s+(?:all|each|every)\b|\ball\s+(?:that|which)\s+apply\b|\bmore\s+than\s+one\s+(?:correct\s+)?(?:answer|choice|option)\b/i;

/** Reader switches; `multiAnswer` lets a read produce choose-all-that-apply questions. */
export interface ReaderOptions {
  multiAnswer?: boolean;
}
