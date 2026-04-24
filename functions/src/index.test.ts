/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

interface MockDocInput {
  id: string;
  data: Record<string, unknown>;
  /** Optional: populates ref.parent.parent.id for dashboard snapshots */
  ownerUid?: string;
  /** Optional: when true, simulates an anonymous auth user (no email, no providers) */
  anonymous?: boolean;
  /**
   * Optional: when true, the member doc exists (so the user counts toward
   * totals/domain/building buckets) but carries no `uid` — mirrors a user
   * who was invited but has never signed in. Engagement (monthly/daily,
   * lastSignInMs, lastEditMs) is forced to zero for these members.
   */
  invited?: boolean;
  /**
   * Optional: when true, simulates a signed-in Firebase Auth user who is NOT
   * a member of the requested org. Their auth account exists (so listUsers /
   * getUsers still returns them) and their dashboards/AI usage still live
   * under their uid, but the member doc at
   * `/organizations/{orgId}/members/{email}` does NOT exist, so they must
   * be excluded from every analytics metric.
   */
  nonMember?: boolean;
}

const mockFirestoreState = {
  admins: new Set<string>(),
  users: [] as MockDocInput[],
  dashboards: [] as MockDocInput[],
  aiUsage: [] as MockDocInput[],
};

const toDocSnapshot = (doc: MockDocInput) => ({
  id: doc.id,
  exists: true,
  data: () => doc.data,
  ref: {
    parent: {
      parent: doc.ownerUid != null ? { id: doc.ownerUid } : null,
    },
  },
});

const toAsyncStream = (docs: MockDocInput[]) => ({
  async *[Symbol.asyncIterator]() {
    for (const doc of docs) {
      await Promise.resolve();
      yield toDocSnapshot(doc);
    }
  },
});

interface MockDocRef {
  path: string;
}

const mockFirestore = {
  doc: vi.fn((path: string) => ({
    path,
    get: vi.fn(() => Promise.resolve({ exists: false })),
  })),
  getAll: vi.fn((...refs: MockDocRef[]) => {
    return Promise.resolve(
      refs.map(() => ({ exists: false, data: () => ({}) }))
    );
  }),
  collection: vi.fn((name: string) => {
    if (name === 'admins') {
      return {
        doc: vi.fn((id: string) => ({
          get: vi.fn(() =>
            Promise.resolve({ exists: mockFirestoreState.admins.has(id) })
          ),
        })),
      };
    }

    // Members collection for org-scoped analytics. Each `mockFirestoreState.users`
    // entry represents a member of the org with `id` as their uid, `email` as
    // their member email, and `buildings` as their admin-assigned buildingIds.
    if (name.startsWith('organizations/') && name.endsWith('/members')) {
      return {
        get: vi.fn(() =>
          Promise.resolve({
            docs: mockFirestoreState.users
              .filter((u) => !u.anonymous && !u.nonMember)
              .map((u) => ({
                id: (u.data.email as string | undefined) ?? u.id,
                data: () => ({
                  email: u.data.email,
                  // Invited-but-never-signed-in members have no uid on the
                  // member doc. Production treats a non-string `uid` as null
                  // and skips engagement for them.
                  uid: u.invited ? null : u.id,
                  buildingIds: u.data.buildings ?? [],
                }),
              })),
          })
        ),
      };
    }

    if (name === 'users') {
      return {
        select: vi.fn(() => ({
          stream: vi.fn(() => toAsyncStream(mockFirestoreState.users)),
        })),
        where: vi.fn(
          (
            _field: string,
            _operator: string,
            ids: string[] | readonly string[]
          ) => ({
            select: vi.fn(() => ({
              get: vi.fn(() => {
                const idSet = new Set(ids);
                const matchedDocs = mockFirestoreState.users
                  .filter((doc) => idSet.has(doc.id))
                  .map((doc) => toDocSnapshot(doc));
                return Promise.resolve({ docs: matchedDocs });
              }),
            })),
          })
        ),
      };
    }

    if (name === 'ai_usage') {
      return {
        select: vi.fn(() => ({
          stream: vi.fn(() => toAsyncStream(mockFirestoreState.aiUsage)),
        })),
      };
    }

    return {
      select: vi.fn(() => ({
        stream: vi.fn(() => toAsyncStream([])),
      })),
    };
  }),
  collectionGroup: vi.fn((name: string) => {
    if (name === 'dashboards') {
      return {
        select: vi.fn(() => ({
          stream: vi.fn(() => toAsyncStream(mockFirestoreState.dashboards)),
        })),
      };
    }

    return {
      select: vi.fn(() => ({
        stream: vi.fn(() => toAsyncStream([])),
      })),
    };
  }),
  runTransaction: vi.fn(),
};

// Mock firebase-admin
vi.mock('firebase-admin', () => {
  const firestoreFn = vi.fn(() => mockFirestore);
  Object.assign(firestoreFn, {
    FieldPath: {
      documentId: vi.fn(() => '__name__'),
    },
  });

  const apps: unknown[] = [];
  return {
    apps,
    initializeApp: vi.fn(() => {
      if (apps.length === 0) apps.push({ name: '[DEFAULT]' });
    }),
    firestore: firestoreFn,
    auth: vi.fn(() => ({
      verifyIdToken: vi.fn().mockResolvedValue({ email: 'admin@school.org' }),
      listUsers: vi.fn().mockImplementation(() => {
        const users = mockFirestoreState.users.map((u) => ({
          uid: u.id,
          email: u.anonymous ? undefined : (u.data.email as string),
          metadata: {
            lastSignInTime: u.data.lastLogin
              ? new Date(u.data.lastLogin as number).toISOString()
              : undefined,
          },
          providerData: u.anonymous ? [] : [{ providerId: 'google.com' }],
        }));
        return Promise.resolve({ users, pageToken: undefined });
      }),
      getUsers: vi.fn().mockImplementation((ids: { uid: string }[]) => {
        const uidSet = new Set(ids.map((i) => i.uid));
        const users = mockFirestoreState.users
          .filter((u) => uidSet.has(u.id))
          .map((u) => ({
            uid: u.id,
            email: u.anonymous ? undefined : (u.data.email as string),
            metadata: {
              lastSignInTime: u.data.lastLogin
                ? new Date(u.data.lastLogin as number).toISOString()
                : undefined,
            },
          }));
        return Promise.resolve({ users });
      }),
    })),
  };
});

