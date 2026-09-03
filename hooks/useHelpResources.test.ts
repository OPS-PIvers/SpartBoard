import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import React from 'react';
import { useHelpResources, useHelpItemsForWidget } from './useHelpResources';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'help_resources-ref'),
  doc: vi.fn(() => 'help_center/config-ref'),
  onSnapshot: vi.fn(),
  query: vi.fn((ref: unknown, ...clauses: unknown[]) => ({ ref, clauses })),
  where: vi.fn((field: string, op: string, value: unknown) => [
    field,
    op,
    value,
  ]),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  isConfigured: true,
  isAuthBypass: false,
}));

const makeAuthWrapper = (extra: Partial<AuthContextType> = {}) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      AuthContext.Provider,
      { value: { orgId: null, ...extra } as unknown as AuthContextType },
      children
    );
  Wrapper.displayName = 'AuthContextTestWrapper';
  return Wrapper;
};

const rawGlobalItem = {
  kind: 'embed',
  title: 'Global item',
  categoryId: 'getting-started',
  order: 0,
  visible: true,
  orgId: null,
  widgetTypes: ['clock'],
  url: 'https://example.com',
  embedType: 'other',
};

const rawOrgItem = {
  kind: 'embed',
  title: 'Org item',
  categoryId: 'admin',
  order: 0,
  visible: true,
  orgId: 'orono',
  widgetTypes: ['clock'],
  url: 'https://example.com',
  embedType: 'other',
};

