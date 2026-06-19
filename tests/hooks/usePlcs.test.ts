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

// Non-React i18n shim — return the key so assertions can match on the key
// instead of the translated copy (and so the test doesn't depend on the EN
// wording).
vi.mock('@/i18n/index', () => ({
  default: { t: (key: string) => key },
}));

const useAuthMock = vi.fn<() => { user: { uid: string } | null }>();
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

const USER_UID = 'user-1';

/**
 * Drive the mocked `runTransaction` against a single fake root doc. Returns
 * the captured `tx.update(...)` payload (or null if the txn fn returned
 * early). `data` is the doc's stored shape; `exists` toggles the not-found
 * branch.
 */
function stubTransaction(
  data: Record<string, unknown> | null,
  opts: { exists?: boolean } = {}
) {
  const exists = opts.exists ?? data !== null;
  const captured: { update: Record<string, unknown> | null } = {
    update: null,
  };
  mockRunTransaction.mockImplementation(
    async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        get: () =>
          Promise.resolve({
            exists: () => exists,
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

// ---------------------------------------------------------------------------
// Membership mutators (T2): members map + memberUids + leadUid + memberEmails
// stay consistent on every write; serverTimestamp() is used; invariants hold.
// ---------------------------------------------------------------------------

const LEAD_UID = 'user-1'; // === USER_UID; the test user is the lead by default
const MEMBER_UID = 'member-2';
const OTHER_UID = 'member-3';

/** A migrated PLC root doc carrying the canonical members map + indexes. */
function basePlcDoc(): Record<string, unknown> {
  return {
    name: 'Test PLC',
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

function render() {
  // Snapshot listener is irrelevant for mutator tests; keep it inert.
  mockOnSnapshot.mockReturnValue(() => undefined);
  return renderHook(() => usePlcs());
}

describe('usePlcs - createPlc writes the members map + indexes', () => {
  it('writes members map, denormalized indexes, and serverTimestamps', async () => {
    useAuthMock.mockReturnValue({
      user: { uid: LEAD_UID, email: 'Lead@X.com', displayName: 'Lead' },
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
    expect(payload.orgId).toBeNull();
    expect(payload.buildingId).toBeNull();
  });
});

describe('usePlcs - transferLead', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { uid: LEAD_UID, email: 'lead@x.com', displayName: 'Lead' },
    } as ReturnType<typeof useAuthMock>);
  });

  it('demotes old lead, promotes target, moves leadUid mirror in lockstep', async () => {
    const captured = stubTransaction(basePlcDoc());
    const { result } = render();

    await act(async () => {
      await result.current.transferLead('plc-1', MEMBER_UID);
    });

    const w = captured.update as Record<string, unknown>;
    expect(w).not.toBeNull();
    // leadUid mirror moved to the target.
    expect(w.leadUid).toBe(MEMBER_UID);
    const members = w.members as Record<string, Record<string, unknown>>;
    // Exactly one lead — the target — and the old lead is now a member.
    expect(members[MEMBER_UID].role).toBe('lead');
    expect(members[LEAD_UID].role).toBe('member');
    const leadCount = Object.values(members).filter(
      (m) => m.role === 'lead'
    ).length;
    expect(leadCount).toBe(1);
    // Membership set is unchanged (transfer reassigns a role).
    expect(w.memberUids).toEqual([LEAD_UID, MEMBER_UID, OTHER_UID]);
    expect(w.updatedAt).toBe(SERVER_TS);
  });

  it('rejects transferring to a non-member', async () => {
    stubTransaction(basePlcDoc());
    const { result } = render();

    await expect(
      act(async () => {
        await result.current.transferLead('plc-1', 'stranger');
      })
    ).rejects.toThrow('plc.errors.targetNotActiveMember');
  });

  it('rejects transferring to a removed member', async () => {
    const data = basePlcDoc();
    (data.members as Record<string, Record<string, unknown>>)[
      MEMBER_UID
    ].status = 'removed';
    stubTransaction(data);
    const { result } = render();

    await expect(
      act(async () => {
        await result.current.transferLead('plc-1', MEMBER_UID);
      })
    ).rejects.toThrow('plc.errors.targetNotActiveMember');
  });
});

describe('usePlcs - setMemberRole', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { uid: LEAD_UID, email: 'lead@x.com', displayName: 'Lead' },
    } as ReturnType<typeof useAuthMock>);
  });

  it('flips a member role in the map, leaving indexes untouched', async () => {
    const captured = stubTransaction(basePlcDoc());
    const { result } = render();

    await act(async () => {
      await result.current.setMemberRole('plc-1', MEMBER_UID, 'coLead');
    });

    const w = captured.update as Record<string, unknown>;
    const members = w.members as Record<string, Record<string, unknown>>;
    expect(members[MEMBER_UID].role).toBe('coLead');
    expect(w.leadUid).toBeUndefined(); // not touched on a role change
    expect(w.memberUids).toBeUndefined();
    // Explicit target pointer for the rules' isChangingMemberRole branch (T6):
    // co-leads' only authorized path needs the changed uid named on the write.
    expect(w.roleChangeUid).toBe(MEMBER_UID);
    expect(w.updatedAt).toBe(SERVER_TS);
  });

  it('rejects demoting the sitting lead (must transfer instead)', async () => {
    stubTransaction(basePlcDoc());
    const { result } = render();

    await expect(
      act(async () => {
        await result.current.setMemberRole('plc-1', LEAD_UID, 'member');
      })
    ).rejects.toThrow('plc.errors.cannotDemoteLead');
  });

  it("rejects promoting to 'lead' via setMemberRole", async () => {
    // 'lead' is rejected before the transaction even reads the doc.
    const { result } = render();

    await expect(
      act(async () => {
        await result.current.setMemberRole('plc-1', MEMBER_UID, 'lead');
      })
    ).rejects.toThrow('plc.errors.cannotDemoteLead');
  });

  it('rejects setting a role on a non-member', async () => {
    stubTransaction(basePlcDoc());
    const { result } = render();

    await expect(
      act(async () => {
        await result.current.setMemberRole('plc-1', 'stranger', 'viewer');
      })
    ).rejects.toThrow('plc.errors.notAMember');
  });
});

