// Public tour links: every refusal looks the same, the response carries only public fields, and a picture change turns the link off.
/* eslint-disable @typescript-eslint/require-await -- the fakes stand in for async SDK calls */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  links: new Map<string, Record<string, unknown>>(),
  tours: new Map<string, Record<string, unknown>>(),
  admins: new Set<string>(),
  files: new Map<string, { bytes: Uint8Array; generation: string }>(),
  reads: [] as string[],
  updates: [] as { path: string; patch: Record<string, unknown> }[],
}));

vi.mock('./firebaseAdmin', () => {
  const docSnap = (data: Record<string, unknown> | undefined, id = '') => ({
    exists: data !== undefined,
    id,
    data: () => data,
    get: (k: string) => data?.[k],
  });
  const LINKS = 'admin_settings/tour_public_links/tours';
  const linkCol = {
    where: (_f: string, _op: string, token: string) => ({
      limit: () => ({
        get: async () => {
          fake.reads.push(`${LINKS}?token`);
          const docs = [...fake.links.entries()]
            .filter(([, d]) => d.token === token)
            .map(([id, d]) => docSnap(d, id));
          return { size: docs.length, docs };
        },
      }),
    }),
    doc: (id: string) => ({
      get: async () => {
        fake.reads.push(`${LINKS}/${id}`);
        return docSnap(fake.links.get(id), id);
      },
      update: async (patch: Record<string, unknown>) => {
        fake.updates.push({ path: `${LINKS}/${id}`, patch });
        const d = fake.links.get(id);
        if (!d) throw new Error('missing');
        fake.links.set(id, { ...d, ...patch });
      },
    }),
  };
  const db = {
    doc: (path: string) => ({
      collection: (name: string) => {
        if (`${path}/${name}` !== LINKS) throw new Error(`unexpected ${path}`);
        return linkCol;
      },
    }),
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          fake.reads.push(`${name}/${id}`);
          return docSnap(
            name === 'admins'
              ? fake.admins.has(id)
                ? {}
                : undefined
              : name === 'global_permissions'
                ? undefined
                : fake.tours.get(id),
            id
          );
        },
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
        // A pinned generation that is no longer live is gone, as without object versioning.
        file: (path: string, opts?: { generation?: string }) => {
          const live = () => {
            const f = fake.files.get(path);
            if (!f || (opts?.generation && opts.generation !== f.generation))
              throw Object.assign(new Error('No such object'), { code: 404 });
            return f;
          };
          return {
            getMetadata: async () => {
              const f = live();
              return [{ size: f.bytes.length, generation: f.generation }];
            },
            download: async () => [Buffer.from(live().bytes)],
          };
        },
      }),
    }),
  };
});
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_o: unknown, h: unknown) => h,
  onCall: (_o: unknown, h: unknown) => h,
  HttpsError: class extends Error {},
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
  clientKey,
  guardPublicLink,
  handlePublicRequest,
  startSetIdFor,
  workingLinkTokenFor,
  rateLimited,
  tourPublicLinkGuard,
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

const WEB_PATH = `web_tour_pictures/${SET}/a.png`;

const record = (
  set: unknown,
  over: Partial<PublicLinkRecord> = {}
): PublicLinkRecord => ({
  token: TOKEN,
  fingerprint: pictureFingerprint(set) ?? '',
  kind: 'web',
  confirmedBy: 'admin@example.com',
  confirmedAt: 1,
  pictures: { [WEB_PATH]: '1', [LIVE_PATH]: '1' },
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
  isAdmin: async () => true,
  flagOn: async () => true,
  latchOff: vi.fn(async () => undefined),
  bucket: BUCKET,
  pictureGeneration: async () => '1',
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
    ['flag off', TOKEN, deps(set, ok, { flagOn: async () => false })],
    [
      'confirmer no longer an admin',
      TOKEN,
      deps(set, ok, { isAdmin: async () => false }),
    ],
    [
      'picture overwritten in place',
      TOKEN,
      deps(set, ok, { pictureGeneration: async () => '2' }),
    ],
    [
      'picture overwritten in place, picture request',
      TOKEN,
      deps(set, ok, { pictureGeneration: async () => '2' }),
      's1',
    ],
    [
      'picture deleted',
      TOKEN,
      deps(set, ok, { pictureGeneration: async () => null }),
    ],
    [
      'Storage error while checking',
      TOKEN,
      deps(set, ok, {
        pictureGeneration: () => Promise.reject(new Error('503')),
      }),
    ],
    ['picture never confirmed', TOKEN, deps(set, { ...ok, pictures: {} })],
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

  it('says why when the confirming admin is no longer an admin, and only then', async () => {
    const gone = deps(set, ok, { isAdmin: async () => false });
    await handlePublicRequest({ t: TOKEN }, gone);
    expect(gone.latchOff).toHaveBeenCalledWith(SET, 'confirmer');
    const flagOff = deps(set, ok, { flagOn: async () => false });
    await handlePublicRequest({ t: TOKEN }, flagOff);
    expect(flagOff.latchOff).not.toHaveBeenCalled();
  });

  it('refuses repeated or path-like parameters before reading anything', async () => {
    const findLink = vi.fn(async () => null);
    for (const q of [
      { t: [TOKEN, TOKEN] },
      { t: TOKEN, p: ['s1', 's1'] },
      { t: TOKEN, p: '../s1' },
      { t: TOKEN, p: 'a/b' },
      { t: TOKEN, p: '%2e%2e' },
      { t: `${TOKEN}/x` },
    ])
      expect(await handlePublicRequest(q, deps(set, ok, { findLink }))).toEqual(
        {
          status: 404,
        }
      );
    expect(findLink).not.toHaveBeenCalled();
  });

  it('does not switch the link off over a Storage error', async () => {
    const d = deps(set, ok, {
      pictureGeneration: () => Promise.reject(new Error('503')),
    });
    await handlePublicRequest({ t: TOKEN }, d).catch(() => null);
    expect(d.latchOff).not.toHaveBeenCalled();
  });

  it('checks only the asked-for picture on a picture request', async () => {
    const pictureGeneration = vi.fn(async () => '1');
    await handlePublicRequest(
      { t: TOKEN, p: 's1' },
      deps(set, ok, { pictureGeneration })
    );
    expect(pictureGeneration).toHaveBeenCalledTimes(1);
    expect(pictureGeneration).toHaveBeenCalledWith(WEB_PATH);
  });

  it('serves after a text-only republish', async () => {
    const d = deps(webSet({ text: 'New words.' }), ok);
    const out = await handlePublicRequest({ t: TOKEN }, d);
    expect(out.status).toBe(200);
    expect(d.latchOff).not.toHaveBeenCalled();
  });
});

