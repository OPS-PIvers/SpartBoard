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
  // Map of path → doc data for `db.doc(path).get()` mocks. Used by the
  // adminAnalytics snapshot read tests (path:
  // `organizations/{orgId}/analytics/snapshot`) and any future test that
  // needs a deterministic doc fetch. Unset paths return `{ exists: false }`
  // via the default `mockFirestore.doc` fallback.
  docs: new Map<string, Record<string, unknown>>(),
  // Org records for the scheduled `recomputeAdminAnalytics` job. Each entry
  // is treated as a doc under `/organizations/{id}` with the given `status`.
  // The scheduler iterates this collection and only recomputes for orgs
  // with status in {active, trial}.
  organizations: [] as { id: string; status: string }[],
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

// Hoisted so cache tests can assert exact call counts across multiple
// invocations within a single test. Without this every `collection('admins')`
// call would build a fresh `vi.fn` and the count would always reset.
const adminDocGet = vi.fn((id: string) =>
  Promise.resolve({ exists: mockFirestoreState.admins.has(id) })
);

// Hoisted for the same reason — the `gemini-functions` config read is the
// other target of the `generateWithAI` cache and needs a stable mock.
const geminiConfigDocGet = vi.fn(() =>
  Promise.resolve({
    exists: false,
    data: () => undefined as Record<string, unknown> | undefined,
  })
);

// Storage mocks for archiveActivityWallPhoto size-guard tests. Each
// stub is independently resettable so tests can install different
// metadata responses without rebuilding the whole storage tree.
const storageFileGetMetadata = vi.fn(() =>
  Promise.resolve([{ size: '0', contentType: 'image/jpeg' }])
);
const storageFileDownload = vi.fn(() => Promise.resolve([Buffer.from('test')]));
const storageFileDelete = vi.fn(() => Promise.resolve());
const mockStorageBucket = {
  file: vi.fn(() => ({
    getMetadata: storageFileGetMetadata,
    download: storageFileDownload,
    delete: storageFileDelete,
  })),
};

// Submission ref mocks for archiveActivityWallPhoto. The handler chains
// `db.collection('activity_wall_sessions').doc(...).collection('submissions').doc(...)`
// then calls `.set()` and `.get()` on the leaf.
const submissionRefGet = vi.fn(() =>
  Promise.resolve({
    exists: true,
    data: () => ({ storagePath: 'activity-wall/test.jpg' }),
  })
);
const submissionRefSet = vi.fn(() => Promise.resolve());
const submissionDoc = {
  get: submissionRefGet,
  set: submissionRefSet,
};

