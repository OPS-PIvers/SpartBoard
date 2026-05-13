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
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { usePlcOverviewLayout } from '@/hooks/usePlcOverviewLayout';
import { DEFAULT_PLC_OVERVIEW_LAYOUT } from '@/types';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

const useAuthMock = vi.fn<() => { user: { uid: string } | null }>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockSetDoc = setDoc as Mock;

const USER_UID = 'user-1';
const PLC_ID = 'plc-1';

beforeEach(() => {
  vi.clearAllMocks();
  mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockSetDoc.mockResolvedValue(undefined);
  useAuthMock.mockReturnValue({ user: { uid: USER_UID } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePlcOverviewLayout — listener wiring', () => {
  it('listens at users/{uid}/plc_layouts/{plcId}', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    renderHook(() => usePlcOverviewLayout(PLC_ID));
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
    expect(mockOnSnapshot.mock.calls[0]?.[0]).toBe(
      `users/${USER_UID}/plc_layouts/${PLC_ID}`
    );
  });

  it('skips the listener when plcId is null', () => {
    renderHook(() => usePlcOverviewLayout(null));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('skips the listener when the user is signed out', () => {
    useAuthMock.mockReturnValue({ user: null });
    renderHook(() => usePlcOverviewLayout(PLC_ID));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});

describe('usePlcOverviewLayout — default layout when no doc exists', () => {
  it('returns the default layout when the snapshot reports the doc does not exist', () => {
    let snapCb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_ref, onNext) => {
      snapCb = onNext;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcOverviewLayout(PLC_ID));

    act(() => {
      snapCb({ exists: () => false, data: () => undefined });
    });

    expect(result.current.layout.tiles).toEqual(
      DEFAULT_PLC_OVERVIEW_LAYOUT.tiles
    );
    expect(result.current.loading).toBe(false);
  });
});

describe('usePlcOverviewLayout — parse + merge', () => {
  it('drops malformed tile entries and appends missing default tiles', () => {
    let snapCb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_ref, onNext) => {
      snapCb = onNext;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcOverviewLayout(PLC_ID));

    act(() => {
      snapCb({
        exists: () => true,
        data: () => ({
          tiles: [
            // Valid persisted tile — kept.
            { kind: 'todos', size: 'lg' },
            // Malformed (bad size) — dropped.
            { kind: 'notes', size: 'huge' },
            // Malformed (unknown kind) — dropped.
            { kind: 'mystery', size: 'sm' },
          ],
          updatedAt: 100,
        }),
      });
    });

    const kinds = result.current.layout.tiles.map((t) => t.kind);
    // The persisted `todos` tile is preserved at the front; the rest of
    // the default tiles are appended in default order.
    expect(kinds[0]).toBe('todos');
    // Every default tile kind should still be represented (merge appends
    // anything missing). This is the "newly added tile auto-appears"
    // contract — without it, adding a tile kind in code would require a
    // forced layout reset for every existing user.
    for (const fallback of DEFAULT_PLC_OVERVIEW_LAYOUT.tiles) {
      expect(kinds).toContain(fallback.kind);
    }
  });
});

describe('usePlcOverviewLayout — debounced write', () => {
  it('debounces consecutive updateLayout calls into a single setDoc', () => {
    vi.useFakeTimers();
    let snapCb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_ref, onNext) => {
      snapCb = onNext;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcOverviewLayout(PLC_ID));

    // Deliver an initial snapshot so writes are unblocked.
    act(() => {
      snapCb({ exists: () => false, data: () => undefined });
    });

    act(() => {
      result.current.updateLayout({
        tiles: [{ kind: 'todos', size: 'sm' }],
        updatedAt: 1,
      });
      result.current.updateLayout({
        tiles: [{ kind: 'todos', size: 'md-wide' }],
        updatedAt: 2,
      });
      result.current.updateLayout({
        tiles: [{ kind: 'todos', size: 'lg' }],
        updatedAt: 3,
      });
    });

    // Only the last call should fire after the debounce window.
    expect(mockSetDoc).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const writtenLayout = mockSetDoc.mock.calls[0]?.[1] as {
      tiles: Array<{ size: string }>;
    };
    expect(writtenLayout.tiles[0]?.size).toBe('lg');
  });
});

describe('usePlcOverviewLayout — reset', () => {
  it('resetLayout writes the default layout immediately (no debounce)', async () => {
    let snapCb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_ref, onNext) => {
      snapCb = onNext;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcOverviewLayout(PLC_ID));

    // Deliver an initial snapshot so resetLayout is allowed to write.
    act(() => {
      snapCb({ exists: () => false, data: () => undefined });
    });

    await act(async () => {
      await result.current.resetLayout();
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const written = mockSetDoc.mock.calls[0]?.[1] as {
      tiles: Array<{ kind: string }>;
    };
    expect(written.tiles.map((t) => t.kind)).toEqual(
      DEFAULT_PLC_OVERVIEW_LAYOUT.tiles.map((t) => t.kind)
    );
  });
});

describe('usePlcOverviewLayout — snapshot error guards writes', () => {
  it('does not call setDoc when updateLayout fires before any snapshot arrives', () => {
    vi.useFakeTimers();
    mockOnSnapshot.mockReturnValue(() => undefined);

    const { result } = renderHook(() => usePlcOverviewLayout(PLC_ID));

    act(() => {
      result.current.updateLayout({
        tiles: [{ kind: 'todos', size: 'lg' }],
        updatedAt: 1,
      });
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    // No snapshot has arrived — the displayed layout may be the default
    // placeholder, so persisting would overwrite the user's real layout.
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('does not call setDoc when the only snapshot delivered was an error', () => {
    vi.useFakeTimers();
    let errCb: (err: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_ref, _onNext, onErr) => {
      errCb = onErr;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcOverviewLayout(PLC_ID));

    act(() => {
      errCb(new Error('permission-denied'));
    });

    act(() => {
      result.current.updateLayout({
        tiles: [{ kind: 'todos', size: 'lg' }],
        updatedAt: 1,
      });
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('clears error and allows writes after a successful snapshot recovers', () => {
    vi.useFakeTimers();
    let snapCb: (snap: unknown) => void = () => undefined;
    let errCb: (err: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_ref, onNext, onErr) => {
      snapCb = onNext;
      errCb = onErr;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcOverviewLayout(PLC_ID));

    act(() => {
      errCb(new Error('transient'));
    });
    expect(result.current.error).toBeInstanceOf(Error);

    act(() => {
      snapCb({ exists: () => false, data: () => undefined });
    });
    expect(result.current.error).toBeNull();

    act(() => {
      result.current.updateLayout({
        tiles: [{ kind: 'todos', size: 'lg' }],
        updatedAt: 1,
      });
      vi.advanceTimersByTime(600);
    });
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });
});
