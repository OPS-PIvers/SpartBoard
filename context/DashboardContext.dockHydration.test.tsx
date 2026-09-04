/**
 * Regression tests for the cloud dock hydration effect in DashboardProvider.
 *
 * On sign-in, AuthContext's profile loader flips `profileLoaded` true → false
 * → true *after* DashboardProvider has already mounted (the loader effect runs
 * in the parent, after the child's effects). That cancels the in-flight
 * `getDoc` for the dock, and the per-uid guard then refused to retry, so
 * `dockHydrated` never flipped true: the init and empty-dock recovery effects
 * stayed gated forever and users with no localStorage cache sat on
 * "Restoring defaults…" indefinitely. Mocks mirror context/toolVisibility.test.tsx.
 */

import React, { useEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useToolVisibility } from './useToolVisibility';
import { DockItem } from '@/types';

const authValue = {
  user: {
    uid: 'test-user',
    displayName: 'Test User',
    email: 'test@example.com',
  },
  isAdmin: false,
  featurePermissions: [],
  selectedBuildings: [],
  savedWidgetConfigs: {},
  saveWidgetConfig: vi.fn(),
  materialsPreferences: {
    selectedItems: [],
    title: 'Bring to class',
    hiddenMaterialIds: [],
  },
  refreshGoogleToken: vi.fn(),
  remoteControlEnabled: true,
  profileLoaded: true,
  setupCompleted: true,
};

vi.mock('./useAuth', () => ({ useAuth: () => ({ ...authValue }) }));

vi.mock('@/hooks/useFirestore', () => {
  const value = {
    saveDashboard: vi.fn().mockResolvedValue(Date.now()),
    saveDashboards: vi.fn().mockResolvedValue(undefined),
    deleteDashboard: vi.fn().mockResolvedValue(undefined),
    subscribeToDashboards: vi.fn(() => () => undefined),
    shareDashboard: vi.fn(),
    loadSharedDashboard: vi.fn().mockResolvedValue(null),
    rosters: [],
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    activeRosterId: null,
  };
  return { useFirestore: () => value };
});

vi.mock('@/hooks/useRosters', () => {
  const value = {
    rosters: [],
    activeRosterId: null,
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    setAbsentStudents: vi.fn(),
  };
  return { useRosters: () => value };
});

vi.mock('@/hooks/useCollections', () => {
  const value = {
    collections: [],
    loading: false,
    error: null,
    createCollection: vi.fn(),
    renameCollection: vi.fn(),
    moveCollection: vi.fn(),
    deleteCollection: vi.fn(),
    reorderSiblings: vi.fn(),
    setCollectionMetadata: vi.fn(),
    setCollectionDefaultBoard: vi.fn(),
  };
  return { useCollections: () => value };
});

vi.mock('@/hooks/useSharedCollection', () => {
  const value = {
    shareCollection: vi.fn().mockResolvedValue('mock-collection-share-id'),
    shareSubstituteCollection: vi
      .fn()
      .mockResolvedValue('mock-collection-sub-share-id'),
    loadSharedCollection: vi
      .fn()
      .mockResolvedValue({ ok: false, reason: 'not-found' }),
    loadSharedCollectionBoards: vi.fn().mockResolvedValue([]),
  };
  return { useSharedCollection: () => value };
});

const getDocMock = vi.fn<(...args: unknown[]) => unknown>();

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
      __path: segments.join('/'),
    })),
    getDoc: (...args: unknown[]): unknown => getDocMock(...args),
    setDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn(() => ({
      update: vi.fn(),
      delete: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
    onSnapshot: vi.fn(() => () => undefined),
    serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  };
});

const captured: { toolVis: ReturnType<typeof useToolVisibility> | null } = {
  toolVis: null,
};

const CaptureProbe: React.FC = () => {
  const toolVis = useToolVisibility();
  useEffect(() => {
    captured.toolVis = toolVis;
  });
  return null;
};

function getToolVis(): ReturnType<typeof useToolVisibility> {
  if (!captured.toolVis) throw new Error('Tool-visibility not captured');
  return captured.toolVis;
}

const CLOUD_DOCK: DockItem[] = [
  { type: 'tool', toolType: 'clock' },
  { type: 'tool', toolType: 'time-tool' },
];

function deferredGetDoc(): {
  resolve: (data: Record<string, unknown> | null) => void;
} {
  let resolve!: (data: Record<string, unknown> | null) => void;
  const pending = new Promise<{
    exists: () => boolean;
    data: () => Record<string, unknown> | undefined;
  }>((res) => {
    resolve = (data) =>
      res({ exists: () => data !== null, data: () => data ?? undefined });
  });
  getDocMock.mockReturnValue(pending);
  return { resolve };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  captured.toolVis = null;
  localStorage.clear();
  authValue.profileLoaded = true;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('dock hydration survives the sign-in profileLoaded flip', () => {
  it('re-reads the cloud dock after the first read is cancelled', async () => {
    const first = deferredGetDoc();
    const { rerender } = render(
      <DashboardProvider>
        <CaptureProbe />
      </DashboardProvider>
    );
    await flush();
    expect(getDocMock).toHaveBeenCalledTimes(1);

    // AuthContext's profile loader resets profileLoaded, then completes.
    authValue.profileLoaded = false;
    rerender(
      <DashboardProvider>
        <CaptureProbe />
      </DashboardProvider>
    );
    await flush();
    const second = deferredGetDoc();
    authValue.profileLoaded = true;
    rerender(
      <DashboardProvider>
        <CaptureProbe />
      </DashboardProvider>
    );
    await flush();
    expect(getDocMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      first.resolve(null);
      second.resolve({ dockItems: CLOUD_DOCK, dockInitialized: true });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getToolVis().dockItems).toEqual(CLOUD_DOCK);
    });
    expect(
      JSON.parse(localStorage.getItem('classroom_dock_items') ?? 'null')
    ).toEqual(CLOUD_DOCK);
  });

  it('falls back to defaults when the cloud read never resolves', async () => {
    vi.useFakeTimers();
    deferredGetDoc();
    render(
      <DashboardProvider>
        <CaptureProbe />
      </DashboardProvider>
    );
    await flush();
    expect(getToolVis().dockItems).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    await flush();

    expect(getToolVis().dockItems.length).toBeGreaterThan(0);
  });
});
