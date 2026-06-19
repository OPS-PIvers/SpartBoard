/**
 * Tests for usePlcBuildingDirectory — the "PLCs in my building" discovery feed
 * (Wave 1, T5; PRD §2.1, Decision 1.1).
 *
 * Focus:
 *   - Query scoping: filters by `orgId`; adds the `buildingId` equality filter
 *     when the user has a building; bounds with `limit`.
 *   - Exclusion: PLCs the user is already a member of are dropped (they live in
 *     "Your PLCs" instead).
 *   - Metadata projection: each entry is name + active member count only.
 *   - Gating: no org → no listener (empty, settled).
 *
 * Mocking strategy mirrors usePlcs.test.ts — firebase/firestore is fully
 * mocked so `query`/`collection`/`where`/`limit` calls are observable and the
 * snapshot callback is captured to drive the parser.
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
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { usePlcBuildingDirectory } from '@/hooks/usePlcBuildingDirectory';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    __where: { field, op, value },
  })),
  limit: vi.fn((n: number) => ({ __limit: n })),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

interface MockAuth {
  user: { uid: string; email: string } | null;
  orgId: string | null;
  selectedBuildings: string[];
  buildingIds: string[];
}
const useAuthMock = vi.fn<() => MockAuth>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

const mockCollection = collection as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockQuery = query as Mock;
const mockWhere = where as Mock;
const mockLimit = limit as Mock;

const USER_UID = 'me-uid';
const USER_EMAIL = 'me@example.com';
const ORG_ID = 'org-orono';
const BUILDING_ID = 'bldg-oms';

/** Build a fake QuerySnapshot from an array of `{ id, data }` records. */
function fakeSnap(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
      docs.forEach((d) => fn({ id: d.id, data: () => d.data }));
    },
  };
}

