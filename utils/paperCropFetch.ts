import type { ArtifactArchiveEntry, ResponseArtifact } from '@/types';
import type { TakeUrlResolver } from '@/utils/quizMediaPlayback';

/** Key for a response's `paperPrivate/{questionId}` record in lookup maps. */
export const paperPrivateKey = (responseKey: string, questionId: string) =>
  `${responseKey}::${questionId}`;

/** One written answer's crop on a session; the grader and the add-on grader ask by this. */
export interface PaperCropRequest {
  sessionId: string;
  responseKey: string;
  questionId: string;
  artifact: ResponseArtifact | null;
  archive?: ArtifactArchiveEntry;
  /** `'newer'` previews a kept answer's unapplied rescan. */
  scan?: 'current' | 'newer';
}

/** A displayable image URL; `blob:` URLs must be revoked by the caller. */
export type PaperCropResolver = (req: PaperCropRequest) => Promise<string>;

export type PaperCropUnavailableReason =
  | 'no-crop'
  | 'missing'
  | 'archiving'
  | 'deleted'
  | 'failed'
  | 'too-large';

export class PaperCropUnavailableError extends Error {
  constructor(readonly reason: PaperCropUnavailableReason) {
    super(`paper-crop-unavailable:${reason}`);
    this.name = 'PaperCropUnavailableError';
  }
}

export type GetPaperWrittenCropRequest =
  | { storagePath: string }
  | {
      sessionId: string;
      responseKey: string;
      questionId: string;
      scan?: 'current' | 'newer';
    };

export type GetPaperWrittenCropResponse =
  | {
      status: 'ready';
      mimeType: 'image/webp' | 'image/png';
      data: string;
      source: 'storage' | 'drive';
    }
  | { status: 'not-available'; reason: PaperCropUnavailableReason };

export type GetPaperWrittenCropCall = (
  req: GetPaperWrittenCropRequest
) => Promise<GetPaperWrittenCropResponse>;

export const PAPER_CROP_CALLABLE = 'getPaperWrittenCropV1';

export function cropDataUrl(
  res: GetPaperWrittenCropResponse
): string | PaperCropUnavailableError {
  if (res.status === 'ready') return `data:${res.mimeType};base64,${res.data}`;
  return new PaperCropUnavailableError(res.reason);
}

/** Where the browser should look first; `null` when the crop is gone for good. */
export function paperCropSource(
  artifact: ResponseArtifact | null,
  archive: ArtifactArchiveEntry | undefined
): 'drive' | 'callable' | null {
  if (!artifact) return null;
  const status = archive?.archiveStatus;
  if (status === 'deleted' || status === 'deleting' || status === 'lost')
    return null;
  if (status === 'archived' && archive?.driveFileId) return 'drive';
  return 'callable';
}

export interface PaperCropResolverDeps {
  /** Owner-authenticated Drive fetch (D35); the audio take resolver works unchanged. */
  resolveDriveFile?: TakeUrlResolver;
  callCrop: GetPaperWrittenCropCall;
}

/** Drive first once archived, the owner-only callable before that or when Drive fails. */
export function createPaperCropResolver(
  deps: PaperCropResolverDeps
): PaperCropResolver {
  const viaCallable = async (req: PaperCropRequest) => {
    const out = cropDataUrl(
      await deps.callCrop({
        sessionId: req.sessionId,
        responseKey: req.responseKey,
        questionId: req.questionId,
        ...(req.scan === 'newer' ? { scan: 'newer' as const } : {}),
      })
    );
    if (out instanceof PaperCropUnavailableError) throw out;
    return out;
  };
  return async (req) => {
    if (req.scan === 'newer') return viaCallable(req);
    const source = paperCropSource(req.artifact, req.archive);
    if (source === null)
      throw new PaperCropUnavailableError(req.artifact ? 'deleted' : 'no-crop');
    const driveFileId = req.archive?.driveFileId;
    if (source === 'drive' && driveFileId && deps.resolveDriveFile) {
      try {
        return await deps.resolveDriveFile(driveFileId);
      } catch {
        // A lapsed grant or a moved file; the server can still read it.
      }
    }
    return viaCallable(req);
  };
}

interface AnswerRef {
  sessionId: string;
  responseKey: string;
  questionId: string;
}

/** The 3A/2E teacher callables the crop panel drives. */
export interface PaperWrittenActions {
  updateTranscript: (
    req: AnswerRef & {
      text: string;
      expectedScanId?: string;
      confirmSnapshotRewrite?: boolean;
    }
  ) => Promise<{ answer: string; snapshotRewritten: boolean }>;
  applyNewerScan: (
    req: AnswerRef
  ) => Promise<{ scanId: string; paperTranscript: 'pending' | 'blank' }>;
  transcribeBlank: (req: AnswerRef) => Promise<unknown>;
  retry: (req: AnswerRef) => Promise<unknown>;
}

export const PAPER_WRITTEN_CALLABLES = {
  updateTranscript: 'updatePaperTranscriptV1',
  applyNewerScan: 'applyPaperNewerScanV1',
  transcribeBlank: 'transcribePaperBlankV1',
  retry: 'retryPaperTranscriptionV1',
} as const;

/** `updatePaperTranscriptV1` refuses until the teacher confirms dropping highlights. */
export function needsSnapshotConfirm(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; details?: { reason?: string } };
  return (
    (e.code === 'functions/failed-precondition' ||
      e.code === 'failed-precondition') &&
    e.details?.reason === 'confirm-snapshot-rewrite'
  );
}

/** A rescan landed between loading the answer and saving the edit. */
export function isScanSuperseded(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'functions/aborted' || code === 'aborted';
}

/** Plain text for the edit box: one blank line between paragraphs. */
export function transcriptHtmlToEditText(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = Array.from(doc.body.querySelectorAll('p'));
  const parts =
    blocks.length > 0
      ? blocks.map((p) => p.textContent ?? '')
      : [doc.body.textContent ?? ''];
  return parts
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n');
}

export interface UncertainSnippet {
  before: string;
  flagged: string;
  after: string;
}

const CONTEXT_WORDS = 3;

/** Each uncertain span with a few words either side, for the "Check transcript" list. */
export function uncertainSnippets(
  raw: string | undefined,
  spans: { start: number; end: number }[] | undefined
): UncertainSnippet[] {
  if (!raw || !spans?.length) return [];
  return [...spans]
    .filter((s) => s.start >= 0 && s.end > s.start && s.start < raw.length)
    .sort((a, b) => a.start - b.start)
    .map(({ start, end }) => {
      const stop = Math.min(end, raw.length);
      const before = raw.slice(0, start).split(/\s+/);
      const after = raw.slice(stop).split(/\s+/);
      const lead = before.slice(-CONTEXT_WORDS - 1).join(' ');
      const tail = after.slice(0, CONTEXT_WORDS + 1).join(' ');
      return {
        before: before.length > CONTEXT_WORDS + 1 ? `…${lead}` : lead,
        flagged: raw.slice(start, stop),
        after: after.length > CONTEXT_WORDS + 1 ? `${tail}…` : tail,
      };
    });
}
