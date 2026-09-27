/**
 * The shape both document readers return
 * (docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D1). The review table and the create
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
  /** The number the heading printed, e.g. 2 for "Section 2". */
  sectionNumber?: number;
  /** The paragraph printed between the heading and its first question (E16). */
  sectionDirections?: string;
  /** The item number as printed within its section. */
  item: number;
  /** 'A' / 'B' for a Part A / Part B item. */
  part?: string;
}

/** A key's section: its place among the key's sections, and the number it printed. */
export interface KeySection {
  ordinal: number;
  printed?: number;
}

/** One answer a key gives, before it is matched to a question (R10–R12). */
export interface KeyItem {
  item: number;
  section?: KeySection;
  part?: string;
  /** A letter, `A, C`, True/False, or written text; '' when the key gives none. */
  answer: string;
  /** An ordering answer: the items' text in the right order. */
  ordering?: string[];
  points?: number;
  /** The points are the whole item's, to split between its parts. */
  pointsForItem?: boolean;
  /** The key scores this with a rubric rather than one answer. */
  rubric?: boolean;
  /** The key says the item isn't scored. */
  notScored?: boolean;
  /** A test bank's `OBJ:` and `TOP:` fields (E10). */
  objective?: string;
  topic?: string;
  /** A test bank's `NAT:` and `STA:` codes (E10). */
  standards?: string[];
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
  /** The section's directions as copied to the front of `text`, which a real section takes back (E16). */
  directionsLeadIn?: string;
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
  /** The ExamView section kind that decides how a key applies (QUIZ_EXAMVIEW_IMPORT E5). */
  examView?: ExamViewKind;
  /** ExamView matching items that share one term list (E6). */
  matchingGroup?: string;
  /** The matching group's directions line (E6). */
  matchingDirections?: string;
  /** Matching only: terms no item uses (E6). */
  matchingDistractors?: string[];
  /** Matching only: score each pair (E6). */
  allowPartialCredit?: boolean;
  /** Standard codes a test bank key lists for this item (E10). */
  standardCodes?: string[];
  /** Modified True/False: the key's word that makes a false statement true (E7). */
  correction?: string;
}

/** What an ExamView section heading says its items are (E5). */
export type ExamViewKind =
  | 'mc'
  | 'tf'
  | 'modifiedTf'
  | 'completion'
  | 'numeric'
  | 'matching'
  | 'written';

/** What a key merge did, for the review banner (R13, R19). */
export interface KeySummary {
  source: 'document' | 'file';
  /** Key entries that gave an answer. */
  entries: number;
  /** Entries that found their question. */
  matched: number;
  /** Printed labels of entries with no question, e.g. `2·3`. */
  unmatchedLabels: string[];
  /** Questions where a key file overruled the test's own answer. */
  conflicts: number;
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
  /** The last key merged onto these questions; a key file's wins. */
  keySummary?: KeySummary;
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
