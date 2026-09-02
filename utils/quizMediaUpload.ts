import { ref, uploadBytesResumable } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { storage, functions } from '@/config/firebase';
import type { ArtifactUploadState } from '@/types';

/** Transit-buffer root; must match `storage.rules` and the archival callable. */
export const QUIZ_MEDIA_STORAGE_ROOT = 'quiz_response_media';
/** Mirrors the `storage.rules` cap so the client fails fast, not at the rule. */
export const MAX_QUIZ_MEDIA_BYTES = 5 * 1024 * 1024;

/** Record whatever `MediaRecorder` natively produced; never hardcode a type. */
export function quizMediaExtensionForMimeType(mimeType: string): string {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase();
  switch (base) {
    case 'audio/webm':
      return 'webm';
    case 'audio/ogg':
    case 'audio/opus':
      return 'ogg';
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'm4a';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    default:
      return 'audio';
  }
}

/** Keyed by response key, not auth uid, so `storage.rules` can prove ownership. */
export function buildQuizMediaStoragePath(
  sessionId: string,
  responseKey: string,
  artifactId: string,
  mimeType: string
): string {
  const ext = quizMediaExtensionForMimeType(mimeType);
  return `${QUIZ_MEDIA_STORAGE_ROOT}/${sessionId}/${responseKey}/${artifactId}.${ext}`;
}

export interface QuizMediaUploadJob {
  sessionId: string;
  studentUid: string;
  responseKey: string;
  questionId: string;
  artifactId: string;
  blob: Blob;
  mimeType: string;
}

export interface QuizMediaUploadResult {
  storagePath: string;
  uploadState: ArtifactUploadState;
  driveFileId?: string;
  error?: string;
}

export interface QuizMediaUploadDeps {
  uploadBlob: (
    storagePath: string,
    blob: Blob,
    mimeType: string
  ) => Promise<void>;
  archiveArtifact: (
    job: QuizMediaUploadJob
  ) => Promise<{ driveFileId: string }>;
}

const defaultDeps: QuizMediaUploadDeps = {
  uploadBlob: async (storagePath, blob, mimeType) => {
    const task = uploadBytesResumable(ref(storage, storagePath), blob, {
      contentType: mimeType,
    });
    await new Promise<void>((resolve, reject) => {
      task.on('state_changed', undefined, reject, resolve);
    });
  },
  archiveArtifact: async (job) => {
    const callable = httpsCallable<
      {
        sessionId: string;
        responseKey: string;
        questionId: string;
        artifactId: string;
      },
      { archiveStatus: 'archived'; driveFileId: string }
    >(functions, 'archiveQuizMediaArtifact');
    const result = await callable({
      sessionId: job.sessionId,
      responseKey: job.responseKey,
      questionId: job.questionId,
      artifactId: job.artifactId,
    });
    return { driveFileId: result.data.driveFileId };
  },
};

// One in-order chain per (session, student): take n must not race take n+1.
const uploadChains = new Map<string, Promise<unknown>>();

/** Test-only reset; production never needs to clear a live chain. */
export function __resetQuizMediaUploadQueue(): void {
  uploadChains.clear();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Upload failed';
}

async function runUpload(
  job: QuizMediaUploadJob,
  deps: QuizMediaUploadDeps
): Promise<QuizMediaUploadResult> {
  const storagePath = buildQuizMediaStoragePath(
    job.sessionId,
    job.responseKey,
    job.artifactId,
    job.mimeType
  );
  if (job.blob.size > MAX_QUIZ_MEDIA_BYTES) {
    return {
      storagePath,
      uploadState: 'failed',
      error: 'Recording exceeds the 5 MB limit.',
    };
  }
  try {
    await deps.uploadBlob(storagePath, job.blob, job.mimeType);
  } catch (error) {
    return { storagePath, uploadState: 'failed', error: errorMessage(error) };
  }

  // One automatic archive retry; anything past that is the sweep's problem and
  // the student keeps seeing the question as not yet submitted.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { driveFileId } = await deps.archiveArtifact(job);
      return { storagePath, uploadState: 'uploaded', driveFileId };
    } catch (error) {
      if (attempt === 1) {
        return {
          storagePath,
          uploadState: 'failed',
          error: errorMessage(error),
        };
      }
    }
  }
  return { storagePath, uploadState: 'failed', error: 'Archive failed.' };
}

/**
 * Uploads one committed take and archives it, serialized behind any earlier
 * take for the same student+session. Never throws — the caller persists the
 * returned `uploadState` onto the artifact.
 */
export function enqueueQuizMediaUpload(
  job: QuizMediaUploadJob,
  deps: QuizMediaUploadDeps = defaultDeps
): Promise<QuizMediaUploadResult> {
  const key = `${job.sessionId}:${job.studentUid}`;
  const previous = uploadChains.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => runUpload(job, deps));
  uploadChains.set(
    key,
    next.catch(() => undefined)
  );
  return next;
}
