/**
 * Tests for the server-side Google OAuth refresh-token flow.
 *
 * Critical surfaces covered:
 * - Encrypted refresh-token storage at /users/{uid}/private/googleAuth
 * - HttpsError → details.reason discrimination (`needs-consent` vs `transient`)
 * - Decryption-failure cleanup (poison-doc deletion)
 * - `invalid_grant` cleanup (revoked-grant deletion)
 * - Scope-downgrade rejection (partial-consent guard)
 * - Idempotent revoke
 */

/* eslint-disable @typescript-eslint/require-await -- mock handlers
   intentionally return Promise-shaped values without awaiting, to match
   the production Promise-returning contract of axios / Firestore APIs. */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Firestore mock state — module-level so callables share it within a test
// and we reset between tests via clearFirestoreState().
interface DocSnap {
  exists: boolean;
  data: () => unknown;
}
const firestoreDocs = new Map<string, unknown>();
const deletedPaths: string[] = [];

const clearFirestoreState = () => {
  firestoreDocs.clear();
  deletedPaths.length = 0;
};

vi.mock('firebase-admin', () => {
  return {
    apps: [{ name: '[DEFAULT]' }],
    initializeApp: vi.fn(),
    firestore: vi.fn(() => ({
      doc: (path: string) => ({
        get: async (): Promise<DocSnap> => {
          if (firestoreDocs.has(path)) {
            const data = firestoreDocs.get(path);
            return { exists: true, data: () => data };
          }
          return { exists: false, data: () => undefined };
        },
        set: async (data: unknown) => {
          firestoreDocs.set(path, data);
        },
        delete: async () => {
          deletedPaths.push(path);
          firestoreDocs.delete(path);
        },
      }),
    })),
  };
});

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
    onCall: (_options: unknown, handler: unknown) => handler,
    HttpsError,
  };
});

vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({
    name,
    value: () => `secret-${name}`,
  }),
}));

// Axios mock — per-test handlers via setAxiosHandler().
type AxiosHandler = (
  url: string,
  body: string
) => Promise<{ data: unknown }> | { data: unknown };
let axiosHandler: AxiosHandler = () => {
  throw new Error('axios.post not stubbed for this test');
};
const setAxiosHandler = (h: AxiosHandler) => {
  axiosHandler = h;
};

class FakeAxiosError extends Error {
  isAxiosError = true;
  response?: { data?: { error?: string } };
  constructor(message: string, responseData?: { error?: string }) {
    super(message);
    this.response = responseData ? { data: responseData } : undefined;
  }
}

vi.mock('axios', () => ({
  default: {
    post: (url: string, body: string) => axiosHandler(url, body),
    isAxiosError: (err: unknown) =>
      err instanceof FakeAxiosError ||
      (err instanceof Error &&
        (err as { isAxiosError?: boolean }).isAxiosError === true),
  },
}));

// Real crypto-js — AES round-trips work as in production. We pass a stable
// key so cipher payloads are deterministic across cases within a test, and
// rotate the key to simulate "encryption key rotated" scenarios.

import {
  exchangeGoogleAuthCode,
  refreshGoogleAccessToken,
  revokeGoogleRefreshToken,
} from './googleOAuth';

const PRIVATE_DOC_PATH_FOR = (uid: string) => `users/${uid}/private/googleAuth`;
const TEST_UID = 'teacher-uid-1';
const ALL_SCOPES =
  'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';

// The mocked `onCall` returns the raw handler, so the exported callables
// are actually `(req) => Promise<T>` at runtime. TS still sees them as the
// firebase-functions CallableFunction type, so we cast through unknown.
type RawHandler = (req: unknown) => Promise<unknown>;
function callAuthed(
  fn: unknown,
  data: unknown,
  uid: string = TEST_UID
): Promise<unknown> {
  return (fn as RawHandler)({ auth: { uid }, data });
}

interface ThrownHttpsError extends Error {
  code: string;
  details?: unknown;
}