// Mock firebase-functions/v2/https
// onCall returns a wrapper that accepts the legacy v1 (data, context)
// invocation pattern used by the existing tests and translates it into the
// v2 { data, auth } request shape that the real handlers now expect.
vi.mock('firebase-functions/v2/https', () => ({
  onCall: <T>(
    _options: unknown,
    handler: (request: {
      data: T;
      auth?: { token: { email: string }; uid: string };
    }) => Promise<unknown>
  ) => {
    return (
      data: T,
      context?: { auth?: { token: { email: string }; uid: string } }
    ) => handler({ data, auth: context?.auth });
  },
  onRequest: <Req, Res>(
    _options: unknown,
    handler: (req: Req, res: Res) => unknown
  ) => handler,
  HttpsError: class extends Error {
    constructor(code: string, message: string) {
      super(message);
      this.name = code;
    }
  },
}));

// Mock firebase-functions/v2 (setGlobalOptions)
vi.mock('firebase-functions/v2', () => ({
  setGlobalOptions: vi.fn(),
}));

// Mock firebase-functions/params (defineSecret)
vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({
    value: () => process.env[name] ?? `mock-${name}`,
    name,
  }),
}));

// Mock axios
vi.mock('axios');

// Import the function under test
import {
  fetchExternalProxy,
  checkUrlCompatibility,
  adminAnalytics,
  getPseudonymsForAssignmentV1,
} from './index';

describe('fetchExternalProxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreState.admins = new Set<string>();
    mockFirestoreState.users = [];
    mockFirestoreState.dashboards = [];
    mockFirestoreState.aiUsage = [];
  });

  it('should throw unauthenticated error if no auth context', async () => {
    const handler = fetchExternalProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await expect(
      handler({ url: 'https://api.openweathermap.org/data/2.5/weather' }, {})
    ).rejects.toThrow('The function must be called while authenticated.');
  });

  it('should throw invalid-argument for invalid host', async () => {
    const handler = fetchExternalProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await expect(
      handler({ url: 'https://example.com/weather' }, { auth: { uid: '123' } })
    ).rejects.toThrow(
      'Invalid proxy URL. Only https://api.openweathermap.org, https://owc.enterprise.earthnetworks.com, and https://orono.api.nutrislice.com are allowed.'
    );
  });

  it('should throw invalid-argument for invalid protocol', async () => {
    const handler = fetchExternalProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await expect(
      handler(
        { url: 'http://api.openweathermap.org/data' },
        { auth: { uid: '123' } }
      )
    ).rejects.toThrow(
      'Invalid proxy URL. Only https://api.openweathermap.org, https://owc.enterprise.earthnetworks.com, and https://orono.api.nutrislice.com are allowed.'
    );
  });

  it('should return data successfully for valid openweathermap url', async () => {
    const mockGet = vi.mocked(axios.get);
    mockGet.mockResolvedValue({ data: { temp: 72 } });

    const handler = fetchExternalProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<{ temp: number }>;
    const result = await handler(
      { url: 'https://api.openweathermap.org/data/2.5/weather?q=London' },
      { auth: { uid: '123' } }
    );

    expect(mockGet).toHaveBeenCalledWith(
      'https://api.openweathermap.org/data/2.5/weather?q=London'
    );
    expect(result).toEqual({ temp: 72 });
  });

  it('should return data successfully for valid earthnetworks url', async () => {
    const mockGet = vi.mocked(axios.get);
    mockGet.mockResolvedValue({ data: { o: { t: 72, ic: 0 } } });

    const handler = fetchExternalProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<{ o: { t: number; ic: number } }>;
    const result = await handler(
      {
        url: 'https://owc.enterprise.earthnetworks.com/Data/GetData.ashx?si=BLLST',
      },
      { auth: { uid: '123' } }
    );

    expect(mockGet).toHaveBeenCalledWith(
      'https://owc.enterprise.earthnetworks.com/Data/GetData.ashx?si=BLLST'
    );
    expect(result).toEqual({ o: { t: 72, ic: 0 } });
  });

  it('should throw internal error if axios throws', async () => {
    const mockGet = vi.mocked(axios.get);
    mockGet.mockRejectedValue(new Error('Network error'));

    const handler = fetchExternalProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await expect(
      handler(
        { url: 'https://api.openweathermap.org/data/2.5/weather?q=London' },
        { auth: { uid: '123' } }
      )
    ).rejects.toThrow('Network error');
  });
});

