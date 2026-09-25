import { describe, it, expect, vi } from 'vitest';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

vi.mock('firebase-admin', () => ({
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => 'ts' },
  }),
}));

import {
  paperQuotaDay,
  preparePaperPageCharge,
  readPaperHandwritingQuota,
  splitPagesByQuota,
} from './paperHandwritingQuota';

const NOW = Date.parse('2026-09-25T15:00:00Z');
const USAGE = 'ai_usage/t1_paper-handwritten-responses_2026-09-25';
const OVERALL = 'ai_usage/t1_2026-09-25';
const JOB = 'users/t1/paper_transcription_jobs/scan1_3_1_0';

function setup(seed: Record<string, StubData> = {}) {
  const stub = makeStubFirestore(seed);
  return { ...stub, fs: stub.db as unknown as Firestore };
}

async function charge(s: ReturnType<typeof setup>) {
  return s.fs.runTransaction(async (tx: Transaction) => {
    const c = await preparePaperPageCharge(tx, s.fs, {
      uid: 't1',
      jobRef: s.fs.doc(JOB),
      nowMs: NOW,
    });
    c.apply();
    return c.alreadyCharged;
  });
}

describe('readPaperHandwritingQuota', () => {
  it('defaults to 300 pages and the standard tier', async () => {
    const q = await readPaperHandwritingQuota(setup().fs, {
      uid: 't1',
      isAdmin: false,
      nowMs: NOW,
    });
    expect(q).toEqual({
      geminiDisabled: false,
      unlimited: false,
      limit: 300,
      used: 0,
      remaining: 300,
      modelTier: 'standard',
    });
  });

  it('reads the configured limit, tier and today’s pages without writing', async () => {
    const s = setup({
      'global_permissions/paper-handwritten-responses': {
        enabled: true,
        config: { dailyLimit: 10, modelTier: 'advanced' },
      },
      [USAGE]: { count: 7 },
      [OVERALL]: { count: 19 },
    });
    const q = await readPaperHandwritingQuota(s.fs, {
      uid: 't1',
      isAdmin: false,
      nowMs: NOW,
    });
    expect(q).toMatchObject({
      limit: 10,
      used: 7,
      remaining: 3,
      modelTier: 'advanced',
    });
    expect(s.writes).toEqual([]);
  });

  it('never goes below zero remaining', async () => {
    const s = setup({
      'global_permissions/paper-handwritten-responses': {
        config: { dailyLimit: 2 },
      },
      [USAGE]: { count: 5 },
    });
    const q = await readPaperHandwritingQuota(s.fs, {
      uid: 't1',
      isAdmin: false,
      nowMs: NOW,
    });
    expect(q.remaining).toBe(0);
  });

  it('is unlimited for admins and when the limit is switched off', async () => {
    const s = setup({
      'global_permissions/paper-handwritten-responses': {
        config: { dailyLimit: 1 },
      },
      [USAGE]: { count: 50 },
    });
    const admin = await readPaperHandwritingQuota(s.fs, {
      uid: 't1',
      isAdmin: true,
      nowMs: NOW,
    });
    expect(admin).toMatchObject({ unlimited: true, remaining: Infinity });

    const off = setup({
      'global_permissions/paper-handwritten-responses': {
        config: { dailyLimit: 1, dailyLimitEnabled: false },
      },
      [USAGE]: { count: 50 },
    });
    const q = await readPaperHandwritingQuota(off.fs, {
      uid: 't1',
      isAdmin: false,
      nowMs: NOW,
    });
    expect(q.unlimited).toBe(true);
  });

  it('reports the gemini-functions kill switch, admins included', async () => {
    const s = setup({
      'global_permissions/gemini-functions': { enabled: false },
    });
    const q = await readPaperHandwritingQuota(s.fs, {
      uid: 't1',
      isAdmin: true,
      nowMs: NOW,
    });
    expect(q.geminiDisabled).toBe(true);
    expect(splitPagesByQuota(q, 4)).toEqual({ allowed: 0, overQuota: 4 });
  });

  it('ignores an unknown tier and a malformed limit', async () => {
    const s = setup({
      'global_permissions/paper-handwritten-responses': {
        config: { dailyLimit: 'lots', modelTier: 'turbo' },
      },
    });
    const q = await readPaperHandwritingQuota(s.fs, {
      uid: 't1',
      isAdmin: false,
      nowMs: NOW,
    });
    expect(q).toMatchObject({ limit: 300, modelTier: 'standard' });
  });
});

describe('splitPagesByQuota', () => {
  const base = {
    geminiDisabled: false,
    unlimited: false,
    limit: 5,
    used: 3,
    remaining: 2,
    modelTier: 'standard' as const,
  };
  it('splits pages at the remaining count', () => {
    expect(splitPagesByQuota(base, 5)).toEqual({ allowed: 2, overQuota: 3 });
    expect(splitPagesByQuota(base, 1)).toEqual({ allowed: 1, overQuota: 0 });
  });
  it('allows everything when unlimited', () => {
    expect(
      splitPagesByQuota({ ...base, unlimited: true, remaining: Infinity }, 40)
    ).toEqual({ allowed: 40, overQuota: 0 });
  });
});

describe('preparePaperPageCharge', () => {
  it('charges one page and marks the job', async () => {
    const s = setup({ [JOB]: { charged: false, status: 'running' } });
    expect(await charge(s)).toBe(false);
    expect(s.get(USAGE)).toMatchObject({
      count: 1,
      featureId: 'paper-handwritten-responses',
    });
    expect(s.get(JOB)).toMatchObject({ charged: true, updatedAt: NOW });
  });

  it('is idempotent under replay', async () => {
    const s = setup({ [JOB]: { charged: false }, [USAGE]: { count: 4 } });
    await charge(s);
    expect(await charge(s)).toBe(true);
    await charge(s);
    expect(s.get(USAGE)?.count).toBe(5);
  });

  it('leaves the overall AI counter untouched', async () => {
    const s = setup({ [JOB]: { charged: false }, [OVERALL]: { count: 12 } });
    await charge(s);
    expect(s.get(OVERALL)).toEqual({ count: 12 });
    expect(s.writes.map((w) => w.path).sort()).toEqual([JOB, USAGE].sort());
  });

  it('counts by the UTC day', () => {
    expect(paperQuotaDay(Date.parse('2026-09-25T23:59:59Z'))).toBe(
      '2026-09-25'
    );
    expect(paperQuotaDay(Date.parse('2026-09-26T00:00:00Z'))).toBe(
      '2026-09-26'
    );
  });
});
