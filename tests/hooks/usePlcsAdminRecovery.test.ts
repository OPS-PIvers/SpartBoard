/**
 * Tests for the admin-recovery mutator `adminReassignLead` on usePlcs
 * (Decision 3.4 / W4-T11). The mutator is the client half of the
 * `isAdminManagingPlc` rules branch (W4-T1): an in-org SITE ADMIN — who is NOT
 * a member of the PLC — reassigns the `lead` role to an existing active member.
 *
 * What these tests pin (the payload the rule's closed diff accepts):
 *   - the write moves `leadUid` + the canonical `members` lead role in
 *     LOCKSTEP (incoming → 'lead', outgoing → 'member'),
 *   - the membership SET is unchanged (recovery reassigns, never adds/drops),
 *   - the write carries ONLY the keys `isAdminManagingPlc` admits
 *     (`leadUid` / `members` / `memberUids` / `memberEmails` / `updatedAt`) —
 *     no `roleChangeUid` pointer (which would bust the rule's `hasOnly`) and no
 *     fire-and-forget activity event (a non-member admin can't write activity),
 *   - it is usable with NO member context (a non-member admin caller),
 *   - it rejects a non-member / removed target and a no-op reassign to the
 *     sitting lead.
 *
 * Mocking strategy mirrors usePlcs.test.ts.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { usePlcs } from '@/hooks/usePlcs';
import { writePlcActivityEvent } from '@/utils/plcActivity';

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
const mockWriteActivity = writePlcActivityEvent as Mock;

// The recovering admin — deliberately NOT a member of the PLC under test.
const ADMIN_UID = 'admin-9';
const LEAD_UID = 'lead-1';
const MEMBER_UID = 'member-2';
const OTHER_UID = 'member-3';

/** A migrated, org-scoped PLC root doc the admin does not belong to. */
function basePlcDoc(): Record<string, unknown> {
  return {
    name: 'Abandoned PLC',
    orgId: 'org-1',
    leadUid: LEAD_UID,
    memberUids: [LEAD_UID, MEMBER_UID, OTHER_UID],
    memberEmails: {
      [LEAD_UID]: 'lead@x.com',
      [MEMBER_UID]: 'm2@x.com',
      [OTHER_UID]: 'm3@x.com',
    },
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
      [OTHER_UID]: {
        uid: OTHER_UID,
        email: 'm3@x.com',
        displayName: 'Three',
        role: 'member',
        joinedAt: 300,
        status: 'active',
      },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

function stubTransaction(data: Record<string, unknown> | null) {
  const exists = data !== null;
  const captured: { update: Record<string, unknown> | null } = { update: null };
  mockRunTransaction.mockImplementation(
    async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        get: () =>
          Promise.resolve({ exists: () => exists, data: () => data ?? {} }),
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

beforeEach(() => {
  vi.clearAllMocks();
  mockServerTimestamp.mockReturnValue(SERVER_TS);
  // The recovering admin is signed in but is NOT a member of the PLC.
  useAuthMock.mockReturnValue({
    user: { uid: ADMIN_UID, email: 'admin@x.com', displayName: 'Admin' },
  } as ReturnType<typeof useAuthMock>);
});

describe('usePlcs - adminReassignLead (admin recovery)', () => {
  it('writes the lockstep payload the isAdminManagingPlc rule accepts', async () => {
    const captured = stubTransaction(basePlcDoc());
    const { result } = render();

    await act(async () => {
      await result.current.adminReassignLead('plc-1', MEMBER_UID);
    });

    const w = captured.update as Record<string, unknown>;
    expect(w).not.toBeNull();

    // leadUid mirror moved to the target.
    expect(w.leadUid).toBe(MEMBER_UID);

    // members map: exactly one lead (the target); old lead demoted to member.
    const members = w.members as Record<string, Record<string, unknown>>;
    expect(members[MEMBER_UID].role).toBe('lead');
    expect(members[LEAD_UID].role).toBe('member');
    const leadCount = Object.values(members).filter(
      (m) => m.role === 'lead'
    ).length;
    expect(leadCount).toBe(1);

    // Membership SET unchanged (recovery reassigns; never adds/drops).
    expect(w.memberUids).toEqual([LEAD_UID, MEMBER_UID, OTHER_UID]);
    expect(w.memberEmails).toEqual({
      [LEAD_UID]: 'lead@x.com',
      [MEMBER_UID]: 'm2@x.com',
      [OTHER_UID]: 'm3@x.com',
    });
    expect(w.updatedAt).toBe(SERVER_TS);

    // The write carries ONLY the keys isAdminManagingPlc admits — crucially NO
    // `roleChangeUid` pointer (would bust the rule's closed `hasOnly` diff).
    expect(Object.keys(w).sort()).toEqual(
      ['leadUid', 'memberEmails', 'memberUids', 'members', 'updatedAt'].sort()
    );
    expect(w).not.toHaveProperty('roleChangeUid');
    expect(w).not.toHaveProperty('removeMemberUid');
    expect(w).not.toHaveProperty('name');
    expect(w).not.toHaveProperty('orgId');

    // No activity event — a non-member admin write to the activity
    // subcollection is denied by rules, so the mutator deliberately emits none.
    expect(mockWriteActivity).not.toHaveBeenCalled();
  });

  it('is usable by a non-member admin (no membership context required)', async () => {
    // The acting user (ADMIN_UID) does not appear anywhere in the PLC doc.
    const captured = stubTransaction(basePlcDoc());
    const { result } = render();

    await act(async () => {
      await result.current.adminReassignLead('plc-1', OTHER_UID);
    });

    const w = captured.update as Record<string, unknown>;
    expect(w.leadUid).toBe(OTHER_UID);
    const members = w.members as Record<string, Record<string, unknown>>;
    expect(members[OTHER_UID].role).toBe('lead');
    expect(members[LEAD_UID].role).toBe('member');
  });

  it('rejects reassigning to a non-member', async () => {
    stubTransaction(basePlcDoc());
    const { result } = render();

    await expect(
      act(async () => {
        await result.current.adminReassignLead('plc-1', 'stranger');
      })
    ).rejects.toThrow('plc.errors.targetNotActiveMember');
  });

  it('rejects reassigning to a removed member', async () => {
    const data = basePlcDoc();
    (data.members as Record<string, Record<string, unknown>>)[
      MEMBER_UID
    ].status = 'removed';
    stubTransaction(data);
    const { result } = render();

    await expect(
      act(async () => {
        await result.current.adminReassignLead('plc-1', MEMBER_UID);
      })
    ).rejects.toThrow('plc.errors.targetNotActiveMember');
  });

  it('rejects a no-op reassign to the sitting lead (rule needs newLead != oldLead)', async () => {
    stubTransaction(basePlcDoc());
    const { result } = render();

    await expect(
      act(async () => {
        await result.current.adminReassignLead('plc-1', LEAD_UID);
      })
    ).rejects.toThrow('plc.errors.alreadyLead');
  });

  it('rejects when the PLC does not exist', async () => {
    stubTransaction(null);
    const { result } = render();

    await expect(
      act(async () => {
        await result.current.adminReassignLead('plc-missing', MEMBER_UID);
      })
    ).rejects.toThrow('plc.errors.plcNotFound');
  });

  it('rejects when signed out', async () => {
    useAuthMock.mockReturnValue({ user: null });
    stubTransaction(basePlcDoc());
    const { result } = render();

    await expect(
      act(async () => {
        await result.current.adminReassignLead('plc-1', MEMBER_UID);
      })
    ).rejects.toThrow('plc.errors.notSignedIn');
  });
});