describe('checkUrlCompatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreState.admins = new Set<string>();
    mockFirestoreState.users = [];
    mockFirestoreState.dashboards = [];
    mockFirestoreState.aiUsage = [];
  });

  it('should throw unauthenticated error if no auth context', async () => {
    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await expect(handler({ url: 'https://example.com' }, {})).rejects.toThrow(
      'The function must be called while authenticated.'
    );
  });

  it('should return isEmbeddable false for x-frame-options deny', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockResolvedValue({
      headers: {
        'x-frame-options': 'DENY',
      },
    });

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<{ isEmbeddable: boolean; reason: string }>;
    const result = await handler(
      { url: 'https://example.com' },
      { auth: { uid: '123' } }
    );

    expect(result.isEmbeddable).toBe(false);
    expect(result.reason).toContain('X-Frame-Options: DENY');
  });

  it('should return isEmbeddable false for x-frame-options sameorigin', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockResolvedValue({
      headers: {
        'x-frame-options': 'SAMEORIGIN',
      },
    });

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<{ isEmbeddable: boolean; reason: string }>;
    const result = await handler(
      { url: 'https://example.com' },
      { auth: { uid: '123' } }
    );

    expect(result.isEmbeddable).toBe(false);
    expect(result.reason).toContain('X-Frame-Options: SAMEORIGIN');
  });

  it('should return isEmbeddable false for strict content-security-policy', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockResolvedValue({
      headers: {
        'content-security-policy':
          "default-src 'self'; frame-ancestors 'none';",
      },
    });

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<{ isEmbeddable: boolean; reason: string }>;
    const result = await handler(
      { url: 'https://example.com' },
      { auth: { uid: '123' } }
    );

    expect(result.isEmbeddable).toBe(false);
    expect(result.reason).toContain(
      'strict Content Security Policy (frame-ancestors)'
    );
  });

  it('should return isEmbeddable true if no restrictive headers are present', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockResolvedValue({
      headers: {},
    });

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<{ isEmbeddable: boolean; reason: string }>;
    const result = await handler(
      { url: 'https://example.com' },
      { auth: { uid: '123' } }
    );

    expect(result.isEmbeddable).toBe(true);
    expect(result.reason).toBe('');
  });

  it('should return isEmbeddable true and uncertain true if axios throws', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockRejectedValue(new Error('Network error on head request'));

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<{ isEmbeddable: boolean; uncertain: boolean; error: string }>;
    const result = await handler(
      { url: 'https://example.com' },
      { auth: { uid: '123' } }
    );

    expect(result.isEmbeddable).toBe(true);
    expect(result.uncertain).toBe(true);
    expect(result.error).toContain('Network error on head request');
  });
});

