// Unit tests for Guided Learning narration (docs/plans/GUIDED_LEARNING_STUDIO.md P2-4).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const INCREMENT = Symbol('increment');

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  auth: vi.fn(() => ({ getUser: vi.fn() })),
  storage: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: {
      increment: (n: number) => ({ [INCREMENT]: n }),
    },
  }),
}));

vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});

vi.mock('@google-cloud/text-to-speech', () => ({
  v1beta1: { TextToSpeechClient: vi.fn() },
  protos: {},
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('./quizMediaArchive', () => ({
  isGlobalFeatureGranted: vi.fn(() => Promise.resolve(true)),
}));

import {
  GL_NARRATION_MAX_CHARS,
  narrationTextHash,
  parseNarrationRequest,
  synthesizeGuidedLearningNarration,
  type NarrationDeps,
} from './guidedLearningNarration';
import {
  buildSsml,
  cacheHash,
  cachePath,
  monthlyUsageDocId,
  teacherDailyDocId,
} from './quizReadAloud';
import { mp3DurationMs, storedDurationMs } from './mp3Duration';

type Doc = Record<string, unknown>;
const ADMIN_UID = 'admin-1';
const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
const adminToken = {
  uid: ADMIN_UID,
  email: 'admin@x.org',
  email_verified: true,
};

/** MPEG-2 Layer III, 32 kbps, 24 kHz: 96-byte frames of 24 ms, as Cloud TTS emits. */
function fakeMp3(frames: number): Buffer {
  const frame = Buffer.alloc(96);
  frame[0] = 0xff;
  frame[1] = 0xf3;
  frame[2] = 0x44;
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}

function makeDb(docs: Record<string, Doc>) {
  const refFor = (path: string) => ({
    path,
    get: () =>
      Promise.resolve({
        exists: docs[path] !== undefined,
        data: () => docs[path],
        get: (field: string) => docs[path]?.[field],
      }),
    set: (data: Doc) => {
      const prev = docs[path] ?? {};
      const next: Doc = { ...prev };
      for (const [k, v] of Object.entries(data)) {
        const inc =
          typeof v === 'object' && v !== null && INCREMENT in v
            ? (v as Record<symbol, number>)[INCREMENT]
            : undefined;
        next[k] = inc !== undefined ? (Number(prev[k]) || 0) + inc : v;
      }
      docs[path] = next;
      return Promise.resolve();
    },
  });
  return {
    collection: (c: string) => ({ doc: (id: string) => refFor(`${c}/${id}`) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: (ref: { get: () => Promise<unknown> }) => ref.get(),
        set: (ref: { set: (d: Doc) => Promise<void> }, d: Doc) =>
          void ref.set(d),
      }),
  } as unknown as NarrationDeps['db'];
}

function makeDeps(
  docs: Record<string, Doc>,
  over: Partial<NarrationDeps> = {}
) {
  const files = new Map<string, Record<string, string>>();
  const synthesize = vi.fn(() =>
    Promise.resolve({ audio: fakeMp3(50), timepoints: [] })
  );
  const deps: NarrationDeps = {
    db: makeDb(docs),
    statFile: (path) => {
      const meta = files.get(path);
      if (!meta) return Promise.resolve(null);
      return Promise.resolve({
        durationMs: storedDurationMs(meta.durationMs, undefined),
      });
    },
    saveFile: (path, _bytes, meta) => {
      files.set(path, meta);
      return Promise.resolve();
    },
    synthesize,
    isFeatureGranted: () => Promise.resolve(true),
    now: () => NOW,
    isCallerAdmin: (token) => Promise.resolve(token.email === 'admin@x.org'),
    downloadUrl: (path) => Promise.resolve(`https://dl/${path}`),
    ...over,
  };
  return { deps, files, synthesize };
}

beforeEach(() => vi.clearAllMocks());

describe('mp3DurationMs', () => {
  it('sums Layer III frame durations and skips an ID3v2 tag', () => {
    expect(mp3DurationMs(fakeMp3(50))).toBe(1200);
    const id3 = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 5]);
    const tagged = Buffer.concat([id3, Buffer.alloc(5), fakeMp3(10)]);
    expect(mp3DurationMs(tagged)).toBe(240);
  });

  it('returns null for bytes with no MP3 frame', () => {
    expect(mp3DurationMs(Buffer.from('mp3'))).toBeNull();
  });

  it('prefers stored metadata and falls back to the size at 32 kbps', () => {
    expect(storedDurationMs('1234', 99_999)).toBe(1234);
    expect(storedDurationMs(undefined, 4800)).toBe(1200);
    expect(storedDurationMs(undefined, undefined)).toBeUndefined();
  });
});

describe('parseNarrationRequest', () => {
  it('trims text and rejects empty or oversized input', () => {
    expect(parseNarrationRequest({ text: '  Hi  ' })).toEqual({ text: 'Hi' });
    expect(() => parseNarrationRequest({ text: '   ' })).toThrow(/required/);
    expect(() =>
      parseNarrationRequest({ text: 'a'.repeat(GL_NARRATION_MAX_CHARS + 1) })
    ).toThrow(/limited/);
  });
});

describe('synthesizeGuidedLearningNarration', () => {
  it('requires an admin caller', async () => {
    const { deps, synthesize } = makeDeps({});
    await expect(
      synthesizeGuidedLearningNarration(
        { text: 'Click Save.' },
        { uid: 't', email: 'teacher@x.org', email_verified: true },
        deps
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('synthesizes into the shared quiz cache with the default voice and bills the admin', async () => {
    const docs: Record<string, Doc> = {};
    const { deps, files } = makeDeps(docs);
    const text = 'Click **Save** to keep your work.';
    const res = await synthesizeGuidedLearningNarration(
      { text },
      adminToken,
      deps
    );
    const ssml = buildSsml([{ text: 'Click Save to keep your work.' }]);
    const path = cachePath(
      'en-US-Neural2-F',
      cacheHash('en-US-Neural2-F', ssml)
    );
    expect(res).toEqual({
      url: `https://dl/${path}`,
      storagePath: path,
      voice: 'en-US-Neural2-F',
      textHash: narrationTextHash(text),
      durationMs: 1200,
    });
    expect(files.get(path)).toMatchObject({ durationMs: '1200' });
    expect(docs[`ai_usage/${teacherDailyDocId(ADMIN_UID, NOW)}`]).toMatchObject(
      { count: 1 }
    );
  });

  it('serves a cache hit without calling Cloud TTS and counts the hit', async () => {
    const docs: Record<string, Doc> = {};
    const { deps, synthesize } = makeDeps(docs);
    await synthesizeGuidedLearningNarration({ text: 'Hi' }, adminToken, deps);
    const again = await synthesizeGuidedLearningNarration(
      { text: 'Hi' },
      adminToken,
      deps
    );
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(again.durationMs).toBe(1200);
    expect(docs[`ai_usage/${monthlyUsageDocId(NOW)}`]).toMatchObject({
      cacheHits: 1,
    });
  });

  it('falls back to the Standard voice past the shared monthly cap', async () => {
    const docs: Record<string, Doc> = {
      [`ai_usage/${monthlyUsageDocId(NOW)}`]: { neural2Chars: 900_000 },
    };
    const { deps, synthesize } = makeDeps(docs);
    const res = await synthesizeGuidedLearningNarration(
      { text: 'Hi', voice: 'es-US-Neural2-A' },
      adminToken,
      deps
    );
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ voice: 'es-US-Standard-A' })
    );
    expect(res.voice).toBe('es-US-Standard-A');
    expect(docs[`ai_usage/${monthlyUsageDocId(NOW)}`]).toMatchObject({
      standardChars: 2,
      neural2Chars: 900_000,
    });
  });

  it('refuses a voice outside the admin allow-list', async () => {
    const { deps } = makeDeps({});
    await expect(
      synthesizeGuidedLearningNarration(
        { text: 'Hi', voice: 'en-US-Standard-B' },
        adminToken,
        deps
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