async function expectThrows(
  fn: () => Promise<unknown>
): Promise<ThrownHttpsError> {
  try {
    await fn();
  } catch (err) {
    return err as ThrownHttpsError;
  }
  throw new Error('Expected function to throw, but it did not.');
}

beforeEach(() => {
  clearFirestoreState();
  setAxiosHandler(() => {
    throw new Error('axios.post not stubbed for this test');
  });
});

describe('exchangeGoogleAuthCode', () => {
  it('throws unauthenticated when req.auth is missing', async () => {
    const err = await expectThrows(() =>
      (exchangeGoogleAuthCode as unknown as RawHandler)({
        data: { code: 'c', redirectUri: 'r' },
      })
    );
    expect(err.code).toBe('unauthenticated');
  });

  it('throws invalid-argument when code is missing', async () => {
    const err = await expectThrows(() =>
      callAuthed(exchangeGoogleAuthCode, { redirectUri: 'r' })
    );
    expect(err.code).toBe('invalid-argument');
    expect(err.message).toMatch(/code is required/);
  });

  it('throws invalid-argument when redirectUri is missing', async () => {
    const err = await expectThrows(() =>
      callAuthed(exchangeGoogleAuthCode, { code: 'c' })
    );
    expect(err.code).toBe('invalid-argument');
    expect(err.message).toMatch(/redirectUri is required/);
  });

  it('persists encrypted refresh_token and returns the access_token on success', async () => {
    setAxiosHandler(async () => ({
      data: {
        access_token: 'access-1',
        expires_in: 3600,
        refresh_token: 'refresh-1',
        scope: ALL_SCOPES,
        token_type: 'Bearer',
      },
    }));

    const result = (await callAuthed(exchangeGoogleAuthCode, {
      code: 'c',
      redirectUri: 'postmessage',
    })) as { accessToken: string; expiresIn: number; hasRefreshToken: boolean };

    expect(result.accessToken).toBe('access-1');
    expect(result.expiresIn).toBe(3600);
    expect(result.hasRefreshToken).toBe(true);

    const stored = firestoreDocs.get(PRIVATE_DOC_PATH_FOR(TEST_UID)) as {
      encryptedRefreshToken: string;
      scope: string;
      updatedAt: number;
    };
    expect(stored).toBeDefined();
    // The encrypted form must NOT equal the plaintext token.
    expect(stored.encryptedRefreshToken).not.toBe('refresh-1');
    expect(stored.scope).toBe(ALL_SCOPES);
    expect(typeof stored.updatedAt).toBe('number');
  });

  it('does NOT overwrite the existing stored doc when Google omits refresh_token', async () => {
    // Pre-populate with an existing grant so we can verify it survives.
    firestoreDocs.set(PRIVATE_DOC_PATH_FOR(TEST_UID), {
      encryptedRefreshToken: 'preexisting-ciphertext',
      updatedAt: 1,
      scope: ALL_SCOPES,
    });

    setAxiosHandler(async () => ({
      data: {
        access_token: 'access-2',
        expires_in: 3600,
        // refresh_token deliberately absent — re-authorization case.
        scope: ALL_SCOPES,
        token_type: 'Bearer',
      },
    }));

    const result = (await callAuthed(exchangeGoogleAuthCode, {
      code: 'c',
      redirectUri: 'postmessage',
    })) as { hasRefreshToken: boolean };

    expect(result.hasRefreshToken).toBe(false);
    // Stored doc preserved verbatim.
    expect(firestoreDocs.get(PRIVATE_DOC_PATH_FOR(TEST_UID))).toMatchObject({
      encryptedRefreshToken: 'preexisting-ciphertext',
    });
  });

  it('surfaces invalid_grant from Google as failed-precondition with the error string', async () => {
    setAxiosHandler(async () => {
      throw new FakeAxiosError('Request failed', { error: 'invalid_grant' });
    });

    const err = await expectThrows(() =>
      callAuthed(exchangeGoogleAuthCode, {
        code: 'c',
        redirectUri: 'postmessage',
      })
    );
    expect(err.code).toBe('failed-precondition');
    expect(err.message).toMatch(/invalid_grant/);
    // Encrypted doc must NOT have been written on a failed exchange.
    expect(firestoreDocs.get(PRIVATE_DOC_PATH_FOR(TEST_UID))).toBeUndefined();
  });

  it('does not misclassify non-axios errors as Google errors', async () => {
    setAxiosHandler(async () => {
      // A TypeError simulating surrounding-code failure that happens to be
      // caught by the same try/catch. Must NOT surface as
      // "Google token exchange failed: undefined".
      throw new TypeError('cannot read properties of undefined');
    });

    const err = await expectThrows(() =>
      callAuthed(exchangeGoogleAuthCode, {
        code: 'c',
        redirectUri: 'postmessage',
      })
    );
    expect(err.code).toBe('failed-precondition');
    expect(err.message).toMatch(/cannot read properties of undefined/);
    // Must NOT be the regression message that drops the underlying cause.
    expect(err.message).not.toBe('Google token exchange failed: undefined');
  });

  it('throws failed-precondition when Google returns no access_token', async () => {
    setAxiosHandler(async () => ({
      data: {
        expires_in: 3600,
        scope: ALL_SCOPES,
        token_type: 'Bearer',
        // No access_token field at all.
      },
    }));

    const err = await expectThrows(() =>
      callAuthed(exchangeGoogleAuthCode, {
        code: 'c',
        redirectUri: 'postmessage',
      })
    );
    expect(err.code).toBe('failed-precondition');
    expect(err.message).toMatch(/Google did not return an access_token/);
  });

  it('accepts a drive.file-only grant (Path B: spreadsheets no longer required offline)', async () => {
    // Under Path B the offline grant only needs `drive.file`. A grant that
    // omits `spreadsheets` (now acquired on demand via GIS) must NOT be
    // rejected — it is a valid offline grant.
    setAxiosHandler(async () => ({
      data: {
        access_token: 'access-1',
        expires_in: 3600,
        refresh_token: 'refresh-1',
        scope: 'https://www.googleapis.com/auth/drive.file', // no spreadsheets
        token_type: 'Bearer',
      },
    }));

    const result = (await callAuthed(exchangeGoogleAuthCode, {
      code: 'c',
      redirectUri: 'postmessage',
    })) as { accessToken: string; hasRefreshToken: boolean };

    expect(result.accessToken).toBe('access-1');
    expect(result.hasRefreshToken).toBe(true);
    // The drive.file-only grant is persisted (no partial-consent rejection).
    expect(firestoreDocs.get(PRIVATE_DOC_PATH_FOR(TEST_UID))).toBeDefined();
  });

  it('rejects scope downgrades with needs-consent / partial-consent', async () => {
    // Drop the only REQUIRED scope (`drive.file`) from Google's response.
    setAxiosHandler(async () => ({
      data: {
        access_token: 'access-1',
        expires_in: 3600,
        refresh_token: 'refresh-1',
        scope: 'https://www.googleapis.com/auth/spreadsheets', // missing drive.file
        token_type: 'Bearer',
      },
    }));

    const err = await expectThrows(() =>
      callAuthed(exchangeGoogleAuthCode, {
        code: 'c',
        redirectUri: 'postmessage',
      })
    );
    expect(err.code).toBe('failed-precondition');
    expect((err.details as { reason: string; cause: string }).reason).toBe(
      'needs-consent'
    );
    expect((err.details as { cause: string }).cause).toBe('partial-consent');
    // Critically — no doc persisted on a downgraded grant.
    expect(firestoreDocs.get(PRIVATE_DOC_PATH_FOR(TEST_UID))).toBeUndefined();
  });
});

