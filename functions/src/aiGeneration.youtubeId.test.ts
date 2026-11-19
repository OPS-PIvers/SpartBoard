import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(() => ({}), {
    FieldValue: { serverTimestamp: () => 'ts' },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {},
  onCall: (_o: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ value: () => name, name }),
}));
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: () => '@x',
  resolveOrgIdForDomain: () => Promise.resolve('o'),
}));

import { extractYouTubeVideoId } from './aiGeneration';

describe('extractYouTubeVideoId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    [
      'https://youtube.com/watch?feature=share&t=10&v=dQw4w9WgXcQ',
      'dQw4w9WgXcQ',
    ],
    ['https://youtu.be/dQw4w9WgXcQ?t=3', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('reads the id from %s', (url, id) => {
    expect(extractYouTubeVideoId(url)).toBe(id);
  });

  it('returns undefined for non-YouTube or non-string input', () => {
    expect(extractYouTubeVideoId('https://vimeo.com/123')).toBeUndefined();
    expect(extractYouTubeVideoId(42)).toBeUndefined();
  });

  it('rejects a 5 MB repeated watch? url in milliseconds', () => {
    const huge = 'youtube.com/watch?'.repeat(Math.ceil(5e6 / 18));
    const t0 = performance.now();
    expect(extractYouTubeVideoId(huge)).toBeUndefined();
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it('stays fast on a capped-length adversarial url', () => {
    const near = 'youtube.com/watch?'.repeat(113);
    expect(near.length).toBeLessThanOrEqual(2048);
    const t0 = performance.now();
    expect(extractYouTubeVideoId(near)).toBeUndefined();
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
