/**
 * extractStimulusReadAloudText (docs/plans/QUIZ_READ_ALOUD.md §4.2): text layer
 * vs OCR fallback vs needs-manual, plus the OCR quota charge.
 */
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
      serverTimestamp: () => 'ts',
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
  assertFetchableUrl,
  chargeOcrQuota,
  extractStimulusReadAloudText,
  fetchPublicUrl,
  hasUsableTextLayer,
  MAX_SOURCE_BYTES,
  MAX_STORED_CHARS,
  normalizeExtractedText,
  parseExtractRequest,
  sniffImageMime,
  type ExtractDeps,
} from './quizStimulusText';
import type { Firestore } from 'firebase-admin/firestore';

// ── Minimal Firestore fake (docs + transactions with set-merge) ────────────

function makeDb(seed: Record<string, Record<string, unknown>> = {}) {
  const docs = new Map<string, Record<string, unknown>>(Object.entries(seed));
  const applyMerge = (
    path: string,
    data: Record<string, unknown>,
    merge: boolean
  ) => {
    const prev = merge ? (docs.get(path) ?? {}) : {};
    const next: Record<string, unknown> = { ...prev };
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && INCREMENT in v) {
        next[k] =
          Number(prev[k] ?? 0) + (v as Record<symbol, number>)[INCREMENT];
      } else next[k] = v;
    }
    docs.set(path, next);
  };
  const docRef = (path: string) => ({ path });
  const snap = (path: string) => {
    const data = docs.get(path);
    return { exists: data !== undefined, data: () => data };
  };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        ...docRef(`${name}/${id}`),
        get: () => Promise.resolve(snap(`${name}/${id}`)),
      }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
      const writes: (() => void)[] = [];
      const tx = {
        get: (ref: { path: string }) => Promise.resolve(snap(ref.path)),
        set: (
          ref: { path: string },
          data: Record<string, unknown>,
          opts?: { merge?: boolean }
        ) => writes.push(() => applyMerge(ref.path, data, !!opts?.merge)),
      };
      await fn(tx);
      writes.forEach((w) => w());
    },
  };
  return { db: db as unknown as Firestore, docs };
}

// ── Deps ──────────────────────────────────────────────────────────────────

const PDF = Buffer.from('%PDF-1.4 fake');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

function makeDeps(over: Partial<ExtractDeps> = {}) {
  let now = 1_000_000;
  const deps: ExtractDeps = {
    db: makeDb().db,
    isFeatureGranted: vi.fn(() => Promise.resolve(true)),
    getAccessToken: vi.fn(() => Promise.resolve('tok')),
    downloadDriveFile: vi.fn(() => Promise.resolve(PDF)),
    fetchUrl: vi.fn(() => Promise.resolve(PNG)),
    pdfText: vi.fn(() =>
      Promise.resolve({ text: 'A'.repeat(200) + ' text layer.', pages: 2 })
    ),
    pdfFirstPages: vi.fn((bytes: Buffer) =>
      Promise.resolve(Buffer.concat([bytes, Buffer.from('-sliced')]))
    ),
    ocr: vi.fn(() => Promise.resolve('Scanned  words.\n\n\n\nMore words.')),
    chargeOcr: vi.fn(() => Promise.resolve()),
    now: () => now,
    ...over,
  };
  return { deps, advance: (ms: number) => (now += ms) };
}

const teacher = { uid: 't1', email: 't@school.org', studentRole: false };
const pdfReq = {
  stimulusId: 's1',
  type: 'pdf' as const,
  driveFileId: 'abcdefghij123',
};
const imgReq = {
  stimulusId: 's1',
  type: 'image' as const,
  url: 'https://example.com/a.png',
};

beforeEach(() => vi.clearAllMocks());

