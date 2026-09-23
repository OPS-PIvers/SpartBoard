import { describe, it, expect, vi, beforeEach } from 'vitest';

const callable = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => callable),
}));
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_s: unknown, path: string) => ({ path })),
  getDownloadURL: vi.fn(({ path }: { path: string }) =>
    Promise.resolve(`https://dl/${path}`)
  ),
}));
vi.mock('@/config/firebase', () => ({ functions: {}, storage: {} }));

import { httpsCallable } from 'firebase/functions';
import {
  generateNarration,
  isNarrationStale,
  narrationDeletionRef,
  narrationSourceText,
  narrationTextHash,
} from './narration';

beforeEach(() => vi.clearAllMocks());

describe('narrationSourceText', () => {
  it('joins label and text with a sentence break', () => {
    expect(narrationSourceText({ label: 'Save', text: 'Click it.' })).toBe(
      'Save. Click it.'
    );
    expect(narrationSourceText({ label: 'Done!', text: 'Next.' })).toBe(
      'Done! Next.'
    );
    expect(narrationSourceText({ label: ' Only ' })).toBe('Only');
    expect(narrationSourceText({ text: 'Just text' })).toBe('Just text');
    expect(narrationSourceText({})).toBe('');
  });
});

describe('narrationTextHash', () => {
  it('is the full SHA-256 hex digest, matching the server', async () => {
    expect(await narrationTextHash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});

describe('isNarrationStale', () => {
  it('flags a label or text change and ignores narration without a hash', async () => {
    const step = { label: 'Save', text: 'Click it.' };
    const textHash = await narrationTextHash(narrationSourceText(step));
    expect(await isNarrationStale({ textHash }, step)).toBe(false);
    expect(
      await isNarrationStale({ textHash }, { ...step, text: 'Click here.' })
    ).toBe(true);
    expect(await isNarrationStale({}, step)).toBe(false);
  });
});

describe('narrationDeletionRef', () => {
  it('returns recorded takes only and never a shared cache path', () => {
    expect(
      narrationDeletionRef({
        source: 'recorded',
        storagePath: 'guided_learning/u1/media/take.webm',
      })
    ).toEqual({ storagePath: 'guided_learning/u1/media/take.webm' });
    expect(
      narrationDeletionRef({
        source: 'generated',
        storagePath: 'quiz_tts_cache/en-US-Neural2-F/abc.mp3',
      })
    ).toBeNull();
    expect(
      narrationDeletionRef({
        source: 'recorded',
        storagePath: 'quiz_tts_cache/en-US-Neural2-F/abc.mp3',
      })
    ).toBeNull();
    expect(narrationDeletionRef(undefined)).toBeNull();
  });
});

describe('generateNarration', () => {
  it('calls the narration callable, resolves the URL client-side and tags the result', async () => {
    callable.mockResolvedValue({
      data: {
        storagePath: 'quiz_tts_cache/v/x.mp3',
        voice: 'en-US-Neural2-F',
        textHash: 'h',
        durationMs: 900,
      },
    });
    const res = await generateNarration('Hello');
    expect(httpsCallable).toHaveBeenCalledWith(
      {},
      'synthesizeGuidedLearningNarrationV1'
    );
    expect(callable).toHaveBeenCalledWith({ text: 'Hello' });
    expect(res).toMatchObject({
      source: 'generated',
      url: 'https://dl/quiz_tts_cache/v/x.mp3',
      durationMs: 900,
    });
  });
});
