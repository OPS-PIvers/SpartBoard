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
}

/** True when the reader found the question but no answer for it (D5). */
export const questionNeedsKey = (q: ExtractedQuestion): boolean =>
  q.type !== 'free-response' && !q.correctAnswer.trim();