describe('refreshGoogleAccessToken', () => {
  it('returns needs-consent when no token is stored', async () => {
    const err = await expectThrows(() =>
      callAuthed(refreshGoogleAccessToken, {})
    );
    expect(err.code).toBe('failed-precondition');
    expect((err.details as { reason: string; cause: string }).reason).toBe(
      'needs-consent'
    );
    expect((err.details as { cause: string }).cause).toBe('no-stored-token');
  });

  it('deletes the stored doc AND returns needs-consent when decryption fails', async () => {
    // Pre-populate with a doc whose ciphertext won't decrypt under the
    // current key — simulates GOOGLE_OAUTH_REFRESH_TOKEN_KEY rotation.
    firestoreDocs.set(PRIVATE_DOC_PATH_FOR(TEST_UID), {
      encryptedRefreshToken: 'not-a-valid-ciphertext',
      updatedAt: 1,
      scope: ALL_SCOPES,
    });

    const err = await expectThrows(() =>
      callAuthed(refreshGoogleAccessToken, {})
    );
    expect(err.code).toBe('failed-precondition');
    expect((err.details as { reason: string; cause: string }).reason).toBe(
      'needs-consent'
    );
    expect((err.details as { cause: string }).cause).toBe('decrypt-failed');
    // Poison doc deleted so subsequent calls don't loop on it.
    expect(deletedPaths).toContain(PRIVATE_DOC_PATH_FOR(TEST_UID));
  });

  it('deletes the stored doc AND returns needs-consent on Google invalid_grant', async () => {
    // First seed a real refresh_token via exchange, then make the refresh
    // call return invalid_grant.
    setAxiosHandler(async () => ({
      data: {
        access_token: 'access-1',
        expires_in: 3600,
        refresh_token: 'refresh-1',
        scope: ALL_SCOPES,
        token_type: 'Bearer',
      },
    }));
    await callAuthed(exchangeGoogleAuthCode, {
      code: 'c',
      redirectUri: 'postmessage',
    });
    // Refresh: Google returns invalid_grant.
    setAxiosHandler(async () => {
      throw new FakeAxiosError('Bad Request', { error: 'invalid_grant' });
    });

    const err = await expectThrows(() =>
      callAuthed(refreshGoogleAccessToken, {})
    );
    expect(err.code).toBe('failed-precondition');
    expect((err.details as { reason: string; cause: string }).reason).toBe(
      'needs-consent'
    );
    expect((err.details as { cause: string }).cause).toBe('invalid-grant');
    expect(deletedPaths).toContain(PRIVATE_DOC_PATH_FOR(TEST_UID));
  });

  it('returns transient for non-invalid_grant axios errors (no doc deletion)', async () => {
    // Seed.
    setAxiosHandler(async () => ({
      data: {
        access_token: 'access-1',
        expires_in: 3600,
        refresh_token: 'refresh-1',
        scope: ALL_SCOPES,
        token_type: 'Bearer',
      },
    }));
    await callAuthed(exchangeGoogleAuthCode, {
      code: 'c',
      redirectUri: 'postmessage',
    });
    // Refresh: 500 from Google.
    setAxiosHandler(async () => {
      throw new FakeAxiosError('Server error');
    });

    const err = await expectThrows(() =>
      callAuthed(refreshGoogleAccessToken, {})
    );
    expect(err.code).toBe('internal');
    expect((err.details as { reason: string }).reason).toBe('transient');
    // Doc preserved on transient failures.
    expect(deletedPaths).not.toContain(PRIVATE_DOC_PATH_FOR(TEST_UID));
  });

  it('returns a fresh access_token on success', async () => {
    setAxiosHandler(async () => ({
      data: {
        access_token: 'access-1',
        expires_in: 3600,
        refresh_token: 'refresh-1',
        scope: ALL_SCOPES,
        token_type: 'Bearer',
      },
    }));
    await callAuthed(exchangeGoogleAuthCode, {
      code: 'c',
      redirectUri: 'postmessage',
    });

    setAxiosHandler(async () => ({
      data: {
        access_token: 'fresh-access',
        expires_in: 3600,
        scope: ALL_SCOPES,
        token_type: 'Bearer',
      },
    }));
    const result = (await callAuthed(refreshGoogleAccessToken, {})) as {
      accessToken: string;
      expiresIn: number;
    };
    expect(result.accessToken).toBe('fresh-access');
    expect(result.expiresIn).toBe(3600);
  });

  it('returns transient when Google refresh returns 200 without an access_token', async () => {
    setAxiosHandler(async () => ({
      data: {
        access_token: 'access-1',
        expires_in: 3600,
        refresh_token: 'refresh-1',
        scope: ALL_SCOPES,
        token_type: 'Bearer',
      },
    }));
    await callAuthed(exchangeGoogleAuthCode, {
      code: 'c',
      redirectUri: 'postmessage',
    });

    setAxiosHandler(async () => ({
      data: {
        expires_in: 3600,
        scope: ALL_SCOPES,
        token_type: 'Bearer',
        // No access_token.
      },
    }));
    const err = await expectThrows(() =>
      callAuthed(refreshGoogleAccessToken, {})
    );
    expect(err.code).toBe('internal');
    expect((err.details as { reason: string }).reason).toBe('transient');
  });
});

