import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./functionsInit', () => ({}));

import {
  downloadDriveFileById,
  DRIVE_DOWNLOAD_TIMEOUT_MS,
} from './getQuizArtifactPlaybackUrl';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('downloadDriveFileById', () => {
  it('aborts a stalled Drive download instead of hanging', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted'))
          );
        })
    );
    let outcome = 'pending';
    const p = downloadDriveFileById('tok', 'file').then(
      () => (outcome = 'resolved'),
      () => (outcome = 'rejected')
    );
    await vi.advanceTimersByTimeAsync(DRIVE_DOWNLOAD_TIMEOUT_MS + 1);
    await p;
    expect(outcome).toBe('rejected');
  });
});