const mockFirestore = {
  doc: vi.fn((path: string) => ({
    path,
    get: vi.fn(() => {
      const stashed = mockFirestoreState.docs.get(path);
      if (stashed) {
        return Promise.resolve({ exists: true, data: () => stashed });
      }
      return Promise.resolve({ exists: false });
    }),
    set: vi.fn((data: Record<string, unknown>) => {
      mockFirestoreState.docs.set(path, data);
      return Promise.resolve();
    }),
  })),
  getAll: vi.fn((...refs: MockDocRef[]) => {
    return Promise.resolve(
      refs.map(() => ({ exists: false, data: () => ({}) }))
    );
  }),
  collection: vi.fn((name: string) => {
    if (name === 'admins') {
      return {
        doc: (id: string) => ({
          get: () => adminDocGet(id),
        }),
      };
    }

    if (name === 'global_permissions') {
      return {
        doc: (id: string) => ({
          get: () =>
            id === 'gemini-functions'
              ? geminiConfigDocGet()
              : Promise.resolve({ exists: false }),
        }),
      };
    }

    if (name === 'activity_wall_sessions') {
      return {
        doc: () => ({
          collection: () => ({
            doc: () => submissionDoc,
          }),
        }),
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

    // Top-level `organizations` collection — used by the scheduled
    // `recomputeAdminAnalytics` job to iterate every non-archived org.
    if (name === 'organizations') {
      return {
        get: vi.fn(() =>
          Promise.resolve({
            docs: mockFirestoreState.organizations.map((o) => ({
              id: o.id,
              data: () => ({ status: o.status }),
            })),
          })
        ),
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
    // Sentinels — we don't assert their payload values, but the code
    // under test references them so they must exist.
    FieldValue: {
      delete: vi.fn(() => '__FV_DELETE__'),
      serverTimestamp: vi.fn(() => '__FV_SERVER_TIMESTAMP__'),
    },
  });

  const apps: unknown[] = [];
  return {
    apps,
    initializeApp: vi.fn(() => {
      if (apps.length === 0) apps.push({ name: '[DEFAULT]' });
    }),
    firestore: firestoreFn,
    storage: vi.fn(() => ({
      bucket: vi.fn(() => mockStorageBucket),
    })),
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

// Mock firebase-functions/v2/scheduler — `onSchedule` returns the handler
// directly so tests can invoke the recompute job by calling
// `recomputeAdminAnalytics()` like a plain async function.
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_options: unknown, handler: () => Promise<void>) => handler,
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
  archiveActivityWallPhoto,
  __getCachedAdminStatus,
  __getGeminiModelConfig,
  __resetGenerateWithAICaches,
} from './index';
import * as admin from 'firebase-admin';
import { computeAnalyticsForOrg } from './adminAnalyticsCompute';
import {
  SNAPSHOT_SCHEMA_VERSION,
  recomputeAdminAnalytics,
  type AnalyticsSnapshotDoc,
} from './adminAnalyticsSnapshot';

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
      'https://api.openweathermap.org/data/2.5/weather?q=London',
      expect.any(Object)
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
      'https://owc.enterprise.earthnetworks.com/Data/GetData.ashx?si=BLLST',
      expect.any(Object)
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

  it('passes a 1 MB response-size cap to axios', async () => {
    const mockGet = vi.mocked(axios.get);
    mockGet.mockResolvedValue({ data: {} });

    const handler = fetchExternalProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await handler(
      { url: 'https://api.openweathermap.org/data/2.5/weather?q=London' },
      { auth: { uid: '123' } }
    );

    expect(mockGet).toHaveBeenCalledWith(
      'https://api.openweathermap.org/data/2.5/weather?q=London',
      expect.objectContaining({
        maxContentLength: 1_048_576,
        maxBodyLength: 1_048_576,
      })
    );
  });

  it('disables axios redirects so the allowlist stays load-bearing under 3xx', async () => {
    // SSRF guard: the allowlist check only validates the initial URL.
    // If axios followed redirects, an allowlisted host could 302 to an
    // arbitrary off-allowlist host and the proxy would happily fetch it.
    const mockGet = vi.mocked(axios.get);
    mockGet.mockResolvedValue({ data: {} });

    const handler = fetchExternalProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await handler(
      { url: 'https://api.openweathermap.org/data/2.5/weather?q=London' },
      { auth: { uid: '123' } }
    );

    expect(mockGet).toHaveBeenCalledWith(
      'https://api.openweathermap.org/data/2.5/weather?q=London',
      expect.objectContaining({ maxRedirects: 0 })
    );
  });

  it('translates an axios maxContentLength error into a resource-exhausted HttpsError', async () => {
    const mockGet = vi.mocked(axios.get);
    // Axios's actual message format when the limit is exceeded. `vi.mock('axios')`
    // auto-mocks `isAxiosError` to a fn that returns undefined; force it to
    // return true so the size-limit branch is reached.
    vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);
    mockGet.mockRejectedValue(
      new Error('maxContentLength size of 1048576 exceeded')
    );

    const handler = fetchExternalProxy as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;
    await expect(
      handler(
        { url: 'https://api.openweathermap.org/data/2.5/weather?q=London' },
        { auth: { uid: '123' } }
      )
    ).rejects.toThrow(/exceeded the .* KB proxy limit/);
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

  // Regression: IPv6 loopback and private-range addresses were not covered
  // by the IPv4-only blocklist patterns, letting a user submit
  // `https://[::1]/...` to probe internal services (SSRF). The fix adds
  // IPv6 patterns to the blocklist so these throw `invalid-argument` before
  // `axios.head` is ever called.
  it('blocks IPv6 loopback [::1] to prevent SSRF', async () => {
    const mockHead = vi.mocked(axios.head);
    // Should never reach axios — the guard must throw first.
    mockHead.mockResolvedValue({ headers: {} });

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;

    await expect(
      handler({ url: 'https://[::1]/internal' }, { auth: { uid: '123' } })
    ).rejects.toThrow(/private or reserved/i);
    expect(mockHead).not.toHaveBeenCalled();
  });

  it('blocks IPv4-mapped IPv6 address [::ffff:127.0.0.1] to prevent SSRF', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockResolvedValue({ headers: {} });

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;

    await expect(
      handler(
        { url: 'https://[::ffff:127.0.0.1]/internal' },
        { auth: { uid: '123' } }
      )
    ).rejects.toThrow(/private or reserved/i);
    expect(mockHead).not.toHaveBeenCalled();
  });

  it('blocks IPv4-compatible IPv6 address [::127.0.0.1] to prevent SSRF', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockResolvedValue({ headers: {} });

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;

    await expect(
      handler(
        { url: 'https://[::127.0.0.1]/internal' },
        { auth: { uid: '123' } }
      )
    ).rejects.toThrow(/private or reserved/i);
    expect(mockHead).not.toHaveBeenCalled();
  });

  it('blocks ULA IPv6 range [fc00::1] to prevent SSRF', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockResolvedValue({ headers: {} });

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;

    await expect(
      handler({ url: 'https://[fc00::1]/internal' }, { auth: { uid: '123' } })
    ).rejects.toThrow(/private or reserved/i);
    expect(mockHead).not.toHaveBeenCalled();
  });

  it('blocks link-local IPv6 range [fe80::1] to prevent SSRF', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockResolvedValue({ headers: {} });

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;

    await expect(
      handler({ url: 'https://[fe80::1]/internal' }, { auth: { uid: '123' } })
    ).rejects.toThrow(/private or reserved/i);
    expect(mockHead).not.toHaveBeenCalled();
  });

  it('blocks deprecated site-local IPv6 range [fec0::1] to prevent SSRF', async () => {
    const mockHead = vi.mocked(axios.head);
    mockHead.mockResolvedValue({ headers: {} });

    const handler = checkUrlCompatibility as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;

    await expect(
      handler({ url: 'https://[fec0::1]/internal' }, { auth: { uid: '123' } })
    ).rejects.toThrow(/private or reserved/i);
    expect(mockHead).not.toHaveBeenCalled();
  });
});

