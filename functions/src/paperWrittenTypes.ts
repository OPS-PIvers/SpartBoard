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
      /** Absent = lines; mirrors root `types.ts`. */
      style?: PaperBoxStyle;
    };

export interface PaperPageMap {
  page: number;
  grid: PaperGrid;
  items: PaperPageItem[];
  /** Item-free page printing a question's prompt; mirrors root `types.ts`. */
  prompt?: string;
}

export type PaperBoxSize = 'S' | 'M' | 'L' | 'full' | number;
export type PaperBoxStyle =
  'lines' | 'blank' | 'graph' | 'coordinate' | 'image';
export type PaperTranscriptState = 'pending' | 'done' | 'blank' | 'image';
export type PaperPrivateStatus =
  'pending' | 'done' | 'failed' | 'blank' | 'over-quota' | 'image';
export type WrittenReturnMode = 'handwriting' | 'typed' | 'both';

export interface PaperPrivateAnswer {
  scanId: string;
  /** The printed seat the `scanId` crop was filed under; `paperSeat` can change on a re-import. */
  seat?: number;
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
  /** A custom image box: graded from the scan, archived but never transcribed. */
  noTranscript?: true;
  updatedAt: number;
}

export type PaperTranscriptionJobStatus =
  'queued' | 'running' | 'done' | 'failed' | 'over-quota' | 'superseded';

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

/** One kept page in the import payload (`paper-kept-pages`); the path is checked against the caller's prefix and scan. */
export interface PaperKeptPagePayload {
  seat: number;
  /** Printed sheet page number, as read from the page's marker. */
  page: number;
  storagePath: string;
  /** The uploaded page's type; absent means WebP. */
  mimeType?: 'image/webp' | 'image/png';
}

/** Request field `importPaperResponsesV1` accepts beside `sheets`; absent imports as before kept pages. */
export interface PaperKeptPagesRequestField {
  pages?: PaperKeptPagePayload[];
}

/** `getPaperPageV1` request: one kept page of one response, session teacher only (K1). */
export interface GetPaperPageRequest {
  sessionId: string;
  responseKey: string;
  page: number;
}

export type PaperPageUnavailableReason =
  'no-page' | 'missing' | 'archiving' | 'deleted' | 'failed' | 'too-large';

export type GetPaperPageResponse =
  | {
      status: 'ready';
      mimeType: 'image/webp' | 'image/png';
      /** Base64 image bytes. */
      data: string;
      source: 'storage' | 'drive';
    }
  | { status: 'not-available'; reason: PaperPageUnavailableReason };

export const PAPER_HANDWRITTEN_FEATURE = 'paper-handwritten-responses';
export const PAPER_KEPT_PAGES_FEATURE = 'paper-kept-pages';
export const PAPER_IMAGE_MARKUP_FEATURE = 'paper-image-markup';
export const PAPER_PAGE_PREFIX = 'paper_pages';
export const PAPER_PAGE_CALLABLE = 'getPaperPageV1';
/** Server-only `users/{uid}/paper_page_scans/{scanId}`: `seats.{seat}` names the response each kept page was recorded on. */
export const PAPER_PAGE_SCANS = 'paper_page_scans';
/** Off: inked boxes import as `image` and teachers grade the crop. */
export const PAPER_HANDWRITING_AI_FEATURE = 'paper-handwriting-ai';
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

export function paperPageStoragePath(
  uid: string,
  scanId: string,
  seat: number,
  page: number
): string {
  return `${PAPER_PAGE_PREFIX}/${uid}/${scanId}/${seat}/${page}.webp`;
}

export function paperPageArtifactId(scanId: string, page: number): string {
  return `pg_${scanId}_${page}`;
}

export function paperPageNumberOf(artifactId: string): number | null {
  const m = /^pg_[A-Za-z0-9-]{1,64}_(\d{1,2})$/.exec(artifactId);
  return m ? Number(m[1]) : null;
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
  if (status === 'image') return 'image';
  return 'pending';
}
