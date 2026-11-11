// Admin member edits on usePlcs: each one is a single plcMembershipV1 call, checked server-side.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { runTransaction } from 'firebase/firestore';
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
const target = {
  uid: 'teacher-7',
  email: 'Jarrett@X.com',
  displayName: 'Jarrett',
};

const render = () => renderHook(() => usePlcs({ asAdmin: true }));

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ user: { uid: 'admin-9' } });
  mockCall.mockResolvedValue({ changed: true });
});

describe('usePlcs - adminSetMember', () => {
  it('sends the target and role as given; the server normalizes the email', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.adminSetMember('plc-1', target, 'member');
    });
    expect(mockCall).toHaveBeenCalledWith({
      action: 'adminSetMember',
      plcId: 'plc-1',
      target,
      role: 'member',
    });
    expect(runTransaction).not.toHaveBeenCalled();
    expect(writePlcActivityEvent).not.toHaveBeenCalled();
  });

  it('passes a server refusal through', async () => {
    mockCall.mockRejectedValue(new Error('plc.errors.cannotDemoteLead'));
    const { result } = render();
    await expect(
      result.current.adminSetMember('plc-1', target, 'viewer')
    ).rejects.toThrow('plc.errors.cannotDemoteLead');
  });

  it('throws when signed out', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = render();
    await expect(
      result.current.adminSetMember('plc-1', target, 'member')
    ).rejects.toThrow('plc.errors.notSignedIn');
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe('usePlcs - adminRemoveMember', () => {
  it('sends the uid to remove', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.adminRemoveMember('plc-1', 'member-2');
    });
    expect(mockCall).toHaveBeenCalledWith({
      action: 'adminRemoveMember',
      plcId: 'plc-1',
      uid: 'member-2',
    });
  });

  it('passes a server refusal through', async () => {
    mockCall.mockRejectedValue(new Error('plc.errors.leadCannotBeRemoved'));
    const { result } = render();
    await expect(
      result.current.adminRemoveMember('plc-1', 'lead-1')
    ).rejects.toThrow('plc.errors.leadCannotBeRemoved');
  });
});