describe('startSetIdFor', () => {
  const set = webSet();
  const staff = vi.fn(async () => true);
  beforeEach(() => staff.mockClear());

  it('names a web tour for staff', async () => {
    expect(await startSetIdFor(TOKEN, staff, deps(set, record(set)))).toBe(SET);
  });

  it('refuses a caller who is not staff', async () => {
    const no = async () => false;
    expect(await startSetIdFor(TOKEN, no, deps(set, record(set)))).toBeNull();
  });

  it('refuses a malformed token before asking who the caller is', async () => {
    expect(
      await startSetIdFor(['x'], staff, deps(set, record(set)))
    ).toBeNull();
    expect(staff).not.toHaveBeenCalled();
  });

  it('refuses an unknown token and a live tour', async () => {
    expect(
      await startSetIdFor('f'.repeat(32), staff, deps(set, record(set)))
    ).toBeNull();
    const live = liveSet();
    expect(
      await startSetIdFor(
        TOKEN,
        staff,
        deps(live, record(live, { kind: 'live' }))
      )
    ).toBeNull();
  });
});

describe('workingLinkTokenFor', () => {
  const set = webSet();
  const withLink = (rec: PublicLinkRecord | null, over = {}) => ({
    ...deps(set, rec, over),
    getLink: async (id: string) => (id === SET ? rec : null),
  });

  it('gives the token of a link that is served now', async () => {
    expect(await workingLinkTokenFor(SET, withLink(record(set)))).toBe(TOKEN);
  });

  it('gives nothing for a tour with no link or another tour', async () => {
    expect(await workingLinkTokenFor(SET, withLink(null))).toBeNull();
    expect(
      await workingLinkTokenFor('other', withLink(record(set)))
    ).toBeNull();
  });

  it('gives nothing for a link that is off or would be refused', async () => {
    const off = { ...record(set), off: { reason: 'pictures' as const, at: 2 } };
    expect(await workingLinkTokenFor(SET, withLink(off))).toBeNull();
    expect(
      await workingLinkTokenFor(
        SET,
        withLink(record(set), { flagOn: async () => false })
      )
    ).toBeNull();
    expect(
      await workingLinkTokenFor(
        SET,
        withLink(record(set), { pictureGeneration: async () => '2' })
      )
    ).toBeNull();
  });

  it('gives nothing for a live tour', async () => {
    const live = liveSet();
    const rec = record(live, { kind: 'live' });
    expect(
      await workingLinkTokenFor(SET, {
        ...deps(live, rec),
        getLink: async () => rec,
      })
    ).toBeNull();
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
    expect(read).toHaveBeenCalledWith(LIVE_PATH, '1');
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

describe('clientKey', () => {
  it('uses the hop the platform appends, not what the caller sent first', () => {
    expect(clientKey('6.6.6.6, 1.2.3.4', '10.0.0.1')).toBe('1.2.3.4');
    expect(clientKey('1.2.3.4', '10.0.0.1')).toBe('1.2.3.4');
    expect(clientKey(undefined, '10.0.0.1')).toBe('10.0.0.1');
    expect(clientKey(' , ', undefined)).toBe('unknown');
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
    fake.reads.length = 0;
    fake.updates.length = 0;
    vi.mocked(isGlobalFeatureGranted).mockResolvedValue(true);
    const set = webSet();
    fake.tours.set(SET, { set, surface: 'web', publishedBy: 'author-uid' });
    fake.links.set(SET, { ...record(set) });
    fake.admins.add('admin@example.com');
    fake.files.set(WEB_PATH, { bytes: PNG, generation: '1' });
  });

  const overwrite = (path: string) =>
    fake.files.set(path, {
      bytes: new Uint8Array([...PNG, 1]),
      generation: '2',
    });

  it.each([
    ['tour', {}],
    ['picture', { p: 's1' }],
  ])(
    'refuses a web picture overwritten in place (%s request) and latches the link off',
    async (_kind, extra) => {
      overwrite(WEB_PATH);
      const res = await call({ t: TOKEN, ...extra });
      expect(res.statusCode).toBe(404);
      expect(fake.links.get(SET)?.off).toMatchObject({ reason: 'pictures' });
    }
  );

  it.each([
    ['tour', {}],
    ['picture', { p: 'l1' }],
  ])(
    'refuses a Live thumbnail overwritten in place (%s request) and latches the link off',
    async (_kind, extra) => {
      const set = liveSet();
      fake.tours.set(SET, { set });
      fake.links.set(SET, { ...record(set, { kind: 'live' }) });
      fake.files.set(LIVE_PATH, { bytes: PNG, generation: '1' });
      expect((await call({ t: TOKEN })).statusCode).toBe(200);
      // Same path and the same download URL in the published copy; only the bytes changed.
      overwrite(LIVE_PATH);
      const res = await call({ t: TOKEN, ...extra });
      expect(res.statusCode).toBe(404);
      expect(fake.links.get(SET)?.off).toMatchObject({ reason: 'pictures' });
    }
  );

  it("serves a Live tour without the author's uid, the Storage path or a download token", async () => {
    const set = liveSet();
    fake.tours.set(SET, { set, publishedBy: 'author' });
    fake.links.set(SET, { ...record(set, { kind: 'live' }) });
    fake.files.set(LIVE_PATH, { bytes: PNG, generation: '1' });
    const tour = await call({ t: TOKEN });
    const pic = await call({ t: TOKEN, p: 'l1' });
    expect(pic.statusCode).toBe(200);
    const exposed = [
      JSON.stringify(tour.body),
      JSON.stringify(tour.headers),
      JSON.stringify(pic.headers),
    ].join('\n');
    for (const leak of [
      'author',
      'users/',
      'hotspot_images',
      'token=',
      'secret-token',
      'firebasestorage',
    ])
      expect(exposed).not.toContain(leak);
    expect(Object.keys(pic.headers).sort()).toEqual([
      'Cache-Control',
      'Content-Type',
      'Referrer-Policy',
      'X-Content-Type-Options',
    ]);
  });

  it('refuses a link whose tour id is not in the tours collection, the same way', async () => {
    fake.links.set('no-such-tour', {
      ...record(webSet()),
      token: 'a'.repeat(32),
    });
    const res = await call({ t: 'a'.repeat(32) });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'not-found' });
    expect(res.headers['Cache-Control']).toBe(NOT_FOUND_CACHE);
  });

  it('records why when the confirming admin was removed, behind the same not-found', async () => {
    fake.admins.clear();
    const res = await call({ t: TOKEN });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'not-found' });
    expect(fake.links.get(SET)?.off).toMatchObject({ reason: 'confirmer' });
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

type Trigger = (event: { params: { setId: string } }) => Promise<void>;

describe('tourPublicLinkGuard', () => {
  beforeEach(() => {
    fake.links.clear();
    fake.tours.clear();
    fake.reads.length = 0;
    fake.updates.length = 0;
  });

  it('costs one read for a tour with no public link, and writes nothing', async () => {
    fake.tours.set(SET, { set: webSet() });
    await (tourPublicLinkGuard as unknown as Trigger)({
      params: { setId: SET },
    });
    expect(fake.reads).toEqual([
      `admin_settings/tour_public_links/tours/${SET}`,
    ]);
    expect(fake.updates).toEqual([]);
  });

  it('writes only under admin_settings, so it never triggers itself', async () => {
    fake.tours.set(SET, {
      set: webSet({ path: `web_tour_pictures/${SET}/new.png` }),
    });
    fake.links.set(SET, { ...record(webSet()) });
    await (tourPublicLinkGuard as unknown as Trigger)({
      params: { setId: SET },
    });
    expect(fake.updates.map((u) => u.path)).toEqual([
      `admin_settings/tour_public_links/tours/${SET}`,
    ]);
    expect(fake.updates[0].patch.off).toMatchObject({ reason: 'pictures' });
  });

  it('skips the collection control docs', async () => {
    await (tourPublicLinkGuard as unknown as Trigger)({
      params: { setId: '_meta' },
    });
    expect(fake.reads).toEqual([]);
  });
});