describe('adminAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreState.admins = new Set<string>(['admin@school.org']);
    mockFirestoreState.users = [];
    mockFirestoreState.dashboards = [];
    mockFirestoreState.aiUsage = [];
  });

  it('aggregates users by domain and building, including no-building users', async () => {
    const now = Date.now();
    mockFirestoreState.users = [
      {
        id: 'uid1',
        data: {
          email: 'teacher1@district.org',
          lastLogin: now - 2 * 60 * 60 * 1000,
          buildings: ['north', 'south'],
        },
      },
      {
        id: 'uid2',
        data: {
          email: 'teacher2@district.org',
          lastLogin: now - 10 * 24 * 60 * 60 * 1000,
          buildings: [],
        },
      },
      {
        id: 'uid3',
        data: {
          email: 'teacher3@other.org',
          lastLogin: now - 45 * 24 * 60 * 60 * 1000,
          buildings: ['north'],
        },
      },
    ];
    mockFirestoreState.dashboards = [
      {
        id: 'dash1',
        ownerUid: 'uid1',
        data: { updatedAt: now - 1 * 60 * 60 * 1000, widgets: [] },
      },
      {
        id: 'dash2',
        ownerUid: 'uid2',
        data: { updatedAt: now - 10 * 24 * 60 * 60 * 1000, widgets: [] },
      },
    ];

    mockFirestoreState.aiUsage = [
      { id: 'uid1_2026-03-30', data: { count: 10 } },
      { id: 'uid_missing_2026-03-30', data: { count: 7 } },
      { id: 'uid2_smart-poll_2026-03-30', data: { count: 99 } },
    ];

    const handler = adminAnalytics;

    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
    const resPromise = new Promise<any>((resolve) => {
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((data) => {
          resolve(data);
          return data;
        }),
        setHeader: vi.fn().mockReturnThis(),
        getHeader: vi.fn().mockReturnValue(''),
      };

      const mockReq = {
        headers: {
          origin: 'http://localhost',
          authorization: 'Bearer mock-token',
        },
        body: { orgId: 'orono' },
      };

      (handler as any)(mockReq, mockRes);
    });

    const capturedData = await resPromise;

    expect(capturedData.users.total).toBe(3);
    expect(capturedData.users.monthly).toBe(2);
    expect(capturedData.users.daily).toBe(1);
    expect(capturedData.users.domains['district.org']).toEqual({
      total: 2,
      monthly: 2,
      daily: 1,
    });
    expect(capturedData.users.buildings.north).toEqual({
      total: 2,
      monthly: 1,
      daily: 1,
    });
    expect(capturedData.users.buildings.none).toEqual({
      total: 1,
      monthly: 1,
      daily: 0,
    });
    expect(capturedData.users.domainBuilding['district.org'].none).toEqual({
      total: 1,
      monthly: 1,
      daily: 0,
    });
    expect(capturedData.api.totalCalls).toBe(10);
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
  });

  it('returns topUsers with resolved email and unknown fallback', async () => {
    mockFirestoreState.users = [
      {
        id: 'uid_a',
        data: {
          email: 'known@district.org',
          lastLogin: Date.now(),
          buildings: [],
        },
      },
      {
        id: 'uid_b',
        data: {
          lastLogin: Date.now(),
          buildings: [],
        },
      },
    ];

    mockFirestoreState.aiUsage = [
      { id: 'uid_a_2026-03-30', data: { count: 5 } },
      { id: 'uid_b_2026-03-30', data: { count: 3 } },
    ];

    const handler = adminAnalytics;

    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
    const resPromise = new Promise<any>((resolve) => {
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((data) => {
          resolve(data);
          return data;
        }),
        setHeader: vi.fn().mockReturnThis(),
        getHeader: vi.fn().mockReturnValue(''),
      };

      const mockReq = {
        headers: {
          origin: 'http://localhost',
          authorization: 'Bearer mock-token',
        },
        body: { orgId: 'orono' },
      };

      (handler as any)(mockReq, mockRes);
    });

    const capturedData = await resPromise;

    expect(capturedData.api.topUsers[0]).toEqual({
      uid: 'uid_a',
      count: 5,
      email: 'known@district.org',
    });
    expect(capturedData.api.topUsers[1]).toEqual({
      uid: 'uid_b',
      count: 3,
      email: 'Unknown (uid_b)',
    });
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
  });

  it('returns usersByType with correct count and resolved emails', async () => {
    mockFirestoreState.users = [
      {
        id: 'uid_alice',
        data: {
          email: 'alice@district.org',
          lastLogin: Date.now(),
          buildings: [],
        },
      },
      {
        id: 'uid_bob',
        data: {
          email: 'bob@district.org',
          lastLogin: Date.now(),
          buildings: [],
        },
      },
    ];
    // alice has both clock and timer; bob has only clock
    // alice appears on two dashboards — should be counted once per widget
    mockFirestoreState.dashboards = [
      {
        id: 'dash-alice-1',
        ownerUid: 'uid_alice',
        data: {
          updatedAt: Date.now(),
          widgets: [{ type: 'clock' }, { type: 'timer' }],
        },
      },
      {
        id: 'dash-alice-2',
        ownerUid: 'uid_alice',
        data: {
          updatedAt: Date.now(),
          widgets: [{ type: 'clock' }],
        },
      },
      {
        id: 'dash-bob-1',
        ownerUid: 'uid_bob',
        data: {
          updatedAt: Date.now(),
          widgets: [{ type: 'clock' }],
        },
      },
    ];

    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
    const resPromise = new Promise<any>((resolve) => {
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((data) => {
          resolve(data);
          return data;
        }),
        setHeader: vi.fn().mockReturnThis(),
        getHeader: vi.fn().mockReturnValue(''),
      };
      const mockReq = {
        headers: {
          origin: 'http://localhost',
          authorization: 'Bearer mock-token',
        },
        body: { orgId: 'orono' },
      };
      (adminAnalytics as any)(mockReq, mockRes);
    });

    const capturedData = await resPromise;

    // clock: 2 distinct users (alice counted once despite 2 dashboards)
    expect(capturedData.widgets.usersByType.clock.count).toBe(2);
    expect(capturedData.widgets.usersByType.clock.emails).toHaveLength(2);
    expect(capturedData.widgets.usersByType.clock.emails).toContain(
      'alice@district.org'
    );
    expect(capturedData.widgets.usersByType.clock.emails).toContain(
      'bob@district.org'
    );

    // timer: only alice
    expect(capturedData.widgets.usersByType.timer.count).toBe(1);
    expect(capturedData.widgets.usersByType.timer.emails).toEqual([
      'alice@district.org',
    ]);
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
  });

  it('caps usersByType emails at 20 and reports accurate count up to 100', async () => {
    // Create 25 distinct users all with the same widget
    const users: MockDocInput[] = Array.from({ length: 25 }, (_, i) => ({
      id: `uid_${i}`,
      data: {
        email: `user${i}@district.org`,
        lastLogin: Date.now(),
        buildings: [],
      },
    }));
    mockFirestoreState.users = users;
    mockFirestoreState.dashboards = users.map((u) => ({
      id: `dash-${u.id}`,
      ownerUid: u.id,
      data: { updatedAt: Date.now(), widgets: [{ type: 'clock' }] },
    }));

    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
    const resPromise = new Promise<any>((resolve) => {
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((data) => {
          resolve(data);
          return data;
        }),
        setHeader: vi.fn().mockReturnThis(),
        getHeader: vi.fn().mockReturnValue(''),
      };
      const mockReq = {
        headers: {
          origin: 'http://localhost',
          authorization: 'Bearer mock-token',
        },
        body: { orgId: 'orono' },
      };
      (adminAnalytics as any)(mockReq, mockRes);
    });

    const capturedData = await resPromise;

    // All 25 distinct users tracked (well within the 100-cap)
    expect(capturedData.widgets.usersByType.clock.count).toBe(25);
    // Emails preview capped at 20
    expect(capturedData.widgets.usersByType.clock.emails).toHaveLength(20);
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
  });

  it('excludes anonymous auth users from all analytics metrics', async () => {
    const now = Date.now();
    mockFirestoreState.users = [
      {
        id: 'uid_teacher',
        data: {
          email: 'teacher@school.org',
          lastLogin: now - 2 * 60 * 60 * 1000,
          buildings: ['north'],
        },
      },
      {
        id: 'uid_anon1',
        anonymous: true,
        data: {
          lastLogin: now - 1 * 60 * 60 * 1000,
          buildings: [],
        },
      },
      {
        id: 'uid_anon2',
        anonymous: true,
        data: {
          lastLogin: now - 30 * 60 * 1000,
          buildings: [],
        },
      },
    ];

    mockFirestoreState.dashboards = [
      {
        id: 'dash-teacher',
        ownerUid: 'uid_teacher',
        data: {
          updatedAt: now,
          widgets: [{ type: 'clock' }],
        },
      },
      {
        id: 'dash-anon1',
        ownerUid: 'uid_anon1',
        data: {
          updatedAt: now,
          widgets: [{ type: 'clock' }, { type: 'timer' }],
        },
      },
    ];

    mockFirestoreState.aiUsage = [
      { id: 'uid_teacher_2026-03-30', data: { count: 5 } },
      { id: 'uid_anon1_2026-03-30', data: { count: 10 } },
    ];

    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
    const resPromise = new Promise<any>((resolve) => {
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((data) => {
          resolve(data);
          return data;
        }),
        setHeader: vi.fn().mockReturnThis(),
        getHeader: vi.fn().mockReturnValue(''),
      };
      const mockReq = {
        headers: {
          origin: 'http://localhost',
          authorization: 'Bearer mock-token',
        },
        body: { orgId: 'orono' },
      };
      (adminAnalytics as any)(mockReq, mockRes);
    });

    const capturedData = await resPromise;

    // Only the teacher should be counted — anonymous users excluded
    expect(capturedData.users.total).toBe(1);
    expect(capturedData.users.registered).toBe(1);
    expect(capturedData.users.monthly).toBe(1);
    expect(capturedData.users.daily).toBe(1);

    // No 'unknown' domain should appear
    expect(capturedData.users.domains['unknown']).toBeUndefined();
    expect(capturedData.users.domains['school.org']).toEqual({
      total: 1,
      monthly: 1,
      daily: 1,
    });

    // Only teacher's dashboard counted
    expect(capturedData.users.withDashboards).toBe(1);
    expect(capturedData.dashboards.total).toBe(1);

    // Only teacher's AI usage counted
    expect(capturedData.api.totalCalls).toBe(5);
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
  });

  it('excludes signed-in auth users who are not members of the requested org', async () => {
    // Tenant-isolation contract: membership is determined by the presence of
    // a member doc at `/organizations/{orgId}/members/{email}`, NOT by the
    // user's email domain or the existence of a Firebase Auth account. A
    // signed-in user must not leak into analytics just because they:
    //   (a) belong to a different org (foreign domain), OR
    //   (b) share an approved domain with real members but were never invited
    //       (e.g., signed in via Google SSO, got an auth account, created
    //       some dashboards, but the admin never added them to the roster).
    // Locks in the fix for the "foreign-domain users leaking into analytics"
    // bug (PR #1375) and the related "approved-domain but not invited" case.
    const now = Date.now();
    mockFirestoreState.users = [
      // Real org member.
      {
        id: 'uid_member',
        data: {
          email: 'member@school.org',
          lastLogin: now - 2 * 60 * 60 * 1000,
          buildings: ['north'],
        },
      },
      // Case (a): signed-in auth user from a different org — real email,
      // real uid, real dashboards, but no member doc for this org.
      {
        id: 'uid_foreign',
        nonMember: true,
        data: {
          email: 'foreign@other-district.org',
          lastLogin: now - 1 * 60 * 60 * 1000,
          buildings: [],
        },
      },
      // Case (b): signed-in auth user whose email domain MATCHES the real
      // member's domain (e.g., an approved-domain user who SSO'd in but was
      // never invited). Must still be excluded — domain match alone doesn't
      // grant org membership.
      {
        id: 'uid_uninvited_same_domain',
        nonMember: true,
        data: {
          email: 'uninvited@school.org',
          lastLogin: now - 30 * 60 * 1000,
          buildings: [],
        },
      },
    ];

    mockFirestoreState.dashboards = [
      {
        id: 'dash-member',
        ownerUid: 'uid_member',
        data: { updatedAt: now, widgets: [{ type: 'clock' }] },
      },
      {
        id: 'dash-foreign',
        ownerUid: 'uid_foreign',
        data: {
          updatedAt: now,
          widgets: [{ type: 'clock' }, { type: 'timer' }],
        },
      },
      {
        id: 'dash-uninvited',
        ownerUid: 'uid_uninvited_same_domain',
        data: {
          updatedAt: now,
          widgets: [{ type: 'stopwatch' }],
        },
      },
    ];

    mockFirestoreState.aiUsage = [
      { id: 'uid_member_2026-03-30', data: { count: 5 } },
      { id: 'uid_foreign_2026-03-30', data: { count: 99 } },
      { id: 'uid_uninvited_same_domain_2026-03-30', data: { count: 42 } },
    ];

    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
    const resPromise = new Promise<any>((resolve) => {
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((data) => {
          resolve(data);
          return data;
        }),
        setHeader: vi.fn().mockReturnThis(),
        getHeader: vi.fn().mockReturnValue(''),
      };
      const mockReq = {
        headers: {
          origin: 'http://localhost',
          authorization: 'Bearer mock-token',
        },
        body: { orgId: 'orono' },
      };
      (adminAnalytics as any)(mockReq, mockRes);
    });

    const capturedData = await resPromise;

    // Only the invited member counts toward totals.
    expect(capturedData.users.total).toBe(1);

    // Foreign domain must not surface.
    expect(capturedData.users.domains['other-district.org']).toBeUndefined();

    // Approved-but-uninvited user must not inflate the approved-domain
    // bucket — the bucket total matches the member roster, not the auth
    // population that happens to share a domain.
    expect(capturedData.users.domains['school.org']).toEqual({
      total: 1,
      monthly: 1,
      daily: 1,
    });

    // Non-member dashboards/AI usage must not leak into totals.
    expect(capturedData.users.withDashboards).toBe(1);
    expect(capturedData.dashboards.total).toBe(1);
    expect(capturedData.api.totalCalls).toBe(5);

    // Non-member widget types must not show up.
    expect(capturedData.widgets.usersByType.timer).toBeUndefined();
    expect(capturedData.widgets.usersByType.stopwatch).toBeUndefined();
    expect(capturedData.widgets.usersByType.clock?.count).toBe(1);

    // Neither non-member may appear in the per-user drilldown.
    const foreignRow = capturedData.users.userList.find(
      (u: { email: string }) => u.email === 'foreign@other-district.org'
    );
    expect(foreignRow).toBeUndefined();
    const uninvitedRow = capturedData.users.userList.find(
      (u: { email: string }) => u.email === 'uninvited@school.org'
    );
    expect(uninvitedRow).toBeUndefined();
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
  });

  it('counts invited-but-never-signed-in members toward totals with zero engagement', async () => {
    const now = Date.now();
    mockFirestoreState.users = [
      // Active signed-in member with a recent dashboard edit.
      {
        id: 'uid_active',
        data: {
          email: 'active@district.org',
          lastLogin: now - 60 * 60 * 1000,
          buildings: ['north'],
        },
      },
      // Invited member: member doc exists but `uid` is null on the doc,
      // so there is no Auth metadata to join and no dashboards can be
      // attributed. Should still count toward total/domain/building.
      {
        id: 'uid_invited_unused',
        data: {
          email: 'invited@district.org',
          buildings: ['north'],
        },
        invited: true,
      },
    ];
    mockFirestoreState.dashboards = [
      {
        id: 'dash-active',
        ownerUid: 'uid_active',
        data: {
          updatedAt: now - 60 * 60 * 1000,
          widgets: [{ type: 'clock' }],
        },
      },
    ];

    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
    const resPromise = new Promise<any>((resolve) => {
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((data) => {
          resolve(data);
          return data;
        }),
        setHeader: vi.fn().mockReturnThis(),
        getHeader: vi.fn().mockReturnValue(''),
      };
      const mockReq = {
        headers: {
          origin: 'http://localhost',
          authorization: 'Bearer mock-token',
        },
        body: { orgId: 'orono' },
      };
      (adminAnalytics as any)(mockReq, mockRes);
    });

    const capturedData = await resPromise;

    // Totals include the invited member.
    expect(capturedData.users.total).toBe(2);
    // Only the active member has a recent edit.
    expect(capturedData.users.monthly).toBe(1);
    expect(capturedData.users.daily).toBe(1);

    // Domain bucket: both members share the same domain.
    expect(capturedData.users.domains['district.org']).toEqual({
      total: 2,
      monthly: 1,
      daily: 1,
    });

    // Building bucket: both members are assigned to 'north'.
    expect(capturedData.users.buildings.north).toEqual({
      total: 2,
      monthly: 1,
      daily: 1,
    });

    // Per-user drilldown: the invited member is present with zero engagement.
    const invitedRow = capturedData.users.userList.find(
      (u: { email: string }) => u.email === 'invited@district.org'
    );
    expect(invitedRow).toBeDefined();
    expect(invitedRow.lastSignInMs).toBe(0);
    expect(invitedRow.lastEditMs).toBe(0);
    expect(invitedRow.hasDashboard).toBe(false);
    expect(invitedRow.isMonthlyActive).toBe(false);
    expect(invitedRow.isDailyActive).toBe(false);

    // Only the active member owns a dashboard.
    expect(capturedData.users.withDashboards).toBe(1);
    expect(capturedData.dashboards.total).toBe(1);
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
  });

  it('returns 400 when orgId is missing from the request body', async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
    const statusSpy = vi.fn().mockReturnThis();
    const jsonSpy = vi.fn().mockReturnThis();
    const setHeaderSpy = vi.fn().mockReturnThis();
    const mockRes = {
      status: statusSpy,
      json: jsonSpy,
      setHeader: setHeaderSpy,
      getHeader: vi.fn().mockReturnValue(''),
    };

    const mockReq = {
      headers: {
        origin: 'http://localhost',
        authorization: 'Bearer mock-token',
      },
      body: {},
    };

    await (adminAnalytics as any)(mockReq, mockRes);

    expect(statusSpy).toHaveBeenCalledWith(400);
    // The error body and X-Request-Id header must carry the same
    // correlation id so Cloud Logging alerts can be pivoted back to the
    // exact client-visible response.
    const jsonCall = jsonSpy.mock.calls[0]?.[0] as
      | { error?: string; requestId?: string }
      | undefined;
    expect(jsonCall?.error).toBe('invalid-argument');
    expect(typeof jsonCall?.requestId).toBe('string');
    expect(jsonCall?.requestId?.length ?? 0).toBeGreaterThan(0);
    expect(setHeaderSpy).toHaveBeenCalledWith(
      'X-Request-Id',
      jsonCall?.requestId
    );
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
  });

  it('returns 403 when caller is neither super admin nor an org admin', async () => {
    // No /admins entry and no member doc for this caller → denied.
    mockFirestoreState.admins = new Set<string>();

    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
    const statusSpy = vi.fn().mockReturnThis();
    const jsonSpy = vi.fn().mockReturnThis();
    const setHeaderSpy = vi.fn().mockReturnThis();
    const mockRes = {
      status: statusSpy,
      json: jsonSpy,
      setHeader: setHeaderSpy,
      getHeader: vi.fn().mockReturnValue(''),
    };

    const mockReq = {
      headers: {
        origin: 'http://localhost',
        authorization: 'Bearer mock-token',
      },
      body: { orgId: 'orono' },
    };

    await (adminAnalytics as any)(mockReq, mockRes);

    expect(statusSpy).toHaveBeenCalledWith(403);
    const jsonCall = jsonSpy.mock.calls[0]?.[0] as
      | { error?: string; requestId?: string }
      | undefined;
    expect(jsonCall?.error).toBe('permission-denied');
    expect(typeof jsonCall?.requestId).toBe('string');
    expect(jsonCall?.requestId?.length ?? 0).toBeGreaterThan(0);
    expect(setHeaderSpy).toHaveBeenCalledWith(
      'X-Request-Id',
      jsonCall?.requestId
    );
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
  });

  it('rejects cross-org callers and never reads the requested orgs data', async () => {
    // Cross-tenant isolation contract: a caller who is a member of org-a must
    // not be able to receive org-b analytics by passing `orgId: 'org-b'`.
    // Membership is decided by the per-org member doc at
    // `/organizations/{orgId}/members/{email}`. Existing nonMember tests prove
    // that a non-member's *own* data is excluded from totals — they do NOT
    // prove that a member of one org is rejected when probing another org.
    // Locks in the auth gate at the top of `adminAnalytics` (see lines
    // ~2113-2144 of functions/src/index.ts) and guarantees the function never
    // touches `organizations/org-b/*` Firestore paths after the gate fails.

    // No super-admin entry; alice is not in /admins.
    mockFirestoreState.admins = new Set<string>();

    // Caller is alice@org-a.com (the verifyIdToken mock normally returns
    // admin@school.org — override for this test only).
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
    const adminMock = (await import('firebase-admin')) as any;
    const originalAuth = adminMock.auth;
    adminMock.auth = vi.fn(() => ({
      verifyIdToken: vi.fn().mockResolvedValue({ email: 'alice@org-a.com' }),
      listUsers: vi.fn().mockResolvedValue({ users: [], pageToken: undefined }),
      getUsers: vi.fn().mockResolvedValue({ users: [] }),
    }));

    // Spy on Firestore reads. The default `mockFirestore.doc(...).get()` returns
    // `{ exists: false }`, so the per-org member doc lookup at
    // `organizations/org-b/members/alice@org-a.com` resolves to "not a member"
    // and the function must short-circuit with 403 before reading the org-b
    // members collection.
    const docSpy = vi.spyOn(mockFirestore, 'doc');
    const collectionSpy = vi.spyOn(mockFirestore, 'collection');

    // Org-b is seeded with data that MUST NOT leak. If the auth gate ever
    // misfires and the streaming reads run, these values would surface in the
    // response.
    mockFirestoreState.users = [
      {
        id: 'uid_orgb_member',
        data: {
          email: 'secret@org-b.com',
          lastLogin: Date.now(),
          buildings: ['org-b-north'],
        },
      },
    ];
    mockFirestoreState.dashboards = [
      {
        id: 'dash-orgb-secret',
        ownerUid: 'uid_orgb_member',
        data: {
          updatedAt: Date.now(),
          widgets: [{ type: 'org-b-only-widget' }],
        },
      },
    ];
    mockFirestoreState.aiUsage = [
      { id: 'uid_orgb_member_2026-03-30', data: { count: 999 } },
    ];

    const statusSpy = vi.fn().mockReturnThis();
    const jsonSpy = vi.fn().mockReturnThis();
    const setHeaderSpy = vi.fn().mockReturnThis();
    const mockRes = {
      status: statusSpy,
      json: jsonSpy,
      setHeader: setHeaderSpy,
      getHeader: vi.fn().mockReturnValue(''),
    };

    const mockReq = {
      headers: {
        origin: 'http://localhost',
        authorization: 'Bearer alice-token',
      },
      body: { orgId: 'org-b' },
    };

    try {
      await (adminAnalytics as any)(mockReq, mockRes);

      // Forbidden: alice is not a member of org-b and not a super admin.
      expect(statusSpy).toHaveBeenCalledWith(403);
      const jsonCall = jsonSpy.mock.calls[0]?.[0] as
        | { error?: string }
        | undefined;
      expect(jsonCall?.error).toBe('permission-denied');

      // Tenant isolation: the auth gate must run BEFORE any reads against
      // `organizations/org-b/*`. The post-gate code paths read
      // `collection('organizations/org-b/members')`, `collectionGroup('dashboards')`,
      // etc. None of those should have fired.
      const orgBMembersCalled = collectionSpy.mock.calls.some(
        (call) =>
          typeof call[0] === 'string' &&
          (call[0].includes('organizations/org-b') ||
            call[0] === 'ai_usage' ||
            call[0] === 'users')
      );
      expect(orgBMembersCalled).toBe(false);

      // The org-b roster fetch is also exposed via `db.doc()` in adjacent
      // helpers; assert nothing under organizations/org-b was fetched beyond
      // the gate's single member-doc lookup.
      const orgBDocReads = docSpy.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].startsWith('organizations/org-b/')
      );
      // Exactly one allowed read: the auth gate's
      // `organizations/org-b/members/{email}` probe. Anything else is a leak.
      expect(orgBDocReads.length).toBe(1);
      expect(orgBDocReads[0][0]).toBe(
        'organizations/org-b/members/alice@org-a.com'
      );

      // The actual streaming reads (collectionGroup('dashboards')) must not
      // have run either. `mockFirestore.collectionGroup` is the entry point;
      // assert it was never called.
      expect(mockFirestore.collectionGroup).not.toHaveBeenCalled();
    } finally {
      adminMock.auth = originalAuth;
      docSpy.mockRestore();
      collectionSpy.mockRestore();
    }
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
  });
});