describe('adminAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreState.admins = new Set<string>(['admin@school.org']);
    mockFirestoreState.users = [];
    mockFirestoreState.dashboards = [];
    mockFirestoreState.aiUsage = [];
    mockFirestoreState.docs = new Map();
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

    const capturedData = await computeAnalyticsForOrg('orono');

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

    const capturedData = await computeAnalyticsForOrg('orono');

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

    const capturedData = await computeAnalyticsForOrg('orono');

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

    const capturedData = await computeAnalyticsForOrg('orono');

    // All 25 distinct users tracked (well within the 100-cap)
    expect(capturedData.widgets.usersByType.clock.count).toBe(25);
    // Emails preview capped at 20
    expect(capturedData.widgets.usersByType.clock.emails).toHaveLength(20);
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

    const capturedData = await computeAnalyticsForOrg('orono');

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

    const capturedData = await computeAnalyticsForOrg('orono');

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

    const capturedData = await computeAnalyticsForOrg('orono');

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
      (u) => u.email === 'invited@district.org'
    );
    expect(invitedRow).toBeDefined();
    if (!invitedRow) throw new Error('unreachable');
    expect(invitedRow.lastSignInMs).toBe(0);
    expect(invitedRow.lastEditMs).toBe(0);
    expect(invitedRow.hasDashboard).toBe(false);
    expect(invitedRow.isMonthlyActive).toBe(false);
    expect(invitedRow.isDailyActive).toBe(false);

    // Only the active member owns a dashboard.
    expect(capturedData.users.withDashboards).toBe(1);
    expect(capturedData.dashboards.total).toBe(1);
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

  it('returns 503 when no analytics snapshot exists yet for the org', async () => {
    // Cold-start contract: a brand-new org has no entry at
    // `organizations/{orgId}/analytics/snapshot` until the scheduled
    // `recomputeAdminAnalytics` job has run at least once. The HTTP handler
    // must return a deterministic 503 with `error: 'not-yet-computed'` so
    // the UI can show "Analytics ready after the next scheduled refresh"
    // rather than spinning forever or surfacing a generic error.
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

    expect(statusSpy).toHaveBeenCalledWith(503);
    const jsonCall = jsonSpy.mock.calls[0]?.[0] as
      | { error?: string; message?: string }
      | undefined;
    expect(jsonCall?.error).toBe('not-yet-computed');
    expect(jsonCall?.message ?? '').toMatch(/scheduled refresh/i);

    // Crucially: the snapshot-only hot path must not have hit either of the
    // unbounded streaming reads that the old inline-compute implementation
    // did. Verifies the cost-saving invariant — if a regression reintroduces
    // the streams, this assertion catches it.
    expect(mockFirestore.collectionGroup).not.toHaveBeenCalled();
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
  });

  it('returns the cached snapshot payload + meta when one exists', async () => {
    // Seed a snapshot doc at the canonical path. The hot path should read
    // this verbatim and round-trip the payload to the caller alongside the
    // freshness metadata the UI badge consumes.
    const computedAt = Date.now() - 60 * 60 * 1000; // 1 hour ago
    const nextRecomputeAt = computedAt + 24 * 60 * 60 * 1000;
    const seedSnapshot: AnalyticsSnapshotDoc = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      computedAt,
      nextRecomputeAt,
      computeDurationMs: 42_000,
      payload: {
        users: {
          total: 7,
          registered: 7,
          registeredIsFallback: false,
          monthly: 5,
          daily: 2,
          withDashboards: 6,
          domains: { 'district.org': { total: 7, monthly: 5, daily: 2 } },
          buildings: { north: { total: 7, monthly: 5, daily: 2 } },
          domainBuilding: {},
          userList: [],
        },
        widgets: { totalInstances: {}, activeInstances: {}, usersByType: {} },
        dashboards: { total: 6, avgWidgetsPerDashboard: 3.5 },
        api: {
          totalCalls: 123,
          activeUsers: 4,
          topUsers: [],
          avgDailyCalls: 41,
          avgDailyCallsPerUser: 10.25,
          byFeature: {},
        },
      },
    };
    mockFirestoreState.docs.set(
      'organizations/orono/analytics/snapshot',
      seedSnapshot as unknown as Record<string, unknown>
    );

    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
    let captured: unknown;
    const statusSpy = vi.fn().mockReturnThis();
    const jsonSpy = vi.fn().mockImplementation((data: unknown) => {
      captured = data;
      return data;
    });
    const mockRes = {
      status: statusSpy,
      json: jsonSpy,
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

    await (adminAnalytics as any)(mockReq, mockRes);
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */

    // 200 (no explicit status call — Express defaults to 200 when only
    // `res.json` is invoked).
    expect(statusSpy).not.toHaveBeenCalledWith(503);
    expect(statusSpy).not.toHaveBeenCalledWith(500);

    const body = captured as {
      users?: { total?: number };
      dashboards?: { total?: number };
      meta?: { computedAt?: number; nextRecomputeAt?: number };
    };
    expect(body.users?.total).toBe(7);
    expect(body.dashboards?.total).toBe(6);
    expect(body.meta?.computedAt).toBe(computedAt);
    expect(body.meta?.nextRecomputeAt).toBe(nextRecomputeAt);

    // No streaming reads on the cached path.
    expect(mockFirestore.collectionGroup).not.toHaveBeenCalled();
  });
});

