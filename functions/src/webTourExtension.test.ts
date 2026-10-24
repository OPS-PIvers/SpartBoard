// The extension's tour calls: token checks, the tour list, the played tour and run validation.
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
  storage: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_o: unknown, h: unknown) => h,
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./glTours', () => ({
  GL_TOURS_COLLECTION: 'building_guided_learning_tours',
}));

import {
  ExtensionCallError,
  MAX_PICTURE_TOTAL_CHARS,
  bearerToken,
  listTours,
  loadTour,
  parseRun,
  parseSetId,
  startHostOf,
  verifyCaller,
  type ExtensionDeps,
} from './webTourExtension';

const CLIENT = 'client-123.apps.googleusercontent.com';

const deps = (over: Partial<ExtensionDeps> = {}): ExtensionDeps => ({
  clientId: CLIENT,
  tokenInfo: () =>
    Promise.resolve({
      aud: CLIENT,
      azp: CLIENT,
      email: 'Teacher@orono.k12.mn.us',
      email_verified: 'true',
      expires_in: '3500',
    }),
  uidForEmail: () => Promise.resolve('uid-1'),
  allowed: () => Promise.resolve(true),
  isAdmin: () => Promise.resolve(false),
  ...over,
});

const status = async (p: Promise<unknown>): Promise<number> => {
  try {
    await p;
    return 200;
  } catch (e) {
    return e instanceof ExtensionCallError ? e.status : -1;
  }
};

const snapshot = (steps: unknown[], extra: Record<string, unknown> = {}) => ({
  publishedAt: 1700,
  set: { title: 'Post a grade', surface: 'web', steps },
  ...extra,
});

const step = (id: string, urlPattern: string, picture?: unknown) => ({
  id,
  label: `Step ${id}`,
  text: 'Tip',
  web: {
    urlPattern,
    action: 'click',
    locator: { role: 'link', name: 'Gradebook' },
    note: 'private',
    claudeQuestion: 'why?',
    ...(picture ? { picture } : {}),
  },
});

describe('bearerToken', () => {
  it('reads the token and refuses a missing one', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(() => bearerToken(undefined)).toThrow(ExtensionCallError);
    expect(() => bearerToken('Basic abc')).toThrow(ExtensionCallError);
  });
});

describe('verifyCaller', () => {
  it("returns Google's lowercased email and the account's uid", async () => {
    await expect(verifyCaller('t', deps())).resolves.toEqual({
      email: 'teacher@orono.k12.mn.us',
      uid: 'uid-1',
    });
  });

  it('refuses before the OAuth client is set up', async () => {
    expect(await status(verifyCaller('t', deps({ clientId: '' })))).toBe(503);
  });

  it("refuses another app's token, an expired one, or a failed lookup", async () => {
    const info = (over: Record<string, unknown>) =>
      deps({
        tokenInfo: () =>
          Promise.resolve({
            aud: CLIENT,
            email: 'a@orono.k12.mn.us',
            email_verified: 'true',
            expires_in: '100',
            ...over,
          }),
      });
    expect(await status(verifyCaller('t', info({ aud: 'other' })))).toBe(401);
    expect(await status(verifyCaller('t', info({ azp: 'other' })))).toBe(401);
    expect(await status(verifyCaller('t', info({ expires_in: '0' })))).toBe(
      401
    );
    expect(
      await status(
        verifyCaller(
          't',
          deps({ tokenInfo: () => Promise.reject(new Error()) })
        )
      )
    ).toBe(401);
  });

  it('refuses an unverified or outside email', async () => {
    const info = (over: Record<string, unknown>) =>
      deps({
        tokenInfo: () =>
          Promise.resolve({
            aud: CLIENT,
            email: 'a@orono.k12.mn.us',
            email_verified: 'true',
            expires_in: '100',
            ...over,
          }),
      });
    expect(
      await status(verifyCaller('t', info({ email_verified: 'false' })))
    ).toBe(403);
    expect(
      await status(verifyCaller('t', info({ email: 'a@gmail.com' })))
    ).toBe(403);
    expect(
      await status(
        verifyCaller('t', info({ email: 'a@evil-orono.k12.mn.us.example' }))
      )
    ).toBe(403);
  });

  it('refuses without web-tours access, checked with the uid when there is one', async () => {
    const allowed = vi.fn(() => Promise.resolve(false));
    expect(await status(verifyCaller('t', deps({ allowed })))).toBe(403);
    expect(allowed).toHaveBeenCalledWith('teacher@orono.k12.mn.us', 'uid-1');
  });

  it('lets a staff member with no account through, with no uid', async () => {
    const caller = await verifyCaller(
      't',
      deps({ uidForEmail: () => Promise.resolve(null) })
    );
    expect(caller.uid).toBeNull();
  });
});

describe('startHostOf', () => {
  it("is the first step's host, unless it has a wildcard", () => {
    expect(
      startHostOf(snapshot([step('a', 'https://Orono.Schoology.com/course/*')]))
    ).toBe('orono.schoology.com');
    expect(startHostOf(snapshot([step('a', 'https://*.example.com/')]))).toBe(
      null
    );
    expect(startHostOf(snapshot([step('a', 'http://example.com/')]))).toBe(
      null
    );
    expect(startHostOf(snapshot([]))).toBe(null);
  });
});