/** Capture the snapshot onNext so a test can push a snapshot synchronously. */
function captureSnapshot(): { push: (snap: unknown) => void } {
  let cb: (snap: unknown) => void = () => {
    throw new Error('snapshot callback not captured');
  };
  mockOnSnapshot.mockImplementation((_q, onNext) => {
    cb = onNext;
    return () => undefined;
  });
  return { push: (snap: unknown) => cb(snap) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockOnSnapshot.mockReturnValue(() => undefined);
  useAuthMock.mockReturnValue({
    user: { uid: USER_UID, email: USER_EMAIL },
    orgId: ORG_ID,
    selectedBuildings: [BUILDING_ID],
    buildingIds: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePlcBuildingDirectory — query scoping', () => {
  it('scopes the listen to orgId + buildingId + limit', () => {
    renderHook(() => usePlcBuildingDirectory({ limit: 25 }));

    expect(mockWhere).toHaveBeenCalledWith('orgId', '==', ORG_ID);
    expect(mockWhere).toHaveBeenCalledWith('buildingId', '==', BUILDING_ID);
    expect(mockLimit).toHaveBeenCalledWith(25);
    expect(mockQuery).toHaveBeenCalledWith(
      'plcs',
      { __where: { field: 'orgId', op: '==', value: ORG_ID } },
      { __where: { field: 'buildingId', op: '==', value: BUILDING_ID } },
      { __limit: 25 }
    );
  });

  it('omits the buildingId filter when the user has no building (whole-org directory)', () => {
    useAuthMock.mockReturnValue({
      user: { uid: USER_UID, email: USER_EMAIL },
      orgId: ORG_ID,
      selectedBuildings: [],
      buildingIds: [],
    });

    renderHook(() => usePlcBuildingDirectory());

    expect(mockWhere).toHaveBeenCalledWith('orgId', '==', ORG_ID);
    expect(mockWhere).not.toHaveBeenCalledWith(
      'buildingId',
      '==',
      expect.anything()
    );
  });

  it('falls back to the scoped-admin buildingIds when no UI building is selected', () => {
    useAuthMock.mockReturnValue({
      user: { uid: USER_UID, email: USER_EMAIL },
      orgId: ORG_ID,
      selectedBuildings: [],
      buildingIds: ['bldg-scoped'],
    });

    renderHook(() => usePlcBuildingDirectory());

    expect(mockWhere).toHaveBeenCalledWith('buildingId', '==', 'bldg-scoped');
  });

  it('does not subscribe when the user has no org (gated)', () => {
    useAuthMock.mockReturnValue({
      user: { uid: USER_UID, email: USER_EMAIL },
      orgId: null,
      selectedBuildings: [BUILDING_ID],
      buildingIds: [],
    });

    const { result } = renderHook(() => usePlcBuildingDirectory());

    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.orgId).toBeNull();
  });

  it('does not subscribe when signed out', () => {
    useAuthMock.mockReturnValue({
      user: null,
      orgId: ORG_ID,
      selectedBuildings: [BUILDING_ID],
      buildingIds: [],
    });

    renderHook(() => usePlcBuildingDirectory());

    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('respects the default limit of 50 when none is passed', () => {
    renderHook(() => usePlcBuildingDirectory());
    expect(mockLimit).toHaveBeenCalledWith(50);
  });
});

describe('usePlcBuildingDirectory — result filtering', () => {
  it('excludes PLCs the user is already a member of, keeps the rest', () => {
    const snapshot = captureSnapshot();

    const { result } = renderHook(() => usePlcBuildingDirectory());

    act(() => {
      snapshot.push(
        fakeSnap([
          {
            // The user IS a member here → excluded (lives in "Your PLCs").
            id: 'plc-mine',
            data: {
              name: 'My Team',
              orgId: ORG_ID,
              buildingId: BUILDING_ID,
              memberUids: [USER_UID, 'other-1'],
            },
          },
          {
            // The user is NOT a member → included.
            id: 'plc-neighbor',
            data: {
              name: 'Neighbor Team',
              orgId: ORG_ID,
              buildingId: BUILDING_ID,
              memberUids: ['other-1', 'other-2', 'other-3'],
            },
          },
        ])
      );
    });

    expect(result.current.entries.map((e) => e.id)).toEqual(['plc-neighbor']);
    expect(result.current.loading).toBe(false);
  });

  it('projects each entry to name + active member count only', () => {
    const snapshot = captureSnapshot();

    const { result } = renderHook(() => usePlcBuildingDirectory());

    act(() => {
      snapshot.push(
        fakeSnap([
          {
            id: 'plc-a',
            data: {
              name: 'Algebra PLC',
              orgId: ORG_ID,
              buildingId: BUILDING_ID,
              memberUids: ['u1', 'u2', 'u3'],
              // PII-ish membership map must NOT leak into the projection.
              memberEmails: { u1: 'a@x.com', u2: 'b@x.com', u3: 'c@x.com' },
            },
          },
        ])
      );
    });

    expect(result.current.entries).toEqual([
      {
        id: 'plc-a',
        name: 'Algebra PLC',
        memberCount: 3,
        orgId: ORG_ID,
        buildingId: BUILDING_ID,
      },
    ]);
  });

  it('counts active members from the members map when memberUids is absent', () => {
    const snapshot = captureSnapshot();

    const { result } = renderHook(() => usePlcBuildingDirectory());

    act(() => {
      snapshot.push(
        fakeSnap([
          {
            id: 'plc-map-only',
            data: {
              name: 'Map-only PLC',
              orgId: ORG_ID,
              // No memberUids index — count active members map entries.
              members: {
                u1: { uid: 'u1', role: 'lead', status: 'active' },
                u2: { uid: 'u2', role: 'member', status: 'active' },
                u3: { uid: 'u3', role: 'member', status: 'removed' },
              },
            },
          },
        ])
      );
    });

    expect(result.current.entries[0].memberCount).toBe(2);
  });

  it('drops docs missing name or orgId', () => {
    const snapshot = captureSnapshot();

    const { result } = renderHook(() => usePlcBuildingDirectory());

    act(() => {
      snapshot.push(
        fakeSnap([
          { id: 'no-name', data: { orgId: ORG_ID, memberUids: ['x'] } },
          { id: 'no-org', data: { name: 'Orgless', memberUids: ['x'] } },
          {
            id: 'ok',
            data: { name: 'Good', orgId: ORG_ID, memberUids: ['x'] },
          },
        ])
      );
    });

    expect(result.current.entries.map((e) => e.id)).toEqual(['ok']);
  });

  it('sorts entries by name (case-insensitive)', () => {
    const snapshot = captureSnapshot();

    const { result } = renderHook(() => usePlcBuildingDirectory());

    act(() => {
      snapshot.push(
        fakeSnap([
          {
            id: 'z',
            data: { name: 'Zoology', orgId: ORG_ID, memberUids: ['x'] },
          },
          {
            id: 'a',
            data: { name: 'Algebra', orgId: ORG_ID, memberUids: ['x'] },
          },
        ])
      );
    });

    expect(result.current.entries.map((e) => e.name)).toEqual([
      'Algebra',
      'Zoology',
    ]);
  });

  it('surfaces an empty list (settled) when the snapshot is empty', () => {
    const snapshot = captureSnapshot();

    const { result } = renderHook(() => usePlcBuildingDirectory());

    act(() => {
      snapshot.push(fakeSnap([]));
    });

    expect(result.current.entries).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
