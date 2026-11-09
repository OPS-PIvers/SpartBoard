// Public tour links: every refusal looks the same, the response carries only public fields, and a picture change turns the link off.
/* eslint-disable @typescript-eslint/require-await -- the fakes stand in for async SDK calls */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  links: new Map<string, Record<string, unknown>>(),
  tours: new Map<string, Record<string, unknown>>(),
  admins: new Set<string>(),
  files: new Map<string, Uint8Array>(),
}));

vi.mock('./firebaseAdmin', () => {
  const docSnap = (data: Record<string, unknown> | undefined, id = '') => ({
    exists: data !== undefined,
    id,
    data: () => data,
    get: (k: string) => data?.[k],
  });
  const linkCol = {
    where: (_f: string, _op: string, token: string) => ({
      limit: () => ({
        get: async () => {
          const docs = [...fake.links.entries()]
            .filter(([, d]) => d.token === token)
            .map(([id, d]) => docSnap(d, id));
          return { size: docs.length, docs };
        },
      }),
    }),
    doc: (id: string) => ({
      get: async () => docSnap(fake.links.get(id), id),
      update: async (patch: Record<string, unknown>) => {
        const d = fake.links.get(id);
        if (!d) throw new Error('missing');
        fake.links.set(id, { ...d, ...patch });
      },
    }),
  };
  const db = {
    doc: () => ({ collection: () => linkCol }),
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () =>
          docSnap(
            name === 'admins'
              ? fake.admins.has(id)
                ? {}
                : undefined
              : name === 'global_permissions'
                ? undefined
                : fake.tours.get(id),
            id
          ),
      }),
    }),
  };
  return {
    apps: [{ name: '[DEFAULT]' }],
    initializeApp: vi.fn(),
    firestore: () => db,
    storage: () => ({
      bucket: () => ({
        name: 'spartboard.appspot.com',
        file: (path: string) => ({
          getMetadata: async () => [
            { size: fake.files.get(path)?.length ?? 0 },
          ],
          download: async () => {
            const f = fake.files.get(path);
            if (!f) throw new Error('no file');
            return [Buffer.from(f)];
          },
        }),
      }),
    }),
  };
});
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_o: unknown, h: unknown) => h,
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_o: unknown, h: unknown) => h,
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./glTours', () => ({
  GL_TOURS_COLLECTION: 'building_guided_learning_tours',
}));
vi.mock('./quizMediaArchive', () => ({
  isGlobalFeatureGranted: vi.fn(async () => true),
}));

import {
  NOT_FOUND_CACHE,
  OK_CACHE,
  RATE_PER_CLIENT,
  __resetRateLimitForTests,
  guardPublicLink,
  handlePublicRequest,
  rateLimited,
  tourPublicStepsV1,
  type PublicLinkDeps,
} from './tourPublicLink';
import {
  livePicturePath,
  pictureFingerprint,
  type PublicLinkRecord,
} from './tourPublicLinkModel';
import { isGlobalFeatureGranted } from './quizMediaArchive';

const TOKEN = '0123456789abcdef0123456789abcdef';
const SET = 'set-1';
const BUCKET = 'spartboard.appspot.com';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);

