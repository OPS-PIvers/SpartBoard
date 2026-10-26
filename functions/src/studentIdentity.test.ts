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
    behavior: 'ok',
    payload: {},
  },
  axiosGet: null as null | ((url: string, cfg?: unknown) => Promise<any>),
}));

vi.mock('./functionsInit', () => ({}));

vi.mock('./secrets', () => ({
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
      path,
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
    runTransaction: async (fn: (tx: any) => Promise<unknown>) =>
      fn({
        get: (ref: { get: () => Promise<unknown> }) => ref.get(),
        set: (ref: { _path: string }, d: unknown) => {
          h.docStore.set(ref._path, d);
        },
      }),
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
    firestore: Object.assign(() => db, {
      Timestamp: { fromMillis: (ms: number) => ({ ms }) },
    }),
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
  getPseudonymsForAssignmentV1,
  getStudentClassDirectoryV1,
  commitRosterPinIndexV1,
  pinLoginV1,
  PIN_LOGIN_MAX_CALLERS_PER_STUDENT,
  PIN_LOGIN_SESSION_MAX_FAILURES,
  PIN_LOGIN_SESSION_MAX_DAILY_FAILURES,
} from './studentIdentity';
import { computeStudentUid } from './classlinkShared';
import * as admin from 'firebase-admin';

// The onCall mock returns the raw handler, so each callable is invokable.
const callStudentLogin = studentLoginV1 as unknown as (req: {
  data: unknown;
}) => Promise<{ customToken: string; orgId: string; classCount: number }>;
const callGetPseudonym = getAssignmentPseudonymV1 as unknown as (req: {
  auth?: unknown;
  data: unknown;
}) => { pseudonym: string };
const callPseudonymsForAssignment =
  getPseudonymsForAssignmentV1 as unknown as (req: {
    auth?: unknown;
    data: unknown;
  }) => Promise<{
    pseudonyms: Record<
      string,
      {
        studentUid: string;
        assignmentPseudonym: string;
        givenName: string;
        familyName: string;
        targetRefKey: string;
      }
    >;
    skipped?: { ref: unknown; reason: string }[];
  }>;
const callDirectory = getStudentClassDirectoryV1 as unknown as (req: {
  auth?: unknown;
  data?: unknown;
}) => Promise<{ classes: any[]; customToken?: string; classIds?: string[] }>;
const callCommitIndex = commitRosterPinIndexV1 as unknown as (req: {
  auth?: unknown;
  data: unknown;
}) => Promise<any>;
const rawPinLogin = pinLoginV1 as unknown as (req: {
  auth?: unknown;
  data: unknown;
}) => Promise<any>;
const ANON_AUTH = {
  uid: 'anon-caller',
  token: { firebase: { sign_in_provider: 'anonymous' } },
};
// Both join flows sign in anonymously before bridging, so default to that.
const callPinLogin = (req: { auth?: unknown; data: unknown }) =>
  rawPinLogin('auth' in req ? req : { ...req, auth: ANON_AUTH });

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
    h.docStore.set('users/t1/rosters/r1', { classlinkClassId: 'C1' });
    h.docStore.set('users/t2/rosters/r2', { classlinkClassId: 'C2' });
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
      sso: true,
    });
  });

  it('keeps only roster-matched sections in the claim and records every section', async () => {
    seedDomain('org-orono', '@orono.k12.mn.us');
    h.docStore.set('users/t1/rosters/r1', { classlinkClassId: 'ENG' });
    h.docStore.set('users/t2/rosters/r2', { classlinkClassId: 'ENG' });
    h.docStore.set('users/t3/rosters/r3', { classlinkClassId: 'BIO' });
    h.axiosGet = async (url: string) => {
      if (url.includes('/classes'))
        return {
          data: {
            classes: [
              { sourcedId: 'HOMEROOM' },
              { sourcedId: 'ENG' },
              { sourcedId: 'LUNCH' },
              { sourcedId: 'BIO' },
            ],
          },
        };
      if (url.endsWith('/users'))
        return { data: { users: [{ sourcedId: 'SID-1', role: 'student' }] } };
      throw new Error('unexpected url: ' + url);
    };

    const res = await callStudentLogin({ data: { idToken: 'x' } });

    expect(res.classCount).toBe(2);
    expect(h.lastCustomToken?.claims).toEqual({
      studentRole: true,
      orgId: 'org-orono',
      classIds: ['ENG', 'BIO'],
      sso: true,
    });
    const uid = computeStudentUid('SID-1', HMAC);
    expect(h.docStore.get(`student_sections/${uid}`)).toMatchObject({
      orgId: 'org-orono',
      sectionIds: ['HOMEROOM', 'ENG', 'LUNCH', 'BIO'],
    });
  });

  it('fills the 20-slot cap with matched sections only', async () => {
    seedDomain('org-orono', '@orono.k12.mn.us');
    const sections = Array.from({ length: 30 }, (_, i) => `S${i}`);
    // Only the last 20 have rosters; the first 10 would have filled the old cap.
    for (const id of sections.slice(10)) {
      h.docStore.set(`users/t/rosters/${id}`, { classlinkClassId: id });
    }
    h.axiosGet = async (url: string) => {
      if (url.includes('/classes'))
        return {
          data: { classes: sections.map((sourcedId) => ({ sourcedId })) },
        };
      if (url.endsWith('/users'))
        return { data: { users: [{ sourcedId: 'SID-1', role: 'student' }] } };
      throw new Error('unexpected url: ' + url);
    };

    await callStudentLogin({ data: { idToken: 'x' } });
    expect((h.lastCustomToken?.claims as any).classIds).toEqual(
      sections.slice(10)
    );
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
        teacherDisplayNames: ['Ms. Halverson'],
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
        teacherDisplayNames: [],
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
        teacherDisplayNames: [],
        subject: undefined,
        code: undefined,
      },
    ]);
  });
});