describe('usePlcs - removeMember', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { uid: LEAD_UID, email: 'lead@x.com', displayName: 'Lead' },
    } as ReturnType<typeof useAuthMock>);
  });

  it('drops the member from all indexes + flips their status to removed', async () => {
    const captured = stubTransaction(basePlcDoc());
    const { result } = render();

    await act(async () => {
      await result.current.removeMember('plc-1', MEMBER_UID);
    });

    const w = captured.update as Record<string, unknown>;
    const members = w.members as Record<string, Record<string, unknown>>;
    expect(members[MEMBER_UID].status).toBe('removed');
    // Removed member is gone from the denormalized indexes (array-contains
    // list query must no longer return this PLC for them).
    expect(w.memberUids).toEqual([LEAD_UID, OTHER_UID]);
    expect(w.memberEmails).toEqual({
      [LEAD_UID]: 'lead@x.com',
      [OTHER_UID]: 'm3@x.com',
    });
    expect(w.updatedAt).toBe(SERVER_TS);
  });

  it('rejects removing the lead', async () => {
    stubTransaction(basePlcDoc());
    const { result } = render();

    await expect(
      act(async () => {
        await result.current.removeMember('plc-1', LEAD_UID);
      })
    ).rejects.toThrow('plc.errors.leadCannotBeRemoved');
  });
});

describe('usePlcs - leavePlc', () => {
  it('a non-lead member self-removes and stays consistent across indexes', async () => {
    useAuthMock.mockReturnValue({
      user: { uid: MEMBER_UID, email: 'm2@x.com', displayName: 'Two' },
    } as ReturnType<typeof useAuthMock>);
    const captured = stubTransaction(basePlcDoc());
    const { result } = render();

    await act(async () => {
      await result.current.leavePlc('plc-1');
    });

    const w = captured.update as Record<string, unknown>;
    const members = w.members as Record<string, Record<string, unknown>>;
    expect(members[MEMBER_UID].status).toBe('removed');
    expect(w.memberUids).toEqual([LEAD_UID, OTHER_UID]);
    expect(members[LEAD_UID].role).toBe('lead'); // leadership untouched
    expect(w.updatedAt).toBe(SERVER_TS);
  });

  it('rejects the lead leaving (must transfer first)', async () => {
    useAuthMock.mockReturnValue({
      user: { uid: LEAD_UID, email: 'lead@x.com', displayName: 'Lead' },
    } as ReturnType<typeof useAuthMock>);
    stubTransaction(basePlcDoc());
    const { result } = render();

    await expect(
      act(async () => {
        await result.current.leavePlc('plc-1');
      })
    ).rejects.toThrow('plc.errors.leadCannotLeave');
  });
});

describe('usePlcs - legacy (un-migrated) PLC backfills the members map', () => {
  it('transferLead on an arrays-only PLC writes a full members map', async () => {
    useAuthMock.mockReturnValue({
      user: { uid: LEAD_UID, email: 'lead@x.com', displayName: 'Lead' },
    } as ReturnType<typeof useAuthMock>);
    // Legacy doc: NO members map, only the denormalized arrays.
    const legacy: Record<string, unknown> = {
      name: 'Legacy PLC',
      leadUid: LEAD_UID,
      memberUids: [LEAD_UID, MEMBER_UID],
      memberEmails: { [LEAD_UID]: 'lead@x.com', [MEMBER_UID]: 'm2@x.com' },
      createdAt: 1,
      updatedAt: 1,
    };
    const captured = stubTransaction(legacy);
    const { result } = render();

    await act(async () => {
      await result.current.transferLead('plc-legacy', MEMBER_UID);
    });

    const w = captured.update as Record<string, unknown>;
    const members = w.members as Record<string, Record<string, unknown>>;
    // The map was synthesized from the arrays and the role moved.
    expect(members[MEMBER_UID].role).toBe('lead');
    expect(members[LEAD_UID].role).toBe('member');
    expect(members[LEAD_UID].status).toBe('active');
    expect(w.leadUid).toBe(MEMBER_UID);
    // Synthesized joins get a serverTimestamp so they aren't frozen at 0.
    expect(members[MEMBER_UID].joinedAt).toBe(SERVER_TS);
  });
});
