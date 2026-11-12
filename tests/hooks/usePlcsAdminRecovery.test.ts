// Admin recovery on usePlcs: adminReassignLead is one plcMembershipV1 call; the server checks admin and org.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePlcs } from '@/hooks/usePlcs';
import { callPlcMembership } from '@/utils/plcMembershipClient';
import { writePlcActivityEvent } from '@/utils/plcActivity';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'plcs'),
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  onSnapshot: vi.fn(() => () => undefined),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  where: vi.fn(),
  limit: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/utils/plcMembershipClient', () => ({ callPlcMembership: vi.fn() }));
vi.mock('@/utils/plcActivity', () => ({
  writePlcActivityEvent: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/i18n/index', () => ({ default: { t: (key: string) => key } }));

const useAuthMock = vi.fn<() => { user: { uid: string } | null }>();
vi.mock('@/context/useAuth', () => ({ useAuth: () => useAuthMock() }));

const mockCall = callPlcMembership as Mock;
const render = () => renderHook(() => usePlcs({ asAdmin: true }));

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ user: { uid: 'admin-9' } });
  mockCall.mockResolvedValue({ changed: true });
});

describe('usePlcs - adminReassignLead (admin recovery)', () => {
  it('sends the new lead and logs no activity (a non-member admin cannot write it)', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.adminReassignLead('plc-1', 'member-2');
    });
    expect(mockCall).toHaveBeenCalledWith({
      action: 'adminReassignLead',
      plcId: 'plc-1',
      uid: 'member-2',
    });
    expect(writePlcActivityEvent).not.toHaveBeenCalled();
  });

  it('passes the server refusals through', async () => {
    const { result } = render();
    for (const key of [
      'plc.errors.targetNotActiveMember',
      'plc.errors.alreadyLead',
      'plc.errors.plcNotFound',
    ]) {
      mockCall.mockRejectedValueOnce(new Error(key));
      await expect(
        result.current.adminReassignLead('plc-1', 'x')
      ).rejects.toThrow(key);
    }
  });

  it('throws when signed out', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = render();
    await expect(
      result.current.adminReassignLead('plc-1', 'member-2')
    ).rejects.toThrow('plc.errors.notSignedIn');
    expect(mockCall).not.toHaveBeenCalled();
  });
});
