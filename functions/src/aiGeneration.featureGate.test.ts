import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(() => ({}), {
    FieldValue: { serverTimestamp: () => 'ts' },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { HttpsError, onCall: (_o: unknown, handler: unknown) => handler };
});
vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ value: () => name, name }),
}));
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: (e: string) => `@${e.split('@')[1] ?? ''}`,
  resolveOrgIdForDomain: () => Promise.resolve(null),
}));
vi.mock('./resolveOrgForUser', () => ({
  resolveDomainCandidates: () => [],
}));

import { enforceAiFeatureAccess } from './aiGeneration';

type Doc = Record<string, unknown>;

function fakeDb(docs: Record<string, Doc>) {
  const snap = (path: string) => ({
    exists: docs[path] !== undefined,
    data: () => docs[path],
    get: (field: string) => docs[path]?.[field],
  });
  const ref = (path: string) => ({
    path,
    id: path.split('/').pop(),
    get: () => Promise.resolve(snap(path)),
  });
  return {
    collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
    doc: (path: string) => ref(path),
    collectionGroup: () => ({
      where: () => ({
        where: () => ({ get: () => Promise.resolve({ docs: [] }) }),
      }),
    }),
    runTransaction: (
      fn: (tx: {
        get: (r: { path: string }) => unknown;
        set: () => void;
      }) => unknown
    ) =>
      Promise.resolve(
        fn({ get: (r) => Promise.resolve(snap(r.path)), set: () => undefined })
      ),
  } as never;
}

const token = (email: string) => ({ email, email_verified: true });

describe('enforceAiFeatureAccess matches the client gate', () => {
  it('lets a beta teacher from user roles through a beta doc', async () => {
    const db = fakeDb({
      'global_permissions/video-activity-ai': {
        enabled: true,
        accessLevel: 'beta',
        betaUsers: [],
      },
      'admin_settings/user_roles': { betaTeachers: ['Role@x.org'] },
    });
    await expect(
      enforceAiFeatureAccess(
        db,
        token('role@x.org'),
        'u1',
        'video-activity-ai',
        true
      )
    ).resolves.toMatchObject({ docIds: expect.any(Array) as unknown });
    await expect(
      enforceAiFeatureAccess(
        db,
        token('other@x.org'),
        'u2',
        'video-activity-ai',
        true
      )
    ).rejects.toThrow('beta feature');
  });

  it('denies an access level the client does not know', async () => {
    const db = fakeDb({
      'global_permissions/gemini-functions': {
        enabled: true,
        accessLevel: 'all',
      },
    });
    await expect(
      enforceAiFeatureAccess(
        db,
        token('t@x.org'),
        'u1',
        'video-activity-ai',
        true
      )
    ).rejects.toThrow('restricted to administrators');
  });

  it('applies a missing doc’s default tier floor', async () => {
    const db = fakeDb({});
    await expect(
      enforceAiFeatureAccess(
        db,
        token('t@gmail.com'),
        'u1',
        'ai-file-context',
        true
      )
    ).rejects.toThrow('You do not have access to ai-file-context.');
    await expect(
      enforceAiFeatureAccess(
        db,
        token('t@orono.k12.mn.us'),
        'u2',
        'ai-file-context',
        true
      )
    ).resolves.toBeDefined();
  });

  it('keeps a missing preview doc closed to teachers', async () => {
    await expect(
      enforceAiFeatureAccess(
        fakeDb({}),
        token('t@x.org'),
        'u1',
        'flashcards-ai',
        true
      )
    ).rejects.toThrow('You do not have access to flashcards-ai.');
  });
});
