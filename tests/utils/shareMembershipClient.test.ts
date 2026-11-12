import { beforeEach, describe, expect, it, vi } from 'vitest';

const callable = vi.fn();
vi.mock('firebase/functions', () => ({ httpsCallable: () => callable }));
vi.mock('@/config/firebase', () => ({ functions: {} }));

import { callShareMembership } from '@/utils/shareMembershipClient';

describe('callShareMembership', () => {
  beforeEach(() => {
    callable.mockReset();
  });

  it('sends the request to shareMembershipV1', async () => {
    callable.mockResolvedValue({ data: { changed: true } });
    await callShareMembership({ action: 'leaveCollection', linkId: 'l' });
    expect(callable).toHaveBeenCalledWith({
      action: 'leaveCollection',
      linkId: 'l',
    });
  });

  it('maps a refusal to the old Firestore wording, keeping the code', async () => {
    callable.mockRejectedValue(
      Object.assign(new Error('notAllowed'), {
        code: 'functions/permission-denied',
        details: { reason: 'notAllowed' },
      })
    );
    const err: unknown = await callShareMembership({
      action: 'joinBoard',
      shareId: 's',
      role: 'viewer',
    }).catch((e: unknown) => e);
    expect((err as Error).message).toBe('Missing or insufficient permissions.');
    // Bare Firestore code, as the old direct writes threw.
    expect((err as { code?: unknown }).code).toBe('permission-denied');
  });

  it('rethrows other errors untouched', async () => {
    const boom = new Error('boom');
    callable.mockRejectedValue(boom);
    await expect(
      callShareMembership({ action: 'leaveBoard', shareId: 's' })
    ).rejects.toBe(boom);
  });
});