describe('recomputeAdminAnalytics (scheduled)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreState.admins = new Set<string>();
    mockFirestoreState.users = [];
    mockFirestoreState.dashboards = [];
    mockFirestoreState.aiUsage = [];
    mockFirestoreState.docs = new Map();
    mockFirestoreState.organizations = [];
  });

  it('writes a snapshot doc only for orgs with status active or trial; skips archived', async () => {
    // Mix of statuses across three orgs. The scheduler must recompute for
    // the active + trial ones and explicitly skip the archived org so a
    // legacy/deactivated tenant doesn't waste compute on every run.
    mockFirestoreState.organizations = [
      { id: 'orono', status: 'active' },
      { id: 'demo-school', status: 'trial' },
      { id: 'legacy-school', status: 'archived' },
    ];

    // Seed a single member so `computeAnalyticsForOrg` has a roster to iterate.
    // Reused across orgs since `mockFirestoreState.users` is global to the
    // mock; the per-org `members` collection lookup returns the same list,
    // which is fine for the org-filtering assertion this test is about.
    mockFirestoreState.users = [
      {
        id: 'uid-1',
        data: {
          email: 'teacher@orono.k12.mn.us',
          lastLogin: Date.now(),
          buildings: [],
        },
      },
    ];

    // The test mock for `firebase-functions/v2/scheduler` returns the inner
    // handler directly, so the type-system view (a `ScheduleFunction` taking
    // event + context) doesn't match the actual runtime shape (a thunk).
    // Cast to a no-arg async function for the call.
    await (recomputeAdminAnalytics as unknown as () => Promise<void>)();

    // The two active/trial orgs each got a snapshot written; the archived
    // org did not. Verifies the `ACTIVE_ORG_STATUSES` filter at the top of
    // the scheduler — a regression that recomputes archived orgs would
    // immediately get caught here.
    expect(
      mockFirestoreState.docs.get('organizations/orono/analytics/snapshot')
    ).toBeDefined();
    expect(
      mockFirestoreState.docs.get(
        'organizations/demo-school/analytics/snapshot'
      )
    ).toBeDefined();
    expect(
      mockFirestoreState.docs.get(
        'organizations/legacy-school/analytics/snapshot'
      )
    ).toBeUndefined();

    // Snapshot shape: schemaVersion + computedAt + nextRecomputeAt (24h
    // delta) + payload. Lock in the contract the reader at
    // `readAnalyticsSnapshot` enforces.
    const written = mockFirestoreState.docs.get(
      'organizations/orono/analytics/snapshot'
    ) as unknown as AnalyticsSnapshotDoc;
    expect(written.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(typeof written.computedAt).toBe('number');
    expect(written.nextRecomputeAt).toBe(
      written.computedAt + 24 * 60 * 60 * 1000
    );
    expect(written.payload.users.total).toBe(1);
  });

  it('survives a per-org compute failure and continues to the next org', async () => {
    // Pin the failure: the first org's member-roster read rejects, while
    // the second org's read succeeds. The scheduler must log the failure,
    // skip writing a snapshot for the failing org, and still complete the
    // recompute for the healthy one. Without this resilience, a single
    // misconfigured org would starve every other tenant of fresh analytics.
    mockFirestoreState.organizations = [
      { id: 'broken-org', status: 'active' },
      { id: 'healthy-org', status: 'active' },
    ];
    mockFirestoreState.users = [
      {
        id: 'uid-2',
        data: {
          email: 'teacher@healthy.org',
          lastLogin: Date.now(),
          buildings: [],
        },
      },
    ];

    // Force the first call to `collection('organizations/broken-org/members')`
    // to reject. Subsequent calls (healthy-org) use the normal mock path.
    //
    // Direct property replacement rather than `vi.spyOn` because spying on a
    // property that's already a `vi.fn()` collapses identities — the captured
    // "original" reference ends up being the spy itself, and a delegating
    // impl that calls `original(name)` infinite-loops. Swapping the property
    // with a fresh wrapper and calling the saved original breaks the cycle.
    const originalCollection = mockFirestore.collection;
    const wrappedCollection = vi.fn((name: string) => {
      if (name === 'organizations/broken-org/members') {
        return {
          get: vi.fn(() =>
            Promise.reject(new Error('synthetic failure: roster read'))
          ),
        } as unknown as ReturnType<typeof originalCollection>;
      }
      return originalCollection(name);
    });
    mockFirestore.collection =
      wrappedCollection as unknown as typeof originalCollection;

    try {
      // The test mock for `firebase-functions/v2/scheduler` returns the inner
      // handler directly, so the type-system view (a `ScheduleFunction` taking
      // event + context) doesn't match the actual runtime shape (a thunk).
      // Cast to a no-arg async function for the call.
      await (recomputeAdminAnalytics as unknown as () => Promise<void>)();

      expect(
        mockFirestoreState.docs.get(
          'organizations/broken-org/analytics/snapshot'
        )
      ).toBeUndefined();
      expect(
        mockFirestoreState.docs.get(
          'organizations/healthy-org/analytics/snapshot'
        )
      ).toBeDefined();
    } finally {
      mockFirestore.collection = originalCollection;
    }
  });

  it('throws when every active org fails so Cloud Scheduler marks the run failed', async () => {
    // Mixed-results path is silent so a single misconfigured org doesn't spam
    // alerts (covered by the test above). But if every active org fails,
    // there's nothing to log-alert on per-org and the scheduler run looks
    // healthy by default — the throw is what tells Cloud Scheduler to mark
    // the run failed so the next-run-failure alarm fires.
    mockFirestoreState.organizations = [
      { id: 'broken-org-1', status: 'active' },
      { id: 'broken-org-2', status: 'active' },
    ];

    const originalCollection = mockFirestore.collection;
    const wrappedCollection = vi.fn((name: string) => {
      if (
        name === 'organizations/broken-org-1/members' ||
        name === 'organizations/broken-org-2/members'
      ) {
        return {
          get: vi.fn(() =>
            Promise.reject(new Error('synthetic failure: roster read'))
          ),
        } as unknown as ReturnType<typeof originalCollection>;
      }
      return originalCollection(name);
    });
    mockFirestore.collection =
      wrappedCollection as unknown as typeof originalCollection;

    try {
      await expect(
        (recomputeAdminAnalytics as unknown as () => Promise<void>)()
      ).rejects.toThrow(/all 2 org\(s\) failed/);
    } finally {
      mockFirestore.collection = originalCollection;
    }
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

  // ── Test-class branch ─────────────────────────────────────────────────
  // These tests cover the branch added to resolve names for SSO students
  // who logged in via the `studentLoginV1` test bypass (test classes are
  // admin-managed mocks under `organizations/{orgId}/testClasses` that
  // bypass ClassLink/OneRoster entirely).

  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */

  /**
   * Wires up the mockFirestore primitives for the test-class branch:
   *   db.doc('organizations/{org}/members/{email}')   — membership gate
   *   db.doc('organizations/{org}/testClasses/{cid}') — test-class doc
   *   db.collection('users/{uid}/rosters').where('testClassId','==',cid)
   *                                                   — ownership gate
   *
   * Pass `null` for `testClass` to simulate a non-existent test-class doc
   * (so the function falls through to the ClassLink branch).
   */
  const installTestClassMocks = (opts: {
    orgId: string;
    teacherEmailLower: string;
    teacherUid: string;
    isMember: boolean;
    testClassPath: string;
    testClass: { memberEmails?: string[] } | null;
    ownsRoster: boolean;
  }) => {
    const memberPath = `organizations/${opts.orgId}/members/${opts.teacherEmailLower}`;
    mockFirestore.doc.mockImplementation((path: string) => {
      if (path === memberPath) {
        return {
          path,
          get: vi.fn(() =>
            Promise.resolve({ exists: opts.isMember, data: () => ({}) })
          ),
        } as any;
      }
      if (path === opts.testClassPath) {
        return {
          path,
          get: vi.fn(() =>
            Promise.resolve(
              opts.testClass
                ? { exists: true, data: () => opts.testClass }
                : { exists: false, data: () => ({}) }
            )
          ),
        } as any;
      }
      return { path, get: vi.fn(() => Promise.resolve({ exists: false })) };
    });

    const rostersPath = `users/${opts.teacherUid}/rosters`;
    const baseCollectionImpl = mockFirestore.collection.getMockImplementation();
    mockFirestore.collection.mockImplementation((name: string) => {
      if (name === rostersPath) {
        return {
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn(() =>
                Promise.resolve({ empty: !opts.ownsRoster, docs: [] })
              ),
            })),
          })),
        } as any;
      }
      // Fall back to the existing collection mock for unrelated collections.
      return baseCollectionImpl ? baseCollectionImpl(name) : ({} as any);
    });
  };

  it('returns pseudonyms keyed by HMAC("test:{email}") for a test-class assignment', async () => {
    installTestClassMocks({
      orgId: 'orono',
      teacherEmailLower: 'teacher@district.org',
      teacherUid: 'teacher-uid',
      isMember: true,
      testClassPath: 'organizations/orono/testClasses/mock-period-1',
      testClass: {
        memberEmails: [
          'sstudent25@orono.k12.mn.us',
          'OtherStudent@orono.k12.mn.us',
        ],
      },
      ownsRoster: true,
    });
    // axios.get must NOT be called for the test-class branch — assert by
    // not installing any URL-aware responses (default reject would surface
    // an unexpected ClassLink call as a test failure).

    const handler = getPseudonymsForAssignmentV1 as any;
    const result = (await handler(
      {
        assignmentId: 'asn-1',
        classId: 'mock-period-1',
        orgId: 'orono',
      },
      { auth: TEACHER_AUTH }
    )) as {
      pseudonyms: Record<
        string,
        {
          studentUid: string;
          assignmentPseudonym: string;
          givenName: string;
          familyName: string;
        }
      >;
    };

    // Two members → two pseudonym entries, keyed by lowercased email.
    expect(Object.keys(result.pseudonyms).sort()).toEqual([
      'otherstudent@orono.k12.mn.us',
      'sstudent25@orono.k12.mn.us',
    ]);

    // Display name is the email local-part (matches the import dialog).
    expect(result.pseudonyms['sstudent25@orono.k12.mn.us'].givenName).toBe(
      'sstudent25'
    );
    expect(result.pseudonyms['sstudent25@orono.k12.mn.us'].familyName).toBe('');
    expect(result.pseudonyms['otherstudent@orono.k12.mn.us'].givenName).toBe(
      'otherstudent'
    );

    // The studentUid is the same HMAC formula `studentLoginV1` uses for
    // test-bypass tokens (`HMAC(secret, "sid:test:{emailLower}")`). If the
    // formulas drift, name resolution silently breaks — pin them together.
    const cryptoJs = await import('crypto-js');
    const expectedSstudent25Uid = cryptoJs
      .HmacSHA256('sid:test:sstudent25@orono.k12.mn.us', 'test-hmac-secret')
      .toString(cryptoJs.enc.Hex);
    expect(result.pseudonyms['sstudent25@orono.k12.mn.us'].studentUid).toBe(
      expectedSstudent25Uid
    );

    // Axios was NOT called — confirms the test-class branch short-circuits
    // before any ClassLink lookup.
    expect(vi.mocked(axios.get)).not.toHaveBeenCalled();
  });

  it('rejects when the teacher is not a member of the claimed orgId', async () => {
    installTestClassMocks({
      orgId: 'orono',
      teacherEmailLower: 'teacher@district.org',
      teacherUid: 'teacher-uid',
      isMember: false, // ← not in the org members collection
      testClassPath: 'organizations/orono/testClasses/mock-period-1',
      testClass: { memberEmails: ['s1@orono.k12.mn.us'] },
      ownsRoster: true,
    });

    const handler = getPseudonymsForAssignmentV1 as any;
    await expect(
      handler(
        {
          assignmentId: 'asn-1',
          classId: 'mock-period-1',
          orgId: 'orono',
        },
        { auth: TEACHER_AUTH }
      )
    ).rejects.toThrow('Not a member of this organization.');
  });

  it("rejects when the teacher doesn't own a roster with matching testClassId", async () => {
    installTestClassMocks({
      orgId: 'orono',
      teacherEmailLower: 'teacher@district.org',
      teacherUid: 'teacher-uid',
      isMember: true,
      testClassPath: 'organizations/orono/testClasses/mock-period-1',
      testClass: { memberEmails: ['s1@orono.k12.mn.us'] },
      ownsRoster: false, // ← teacher hasn't imported this test class
    });

    const handler = getPseudonymsForAssignmentV1 as any;
    await expect(
      handler(
        {
          assignmentId: 'asn-1',
          classId: 'mock-period-1',
          orgId: 'orono',
        },
        { auth: TEACHER_AUTH }
      )
    ).rejects.toThrow('Not a teacher of this test class.');
  });

  it('falls through to the ClassLink branch when the testClasses doc does not exist', async () => {
    installTestClassMocks({
      orgId: 'orono',
      teacherEmailLower: 'teacher@district.org',
      teacherUid: 'teacher-uid',
      isMember: true,
      testClassPath: 'organizations/orono/testClasses/c-1',
      testClass: null, // ← real ClassLink class, not a test class
      ownsRoster: false, // ← irrelevant; ownership gate is only for test classes
    });
    // Configure the standard ClassLink mocks so the fall-through path
    // can complete and we can assert the existing branch behavior.
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
      { assignmentId: 'asn-1', classId: 'c-1', orgId: 'orono' },
      { auth: TEACHER_AUTH }
    )) as { pseudonyms: Record<string, unknown> };

    // The ClassLink branch keys by sourcedId, NOT by email. If this assertion
    // ever fails, double-check that the test-class branch isn't accidentally
    // catching real ClassLink classes.
    expect(result.pseudonyms['student-1-sid']).toBeDefined();
    expect(vi.mocked(axios.get)).toHaveBeenCalled();
  });

  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
});

