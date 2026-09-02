// Unit tests for the student-side quiz media upload/archive queue (Brief 3.3).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/config/firebase', () => ({ storage: {}, functions: {} }));

import {
  buildQuizMediaStoragePath,
  quizMediaExtensionForMimeType,
  enqueueQuizMediaUpload,
  __resetQuizMediaUploadQueue,
  MAX_QUIZ_MEDIA_BYTES,
  type QuizMediaUploadDeps,
  type QuizMediaUploadJob,
} from './quizMediaUpload';

function job(overrides: Partial<QuizMediaUploadJob> = {}): QuizMediaUploadJob {
  return {
    sessionId: 'sess-1',
    studentUid: 'student-1',
    responseKey: 'resp-1',
    questionId: 'q1',
    artifactId: 'art-1',
    blob: new Blob(['x']),
    mimeType: 'audio/webm;codecs=opus',
    ...overrides,
  };
}

function makeDeps(
  overrides: Partial<QuizMediaUploadDeps> = {}
): QuizMediaUploadDeps {
  return {
    uploadBlob: vi.fn(() => Promise.resolve()),
    archiveArtifact: vi.fn(() => Promise.resolve({ driveFileId: 'drive-1' })),
    ...overrides,
  };
}

beforeEach(() => {
  __resetQuizMediaUploadQueue();
  vi.clearAllMocks();
});

describe('storage path', () => {
  it('derives the extension from the recorder-chosen mime type', () => {
    expect(quizMediaExtensionForMimeType('audio/webm;codecs=opus')).toBe(
      'webm'
    );
    expect(quizMediaExtensionForMimeType('audio/mp4')).toBe('m4a');
    expect(quizMediaExtensionForMimeType('audio/ogg')).toBe('ogg');
    expect(quizMediaExtensionForMimeType('')).toBe('audio');
  });

  it('builds the pseudonymous transit path the storage rule gates', () => {
    expect(buildQuizMediaStoragePath('s1', 'u1', 'a1', 'audio/webm')).toBe(
      'quiz_response_media/s1/u1/a1.webm'
    );
  });
});

describe('enqueueQuizMediaUpload', () => {
  it('uploads then archives and reports uploaded', async () => {
    const deps = makeDeps();
    const result = await enqueueQuizMediaUpload(job(), deps);
    expect(result).toMatchObject({
      uploadState: 'uploaded',
      driveFileId: 'drive-1',
      storagePath: 'quiz_response_media/sess-1/student-1/art-1.webm',
    });
  });

  it('rejects an oversized blob before touching Storage', async () => {
    const deps = makeDeps();
    const big = { size: MAX_QUIZ_MEDIA_BYTES + 1 } as Blob;
    const result = await enqueueQuizMediaUpload(job({ blob: big }), deps);
    expect(result.uploadState).toBe('failed');
    expect(deps.uploadBlob).not.toHaveBeenCalled();
  });

  it('retries the archive exactly once before failing', async () => {
    const archiveArtifact = vi.fn(() =>
      Promise.reject(new Error('drive down'))
    );
    const result = await enqueueQuizMediaUpload(
      job(),
      makeDeps({ archiveArtifact })
    );
    expect(archiveArtifact).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      uploadState: 'failed',
      error: 'drive down',
    });
  });

  it('succeeds on the automatic second archive attempt', async () => {
    let calls = 0;
    const archiveArtifact = vi.fn(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('transient'));
      return Promise.resolve({ driveFileId: 'drive-2' });
    });
    const result = await enqueueQuizMediaUpload(
      job(),
      makeDeps({ archiveArtifact })
    );
    expect(result).toMatchObject({
      uploadState: 'uploaded',
      driveFileId: 'drive-2',
    });
  });

  it('serializes takes for one student so take n+1 cannot race take n', async () => {
    const order: string[] = [];
    let releaseFirst: (() => void) | null = null;
    const deps = makeDeps({
      uploadBlob: vi.fn(async (storagePath: string) => {
        order.push(`start:${storagePath}`);
        if (storagePath.includes('art-1')) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        order.push(`end:${storagePath}`);
      }),
    });

    const first = enqueueQuizMediaUpload(job({ artifactId: 'art-1' }), deps);
    const second = enqueueQuizMediaUpload(job({ artifactId: 'art-2' }), deps);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order.filter((o) => o.startsWith('start'))).toHaveLength(1);
    releaseFirst?.();
    await Promise.all([first, second]);

    expect(order).toEqual([
      'start:quiz_response_media/sess-1/student-1/art-1.webm',
      'end:quiz_response_media/sess-1/student-1/art-1.webm',
      'start:quiz_response_media/sess-1/student-1/art-2.webm',
      'end:quiz_response_media/sess-1/student-1/art-2.webm',
    ]);
  });

  it('does not let one failed take block the next one', async () => {
    const deps = makeDeps({
      uploadBlob: vi.fn((storagePath: string) =>
        storagePath.includes('art-1')
          ? Promise.reject(new Error('network'))
          : Promise.resolve()
      ),
    });
    const first = await enqueueQuizMediaUpload(
      job({ artifactId: 'art-1' }),
      deps
    );
    const second = await enqueueQuizMediaUpload(
      job({ artifactId: 'art-2' }),
      deps
    );
    expect(first.uploadState).toBe('failed');
    expect(second.uploadState).toBe('uploaded');
  });
});
