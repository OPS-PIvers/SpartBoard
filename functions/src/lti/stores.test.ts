import { describe, it, expect } from 'vitest';
import {
  putOidcState,
  consumeOidcState,
  mintLaunchCode,
  consumeLaunchCode,
  newOpaqueId,
  LTI_STATE_COLLECTION,
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

  it('returns null (not undefined) for contextId/contextTitle/resourceLinkId when absent in stored doc', async () => {
    // Regression: consumeLaunchCode applied `?? null` to ags/nrps/deepLinking/custom/email/name
    // but NOT to contextId, contextTitle, or resourceLinkId. A doc stored without those fields
    // (e.g. written by an older code version) returns `undefined` for them, violating the
    // `StoredLaunch` type contract (`string | null`). Consumers that check `=== null` instead
    // of `== null` or truthiness would silently mishandle an absent context id as "present"
    // because `undefined !== null`.
    const { db, store } = makeFakeDb();
    store.set('lti_launch_codes/old-code', {
      role: 'student',
      messageType: 'LtiResourceLinkRequest',
      sub: 'user-1',
      deploymentId: 'dep-1',
      // contextId, contextTitle, resourceLinkId intentionally absent (old doc)
      ags: null,
      nrps: null,
      deepLinking: null,
      custom: null,
      email: null,
      name: null,
      expiresAtMs: Date.now() + 60_000,
    });
    const result = await consumeLaunchCode(db, 'old-code');
    expect(result).not.toBeNull();
    expect(result?.contextId).toBeNull();
    expect(result?.contextTitle).toBeNull();
    expect(result?.resourceLinkId).toBeNull();
  });

  it('rejects (and deletes) an expired launch code', async () => {
    const { db, store } = makeFakeDb();
    store.set('lti_launch_codes/expired-code', {
      ...sampleLaunch(),
      expiresAtMs: Date.now() - 1000,
    });
    expect(await consumeLaunchCode(db, 'expired-code')).toBeNull();
    // Doc must be deleted even when expired (single-use contract).
    expect(store.has('lti_launch_codes/expired-code')).toBe(false);
  });
});