describe('getClassLinkRosterV1 chunked fan-out', () => {
  // Without batching, a teacher with N classes triggers N simultaneous HTTP
  // requests at ClassLink — audit item #5. The chunk size is 15 so peak
  // in-flight student requests must never exceed 15.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('caps concurrent student requests at 15 even with 50 classes', async () => {
    const classes = Array.from({ length: 50 }, (_, i) => ({
      sourcedId: `class-${i}`,
      title: `Class ${i}`,
    }));

    let inFlight = 0;
    let peakInFlight = 0;
    let studentCalls = 0;

    vi.mocked(axios.get).mockImplementation((url: string) => {
      if (url.endsWith('/users')) {
        return Promise.resolve({
          data: { users: [{ sourcedId: 'teacher-sid' }] },
        });
      }
      if (url.endsWith('/teacher-sid/classes')) {
        return Promise.resolve({ data: { classes } });
      }
      // Student fetches — track concurrency.
      studentCalls += 1;
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      return new Promise((resolve) => {
        // Defer resolution to the next microtask so multiple in-flight
        // requests overlap if (and only if) the handler kicks them off
        // in parallel within a batch.
        setImmediate(() => {
          inFlight -= 1;
          resolve({ data: { users: [] } });
        });
      });
    });

    const { getClassLinkRosterV1: handler } = await import('./index');
    const result = await (
      handler as unknown as (
        req: unknown,
        ctx: unknown
      ) => Promise<{ classes: unknown[] }>
    )(
      {},
      {
        auth: {
          uid: 'teacher-uid',
          token: { email: 'teacher@school.org' },
        },
      }
    );

    expect(result.classes).toHaveLength(50);
    expect(studentCalls).toBe(50);
    expect(peakInFlight).toBeLessThanOrEqual(15);
    // 50 classes / 15 chunk size = 4 sequential batches (15 + 15 + 15 + 5).
    // Peak in-flight should equal the chunk size for the first three.
    expect(peakInFlight).toBeGreaterThan(1);
  });
});

