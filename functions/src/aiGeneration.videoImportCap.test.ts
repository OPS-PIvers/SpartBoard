import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(() => ({}), {
    FieldValue: { serverTimestamp: () => 'ts' },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {},
  onCall: (_o: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ value: () => name, name }),
}));
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: () => '@x',
  resolveOrgIdForDomain: () => Promise.resolve('o'),
}));

import { videoImportExtraCap } from './aiGeneration';

const dbWith = (data: unknown) =>
  ({
    collection: () => ({
      doc: () => ({ get: () => Promise.resolve({ data: () => data }) }),
    }),
  }) as never;

describe('videoImportExtraCap', () => {
  it('uses the admin-saved limit on the Video import row', async () => {
    const cap = await videoImportExtraCap(
      dbWith({ config: { dailyLimit: 7 } })
    );
    expect(cap).toMatchObject({ key: 'video-import-ai', limit: 7 });
  });

  it('defaults to 20 a day when no limit is saved', async () => {
    expect((await videoImportExtraCap(dbWith(undefined))).limit).toBe(20);
    expect((await videoImportExtraCap(dbWith({ enabled: true }))).limit).toBe(
      20
    );
  });

  it('still counts but never blocks when the admin turns the limit off', async () => {
    const cap = await videoImportExtraCap(
      dbWith({ config: { dailyLimit: 3, dailyLimitEnabled: false } })
    );
    expect(cap.limit).toBe(Number.POSITIVE_INFINITY);
  });
});
