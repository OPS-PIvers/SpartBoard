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

const mockFirestore = {
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

  return {
    initializeApp: vi.fn(),
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
  fetchWeatherProxy,
  checkUrlCompatibility,
  adminAnalytics,
} from './index';

describe('fetchWeatherProxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreState.admins = new Set<string>();
    mockFirestoreState.users = [];
    mockFirestoreState.dashboards = [];
    mockFirestoreState.aiUsage = [];
  });

  it('should throw unauthenticated error if no auth context', async () => {
    const handler = fetchWeatherProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await expect(
      handler({ url: 'https://api.openweathermap.org/data/2.5/weather' }, {})
    ).rejects.toThrow('The function must be called while authenticated.');
  });

  it('should throw invalid-argument for invalid host', async () => {
    const handler = fetchWeatherProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await expect(
      handler({ url: 'https://example.com/weather' }, { auth: { uid: '123' } })
    ).rejects.toThrow(
      'Invalid proxy URL. Only https://api.openweathermap.org and https://owc.enterprise.earthnetworks.com are allowed.'
    );
  });

  it('should throw invalid-argument for invalid protocol', async () => {
    const handler = fetchWeatherProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await expect(
      handler(
        { url: 'http://api.openweathermap.org/data' },
        { auth: { uid: '123' } }
      )
    ).rejects.toThrow(
      'Invalid proxy URL. Only https://api.openweathermap.org and https://owc.enterprise.earthnetworks.com are allowed.'
    );
  });

  it('should return data successfully for valid openweathermap url', async () => {
    const mockGet = vi.mocked(axios.get);
    mockGet.mockResolvedValue({ data: { temp: 72 } });

    const handler = fetchWeatherProxy as unknown as (
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

    const handler = fetchWeatherProxy as unknown as (
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

    const handler = fetchWeatherProxy as unknown as (
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
    expect(capturedData.api.totalCalls).toBe(17);
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
});
