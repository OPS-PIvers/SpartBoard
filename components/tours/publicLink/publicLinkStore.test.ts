import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicLinkRecord } from './publicLinkModel';

vi.mock('@/config/firebase', () => ({ db: {}, storage: {} }));

import { turnOffPublicLink, turnOnPublicLink } from './publicLinkStore';

const record: PublicLinkRecord = {
  token: 'a'.repeat(32),
  fingerprint: 'v1',
  kind: 'web',
  confirmedBy: 'admin@x.org',
  confirmedAt: 1,
  pictures: {},
};

afterEach(() => {
  delete window.__publicLinkDevSeed;
});

describe('the public link address', () => {
  it('stays the same when the link is switched off and on again', async () => {
    window.__publicLinkDevSeed = { records: { t1: record } };
    await turnOffPublicLink('t1');
    const off = window.__publicLinkDevSeed.records?.t1;
    expect(off?.token).toBe(record.token);
    expect(off?.off?.reason).toBe('admin');
    const on = await turnOnPublicLink('t1', {
      fingerprint: 'v2',
      kind: 'web',
      pictures: {},
      email: 'Admin@x.org',
      previous: off ?? null,
    });
    expect(on.token).toBe(record.token);
    expect(on.off).toBeUndefined();
  });

  it('stays the same after a picture change is confirmed again', async () => {
    const paused = { ...record, off: { reason: 'pictures' as const, at: 2 } };
    window.__publicLinkDevSeed = { records: { t1: paused } };
    const on = await turnOnPublicLink('t1', {
      fingerprint: 'v2',
      kind: 'web',
      pictures: {},
      email: 'admin@x.org',
      previous: paused,
    });
    expect(on.token).toBe(record.token);
  });
});
