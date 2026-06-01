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
import { collection, onSnapshot, query } from 'firebase/firestore';
import { useStarterPacks } from '@/hooks/useStarterPacks';
import type {
  StarterPack,
  WidgetData,
  WidgetType,
  AddWidgetOverrides,
} from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  // The hook only ever calls `query(ref)` with no extra constraints, so the
  // mock returns the ref untouched — that lets us assert the collection path
  // straight off the `onSnapshot` call.
  query: vi.fn((ref: unknown) => ref),
  onSnapshot: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

const mockCollection = collection as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockQuery = query as Mock;

const USER_UID = 'user-1';

// appId is resolved inside the hook from import.meta.env; recompute it here
// with the identical expression so the path assertions stay correct even if
// the test environment injects a Firebase app id.
const appId =
  String(import.meta.env.VITE_FIREBASE_APP_ID ?? '') ||
  String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '') ||
  'spart-board';
const PUBLIC_PATH = ['artifacts', appId, 'public', 'data', 'starterPacks'].join(
  '/'
);
const userPath = (uid: string) =>
  ['artifacts', appId, 'users', uid, 'starterPacks'].join('/');

// useStarterPacks iterates with `snapshot.forEach`, so the fake snapshot
// exposes a forEach that hands each entry an `id` and a `data()` getter.
const fakeSnap = (docs: Array<{ id: string; data: Record<string, unknown> }>) =>
  ({
    forEach: (fn: (d: { id: string; data: () => unknown }) => void) =>
      docs.forEach((d) => fn({ id: d.id, data: () => d.data })),
  }) as never;

// Captures each onSnapshot subscription so individual tests can drive the
// success/error callbacks and assert teardown.
type Handler = {
  ref: unknown;
  onNext: (snap: unknown) => void;
  onError: (err: unknown) => void;
  unsub: Mock;
};
let handlers: Handler[] = [];

const baseWidget = (
  overrides: Partial<WidgetData> = {}
): Omit<WidgetData, 'id'> => {
  const { id: _id, ...rest } = {
    id: 'seed',
    type: 'clock' as WidgetType,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    z: 1,
    flipped: false,
    config: { label: 'A' },
    ...overrides,
  } as WidgetData;
  return rest;
};

const basePack = (overrides: Partial<StarterPack> = {}): StarterPack => ({
  id: 'pack-1',
  name: 'Morning Routine',
  icon: 'sun',
  color: 'bg-amber-500',
  gradeLevels: ['K', '1'],
  isLocked: true,
  widgets: [baseWidget()],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  handlers = [];
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  // Pinned here (not just in the vi.mock factory) so the implementation
  // survives the afterEach vi.restoreAllMocks() below.
  mockQuery.mockImplementation((ref: unknown) => ref);
  mockOnSnapshot.mockImplementation(
    (ref: unknown, onNext: Handler['onNext'], onError: Handler['onError']) => {
      const unsub = vi.fn();
      handlers.push({ ref, onNext, onError, unsub });
      return unsub;
    }
  );
});

afterEach(() => {
  // Restores any vi.spyOn spies (e.g. the console.error spies) even if a test
  // throws before reaching its own mockRestore() call, preventing leakage.
  vi.restoreAllMocks();
});

describe('useStarterPacks — listener wiring', () => {
  it('subscribes to the public and user collections at the artifacts paths', () => {
    renderHook(() => useStarterPacks(USER_UID));

    expect(mockCollection).toHaveBeenCalledWith(
      { __mock: 'db' },
      'artifacts',
      appId,
      'public',
      'data',
      'starterPacks'
    );
    expect(mockCollection).toHaveBeenCalledWith(
      { __mock: 'db' },
      'artifacts',
      appId,
      'users',
      USER_UID,
      'starterPacks'
    );
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(handlers).toHaveLength(2);
    expect(handlers[0]?.ref).toBe(PUBLIC_PATH);
    expect(handlers[1]?.ref).toBe(userPath(USER_UID));
  });

  it('subscribes only to the public collection when there is no userId', () => {
    renderHook(() => useStarterPacks(undefined));

    expect(handlers).toHaveLength(1);
    expect(handlers[0]?.ref).toBe(PUBLIC_PATH);
    expect(mockCollection).not.toHaveBeenCalledWith(
      { __mock: 'db' },
      'artifacts',
      appId,
      'users',
      expect.anything(),
      'starterPacks'
    );
  });

  it('starts in a loading state', () => {
    const { result } = renderHook(() => useStarterPacks(USER_UID));
    expect(result.current.loading).toBe(true);
  });

  it('unsubscribes both listeners on unmount', () => {
    const { unmount } = renderHook(() => useStarterPacks(USER_UID));
    const [pub, usr] = handlers;
    unmount();
    expect(pub?.unsub).toHaveBeenCalledTimes(1);
    expect(usr?.unsub).toHaveBeenCalledTimes(1);
  });
});

