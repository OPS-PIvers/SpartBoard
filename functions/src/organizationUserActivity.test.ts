/* eslint-disable @typescript-eslint/require-await -- the firebase-admin mock
   surfaces several methods the production SDK returns as Promises (`getUsers`,
   Firestore `get()`). Typing them as `async` is the cleanest way to match the
   real signatures even when a particular stub body is synchronous. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- firebase-admin mock ------------------------------------------------
//
// We need fine-grained control over both `firestore()` (for the member-doc
// existence + role check) and `auth().getUsers()` (for the batch-failure path).
// Each test resets these via `setMemberDoc` / `setGetUsersImpl` below.

type MemberDocData = { roleId: string } | undefined;
let memberDocFactory: (callerEmail: string) => MemberDocData = () => undefined;
let memberEmails: string[] = [];
let getUsersImpl: (identifiers: { email: string }[]) => Promise<{
  users: { email?: string; metadata: { lastSignInTime?: string } }[];
  notFound: unknown[];
}> = async () => ({ users: [], notFound: [] });

// Spy we assert against in the role-gate tests.
const getUsersSpy = vi.fn();

vi.mock('firebase-admin', () => {
  // The handler builds queries like
  //   db.collection('organizations').doc(orgId).collection('members').doc(email).get()
  // and
  //   db.collection('organizations').doc(orgId).collection('members').select().get()
  // — we model just enough of the chain to satisfy both call sites.
  const buildMembersCollection = () => ({
    doc: (email: string) => ({
      get: async () => {
        const data = memberDocFactory(email.toLowerCase());
        return {
          exists: data !== undefined,
          data: () => data,
        };
      },
    }),
    select: () => ({
      get: async () => ({
        docs: memberEmails.map((id) => ({ id })),
      }),
    }),
  });

  const firestore = vi.fn(() => ({
    collection: (name: string) => {
      if (name !== 'organizations') {
        throw new Error(`Unexpected collection: ${name}`);
      }
      return {
        doc: () => ({
          collection: (sub: string) => {
            if (sub !== 'members') {
              throw new Error(`Unexpected subcollection: ${sub}`);
            }
            return buildMembersCollection();
          },
        }),
      };
    },
  }));

  const auth = vi.fn(() => ({
    getUsers: (identifiers: { email: string }[]) => {
      getUsersSpy(identifiers);
      return getUsersImpl(identifiers);
    },
  }));

  return {
    apps: [{ name: '[DEFAULT]' }],
    initializeApp: vi.fn(),
    firestore,
    auth,
  };
});

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'HttpsError';
    }
  }
  return {
    onCall: (_options: unknown, handler: unknown) => handler,
    HttpsError,
  };
});

import { getOrgUserActivity } from './organizationUserActivity';

interface ActivityResponse {
  activity: { email: string; lastActiveMs: number | null }[];
  partial: boolean;
  failedBatchCount: number;
}

type CallableHandler = (request: {
  auth?: { uid: string; token: { email?: string } };
  data: unknown;
}) => Promise<ActivityResponse>;

const handler = getOrgUserActivity as unknown as CallableHandler;

const ADMIN_EMAIL = 'admin@orono.k12.mn.us';

function authedCaller(email = ADMIN_EMAIL) {
  return { uid: 'uid-' + email, token: { email } };
}

function setSingleAdmin(email: string, roleId: string) {
  memberDocFactory = (caller) =>
    caller === email.toLowerCase() ? { roleId } : undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: caller is unknown, no members in org, getUsers returns empty.
  memberDocFactory = () => undefined;
  memberEmails = [];
  getUsersImpl = async () => ({ users: [], notFound: [] });
  // Silence the structured error log emitted on partial responses.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getOrgUserActivity — input validation', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(handler({ data: { orgId: 'orono' } })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('rejects callers without an email claim', async () => {
    await expect(
      handler({
        auth: { uid: 'uid1', token: {} },
        data: { orgId: 'orono' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects payloads missing orgId', async () => {
    await expect(
      handler({
        auth: { uid: 'uid1', token: { email: ADMIN_EMAIL } },
        data: {},
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects non-object payloads', async () => {
    await expect(
      handler({
        auth: { uid: 'uid1', token: { email: ADMIN_EMAIL } },
        data: 'not-an-object',
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('getOrgUserActivity — role-gate', () => {
  // The callable must reject anyone outside ACTIVITY_ROLE_IDS. If a future
  // refactor accidentally appends `teacher` to that set, full-org sign-in
  // metadata leaks — these tests exist to fail loudly when that happens.

  it.each(['super_admin', 'domain_admin', 'building_admin'])(
    'allows %s callers',
    async (roleId) => {
      setSingleAdmin(ADMIN_EMAIL, roleId);
      memberEmails = [ADMIN_EMAIL];
      getUsersImpl = async () => ({ users: [], notFound: [] });

      const res = await handler({
        auth: authedCaller(),
        data: { orgId: 'orono' },
      });

      expect(res.activity).toHaveLength(1);
      expect(res.partial).toBe(false);
      expect(res.failedBatchCount).toBe(0);
    }
  );

  it('rejects teacher-role callers with permission-denied', async () => {
    setSingleAdmin(ADMIN_EMAIL, 'teacher');
    memberEmails = [ADMIN_EMAIL];

    await expect(
      handler({ auth: authedCaller(), data: { orgId: 'orono' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });

    expect(getUsersSpy).not.toHaveBeenCalled();
  });

  it('rejects callers who are not members of the requested org', async () => {
    // memberDocFactory returns undefined for everyone → snap.exists === false
    memberDocFactory = () => undefined;

    await expect(
      handler({ auth: authedCaller(), data: { orgId: 'orono' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });

    expect(getUsersSpy).not.toHaveBeenCalled();
  });
});

describe('getOrgUserActivity — partial Auth-API failures', () => {
  it('returns partial: true when one batch throws, preserving data from succeeding batches', async () => {
    setSingleAdmin(ADMIN_EMAIL, 'super_admin');

    // Two full batches of 100 + a third batch with one row → 201 emails total.
    // We mock the second batch to throw so we can assert that the data from
    // batches 1 and 3 still shows up in the response.
    const batch1 = Array.from(
      { length: 100 },
      (_, i) => `b1-${i}@orono.k12.mn.us`
    );
    const batch2 = Array.from(
      { length: 100 },
      (_, i) => `b2-${i}@orono.k12.mn.us`
    );
    const batch3 = ['b3-0@orono.k12.mn.us'];
    memberEmails = [...batch1, ...batch2, ...batch3];

    let callIdx = 0;
    getUsersImpl = async (ids) => {
      const idx = callIdx++;
      if (idx === 1) {
        const err = new Error('Auth backend unavailable') as Error & {
          code?: string;
        };
        err.code = 'auth/internal-error';
        throw err;
      }
      // Return one matching user per identifier so we can verify the data
      // from the surviving batches actually lands in `activity`.
      return {
        users: ids.map(({ email }) => ({
          email,
          metadata: { lastSignInTime: 'Mon, 14 Apr 2026 12:00:00 GMT' },
        })),
        notFound: [],
      };
    };

    const res = await handler({
      auth: authedCaller(),
      data: { orgId: 'orono' },
    });

    expect(res.partial).toBe(true);
    expect(res.failedBatchCount).toBe(1);
    expect(res.activity).toHaveLength(201);

    const byEmail = new Map(res.activity.map((e) => [e.email, e.lastActiveMs]));
    // Batches 1 and 3 succeeded → real timestamps populated.
    expect(byEmail.get('b1-0@orono.k12.mn.us')).toBe(
      Date.parse('Mon, 14 Apr 2026 12:00:00 GMT')
    );
    expect(byEmail.get('b3-0@orono.k12.mn.us')).toBe(
      Date.parse('Mon, 14 Apr 2026 12:00:00 GMT')
    );
    // Batch 2 failed → emails present but lastActiveMs is null (NOT silently
    // indistinguishable from "never signed in" — caller sees `partial: true`).
    expect(byEmail.get('b2-0@orono.k12.mn.us')).toBeNull();
  });

  it('returns partial: true with failedBatchCount === batches.length when every batch fails', async () => {
    // A full Auth outage must NOT look like "every member is idle." If all
    // batches reject, every `lastActiveMs` stays null — the exact same wire
    // shape as a healthy roster of never-signed-in invitees. The `partial`
    // flag is the ONLY signal that separates the two. Pins that invariant:
    // any regression that short-circuits on `outcomes.every(o => !o.ok)` or
    // resets `failedBatchCount` on a total-failure path would fail this case.
    setSingleAdmin(ADMIN_EMAIL, 'super_admin');

    // 250 emails → three batches (100 + 100 + 50).
    const emails = Array.from(
      { length: 250 },
      (_, i) => `user-${i}@orono.k12.mn.us`
    );
    memberEmails = emails;

    getUsersImpl = async () => {
      const err = new Error('Auth backend unavailable') as Error & {
        code?: string;
      };
      err.code = 'auth/internal-error';
      throw err;
    };

    const res = await handler({
      auth: authedCaller(),
      data: { orgId: 'orono' },
    });

    const expectedBatches = Math.ceil(emails.length / 100);
    expect(res.partial).toBe(true);
    expect(res.failedBatchCount).toBe(expectedBatches);
    expect(res.activity).toHaveLength(emails.length);
    expect(res.activity.every((e) => e.lastActiveMs === null)).toBe(true);
    // failedBatchCount MUST NOT exceed the number of batches — guards against
    // a future double-count regression in the outcomes loop.
    expect(res.failedBatchCount).toBeLessThanOrEqual(expectedBatches);
  });

  it('returns partial: false when all batches succeed', async () => {
    setSingleAdmin(ADMIN_EMAIL, 'super_admin');
    memberEmails = ['user-a@orono.k12.mn.us', 'user-b@orono.k12.mn.us'];
    getUsersImpl = async (ids) => ({
      users: ids.map(({ email }) => ({
        email,
        metadata: { lastSignInTime: 'Mon, 14 Apr 2026 12:00:00 GMT' },
      })),
      notFound: [],
    });

    const res = await handler({
      auth: authedCaller(),
      data: { orgId: 'orono' },
    });

    expect(res.partial).toBe(false);
    expect(res.failedBatchCount).toBe(0);
    expect(res.activity).toHaveLength(2);
  });

  it('returns partial: false with no batches when org has no members', async () => {
    setSingleAdmin(ADMIN_EMAIL, 'super_admin');
    memberEmails = [];

    const res = await handler({
      auth: authedCaller(),
      data: { orgId: 'orono' },
    });

    expect(res).toEqual({ activity: [], partial: false, failedBatchCount: 0 });
    expect(getUsersSpy).not.toHaveBeenCalled();
  });
});
