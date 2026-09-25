import type {
  PaperBoxSize,
  PaperPrivateAnswer,
  PaperPrivateStatus,
  PaperTranscriptState,
  QuizResponseAnswer,
  ResponseArtifact,
  WrittenReturnMode,
} from '@/types';

/** Contracts for handwritten paper answers; see docs/plans/QUIZ_PAPER_HANDWRITTEN_RESPONSES.md §3. */
export const PAPER_HANDWRITTEN_FEATURE = 'paper-handwritten-responses';

/** Written lines ruled in each fixed box size; a line is one 8 mm grid row. */
export const PAPER_BOX_LINES: Readonly<
  Record<Exclude<PaperBoxSize, 'full'>, number>
> = {
  S: 3,
  M: 6,
  L: 12,
};
/** Lines on a Full box, which takes a page of its own. */
export const PAPER_FULL_PAGE_LINES = 24;
export const PAPER_WRITTEN_LINE_MM = 8;
/** Rough handwriting density used to size a box from `maxWords`. */
export const PAPER_WORDS_PER_LINE = 10;
export const PAPER_BOX_SIZES: readonly PaperBoxSize[] = ['S', 'M', 'L', 'full'];
export const DEFAULT_PAPER_BOX_SIZE: PaperBoxSize = 'M';

/** Pages a teacher can transcribe per day unless an admin sets another limit. */
export const PAPER_HANDWRITTEN_DEFAULT_DAILY_LIMIT = 300;
export const PAPER_WRITTEN_CROP_PREFIX = 'paper_written_crops';
export const PAPER_WRITTEN_CROP_MIME = 'image/webp';
export const DEFAULT_WRITTEN_RETURN_MODE: WrittenReturnMode = 'handwriting';

export function paperBoxLines(size: PaperBoxSize): number {
  return size === 'full' ? PAPER_FULL_PAGE_LINES : PAPER_BOX_LINES[size];
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

export function isPaperBoxSize(value: unknown): value is PaperBoxSize {
  return (
    typeof value === 'string' &&
    (PAPER_BOX_SIZES as readonly string[]).includes(value)
  );
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

export type PaperWrittenPlaceholder = 'transcribing' | 'blank' | 'unavailable';

export interface PaperWrittenView {
  /** Render the handwriting crop. */
  showCrop: boolean;
  crop: ResponseArtifact | null;
  /** Sanitized HTML to render as the typed answer; null renders none. */
  transcript: string | null;
  /** Shown in place of whichever part cannot render yet. */
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
  if (wantsCrop && !crop && placeholder === null) {
    placeholder = 'unavailable';
  }
  return {
    showCrop: wantsCrop && crop !== null,
    crop: wantsCrop ? crop : null,
    transcript,
    placeholder,
  };
}
