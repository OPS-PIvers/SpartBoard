/**
 * Tests for the student-identity callables in `studentIdentity.ts`.
 *
 * These are the PII-free auth paths for the ClassLink-via-Google SSO flow and
 * the PIN→SSO unification. They mint Firebase custom tokens, gate on
 * organization/domain membership, and bridge PIN joins onto the same HMAC
 * pseudonym uid an SSO login would produce — so the adversarial cases here pin
 * the security-critical invariants:
 *   - a custom token is minted ONLY after the domain gate (or a seeded test
 *     class / roster pin_index) authorizes the caller,
 *   - the exact custom-token claim shape (`studentRole`, `orgId`, `classIds`)
 *     stays in lockstep across studentLoginV1 / pinLoginV1,
 *   - student-role callers can never reach the teacher-only index rebuild,
 *   - malformed / unauthorized inputs fail closed with the documented code.
 *
 * The Admin SDK is replaced wholesale by a path-addressed Firestore mock
 * (`docStore`), `google-auth-library` and `axios` are stubbed so no network is
 * touched, and `./classlinkShared` (real HMAC pseudonym math) is left unmocked
 * so the uid/pseudonym assertions exercise the production derivation.
 */

/* eslint-disable @typescript-eslint/no-explicit-any,
   @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-return,
   @typescript-eslint/require-await -- the hand-rolled Firestore/Auth mock
   trades exact SDK types for readability and its async mock methods return
   Promise-shaped values without awaiting, matching the async production APIs.
   Production code is type-checked against the real firebase-admin types
   separately. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as CryptoJS from 'crypto-js';

// ── Hoisted mutable mock state ───────────────────────────────────────────────
// `vi.hoisted` guarantees this bag exists before the hoisted `vi.mock`
// factories below reference it, sidestepping TDZ pitfalls.
const h = vi.hoisted(() => ({
  secretValues: {
    classlinkClientId: 'cl-id',
    classlinkClientSecret: 'cl-secret',
    tenantUrl: 'https://tenant.example.com',
    hmacSecret: 'test-hmac-secret',
    googleClientId: 'google-client-id',
  },
  docStore: new Map<string, any>(),
  authUsers: new Map<string, { displayName?: string; email?: string }>(),
  lastCustomToken: null as null | { uid: string; claims: unknown },
  failCustomToken: false,
  batchOps: [] as Array<{ type: 'set' | 'delete'; path: string; data?: any }>,
  // 'ok' | 'throw' | 'no-payload'
  verify: {
    behavior: 'ok' as 'ok' | 'throw' | 'no-payload',
    payload: {} as Record<string, unknown>,
  },
  axiosGet: null as null | ((url: string, cfg?: unknown) => Promise<any>),
}));

vi.mock('./functionsInit', () => ({}));

vi.mock('./secrets', () => ({
  GEMINI_API_KEY: { value: () => 'gemini' },
  CLASSLINK_CLIENT_ID: { value: () => h.secretValues.classlinkClientId },
  CLASSLINK_CLIENT_SECRET: {
    value: () => h.secretValues.classlinkClientSecret,
  },
  CLASSLINK_TENANT_URL: { value: () => h.secretValues.tenantUrl },
  STUDENT_PSEUDONYM_HMAC_SECRET: { value: () => h.secretValues.hmacSecret },
  GOOGLE_OAUTH_CLIENT_ID: { value: () => h.secretValues.googleClientId },
}));

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = 'HttpsError';
    }
  }
  return {
    // Return the bare handler so tests invoke it directly.
    onCall: (_options: unknown, handler: unknown) => handler,
    HttpsError,
  };
});

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    async verifyIdToken() {
      if (h.verify.behavior === 'throw') throw new Error('bad-token');
      return {
        getPayload: () =>
          h.verify.behavior === 'no-payload' ? null : h.verify.payload,
      };
    }
  },
}));

vi.mock('axios', () => ({
  default: {
    get: (url: string, cfg?: unknown) =>
      h.axiosGet
        ? h.axiosGet(url, cfg)
        : Promise.reject(new Error('no axios handler configured')),
    isAxiosError: () => false,
  },
}));

vi.mock('firebase-admin', () => {
  const seg = (p: string) => p.split('/');

  const matches = (data: any, f: { f: string; op: string; v: unknown }) => {
    const val = data ? data[f.f] : undefined;
    if (f.op === '==') return val === f.v;
    if (f.op === 'in') return Array.isArray(f.v) && f.v.includes(val);
    if (f.op === 'array-contains')
      return Array.isArray(val) && val.includes(f.v);
    return false;
  };

  // Direct children of a collection path (docs one segment deeper).
  function childrenOf(collPath: string): Array<{ path: string; data: any }> {
    const out: Array<{ path: string; data: any }> = [];
    const prefix = collPath + '/';
    for (const [p, data] of h.docStore) {
      if (p.startsWith(prefix) && !p.slice(prefix.length).includes('/')) {
        out.push({ path: p, data });
      }
    }
    return out;
  }

  // Every doc living in any collection named `name` (collectionGroup).
  function groupDocs(name: string): Array<{ path: string; data: any }> {
    const out: Array<{ path: string; data: any }> = [];
    for (const [p, data] of h.docStore) {
      const s = seg(p);
      if (s.length >= 2 && s[s.length - 2] === name)
        out.push({ path: p, data });
    }
    return out;
  }

  function makeSnap(path: string, data: any) {
    return {
      id: seg(path).pop(),
      exists: data !== undefined && data !== null,
      data: () => data,
      get: (field: string) => (data ? data[field] : undefined),
      ref: makeDocRef(path),
    };
  }

  function makeQuerySnap(items: Array<{ path: string; data: any }>) {
    return {
      empty: items.length === 0,
      size: items.length,
      docs: items.map((it) => makeSnap(it.path, it.data)),
    };
  }

  function makeQuery(
    items: Array<{ path: string; data: any }>,
    filters: Array<{ f: string; op: string; v: unknown }>,
    limitN?: number
  ): any {
    return {
      where: (f: string, op: string, v: unknown) =>
        makeQuery(items, [...filters, { f, op, v }], limitN),
      limit: (n: number) => makeQuery(items, filters, n),
      get: async () => {
        let res = items.filter((it) =>
          filters.every((fl) => matches(it.data, fl))
        );
        if (typeof limitN === 'number') res = res.slice(0, limitN);
        return makeQuerySnap(res);
      },
    };
  }

  function makeCollRef(collPath: string): any {
    const s = seg(collPath);
    return {
      _path: collPath,
      parent: s.length > 1 ? makeDocRef(s.slice(0, -1).join('/')) : null,
      doc: (id: string) => makeDocRef(collPath + '/' + id),
      where: (f: string, op: string, v: unknown) =>
        makeQuery(childrenOf(collPath), [{ f, op, v }]),
      limit: (n: number) => makeQuery(childrenOf(collPath), [], n),
      get: async () => makeQuerySnap(childrenOf(collPath)),
    };
  }

  function makeDocRef(path: string): any {
    const s = seg(path);
    return {
      _path: path,
      id: s[s.length - 1],
      parent: makeCollRef(s.slice(0, -1).join('/')),
      get: async () => makeSnap(path, h.docStore.get(path)),
      set: async (d: any) => {
        h.docStore.set(path, d);
      },
      delete: async () => {
        h.docStore.delete(path);
      },
      collection: (name: string) => makeCollRef(path + '/' + name),
    };
  }

  const db = {
    collection: (path: string) => makeCollRef(path),
    collectionGroup: (name: string) => makeQuery(groupDocs(name), []),
    doc: (path: string) => makeDocRef(path),
    batch: () => {
      const ops: Array<{ type: 'set' | 'delete'; path: string; data?: any }> =
        [];
      return {
        set: (ref: any, data: any) =>
          ops.push({ type: 'set', path: ref._path, data }),
        delete: (ref: any) => ops.push({ type: 'delete', path: ref._path }),
        commit: async () => {
          for (const op of ops) {
            if (op.type === 'set') h.docStore.set(op.path, op.data);
            else h.docStore.delete(op.path);
          }
          h.batchOps.push(...ops);
        },
      };
    },
  };

  return {
    apps: [{ name: '[DEFAULT]' }],
    initializeApp: () => {},
    firestore: () => db,
    auth: () => ({
      createCustomToken: async (uid: string, claims: unknown) => {
        h.lastCustomToken = { uid, claims };
        if (h.failCustomToken) throw new Error('token-fail');
        return 'ct:' + uid;
      },
      getUser: async (uid: string) => {
        const u = h.authUsers.get(uid);
        if (!u) throw new Error('no-user');
        return u;
      },
    }),
  };
});

// Imported AFTER the mocks so the module picks them up. classlinkShared stays
// real so the pseudonym math below is the production derivation.
import {
  studentLoginV1,
  getAssignmentPseudonymV1,
  getStudentClassDirectoryV1,
  commitRosterPinIndexV1,
  pinLoginV1,
} from './studentIdentity';
import { computeStudentUid } from './classlinkShared';

// The onCall mock returns the raw handler, so each callable is invokable.
const callStudentLogin = studentLoginV1 as unknown as (req: {
  data: unknown;
}) => Promise<{ customToken: string; orgId: string; classCount: number }>;
const callGetPseudonym = getAssignmentPseudonymV1 as unknown as (req: {
  auth?: unknown;
  data: unknown;
}) => { pseudonym: string };
const callDirectory = getStudentClassDirectoryV1 as unknown as (req: {
  auth?: unknown;
  data?: unknown;
}) => Promise<{ classes: any[] }>;
const callCommitIndex = commitRosterPinIndexV1 as unknown as (req: {
  auth?: unknown;
  data: unknown;
}) => Promise<any>;
const callPinLogin = pinLoginV1 as unknown as (req: {
  data: unknown;
}) => Promise<any>;

const HMAC = 'test-hmac-secret';

function assignmentPseudonym(uid: string, assignmentId: string): string {
  return CryptoJS.HmacSHA256(`asn:${uid}:${assignmentId}`, HMAC).toString(
    CryptoJS.enc.Hex
  );
}

/** Assert a callable rejects with an HttpsError carrying `code`. */
async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