describe('useHelpResources', () => {
  const mockOnSnapshot = onSnapshot as Mock;
  const mockDoc = doc as Mock;
  const mockCollection = collection as Mock;
  const mockQuery = query as Mock;
  const mockWhere = where as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockReturnValue('help_center/config-ref');
    mockCollection.mockReturnValue('help_resources-ref');
    mockQuery.mockImplementation((ref: unknown, ...clauses: unknown[]) => ({
      ref,
      clauses,
    }));
    mockWhere.mockImplementation(
      (field: string, op: string, value: unknown) => [field, op, value]
    );
  });

  it('subscribes to the whole collection with no orgId filter when allOrgs is set', async () => {
    mockOnSnapshot.mockImplementation(
      (ref: unknown, onNext: (s: unknown) => void) => {
        if (ref === 'help_center/config-ref') {
          queueMicrotask(() => onNext({ data: () => ({ categories: [] }) }));
        } else {
          queueMicrotask(() =>
            onNext({ docs: [{ id: 'a1', data: () => rawOrgItem }] })
          );
        }
        return () => undefined;
      }
    );

    const { result } = renderHook(
      () => useHelpResources({ includeHidden: true, allOrgs: true }),
      { wrapper: makeAuthWrapper({ orgId: null }) }
    );

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(mockWhere).not.toHaveBeenCalledWith('orgId', '==', null);
    expect(mockOnSnapshot).toHaveBeenCalledWith(
      'help_resources-ref',
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('merges global and org query results by id', async () => {
    mockOnSnapshot.mockImplementation(
      (
        ref: { clauses?: unknown[] } | string,
        onNext: (snap: { data?: () => unknown; docs?: unknown[] }) => void
      ) => {
        if (ref === 'help_center/config-ref') {
          queueMicrotask(() => onNext({ data: () => undefined }));
          return () => undefined;
        }
        const clauses = (ref as { clauses: unknown[] }).clauses;
        const [, , value] = clauses[0] as [string, string, unknown];
        if (value === null) {
          queueMicrotask(() =>
            onNext({ docs: [{ id: 'g1', data: () => rawGlobalItem }] })
          );
        } else {
          queueMicrotask(() =>
            onNext({ docs: [{ id: 'o1', data: () => rawOrgItem }] })
          );
        }
        return () => undefined;
      }
    );

    const { result } = renderHook(
      () => useHelpResources({ includeHidden: false }),
      { wrapper: makeAuthWrapper({ orgId: 'orono' }) }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.items.map((i) => i.id).sort()).toEqual(['g1', 'o1']);
  });

  it('does not open an org query when orgId is null', async () => {
    mockOnSnapshot.mockImplementation(
      (
        ref: { clauses?: unknown[] } | string,
        onNext: (snap: { data?: () => unknown; docs?: unknown[] }) => void
      ) => {
        if (ref === 'help_center/config-ref') {
          queueMicrotask(() => onNext({ data: () => undefined }));
        } else {
          queueMicrotask(() => onNext({ docs: [] }));
        }
        return () => undefined;
      }
    );

    const { result } = renderHook(
      () => useHelpResources({ includeHidden: false }),
      { wrapper: makeAuthWrapper({ orgId: null }) }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Only the config doc + global query listeners; no org query.
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
  });

  it('filters hidden items unless includeHidden is true', async () => {
    const hidden = { ...rawGlobalItem, visible: false };
    mockOnSnapshot.mockImplementation(
      (
        ref: { clauses?: unknown[] } | string,
        onNext: (snap: { data?: () => unknown; docs?: unknown[] }) => void
      ) => {
        if (ref === 'help_center/config-ref') {
          queueMicrotask(() => onNext({ data: () => undefined }));
        } else {
          queueMicrotask(() =>
            onNext({ docs: [{ id: 'h1', data: () => hidden }] })
          );
        }
        return () => undefined;
      }
    );

    const { result: visibleOnly } = renderHook(
      () => useHelpResources({ includeHidden: false }),
      { wrapper: makeAuthWrapper() }
    );
    await waitFor(() => expect(visibleOnly.current.loading).toBe(false));
    expect(visibleOnly.current.items).toHaveLength(0);

    const { result: withHidden } = renderHook(
      () => useHelpResources({ includeHidden: true }),
      { wrapper: makeAuthWrapper() }
    );
    await waitFor(() => expect(withHidden.current.loading).toBe(false));
    expect(withHidden.current.items).toHaveLength(1);
  });

  it('tolerates permission-denied on the org query and keeps global results', async () => {
    mockOnSnapshot.mockImplementation(
      (
        ref: { clauses?: unknown[] } | string,
        onNext: (snap: { data?: () => unknown; docs?: unknown[] }) => void,
        onError?: (err: Error) => void
      ) => {
        if (ref === 'help_center/config-ref') {
          queueMicrotask(() => onNext({ data: () => undefined }));
          return () => undefined;
        }
        const clauses = (ref as { clauses: unknown[] }).clauses;
        const [, , value] = clauses[0] as [string, string, unknown];
        if (value === null) {
          queueMicrotask(() =>
            onNext({ docs: [{ id: 'g1', data: () => rawGlobalItem }] })
          );
        } else {
          queueMicrotask(() => onError?.(new Error('permission-denied')));
        }
        return () => undefined;
      }
    );

    const { result } = renderHook(
      () => useHelpResources({ includeHidden: false }),
      { wrapper: makeAuthWrapper({ orgId: 'orono' }) }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((i) => i.id)).toEqual(['g1']);
    expect(result.current.error).toBeTruthy();
  });

  it('clears a prior error once the org query recovers', async () => {
    let orgOnNext: ((snap: { docs: unknown[] }) => void) | undefined;
    let orgOnError: ((err: Error) => void) | undefined;
    mockOnSnapshot.mockImplementation(
      (
        ref: { clauses?: unknown[] } | string,
        onNext: (snap: { data?: () => unknown; docs?: unknown[] }) => void,
        onError?: (err: Error) => void
      ) => {
        if (ref === 'help_center/config-ref') {
          queueMicrotask(() => onNext({ data: () => undefined }));
          return () => undefined;
        }
        const clauses = (ref as { clauses: unknown[] }).clauses;
        const [, , value] = clauses[0] as [string, string, unknown];
        if (value === null) {
          queueMicrotask(() =>
            onNext({ docs: [{ id: 'g1', data: () => rawGlobalItem }] })
          );
        } else {
          orgOnNext = onNext as (snap: { docs: unknown[] }) => void;
          orgOnError = onError;
          queueMicrotask(() => onError?.(new Error('permission-denied')));
        }
        return () => undefined;
      }
    );

    const { result } = renderHook(
      () => useHelpResources({ includeHidden: false }),
      { wrapper: makeAuthWrapper({ orgId: 'orono' }) }
    );

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(orgOnError).toBeDefined();

    act(() => {
      orgOnNext?.({ docs: [{ id: 'o1', data: () => rawOrgItem }] });
    });

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.items.map((i) => i.id).sort()).toEqual(['g1', 'o1']);
  });
});

describe('useHelpItemsForWidget', () => {
  const mockOnSnapshot = onSnapshot as Mock;
  const mockDoc = doc as Mock;
  const mockCollection = collection as Mock;
  const mockQuery = query as Mock;
  const mockWhere = where as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockReturnValue('help_center/config-ref');
    mockCollection.mockReturnValue('help_resources-ref');
    mockQuery.mockImplementation((ref: unknown, ...clauses: unknown[]) => ({
      ref,
      clauses,
    }));
    mockWhere.mockImplementation(
      (field: string, op: string, value: unknown) => [field, op, value]
    );
  });

  const withGlobalWidgetItem = (clockOnly = true) =>
    mockOnSnapshot.mockImplementation(
      (
        ref: { clauses: unknown[] },
        onNext: (snap: { docs: unknown[] }) => void
      ) => {
        const [, , value] = ref.clauses[0] as [string, string, unknown];
        const item: Record<string, unknown> = {
          ...rawGlobalItem,
          widgetTypes: clockOnly ? ['clock'] : ['time-tool'],
        };
        if (value === null) {
          queueMicrotask(() =>
            onNext({ docs: [{ id: 'w1', data: () => item }] })
          );
        } else {
          queueMicrotask(() => onNext({ docs: [] }));
        }
        return () => undefined;
      }
    );

  it('creates one shared listener across multiple mounts and returns items for the widget type', async () => {
    withGlobalWidgetItem(true);

    const wrapper = makeAuthWrapper({ orgId: 'orono' });
    const { result: r1 } = renderHook(() => useHelpItemsForWidget('clock'), {
      wrapper,
    });
    const { result: r2 } = renderHook(() => useHelpItemsForWidget('clock'), {
      wrapper,
    });

    await waitFor(() => {
      expect(r1.current).toHaveLength(1);
      expect(r2.current).toHaveLength(1);
    });
    // Global + org listeners created once, shared by both subscribers.
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
  });

  it('renders without an AuthProvider and still returns global items', async () => {
    withGlobalWidgetItem(true);

    const { result } = renderHook(() => useHelpItemsForWidget('clock'));

    await waitFor(() => expect(result.current).toHaveLength(1));
  });

  it('filters out items that do not list the widget type', async () => {
    withGlobalWidgetItem(false);

    const { result } = renderHook(() => useHelpItemsForWidget('clock'), {
      wrapper: makeAuthWrapper(),
    });

    await waitFor(() => {
      expect(mockOnSnapshot).toHaveBeenCalled();
    });
    expect(result.current).toHaveLength(0);
  });

  it('tears down the shared listener when the last subscriber unmounts', async () => {
    const unsubGlobal = vi.fn();
    const unsubOrg = vi.fn();
    mockOnSnapshot.mockImplementation(
      (
        ref: { clauses: unknown[] },
        onNext: (snap: { docs: unknown[] }) => void
      ) => {
        const [, , value] = ref.clauses[0] as [string, string, unknown];
        queueMicrotask(() => onNext({ docs: [] }));
        return value === null ? unsubGlobal : unsubOrg;
      }
    );

    const { unmount } = renderHook(() => useHelpItemsForWidget('clock'), {
      wrapper: makeAuthWrapper({ orgId: 'orono' }),
    });

    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(2));

    act(() => {
      unmount();
    });

    expect(unsubGlobal).toHaveBeenCalledTimes(1);
    expect(unsubOrg).toHaveBeenCalledTimes(1);
  });

  it('does not return stale items to a fresh subscriber after teardown and doc deletion', async () => {
    let itemDeleted = false;
    mockOnSnapshot.mockImplementation(
      (
        ref: { clauses: unknown[] },
        onNext: (snap: { docs: unknown[] }) => void
      ) => {
        const [, , value] = ref.clauses[0] as [string, string, unknown];
        if (value === null) {
          queueMicrotask(() =>
            onNext({
              docs: itemDeleted
                ? []
                : [{ id: 'w1', data: () => rawGlobalItem }],
            })
          );
        } else {
          queueMicrotask(() => onNext({ docs: [] }));
        }
        return () => undefined;
      }
    );

    const wrapper = makeAuthWrapper({ orgId: 'orono' });
    const { result: r1, unmount } = renderHook(
      () => useHelpItemsForWidget('clock'),
      { wrapper }
    );
    await waitFor(() => expect(r1.current).toHaveLength(1));

    act(() => {
      unmount();
    });

    // Simulate the item being deleted while there are no subscribers.
    itemDeleted = true;

    const { result: r2 } = renderHook(() => useHelpItemsForWidget('clock'), {
      wrapper,
    });

    // The fresh subscriber must never observe the stale pre-teardown item,
    // not even in the instant before the new snapshot resolves.
    expect(r2.current).toHaveLength(0);
    await waitFor(() => expect(r2.current).toHaveLength(0));
  });
});
