import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { doc, onSnapshot } from 'firebase/firestore';
import { usePresetSubEmails } from '@/hooks/usePresetSubEmails';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
}));

const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;

// onSnapshot handler capture: each subscription pushes its
// { next, error, unsub } so individual tests can drive the
// success/error callback of a specific listener and assert teardown.
interface Listener {
  next: (snap: unknown) => void;
  error: (err: { code?: string; message?: string }) => void;
  unsub: Mock;
}
let listeners: Listener[];

function lastListener(): Listener {
  return listeners[listeners.length - 1];
}

// Fake single-doc snapshot: the hook reads `snap.data()` only. A missing
// doc resolves to `undefined` (Firestore returns undefined for absent docs).
const fakeDocSnap = (data: Record<string, unknown> | undefined) => ({
  data: () => data,
});

beforeEach(() => {
  vi.clearAllMocks();
  listeners = [];
  mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockOnSnapshot.mockImplementation(
    (
      _ref: unknown,
      next: (snap: unknown) => void,
      error: (err: { code?: string; message?: string }) => void
    ) => {
      const unsub = vi.fn();
      listeners.push({ next, error, unsub });
      return unsub;
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePresetSubEmails — listener wiring', () => {
  it('targets preset_sub_emails/{canonical} and is loading until the first snapshot', () => {
    const { result } = renderHook(() => usePresetSubEmails('high'));

    expect(result.current).toEqual({ emails: [], loading: true });
    expect(mockDoc).toHaveBeenCalledWith(
      { __mock: 'db' },
      'preset_sub_emails',
      'high'
    );
    expect(listeners).toHaveLength(1);
  });

  it('canonicalizes a legacy building ID before targeting the doc', () => {
    renderHook(() => usePresetSubEmails('orono-high-school'));

    // canonicalBuildingId('orono-high-school') === 'high'
    expect(mockDoc).toHaveBeenCalledWith(
      { __mock: 'db' },
      'preset_sub_emails',
      'high'
    );
  });

  it('does not subscribe and reports not-loading when buildingId is empty', () => {
    const { result } = renderHook(() => usePresetSubEmails(''));

    expect(result.current).toEqual({ emails: [], loading: false });
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});

describe('usePresetSubEmails — snapshot mapping', () => {
  it('exposes the emails array and clears loading on the first snapshot', () => {
    const { result } = renderHook(() => usePresetSubEmails('high'));
    act(() => {
      lastListener().next(
        fakeDocSnap({
          emails: ['ohssub@orono.k12.mn.us', 'sub2@orono.k12.mn.us'],
          updatedAt: 123,
          updatedBy: 'admin',
        })
      );
    });

    expect(result.current).toEqual({
      emails: ['ohssub@orono.k12.mn.us', 'sub2@orono.k12.mn.us'],
      loading: false,
    });
  });

  it('resolves a missing doc (no data) to an empty list', () => {
    const { result } = renderHook(() => usePresetSubEmails('high'));
    act(() => {
      lastListener().next(fakeDocSnap(undefined));
    });

    expect(result.current).toEqual({ emails: [], loading: false });
  });

  it('resolves a doc with a non-array emails field to an empty list', () => {
    const { result } = renderHook(() => usePresetSubEmails('high'));
    act(() => {
      lastListener().next(
        fakeDocSnap({ emails: 'not-an-array', updatedAt: 1 })
      );
    });

    expect(result.current).toEqual({ emails: [], loading: false });
  });

  it('filters out non-string entries from the emails array', () => {
    const { result } = renderHook(() => usePresetSubEmails('high'));
    act(() => {
      lastListener().next(
        fakeDocSnap({
          emails: ['keep@x.org', 42, null, undefined, { x: 1 }, 'also@x.org'],
        })
      );
    });

    expect(result.current).toEqual({
      emails: ['keep@x.org', 'also@x.org'],
      loading: false,
    });
  });
});

describe('usePresetSubEmails — error handling', () => {
  it('logs the snapshot error and resolves to an empty, not-loading list', () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const err = { code: 'permission-denied' };

    const { result } = renderHook(() => usePresetSubEmails('high'));
    act(() => {
      lastListener().error(err);
    });

    expect(result.current).toEqual({ emails: [], loading: false });
    expect(consoleSpy).toHaveBeenCalledWith(
      '[usePresetSubEmails] snapshot error:',
      err
    );
  });
});

describe('usePresetSubEmails — building change & cleanup', () => {
  it('tears down the prior listener and re-enters loading when the building changes', () => {
    const { result, rerender } = renderHook(
      ({ b }: { b: string }) => usePresetSubEmails(b),
      { initialProps: { b: 'high' } }
    );
    act(() => {
      lastListener().next(fakeDocSnap({ emails: ['a@x.org'] }));
    });
    expect(result.current.loading).toBe(false);

    const firstUnsub = listeners[0].unsub;
    rerender({ b: 'middle' });

    // Old listener torn down; the stale snapshot's building (`high`) no longer
    // matches the new canonical (`middle`), so the hook re-enters loading.
    expect(firstUnsub).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ emails: [], loading: true });
    expect(mockDoc).toHaveBeenLastCalledWith(
      { __mock: 'db' },
      'preset_sub_emails',
      'middle'
    );
    expect(listeners).toHaveLength(2);
  });

  it('keeps the same canonical target when a legacy alias resolves to the current building', () => {
    const { result, rerender } = renderHook(
      ({ b }: { b: string }) => usePresetSubEmails(b),
      { initialProps: { b: 'high' } }
    );
    act(() => {
      lastListener().next(fakeDocSnap({ emails: ['a@x.org'] }));
    });

    // 'orono-high-school' canonicalizes to 'high' — same building, so the
    // cached snapshot still applies and the hook stays resolved.
    rerender({ b: 'orono-high-school' });

    expect(result.current).toEqual({ emails: ['a@x.org'], loading: false });
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => usePresetSubEmails('high'));
    const unsub = listeners[0].unsub;
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
