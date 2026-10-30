import type {
  PaperBoxSize,
  QuizQuestion,
  PaperPrivateAnswer,
  PaperPrivateStatus,
  PaperTranscriptState,
  QuizResponseAnswer,
  ResponseArtifact,
  WrittenReturnMode,
} from '@/types';

/** Contracts for handwritten paper answers; see docs/plans/shipped/QUIZ_PAPER_HANDWRITTEN_RESPONSES.md §3. */
export const PAPER_HANDWRITTEN_FEATURE = 'paper-handwritten-responses';

/** Written lines ruled in each named box size; a line is one 8 mm grid row. L is kept for quizzes saved before custom sizes. */
export const PAPER_BOX_LINES: Readonly<
  Record<Exclude<PaperBoxSize, 'full' | number>, number>
> = {
  S: 3,
  M: 8,
  L: 12,
};
/** Lines on a Full box, which takes a page of its own. */
export const PAPER_FULL_PAGE_LINES = 24;
export const PAPER_WRITTEN_LINE_MM = 8;
/** Rough handwriting density used to size a box from `maxWords`. */
export const PAPER_WORDS_PER_LINE = 10;
export const DEFAULT_PAPER_BOX_SIZE: PaperBoxSize = 'M';
/** Custom line counts a teacher can pick; a full page is 24. */
export const PAPER_CUSTOM_MIN_LINES = 1;
export const PAPER_CUSTOM_MAX_LINES = PAPER_FULL_PAGE_LINES;

/** Pages a teacher can transcribe per day unless an admin sets another limit. */
export const PAPER_HANDWRITTEN_DEFAULT_DAILY_LIMIT = 300;
export const PAPER_WRITTEN_CROP_PREFIX = 'paper_written_crops';
export const PAPER_WRITTEN_CROP_MIME = 'image/webp';
export const DEFAULT_WRITTEN_RETURN_MODE: WrittenReturnMode = 'handwriting';

export function paperBoxLines(size: PaperBoxSize): number {
  if (typeof size === 'number') return size;
  return size === 'full' ? PAPER_FULL_PAGE_LINES : PAPER_BOX_LINES[size];
}

/** A Full box, or a custom one as tall as a page, takes a page of its own. */
export function isFullPageBox(size: PaperBoxSize): boolean {
  return size === 'full' || paperBoxLines(size) >= PAPER_FULL_PAGE_LINES;
}

/** Smallest box that fits `maxWords` at about ten words a line; M when no limit is set. */
export function defaultPaperBoxSize(maxWords?: number): PaperBoxSize {
  if (!maxWords || !Number.isFinite(maxWords) || maxWords <= 0) {
    return DEFAULT_PAPER_BOX_SIZE;
  }
  const lines = Math.ceil(maxWords / PAPER_WORDS_PER_LINE);
  if (lines <= PAPER_BOX_LINES.S) return 'S';
  if (lines <= PAPER_BOX_LINES.M) return 'M';
  if (lines <= PAPER_BOX_LINES.L) return 'L';
  return 'full';
}

/** The box a free-response question prints with: its saved size, else one sized from its word limit. */
export function paperBoxSizeOf(
  question: Pick<QuizQuestion, 'paperBoxSize' | 'maxWords'>
): PaperBoxSize {
  return isPaperBoxSize(question.paperBoxSize)
    ? question.paperBoxSize
    : defaultPaperBoxSize(question.maxWords);
}

/** Questions with the print dialog's box sizes applied; untouched when there are none. */
export function withPaperBoxSizes<T extends { questions: QuizQuestion[] }>(
  holder: T,
  sizes: Readonly<Record<string, PaperBoxSize>>
): T {
  if (Object.keys(sizes).length === 0) return holder;
  return {
    ...holder,
    questions: holder.questions.map((q) =>
      sizes[q.id] ? { ...q, paperBoxSize: sizes[q.id] } : q
    ),
  };
}

export function isPaperBoxSize(value: unknown): value is PaperBoxSize {
  if (typeof value === 'number') {
    return (
      Number.isInteger(value) &&
      value >= PAPER_CUSTOM_MIN_LINES &&
      value <= PAPER_CUSTOM_MAX_LINES
    );
  }
  return value === 'S' || value === 'M' || value === 'L' || value === 'full';
}