describe('parseExtractRequest', () => {
  it('requires stimulusId, a media type and a source', () => {
    expect(() => parseExtractRequest({})).toThrow(/stimulusId/);
    expect(() =>
      parseExtractRequest({ stimulusId: 's', type: 'audio' })
    ).toThrow(/type/);
    expect(() => parseExtractRequest({ stimulusId: 's', type: 'pdf' })).toThrow(
      /driveFileId or url/
    );
  });
  it('accepts a Drive id and trims it', () => {
    expect(
      parseExtractRequest({
        stimulusId: ' s1 ',
        type: 'pdf',
        driveFileId: ' abcdefghij123 ',
      })
    ).toEqual({
      stimulusId: 's1',
      type: 'pdf',
      driveFileId: 'abcdefghij123',
      url: undefined,
    });
  });
  it('rejects non-https and private urls', () => {
    expect(() => assertFetchableUrl('http://example.com/a.png')).toThrow(
      /https/
    );
    expect(() => assertFetchableUrl('https://localhost/a.png')).toThrow();
    expect(() => assertFetchableUrl('https://10.0.0.5/a.png')).toThrow();
    expect(() => assertFetchableUrl('https://169.254.169.254/x')).toThrow();
    expect(() => assertFetchableUrl('https://172.20.1.1/x')).toThrow();
    expect(() => assertFetchableUrl('https://[::1]/x')).toThrow();
    expect(() => assertFetchableUrl('not a url')).toThrow(/Invalid url/);
    expect(() =>
      assertFetchableUrl('https://drive.google.com/uc?id=1')
    ).not.toThrow();
  });
});

