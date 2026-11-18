// Runs the real bundled ffmpeg against the transcode's length, size and time caps.
import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import ffmpegStatic from 'ffmpeg-static';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  auth: vi.fn(() => ({ getUser: vi.fn() })),
  storage: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { delete: () => ({ __delete: true }) },
    FieldPath: { documentId: () => '__name__' },
  }),
}));

vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});

vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ value: () => `secret:${name}` }),
}));

vi.mock('./functionsInit', () => ({}));
vi.mock('./googleOAuth', () => ({
  refreshGoogleAccessTokenForUid: vi.fn(),
}));
vi.mock('./studentAssignmentTargets', () => ({
  loadTargetDirectory: vi.fn(),
  uidForRef: (ref: { kind: string; sourcedId?: string; email?: string }) =>
    ref.kind === 'classlink' ? `uid:${ref.sourcedId}` : `uid:test:${ref.email}`,
}));
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: (email: string) => `@${email.split('@')[1]}`,
  resolveOrgIdForDomain: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('./secrets', () => {
  const secret = (name: string) => ({ value: () => `secret:${name}` });
  return {
    CLASSLINK_CLIENT_ID: secret('cid'),
    CLASSLINK_CLIENT_SECRET: secret('csecret'),
    CLASSLINK_TENANT_URL: secret('tenant'),
    STUDENT_PSEUDONYM_HMAC_SECRET: secret('hmac'),
    GOOGLE_OAUTH_CLIENT_ID: secret('gid'),
  };
});

import {
  AudioTooLongError,
  MAX_TRANSCODE_AUDIO_SECONDS,
  lastTranscodedSeconds,
  transcodeBufferToM4a,
} from './quizMediaArchive';

const ffmpegPath = ffmpegStatic;

// FLAC silence compresses to almost nothing, so hours of audio fit in a tiny upload.
function silentFlac(seconds: number): Buffer {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'transcode-test-'));
  const out = path.join(dir, 'in.flac');
  execFileSync(ffmpegPath as string, [
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=8000:cl=mono',
    '-t',
    String(seconds),
    '-c:a',
    'flac',
    out,
  ]);
  const buf = readFileSync(out);
  rmSync(dir, { recursive: true, force: true });
  return buf;
}

describe('lastTranscodedSeconds', () => {
  it('reads the final time= mark', () => {
    expect(
      lastTranscodedSeconds(
        'time=00:00:01.00 x\nsize=1kB time=00:10:01.50 bitrate'
      )
    ).toBe(601.5);
    expect(lastTranscodedSeconds('time=N/A')).toBe(0);
  });
});

describe.skipIf(!ffmpegPath || !existsSync(ffmpegPath))(
  'transcodeBufferToM4a limits (real ffmpeg)',
  () => {
    it('transcodes a normal-length take', async () => {
      const out = await transcodeBufferToM4a(silentFlac(5));
      expect(out.length).toBeGreaterThan(0);
    }, 30_000);

    it('refuses a small upload that decodes to hours', async () => {
      const input = silentFlac(4 * 3600);
      expect(input.length).toBeLessThan(5 * 1024 * 1024);
      const t0 = Date.now();
      await expect(transcodeBufferToM4a(input)).rejects.toBeInstanceOf(
        AudioTooLongError
      );
      expect(Date.now() - t0).toBeLessThan(30_000);
    }, 60_000);

    it('kills ffmpeg at the wall-clock cap', async () => {
      await expect(
        transcodeBufferToM4a(silentFlac(MAX_TRANSCODE_AUDIO_SECONDS), 1)
      ).rejects.toThrow('Audio transcode timed out.');
    }, 30_000);
  }
);
