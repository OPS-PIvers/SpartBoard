/**
 * Subscription-wiring tests for usePlcs.
 *
 * Focus: the admin read path added so the admin "push resource to specific
 * PLCs" picker can enumerate ALL PLCs, not just the ones the current admin
 * happens to be a member of.
 *
 * Mocking strategy mirrors usePlcAssignmentIndex.test.ts — firebase/firestore
 * is fully mocked so `query`/`collection`/`where` calls are observable, and
 * the snapshot callback is captured to drive the parser.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  where,
} from 'firebase/firestore';
import { usePlcs } from '@/hooks/usePlcs';
import { writePlcActivityEvent } from '@/utils/plcActivity';
import { callPlcMembership } from '@/utils/plcMembershipClient';

// A distinct sentinel object so tests can assert serverTimestamp() was used
// (rather than a Date.now() number) for every PLC write.
const SERVER_TS = { __serverTimestamp: true };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    __where: { field, op, value },
  })),
  orderBy: vi.fn((field: string, dir?: string) => ({
    __orderBy: { field, dir },
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

// Membership mutators emit fire-and-forget activity events (Decision 2.2);
// mock the writer so the tests can assert the emission without Firestore.
vi.mock('@/utils/plcMembershipClient', () => ({
  callPlcMembership: vi.fn(),
}));

vi.mock('@/utils/plcActivity', () => ({
  writePlcActivityEvent: vi.fn(() => Promise.resolve()),
}));

// Non-React i18n shim — return the key so assertions can match on the key
// instead of the translated copy (and so the test doesn't depend on the EN
// wording).
vi.mock('@/i18n/index', () => ({
  default: { t: (key: string) => key },
}));

const useAuthMock = vi.fn<
  () => {
    user: { uid: string; email?: string } | null;
    orgId?: string | null;
    roleId?: string | null;
    userRoles?: { superAdmins?: string[] } | null;
  }
>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

const mockCollection = collection as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockQuery = query as Mock;
const mockWhere = where as Mock;
const mockOrderBy = orderBy as Mock;
const mockLimit = limit as Mock;
const mockGetDoc = getDoc as Mock;
const mockDoc = doc as Mock;
const mockRunTransaction = runTransaction as Mock;
const mockSetDoc = setDoc as Mock;
const mockWriteActivity = writePlcActivityEvent as Mock;
const mockCallMembership = callPlcMembership as Mock;

const USER_UID = 'user-1';
const USER_EMAIL = 'admin@orono.k12.mn.us';
const ORG_ID = 'org-orono';

beforeEach(() => {
  vi.clearAllMocks();
  // Resolve collection refs to an addressable string so assertions can verify
  // which path the listener attached to.
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockOnSnapshot.mockReturnValue(() => undefined);
  // Resolve doc refs to an addressable string so getDoc-fallback assertions
  // can verify the path.
  mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  useAuthMock.mockReturnValue({ user: { uid: USER_UID } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePlcs - subscription wiring', () => {
  // Admin-mode tests below need a caller isSuperAdminActor() accepts, since
  // the unfiltered "browse every PLC" query is now only authorized for a
  // genuine site-wide super admin (see the org-scoped admin describe block
  // further down for the non-super building_admin variant).
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { uid: USER_UID, email: USER_EMAIL },
      orgId: ORG_ID,
      userRoles: { superAdmins: [USER_EMAIL] },
    });
  });

  it('member mode (default) scopes the listen to memberUids array-contains uid', () => {
    renderHook(() => usePlcs());

    // The membership filter must be applied so a teacher only sees PLCs they
    // belong to.
    expect(mockWhere).toHaveBeenCalledWith(
      'memberUids',
      'array-contains',
      USER_UID
    );
    expect(mockQuery).toHaveBeenCalledWith('plcs', {
      __where: { field: 'memberUids', op: 'array-contains', value: USER_UID },
    });
    // Member mode is naturally bounded by membership — no extra limit/orderBy.
    expect(mockOrderBy).not.toHaveBeenCalled();
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it('admin mode subscribes to the WHOLE /plcs collection (no membership filter)', () => {
    renderHook(() => usePlcs({ asAdmin: true }));

    // Admins must enumerate every PLC regardless of membership — so NO
    // `where('memberUids', ...)` constraint may be applied.
    expect(mockWhere).not.toHaveBeenCalled();
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  });

  it('admin mode bounds the whole-collection listen with limit only (no server orderBy)', () => {
    renderHook(() => usePlcs({ asAdmin: true }));

    // The unbounded admin listen is capped so it can't stream the entire
    // collection. F21: we do NOT `orderBy('name')` on the server (that would
    // add an index dependency); the snapshot handler sorts by name
    // client-side instead, so the query relies only on the automatic
    // `__name__` index.
    expect(mockOrderBy).not.toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(500);
    expect(mockQuery).toHaveBeenCalledWith('plcs', { __limit: 500 });
  });

  it('skips the listener when signed out', () => {
    useAuthMock.mockReturnValue({ user: null });

    renderHook(() => usePlcs({ asAdmin: true }));

    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('parses + sorts PLCs returned by the admin snapshot', () => {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcs({ asAdmin: true }));

    act(() => {
      cb({
        forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
          fn({
            id: 'plc-z',
            data: () => ({
              name: 'Zoology PLC',
              leadUid: 'lead-z',
              memberUids: ['lead-z'],
              memberEmails: { 'lead-z': 'z@x.com' },
              createdAt: 1,
              updatedAt: 2,
            }),
          });
          fn({
            id: 'plc-a',
            data: () => ({
              name: 'Algebra PLC',
              leadUid: 'lead-a',
              memberUids: ['lead-a'],
              memberEmails: { 'lead-a': 'a@x.com' },
              createdAt: 3,
              updatedAt: 4,
            }),
          });
        },
      });
    });

    // Admin sees BOTH PLCs even though they're a member of neither, sorted by
    // name (the hook's stable client-side sort).
    expect(result.current.plcs.map((p) => p.id)).toEqual(['plc-a', 'plc-z']);
    expect(result.current.loading).toBe(false);
  });

  it('parses autoRoster and known addedBy values only', () => {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcs({ asAdmin: true }));
    const member = (uid: string, addedBy: unknown) => ({
      uid,
      email: `${uid}@x.com`,
      displayName: uid,
      role: 'viewer',
      joinedAt: 1,
      status: 'active',
      addedBy,
    });
    act(() => {
      cb({
        forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
          fn({
            id: 'plc-b',
            data: () => ({
              name: 'Building',
              groupType: 'building',
              autoRoster: true,
              leadUid: 'a',
              memberUids: ['a', 'b', 'c'],
              members: {
                a: { ...member('a', 'admin'), role: 'lead' },
                b: member('b', 'autoRoster'),
                c: member('c', 'nope'),
              },
              createdAt: 1,
              updatedAt: 2,
            }),
          });
          fn({
            id: 'plc-p',
            data: () => ({
              name: 'Plain',
              autoRoster: 'yes',
              leadUid: 'z',
              memberUids: ['z'],
              createdAt: 1,
              updatedAt: 2,
            }),
          });
        },
      });
    });
    const [building, plain] = result.current.plcs;
    expect(building.autoRoster).toBe(true);
    expect(building.members?.a.addedBy).toBe('admin');
    expect(building.members?.b.addedBy).toBe('autoRoster');
    expect(building.members?.c).not.toHaveProperty('addedBy');
    expect(plain.autoRoster).toBeUndefined();
  });

  it('sets error when the snapshot fails (no silent empty list)', () => {
    let errCb: (err: unknown) => void = () => {
      throw new Error('error callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, _onNext, onError) => {
      errCb = onError as (err: unknown) => void;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcs({ asAdmin: true }));

    act(() => {
      errCb(new Error('permission-denied'));
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('permission-denied');
    expect(result.current.loading).toBe(false);
  });

  it('clears a prior error when a later snapshot recovers', () => {
    let nextCb: (snap: unknown) => void = () => undefined;
    let errCb: (err: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext, onError) => {
      nextCb = onNext as (snap: unknown) => void;
      errCb = onError as (err: unknown) => void;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcs({ asAdmin: true }));

    act(() => {
      errCb(new Error('transient'));
    });
    expect(result.current.error).toBeInstanceOf(Error);

    act(() => {
      nextCb({ forEach: () => undefined });
    });
    expect(result.current.error).toBeNull();
  });

  it('defaults error to null before any snapshot resolves', () => {
    const { result } = renderHook(() => usePlcs({ asAdmin: true }));
    expect(result.current.error).toBeNull();
  });
});

// A non-super admin's rules branch requires isOrgMember(resource.data.orgId),
// which Firestore can only prove for a query filtered on orgId — the
// site-wide unfiltered listen above is authorized for a super admin only.
describe('usePlcs - admin mode for an org-scoped (non-super) admin', () => {
  it("scopes the admin listen to the caller's own orgId instead of the whole collection", () => {
    useAuthMock.mockReturnValue({
      user: { uid: USER_UID, email: USER_EMAIL },
      orgId: ORG_ID,
      userRoles: { superAdmins: [] },
    });

    renderHook(() => usePlcs({ asAdmin: true }));

    expect(mockWhere).toHaveBeenCalledWith('orgId', '==', ORG_ID);
    expect(mockLimit).toHaveBeenCalledWith(500);
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  });

  it('skips the listener entirely for an org-less non-super admin (no query the rules could ever authorize)', () => {
    useAuthMock.mockReturnValue({
      user: { uid: USER_UID, email: USER_EMAIL },
      orgId: null,
      userRoles: { superAdmins: [] },
    });

    renderHook(() => usePlcs({ asAdmin: true }));

    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});

describe('usePlcs - getPlcSharedSheetUrl caching (F10)', () => {
  // Helper: render the hook and drive its snapshot to seed `plcs` state with
  // a single PLC carrying the given sharedSheetUrl.
  function renderWithPlc(sharedSheetUrl: string | null) {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });

    const rendered = renderHook(() => usePlcs());

    act(() => {
      cb({
        forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
          fn({
            id: 'plc-1',
            data: () => ({
              name: 'Algebra PLC',
              leadUid: 'lead-1',
              memberUids: ['lead-1', USER_UID],
              memberEmails: { 'lead-1': 'lead@x.com' },
              ...(sharedSheetUrl != null ? { sharedSheetUrl } : {}),
              createdAt: 1,
              updatedAt: 2,
            }),
          });
        },
      });
    });

    return rendered;
  }

  it('reads sharedSheetUrl from live snapshot state WITHOUT a redundant getDoc', async () => {
    const { result } = renderWithPlc('https://sheet/abc');

    let url: string | null = null;
    await act(async () => {
      url = await result.current.getPlcSharedSheetUrl('plc-1');
    });

    // Cached path: the value comes straight from the subscribed snapshot.
    expect(url).toBe('https://sheet/abc');
    // The whole point of F10 — no extra Firestore read on the hot path.
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it('returns null (no getDoc) when the cached PLC has no sharedSheetUrl', async () => {
    const { result } = renderWithPlc(null);

    let url: string | null = 'unset';
    await act(async () => {
      url = await result.current.getPlcSharedSheetUrl('plc-1');
    });

    expect(url).toBeNull();
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it('falls back to a one-off getDoc when the PLC is not in local state', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ sharedSheetUrl: 'https://sheet/fallback' }),
    });

    const { result } = renderWithPlc('https://sheet/abc');

    let url: string | null = null;
    await act(async () => {
      // 'plc-other' is not in the seeded snapshot — slow path.
      url = await result.current.getPlcSharedSheetUrl('plc-other');
    });

    expect(url).toBe('https://sheet/fallback');
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(mockDoc).toHaveBeenCalledWith({ __mock: 'db' }, 'plcs', 'plc-other');
  });
});

const LEAD_UID = 'user-1'; // === USER_UID; the test user is the lead by default
const MEMBER_UID = 'member-2';

function render() {
  // Snapshot listener is irrelevant for mutator tests; keep it inert.
  mockOnSnapshot.mockReturnValue(() => undefined);
  return renderHook(() => usePlcs());
}

describe('usePlcs - createPlc writes the members map + indexes', () => {
  it('writes members map, denormalized indexes, and serverTimestamps', async () => {
    // An org member (orgId set) — createPlc requires a non-null orgId (W2).
    // Building resolution is exercised separately below; here neither a UI
    // selection nor an org-assigned building is present, so buildingId is null.
    useAuthMock.mockReturnValue({
      user: { uid: LEAD_UID, email: 'Lead@X.com', displayName: 'Lead' },
      orgId: 'orono',
    } as ReturnType<typeof useAuthMock>);
    mockCollection.mockReturnValue('plcs');
    mockDoc.mockReturnValue('plcs/new-id');
    mockSetDoc.mockResolvedValue(undefined);

    const { result } = render();
    await act(async () => {
      await result.current.createPlc('My PLC');
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const payload = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
    // Lead is the sole member, leader, and appears in every index.
    expect(payload.leadUid).toBe(LEAD_UID);
    expect(payload.memberUids).toEqual([LEAD_UID]);
    expect(payload.memberEmails).toEqual({ [LEAD_UID]: 'lead@x.com' });
    const members = payload.members as Record<string, Record<string, unknown>>;
    expect(members[LEAD_UID].role).toBe('lead');
    expect(members[LEAD_UID].status).toBe('active');
    expect(members[LEAD_UID].email).toBe('lead@x.com'); // lowercased
    expect(members[LEAD_UID].joinedAt).toBe(SERVER_TS);
    // All timestamps are serverTimestamp(), not Date.now() numbers.
    expect(payload.createdAt).toBe(SERVER_TS);
    expect(payload.updatedAt).toBe(SERVER_TS);
    expect(payload.orgId).toBe('orono');
    // No UI-selected or org-assigned building ⇒ untenanted building.
    expect(payload.buildingId).toBeNull();
  });

  it('writes the section switches a frozen layout turns off', async () => {
    useAuthMock.mockReturnValue({
      user: { uid: LEAD_UID, email: 'Lead@X.com', displayName: 'Lead' },
      orgId: 'orono',
    } as ReturnType<typeof useAuthMock>);
    mockCollection.mockReturnValue('plcs');
    mockDoc.mockReturnValue('plcs/new-id');
    mockSetDoc.mockResolvedValue(undefined);

    const { result } = render();
    await act(async () => {
      await result.current.createPlc('Dept', 'department', {
        pages: [
          { id: 'hub', enabled: true },
          { id: 'docs', enabled: false },
          { id: 'assessments', enabled: true },
        ],
        landing: 'hub',
        cards: [],
        hero: { mode: 'default' },
      });
    });

    const payload = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.features).toEqual({ notes: false });
  });

  it('refuses to create an untenanted PLC for a no-org caller (W2)', async () => {
    // A fully-resolved no-org caller: createPlc is defense-in-depth and must
    // reject rather than write an org-less PLC. The hook destructures
    // `orgId = null`, so omitting orgId from the mock reproduces the real
    // no-org case. The sync throw inside the async callback rejects its promise.
    useAuthMock.mockReturnValue({
      user: { uid: LEAD_UID, email: 'Lead@X.com', displayName: 'Lead' },
    } as ReturnType<typeof useAuthMock>);
    mockCollection.mockReturnValue('plcs');
    mockDoc.mockReturnValue('plcs/new-id');
    mockSetDoc.mockResolvedValue(undefined);

    const { result } = render();

    await expect(
      act(async () => {
        await result.current.createPlc('My PLC');
      })
    ).rejects.toThrow('plc.errors.orgRequired');

    // No Firestore write happened — the guard fired before setDoc.
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('inherits the creator org + building so the PLC is discoverable', async () => {
    // Creator carries org membership + buildings — the new PLC must stamp
    // orgId and the resolved building (explicit UI selection wins over the
    // org-assigned building) so it appears in the building directory at once.
    useAuthMock.mockReturnValue({
      user: { uid: LEAD_UID, email: 'Lead@X.com', displayName: 'Lead' },
      orgId: 'orono',
      selectedBuildings: ['high'],
      buildingIds: ['middle'],
    } as ReturnType<typeof useAuthMock>);
    mockCollection.mockReturnValue('plcs');
    mockDoc.mockReturnValue('plcs/new-id');
    mockSetDoc.mockResolvedValue(undefined);

    const { result } = render();
    await act(async () => {
      await result.current.createPlc('My PLC');
    });

    const payload = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.orgId).toBe('orono');
    expect(payload.buildingId).toBe('high');
  });

  it('falls back to the org-assigned building when none is UI-selected', async () => {
    useAuthMock.mockReturnValue({
      user: { uid: LEAD_UID, email: 'Lead@X.com', displayName: 'Lead' },
      orgId: 'orono',
      selectedBuildings: [],
      buildingIds: ['middle'],
    } as ReturnType<typeof useAuthMock>);
    mockCollection.mockReturnValue('plcs');
    mockDoc.mockReturnValue('plcs/new-id');
    mockSetDoc.mockResolvedValue(undefined);

    const { result } = render();
    await act(async () => {
      await result.current.createPlc('My PLC');
    });

    const payload = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.orgId).toBe('orono');
    expect(payload.buildingId).toBe('middle');
  });
});

describe('usePlcs - membership changes go through plcMembershipV1', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { uid: LEAD_UID, email: 'lead@x.com', displayName: 'Lead' },
    } as ReturnType<typeof useAuthMock>);
    mockCallMembership.mockResolvedValue({ changed: true, targetName: 'Two' });
  });

  it('transferLead sends the target and logs a role change', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.transferLead('plc-1', MEMBER_UID);
    });
    expect(mockCallMembership).toHaveBeenCalledWith({
      action: 'transferLead',
      plcId: 'plc-1',
      uid: MEMBER_UID,
    });
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(mockWriteActivity).toHaveBeenCalledWith('plc-1', {
      type: 'role_changed',
      actorUid: LEAD_UID,
      actorName: 'Lead',
      targetType: 'member',
      targetId: MEMBER_UID,
      targetTitle: 'Two',
    });
  });

  it('a no-op transfer logs nothing', async () => {
    mockCallMembership.mockResolvedValue({ changed: false });
    const { result } = render();
    await act(async () => {
      await result.current.transferLead('plc-1', LEAD_UID);
    });
    expect(mockWriteActivity).not.toHaveBeenCalled();
  });

  it('setMemberRole sends the role and logs a role change', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.setMemberRole('plc-1', MEMBER_UID, 'viewer');
    });
    expect(mockCallMembership).toHaveBeenCalledWith({
      action: 'setRole',
      plcId: 'plc-1',
      uid: MEMBER_UID,
      role: 'viewer',
    });
    expect(mockWriteActivity).toHaveBeenCalledWith(
      'plc-1',
      expect.objectContaining({ type: 'role_changed', targetTitle: 'Two' })
    );
  });

  it("refuses 'lead' through setMemberRole without calling the server", async () => {
    const { result } = render();
    await expect(
      result.current.setMemberRole('plc-1', MEMBER_UID, 'lead')
    ).rejects.toThrow('plc.errors.cannotDemoteLead');
    expect(mockCallMembership).not.toHaveBeenCalled();
  });

  it('removeMember logs member_left with the name the server returns', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.removeMember('plc-1', MEMBER_UID);
    });
    expect(mockCallMembership).toHaveBeenCalledWith({
      action: 'removeMember',
      plcId: 'plc-1',
      uid: MEMBER_UID,
    });
    expect(mockWriteActivity).toHaveBeenCalledWith(
      'plc-1',
      expect.objectContaining({
        type: 'member_left',
        targetId: MEMBER_UID,
        targetTitle: 'Two',
      })
    );
  });

  it('removeMember that changed nothing logs nothing', async () => {
    mockCallMembership.mockResolvedValue({ changed: false });
    const { result } = render();
    await act(async () => {
      await result.current.removeMember('plc-1', 'ghost');
    });
    expect(mockWriteActivity).not.toHaveBeenCalled();
  });

  it('leavePlc sends a leave for the caller', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.leavePlc('plc-1');
    });
    expect(mockCallMembership).toHaveBeenCalledWith({
      action: 'leave',
      plcId: 'plc-1',
    });
  });

  it('a server refusal reaches the caller and logs nothing', async () => {
    mockCallMembership.mockRejectedValue(
      new Error('plc.errors.leadCannotLeave')
    );
    const { result } = render();
    await expect(result.current.leavePlc('plc-1')).rejects.toThrow(
      'plc.errors.leadCannotLeave'
    );
    expect(mockWriteActivity).not.toHaveBeenCalled();
  });

  it('admin actions send their payloads and log nothing', async () => {
    const { result } = render();
    const target = { uid: 'new', email: 'new@x.com', displayName: 'New' };
    await act(async () => {
      await result.current.adminReassignLead('plc-1', MEMBER_UID);
      await result.current.adminSetMember('plc-1', target, 'coLead');
      await result.current.adminRemoveMember('plc-1', MEMBER_UID);
    });
    expect(mockCallMembership.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      { action: 'adminReassignLead', plcId: 'plc-1', uid: MEMBER_UID },
      { action: 'adminSetMember', plcId: 'plc-1', target, role: 'coLead' },
      { action: 'adminRemoveMember', plcId: 'plc-1', uid: MEMBER_UID },
    ]);
    expect(mockWriteActivity).not.toHaveBeenCalled();
  });

  it('signed out: member actions do nothing, admin actions throw', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = render();
    await act(async () => {
      await result.current.leavePlc('plc-1');
    });
    await expect(
      result.current.adminReassignLead('plc-1', MEMBER_UID)
    ).rejects.toThrow('plc.errors.notSignedIn');
    expect(mockCallMembership).not.toHaveBeenCalled();
  });
});