describe('pure helpers', () => {
  it('normalizes whitespace, keeps paragraph breaks and caps length', () => {
    expect(normalizeExtractedText('  a \t b \r\n\r\n\r\n\r\n c  \n d ')).toBe(
      'a b\n\nc\nd'
    );
    const long = Array.from({ length: 12_000 }, (_, i) => `w${i}`).join(' ');
    const capped = normalizeExtractedText(long);
    expect(capped.length).toBeLessThanOrEqual(MAX_STORED_CHARS);
    expect(capped.endsWith(' ')).toBe(false);
    expect(/w\d+$/.test(capped)).toBe(true);
  });
  it('treats fewer than 40 characters per page as no text layer', () => {
    expect(hasUsableTextLayer('x'.repeat(79), 2)).toBe(false);
    expect(hasUsableTextLayer('x'.repeat(80), 2)).toBe(true);
    expect(hasUsableTextLayer('   ', 0)).toBe(false);
  });
  it('sniffs image mime types', () => {
    expect(sniffImageMime(PNG)).toBe('image/png');
    expect(sniffImageMime(JPG)).toBe('image/jpeg');
    expect(sniffImageMime(Buffer.from('GIF89a'))).toBe('image/gif');
    expect(sniffImageMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe(
      'image/webp'
    );
    expect(sniffImageMime(Buffer.from('??'))).toBe('image/png');
  });
});

describe('extractStimulusReadAloudText', () => {
  it('denies students and teachers without the flag', async () => {
    const { deps } = makeDeps();
    await expect(
      extractStimulusReadAloudText(
        pdfReq,
        { ...teacher, studentRole: true },
        deps
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const off = makeDeps({ isFeatureGranted: () => Promise.resolve(false) });
    await expect(
      extractStimulusReadAloudText(pdfReq, teacher, off.deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(deps.downloadDriveFile).not.toHaveBeenCalled();
  });

  it('returns the PDF text layer without charging OCR', async () => {
    const { deps } = makeDeps();
    const res = await extractStimulusReadAloudText(pdfReq, teacher, deps);
    expect(res.source).toBe('pdf-text');
    expect(res.text.endsWith('text layer.')).toBe(true);
    expect(deps.getAccessToken).toHaveBeenCalledWith('t1');
    expect(deps.downloadDriveFile).toHaveBeenCalledWith('tok', 'abcdefghij123');
    expect(deps.chargeOcr).not.toHaveBeenCalled();
    expect(deps.ocr).not.toHaveBeenCalled();
  });

  it('falls back to OCR on the first four pages when the layer is thin', async () => {
    const { deps } = makeDeps({
      pdfText: () => Promise.resolve({ text: 'x', pages: 30 }),
    });
    const res = await extractStimulusReadAloudText(pdfReq, teacher, deps);
    expect(res).toEqual({
      text: 'Scanned words.\n\nMore words.',
      source: 'ocr',
    });
    expect(deps.chargeOcr).toHaveBeenCalledWith('t1', 't@school.org');
    expect(deps.pdfFirstPages).toHaveBeenCalledWith(PDF, 4);
    expect(deps.ocr).toHaveBeenCalledWith(
      Buffer.concat([PDF, Buffer.from('-sliced')]),
      'application/pdf'
    );
  });

  it('also falls back when the text layer parser throws', async () => {
    const { deps } = makeDeps({
      pdfText: () => Promise.reject(new Error('bad')),
    });
    const res = await extractStimulusReadAloudText(pdfReq, teacher, deps);
    expect(res.source).toBe('ocr');
  });

  it('OCRs images with the sniffed mime type from a fetched url', async () => {
    const { deps } = makeDeps({ fetchUrl: vi.fn(() => Promise.resolve(JPG)) });
    const res = await extractStimulusReadAloudText(imgReq, teacher, deps);
    expect(res.source).toBe('ocr');
    expect(deps.fetchUrl).toHaveBeenCalledWith('https://example.com/a.png');
    expect(deps.ocr).toHaveBeenCalledWith(JPG, 'image/jpeg');
    expect(deps.pdfText).not.toHaveBeenCalled();
  });

  it('returns needs-manual when OCR yields nothing', async () => {
    const { deps } = makeDeps({ ocr: () => Promise.resolve('  \n ') });
    expect(await extractStimulusReadAloudText(imgReq, teacher, deps)).toEqual({
      text: '',
      source: 'needs-manual',
    });
  });

  it('returns needs-manual when the download already used the 60 s budget', async () => {
    const { deps, advance } = makeDeps({
      fetchUrl: () => {
        advance(61_000);
        return Promise.resolve(PNG);
      },
    });
    expect(await extractStimulusReadAloudText(imgReq, teacher, deps)).toEqual({
      text: '',
      source: 'needs-manual',
    });
    expect(deps.ocr).not.toHaveBeenCalled();
    expect(deps.chargeOcr).not.toHaveBeenCalled();
  });

  it('returns needs-manual when OCR outruns the deadline', async () => {
    vi.useFakeTimers();
    try {
      const { deps } = makeDeps({ ocr: () => new Promise(() => undefined) });
      const pending = extractStimulusReadAloudText(imgReq, teacher, deps);
      await vi.advanceTimersByTimeAsync(60_001);
      expect(await pending).toEqual({ text: '', source: 'needs-manual' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps download failures and OCR outages to unavailable', async () => {
    const dl = makeDeps({
      downloadDriveFile: () => Promise.reject(new Error('403')),
    });
    await expect(
      extractStimulusReadAloudText(pdfReq, teacher, dl.deps)
    ).rejects.toMatchObject({ code: 'unavailable' });
    const ocr = makeDeps({
      ocr: () => Promise.reject(new Error('gemini down')),
    });
    await expect(
      extractStimulusReadAloudText(imgReq, teacher, ocr.deps)
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('rejects empty and oversized sources', async () => {
    const empty = makeDeps({
      fetchUrl: () => Promise.resolve(Buffer.alloc(0)),
    });
    await expect(
      extractStimulusReadAloudText(imgReq, teacher, empty.deps)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    const big = makeDeps({
      fetchUrl: () => Promise.resolve(Buffer.alloc(MAX_SOURCE_BYTES + 1)),
    });
    await expect(
      extractStimulusReadAloudText(imgReq, teacher, big.deps)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('propagates an exhausted OCR quota before calling Gemini', async () => {
    const { deps } = makeDeps({
      chargeOcr: () =>
        Promise.reject(
          Object.assign(new Error('cap'), { code: 'resource-exhausted' })
        ),
    });
    await expect(
      extractStimulusReadAloudText(imgReq, teacher, deps)
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(deps.ocr).not.toHaveBeenCalled();
  });
});

describe('fetchPublicUrl', () => {
  const redirectTo = (location: string) =>
    new Response(null, { status: 302, headers: { location } });

  it('re-validates every redirect hop against the public-host rules', async () => {
    const doFetch = vi.fn((input: string) =>
      Promise.resolve(
        input === 'https://example.com/a.png'
          ? redirectTo('https://169.254.169.254/latest/meta-data')
          : new Response('secret')
      )
    ) as unknown as typeof fetch;
    await expect(
      fetchPublicUrl('https://example.com/a.png', doFetch)
    ).rejects.toThrow(/cannot be fetched/);
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  it('follows a public redirect and returns the body', async () => {
    const doFetch = vi.fn((input: string) =>
      Promise.resolve(
        input === 'https://example.com/a.png'
          ? redirectTo('/final.png')
          : new Response('ok bytes')
      )
    ) as unknown as typeof fetch;
    const bytes = await fetchPublicUrl('https://example.com/a.png', doFetch);
    expect(bytes.toString()).toBe('ok bytes');
    expect(doFetch).toHaveBeenLastCalledWith('https://example.com/final.png', {
      redirect: 'manual',
    });
  });

  it('gives up after too many redirects', async () => {
    const doFetch = vi.fn(() =>
      Promise.resolve(redirectTo('https://example.com/next'))
    ) as unknown as typeof fetch;
    await expect(
      fetchPublicUrl('https://example.com/a.png', doFetch)
    ).rejects.toThrow(/Too many redirects/);
  });

  it('stops streaming past the cap when content-length lies or is absent', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_SOURCE_BYTES + 1));
        controller.close();
      },
    });
    const doFetch = vi.fn(() =>
      Promise.resolve(new Response(stream))
    ) as unknown as typeof fetch;
    await expect(
      fetchPublicUrl('https://example.com/a.png', doFetch)
    ).rejects.toThrow(/too large/i);
  });

  it('rejects an oversized declared content-length and non-ok responses', async () => {
    const big = vi.fn(() =>
      Promise.resolve(
        new Response('x', {
          headers: { 'content-length': String(MAX_SOURCE_BYTES + 1) },
        })
      )
    ) as unknown as typeof fetch;
    await expect(
      fetchPublicUrl('https://example.com/a.png', big)
    ).rejects.toThrow(/too large/i);
    const missing = vi.fn(() =>
      Promise.resolve(new Response('nope', { status: 404 }))
    ) as unknown as typeof fetch;
    await expect(
      fetchPublicUrl('https://example.com/a.png', missing)
    ).rejects.toThrow(/404/);
  });
});

describe('chargeOcrQuota', () => {
  const NOW = Date.UTC(2026, 8, 8, 15);
  it('increments the per-feature and overall daily counters', async () => {
    const { db, docs } = makeDb();
    await chargeOcrQuota(db, 't1', 't@school.org', NOW);
    await chargeOcrQuota(db, 't1', 't@school.org', NOW);
    expect(docs.get('ai_usage/t1_ocr_2026-09-08')).toMatchObject({ count: 2 });
    expect(docs.get('ai_usage/t1_2026-09-08')).toMatchObject({ count: 2 });
  });
  it('throws resource-exhausted at the configured limit', async () => {
    const { db } = makeDb({
      'global_permissions/ocr': { config: { dailyLimit: 1 } },
      'ai_usage/t1_ocr_2026-09-08': { count: 1 },
    });
    await expect(chargeOcrQuota(db, 't1', null, NOW)).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
  });
  it('ignores the limit for admins and when limiting is disabled', async () => {
    const admin = makeDb({
      'global_permissions/ocr': { config: { dailyLimit: 1 } },
      'ai_usage/t1_ocr_2026-09-08': { count: 5 },
      'admins/t@school.org': {},
    });
    await expect(
      chargeOcrQuota(admin.db, 't1', 'T@school.org', NOW)
    ).resolves.toBeUndefined();
    const off = makeDb({
      'global_permissions/ocr': {
        config: { dailyLimit: 1, dailyLimitEnabled: false },
      },
      'ai_usage/t1_ocr_2026-09-08': { count: 5 },
    });
    await expect(
      chargeOcrQuota(off.db, 't1', null, NOW)
    ).resolves.toBeUndefined();
  });
});
