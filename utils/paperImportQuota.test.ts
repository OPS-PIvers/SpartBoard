import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({ db: {} }));

import { readPaperImportQuota, type ReadDocData } from './paperImportQuota';

const NOW = Date.UTC(2026, 8, 25, 12);

const reader =
  (docs: Record<string, Record<string, unknown>>): ReadDocData =>
  (collection, id) =>
    Promise.resolve(docs[`${collection}/${id}`]);

describe('readPaperImportQuota', () => {
  it('subtracts today’s pages from the configured limit', async () => {
    const quota = await readPaperImportQuota(
      reader({
        'global_permissions/paper-handwritten-responses': {
          config: { dailyLimit: 50 },
        },
        'ai_usage/u1_paper-handwritten-responses_2026-09-25': { count: 45 },
      }),
      { uid: 'u1', isAdmin: false, nowMs: NOW }
    );
    expect(quota).toEqual({ disabled: false, remaining: 5 });
  });

  it('defaults to 300 pages and never goes below zero', async () => {
    expect(
      await readPaperImportQuota(reader({}), {
        uid: 'u1',
        isAdmin: false,
        nowMs: NOW,
      })
    ).toEqual({ disabled: false, remaining: 300 });
    expect(
      await readPaperImportQuota(
        reader({
          'ai_usage/u1_paper-handwritten-responses_2026-09-25': { count: 400 },
        }),
        { uid: 'u1', isAdmin: false, nowMs: NOW }
      )
    ).toEqual({ disabled: false, remaining: 0 });
  });

  it('admins and a switched-off limit are unlimited', async () => {
    const admin = await readPaperImportQuota(reader({}), {
      uid: 'u1',
      isAdmin: true,
      nowMs: NOW,
    });
    expect(admin.remaining).toBe(Infinity);
    const off = await readPaperImportQuota(
      reader({
        'global_permissions/paper-handwritten-responses': {
          config: { dailyLimit: 10, dailyLimitEnabled: false },
        },
      }),
      { uid: 'u1', isAdmin: false, nowMs: NOW }
    );
    expect(off.remaining).toBe(Infinity);
  });

  it('reports the Gemini kill switch', async () => {
    const quota = await readPaperImportQuota(
      reader({ 'global_permissions/gemini-functions': { enabled: false } }),
      { uid: 'u1', isAdmin: true, nowMs: NOW }
    );
    expect(quota.disabled).toBe(true);
  });
});