/** `paper_written_crops/{uid}/{scanId}/{seat}/{questionId}.webp` */
export function paperCropStoragePath(
  uid: string,
  scanId: string,
  seat: number,
  questionId: string
): string {
  return `${PAPER_WRITTEN_CROP_PREFIX}/${uid}/${scanId}/${seat}/${questionId}.webp`;
}

/** `{scanId}_{seat}_{page}_{attempt}`; a retry mints a new id so the create trigger fires. */
export function paperTranscriptionJobId(
  scanId: string,
  seat: number,
  page: number,
  attempt: number
): string {
  return `${scanId}_${seat}_${page}_${attempt}`;
}

/** Failures and quota stops read publicly as still pending. */
export function publicTranscriptState(
  status: PaperPrivateStatus
): PaperTranscriptState {
  if (status === 'done') return 'done';
  if (status === 'blank') return 'blank';
  return 'pending';
}

const PRIVATE_TRANSITIONS: Readonly<
  Record<PaperPrivateStatus, readonly PaperPrivateStatus[]>
> = {
  pending: ['done', 'failed', 'over-quota'],
  failed: ['pending'],
  'over-quota': ['pending'],
  blank: ['pending'],
  done: [],
};

/** Allowed status moves within one scan; a new `scanId` replaces the doc outright. */
export function canTransitionPaperPrivate(
  from: PaperPrivateStatus,
  to: PaperPrivateStatus
): boolean {
  return PRIVATE_TRANSITIONS[from].includes(to);
}

export function isPaperWrittenAnswer(
  answer: Pick<QuizResponseAnswer, 'paperTranscript' | 'artifacts'>
): boolean {
  return (
    answer.paperTranscript !== undefined ||
    (answer.artifacts ?? []).some((a) => a.kind === 'handwriting')
  );
}

/** A pending transcript is awaiting grade, never a 0. */
export function isPaperTranscriptPending(
  answer: Pick<QuizResponseAnswer, 'paperTranscript'>
): boolean {
  return answer.paperTranscript === 'pending';
}

export function handwritingArtifact(
  answer: Pick<QuizResponseAnswer, 'artifacts'>
): ResponseArtifact | null {
  return (answer.artifacts ?? []).find((a) => a.kind === 'handwriting') ?? null;
}

export type PaperWrittenPlaceholder = 'transcribing' | 'blank';

export interface PaperWrittenView {
  /** Render the handwriting crop. */
  showCrop: boolean;
  crop: ResponseArtifact | null;
  /** The mode asks for handwriting but no crop exists. */
  cropUnavailable: boolean;
  /** Sanitized HTML to render as the typed answer; null renders none. */
  transcript: string | null;
  /** Shown in the typed-answer slot while no transcript can render. */
  placeholder: PaperWrittenPlaceholder | null;
}

/** What to render for one written answer in a given return mode. */
export function paperWrittenView(
  answer: Pick<QuizResponseAnswer, 'answer' | 'paperTranscript' | 'artifacts'>,
  privateDoc: Pick<PaperPrivateAnswer, 'status'> | null,
  mode: WrittenReturnMode
): PaperWrittenView {
  const crop = handwritingArtifact(answer);
  if (!isPaperWrittenAnswer(answer)) {
    return {
      showCrop: false,
      crop: null,
      cropUnavailable: false,
      transcript: answer.answer,
      placeholder: null,
    };
  }
  const state: PaperTranscriptState = privateDoc
    ? publicTranscriptState(privateDoc.status)
    : (answer.paperTranscript ?? 'pending');
  const wantsCrop = mode !== 'typed';
  const wantsText = mode !== 'handwriting';

  let transcript: string | null = null;
  let placeholder: PaperWrittenPlaceholder | null = null;
  if (wantsText) {
    if (state === 'pending') placeholder = 'transcribing';
    else if (state === 'blank') placeholder = 'blank';
    else transcript = answer.answer;
  }
  return {
    showCrop: wantsCrop && crop !== null,
    crop: wantsCrop ? crop : null,
    cropUnavailable: wantsCrop && crop === null,
    transcript,
    placeholder,
  };
}
