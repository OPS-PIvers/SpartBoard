/**
 * The shape both document readers return
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D1). The review table and the create
 * step work off this alone, so they never need to know whether the browser
 * reader or the AI reader produced it.
 */

import type { QuizQuestionType } from '@/types';

/** One column-separated piece of a line: a table cell, a tab stop, or a PDF x-gap. */
export interface DocSegment {
  text: string;
  /** Left edge in PDF points (or scaled OCR pixels); absent for Word and RTF. */
  x?: number;
  /** Right edge in the same units as `x`. */
  xEnd?: number;
  /** Bold, underlined or highlighted somewhere in this segment. */
  emphasized?: boolean;
}

/** One line of a document, with the little formatting the parser cares about. */
export interface DocLine {
  /** The segments joined by a single space. */
  text: string;
  /** Present when the line had a column gap; absent means one segment holding `text`. */
  segments?: DocSegment[];
  /**
   * The line was bold, underlined or highlighted. Only meaningful on an
   * option line, where it is how a teacher marks the answer in Word.
   */
  emphasized?: boolean;
  /** 1-based page the line came from; PDFs only. */
  page?: number;
  /** Baseline in points up from the page bottom; PDFs only. */
  y?: number;
  /** Ids of pictures anchored to this line, into `ExtractedQuiz.images`. */
  imageIds?: string[];
}

/** A line's segments, or the whole line as one segment when it had no gap. */
export const lineSegments = (line: DocLine): DocSegment[] =>
  line.segments ?? [
    {
      text: line.text,
      ...(line.emphasized ? { emphasized: true } : {}),
    },
  ];

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

/** Where a question sat in the printed test, for matching a key to it (R7). */
export interface QuestionRef {
  /** 1-based, counting only sections that hold questions. */
  section: number;
  /** The section heading as printed, e.g. "Section 2". */
  sectionName?: string;
  /** The item number as printed within its section. */
  item: number;
  /** 'A' / 'B' for a Part A / Part B item. */
  part?: string;
}

/** A learning target the test printed ("ELT 1.1 - I can …"), offered in review (R9, R20). */
export interface SuggestedTarget {
  code?: string;
  label: string;
}

/** Text several questions share, becoming one `text` stimulus (R25). */
export interface ExtractedText {
  id: string;
  text: string;
  label: string;
}

export interface ExtractedQuestion {
  /** Position in the quiz, 1-based; the printed number lives in `ref`. */
  number: number;
  /** Where the test printed it; absent when a reader doesn't know. */
  ref?: QuestionRef;
  /** The printed number, set only when it differs from `number` (R23). */
  sourceLabel?: string;
  /** Point value, when the key or test gave one (R12). */
  points?: number;
  suggestedTarget?: SuggestedTarget;
  /** Why the row should start unticked in review, e.g. a survey item (R9). */
  suggestUntick?: string;
  /** A shared lead-in or passage, by `ExtractedText.id` (R25). */
  sharedTextId?: string;
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
  /** Shared passages and lead-ins (R25). */
  texts?: ExtractedText[];
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
  q.type !== 'free-response' &&
  // An unkeyed ordering item comes in as a written response (see toQuizData).
  q.type !== 'Ordering' &&
  !q.correctAnswer.trim();

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