describe('getPseudonymsForAssignmentV1', () => {
  // The PII gate at functions/src/index.ts ~3087-3137 verifies that the
  // calling teacher actually teaches the requested class via
  //   (classesResp.data.classes ?? []).some((c) => c.sourcedId === classId)
  // before disclosing student names + pseudonyms. A regression here would
  // leak student PII across teacher boundaries. These tests pin the
  // behaviour of that predicate (strict ===, no normalization, deny on
  // missing/empty teacher records).
  const TEACHER_AUTH = {
    uid: 'teacher-uid',
    token: {
      email: 'teacher@district.org',
      // studentRole intentionally absent (false) — teachers never carry it.
    },
  };

  // Build URL-aware axios.get mock: dispatches by URL substring so that the
  // teacher lookup, the teacher's classes lookup, and the class students
  // lookup can each return distinct payloads.
  const installAxiosMock = (responses: {
    teacher?: unknown;
    classes?: unknown;
    students?: unknown;
  }) => {
    vi.mocked(axios.get).mockImplementation((url: string) => {
      // Teacher lookup: /ims/oneroster/v1p1/users (with email filter)
      if (url.endsWith('/ims/oneroster/v1p1/users')) {
        return Promise.resolve({ data: responses.teacher ?? { users: [] } });
      }
      // Teacher's classes: /ims/oneroster/v1p1/users/{sourcedId}/classes
      if (
        url.includes('/ims/oneroster/v1p1/users/') &&
        url.endsWith('/classes')
      ) {
        return Promise.resolve({ data: responses.classes ?? { classes: [] } });
      }
      // Class students: /ims/oneroster/v1p1/classes/{classId}/students
      if (
        url.includes('/ims/oneroster/v1p1/classes/') &&
        url.endsWith('/students')
      ) {
        return Promise.resolve({ data: responses.students ?? { users: [] } });
      }
      return Promise.reject(new Error(`Unexpected URL in test: ${url}`));
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreState.admins = new Set<string>();
    mockFirestoreState.users = [];
    mockFirestoreState.dashboards = [];
    mockFirestoreState.aiUsage = [];
    // Provide non-empty secret values so the early "Server configuration
    // missing" guard is not hit; the defineSecret mock falls back to
    // `mock-${name}` when env vars are absent.
    process.env.STUDENT_PSEUDONYM_HMAC_SECRET = 'test-hmac-secret';
    process.env.CLASSLINK_CLIENT_ID = 'test-client-id';
    process.env.CLASSLINK_CLIENT_SECRET = 'test-client-secret';
    process.env.CLASSLINK_TENANT_URL = 'https://example.classlink.test';
  });

  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */

  it('returns pseudonyms when the teacher actually teaches the requested class', async () => {
    installAxiosMock({
      teacher: {
        users: [{ sourcedId: 'teacher-sid', email: 'teacher@district.org' }],
      },
      classes: { classes: [{ sourcedId: 'c-1', title: 'Period 1' }] },
      students: {
        users: [
          {
            sourcedId: 'student-1-sid',
            givenName: 'Alex',
            familyName: 'Stone',
            email: 's1@district.org',
          },
        ],
      },
    });

    const handler = getPseudonymsForAssignmentV1 as any;
    const result = (await handler(
      { assignmentId: 'asn-1', classId: 'c-1' },
      { auth: TEACHER_AUTH }
    )) as { pseudonyms: Record<string, unknown> };

    expect(result.pseudonyms['student-1-sid']).toBeDefined();
  });

  it("rejects with permission-denied when the requested classId isn't in the teacher's classes", async () => {
    installAxiosMock({
      teacher: {
        users: [{ sourcedId: 'teacher-sid', email: 'teacher@district.org' }],
      },
      classes: { classes: [{ sourcedId: 'c-1', title: 'Period 1' }] },
      // students should never be requested if the gate denies — but harmless if it is.
      students: { users: [] },
    });

    const handler = getPseudonymsForAssignmentV1 as any;
    await expect(
      handler({ assignmentId: 'asn-1', classId: 'c-2' }, { auth: TEACHER_AUTH })
    ).rejects.toThrow('Not a teacher of this class.');
  });

  it('rejects on case-mismatched classId because the predicate is strict equality', async () => {
    // The predicate is `c.sourcedId === classId` with no normalization. 'C-1'
    // and 'c-1' must not match. If this test ever fails, someone introduced
    // case-folding into the gate — re-evaluate whether that's safe before
    // updating the test.
    installAxiosMock({
      teacher: {
        users: [{ sourcedId: 'teacher-sid', email: 'teacher@district.org' }],
      },
      classes: { classes: [{ sourcedId: 'c-1', title: 'Period 1' }] },
      students: { users: [] },
    });

    const handler = getPseudonymsForAssignmentV1 as any;
    await expect(
      handler({ assignmentId: 'asn-1', classId: 'C-1' }, { auth: TEACHER_AUTH })
    ).rejects.toThrow('Not a teacher of this class.');
  });

  it('rejects when the teacher record has no classes', async () => {
    installAxiosMock({
      teacher: {
        users: [{ sourcedId: 'teacher-sid', email: 'teacher@district.org' }],
      },
      classes: { classes: [] },
      students: { users: [] },
    });

    const handler = getPseudonymsForAssignmentV1 as any;
    await expect(
      handler({ assignmentId: 'asn-1', classId: 'c-1' }, { auth: TEACHER_AUTH })
    ).rejects.toThrow('Not a teacher of this class.');
  });

  it('rejects when OneRoster returns an empty users array (teacher not in roster)', async () => {
    // Production short-circuits on `(teacherResp.data.users ?? [])[0]` being
    // undefined and throws not-found rather than crashing on `.classes` of
    // undefined. This locks in the "deny, not crash" behaviour.
    installAxiosMock({
      teacher: { users: [] },
    });

    const handler = getPseudonymsForAssignmentV1 as any;
    await expect(
      handler({ assignmentId: 'asn-1', classId: 'c-1' }, { auth: TEACHER_AUTH })
    ).rejects.toThrow('Teacher not found in ClassLink roster.');
  });

  it('rejects callers whose token carries studentRole=true', async () => {
    // Students must never reach the teacher-only endpoint, even if they
    // somehow obtain an email-bearing token. The gate at lines ~3053-3056
    // throws permission-denied with "Teacher account required.".
    const handler = getPseudonymsForAssignmentV1 as any;
    await expect(
      handler(
        { assignmentId: 'asn-1', classId: 'c-1' },
        {
          auth: {
            uid: 'student-uid',
            token: {
              email: 'student@district.org',
              studentRole: true,
            },
          },
        }
      )
    ).rejects.toThrow('Teacher account required.');
  });

  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
});
