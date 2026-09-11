import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { usePlcs } from '@/hooks/usePlcs';

const SERVER_TS = { __serverTimestamp: true };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'plcs'),
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  onSnapshot: vi.fn(() => () => undefined),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    __where: { field, op, value },
  })),
  limit: vi.fn((n: number) => ({ __limit: n })),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => SERVER_TS),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

vi.mock('@/utils/plcActivity', () => ({
  writePlcActivityEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/i18n/index', () => ({
  default: { t: (key: string) => key },
}));

const useAuthMock = vi.fn<() => { user: { uid: string } | null }>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

const mockOnSnapshot = onSnapshot as Mock;
const mockRunTransaction = runTransaction as Mock;
const mockServerTimestamp = serverTimestamp as Mock;

const ADMIN_UID = 'admin-9';
const LEAD_UID = 'lead-1';
const MEMBER_UID = 'member-2';
const NEW_UID = 'teacher-7';

function basePlcDoc(): Record<string, unknown> {
  return {
    name: 'ELA 9',
    orgId: 'org-1',
    leadUid: LEAD_UID,
    memberUids: [LEAD_UID, MEMBER_UID],
    memberEmails: { [LEAD_UID]: 'lead@x.com', [MEMBER_UID]: 'm2@x.com' },
    members: {
      [LEAD_UID]: {
        uid: LEAD_UID,
        email: 'lead@x.com',
        displayName: 'Lead',
        role: 'lead',
        joinedAt: 100,
        status: 'active',
      },
      [MEMBER_UID]: {
        uid: MEMBER_UID,
        email: 'm2@x.com',
        displayName: 'Two',
        role: 'member',
        joinedAt: 200,
        status: 'active',
      },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

function stubTransaction(data: Record<string, unknown> | null) {
  const captured: { update: Record<string, unknown> | null } = { update: null };
  mockRunTransaction.mockImplementation(
    async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        get: () =>
          Promise.resolve({
            exists: () => data !== null,
            data: () => data ?? {},
          }),
        update: (_ref: unknown, payload: Record<string, unknown>) => {
          captured.update = payload;
        },
      };
      return fn(tx);
    }
  );
  return captured;
}

function render() {
  mockOnSnapshot.mockReturnValue(() => undefined);
  return renderHook(() => usePlcs({ asAdmin: true }));
}

const target = { uid: NEW_UID, email: 'Jarrett@X.com', displayName: 'Jarrett' };

beforeEach(() => {
  vi.clearAllMocks();
  mockServerTimestamp.mockReturnValue(SERVER_TS);
  useAuthMock.mockReturnValue({ user: { uid: ADMIN_UID } });
});

describe('usePlcs - adminSetMember', () => {
  it('adds an org teacher as an active member with the rule pointer set', async () => {
    const captured = stubTransaction(basePlcDoc());
    const { result } = render();
    await act(async () => {
      await result.current.adminSetMember('plc-1', target, 'member');
    });
    const update = captured.update as Record<string, unknown>;
    const members = update.members as Record<string, Record<string, unknown>>;
    expect(members[NEW_UID]).toEqual({
      uid: NEW_UID,
      email: 'jarrett@x.com',
      displayName: 'Jarrett',
      role: 'member',
      joinedAt: SERVER_TS,
      status: 'active',
    });
    expect(update.memberUids).toEqual([LEAD_UID, MEMBER_UID, NEW_UID]);
    expect(update.memberEmails).toEqual({
      [LEAD_UID]: 'lead@x.com',
      [MEMBER_UID]: 'm2@x.com',
      [NEW_UID]: 'jarrett@x.com',
    });
    expect(update.adminMemberUid).toBe(NEW_UID);
    expect(update.updatedAt).toBe(SERVER_TS);
  });

  it('re-roles an existing member without resetting joinedAt', async () => {
    const captured = stubTransaction(basePlcDoc());
    const { result } = render();
    await act(async () => {
      await result.current.adminSetMember(
        'plc-1',
        { uid: MEMBER_UID, email: 'm2@x.com', displayName: 'Two' },
        'coLead'
      );
    });
    const members = (captured.update as Record<string, unknown>)
      .members as Record<string, Record<string, unknown>>;
    expect(members[MEMBER_UID]).toMatchObject({
      role: 'coLead',
      joinedAt: 200,
    });
    expect((captured.update as Record<string, unknown>).memberUids).toEqual([
      LEAD_UID,
      MEMBER_UID,
    ]);
  });

  it('refuses to touch the lead', async () => {
    stubTransaction(basePlcDoc());
    const { result } = render();
    await expect(
      result.current.adminSetMember(
        'plc-1',
        { uid: LEAD_UID, email: 'lead@x.com', displayName: 'Lead' },
        'member'
      )
    ).rejects.toThrow('plc.errors.cannotDemoteLead');
  });
});

describe('usePlcs - adminRemoveMember', () => {
  it('flips the member to removed and drops them from the indexes', async () => {
    const captured = stubTransaction(basePlcDoc());
    const { result } = render();
    await act(async () => {
      await result.current.adminRemoveMember('plc-1', MEMBER_UID);
    });
    const update = captured.update as Record<string, unknown>;
    const members = update.members as Record<string, Record<string, unknown>>;
    expect(members[MEMBER_UID]).toMatchObject({ status: 'removed' });
    expect(update.memberUids).toEqual([LEAD_UID]);
    expect(update.memberEmails).toEqual({ [LEAD_UID]: 'lead@x.com' });
    expect(update.adminMemberUid).toBe(MEMBER_UID);
  });

  it('refuses to remove the lead', async () => {
    stubTransaction(basePlcDoc());
    const { result } = render();
    await expect(
      result.current.adminRemoveMember('plc-1', LEAD_UID)
    ).rejects.toThrow('plc.errors.leadCannotBeRemoved');
  });

  it('refuses a uid that is not an active member', async () => {
    stubTransaction(basePlcDoc());
    const { result } = render();
    await expect(
      result.current.adminRemoveMember('plc-1', 'nobody')
    ).rejects.toThrow('plc.errors.targetNotActiveMember');
  });
});
