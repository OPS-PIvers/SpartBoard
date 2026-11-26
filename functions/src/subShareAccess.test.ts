import { describe, expect, it, vi } from 'vitest';

vi.mock('./featureGrant', () => ({
  isGlobalFeatureGranted: vi.fn(() => Promise.resolve(true)),
}));

import { verifySubShare } from './subShareAccess';
import type * as admin from './firebaseAdmin';

const NOW = 1_800_000_000_000;
const SUB = { email: 'sub@orono.k12.mn.us', uid: 'sub-uid' };

function fakeDb(share: Record<string, unknown>): admin.firestore.Firestore {
  return {
    doc: () => ({
      get: () => Promise.resolve({ exists: true, data: () => share }),
    }),
  } as unknown as admin.firestore.Firestore;
}

const liveShare = (extra: Record<string, unknown> = {}) => ({
  intendedMode: 'substitute',
  expiresAt: NOW + 60_000,
  subEmails: [SUB.email],
  hostUid: 'host-uid',
  ...extra,
});

describe('verifySubShare', () => {
  it('passes a live share that names the sub', async () => {
    await expect(
      verifySubShare(fakeDb(liveShare()), 's1', SUB, NOW)
    ).resolves.toMatchObject({ hostUid: 'host-uid' });
  });

  it('turns a sub away before the first day', async () => {
    await expect(
      verifySubShare(
        fakeDb(liveShare({ availableFrom: NOW + 1 })),
        's1',
        SUB,
        NOW
      )
    ).rejects.toThrow('That share is not open yet.');
  });

  it('lets the sub in once the first day has started', async () => {
    await expect(
      verifySubShare(fakeDb(liveShare({ availableFrom: NOW })), 's1', SUB, NOW)
    ).resolves.toMatchObject({ expiresAt: NOW + 60_000 });
  });
});