describe('archiveActivityWallPhoto size guard', () => {
  // The handler buffers the full Storage object into the 512MiB function
  // instance's memory via `file.download()`. Without a size check before
  // the download, a misbehaving client could OOM the function. Audit
  // item #4 — the guard must read metadata first and abort if the file
  // is over 50 MB.
  const UID = 'teacher-uid';
  const SESSION_ID = `${UID}_session1`;
  const validRequest = {
    accessToken: 'token',
    sessionId: SESSION_ID,
    submissionId: 'sub1',
    activityId: 'act1',
    status: 'approved' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    submissionRefGet.mockResolvedValue({
      exists: true,
      data: () => ({ storagePath: 'activity-wall/test.jpg' }),
    });
    submissionRefSet.mockResolvedValue(undefined);
  });

  it('rejects photos over 50 MB before calling download()', async () => {
    storageFileGetMetadata.mockResolvedValueOnce([
      { size: String(60 * 1024 * 1024), contentType: 'image/jpeg' },
    ]);

    const handler = archiveActivityWallPhoto as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;

    await expect(
      handler(validRequest, { auth: { uid: UID, token: { email: 'a@b.c' } } })
    ).rejects.toThrow(/50 MB/);

    expect(storageFileGetMetadata).toHaveBeenCalledTimes(1);
    expect(storageFileDownload).not.toHaveBeenCalled();
  });

  it('proceeds past the size guard when metadata reports a small file', async () => {
    storageFileGetMetadata.mockResolvedValueOnce([
      { size: String(100 * 1024), contentType: 'image/jpeg' },
    ]);
    // We want the handler to reach `download()` to prove the guard
    // doesn't reject small files. Once download is called, the test's
    // contract is satisfied; we let the rest of the flow fail naturally
    // (no real Drive client) and assert via the spy.
    storageFileDownload.mockRejectedValueOnce(new Error('drive client absent'));

    const handler = archiveActivityWallPhoto as unknown as (
      req: unknown,
      context: unknown
    ) => Promise<unknown>;

    await expect(
      handler(validRequest, { auth: { uid: UID, token: { email: 'a@b.c' } } })
    ).rejects.toThrow();

    expect(storageFileGetMetadata).toHaveBeenCalledTimes(1);
    expect(storageFileDownload).toHaveBeenCalledTimes(1);
  });
});

