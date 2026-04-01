/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

interface MockDocInput {
  id: string;
  data: Record<string, unknown>;
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
    })),
  };
});

// Mock firebase-functions/v2
vi.mock('firebase-functions/v2', () => ({
  https: {
    onCall: <T>(
      _options: unknown,
      handler: (request: {
        data: T;
        auth?: { token: { email: string }; uid: string };
      }) => Promise<unknown>
    ) => handler,
    HttpsError: class extends Error {
      constructor(code: string, message: string) {
        super(message);
        this.name = code;
      }
    },
  },
}));

// Mock firebase-functions/v1
vi.mock('firebase-functions/v1', () => ({
  runWith: vi.fn().mockReturnThis(),
  region: vi.fn().mockReturnThis(),
  https: {
    onCall: vi.fn().mockImplementation((handler: unknown) => handler),
    onRequest: vi.fn().mockImplementation((handler: unknown) => handler),
    HttpsError: class extends Error {
      constructor(code: string, message: string) {
        super(message);
        this.name = code;
      }
    },
  },
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
});