beforeEach(() => {
  h.docStore.clear();
  h.authUsers.clear();
  h.batchOps.length = 0;
  h.lastCustomToken = null;
  h.failCustomToken = false;
  h.secretValues = {
    classlinkClientId: 'cl-id',
    classlinkClientSecret: 'cl-secret',
    tenantUrl: 'https://tenant.example.com',
    hmacSecret: HMAC,
    googleClientId: 'google-client-id',
  };
  h.verify = {
    behavior: 'ok',
    payload: {
      email: 'kid@orono.k12.mn.us',
      email_verified: true,
    },
  };
  h.axiosGet = null;
});

/** Seed a verified domain doc so the org gate resolves to `orgId`. */
function seedDomain(orgId: string, domain: string) {
  h.docStore.set(`organizations/${orgId}/domains/d`, {
    domain,
    status: 'verified',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('studentLoginV1', () => {
  it('rejects a missing idToken with invalid-argument', async () => {
    await expectCode(callStudentLogin({ data: {} }), 'invalid-argument');
  });

  it('rejects when a required secret is unset (internal)', async () => {
    h.secretValues.hmacSecret = '';
    await expectCode(callStudentLogin({ data: { idToken: 'x' } }), 'internal');
  });

  it('rejects an unverifiable ID token with unauthenticated', async () => {
    h.verify.behavior = 'throw';
    await expectCode(
      callStudentLogin({ data: { idToken: 'x' } }),
      'unauthenticated'
    );
  });

  it('rejects a token whose email is not verified', async () => {
    h.verify.payload = { email: 'kid@orono.k12.mn.us', email_verified: false };
    await expectCode(
      callStudentLogin({ data: { idToken: 'x' } }),
      'unauthenticated'
    );
  });

  it('rejects a malformed email (no domain)', async () => {
    h.verify.payload = { email: 'kid', email_verified: true };
    await expectCode(
      callStudentLogin({ data: { idToken: 'x' } }),
      'unauthenticated'
    );
  });

  it('rejects an unregistered domain with permission-denied', async () => {
    // No domain doc seeded → resolveOrgIdForDomain returns null.
    await expectCode(
      callStudentLogin({ data: { idToken: 'x' } }),
      'permission-denied'
    );
    expect(h.lastCustomToken).toBeNull();
  });

  it('mints a test-bypass token without any OneRoster call when a testClasses doc matches', async () => {
    seedDomain('org-orono', '@orono.k12.mn.us');
    h.docStore.set('organizations/org-orono/testClasses/tc1', {
      memberEmails: ['kid@orono.k12.mn.us'],
    });
    // axiosGet stays null: if OneRoster were called it would throw.
    const res = await callStudentLogin({ data: { idToken: 'x' } });

    expect(res.orgId).toBe('org-orono');
    expect(res.classCount).toBe(1);
    expect(res.customToken).toBe(
      'ct:' + computeStudentUid('test:kid@orono.k12.mn.us', HMAC)
    );
    expect(h.lastCustomToken?.claims).toEqual({
      studentRole: true,
      orgId: 'org-orono',
      classIds: ['tc1'],
    });
  });

  it('mints an SSO token from the OneRoster student + classes lookup', async () => {
    seedDomain('org-orono', '@orono.k12.mn.us');
    h.axiosGet = async (url: string) => {
      if (url.includes('/classes'))
        return {
          data: { classes: [{ sourcedId: 'C1' }, { sourcedId: 'C2' }] },
        };
      if (url.endsWith('/users'))
        return { data: { users: [{ sourcedId: 'SID-1', role: 'student' }] } };
      throw new Error('unexpected url: ' + url);
    };

    const res = await callStudentLogin({ data: { idToken: 'x' } });

    expect(res.orgId).toBe('org-orono');
    expect(res.classCount).toBe(2);
    expect(h.lastCustomToken?.uid).toBe(computeStudentUid('SID-1', HMAC));
    expect(h.lastCustomToken?.claims).toEqual({
      studentRole: true,
      orgId: 'org-orono',
      classIds: ['C1', 'C2'],
    });
  });

  it('prefers the hd claim domain over the email suffix for the org gate', async () => {
    // Only the hd-derived domain is registered; the email suffix is not.
    seedDomain('org-hd', '@hddomain.org');
    h.verify.payload = {
      email: 'kid@orono.k12.mn.us',
      email_verified: true,
      hd: 'hddomain.org',
    };
    h.axiosGet = async (url: string) => {
      if (url.includes('/classes')) return { data: { classes: [] } };
      if (url.endsWith('/users'))
        return { data: { users: [{ sourcedId: 'SID-9', role: 'student' }] } };
      throw new Error('unexpected url: ' + url);
    };

    const res = await callStudentLogin({ data: { idToken: 'x' } });
    expect(res.orgId).toBe('org-hd');
  });

  it('returns not-found when the roster has no matching student', async () => {
    seedDomain('org-orono', '@orono.k12.mn.us');
    h.axiosGet = async (url: string) => {
      if (url.endsWith('/users')) return { data: { users: [] } };
      throw new Error('unexpected url: ' + url);
    };
    await expectCode(callStudentLogin({ data: { idToken: 'x' } }), 'not-found');
  });

  it('returns not-found for an email unsafe for the OneRoster filter', async () => {
    seedDomain('org-orono', '@orono.k12.mn.us');
    h.verify.payload = {
      email: "ki'd@orono.k12.mn.us",
      email_verified: true,
    };
    // The unsafe-email guard fires before any axios call.
    await expectCode(callStudentLogin({ data: { idToken: 'x' } }), 'not-found');
  });

  it('maps a ClassLink network failure to internal', async () => {
    seedDomain('org-orono', '@orono.k12.mn.us');
    h.axiosGet = async () => {
      throw new Error('network down');
    };
    await expectCode(callStudentLogin({ data: { idToken: 'x' } }), 'internal');
  });

  it('maps a createCustomToken failure to internal', async () => {
    seedDomain('org-orono', '@orono.k12.mn.us');
    h.failCustomToken = true;
    h.axiosGet = async (url: string) => {
      if (url.includes('/classes')) return { data: { classes: [] } };
      if (url.endsWith('/users'))
        return { data: { users: [{ sourcedId: 'SID-1', role: 'student' }] } };
      throw new Error('unexpected url: ' + url);
    };
    await expectCode(callStudentLogin({ data: { idToken: 'x' } }), 'internal');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('getAssignmentPseudonymV1', () => {
  const auth = { uid: 'student-uid-1', token: { studentRole: true } };

  it('rejects an unauthenticated caller', () => {
    expect(() =>
      callGetPseudonym({ data: { assignmentId: 'a1' } })
    ).toThrowError(expect.objectContaining({ code: 'unauthenticated' }));
  });

  it('rejects a non-student caller with permission-denied', () => {
    expect(() =>
      callGetPseudonym({
        auth: { uid: 't', token: { studentRole: false } },
        data: { assignmentId: 'a1' },
      })
    ).toThrowError(expect.objectContaining({ code: 'permission-denied' }));
  });

  it('rejects a missing assignmentId with invalid-argument', () => {
    expect(() => callGetPseudonym({ auth, data: {} })).toThrowError(
      expect.objectContaining({ code: 'invalid-argument' })
    );
  });

  it('rejects an over-long assignmentId with invalid-argument', () => {
    expect(() =>
      callGetPseudonym({ auth, data: { assignmentId: 'a'.repeat(201) } })
    ).toThrowError(expect.objectContaining({ code: 'invalid-argument' }));
  });

  it('rejects when the hmac secret is unset (internal)', () => {
    h.secretValues.hmacSecret = '';
    expect(() =>
      callGetPseudonym({ auth, data: { assignmentId: 'a1' } })
    ).toThrowError(expect.objectContaining({ code: 'internal' }));
  });

  it('returns the deterministic HMAC pseudonym for (uid, assignmentId)', () => {
    const res = callGetPseudonym({ auth, data: { assignmentId: 'a1' } });
    expect(res.pseudonym).toBe(assignmentPseudonym('student-uid-1', 'a1'));
    // Stable within the same tuple.
    expect(
      callGetPseudonym({ auth, data: { assignmentId: 'a1' } }).pseudonym
    ).toBe(res.pseudonym);
    // Unlinkable across assignments.
    expect(
      callGetPseudonym({ auth, data: { assignmentId: 'a2' } }).pseudonym
    ).not.toBe(res.pseudonym);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('getStudentClassDirectoryV1', () => {
  const studentAuth = (classIds: unknown, orgId = 'org-orono') => ({
    uid: 'stu',
    token: { studentRole: true, classIds, orgId },
  });

  it('rejects an unauthenticated caller', async () => {
    await expectCode(callDirectory({ data: {} }), 'unauthenticated');
  });

  it('rejects a non-student caller', async () => {
    await expectCode(
      callDirectory({ auth: { uid: 't', token: { studentRole: false } } }),
      'permission-denied'
    );
  });

  it('rejects a token whose classIds is not an array', async () => {
    await expectCode(
      callDirectory({ auth: studentAuth('not-array') }),
      'failed-precondition'
    );
  });

  it('returns an empty list when the token carries no classIds', async () => {
    const res = await callDirectory({ auth: studentAuth([]) });
    expect(res.classes).toEqual([]);
  });

  it('resolves a ClassLink roster into a directory entry with the teacher name', async () => {
    h.docStore.set('users/teacher1/rosters/r1', {
      classlinkClassId: 'CL1',
      name: 'English 9',
      classlinkSubject: 'English',
      classlinkClassCode: 'ENG9',
    });
    h.authUsers.set('teacher1', { displayName: 'Ms. Halverson' });

    const res = await callDirectory({ auth: studentAuth(['CL1']) });
    expect(res.classes).toEqual([
      {
        classId: 'CL1',
        name: 'English 9',
        teacherDisplayName: 'Ms. Halverson',
        subject: 'English',
        code: 'ENG9',
      },
    ]);
  });

  it('falls back to a test-class doc for a classId not in any roster', async () => {
    h.docStore.set('organizations/org-orono/testClasses/TC1', {
      title: 'Mock Math',
      subject: 'Math',
    });
    const res = await callDirectory({ auth: studentAuth(['TC1']) });
    expect(res.classes).toEqual([
      {
        classId: 'TC1',
        name: 'Mock Math',
        teacherDisplayName: '',
        subject: 'Math',
      },
    ]);
  });

  it('drops classIds that resolve to nothing', async () => {
    const res = await callDirectory({ auth: studentAuth(['UNKNOWN']) });
    expect(res.classes).toEqual([]);
  });

  it('renders the roster entry with an empty teacher name when the Auth lookup fails', async () => {
    h.docStore.set('users/ghost/rosters/r1', {
      classlinkClassId: 'CL2',
      name: 'History',
    });
    // No authUsers entry for 'ghost' → getUser throws → '' fallback.
    const res = await callDirectory({ auth: studentAuth(['CL2']) });
    expect(res.classes).toEqual([
      {
        classId: 'CL2',
        name: 'History',
        teacherDisplayName: '',
        subject: undefined,
        code: undefined,
      },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('commitRosterPinIndexV1', () => {
  const teacherAuth = { uid: 'teacher1', token: {} };

  it('rejects an unauthenticated caller', async () => {
    await expectCode(callCommitIndex({ data: {} }), 'unauthenticated');
  });

  it('rejects a student-role caller with permission-denied', async () => {
    await expectCode(
      callCommitIndex({
        auth: { uid: 's', token: { studentRole: true } },
        data: { rosterId: 'r1', entries: [] },
      }),
      'permission-denied'
    );
  });

  it('rejects a missing rosterId', async () => {
    await expectCode(
      callCommitIndex({ auth: teacherAuth, data: { entries: [] } }),
      'invalid-argument'
    );
  });

  it('rejects entries that are not an array', async () => {
    await expectCode(
      callCommitIndex({
        auth: teacherAuth,
        data: { rosterId: 'r1', entries: 'nope' },
      }),
      'invalid-argument'
    );
  });

  it('rejects an entries array over the max size', async () => {
    const entries = Array.from({ length: 201 }, () => ({
      period: '1',
      pin: '1',
      classlinkSourcedId: 's',
    }));
    await expectCode(
      callCommitIndex({ auth: teacherAuth, data: { rosterId: 'r1', entries } }),
      'invalid-argument'
    );
  });

  it('returns not-found when the roster does not exist', async () => {
    await expectCode(
      callCommitIndex({
        auth: teacherAuth,
        data: { rosterId: 'missing', entries: [] },
      }),
      'not-found'
    );
  });

  it('no-ops for a local roster with no classlinkClassId', async () => {
    h.docStore.set('users/teacher1/rosters/r1', { name: 'Local roster' });
    const res = await callCommitIndex({
      auth: teacherAuth,
      data: { rosterId: 'r1', entries: [] },
    });
    expect(res).toEqual({
      wrote: 0,
      deleted: 0,
      skippedMalformed: 0,
      skippedReason: 'no-classlink-class-id',
    });
  });

  it('writes the desired index and deletes stale entries', async () => {
    h.docStore.set('users/teacher1/rosters/r1', {
      classlinkClassId: 'CL1',
      classlinkOrgId: 'org-orono',
    });
    // A stale pre-existing entry that must be pruned (not in the new desired set).
    h.docStore.set('users/teacher1/rosters/r1/pin_index/stale__key', {
      pseudonym: 'old',
    });

    const res = await callCommitIndex({
      auth: teacherAuth,
      data: {
        rosterId: 'r1',
        entries: [{ period: '1', pin: '1234', classlinkSourcedId: 'SID-1' }],
      },
    });

    expect(res.wrote).toBe(1);
    expect(res.deleted).toBe(1);
    expect(res.skippedMalformed).toBe(0);
    // Stale doc removed, desired doc written with the SSO-matching pseudonym.
    expect(
      h.docStore.has('users/teacher1/rosters/r1/pin_index/stale__key')
    ).toBe(false);
    const written = h.docStore.get(
      'users/teacher1/rosters/r1/pin_index/1__1234'
    );
    expect(written).toMatchObject({
      pseudonym: computeStudentUid('SID-1', HMAC),
      classId: 'CL1',
      orgId: 'org-orono',
      period: '1',
    });
  });

  it('skips malformed entries and reports the count', async () => {
    h.docStore.set('users/teacher1/rosters/r1', { classlinkClassId: 'CL1' });
    const res = await callCommitIndex({
      auth: teacherAuth,
      data: {
        rosterId: 'r1',
        entries: [
          { period: '1', pin: '1234', classlinkSourcedId: 'SID-1' },
          { period: '', pin: 'x', classlinkSourcedId: 'y' }, // empty period
          'not-an-object',
        ],
      },
    });
    expect(res.wrote).toBe(1);
    expect(res.skippedMalformed).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('pinLoginV1', () => {
  it('rejects a missing kind', async () => {
    await expectCode(callPinLogin({ data: { pin: '1' } }), 'invalid-argument');
  });

  it('rejects a missing pin', async () => {
    await expectCode(
      callPinLogin({ data: { kind: 'quiz', code: 'ABC' } }),
      'invalid-argument'
    );
  });

  it('rejects a quiz login with no code', async () => {
    await expectCode(
      callPinLogin({ data: { kind: 'quiz', pin: '1234' } }),
      'invalid-argument'
    );
  });

  it('rejects a video-activity login with no sessionId', async () => {
    await expectCode(
      callPinLogin({ data: { kind: 'video-activity', pin: '1234' } }),
      'invalid-argument'
    );
  });

  it('returns matched:false when no joinable quiz session exists', async () => {
    const res = await callPinLogin({
      data: { kind: 'quiz', code: 'ABC123', pin: '1234' },
    });
    expect(res).toMatchObject({
      matched: false,
      reason: 'no-joinable-session',
    });
  });

  it('returns matched:false when the video-activity session is missing', async () => {
    const res = await callPinLogin({
      data: { kind: 'video-activity', sessionId: 'nope', pin: '1234' },
    });
    expect(res).toMatchObject({ matched: false, reason: 'session-not-found' });
  });

  it('returns matched:false when the session has no teacherUid', async () => {
    h.docStore.set('video_activity_sessions/vs1', { rosterIds: ['r1'] });
    const res = await callPinLogin({
      data: { kind: 'video-activity', sessionId: 'vs1', pin: '1234' },
    });
    expect(res).toMatchObject({
      matched: false,
      reason: 'session-missing-teacher',
    });
  });

  it('returns matched:false when the session carries no rosters', async () => {
    h.docStore.set('video_activity_sessions/vs1', { teacherUid: 'teacher1' });
    const res = await callPinLogin({
      data: { kind: 'video-activity', sessionId: 'vs1', pin: '1234' },
    });
    expect(res).toMatchObject({
      matched: false,
      reason: 'no-rosters-on-session',
    });
  });

  it('returns matched:false when no pin_index entry resolves', async () => {
    h.docStore.set('video_activity_sessions/vs1', {
      teacherUid: 'teacher1',
      rosterIds: ['r1'],
    });
    const res = await callPinLogin({
      data: {
        kind: 'video-activity',
        sessionId: 'vs1',
        pin: '1234',
        period: '1',
      },
    });
    expect(res).toMatchObject({ matched: false, reason: 'no-index-entry' });
  });

  it('finds a joinable quiz session even behind 5 non-joinable same-code sessions', async () => {
    // quiz_sessions is never pruned, so a reused code can accumulate past
    // sessions. Seed 5 non-joinable ones ahead of the live one to prove the
    // lookup filters by status in the query instead of sampling a capped page.
    for (let i = 0; i < 5; i++) {
      h.docStore.set(`quiz_sessions/old${i}`, {
        code: 'DUP001',
        status: 'ended',
      });
    }
    h.docStore.set('quiz_sessions/live1', {
      code: 'DUP001',
      status: 'active',
      teacherUid: 'teacher1',
      rosterIds: ['r1'],
    });
    h.docStore.set('users/teacher1/rosters/r1/pin_index/1__1234', {
      pseudonym: 'PS3',
      classId: 'CL1',
      orgId: 'org-orono',
    });

    const res = await callPinLogin({
      data: { kind: 'quiz', code: 'DUP001', pin: '1234', period: '1' },
    });

    expect(res).toEqual({ matched: true, customToken: 'ct:PS3' });
  });

  it('mints an SSO-matching token for a resolved quiz PIN', async () => {
    h.docStore.set('quiz_sessions/qs1', {
      code: 'ABC123',
      status: 'active',
      teacherUid: 'teacher1',
      rosterIds: ['r1'],
    });
    h.docStore.set('users/teacher1/rosters/r1/pin_index/1__1234', {
      pseudonym: 'PS1',
      classId: 'CL1',
      orgId: 'org-orono',
    });

    const res = await callPinLogin({
      data: { kind: 'quiz', code: 'abc 123', pin: '1234', period: '1' },
    });

    expect(res).toEqual({ matched: true, customToken: 'ct:PS1' });
    expect(h.lastCustomToken?.claims).toEqual({
      studentRole: true,
      orgId: 'org-orono',
      classIds: ['CL1'],
    });
  });

  it('mints a token for a resolved video-activity PIN', async () => {
    h.docStore.set('video_activity_sessions/vs1', {
      teacherUid: 'teacher1',
      rosterIds: ['r1'],
    });
    h.docStore.set('users/teacher1/rosters/r1/pin_index/1__1234', {
      pseudonym: 'PS2',
      classId: 'CL2',
      orgId: 'org-orono',
    });
    const res = await callPinLogin({
      data: {
        kind: 'video-activity',
        sessionId: 'vs1',
        pin: '1234',
        period: '1',
      },
    });
    expect(res).toEqual({ matched: true, customToken: 'ct:PS2' });
  });

  it('maps a createCustomToken failure to internal', async () => {
    h.docStore.set('video_activity_sessions/vs1', {
      teacherUid: 'teacher1',
      rosterIds: ['r1'],
    });
    h.docStore.set('users/teacher1/rosters/r1/pin_index/1__1234', {
      pseudonym: 'PS1',
      classId: 'CL1',
      orgId: 'org-orono',
    });
    h.failCustomToken = true;
    await expectCode(
      callPinLogin({
        data: {
          kind: 'video-activity',
          sessionId: 'vs1',
          pin: '1234',
          period: '1',
        },
      }),
      'internal'
    );
  });
});
