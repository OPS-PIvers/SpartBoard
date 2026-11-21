/** Dock persist: an edit reverted while the previous write is in flight must still be written. */

import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
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
const setDocMock = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
      __path: segments.join('/'),
    })),
    getDoc: (...args: unknown[]): unknown => getDocMock(...args),
    setDoc: (...args: unknown[]): unknown => setDocMock(...args),
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

const DOCK_A: DockItem[] = [
  { type: 'tool', toolType: 'clock' },
  { type: 'tool', toolType: 'time-tool' },
];
const DOCK_B: DockItem[] = [DOCK_A[1], DOCK_A[0]];

const dockWrites = (): unknown[] =>
  setDocMock.mock.calls
    .map((c) => (c[1] as { dockItems?: DockItem[] }).dockItems)
    .filter((d): d is DockItem[] => Array.isArray(d));

describe('dock persist while a write is in flight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the reverted dock when the edit is undone mid-write', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ dockItems: DOCK_A, dockInitialized: true }),
    });
    const inFlight: Array<() => void> = [];
    setDocMock.mockImplementation(
      () => new Promise<void>((resolve) => inFlight.push(resolve))
    );
    render(
      <DashboardProvider>
        <CaptureProbe />
      </DashboardProvider>
    );
    const advance = async (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    await advance(10);
    // Settle any hydration-time write so the saved baseline is DOCK_A.
    await advance(600);
    inFlight.splice(0).forEach((r) => r());
    await advance(10);
    setDocMock.mockClear();

    act(() => captured.toolVis?.reorderDockItems(DOCK_B));
    await advance(600);
    expect(dockWrites()).toEqual([DOCK_B]);

    // Back to the original while the DOCK_B write has not landed yet.
    act(() => captured.toolVis?.reorderDockItems(DOCK_A));
    await advance(600);
    inFlight.splice(0).forEach((r) => r());
    await advance(10);

    expect(dockWrites().at(-1)).toEqual(DOCK_A);
  });
});
