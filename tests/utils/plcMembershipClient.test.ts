// The client wrapper for plcMembershipV1 maps server refusal reasons to the messages the UI already showed.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import {
  callPlcMembership,
  plcMembershipErrorMessage,
} from '@/utils/plcMembershipClient';

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('@/i18n/index', () => ({ default: { t: (key: string) => key } }));

const refusal = (reason: string, code = 'failed-precondition') =>
  Object.assign(new Error(reason), { code, details: { reason } });

describe('plcMembershipErrorMessage', () => {
  it('maps PLC reasons to plc.errors keys', () => {
    expect(plcMembershipErrorMessage(refusal('leadCannotLeave'))).toBe(
      'plc.errors.leadCannotLeave'
    );
  });

  it('keeps the invite wording the accept flow used before', () => {
    expect(plcMembershipErrorMessage(refusal('inviteNotPending'))).toBe(
      'Invitation is no longer pending'
    );
    expect(plcMembershipErrorMessage(refusal('inviteWrongAccount'))).toBe(
      'Invitation is addressed to a different account'
    );
  });

  it('returns null for errors without a known reason', () => {
    expect(plcMembershipErrorMessage(new Error('boom'))).toBeNull();
    expect(plcMembershipErrorMessage(refusal('somethingNew'))).toBeNull();
    expect(plcMembershipErrorMessage(null)).toBeNull();
  });
});

describe('callPlcMembership', () => {
  const fn = vi.fn();
  beforeEach(() => {
    fn.mockReset();
    (httpsCallable as Mock).mockReturnValue(fn);
  });

  it('calls plcMembershipV1 and returns its data', async () => {
    fn.mockResolvedValue({ data: { changed: true, targetName: 'Two' } });
    await expect(
      callPlcMembership({ action: 'leave', plcId: 'p' })
    ).resolves.toEqual({ changed: true, targetName: 'Two' });
    expect(httpsCallable).toHaveBeenCalledWith({}, 'plcMembershipV1');
    expect(fn).toHaveBeenCalledWith({ action: 'leave', plcId: 'p' });
  });

  it('rethrows a mapped refusal with its code, and unknown errors as they are', async () => {
    fn.mockRejectedValueOnce(refusal('notAllowed', 'permission-denied'));
    await expect(
      callPlcMembership({ action: 'leave', plcId: 'p' })
    ).rejects.toMatchObject({
      message: 'Missing or insufficient permissions.',
      code: 'permission-denied',
    });
    const boom = new Error('boom');
    fn.mockRejectedValueOnce(boom);
    await expect(
      callPlcMembership({ action: 'leave', plcId: 'p' })
    ).rejects.toBe(boom);
  });
});