const webSet = (
  over: { path?: string; text?: string; markup?: unknown[] } = {}
) => ({
  id: SET,
  title: 'Post a grade',
  surface: 'web',
  authorUid: 'author-uid',
  steps: [
    {
      id: 's1',
      label: 'Open the gradebook',
      text: over.text ?? 'Click Gradebook.',
      note: 'private note',
      claudeQuestion: 'why?',
      web: {
        urlPattern: 'https://school.example/*',
        action: 'click',
        showWhen: { kind: 'target' },
        doneWhen: { kind: 'url', pattern: 'https://school.example/done' },
        locator: {
          role: 'link',
          name: 'Gradebook',
          box: { x: 0.1, y: 0.1, w: 0.1, h: 0.05 },
        },
        picture: {
          path: over.path ?? `web_tour_pictures/${SET}/a.png`,
          w: 800,
          h: 450,
          cssW: 800,
          target: { x: 0.2, y: 0.3, w: 0.1, h: 0.1 },
          original: {
            path: `web_tour_pictures/${SET}/orig.png`,
            w: 1440,
            h: 900,
            crop: { x: 0, y: 0, w: 1, h: 1 },
          },
          markup: over.markup ?? [
            { id: 'm1', kind: 'box', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
          ],
        },
      },
    },
    {
      id: 's2',
      label: 'Look',
      text: 'That is all.',
      web: { urlPattern: 'https://school.example/x', action: 'observe' },
    },
  ],
});

const liveUrl = (path: string, bucket = BUCKET) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=secret-token`;
const LIVE_PATH = 'users/author/hotspot_images/1700-tour-step-s1.png';

const liveSet = (url = liveUrl(LIVE_PATH)) => ({
  id: SET,
  title: 'Add a timer',
  mode: 'tour',
  imageUrls: ['https://lh3.googleusercontent.com/d/drive-file'],
  steps: [
    {
      id: 'l1',
      label: 'Open the tools',
      text: 'Click **Open Tools**.',
      tour: {
        anchor: 'dock.open-tools',
        action: 'click',
        thumbnail: {
          url,
          anchor: 'dock.open-tools',
          w: 320,
          h: 140,
          target: { x: 0.3, y: 0.3, w: 0.3, h: 0.3 },
        },
      },
    },
    {
      id: 'l2',
      label: 'Done',
      text: 'Bye',
      tour: { anchor: 'board.whole', action: 'observe' },
    },
  ],
});

const record = (
  set: unknown,
  over: Partial<PublicLinkRecord> = {}
): PublicLinkRecord => ({
  token: TOKEN,
  fingerprint: pictureFingerprint(set) ?? '',
  kind: 'web',
  confirmedBy: 'admin@example.com',
  confirmedAt: 1,
  ...over,
});

const deps = (
  published: unknown,
  rec: PublicLinkRecord | null,
  over: Partial<PublicLinkDeps> = {}
): PublicLinkDeps => ({
  findLink: async (t) =>
    rec && t === rec.token ? { setId: SET, record: rec } : null,
  loadPublished: async () => published,
  confirmerAllowed: async () => true,
  latchOff: vi.fn(async () => undefined),
  bucket: BUCKET,
  readPicture: async () => PNG,
  ...over,
});

describe('handlePublicRequest refusals', () => {
  const set = webSet();
  const ok = record(set);
  const cases: [string, unknown, PublicLinkDeps, unknown?][] = [
    ['malformed token', 'abc', deps(set, ok)],
    ['token as an array', [TOKEN], deps(set, ok)],
    ['unknown token', 'f'.repeat(32), deps(set, ok)],
    [
      'switched off',
      TOKEN,
      deps(set, { ...ok, off: { reason: 'pictures', at: 2 } }),
    ],
    [
      'flag off or confirmer no longer admin',
      TOKEN,
      deps(set, ok, { confirmerAllowed: async () => false }),
    ],
    ['unpublished', TOKEN, deps(null, ok)],
    ['kind changed', TOKEN, deps(set, { ...ok, kind: 'live' })],
    [
      'picture changed',
      TOKEN,
      deps(webSet({ path: `web_tour_pictures/${SET}/b.png` }), ok),
    ],
    ['markup changed', TOKEN, deps(webSet({ markup: [] }), ok)],
    ['picture of an unknown step', TOKEN, deps(set, ok), 'nope'],
    ['picture of a step without one', TOKEN, deps(set, ok), 's2'],
    ['picture id with a slash', TOKEN, deps(set, ok), '../s1'],
    [
      'picture file missing',
      TOKEN,
      deps(set, ok, { readPicture: async () => null }),
      's1',
    ],
    [
      'picture read fails',
      TOKEN,
      deps(set, ok, { readPicture: () => Promise.reject(new Error('x')) }),
      's1',
    ],
    [
      'picture is not an image',
      TOKEN,
      deps(set, ok, { readPicture: async () => new Uint8Array(12) }),
      's1',
    ],
  ];
  it.each(cases)('%s: the same not-found', async (_name, t, d, p) => {
    expect(await handlePublicRequest({ t, ...(p ? { p } : {}) }, d)).toEqual({
      status: 404,
    });
  });

  it('turns the link off when the pictures no longer match', async () => {
    const d = deps(webSet({ path: `web_tour_pictures/${SET}/b.png` }), ok);
    await handlePublicRequest({ t: TOKEN }, d);
    expect(d.latchOff).toHaveBeenCalledWith(SET, 'pictures');
  });

  it('serves after a text-only republish', async () => {
    const d = deps(webSet({ text: 'New words.' }), ok);
    const out = await handlePublicRequest({ t: TOKEN }, d);
    expect(out.status).toBe(200);
    expect(d.latchOff).not.toHaveBeenCalled();
  });
});

describe('the public response', () => {
  it('has exactly the public fields for a web tour', async () => {
    const set = webSet();
    const out = await handlePublicRequest({ t: TOKEN }, deps(set, record(set)));
    if (!('tour' in out)) throw new Error('expected a tour');
    expect(Object.keys(out.tour).sort()).toEqual(['kind', 'steps', 'title']);
    expect(out.tour.kind).toBe('web');
    const [s1, s2] = out.tour.steps;
    expect(Object.keys(s1).sort()).toEqual([
      'id',
      'observe',
      'onlyIfAppears',
      'picture',
      'text',
      'title',
    ]);
    expect(Object.keys(s1.picture ?? {}).sort()).toEqual([
      'cssW',
      'h',
      'markup',
      'target',
      'w',
    ]);
    expect(s1).toMatchObject({
      title: 'Open the gradebook',
      onlyIfAppears: true,
      observe: false,
    });
    expect(s1.picture?.target).toEqual({ x: 0.2, y: 0.3, w: 0.1, h: 0.1 });
    expect(Object.keys(s1.picture?.markup?.[0] ?? {}).sort()).toEqual([
      'h',
      'id',
      'kind',
      'w',
      'x',
      'y',
    ]);
    expect(s2).toEqual({
      id: 's2',
      title: 'Look',
      text: 'That is all.',
      onlyIfAppears: false,
      observe: true,
      picture: null,
    });
    const json = JSON.stringify(out.tour);
    for (const leak of [
      'orig',
      'school.example',
      'Gradebook"',
      'private',
      'why?',
      'author',
      'web_tour_pictures',
      SET,
    ])
      expect(json).not.toContain(leak);
  });

  it('has exactly the public fields for a Live tour, and never its picture address', async () => {
    const set = liveSet();
    const out = await handlePublicRequest(
      { t: TOKEN },
      deps(set, record(set, { kind: 'live' }))
    );
    if (!('tour' in out)) throw new Error('expected a tour');
    expect(out.tour.kind).toBe('live');
    expect(out.tour.steps.map((s) => s.id)).toEqual(['l1', 'l2']);
    expect(out.tour.steps[0].picture).toEqual({
      w: 320,
      h: 140,
      cssW: 320,
      target: { x: 0.3, y: 0.3, w: 0.3, h: 0.3 },
    });
    // A whole-board step shows the legacy slide, which lives on Drive and is never fetched by the function.
    expect(out.tour.steps[1].picture).toBeNull();
    const json = JSON.stringify(out.tour);
    for (const leak of [
      'secret-token',
      'firebasestorage',
      'hotspot_images',
      'googleusercontent',
    ])
      expect(json).not.toContain(leak);
  });

  it('reads the picture of a served step only', async () => {
    const set = liveSet();
    const read = vi.fn(async () => PNG);
    const out = await handlePublicRequest(
      { t: TOKEN, p: 'l1' },
      deps(set, record(set, { kind: 'live' }), { readPicture: read })
    );
    expect(out).toEqual({
      status: 200,
      picture: { bytes: PNG, mime: 'image/png' },
    });
    expect(read).toHaveBeenCalledWith(LIVE_PATH);
  });

  it('never reads a web picture outside the tour folder, or the kept whole screen', async () => {
    const set = webSet({ path: 'web_tour_pictures/other-set/a.png' });
    const read = vi.fn(async () => PNG);
    const out = await handlePublicRequest(
      { t: TOKEN, p: 's1' },
      deps(set, record(set), { readPicture: read })
    );
    expect(out).toEqual({ status: 404 });
    expect(read).not.toHaveBeenCalled();
  });
});

describe('livePicturePath', () => {
  it('accepts only thumbnails in this bucket', () => {
    expect(livePicturePath(liveUrl(LIVE_PATH), BUCKET)).toBe(LIVE_PATH);
    expect(
      livePicturePath(liveUrl(LIVE_PATH, 'other.appspot.com'), BUCKET)
    ).toBeNull();
    expect(
      livePicturePath(liveUrl('web_tour_pictures/x/a.png'), BUCKET)
    ).toBeNull();
    expect(
      livePicturePath(liveUrl('users/a/hotspot_images/../../admins'), BUCKET)
    ).toBeNull();
    expect(
      livePicturePath(
        'http://firebasestorage.googleapis.com/v0/b/x/o/y',
        BUCKET
      )
    ).toBeNull();
    expect(livePicturePath('not a url', BUCKET)).toBeNull();
  });
});

describe('guardPublicLink after a publish', () => {
  const set = webSet();
  const guard = (published: unknown, rec: PublicLinkRecord | null) => {
    const latchOff = vi.fn(async () => undefined);
    return {
      latchOff,
      run: () =>
        guardPublicLink(SET, {
          getLink: async () => rec,
          loadPublished: async () => published,
          latchOff,
        }),
    };
  };
  it('keeps the link through a text edit and a reorder', async () => {
    const reordered = { ...set, steps: [...set.steps].reverse() };
    for (const p of [webSet({ text: 'Other words' }), reordered]) {
      const g = guard(p, record(set));
      expect(await g.run()).toBe('kept');
      expect(g.latchOff).not.toHaveBeenCalled();
    }
  });
  it('turns it off for a new picture file or changed markup', async () => {
    for (const p of [
      webSet({ path: `web_tour_pictures/${SET}/c.png` }),
      webSet({ markup: [] }),
    ]) {
      const g = guard(p, record(set));
      expect(await g.run()).toBe('off');
      expect(g.latchOff).toHaveBeenCalledWith(SET, 'pictures');
    }
  });
  it('turns it off when the tour is unpublished', async () => {
    const g = guard(null, record(set));
    expect(await g.run()).toBe('off');
    expect(g.latchOff).toHaveBeenCalledWith(SET, 'unpublished');
  });
  it('leaves an already-off or missing link alone', async () => {
    expect(await guard(set, null).run()).toBe('none');
    expect(
      await guard(set, {
        ...record(set),
        off: { reason: 'pictures', at: 1 },
      }).run()
    ).toBe('none');
  });
});

describe('rateLimited', () => {
  beforeEach(() => __resetRateLimitForTests());
  it('limits one client per minute and frees it after the window', () => {
    for (let i = 0; i < RATE_PER_CLIENT; i++)
      expect(rateLimited('1.2.3.4', 1000)).toBe(false);
    expect(rateLimited('1.2.3.4', 1000)).toBe(true);
    expect(rateLimited('5.6.7.8', 1000)).toBe(false);
    expect(rateLimited('1.2.3.4', 1000 + 60_001)).toBe(false);
  });
});

type Handler = (req: unknown, res: unknown) => Promise<void>;
const call = async (query: Record<string, string>, method = 'GET') => {
  const res = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: undefined as unknown,
    set(k: string, v: string) {
      this.headers[k] = v;
      return this;
    },
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    send(b: unknown) {
      this.body = b;
      return this;
    },
    end() {
      return this;
    },
  };
  await (tourPublicStepsV1 as unknown as Handler)(
    { method, query, ip: '9.9.9.9', get: () => undefined },
    res
  );
  return res;
};

describe('tourPublicStepsV1', () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    fake.links.clear();
    fake.tours.clear();
    fake.admins.clear();
    fake.files.clear();
    vi.mocked(isGlobalFeatureGranted).mockResolvedValue(true);
    const set = webSet();
    fake.tours.set(SET, { set, surface: 'web', publishedBy: 'author-uid' });
    fake.links.set(SET, { ...record(set) });
    fake.admins.add('admin@example.com');
    fake.files.set(`web_tour_pictures/${SET}/a.png`, PNG);
  });

  it('serves the tour briefly cacheable by the browser only, with no CORS header', async () => {
    const res = await call({ t: TOKEN });
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe(OK_CACHE);
    expect(OK_CACHE).toMatch(/^private, max-age=\d{1,2}$/);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect((res.body as { title: string }).title).toBe('Post a grade');
  });

  it('serves a picture as bytes', async () => {
    const res = await call({ t: TOKEN, p: 's1' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('image/png');
  });

  it('answers every refusal with the same uncached not-found', async () => {
    const bodies: unknown[] = [];
    bodies.push((await call({ t: 'f'.repeat(32) })).body);
    vi.mocked(isGlobalFeatureGranted).mockResolvedValueOnce(false);
    const flagOff = await call({ t: TOKEN });
    bodies.push(flagOff.body);
    fake.admins.clear();
    bodies.push((await call({ t: TOKEN })).body);
    fake.admins.add('admin@example.com');
    fake.tours.delete(SET);
    const gone = await call({ t: TOKEN });
    bodies.push(gone.body);
    expect(gone.statusCode).toBe(404);
    expect(gone.headers['Cache-Control']).toBe(NOT_FOUND_CACHE);
    expect(flagOff.statusCode).toBe(404);
    expect(new Set(bodies.map((b) => JSON.stringify(b)))).toEqual(
      new Set(['{"error":"not-found"}'])
    );
  });

  it('stops serving the moment the link is switched off', async () => {
    expect((await call({ t: TOKEN })).statusCode).toBe(200);
    fake.links.delete(SET);
    expect((await call({ t: TOKEN })).statusCode).toBe(404);
  });

  it('latches the record off when a changed picture is published', async () => {
    fake.tours.set(SET, {
      set: webSet({ path: `web_tour_pictures/${SET}/z.png` }),
      surface: 'web',
    });
    expect((await call({ t: TOKEN })).statusCode).toBe(404);
    expect(fake.links.get(SET)?.off).toMatchObject({ reason: 'pictures' });
    // Publishing the confirmed pictures again does not bring the link back without a new confirm.
    fake.tours.set(SET, { set: webSet(), surface: 'web' });
    expect((await call({ t: TOKEN })).statusCode).toBe(404);
  });

  it('refuses anything but GET', async () => {
    expect((await call({ t: TOKEN }, 'POST')).statusCode).toBe(405);
  });
});
