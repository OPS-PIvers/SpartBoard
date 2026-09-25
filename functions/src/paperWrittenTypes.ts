// Server mirror of the handwritten-answer contracts in `types.ts` and `utils/paperWritten.ts`.

export type PaperGrid = 1 | 2 | 'questions';

export interface PaperPointMm {
  x: number;
  y: number;
}

export interface PaperRectMm {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PaperPageItem =
  | {
      kind: 'mc';
      questionId: string;
      sheetRow: number;
      label: string;
      originMm: PaperPointMm;
    }
  | {
      kind: 'written';
      questionId: string;
      label: string;
      headerMm: PaperRectMm;
      boxMm: PaperRectMm;
      lines: number;
    };

export interface PaperPageMap {
  page: number;
  grid: PaperGrid;
  items: PaperPageItem[];
}

export type PaperBoxSize = 'S' | 'M' | 'L' | 'full';
export type PaperTranscriptState = 'pending' | 'done' | 'blank';
export type PaperPrivateStatus =
  | 'pending'
  | 'done'
  | 'failed'
  | 'blank'
  | 'over-quota';
export type WrittenReturnMode = 'handwriting' | 'typed' | 'both';

export interface PaperPrivateAnswer {
  scanId: string;
  status: PaperPrivateStatus;
  rawTranscript?: string;
  uncertainSpans?: { start: number; end: number }[];
  illegibleCount?: number;
  attempts: number;
  lastError?: string;
  charged: boolean;
  editedBy?: string;
  editedAt?: number;
  /** A rescan whose box was not applied because this answer was graded or edited (D28). */
  newerScan?: { scanId: string; page: number; state: 'ink' | 'blank' };
  updatedAt: number;
}

export type PaperTranscriptionJobStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'over-quota'
  | 'superseded';

export interface PaperTranscriptionJob {
  sessionId: string;
  responseKey: string;
  scanId: string;
  page: number;
  boxes: { questionId: string; storagePath: string }[];
  status: PaperTranscriptionJobStatus;
  attempt: number;
  leaseUntil?: number;
  charged: boolean;
  createdAt: number;
  updatedAt: number;
}

/** One written box on an imported sheet (payload v2). */
export interface PaperWrittenPayloadBox {
  questionId: string;
  page: number;
  state: 'ink' | 'blank';
  storagePath: string;
}

/** Result fields `importPaperResponsesV1` adds for v2 imports. */
export interface PaperWrittenImportResult {
  keptWritten: { seat: number; questionId: string }[];
  jobsCreated: number;
  pagesQueued: number;
  pagesOverQuota: number;
}

export const PAPER_HANDWRITTEN_FEATURE = 'paper-handwritten-responses';
export const PAPER_HANDWRITTEN_DEFAULT_DAILY_LIMIT = 300;
export const PAPER_WRITTEN_CROP_PREFIX = 'paper_written_crops';
export const PAPER_TRANSCRIPTION_JOBS = 'paper_transcription_jobs';
export const PAPER_PRIVATE_SUBCOLLECTION = 'paperPrivate';

export function paperCropStoragePath(
  uid: string,
  scanId: string,
  seat: number,
  questionId: string
): string {
  return `${PAPER_WRITTEN_CROP_PREFIX}/${uid}/${scanId}/${seat}/${questionId}.webp`;
}

export function paperTranscriptionJobId(
  scanId: string,
  seat: number,
  page: number,
  attempt: number
): string {
  return `${scanId}_${seat}_${page}_${attempt}`;
}

export function publicTranscriptState(
  status: PaperPrivateStatus
): PaperTranscriptState {
  if (status === 'done') return 'done';
  if (status === 'blank') return 'blank';
  return 'pending';
}
