// Weekly sweep of Guided Learning uploads nothing references (GUIDED_LEARNING_STUDIO.md P5-3).
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import {
  GL_MEDIA_MARKER,
  isGlMediaPath,
  loadAllReferences,
} from './glMediaReferences';
import './functionsInit';

export const SWEEP_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const SWEEP_MAX_DELETES = 200;
const LIST_PAGE = 1000;
const GL_MEDIA_GLOB = 'users/*/hotspot_images/**';

type Bucket = ReturnType<ReturnType<typeof admin.storage>['bucket']>;

interface ListedFile {
  name: string;
  metadata: { timeCreated?: string; metadata?: Record<string, unknown> };
}

export interface SweepResult {
  candidates: number;
  deleted: string[];
}

// Only files a GL upload marked, older than the grace window; unmarked legacy files are never swept.
function isCandidate(file: ListedFile, cutoff: number): boolean {
  if (!isGlMediaPath(file.name)) return false;
  if (file.metadata.metadata?.[GL_MEDIA_MARKER] !== '1') return false;
  const created = Date.parse(file.metadata.timeCreated ?? '');
  return Number.isFinite(created) && created < cutoff;
}

async function listCandidates(
  bucket: Bucket,
  cutoff: number
): Promise<string[]> {
  const found: string[] = [];
  let pageToken: string | undefined;
  do {
    const [files, next] = await bucket.getFiles({
      matchGlob: GL_MEDIA_GLOB,
      maxResults: LIST_PAGE,
      autoPaginate: false,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const file of files as unknown as ListedFile[]) {
      if (isCandidate(file, cutoff)) found.push(file.name);
    }
    pageToken = (next as { pageToken?: string } | null)?.pageToken;
  } while (pageToken);
  return found;
}

export async function runGlMediaSweep(
  db: admin.firestore.Firestore,
  bucket: Bucket,
  now: number = Date.now()
): Promise<SweepResult> {
  const candidates = await listCandidates(bucket, now - SWEEP_MIN_AGE_MS);
  if (candidates.length === 0) return { candidates: 0, deleted: [] };
  // Throws on a failed scan, so a partial reference picture never deletes anything.
  const refs = await loadAllReferences(db);
  const deleted: string[] = [];
  for (const path of candidates) {
    if (deleted.length >= SWEEP_MAX_DELETES) break;
    if (refs.has(path)) continue;
    try {
      await bucket.file(path).delete({ ignoreNotFound: true });
      deleted.push(path);
      logger.info('[glMediaSweep] deleted unreferenced GL file', { path });
    } catch (err) {
      logger.warn('[glMediaSweep] delete failed', { path, err });
    }
  }
  return { candidates: candidates.length, deleted };
}

export const gcGuidedLearningMediaSweep = onSchedule(
  {
    // Sundays 03:30 America/Chicago, outside classroom hours.
    schedule: '30 3 * * 0',
    timeZone: 'America/Chicago',
    memory: '512MiB',
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async () => {
    const result = await runGlMediaSweep(
      admin.firestore(),
      admin.storage().bucket()
    );
    logger.info('[glMediaSweep] done', {
      candidates: result.candidates,
      deleted: result.deleted.length,
    });
  }
);
