// Kept scan pages for Results print (docs/plans/QUIZ_PAPER_KEPT_PAGES.md §3.2, K8, K19).
import type {
  ArtifactArchiveEntry,
  QuizResponse,
  ResponseArtifact,
} from '@/types';
import { paperCropSource } from './paperCropFetch';
import { keptPageArtifact, type GetPaperPageCall } from './paperWritten';

/** One kept page a print asks for. */
export interface KeptPageRef {
  responseKey: string;
  /** Printed page number, as in the artifact id `pg_{scanId}_{page}`. */
  page: number;
  artifact: ResponseArtifact;
  archive?: ArtifactArchiveEntry;
}

/** Scan id inside a kept page's artifact id. */
export function keptPageScanId(artifactId: string): string | null {
  return /^pg_([A-Za-z0-9-]{1,64})_\d{1,2}$/.exec(artifactId)?.[1] ?? null;
}

/** The scans a response's written paper answers came from. */
function answerScanIds(response: Pick<QuizResponse, 'answers'>): Set<string> {
  const out = new Set<string>();
  for (const a of response.answers ?? []) {
    if (a.paperScanId) out.add(a.paperScanId);
  }
  return out;
}

/** The kept pages to load for these printed page numbers: only pages in `paperPages`, and only the answers' own scan. */
export function keptPageRefs(
  response: Pick<QuizResponse, 'paperPages' | 'answers' | 'artifactArchive'>,
  responseKey: string,
  pages: readonly number[]
): KeptPageRef[] {
  if (!response.paperPages?.length) return [];
  const scans = answerScanIds(response);
  const out: KeptPageRef[] = [];
  for (const page of pages) {
    const artifact = keptPageArtifact(response, page);
    if (!artifact) continue;
    // A page from another scan than the graded answers would show different work.
    if (scans.size > 0) {
      const scan = keptPageScanId(artifact.id);
      if (!scan || scans.size > 1 || !scans.has(scan)) continue;
    }
    const archive = response.artifactArchive?.[artifact.id];
    out.push({
      responseKey,
      page,
      artifact,
      ...(archive ? { archive } : {}),
    });
  }
  return out;
}

/** Loads one kept page as a Blob; null whenever it can't, so one page never fails the print. */
export type KeptPageLoader = (
  sessionId: string,
  ref: KeptPageRef
) => Promise<Blob | null>;

export interface KeptPageLoaderDeps {
  callPage: GetPaperPageCall;
  /** Owner-authenticated Drive read of an archived page. */
  fetchDriveBlob?: (driveFileId: string) => Promise<Blob>;
  /** Told about each page that could not load; never shown to the teacher. */
  onFailure?: (ref: KeptPageRef, err: unknown) => void;
}

function base64Blob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Drive first once archived, else `getPaperPageV1`; a refusal (a teammate, the flag off) is a missing page. */
export function createKeptPageLoader(deps: KeptPageLoaderDeps): KeptPageLoader {
  return async (sessionId, ref) => {
    const source = paperCropSource(ref.artifact, ref.archive);
    if (source === null) return null;
    const driveFileId = ref.archive?.driveFileId;
    if (source === 'drive' && driveFileId && deps.fetchDriveBlob) {
      try {
        return await deps.fetchDriveBlob(driveFileId);
      } catch {
        // A lapsed grant or a moved file; the server can still read it.
      }
    }
    try {
      const res = await deps.callPage({
        sessionId,
        responseKey: ref.responseKey,
        page: ref.page,
      });
      return res.status === 'ready' ? base64Blob(res.data, res.mimeType) : null;
    } catch (err) {
      deps.onFailure?.(ref, err);
      return null;
    }
  };
}

/** A Drive reader that hands back object URLs, turned into one that hands back Blobs. */
export function driveBlobReader(
  resolveDriveFile: (driveFileId: string) => Promise<string>
): (driveFileId: string) => Promise<Blob> {
  return async (driveFileId) => {
    const url = await resolveDriveFile(driveFileId);
    try {
      return await (await fetch(url)).blob();
    } finally {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
  };
}

/** Parallel page loads, so a class set does not flood the callable. */
export const KEPT_PAGE_FETCH_LIMIT = 4;

/** Loads every ref with bounded concurrency, reporting each as it lands; stops early when `cancelled` turns true. */
export async function fetchKeptPages(
  sessionId: string,
  refs: readonly KeptPageRef[],
  load: KeptPageLoader,
  onPage: (ref: KeptPageRef, blob: Blob | null) => void,
  opts: { limit?: number; cancelled?: () => boolean } = {}
): Promise<void> {
  const queue = [...refs];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      if (opts.cancelled?.()) return;
      let blob: Blob | null = null;
      try {
        blob = await load(sessionId, next);
      } catch {
        blob = null;
      }
      if (opts.cancelled?.()) return;
      onPage(next, blob);
    }
  };
  const limit = Math.max(1, opts.limit ?? KEPT_PAGE_FETCH_LIMIT);
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, worker)
  );
}
