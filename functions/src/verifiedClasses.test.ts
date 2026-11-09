/* eslint-disable @typescript-eslint/require-await -- mocks mirror the async Admin SDK surface. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  taught: null as Set<string> | null | Error,
  authority: false,
  users: [] as Record<string, unknown>[],
}));

vi.mock('./functionsInit', () => ({}));
vi.mock('./secrets', () => ({
  CLASSLINK_CLIENT_ID: { value: () => 'id' },
  CLASSLINK_CLIENT_SECRET: { value: () => 'secret' },
  CLASSLINK_TENANT_URL: { value: () => 'https://tenant' },
}));
vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { onCall: (_o: unknown, fn: unknown) => fn, HttpsError };
});
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_o: unknown, fn: unknown) => fn,
}));
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: () => '@orono.k12.mn.us',
  resolveOrgIdForDomain: async () => 'orono',
}));
vi.mock('./studentIdentity', () => ({
  loadTeacherClassIds: async () => {
    if (h.taught instanceof Error) throw h.taught;
    return h.taught;
  },
}));
vi.mock('./studentAssignmentTargets', () => ({
  isTestClassAuthority: async () => h.authority,
}));
vi.mock('./viewAsGuard', () => ({ assertViewAsAllowed: async () => null }));
vi.mock('./firebaseAdmin', () => ({
  firestore: () => db,
  auth: () => ({
    getUsers: async (ids: { uid: string }[]) => ({
      users: h.users.filter((u) => ids.some((i) => i.uid === u.uid)),
    }),
  }),
}));

type Doc = Record<string, unknown>;
const docs: Record<string, Doc> = {};
const snap = (path: string) => ({
  exists: path in docs,
  data: () => docs[path],
  get: (k: string) => docs[path]?.[k],
});
const db = {
  doc: (path: string) => ({ path, get: async () => snap(path) }),
  collection: (c: string) => ({
    doc: (id: string) => ({ path: `${c}/${id}` }),
    select: () => ({
      limit: () => ({
        get: async () => ({
          docs: Object.keys(docs)
            .filter((p) => p.startsWith(`${c}/`))
            .map((p) => ({ id: p.slice(c.length + 1) })),
        }),
      }),
    }),
  }),
  collectionGroup: () => ({
    select: () => ({
      get: async () => ({
        docs: Object.keys(docs)
          .filter((p) => /^users\/[^/]+\/rosters\/[^/]+$/.test(p))
          .map((p) => {
            const uid = p.split('/')[1];
            return {
              ref: { parent: { parent: { id: uid, parent: { id: 'users' } } } },
            };
          }),
      }),
    }),
  }),
  getAll: async (...refs: { path: string }[]) => refs.map((r) => snap(r.path)),
  runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
    fn({
      get: async (r: { path: string }) => snap(r.path),
      set: (r: { path: string }, d: Doc) => {
        docs[r.path] = d;
      },
    }),
};

import {
  refreshMyClassesV1,
  refreshVerifiedClasses,
  runVerifiedClassesFill,
  FILL_STALE_MS,
} from './verifiedClasses';

const callRefresh = refreshMyClassesV1 as unknown as (req: {
  auth?: { uid: string; token: Doc };
}) => Promise<{ count: number; classlinkAt: number | null }>;

beforeEach(() => {
  for (const k of Object.keys(docs)) delete docs[k];
  h.taught = null;
  h.authority = false;
  h.users = [];
});

describe('refreshVerifiedClasses', () => {
  it('stores taught classes and, for a test-class authority, the org test classes', async () => {
    h.taught = new Set(['cl-1']);
    h.authority = true;
    docs['organizations/orono/testClasses/mock-a'] = {};
    const out = await refreshVerifiedClasses(
      db as never,
      'u',
      't@orono.k12.mn.us'
    );
    expect(out.ids).toEqual(['cl-1', 'mock-a']);
  });

  it('gives a plain teacher no test classes', async () => {
    h.taught = new Set(['cl-1']);
    docs['organizations/orono/testClasses/mock-a'] = {};
    const out = await refreshVerifiedClasses(
      db as never,
      'u',
      't@orono.k12.mn.us'
    );
    expect(out.ids).toEqual(['cl-1']);
  });

  it('keeps the stored ClassLink classes when ClassLink is down', async () => {
    docs['verified_classes/u'] = {
      classlink: ['cl-1'],
      classlinkAt: 1,
      lms: ['schoology:9'],
    };
    h.taught = new Error('unavailable');
    const out = await refreshVerifiedClasses(
      db as never,
      'u',
      't@orono.k12.mn.us'
    );
    expect(out.ids).toEqual(['cl-1', 'schoology:9']);
    expect(out.classlinkAt).toBe(1);
  });
});

describe('refreshMyClassesV1', () => {
  it('refuses students and unverified addresses', async () => {
    for (const token of [
      { email: 's@orono.k12.mn.us', email_verified: true, studentRole: true },
      { email: 't@orono.k12.mn.us', email_verified: false },
    ]) {
      await expect(
        callRefresh({ auth: { uid: 'u', token } })
      ).rejects.toMatchObject({
        code: 'permission-denied',
      });
    }
    await expect(callRefresh({})).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it("writes only the caller's own list", async () => {
    h.taught = new Set(['cl-1', 'cl-2']);
    const out = await callRefresh({
      auth: {
        uid: 'me',
        token: { email: 'T@orono.k12.mn.us', email_verified: true },
      },
    });
    expect(out.count).toBe(2);
    expect(Object.keys(docs)).toEqual(['verified_classes/me']);
  });
});

describe('runVerifiedClassesFill', () => {
  it('fills missing and stale lists for staff roster owners only', async () => {
    const now = 10 * FILL_STALE_MS;
    docs['users/a/rosters/r1'] = {};
    docs['users/b/rosters/r1'] = {};
    docs['users/c/rosters/r1'] = {};
    docs['users/kid/rosters/r1'] = {};
    docs['verified_classes/b'] = { classlinkAt: now - 1 };
    docs['verified_classes/c'] = { classlinkAt: now - FILL_STALE_MS - 1 };
    h.users = [
      { uid: 'a', email: 'a@orono.k12.mn.us', emailVerified: true },
      { uid: 'b', email: 'b@orono.k12.mn.us', emailVerified: true },
      { uid: 'c', email: 'c@orono.k12.mn.us', emailVerified: true },
      {
        uid: 'kid',
        email: 'k@orono.k12.mn.us',
        emailVerified: true,
        customClaims: { studentRole: true },
      },
    ];
    h.taught = new Set(['cl-1']);
    const out = await runVerifiedClassesFill(db as never, now);
    expect(out).toEqual({ owners: 3, written: 2, skipped: 1 });
    expect(docs['verified_classes/a']?.ids).toEqual(['cl-1']);
    expect(docs['verified_classes/c']?.ids).toEqual(['cl-1']);
    expect(docs['verified_classes/kid']).toBeUndefined();
  });
});