describe('revokeGoogleRefreshToken', () => {
  it('returns { revoked: false, reason: "no-stored-token" } when nothing is stored', async () => {
    const result = (await callAuthed(revokeGoogleRefreshToken, {})) as {
      revoked: boolean;
      reason?: string;
    };
    expect(result.revoked).toBe(false);
    expect(result.reason).toBe('no-stored-token');
  });

  it('deletes the stored doc and POSTs to Google revoke endpoint on success', async () => {
    // Seed.
    setAxiosHandler(async () => ({
      data: {
        access_token: 'access-1',
        expires_in: 3600,
        refresh_token: 'refresh-1',
        scope: ALL_SCOPES,
        token_type: 'Bearer',
      },
    }));
    await callAuthed(exchangeGoogleAuthCode, {
      code: 'c',
      redirectUri: 'postmessage',
    });

    const revokeCalls: string[] = [];
    setAxiosHandler(async (url) => {
      revokeCalls.push(url);
      return { data: {} };
    });

    const result = (await callAuthed(revokeGoogleRefreshToken, {})) as {
      revoked: boolean;
    };
    expect(result.revoked).toBe(true);
    expect(revokeCalls[0]).toMatch(/revoke/);
    expect(deletedPaths).toContain(PRIVATE_DOC_PATH_FOR(TEST_UID));
  });

  it('still deletes the local doc when the Google revoke endpoint errors', async () => {
    setAxiosHandler(async () => ({
      data: {
        access_token: 'access-1',
        expires_in: 3600,
        refresh_token: 'refresh-1',
        scope: ALL_SCOPES,
        token_type: 'Bearer',
      },
    }));
    await callAuthed(exchangeGoogleAuthCode, {
      code: 'c',
      redirectUri: 'postmessage',
    });

    setAxiosHandler(async () => {
      throw new FakeAxiosError('Network failure');
    });
    const result = (await callAuthed(revokeGoogleRefreshToken, {})) as {
      revoked: boolean;
    };
    // Caller still sees success — local cleanup is the load-bearing step.
    expect(result.revoked).toBe(true);
    expect(deletedPaths).toContain(PRIVATE_DOC_PATH_FOR(TEST_UID));
  });

  it('deletes the doc and skips the Google call when the stored ciphertext is undecryptable', async () => {
    // Pre-seed a poison doc.
    firestoreDocs.set(PRIVATE_DOC_PATH_FOR(TEST_UID), {
      encryptedRefreshToken: 'garbage',
      updatedAt: 1,
      scope: ALL_SCOPES,
    });
    let revokeCalled = false;
    setAxiosHandler(async () => {
      revokeCalled = true;
      return { data: {} };
    });

    const result = (await callAuthed(revokeGoogleRefreshToken, {})) as {
      revoked: boolean;
    };
    expect(result.revoked).toBe(true);
    expect(revokeCalled).toBe(false);
    expect(deletedPaths).toContain(PRIVATE_DOC_PATH_FOR(TEST_UID));
  });
});