describe('getStudentClassDirectoryV1 — co-teachers, order and re-check', () => {
  const studentAuth = (classIds: string[], orgId = 'org-orono') => ({
    uid: 'stu',
    token: { studentRole: true, classIds, orgId, sso: true },
  });

  it('merges a co-taught section into one entry named by the newest roster', async () => {
    h.docStore.set('users/t1/rosters/r1', {
      classlinkClassId: 'ENG',
      name: 'English 9',
      updatedAt: 100,
    });
    h.docStore.set('users/t2/rosters/r2', {
      classlinkClassId: 'ENG',
      name: 'English 9 Honors',
      classlinkClassCode: 'ENG9H',
      updatedAt: 200,
    });
    h.authUsers.set('t1', { displayName: 'Mr. Lee' });
    h.authUsers.set('t2', { displayName: 'Ms. Ortiz' });

    const res = await callDirectory({ auth: studentAuth(['ENG']) });
    expect(res.classes).toEqual([
      {
        classId: 'ENG',
        name: 'English 9 Honors',
        teacherDisplayName: 'Ms. Ortiz & Mr. Lee',
        teacherDisplayNames: ['Ms. Ortiz', 'Mr. Lee'],
        subject: undefined,
        code: 'ENG9H',
      },
    ]);
  });

  it('returns the bell period of the newest roster that has one', async () => {
    h.docStore.set('users/t1/rosters/r1', {
      classlinkClassId: 'ENG',
      name: 'English 9',
      bellPeriod: { buildingId: 'oms', periodId: '3' },
      updatedAt: 100,
    });
    h.docStore.set('users/t2/rosters/r2', {
      classlinkClassId: 'ENG',
      name: 'English 9 Honors',
      bellPeriod: null,
      updatedAt: 200,
    });
    h.docStore.set('users/t/rosters/n', {
      classlinkClassId: 'ART',
      name: 'Art',
      bellPeriod: { buildingId: 'oms', periodId: 7 },
    });
    const res = await callDirectory({ auth: studentAuth(['ENG', 'ART']) });
    const byId = Object.fromEntries(res.classes.map((c) => [c.classId, c]));
    expect(byId.ENG.bellPeriod).toEqual({ buildingId: 'oms', periodId: '3' });
    expect('bellPeriod' in byId.ART).toBe(false);
  });

  it('sorts classes by name', async () => {
    h.docStore.set('users/t/rosters/a', {
      classlinkClassId: 'A',
      name: 'World History',
    });
    h.docStore.set('users/t/rosters/b', {
      classlinkClassId: 'B',
      name: 'Algebra II',
    });
    h.docStore.set('users/t/rosters/c', {
      classlinkClassId: 'C',
      name: 'biology 9',
    });
    const res = await callDirectory({ auth: studentAuth(['A', 'B', 'C']) });
    expect(res.classes.map((c) => c.name)).toEqual([
      'Algebra II',
      'biology 9',
      'World History',
    ]);
  });

  it('returns no token when the stored sections match the claim', async () => {
    h.docStore.set('users/t/rosters/a', { classlinkClassId: 'A', name: 'Art' });
    h.docStore.set('student_sections/stu', {
      orgId: 'org-orono',
      sectionIds: ['HOMEROOM', 'A'],
    });
    const res = await callDirectory({ auth: studentAuth(['A']) });
    expect(res.customToken).toBeUndefined();
    expect(h.lastCustomToken).toBeNull();
    expect(res.classes.map((c) => c.classId)).toEqual(['A']);
  });

  it('re-mints the claim when a stored section gains a roster', async () => {
    h.docStore.set('users/t/rosters/a', { classlinkClassId: 'A', name: 'Art' });
    h.docStore.set('users/t/rosters/b', {
      classlinkClassId: 'B',
      name: 'Biology',
    });
    h.docStore.set('student_sections/stu', {
      orgId: 'org-orono',
      sectionIds: ['A', 'B', 'LUNCH'],
    });

    const res = await callDirectory({ auth: studentAuth(['A']) });

    expect(res.customToken).toBe('ct:stu');
    expect(h.lastCustomToken).toEqual({
      uid: 'stu',
      claims: {
        studentRole: true,
        orgId: 'org-orono',
        classIds: ['A', 'B'],
        sso: true,
      },
    });
    expect(res.classIds).toEqual(['A', 'B']);
    expect(res.classes.map((c) => c.classId)).toEqual(['A', 'B']);
  });

  it('re-mints a narrower claim when a claimed section lost its roster', async () => {
    h.docStore.set('users/t/rosters/a', { classlinkClassId: 'A', name: 'Art' });
    h.docStore.set('student_sections/stu', {
      orgId: 'org-orono',
      sectionIds: ['A', 'GONE'],
    });
    const res = await callDirectory({ auth: studentAuth(['A', 'GONE']) });
    expect((h.lastCustomToken?.claims as any).classIds).toEqual(['A']);
    expect(res.classes.map((c) => c.classId)).toEqual(['A']);
  });

  it('ignores a stored section record from another org', async () => {
    h.docStore.set('users/t/rosters/a', { classlinkClassId: 'A', name: 'Art' });
    h.docStore.set('users/t/rosters/b', {
      classlinkClassId: 'B',
      name: 'Biology',
    });
    h.docStore.set('student_sections/stu', {
      orgId: 'org-other',
      sectionIds: ['A', 'B'],
    });
    const res = await callDirectory({ auth: studentAuth(['A']) });
    expect(res.customToken).toBeUndefined();
    expect(res.classes.map((c) => c.classId)).toEqual(['A']);
  });

  it('keeps the current claim when re-minting fails', async () => {
    h.failCustomToken = true;
    h.docStore.set('users/t/rosters/a', { classlinkClassId: 'A', name: 'Art' });
    h.docStore.set('users/t/rosters/b', {
      classlinkClassId: 'B',
      name: 'Biology',
    });
    h.docStore.set('student_sections/stu', {
      orgId: 'org-orono',
      sectionIds: ['A', 'B'],
    });
    const res = await callDirectory({ auth: studentAuth(['A']) });
    expect(res.customToken).toBeUndefined();
    expect(res.classes.map((c) => c.classId)).toEqual(['A']);
  });

  it('never widens a PIN token from the stored sections of the same uid', async () => {
    h.docStore.set('users/t/rosters/a', { classlinkClassId: 'A', name: 'Art' });
    h.docStore.set('users/t/rosters/b', {
      classlinkClassId: 'B',
      name: 'Biology',
    });
    h.docStore.set('student_sections/stu', {
      orgId: 'org-orono',
      sectionIds: ['A', 'B'],
    });
    const res = await callDirectory({
      auth: {
        uid: 'stu',
        token: { studentRole: true, classIds: ['A'], orgId: 'org-orono' },
      },
    });
    expect(res.customToken).toBeUndefined();
    expect(h.lastCustomToken).toBeNull();
    expect(res.classes.map((c) => c.classId)).toEqual(['A']);
  });

  it('never re-mints a test-class or PIN token without a stored record', async () => {
    h.docStore.set('organizations/org-orono/testClasses/TC1', {
      title: 'Mock',
    });
    const res = await callDirectory({ auth: studentAuth(['TC1']) });
    expect(res.customToken).toBeUndefined();
    expect(h.lastCustomToken).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('commitRosterPinIndexV1', () => {
  const teacherAuth = {
    uid: 'teacher1',
    token: { email: 'teacher@orono.example', email_verified: true },
  };
  const classlink = {
    user: { sourcedId: 'T1', role: 'teacher' } as Record<
      string,
      unknown
    > | null,
    classes: ['CL1'],
    students: ['SID-1', 'SID-2'],
    calls: [] as string[],
  };
  beforeEach(() => {
    classlink.user = { sourcedId: 'T1', role: 'teacher' };
    classlink.classes = ['CL1'];
    classlink.students = ['SID-1', 'SID-2'];
    classlink.calls = [];
    h.axiosGet = async (url: string) => {
      classlink.calls.push(url);
      if (url.endsWith('/users'))
        return { data: { users: classlink.user ? [classlink.user] : [] } };
      if (url.endsWith('/users/T1/classes'))
        return {
          data: {
            classes: classlink.classes.map((sourcedId) => ({ sourcedId })),
          },
        };
      if (url.endsWith('/classes/CL1/students'))
        return {
          data: {
            users: classlink.students.map((sourcedId) => ({ sourcedId })),
          },
        };
      throw new Error('unexpected url ' + url);
    };
  });

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

  it('rejects an anonymous caller who made their own roster (finding #1)', async () => {
    h.docStore.set('users/anon1/rosters/r1', { classlinkClassId: 'CL1' });
    await expectCode(
      callCommitIndex({
        auth: {
          uid: 'anon1',
          token: { firebase: { sign_in_provider: 'anonymous' } },
        },
        data: {
          rosterId: 'r1',
          entries: [{ period: '1', pin: '01', classlinkSourcedId: 'SID-1' }],
        },
      }),
      'permission-denied'
    );
    expect(h.batchOps).toHaveLength(0);
    expect(classlink.calls).toHaveLength(0);
  });

  it('rejects an unverified email', async () => {
    h.docStore.set('users/teacher1/rosters/r1', { classlinkClassId: 'CL1' });
    await expectCode(
      callCommitIndex({
        auth: {
          uid: 'teacher1',
          token: { email: 'teacher@orono.example', email_verified: false },
        },
        data: { rosterId: 'r1', entries: [] },
      }),
      'permission-denied'
    );
  });

  it('rejects a caller ClassLink lists as a student', async () => {
    h.docStore.set('users/teacher1/rosters/r1', { classlinkClassId: 'CL1' });
    classlink.user = { sourcedId: 'T1', role: 'student' };
    await expectCode(
      callCommitIndex({
        auth: teacherAuth,
        data: {
          rosterId: 'r1',
          entries: [{ period: '1', pin: '01', classlinkSourcedId: 'SID-2' }],
        },
      }),
      'permission-denied'
    );
    expect(h.batchOps).toHaveLength(0);
  });

  it('rejects a roster pointing at a class the caller does not teach', async () => {
    h.docStore.set('users/teacher1/rosters/r1', { classlinkClassId: 'CL9' });
    h.docStore.set('users/teacher1/rosters/r1/pin_index/1__01', {
      pseudonym: 'kept',
    });
    await expectCode(
      callCommitIndex({
        auth: teacherAuth,
        data: {
          rosterId: 'r1',
          entries: [{ period: '1', pin: '01', classlinkSourcedId: 'SID-1' }],
        },
      }),
      'permission-denied'
    );
    expect(h.batchOps).toHaveLength(0);
  });

  it('leaves the index alone when ClassLink is unreachable', async () => {
    h.docStore.set('users/teacher1/rosters/r1', { classlinkClassId: 'CL1' });
    h.axiosGet = async () => {
      throw new Error('ECONNRESET');
    };
    await expectCode(
      callCommitIndex({
        auth: teacherAuth,
        data: {
          rosterId: 'r1',
          entries: [{ period: '1', pin: '01', classlinkSourcedId: 'SID-1' }],
        },
      }),
      'unavailable'
    );
    expect(h.batchOps).toHaveLength(0);
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
      skippedNotEnrolled: 0,
      skippedReason: 'no-classlink-class-id',
    });
    expect(classlink.calls).toHaveLength(0);
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
        entries: [{ period: '1', pin: '123456', classlinkSourcedId: 'SID-1' }],
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
      'users/teacher1/rosters/r1/pin_index/1__123456'
    );
    expect(written).toMatchObject({
      pseudonym: computeStudentUid('SID-1', HMAC),
      classId: 'CL1',
      orgId: 'org-orono',
      period: '1',
    });
  });

  it('drops students ClassLink does not enroll in the class', async () => {
    h.docStore.set('users/teacher1/rosters/r1', { classlinkClassId: 'CL1' });
    const res = await callCommitIndex({
      auth: teacherAuth,
      data: {
        rosterId: 'r1',
        entries: [
          { period: '1', pin: '01', classlinkSourcedId: 'SID-1' },
          { period: '1', pin: '02', classlinkSourcedId: 'SID-OTHER-CLASS' },
        ],
      },
    });
    expect(res.wrote).toBe(1);
    expect(res.skippedNotEnrolled).toBe(1);
    expect(h.docStore.has('users/teacher1/rosters/r1/pin_index/1__02')).toBe(
      false
    );
  });

  it('skips malformed entries and reports the count', async () => {
    h.docStore.set('users/teacher1/rosters/r1', { classlinkClassId: 'CL1' });
    const res = await callCommitIndex({
      auth: teacherAuth,
      data: {
        rosterId: 'r1',
        entries: [
          { period: '1', pin: '123456', classlinkSourcedId: 'SID-1' },
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
  it('rejects an unauthenticated caller', async () => {
    await expectCode(
      rawPinLogin({ data: { kind: 'quiz', code: 'ABC123', pin: '01' } }),
      'unauthenticated'
    );
  });

  describe('attempt limits', () => {
    function seedSession() {
      h.docStore.set('video_activity_sessions/vs1', {
        teacherUid: 'teacher1',
        rosterIds: ['r1'],
      });
      for (const pin of ['100001', '100002', '100003', '100004']) {
        h.docStore.set(`users/teacher1/rosters/r1/pin_index/1__${pin}`, {
          pseudonym: 'PS' + pin,
          classId: 'CL2',
          orgId: 'org-orono',
        });
      }
    }
    const login = (pin: string, uid = 'anon-caller') =>
      callPinLogin({
        auth: { uid, token: {} },
        data: { kind: 'video-activity', sessionId: 'vs1', pin, period: '1' },
      });

    it('stops bridging after repeated misses from one caller', async () => {
      seedSession();
      for (let i = 0; i < 10; i++) {
        expect(await login('9000' + String(i).padStart(2, '0'))).toMatchObject({
          reason: 'no-index-entry',
        });
      }
      // Even a correct PIN now falls back to the plain PIN join.
      expect(await login('100001')).toEqual({
        matched: false,
        reason: 'rate-limited',
      });
      // Another caller is unaffected.
      expect(await login('100001', 'other-anon')).toMatchObject({
        matched: true,
      });
    });

    it('lets one caller rejoin as the same student but caps distinct students', async () => {
      seedSession();
      for (const pin of ['100001', '100001', '100002', '100003', '100001']) {
        expect(await login(pin)).toMatchObject({ matched: true });
      }
      expect(await login('100004')).toEqual({
        matched: false,
        reason: 'rate-limited',
      });
    });

    it('re-checks the identity cap when the attempt is recorded', async () => {
      seedSession();
      const key = 'pin_login_attempts/vs1__anon-caller';
      for (const pin of ['100001', '100002', '100003']) await login(pin);
      // Simulate a parallel call that read the counter before the others landed.
      const full = h.docStore.get(key);
      h.docStore.set(key, { ...full, indexKeys: ['1__100001', '1__100002'] });
      const realSet = h.docStore.set.bind(h.docStore);
      let swapped = false;
      h.docStore.get = ((orig) => (p: string) => {
        const v = orig(p);
        if (p === key && !swapped) {
          swapped = true;
          realSet(key, full);
        }
        return v;
      })(h.docStore.get.bind(h.docStore));
      try {
        expect(await login('100004')).toEqual({
          matched: false,
          reason: 'rate-limited',
        });
      } finally {
        h.docStore.get = Map.prototype.get.bind(h.docStore);
      }
    });

    it('caps misses across every caller of one session', async () => {
      seedSession();
      for (let i = 0; i < PIN_LOGIN_SESSION_MAX_FAILURES; i++) {
        expect(
          await login('9000' + String(i).padStart(2, '0'), `fresh-${i}`)
        ).toMatchObject({
          reason: 'no-index-entry',
        });
      }
      expect(await login('100001', 'fresh-next')).toEqual({
        matched: false,
        reason: 'rate-limited',
      });
    });

    it('bridges each student from only a few fresh uids', async () => {
      seedSession();
      const resolved = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const res = await login('100001', `fresh-${i}`);
        if (res.matched) resolved.add(`fresh-${i}`);
      }
      expect(resolved.size).toBe(PIN_LOGIN_MAX_CALLERS_PER_STUDENT);
      // A uid already bound to the student can still rejoin.
      expect(await login('100001', 'fresh-0')).toMatchObject({ matched: true });
    });

    it('fails closed when the counters cannot be read', async () => {
      seedSession();
      const realGet = h.docStore.get.bind(h.docStore);
      h.docStore.get = ((p: string) => {
        if (p.startsWith('pin_login_attempts/')) throw new Error('down');
        return realGet(p);
      }) as typeof h.docStore.get;
      try {
        expect(await login('100001')).toEqual({
          matched: false,
          reason: 'rate-limited',
        });
      } finally {
        h.docStore.get = Map.prototype.get.bind(h.docStore);
      }
      expect(h.lastCustomToken).toBeNull();
    });

    it('never bridges a short PIN, even one in the index', async () => {
      seedSession();
      h.docStore.set('users/teacher1/rosters/r1/pin_index/1__01', {
        pseudonym: 'PS01',
        classId: 'CL2',
        orgId: 'org-orono',
      });
      expect(await login('01')).toEqual({
        matched: false,
        reason: 'short-pin',
      });
      expect(h.lastCustomToken).toBeNull();
    });

    it('lets a caller that already bridged on a short PIN keep its student', async () => {
      seedSession();
      h.docStore.set('users/teacher1/rosters/r1/pin_index/1__01', {
        pseudonym: 'PS01',
        classId: 'CL2',
        orgId: 'org-orono',
      });
      h.docStore.set('pin_login_attempts/claim__vs1__1__01', {
        callerUids: ['anon-caller'],
      });
      expect(await login('01')).toMatchObject({ matched: true });
      expect(h.lastCustomToken).toMatchObject({ uid: 'PS01' });
      expect(await login('01', 'someone-else')).toEqual({
        matched: false,
        reason: 'short-pin',
      });
    });

    it('refuses a hit inside the transaction once the session budget is spent', async () => {
      seedSession();
      const key = 'pin_login_attempts/session__vs1';
      h.docStore.set(key, {
        windowStart: Date.now(),
        failures: PIN_LOGIN_SESSION_MAX_FAILURES,
      });
      // Simulate a pre-check that read the counter before a parallel burst landed.
      const full = h.docStore.get(key);
      const realGet = h.docStore.get.bind(h.docStore);
      let stale = true;
      h.docStore.get = ((p: string) => {
        if (p === key && stale) {
          stale = false;
          return { ...full, failures: 0 };
        }
        return realGet(p);
      }) as typeof h.docStore.get;
      try {
        expect(await login('100001', 'fresh-hit')).toEqual({
          matched: false,
          reason: 'rate-limited',
        });
      } finally {
        h.docStore.get = Map.prototype.get.bind(h.docStore);
      }
      expect(h.lastCustomToken).toBeNull();
    });

    it('caps misses per session across a whole day', async () => {
      seedSession();
      h.docStore.set('pin_login_attempts/session__vs1', {
        windowStart: Date.now() - 16 * 60 * 1000,
        failures: PIN_LOGIN_SESSION_MAX_FAILURES,
        dayStart: Date.now() - 60 * 60 * 1000,
        dayFailures: PIN_LOGIN_SESSION_MAX_DAILY_FAILURES,
      });
      expect(await login('100001', 'fresh-day')).toEqual({
        matched: false,
        reason: 'rate-limited',
      });
    });

    it('stops counting once the session budget is spent', async () => {
      seedSession();
      for (let i = 0; i < PIN_LOGIN_SESSION_MAX_FAILURES + 5; i++) {
        await login('9000' + String(i).padStart(2, '0'), `fresh-${i}`);
      }
      expect(h.docStore.get('pin_login_attempts/session__vs1')).toMatchObject({
        failures: PIN_LOGIN_SESSION_MAX_FAILURES,
        dayFailures: PIN_LOGIN_SESSION_MAX_FAILURES,
      });
    });

    it('shares the day budget across every session on the same roster', async () => {
      seedSession();
      h.docStore.set('video_activity_sessions/vs2', {
        teacherUid: 'teacher1',
        rosterIds: ['r1'],
      });
      h.docStore.set('pin_login_attempts/roster__teacher1__r1', {
        windowStart: Date.now() - 16 * 60 * 1000,
        failures: 0,
        dayStart: Date.now(),
        dayFailures: PIN_LOGIN_SESSION_MAX_DAILY_FAILURES,
      });
      expect(
        await callPinLogin({
          data: {
            kind: 'video-activity',
            sessionId: 'vs2',
            pin: '100001',
            period: '1',
          },
        })
      ).toEqual({ matched: false, reason: 'rate-limited' });
    });

    it('lets a student who already bridged rejoin after the session budget is spent', async () => {
      seedSession();
      expect(await login('100001', 'kid')).toMatchObject({ matched: true });
      h.docStore.set('pin_login_attempts/session__vs1', {
        windowStart: Date.now(),
        failures: PIN_LOGIN_SESSION_MAX_FAILURES,
      });
      expect(await login('100001', 'kid')).toMatchObject({ matched: true });
      expect(await login('100002', 'kid')).toEqual({
        matched: false,
        reason: 'rate-limited',
      });
      expect(await login('100001', 'someone-else')).toEqual({
        matched: false,
        reason: 'rate-limited',
      });
    });

    it('still bridges an ended teacher-paced video session for read-only review', async () => {
      seedSession();
      h.docStore.set('video_activity_sessions/vs1', {
        teacherUid: 'teacher1',
        rosterIds: ['r1'],
        status: 'ended',
        sessionMode: 'teacher',
      });
      expect(await login('100001')).toMatchObject({ matched: true });
    });

    it('does not bridge into an ended video session', async () => {
      seedSession();
      h.docStore.set('video_activity_sessions/vs1', {
        teacherUid: 'teacher1',
        rosterIds: ['r1'],
        status: 'ended',
      });
      expect(await login('100001')).toEqual({
        matched: false,
        reason: 'no-joinable-session',
      });
    });

    it('fails closed when the attempt cannot be recorded', async () => {
      seedSession();
      const db = admin.firestore() as unknown as {
        runTransaction: (...args: unknown[]) => Promise<unknown>;
      };
      const realRun = db.runTransaction;
      db.runTransaction = async () => {
        throw new Error('contention');
      };
      try {
        expect(await login('100001')).toEqual({
          matched: false,
          reason: 'rate-limited',
        });
      } finally {
        db.runTransaction = realRun;
      }
      expect(h.lastCustomToken).toBeNull();
    });

    it('resets after the window passes', async () => {
      seedSession();
      for (let i = 0; i < 10; i++)
        await login('9000' + String(i).padStart(2, '0'));
      const key = 'pin_login_attempts/vs1__anon-caller';
      h.docStore.set(key, {
        ...h.docStore.get(key),
        windowStart: Date.now() - 16 * 60 * 1000,
      });
      expect(await login('100001')).toMatchObject({ matched: true });
    });
  });

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
      callPinLogin({ data: { kind: 'quiz', pin: '123456' } }),
      'invalid-argument'
    );
  });

  it('rejects a video-activity login with no sessionId', async () => {
    await expectCode(
      callPinLogin({ data: { kind: 'video-activity', pin: '123456' } }),
      'invalid-argument'
    );
  });

  it('returns matched:false when no joinable quiz session exists', async () => {
    const res = await callPinLogin({
      data: { kind: 'quiz', code: 'ABC123', pin: '123456' },
    });
    expect(res).toMatchObject({
      matched: false,
      reason: 'no-joinable-session',
    });
  });

  it('returns matched:false when the video-activity session is missing', async () => {
    const res = await callPinLogin({
      data: { kind: 'video-activity', sessionId: 'nope', pin: '123456' },
    });
    expect(res).toMatchObject({ matched: false, reason: 'session-not-found' });
  });

  it('returns matched:false when the session has no teacherUid', async () => {
    h.docStore.set('video_activity_sessions/vs1', { rosterIds: ['r1'] });
    const res = await callPinLogin({
      data: { kind: 'video-activity', sessionId: 'vs1', pin: '123456' },
    });
    expect(res).toMatchObject({
      matched: false,
      reason: 'session-missing-teacher',
    });
  });

  it('returns matched:false when the session carries no rosters', async () => {
    h.docStore.set('video_activity_sessions/vs1', { teacherUid: 'teacher1' });
    const res = await callPinLogin({
      data: { kind: 'video-activity', sessionId: 'vs1', pin: '123456' },
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
        pin: '123456',
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
    h.docStore.set('users/teacher1/rosters/r1/pin_index/1__123456', {
      pseudonym: 'PS3',
      classId: 'CL1',
      orgId: 'org-orono',
    });

    const res = await callPinLogin({
      data: { kind: 'quiz', code: 'DUP001', pin: '123456', period: '1' },
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
    h.docStore.set('users/teacher1/rosters/r1/pin_index/1__123456', {
      pseudonym: 'PS1',
      classId: 'CL1',
      orgId: 'org-orono',
    });

    const res = await callPinLogin({
      data: { kind: 'quiz', code: 'abc 123', pin: '123456', period: '1' },
    });

    expect(res).toEqual({ matched: true, customToken: 'ct:PS1' });
    expect(h.lastCustomToken?.claims).toEqual({
      studentRole: true,
      orgId: 'org-orono',
      classIds: ['CL1'],
      pinLogin: true,
      pinSessionId: 'qs1',
    });
  });

  it('scopes a quiz token to the session the client resolved from the code', async () => {
    for (const id of ['qs-a', 'qs-b']) {
      h.docStore.set(`quiz_sessions/${id}`, {
        code: 'ABC123',
        status: 'active',
        teacherUid: 'teacher1',
        rosterIds: ['r1'],
      });
    }
    h.docStore.set('users/teacher1/rosters/r1/pin_index/1__123456', {
      pseudonym: 'PS1',
      classId: 'CL1',
      orgId: 'org-orono',
    });

    await callPinLogin({
      data: {
        kind: 'quiz',
        code: 'ABC123',
        sessionId: 'qs-b',
        pin: '123456',
        period: '1',
      },
    });

    expect(h.lastCustomToken?.claims).toMatchObject({
      pinSessionId: 'qs-b',
    });

    // A session the code does not resolve to gets no token rather than another session's.
    h.lastCustomToken = null;
    expect(
      await callPinLogin({
        data: {
          kind: 'quiz',
          code: 'ABC123',
          sessionId: 'qs-other',
          pin: '123456',
          period: '1',
        },
      })
    ).toEqual({ matched: false, reason: 'no-joinable-session' });
    expect(h.lastCustomToken).toBeNull();
  });
  it('mints a token for a resolved video-activity PIN', async () => {
    h.docStore.set('video_activity_sessions/vs1', {
      teacherUid: 'teacher1',
      rosterIds: ['r1'],
    });
    h.docStore.set('users/teacher1/rosters/r1/pin_index/1__123456', {
      pseudonym: 'PS2',
      classId: 'CL2',
      orgId: 'org-orono',
    });
    const res = await callPinLogin({
      data: {
        kind: 'video-activity',
        sessionId: 'vs1',
        pin: '123456',
        period: '1',
      },
    });
    expect(res).toEqual({ matched: true, customToken: 'ct:PS2' });
  });

  it('refuses a video-activity sessionId that names a nested doc', async () => {
    h.docStore.set('video_activity_sessions/vs1/responses/r1', {
      teacherUid: 'teacher1',
      rosterIds: ['r1'],
    });
    h.docStore.set('users/teacher1/rosters/r1/pin_index/1__123456', {
      pseudonym: 'PS2',
      classId: 'CL2',
      orgId: 'org-orono',
    });
    await expectCode(
      callPinLogin({
        data: {
          kind: 'video-activity',
          sessionId: 'vs1/responses/r1',
          pin: '123456',
          period: '1',
        },
      }),
      'invalid-argument'
    );
    expect(h.lastCustomToken).toBeNull();
  });

  describe('allowAnonymousJoin stamp', () => {
    function seedVa(extra: Record<string, unknown>) {
      h.docStore.set('video_activity_sessions/vs1', {
        teacherUid: 'teacher1',
        rosterIds: ['r1'],
        ...extra,
      });
      h.docStore.set('users/teacher1/rosters/r1/pin_index/1__123456', {
        pseudonym: 'PS2',
        classId: 'CL2',
        orgId: 'org-orono',
      });
    }
    const vaLogin = () =>
      callPinLogin({
        data: {
          kind: 'video-activity',
          sessionId: 'vs1',
          pin: '123456',
          period: '1',
        },
      });

    it('rejects a video-activity PIN login stamped false', async () => {
      seedVa({ allowAnonymousJoin: false });
      await expectCode(vaLogin(), 'permission-denied');
      expect(h.lastCustomToken).toBeNull();
    });

    it('rejects a quiz PIN login stamped false', async () => {
      h.docStore.set('quiz_sessions/qs1', {
        code: 'ABC123',
        status: 'active',
        teacherUid: 'teacher1',
        rosterIds: ['r1'],
        allowAnonymousJoin: false,
      });
      await expectCode(
        callPinLogin({
          data: { kind: 'quiz', code: 'ABC123', pin: '123456', period: '1' },
        }),
        'permission-denied'
      );
    });

    it('allows a session stamped true', async () => {
      seedVa({ allowAnonymousJoin: true });
      expect(await vaLogin()).toEqual({ matched: true, customToken: 'ct:PS2' });
    });

    it('allows an unstamped session', async () => {
      seedVa({});
      expect(await vaLogin()).toEqual({ matched: true, customToken: 'ct:PS2' });
    });

    it('allows a view-only share stamped false', async () => {
      seedVa({ allowAnonymousJoin: false, mode: 'view-only' });
      expect(await vaLogin()).toEqual({ matched: true, customToken: 'ct:PS2' });
    });
  });

  it('maps a createCustomToken failure to internal', async () => {
    h.docStore.set('video_activity_sessions/vs1', {
      teacherUid: 'teacher1',
      rosterIds: ['r1'],
    });
    h.docStore.set('users/teacher1/rosters/r1/pin_index/1__123456', {
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
          pin: '123456',
          period: '1',
        },
      }),
      'internal'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('getPseudonymsForAssignmentV1', () => {
  const TEACHER = {
    uid: 'teacher1',
    token: { email: 'teacher@orono.k12.mn.us', email_verified: true },
  };
  const ASSIGNMENT = 'asn-1';

  // OneRoster stub: the teacher teaches CL1 only (SID-A, SID-B); CL9 is a class
  // they do NOT teach and enrolls SID-FOREIGN.
  function seedOneRoster() {
    h.axiosGet = async (url: string) => {
      if (url.endsWith('/users'))
        return { data: { users: [{ sourcedId: 'T-1', role: 'teacher' }] } };
      if (url.endsWith('/users/T-1/classes'))
        return { data: { classes: [{ sourcedId: 'CL1' }] } };
      if (url.endsWith('/classes/CL1/students'))
        return {
          data: {
            users: [
              { sourcedId: 'SID-A', givenName: 'Alex', familyName: 'Lee' },
              { sourcedId: 'SID-B', givenName: 'Pat', familyName: 'Smith' },
            ],
          },
        };
      if (url.endsWith('/classes/CL9/students'))
        return {
          data: {
            users: [
              { sourcedId: 'SID-FOREIGN', givenName: 'Nope', familyName: 'X' },
            ],
          },
        };
      throw new Error('unexpected url: ' + url);
    };
  }

  it('rejects a caller with no assignmentId and no refs', async () => {
    await expectCode(
      callPseudonymsForAssignment({ auth: TEACHER, data: {} }),
      'invalid-argument'
    );
  });

  it('rejects a student-role caller', async () => {
    await expectCode(
      callPseudonymsForAssignment({
        auth: { uid: 's', token: { studentRole: true } },
        data: { assignmentId: ASSIGNMENT, classId: 'CL1' },
      }),
      'permission-denied'
    );
  });

  it('legacy classId path resolves the whole class and is unchanged by D2', async () => {
    seedOneRoster();
    const res = await callPseudonymsForAssignment({
      auth: TEACHER,
      data: { assignmentId: ASSIGNMENT, classId: 'CL1' },
    });
    expect(Object.keys(res.pseudonyms).sort()).toEqual(['SID-A', 'SID-B']);
    expect(res.pseudonyms['SID-A'].studentUid).toBe(
      computeStudentUid('SID-A', HMAC)
    );
    expect(res.pseudonyms['SID-A'].assignmentPseudonym).toBe(
      assignmentPseudonym(computeStudentUid('SID-A', HMAC), ASSIGNMENT)
    );
    expect(res.pseudonyms['SID-A'].targetRefKey).toBe('classlink:SID-A');
    expect(res.skipped).toBeUndefined();
  });

  it('refs path resolves only the targeted subset of a class', async () => {
    seedOneRoster();
    h.docStore.set('users/teacher1/rosters/r1', { classlinkClassId: 'CL1' });

    const res = await callPseudonymsForAssignment({
      auth: TEACHER,
      data: {
        assignmentId: ASSIGNMENT,
        targetStudents: [{ kind: 'classlink', sourcedId: 'SID-B' }],
      },
    });

    expect(Object.keys(res.pseudonyms)).toEqual(['SID-B']);
    expect(res.pseudonyms['SID-B'].givenName).toBe('Pat');
    expect(res.pseudonyms['SID-B'].studentUid).toBe(
      computeStudentUid('SID-B', HMAC)
    );
    expect(res.pseudonyms['SID-B'].assignmentPseudonym).toBe(
      assignmentPseudonym(computeStudentUid('SID-B', HMAC), ASSIGNMENT)
    );
    expect(res.skipped).toEqual([]);
  });

  it('never resolves a ref outside the classes the caller teaches', async () => {
    seedOneRoster();
    // CL9 forged onto the teacher's own (client-writable) roster doc;
    // ClassLink re-verification still refuses it.
    h.docStore.set('users/teacher1/rosters/r1', { classlinkClassId: 'CL1' });
    h.docStore.set('users/teacher1/rosters/r2', { classlinkClassId: 'CL9' });

    const res = await callPseudonymsForAssignment({
      auth: TEACHER,
      data: {
        assignmentId: ASSIGNMENT,
        targetStudents: [
          { kind: 'classlink', sourcedId: 'SID-A' },
          { kind: 'classlink', sourcedId: 'SID-FOREIGN' },
        ],
      },
    });

    expect(Object.keys(res.pseudonyms)).toEqual(['SID-A']);
    expect(res.skipped).toEqual([
      {
        ref: { kind: 'classlink', sourcedId: 'SID-FOREIGN' },
        reason: 'not-in-teacher-classes',
      },
    ]);
  });

  it('skips test refs when the caller is not a test-class authority', async () => {
    seedOneRoster();
    seedDomain('org-orono', '@orono.k12.mn.us');
    h.docStore.set('users/teacher1/rosters/r1', { testClassId: 'tc1' });
    h.docStore.set('organizations/org-orono/testClasses/tc1', {
      memberEmails: ['kid@orono.k12.mn.us'],
    });

    const res = await callPseudonymsForAssignment({
      auth: TEACHER,
      data: {
        assignmentId: ASSIGNMENT,
        targetStudents: [{ kind: 'test', email: 'Kid@orono.k12.mn.us' }],
      },
    });

    expect(res.pseudonyms).toEqual({});
    expect(res.skipped).toEqual([
      {
        ref: { kind: 'test', email: 'kid@orono.k12.mn.us' },
        reason: 'test-class-not-authorized',
      },
    ]);
  });

  it('resolves a test ref for a super admin, keyed by lowercased email', async () => {
    seedOneRoster();
    seedDomain('org-orono', '@orono.k12.mn.us');
    h.docStore.set('admin_settings/user_roles', {
      superAdmins: ['teacher@orono.k12.mn.us'],
    });
    h.docStore.set('users/teacher1/rosters/r1', { testClassId: 'tc1' });
    h.docStore.set('organizations/org-orono/testClasses/tc1', {
      memberEmails: ['Kid@orono.k12.mn.us'],
    });

    const res = await callPseudonymsForAssignment({
      auth: TEACHER,
      data: {
        assignmentId: ASSIGNMENT,
        targetStudents: [{ kind: 'test', email: 'kid@orono.k12.mn.us' }],
      },
    });

    const uid = computeStudentUid('test:kid@orono.k12.mn.us', HMAC);
    expect(res.pseudonyms['kid@orono.k12.mn.us'].studentUid).toBe(uid);
    expect(res.pseudonyms['kid@orono.k12.mn.us'].givenName).toBe('kid');
    expect(res.pseudonyms['kid@orono.k12.mn.us'].targetRefKey).toBe(
      'test:kid@orono.k12.mn.us'
    );
  });

  it('ignores malformed refs and falls back to the classId path', async () => {
    seedOneRoster();
    const res = await callPseudonymsForAssignment({
      auth: TEACHER,
      data: {
        assignmentId: ASSIGNMENT,
        classId: 'CL1',
        targetStudents: [{ kind: 'bogus' }, 'nope'],
      },
    });
    expect(Object.keys(res.pseudonyms).sort()).toEqual(['SID-A', 'SID-B']);
  });
});

// ---------------------------------------------------------------------------
// getPseudonymsForAssignmentV1 — caller identity verification
// ---------------------------------------------------------------------------
//
// SECURITY: an email/password account can self-report ANY email address at
// sign-up — the ID token still carries that email with `email_verified:
// false`. `teacherEmail` (from `request.auth.token.email`) drives the
// ClassLink "teaches this class" re-verification (`filter='email=...'`
// against OneRoster) below — an authorization decision. Trusting it
// unverified would let an attacker claim a real teacher's ClassLink identity
// and pull that teacher's roster pseudonyms (real student names). Same rail
// as setAssignmentTargetsV1 / organizationUserActivity.ts / isAdmin().
describe('getPseudonymsForAssignmentV1 — caller identity verification', () => {
  const EMAIL = 'teacher@orono.k12.mn.us';
  const ASSIGNMENT = 'asn-1';

  it('SECURITY: rejects a self-reported teacher email that is not verified', async () => {
    await expectCode(
      callPseudonymsForAssignment({
        auth: {
          uid: 'teacher1',
          token: { email: EMAIL, email_verified: false },
        },
        data: { assignmentId: ASSIGNMENT, classId: 'CL1' },
      }),
      'permission-denied'
    );
    // The spoofed caller must never reach ClassLink re-verification.
    expect(h.axiosGet).toBeNull();
  });

  it('rejects a token with no email_verified claim at all', async () => {
    await expectCode(
      callPseudonymsForAssignment({
        auth: { uid: 'teacher1', token: { email: EMAIL } },
        data: { assignmentId: ASSIGNMENT, classId: 'CL1' },
      }),
      'permission-denied'
    );
  });

  it('allows a verified teacher email through past the identity gate', async () => {
    h.axiosGet = async (url: string) => {
      if (url.endsWith('/users'))
        return { data: { users: [{ sourcedId: 'T-1', role: 'teacher' }] } };
      if (url.endsWith('/users/T-1/classes'))
        return { data: { classes: [{ sourcedId: 'CL1' }] } };
      if (url.endsWith('/classes/CL1/students')) return { data: { users: [] } };
      throw new Error('unexpected url: ' + url);
    };
    const res = await callPseudonymsForAssignment({
      auth: { uid: 'teacher1', token: { email: EMAIL, email_verified: true } },
      data: { assignmentId: ASSIGNMENT, classId: 'CL1' },
    });
    expect(res.pseudonyms).toEqual({});
  });
});
