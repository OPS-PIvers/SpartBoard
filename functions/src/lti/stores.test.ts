import { describe, it, expect } from 'vitest';
import {
  putOidcState,
  consumeOidcState,
  mintLaunchCode,
  consumeLaunchCode,
  mintGradePushAuth,
  validateGradePushAuth,
  newOpaqueId,
  LTI_STATE_COLLECTION,
  LTI_PUSH_AUTH_COLLECTION,
  type StoredLaunch,
} from './stores';

// Minimal in-memory Firestore stand-in: supports collection().doc().get/set/delete
// and runTransaction with tx.get/tx.delete. Enough to exercise the single-use +
// expiry contract without the emulator.
function makeFakeDb() {
  const store = new Map<string, Record<string, unknown>>();
  function ref(path: string) {
    return {
      path,
      get() {
        return { exists: store.has(path), data: () => store.get(path) };
      },
      set(v: Record<string, unknown>) {
        store.set(path, v);
      },
      delete() {
        store.delete(path);
      },
    };
  }
  return {
    store,
    db: {
      collection(name: string) {
        return { doc: (id: string) => ref(`${name}/${id}`) };
      },
      doc(path: string) {
        return ref(path);
      },
      async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
        const tx = {
          get: (r: { get: () => unknown }) => r.get(),
          delete: (r: { path: string }) => store.delete(r.path),
          set: (r: { path: string }, v: Record<string, unknown>) =>
            store.set(r.path, v),
        };
        return fn(tx);
      },
    } as unknown as Parameters<typeof putOidcState>[0],
  };
}

function sampleLaunch(): StoredLaunch {
  return {
    role: 'student',
    messageType: 'LtiResourceLinkRequest',
    sub: 'user-1',
    deploymentId: 'dep-1',
    contextId: 'course-1',
    contextTitle: 'Math 7',
    resourceLinkId: 'rl-1',
    ags: { lineitem: 'https://lti.example/lineitems/1/lineitem' },
    nrps: null,
    deepLinking: null,
    custom: { quiz_id: 'abc' },
    email: null,
    name: null,
  };
}

describe('newOpaqueId', () => {
  it('generates distinct URL-safe ids', () => {
    const a = newOpaqueId();
    const b = newOpaqueId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('OIDC state store', () => {
  it('round-trips a nonce and is single-use', async () => {
    const { db } = makeFakeDb();
    await putOidcState(db, 'state-1', 'nonce-1');
    expect(await consumeOidcState(db, 'state-1')).toBe('nonce-1');
    // second consume returns null (deleted on first use)
    expect(await consumeOidcState(db, 'state-1')).toBeNull();
  });

  it('returns null for an unknown state', async () => {
    const { db } = makeFakeDb();
    expect(await consumeOidcState(db, 'missing')).toBeNull();
    expect(await consumeOidcState(db, '')).toBeNull();
  });

  it('rejects (and deletes) an expired state', async () => {
    const { db, store } = makeFakeDb();
    store.set(`${LTI_STATE_COLLECTION}/old`, {
      nonce: 'nonce-old',
      expiresAtMs: Date.now() - 1000,
    });
    expect(await consumeOidcState(db, 'old')).toBeNull();
    expect(store.has(`${LTI_STATE_COLLECTION}/old`)).toBe(false);
  });
});

describe('launch-code store', () => {
  it('round-trips the stored launch and is single-use', async () => {
    const { db } = makeFakeDb();
    const launch = sampleLaunch();
    const code = await mintLaunchCode(db, launch);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);

    const got = await consumeLaunchCode(db, code);
    // returned launch is stripped of bookkeeping fields (expiresAt*/createdAt)
    expect(got).toEqual(launch);

    expect(await consumeLaunchCode(db, code)).toBeNull();
  });

  it('returns null for an unknown / empty code', async () => {
    const { db } = makeFakeDb();
    expect(await consumeLaunchCode(db, 'missing')).toBeNull();
    expect(await consumeLaunchCode(db, '')).toBeNull();
  });
});

describe('grade-push auth', () => {
  it('mints a token that validates for its resource link within TTL', async () => {
    const { db } = makeFakeDb();
    const token = await mintGradePushAuth(db, {
      resourceLinkId: 'rl-1',
      contextId: 'c-1',
    });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await validateGradePushAuth(db, token, 'rl-1')).toBe(true);
  });

  it('rejects a token presented for a different resource link', async () => {
    const { db } = makeFakeDb();
    const token = await mintGradePushAuth(db, {
      resourceLinkId: 'rl-1',
      contextId: null,
    });
    expect(await validateGradePushAuth(db, token, 'rl-2')).toBe(false);
  });

  it('rejects unknown and empty tokens', async () => {
    const { db } = makeFakeDb();
    expect(await validateGradePushAuth(db, 'nope', 'rl-1')).toBe(false);
    expect(await validateGradePushAuth(db, '', 'rl-1')).toBe(false);
  });

  it('rejects an expired token', async () => {
    const { db, store } = makeFakeDb();
    store.set(`${LTI_PUSH_AUTH_COLLECTION}/old`, {
      resourceLinkId: 'rl-1',
      expiresAtMs: Date.now() - 1000,
    });
    expect(await validateGradePushAuth(db, 'old', 'rl-1')).toBe(false);
  });
});