describe('generateWithAI read caching', () => {
  // Cloud Functions 2nd-gen reuses warm instances, so the module-scope
  // caches in index.ts should turn repeat reads into no-ops within a
  // single warm instance (audit doc item #3). These tests pin that
  // contract — without them, a future refactor could silently restore
  // the per-invocation Firestore reads.
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreState.admins = new Set<string>();
    __resetGenerateWithAICaches();
  });

  it('caches admin status across warm-instance reads (same email = one Firestore read)', async () => {
    const db = admin.firestore();
    mockFirestoreState.admins.add('user@school.org');

    const first = await __getCachedAdminStatus(db, 'user@school.org');
    const second = await __getCachedAdminStatus(db, 'user@school.org');

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(adminDocGet).toHaveBeenCalledTimes(1);
    expect(adminDocGet).toHaveBeenCalledWith('user@school.org');
  });

  it('caches by email — different emails each trigger their own read', async () => {
    const db = admin.firestore();
    mockFirestoreState.admins.add('admin@school.org');

    await __getCachedAdminStatus(db, 'admin@school.org');
    await __getCachedAdminStatus(db, 'user@school.org');
    await __getCachedAdminStatus(db, 'admin@school.org');

    // First call for each email reads; the third call (repeat) is cached.
    expect(adminDocGet).toHaveBeenCalledTimes(2);
  });

  it('resetting caches forces a re-read on next call', async () => {
    const db = admin.firestore();
    await __getCachedAdminStatus(db, 'user@school.org');
    __resetGenerateWithAICaches();
    await __getCachedAdminStatus(db, 'user@school.org');

    expect(adminDocGet).toHaveBeenCalledTimes(2);
  });

  it('evicts the least-recently-used entry when the admin cache exceeds its bound', async () => {
    // Pins the size-cap contract — a warm instance that sees many distinct
    // callers must not grow the Map unboundedly. The cache is LRU, so
    // after filling beyond the cap the oldest *by recency* entries are
    // evicted; entries that were never re-touched stay at the front of
    // the eviction queue.
    const db = admin.firestore();
    // The implementation cap is 500; fill past it with unique emails.
    // Reading 510 distinct emails forces 10 evictions starting from the
    // oldest insertions.
    for (let i = 0; i < 510; i++) {
      await __getCachedAdminStatus(db, `bulk-${i}@school.org`);
    }
    expect(adminDocGet).toHaveBeenCalledTimes(510);

    // The first 10 should have been evicted. A re-probe of bulk-0 must
    // miss the cache and trigger another Firestore read.
    await __getCachedAdminStatus(db, 'bulk-0@school.org');
    expect(adminDocGet).toHaveBeenCalledTimes(511);

    // bulk-509 (the most recent) is still cached.
    await __getCachedAdminStatus(db, 'bulk-509@school.org');
    expect(adminDocGet).toHaveBeenCalledTimes(511);
  });

  it('LRU: a recently-accessed key survives eviction pressure that would drop it under FIFO', async () => {
    // The regression this guards against: under FIFO, a frequently-hit
    // key written early gets evicted by one-off lookups. Under LRU, a
    // hit promotes the key to the tail and it survives.
    const db = admin.firestore();

    // Insert bulk-0 first, then fill the cache up to (but not over) the
    // cap with 499 other distinct keys. After this, bulk-0 is the oldest
    // by insertion order.
    await __getCachedAdminStatus(db, 'bulk-0@school.org');
    for (let i = 1; i < 500; i++) {
      await __getCachedAdminStatus(db, `bulk-${i}@school.org`);
    }
    expect(adminDocGet).toHaveBeenCalledTimes(500);

    // Touch bulk-0 again — under LRU this promotes it to most-recently-used.
    // No Firestore read because it's still cached.
    await __getCachedAdminStatus(db, 'bulk-0@school.org');
    expect(adminDocGet).toHaveBeenCalledTimes(500);

    // Now push 10 brand-new entries past the cap. Under FIFO bulk-0 would
    // be evicted first; under LRU bulk-1 is now the oldest and gets dropped.
    for (let i = 500; i < 510; i++) {
      await __getCachedAdminStatus(db, `bulk-${i}@school.org`);
    }
    expect(adminDocGet).toHaveBeenCalledTimes(510);

    // bulk-0 must still be cached (the LRU promotion saved it).
    await __getCachedAdminStatus(db, 'bulk-0@school.org');
    expect(adminDocGet).toHaveBeenCalledTimes(510);

    // bulk-1 — never re-touched, oldest by recency — should now be evicted.
    await __getCachedAdminStatus(db, 'bulk-1@school.org');
    expect(adminDocGet).toHaveBeenCalledTimes(511);
  });

  it('caches gemini-functions model config across warm-instance reads', async () => {
    const db = admin.firestore();
    geminiConfigDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        config: {
          advancedModel: 'gemini-2.5-pro',
          standardModel: 'gemini-2.5-flash',
        },
      }),
    });

    const first = await __getGeminiModelConfig(db);
    const second = await __getGeminiModelConfig(db);

    expect(first).toEqual({
      advancedModel: 'gemini-2.5-pro',
      standardModel: 'gemini-2.5-flash',
      usedFallback: false,
    });
    expect(second).toEqual(first);
    // The second call must NOT hit Firestore.
    expect(geminiConfigDocGet).toHaveBeenCalledTimes(1);
  });

  it('does not cache the fallback when the gemini-functions read throws', async () => {
    const db = admin.firestore();
    // Transient Firestore error — generateWithAI should not pin defaults
    // for the full TTL after a one-off blip.
    geminiConfigDocGet.mockRejectedValueOnce(
      new Error('Firestore unavailable')
    );
    geminiConfigDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        config: {
          advancedModel: 'gemini-2.5-pro',
          standardModel: 'gemini-2.5-flash',
        },
      }),
    });

    const first = await __getGeminiModelConfig(db);
    const second = await __getGeminiModelConfig(db);

    // First returns defaults (caught), second retries and succeeds.
    expect(first.advancedModel).not.toBe('gemini-2.5-pro');
    expect(second.advancedModel).toBe('gemini-2.5-pro');
    expect(geminiConfigDocGet).toHaveBeenCalledTimes(2);
  });
});

