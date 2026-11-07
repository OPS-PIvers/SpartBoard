import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  setDoc: vi.fn(() => Promise.resolve()),
  stored: null as Record<string, unknown> | null,
  txSet: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/utils/viewAsTab', () => ({ viewAsBlocksWrite: () => false }));
vi.mock('firebase/firestore', () => ({
  doc: (..._args: unknown[]) => ({
    path: 'users/u1/userProfile/gettingStarted',
  }),
  setDoc: fs.setDoc,
  runTransaction: async (
    _db: unknown,
    fn: (tx: {
      get: () => Promise<{ exists: () => boolean; data: () => object }>;
      set: typeof fs.txSet;
    }) => Promise<void>
  ) =>
    fn({
      get: () =>
        Promise.resolve({
          exists: () => fs.stored !== null,
          data: () => fs.stored ?? {},
        }),
      set: fs.txSet,
    }),
}));

const {
  BRAND_NEW_ACCOUNT_MS,
  QUIET_START_MS,
  isQuietStart,
  markFirstRun,
  normalizeGettingStartedProgress,
  resetGettingStartedProgress,
} = await import('./gettingStartedProgress');

beforeEach(() => {
  fs.setDoc.mockClear();
  fs.txSet.mockClear();
  fs.stored = null;
});

describe('gettingStartedProgress', () => {
  it('reads the welcome and first sign-in, dropping junk', () => {
    expect(
      normalizeGettingStartedProgress({
        finished: { a: 1, b: 'x' },
        welcome: 'pending',
        firstSignInAt: 5,
      })
    ).toEqual({ finished: { a: 1 }, welcome: 'pending', firstSignInAt: 5 });
    expect(
      normalizeGettingStartedProgress({ welcome: 'maybe', firstSignInAt: '5' })
    ).toEqual({ finished: {} });
    expect(normalizeGettingStartedProgress(undefined)).toEqual({
      finished: {},
    });
  });

  it('marks a brand-new account once', async () => {
    await markFirstRun('u1', Date.now() - 1000);
    expect(fs.txSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ welcome: 'pending' }),
      { merge: true }
    );
    fs.txSet.mockClear();
    fs.stored = { firstSignInAt: 1 };
    await markFirstRun('u1', Date.now() - 1000);
    expect(fs.txSet).not.toHaveBeenCalled();
  });

  it('never marks an older account or one with no creation time', async () => {
    await markFirstRun('u1', Date.now() - BRAND_NEW_ACCOUNT_MS - 1000);
    await markFirstRun('u1', null);
    await markFirstRun('u1', Number.NaN);
    expect(fs.txSet).not.toHaveBeenCalled();
  });

  it('Restart clears checkmarks and brings the welcome back', async () => {
    await resetGettingStartedProgress('u1');
    expect(fs.setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ finished: {}, welcome: 'pending' })
    );
  });

  it('holds quiet start for a first-run teacher until Essentials are done or a week passes', () => {
    const now = 1_000_000_000;
    expect(isQuietStart({ finished: {} }, now)).toBe(false);
    expect(isQuietStart({ finished: {}, firstSignInAt: now - 1000 }, now)).toBe(
      true
    );
    expect(
      isQuietStart(
        { finished: {}, firstSignInAt: now - 1000, essentialsDoneAt: now },
        now
      )
    ).toBe(false);
    expect(
      isQuietStart({ finished: {}, firstSignInAt: now - QUIET_START_MS }, now)
    ).toBe(false);
  });
});