describe('listTours', () => {
  it('lists published web tours that can start, with host and step count', () => {
    const tours = listTours([
      {
        id: 'web',
        data: snapshot([
          step('a', 'https://app.example.com/home'),
          step('b', 'https://app.example.com/x'),
        ]),
      },
      {
        id: 'spartboard',
        data: { publishedAt: 1, set: { title: 'Board', steps: [] } },
      },
      { id: 'wild', data: snapshot([step('a', 'https://*.example.com/')]) },
      {
        id: 'noversion',
        data: snapshot([step('a', 'https://app.example.com/')], {
          publishedAt: 'x',
        }),
      },
    ]);
    expect(tours).toEqual([
      {
        id: 'web',
        title: 'Post a grade',
        host: 'app.example.com',
        steps: 2,
        version: 1700,
      },
    ]);
  });
});

describe('loadTour', () => {
  const pic = (name: string) => ({
    path: `web_tour_pictures/set1/${name}.jpg`,
    w: 800,
    h: 600,
  });
  const storeOf = (size: number, data = 'AAAA', mime = 'image/jpeg') => ({
    meta: vi.fn(() => Promise.resolve({ mime, size })),
    download: vi.fn(() => Promise.resolve(data)),
  });

  it('drops private notes and questions and returns pictures by step', async () => {
    const tour = await loadTour(
      'set1',
      snapshot([step('a', 'https://app.example.com/', pic('a'))]),
      storeOf(3)
    );
    expect(tour.steps[0]).toEqual({
      id: 'a',
      label: 'Step a',
      text: 'Tip',
      web: {
        urlPattern: 'https://app.example.com/',
        action: 'click',
        locator: { role: 'link', name: 'Gradebook' },
      },
    });
    expect(tour.pictures).toEqual({
      a: { mime: 'image/jpeg', data: 'AAAA', w: 800, h: 600 },
    });
    expect(tour.version).toBe(1700);
  });

  it("never reads a picture outside the set's folder", async () => {
    const store = storeOf(3);
    const tour = await loadTour(
      'set1',
      snapshot([
        step('a', 'https://app.example.com/', {
          path: 'web_tour_pictures/other/a.jpg',
          w: 1,
          h: 1,
        }),
      ]),
      store
    );
    expect(store.meta).not.toHaveBeenCalled();
    expect(store.download).not.toHaveBeenCalled();
    expect(tour.pictures).toEqual({});
  });

  it('spends the total budget in step order and never downloads what does not fit', async () => {
    const store = storeOf((MAX_PICTURE_TOTAL_CHARS / 2 / 4) * 3 + 3);
    const tour = await loadTour(
      'set1',
      snapshot([
        step('a', 'https://app.example.com/', pic('a')),
        step('b', 'https://app.example.com/', pic('b')),
      ]),
      store
    );
    expect(Object.keys(tour.pictures)).toEqual(['a']);
    expect(store.meta).toHaveBeenCalledTimes(2);
    expect(store.download).toHaveBeenCalledTimes(1);
    expect(store.download).toHaveBeenCalledWith('web_tour_pictures/set1/a.jpg');
  });

  it('skips a picture of another type or over the size cap', async () => {
    const gif = storeOf(3, 'AAAA', 'image/gif');
    const huge = storeOf(5 * 1024 * 1024 + 1);
    for (const store of [gif, huge]) {
      const tour = await loadTour(
        'set1',
        snapshot([step('a', 'https://app.example.com/', pic('a'))]),
        store
      );
      expect(tour.pictures).toEqual({});
      expect(store.download).not.toHaveBeenCalled();
    }
  });

  it('plays the tour without a picture that fails to load', async () => {
    const tour = await loadTour(
      'set1',
      snapshot([step('a', 'https://app.example.com/', pic('a'))]),
      {
        meta: () => Promise.resolve({ mime: 'image/jpeg', size: 3 }),
        download: () => Promise.reject(new Error('gone')),
      }
    );
    expect(tour.pictures).toEqual({});
    expect(tour.steps).toHaveLength(1);
  });

  it('refuses a missing, unpublished or SpartBoard tour', async () => {
    const read = storeOf(3);
    expect(await status(loadTour('set1', null, read))).toBe(404);
    expect(
      await status(
        loadTour('set1', { publishedAt: 1, set: { steps: [] } }, read)
      )
    ).toBe(404);
  });
});

describe('parseRun', () => {
  const run = {
    v: 1700,
    startedAt: 1,
    furthest: 2,
    done: false,
    misses: ['a'],
    weak: ['b:score'],
    fixes: { a: { role: 'button', name: 'Save' } },
  };

  it('keeps a valid run and marks it web', () => {
    expect(parseRun(run, false)).toEqual({ ...run, surface: 'web' });
  });

  it('sets admin from the server, never the body', () => {
    expect(parseRun({ ...run, admin: true }, false)).not.toHaveProperty(
      'admin'
    );
    expect(parseRun(run, true).admin).toBe(true);
  });

  it('refuses what the runs rule refuses', () => {
    const bad = [
      { ...run, v: 1.5 },
      { ...run, furthest: -1 },
      { ...run, furthest: 501 },
      { ...run, done: 'no' },
      { ...run, exit: 'x' },
      { ...run, misses: Array.from({ length: 51 }, (_, i) => `s${i}`) },
      { ...run, weak: [1] },
      { ...run, fixes: [] },
      { ...run, fixes: { a: 'x'.repeat(10) } },
      { ...run, fixes: { a: { name: 'x'.repeat(5000) } } },
      null,
    ];
    for (const b of bad) expect(() => parseRun(b, false)).toThrow();
  });
});

describe('parseSetId', () => {
  it('takes a plain id only', () => {
    expect(parseSetId({ setId: 'abc_1-2' })).toBe('abc_1-2');
    expect(() => parseSetId({ setId: '../x' })).toThrow();
    expect(() => parseSetId({})).toThrow();
  });
});
