import { describe, it, expect, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import {
  buildGlExportFilename,
  blobToDataUri,
  embedSetImages,
  extensionForMime,
  GlExportBudgetExceededError,
  parseDataUri,
  parseGuidedLearningJson,
  prepareImportedSet,
  rehostImportedSetImages,
  sanitizeGlFileName,
} from './glTransfer';

const PNG_DATA_URI = 'data:image/png;base64,aGVsbG8='; // "hello"

function makeSet(
  overrides: Partial<GuidedLearningSet> = {}
): GuidedLearningSet {
  return {
    id: 'set-1234-5678',
    title: 'Cell Diagram',
    imageUrls: ['https://example.com/a.png'],
    steps: [
      {
        id: 's1',
        xPct: 10,
        yPct: 20,
        imageIndex: 0,
        interactionType: 'tooltip',
        text: 'Nucleus',
      },
    ],
    mode: 'structured',
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe('filenames', () => {
  it('sanitizes drive-illegal characters', () => {
    expect(sanitizeGlFileName('a/b:c*?"<>|')).toBe('a_b_c______');
    expect(sanitizeGlFileName('   ')).toBe('untitled');
  });

  it('builds the Drive-style export filename', () => {
    expect(buildGlExportFilename('Cell Diagram', 'abcdefgh1234')).toBe(
      'Cell Diagram.abcdefgh.gl.json'
    );
  });
});

describe('parseDataUri / extensionForMime', () => {
  it('decodes a base64 data URI', () => {
    const parsed = parseDataUri(PNG_DATA_URI);
    expect(parsed?.mimeType).toBe('image/png');
    expect(new TextDecoder().decode(parsed?.bytes)).toBe('hello');
  });

  it('returns null for non-base64 or non-data URIs', () => {
    expect(parseDataUri('https://example.com/a.png')).toBeNull();
    expect(parseDataUri('data:text/plain,hi')).toBeNull();
  });

  it('maps mime types to extensions with a bin fallback', () => {
    expect(extensionForMime('image/png')).toBe('png');
    expect(extensionForMime('video/mp4')).toBe('mp4');
    expect(extensionForMime('application/x-thing')).toBe('bin');
  });
});

describe('embedSetImages', () => {
  it('embeds remote urls as data URIs and drops imagePaths', async () => {
    const set = makeSet({ imagePaths: ['users/u/img.png'] });
    const fetchMedia = vi
      .fn()
      .mockResolvedValue(new Blob(['hello'], { type: 'image/png' }));
    const { set: out, warnings } = await embedSetImages(set, fetchMedia);
    expect(out.imageUrls[0]).toBe(PNG_DATA_URI);
    expect(out.imagePaths).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it('keeps the remote url and warns when a fetch fails', async () => {
    const { set: out, warnings } = await embedSetImages(makeSet(), () =>
      Promise.reject(new Error('nope'))
    );
    expect(out.imageUrls[0]).toBe('https://example.com/a.png');
    expect(warnings).toHaveLength(1);
  });

  it('leaves already-embedded slides untouched', async () => {
    const fetchMedia = vi.fn();
    const { set: out } = await embedSetImages(
      makeSet({ imageUrls: [PNG_DATA_URI] }),
      fetchMedia
    );
    expect(out.imageUrls[0]).toBe(PNG_DATA_URI);
    expect(fetchMedia).not.toHaveBeenCalled();
  });

  it('never fetches video-kind slides and warns they stay linked', async () => {
    const fetchMedia = vi.fn();
    const { set: out, warnings } = await embedSetImages(
      makeSet({
        imageUrls: ['https://example.com/clip.mp4'],
        imageKinds: ['video'],
      }),
      fetchMedia
    );
    expect(fetchMedia).not.toHaveBeenCalled();
    expect(out.imageUrls[0]).toBe('https://example.com/clip.mp4');
    expect(warnings.join(' ')).toMatch(/video.*linked online/);
  });

  it('keeps oversize media linked instead of embedding', async () => {
    const bigBlob = { size: 26 * 1024 * 1024, type: 'image/png' } as Blob;
    const { set: out, warnings } = await embedSetImages(makeSet(), () =>
      Promise.resolve(bigBlob)
    );
    expect(out.imageUrls[0]).toBe('https://example.com/a.png');
    expect(warnings.join(' ')).toMatch(/larger than 25MB/);
  });

  it('warns about step-level uploaded media', async () => {
    const set = makeSet({ imageUrls: [PNG_DATA_URI] });
    set.steps[0].audioUrl = 'https://storage/audio.mp3';
    const { warnings } = await embedSetImages(set, vi.fn());
    expect(warnings.join(' ')).toMatch(/audio\/video/);
  });

  it('aborts the whole export once the total embed budget is exceeded', async () => {
    // Each slide is under the per-file 25MB cap, but five of them together
    // exceed the 100MB total budget.
    const perSlideBytes = 21 * 1024 * 1024;
    const set = makeSet({
      imageUrls: Array.from(
        { length: 5 },
        (_, i) => `https://example.com/${i}.png`
      ),
    });
    const fetchMedia = vi
      .fn()
      .mockResolvedValue({ size: perSlideBytes, type: 'image/png' } as Blob);
    await expect(embedSetImages(set, fetchMedia)).rejects.toThrow(
      GlExportBudgetExceededError
    );
  });

  it('accounts for base64 inflation when checking the total embed budget', async () => {
    // Raw bytes alone stay under 100MB, but base64 (~4/3x) pushes them over.
    const perSlideBytes = 19 * 1024 * 1024;
    const set = makeSet({
      imageUrls: Array.from(
        { length: 4 },
        (_, i) => `https://example.com/${i}.png`
      ),
    });
    const fetchMedia = vi
      .fn()
      .mockResolvedValue({ size: perSlideBytes, type: 'image/png' } as Blob);
    await expect(embedSetImages(set, fetchMedia)).rejects.toThrow(
      GlExportBudgetExceededError
    );
  });
});

describe('rehostImportedSetImages', () => {
  it('uploads data URIs and rewrites urls + paths', async () => {
    const upload = vi.fn().mockResolvedValue({
      url: 'https://storage/new.png',
      storagePath: 'users/u/hotspot_images/new.png',
    });
    const { set: out, warnings } = await rehostImportedSetImages(
      makeSet({ imageUrls: [PNG_DATA_URI] }),
      upload
    );
    expect(upload).toHaveBeenCalledOnce();
    expect(out.imageUrls).toEqual(['https://storage/new.png']);
    expect(out.imagePaths).toEqual(['users/u/hotspot_images/new.png']);
    expect(warnings).toEqual([]);
  });

  it('keeps remote urls with a warning and skips upload', async () => {
    const upload = vi.fn();
    const { set: out, warnings } = await rehostImportedSetImages(
      makeSet(),
      upload
    );
    expect(upload).not.toHaveBeenCalled();
    expect(out.imageUrls).toEqual(['https://example.com/a.png']);
    expect(out.imagePaths).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });

  it('reports each successful upload incrementally via onUploaded', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({
        url: 'https://storage/1.png',
        storagePath: 'users/u/1.png',
      })
      .mockResolvedValueOnce({
        url: 'https://storage/2.png',
        storagePath: 'users/u/2.png',
      });
    const onUploaded = vi.fn();
    await rehostImportedSetImages(
      makeSet({ imageUrls: [PNG_DATA_URI, PNG_DATA_URI] }),
      upload,
      onUploaded
    );
    expect(onUploaded).toHaveBeenCalledTimes(2);
    expect(onUploaded).toHaveBeenNthCalledWith(1, 'users/u/1.png');
    expect(onUploaded).toHaveBeenNthCalledWith(2, 'users/u/2.png');
  });

  it('still reports prior successful uploads when a later one throws', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({
        url: 'https://storage/1.png',
        storagePath: 'users/u/1.png',
      })
      .mockRejectedValueOnce(new Error('upload failed'));
    const onUploaded = vi.fn();
    await expect(
      rehostImportedSetImages(
        makeSet({ imageUrls: [PNG_DATA_URI, PNG_DATA_URI] }),
        upload,
        onUploaded
      )
    ).rejects.toThrow('upload failed');
    expect(onUploaded).toHaveBeenCalledOnce();
    expect(onUploaded).toHaveBeenCalledWith('users/u/1.png');
  });
});

describe('prepareImportedSet', () => {
  it('mints a fresh id/timestamps and drops isBuilding', () => {
    const out = prepareImportedSet(
      makeSet({ isBuilding: true, schemaVersion: 2 }),
      'uid-1'
    );
    expect(out.id).not.toBe('set-1234-5678');
    expect(out.isBuilding).toBeUndefined();
    expect(out.authorUid).toBe('uid-1');
    expect(out.schemaVersion).toBe(2);
    expect(out.createdAt).toBeGreaterThan(2);
  });

  it('leaves schemaVersion absent for legacy files', () => {
    const out = prepareImportedSet(makeSet());
    expect('schemaVersion' in out && out.schemaVersion !== undefined).toBe(
      false
    );
  });
});

describe('parseGuidedLearningJson', () => {
  it('parses a valid export and warns about remote slides', () => {
    const { set, warnings } = parseGuidedLearningJson(
      JSON.stringify(makeSet())
    );
    expect(set.title).toBe('Cell Diagram');
    expect(warnings).toHaveLength(1);
  });

  it('is warning-free for fully embedded exports', () => {
    const { warnings } = parseGuidedLearningJson(
      JSON.stringify(makeSet({ imageUrls: [PNG_DATA_URI] }))
    );
    expect(warnings).toEqual([]);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseGuidedLearningJson('not json')).toThrow(/valid JSON/);
  });

  it('rejects JSON that is not a guided learning set', () => {
    expect(() => parseGuidedLearningJson('{"foo":1}')).toThrow(
      /does not look like/
    );
    expect(() => parseGuidedLearningJson('[1,2]')).toThrow(/single/);
  });

  it('rejects null steps with a friendly message', () => {
    const bad = { ...makeSet(), steps: [null] };
    expect(() => parseGuidedLearningJson(JSON.stringify(bad))).toThrow(
      /step must be an object/
    );
  });

  it('uses source-neutral copy for invalid JSON', () => {
    expect(() => parseGuidedLearningJson('not json')).toThrow(
      /Paste or upload/
    );
  });

  it('rejects a non-string imageUrls entry with a friendly message', () => {
    const bad = { ...makeSet(), imageUrls: [123] };
    expect(() => parseGuidedLearningJson(JSON.stringify(bad))).toThrow(
      /imageUrls must be a string/
    );
  });

  it('normalizes legacy single-image sets', () => {
    const legacy = {
      ...makeSet(),
      imageUrls: undefined,
      imageUrl: 'https://example.com/legacy.png',
    };
    const { set } = parseGuidedLearningJson(JSON.stringify(legacy));
    expect(set.imageUrls).toEqual(['https://example.com/legacy.png']);
  });
});

describe('blobToDataUri', () => {
  it('round-trips with parseDataUri', async () => {
    const uri = await blobToDataUri(new Blob(['hello'], { type: 'image/png' }));
    const parsed = parseDataUri(uri);
    expect(new TextDecoder().decode(parsed?.bytes)).toBe('hello');
  });
});