describe('useStarterPacks — snapshot mapping', () => {
  it('maps public and user docs, with the Firestore doc id overriding any id in the data', () => {
    const { result } = renderHook(() => useStarterPacks(USER_UID));

    act(() => {
      handlers[0]?.onNext(
        fakeSnap([
          { id: 'real-pub', data: { id: 'stale', name: 'Public Pack' } },
        ])
      );
      handlers[1]?.onNext(
        fakeSnap([{ id: 'real-user', data: { name: 'My Pack' } }])
      );
    });

    expect(result.current.publicPacks).toEqual([
      { id: 'real-pub', name: 'Public Pack' },
    ]);
    expect(result.current.userPacks).toEqual([
      { id: 'real-user', name: 'My Pack' },
    ]);
  });

  it('clears loading once both the public and user snapshots have arrived', () => {
    const { result } = renderHook(() => useStarterPacks(USER_UID));

    act(() => {
      handlers[0]?.onNext(fakeSnap([]));
    });
    // Public has landed but the user listener has not — still loading.
    expect(result.current.loading).toBe(true);

    act(() => {
      handlers[1]?.onNext(fakeSnap([]));
    });
    expect(result.current.loading).toBe(false);
  });

  it('clears loading after the public snapshot alone when there is no userId', () => {
    const { result } = renderHook(() => useStarterPacks(undefined));

    act(() => {
      handlers[0]?.onNext(fakeSnap([]));
    });
    expect(result.current.loading).toBe(false);
  });
});

describe('useStarterPacks — listener errors', () => {
  it('logs and stops loading when the public listener errors', () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useStarterPacks(undefined));

    act(() => {
      handlers[0]?.onError(new Error('boom'));
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to subscribe to public starter packs:',
      expect.any(Error)
    );
    // No userId, so the public listener resolving (even via error) is enough.
    expect(result.current.loading).toBe(false);
    consoleSpy.mockRestore();
  });

  it('logs and counts the user listener as resolved when it errors', () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useStarterPacks(USER_UID));

    act(() => {
      handlers[0]?.onNext(fakeSnap([]));
      handlers[1]?.onError(new Error('denied'));
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to subscribe to user starter packs:',
      expect.any(Error)
    );
    expect(result.current.loading).toBe(false);
    consoleSpy.mockRestore();
  });
});

describe('useStarterPacks — executePack', () => {
  it('deletes existing widgets first when cleanSlate is true', () => {
    const { result } = renderHook(() => useStarterPacks(USER_UID));
    const addWidget = vi.fn();
    const deleteAllWidgets = vi.fn();
    const pack = basePack({
      widgets: [
        baseWidget({ type: 'timer' as WidgetType }),
        baseWidget({ type: 'clock' as WidgetType }),
      ],
    });

    act(() => {
      result.current.executePack(pack, true, addWidget, deleteAllWidgets);
    });

    expect(deleteAllWidgets).toHaveBeenCalledTimes(1);
    expect(addWidget).toHaveBeenCalledTimes(2);
    expect(addWidget.mock.calls[0]?.[0]).toBe('timer');
    expect(addWidget.mock.calls[1]?.[0]).toBe('clock');
  });

  it('does not delete existing widgets when cleanSlate is false', () => {
    const { result } = renderHook(() => useStarterPacks(USER_UID));
    const addWidget = vi.fn();
    const deleteAllWidgets = vi.fn();

    act(() => {
      result.current.executePack(
        basePack(),
        false,
        addWidget,
        deleteAllWidgets
      );
    });

    expect(deleteAllWidgets).not.toHaveBeenCalled();
    expect(addWidget).toHaveBeenCalledTimes(1);
  });

  it('gives each added widget a fresh id and a deep-cloned config', () => {
    const { result } = renderHook(() => useStarterPacks(USER_UID));
    const addWidget =
      vi.fn<(type: WidgetType, overrides?: AddWidgetOverrides) => void>();
    const originalConfig = { nested: { value: 1 } };
    const pack = basePack({
      widgets: [
        baseWidget({ type: 'timer' as WidgetType, config: originalConfig }),
      ],
    });

    act(() => {
      result.current.executePack(pack, false, addWidget, vi.fn());
    });

    const overrides = addWidget.mock.calls[0]?.[1] as AddWidgetOverrides & {
      config: { nested: { value: number } };
    };
    // A fresh UUID is generated rather than reusing any seed id.
    expect(typeof overrides.id).toBe('string');
    expect(overrides.id).not.toBe('seed');
    // The config is structurally cloned, not passed by reference.
    expect(overrides.config).toEqual(originalConfig);
    expect(overrides.config).not.toBe(originalConfig);
    overrides.config.nested.value = 99;
    expect(originalConfig.nested.value).toBe(1);
  });

  it('is a no-op for addWidget when the pack has no widgets', () => {
    const { result } = renderHook(() => useStarterPacks(USER_UID));
    const addWidget = vi.fn();
    const deleteAllWidgets = vi.fn();

    act(() => {
      result.current.executePack(
        basePack({ widgets: [] }),
        true,
        addWidget,
        deleteAllWidgets
      );
    });

    expect(deleteAllWidgets).toHaveBeenCalledTimes(1);
    expect(addWidget).not.toHaveBeenCalled();
  });
});

describe('useStarterPacks — userId transitions', () => {
  it('clears userPacks and returns to loading when the user signs out', () => {
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string | undefined }) => useStarterPacks(uid),
      { initialProps: { uid: USER_UID as string | undefined } }
    );

    act(() => {
      handlers[0]?.onNext(fakeSnap([]));
      handlers[1]?.onNext(fakeSnap([{ id: 'u1', data: { name: 'Mine' } }]));
    });
    expect(result.current.userPacks).toHaveLength(1);
    expect(result.current.loading).toBe(false);

    rerender({ uid: undefined });

    expect(result.current.userPacks).toEqual([]);
    expect(result.current.loading).toBe(true);
  });
});