describe('getGeminiModelConfig usedFallback flag', () => {
  // Locks in the silent-failure-hunter contract from PR #1597 review: when the
  // Firestore read for admin model overrides throws (brownout / outage), the
  // function returns hardcoded defaults AND sets `usedFallback: true` so the
  // client can surface a one-time admin notice. Without the flag, regressions
  // in admin-configured AI quality are invisible.
  //
  // Uses an isolated `buildDb` rather than the shared scaffolding so the
  // assertions don't depend on global mock state. Resets the module cache
  // between cases so a successful read from one case doesn't satisfy the
  // throw-path read in the next.

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const buildDb = (
    geminiDocBehavior: 'success-with-overrides' | 'success-empty' | 'throws'
  ): any => ({
    collection: vi.fn((name: string) => {
      if (name !== 'global_permissions') {
        throw new Error(`Unexpected collection access: ${name}`);
      }
      return {
        doc: vi.fn((docId: string) => {
          if (docId !== 'gemini-functions') {
            throw new Error(`Unexpected doc access: ${docId}`);
          }
          return {
            get: vi.fn(() => {
              if (geminiDocBehavior === 'throws') {
                return Promise.reject(
                  new Error('Firestore unavailable (simulated brownout)')
                );
              }
              if (geminiDocBehavior === 'success-with-overrides') {
                return Promise.resolve({
                  data: () => ({
                    config: {
                      advancedModel: 'gemini-2.5-pro',
                      standardModel: 'gemini-2.5-flash',
                    },
                  }),
                });
              }
              // success-empty: doc exists but has no config
              return Promise.resolve({ data: () => ({}) });
            }),
          };
        }),
      };
    }),
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  beforeEach(() => {
    __resetGenerateWithAICaches();
  });

  it('sets usedFallback=true and returns defaults when the Firestore read throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    /* eslint-disable @typescript-eslint/no-unsafe-argument */
    const result = await __getGeminiModelConfig(buildDb('throws'));
    /* eslint-enable @typescript-eslint/no-unsafe-argument */

    expect(result.usedFallback).toBe(true);
    // Defaults must still be valid (non-empty) model names so generation can
    // proceed — the whole point of the fallback path is to keep AI working
    // during a Firestore brownout.
    expect(typeof result.advancedModel).toBe('string');
    expect(result.advancedModel.length).toBeGreaterThan(0);
    expect(typeof result.standardModel).toBe('string');
    expect(result.standardModel.length).toBeGreaterThan(0);

    // The log-only behavior is preserved alongside the new flag.
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('sets usedFallback=false when admin overrides load successfully', async () => {
    /* eslint-disable @typescript-eslint/no-unsafe-argument */
    const result = await __getGeminiModelConfig(
      buildDb('success-with-overrides')
    );
    /* eslint-enable @typescript-eslint/no-unsafe-argument */

    expect(result.usedFallback).toBe(false);
    expect(result.advancedModel).toBe('gemini-2.5-pro');
    expect(result.standardModel).toBe('gemini-2.5-flash');
  });

  it('sets usedFallback=false when the doc exists but carries no overrides', async () => {
    // No admin has tuned overrides yet — `cfg` is undefined and we fall
    // through to defaults. This is the steady-state for a fresh install
    // and must NOT trigger the fallback UI signal (which is reserved for
    // actual Firestore read failures).
    /* eslint-disable @typescript-eslint/no-unsafe-argument */
    const result = await __getGeminiModelConfig(buildDb('success-empty'));
    /* eslint-enable @typescript-eslint/no-unsafe-argument */

    expect(result.usedFallback).toBe(false);
  });
});
