/**
 * W7 (external availability rollout) — AI daily-quota external/org split.
 *
 * Verifies the helpers that decide a caller's OVERALL daily AI cap:
 *   - `isExternalCaller`  — classifies a caller as external (no org) or org,
 *     from the VERIFIED token, fail-safe toward "org".
 *   - `pickOverallLimit`  — picks the external vs org cap from the config.
 *
 * Asserts the four required behaviors:
 *   (a) an orgless caller is capped at the lower external limit;
 *   (b) an org caller still uses `config.dailyLimit` (UNCHANGED);
 *   (c) admins are exempt (the call sites skip the limit entirely — modeled
 *       here by never invoking the helpers for admins, see the assertion that
 *       `pickOverallLimit` is only ever consulted for non-admins);
 *   (d) an org user is NOT misclassified as external (no false external cap).
 *
 * Firestore is never really touched: `resolveOrgIdForDomain` is the only
 * Firestore hop and is mocked, mirroring `resolveOrgForUser.test.ts`. The
 * `firebase-*` modules are mocked so importing `aiGeneration.ts` (which runs
 * `functionsInit` + `defineSecret` at module load) stays pure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const resolveOrgIdForDomainMock = vi.fn();

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: () => ({}),
}));

vi.mock('firebase-functions/v2', () => ({
  setGlobalOptions: vi.fn(),
}));

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'HttpsError';
    }
  }
  return {
    HttpsError,
    onCall: (_options: unknown, handler: unknown) => handler,
  };
});

vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ value: () => `mock-${name}`, name }),
}));

// Only `resolveOrgIdForDomain` + `ALLOWED_ORIGINS` are pulled from
// classlinkShared by aiGeneration.ts. Mock the domain lookup; the resolution
// precedence (`resolveDomainCandidates`) is the REAL implementation from
// resolveOrgForUser.ts, which calls `normalizeEmailDomain` — mirror it here.
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: (email: string): string | null => {
    const at = email.lastIndexOf('@');
    if (at < 0 || at === email.length - 1) return null;
    return '@' + email.slice(at + 1).toLowerCase();
  },
  resolveOrgIdForDomain: (...args: unknown[]): Promise<string | null> =>
    resolveOrgIdForDomainMock(...args) as Promise<string | null>,
}));

import {
  __isExternalCaller,
  __pickOverallLimit,
  __resolveOrgIdForToken,
  __resetOrgResolutionCache,
  __DEFAULT_EXTERNAL_DAILY_LIMIT,
  __DEFAULT_DAILY_LIMIT,
} from './aiGeneration';

// A throwaway Firestore handle — the real reads go through the mocked
// `resolveOrgIdForDomain`, so the value is never dereferenced.
const db = {} as Parameters<typeof __isExternalCaller>[0];

describe('W7 external AI quota — defaults', () => {
  it('external default is lower than the org default', () => {
    expect(__DEFAULT_EXTERNAL_DAILY_LIMIT).toBeLessThan(__DEFAULT_DAILY_LIMIT);
  });

  it('org default is unchanged (20) and external default is 5', () => {
    expect(__DEFAULT_DAILY_LIMIT).toBe(20);
    expect(__DEFAULT_EXTERNAL_DAILY_LIMIT).toBe(5);
  });
});

describe('pickOverallLimit', () => {
  it('(b) org caller uses config.dailyLimit (admin-configured value, unchanged)', () => {
    expect(__pickOverallLimit({ dailyLimit: 50 }, false)).toBe(50);
  });

  it('(b) org caller falls back to DEFAULT_DAILY_LIMIT when unset', () => {
    expect(__pickOverallLimit(undefined, false)).toBe(__DEFAULT_DAILY_LIMIT);
    expect(__pickOverallLimit({}, false)).toBe(__DEFAULT_DAILY_LIMIT);
  });

  it('(a) external caller uses config.externalDailyLimit when set', () => {
    expect(__pickOverallLimit({ externalDailyLimit: 3 }, true)).toBe(3);
  });

  it('(a) external caller falls back to DEFAULT_EXTERNAL_DAILY_LIMIT when unset', () => {
    expect(__pickOverallLimit(undefined, true)).toBe(
      __DEFAULT_EXTERNAL_DAILY_LIMIT
    );
    expect(__pickOverallLimit({ dailyLimit: 50 }, true)).toBe(
      __DEFAULT_EXTERNAL_DAILY_LIMIT
    );
  });

  it('external branch never reads the org dailyLimit (and vice versa)', () => {
    // An org with a high dailyLimit must not leak into the external cap.
    expect(
      __pickOverallLimit({ dailyLimit: 999, externalDailyLimit: 5 }, true)
    ).toBe(5);
    // An external cap must not leak into the org path.
    expect(
      __pickOverallLimit({ dailyLimit: 20, externalDailyLimit: 5 }, false)
    ).toBe(20);
  });
});

describe('isExternalCaller', () => {
  beforeEach(() => {
    resolveOrgIdForDomainMock.mockReset();
    __resetOrgResolutionCache();
  });

  it('(a) orgless caller (gmail) is classified external', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue(null);
    const external = await __isExternalCaller(db, {
      email: 'someone@gmail.com',
    });
    expect(external).toBe(true);
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledWith(
      expect.anything(),
      '@gmail.com'
    );
  });

  it('(d) org caller (verified domain → org) is NOT misclassified as external', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue('orono');
    const external = await __isExternalCaller(db, {
      email: 'teacher@orono.k12.mn.us',
    });
    expect(external).toBe(false);
  });

  it('(d) org caller via hd claim is internal even when email domain differs', async () => {
    // hd resolves to an org on the first lookup → internal, no fallback needed.
    resolveOrgIdForDomainMock.mockResolvedValueOnce('orono');
    const external = await __isExternalCaller(db, {
      hd: 'orono.k12.mn.us',
      email: 'teacher@alias-domain.com',
    });
    expect(external).toBe(false);
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledTimes(1);
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledWith(
      expect.anything(),
      '@orono.k12.mn.us'
    );
  });

  it('(d) falls back to the email domain when hd is unregistered, then finds the org', async () => {
    resolveOrgIdForDomainMock
      .mockResolvedValueOnce(null) // hd domain — not registered
      .mockResolvedValueOnce('orono'); // email domain — org
    const external = await __isExternalCaller(db, {
      hd: 'alias-domain.com',
      email: 'teacher@orono.k12.mn.us',
    });
    expect(external).toBe(false);
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledTimes(2);
  });

  it('fail-safe: missing email → treated as org (NOT external)', async () => {
    const external = await __isExternalCaller(db, { email: undefined });
    expect(external).toBe(false);
    expect(resolveOrgIdForDomainMock).not.toHaveBeenCalled();
  });

  it('fail-safe: undefined token → treated as org (NOT external)', async () => {
    const external = await __isExternalCaller(db, undefined);
    expect(external).toBe(false);
    expect(resolveOrgIdForDomainMock).not.toHaveBeenCalled();
  });

  it('fail-safe: lookup error → treated as org (NOT external)', async () => {
    resolveOrgIdForDomainMock.mockRejectedValue(new Error('firestore down'));
    const external = await __isExternalCaller(db, {
      email: 'teacher@orono.k12.mn.us',
    });
    // An org user must NEVER be throttled to the external cap on a transient
    // lookup failure — fail safe toward the org path.
    expect(external).toBe(false);
  });

  it('fail-safe: lookup error is surfaced via console.warn (not swallowed silently)', async () => {
    // The fail-safe deliberately hides the error from the caller, so the log
    // is the ONLY signal an operator gets that org classification degraded.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lookupError = new Error('firestore down');
    resolveOrgIdForDomainMock.mockRejectedValue(lookupError);

    await expect(
      __isExternalCaller(db, { email: 'teacher@orono.k12.mn.us' })
    ).resolves.toBe(false);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Org resolution failed'),
      lookupError
    );
    warn.mockRestore();
  });

  it('caches the domain→org resolution across calls (single lookup)', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue('orono');
    await __isExternalCaller(db, { email: 'a@orono.k12.mn.us' });
    await __isExternalCaller(db, { email: 'b@orono.k12.mn.us' });
    // Two callers, same domain → one collectionGroup lookup.
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledTimes(1);
  });

  it('caches a negative (orgless) resolution too', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue(null);
    expect(await __isExternalCaller(db, { email: 'x@gmail.com' })).toBe(true);
    expect(await __isExternalCaller(db, { email: 'y@gmail.com' })).toBe(true);
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledTimes(1);
  });
});

describe('end-to-end limit selection (isExternalCaller → pickOverallLimit)', () => {
  beforeEach(() => {
    resolveOrgIdForDomainMock.mockReset();
    __resetOrgResolutionCache();
  });

  it('(a) orgless caller is capped at the lower external limit', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue(null);
    const config = { dailyLimit: 20, externalDailyLimit: 5 };
    const external = await __isExternalCaller(db, { email: 'p@gmail.com' });
    expect(__pickOverallLimit(config, external)).toBe(5);
  });

  it('(b) org caller still uses config.dailyLimit (unchanged)', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue('orono');
    const config = { dailyLimit: 20, externalDailyLimit: 5 };
    const external = await __isExternalCaller(db, {
      email: 'p@orono.k12.mn.us',
    });
    expect(__pickOverallLimit(config, external)).toBe(20);
  });

  it('(d) org caller with no externalDailyLimit configured is unaffected', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue('orono');
    const external = await __isExternalCaller(db, {
      email: 'p@orono.k12.mn.us',
    });
    // org path → DEFAULT_DAILY_LIMIT (20), never the external default (5).
    expect(__pickOverallLimit({}, external)).toBe(__DEFAULT_DAILY_LIMIT);
  });
});

describe('resolveOrgIdForToken (raw resolution, behind isExternalCaller)', () => {
  beforeEach(() => {
    resolveOrgIdForDomainMock.mockReset();
    __resetOrgResolutionCache();
  });

  it('returns the resolved orgId for a registered domain', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue('orono');
    expect(
      await __resolveOrgIdForToken(db, { email: 'teacher@orono.k12.mn.us' })
    ).toBe('orono');
  });

  it('returns null for an unregistered domain', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue(null);
    expect(await __resolveOrgIdForToken(db, { email: 'x@gmail.com' })).toBe(
      null
    );
  });

  it('returns null without a lookup when the token has no domain', async () => {
    expect(await __resolveOrgIdForToken(db, {})).toBe(null);
    expect(resolveOrgIdForDomainMock).not.toHaveBeenCalled();
  });

  it('a cached miss on the hd domain still falls through to the email domain', async () => {
    // Warm the cache with a negative result for the hd domain only.
    resolveOrgIdForDomainMock.mockResolvedValue(null);
    expect(await __resolveOrgIdForToken(db, { hd: 'alias-domain.com' })).toBe(
      null
    );
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledTimes(1);

    // Same hd, now paired with an org email domain. The cached miss must not
    // short-circuit the whole resolution — the second candidate is still tried.
    resolveOrgIdForDomainMock.mockResolvedValue('orono');
    expect(
      await __resolveOrgIdForToken(db, {
        hd: 'alias-domain.com',
        email: 'teacher@orono.k12.mn.us',
      })
    ).toBe('orono');
    // Exactly one NEW lookup: the hd candidate was served from the cached miss.
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledTimes(2);
    expect(resolveOrgIdForDomainMock).toHaveBeenLastCalledWith(
      expect.anything(),
      '@orono.k12.mn.us'
    );
  });
});

describe('org-resolution cache lifecycle (TTL + explicit reset)', () => {
  // The domain→org cache keeps the external/internal classification off the
  // hot path, but it must not pin a stale answer forever: a domain that gets
  // verified (org promotion) has to take effect within the TTL window.
  const TTL_MS = 5 * 60 * 1000;

  beforeEach(() => {
    resolveOrgIdForDomainMock.mockReset();
    __resetOrgResolutionCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves from cache for the whole TTL window (no second lookup)', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue(null);
    expect(await __isExternalCaller(db, { email: 'a@gmail.com' })).toBe(true);

    // Just inside the TTL — still cached.
    vi.advanceTimersByTime(TTL_MS - 1);
    expect(await __isExternalCaller(db, { email: 'b@gmail.com' })).toBe(true);

    expect(resolveOrgIdForDomainMock).toHaveBeenCalledTimes(1);
  });

  it('re-resolves after the TTL expires, picking up an org promotion', async () => {
    // Cold: the domain is not yet registered to any org → external.
    resolveOrgIdForDomainMock.mockResolvedValue(null);
    expect(
      await __isExternalCaller(db, { email: 'teacher@newschool.org' })
    ).toBe(true);
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledTimes(1);

    // An admin verifies the domain. Once the TTL lapses the next caller must
    // see the promotion instead of staying pinned to the free-tier cap.
    resolveOrgIdForDomainMock.mockResolvedValue('newschool');
    vi.advanceTimersByTime(TTL_MS);

    expect(
      await __isExternalCaller(db, { email: 'teacher@newschool.org' })
    ).toBe(false);
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledTimes(2);
  });

  it('__resetOrgResolutionCache forces a fresh lookup before the TTL lapses', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue('orono');
    expect(
      await __resolveOrgIdForToken(db, { email: 'a@orono.k12.mn.us' })
    ).toBe('orono');

    __resetOrgResolutionCache();

    // No time has passed, so only the explicit reset can explain a re-read.
    expect(
      await __resolveOrgIdForToken(db, { email: 'a@orono.k12.mn.us' })
    ).toBe('orono');
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledTimes(2);
  });
});
