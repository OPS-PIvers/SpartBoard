import React, { useEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import { Dashboard, WidgetData } from '@/types';

// ---------------------------------------------------------------------------
// Mocks (mirrors tests/DashboardContext_removeWidgets.test.tsx)
// ---------------------------------------------------------------------------

vi.mock('./useAuth', () => ({
  useAuth: () => ({
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
    refreshGoogleToken: vi.fn(),
    remoteControlEnabled: true,
    profileLoaded: true,
  }),
}));

type SnapshotCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
let capturedSnapshotCb: SnapshotCb | null = null;

vi.mock('@/hooks/useFirestore', () => ({
  useFirestore: () => ({
    saveDashboard: vi.fn().mockResolvedValue(Date.now()),
    saveDashboards: vi.fn().mockResolvedValue(undefined),
    deleteDashboard: vi.fn().mockResolvedValue(undefined),
    subscribeToDashboards: vi.fn((cb: SnapshotCb) => {
      capturedSnapshotCb = cb;
      return () => {
        // cleanup
      };
    }),
    shareDashboard: vi.fn(),
    loadSharedDashboard: vi.fn().mockResolvedValue(null),
    rosters: [],
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    activeRosterId: null,
  }),
}));

vi.mock('@/hooks/useRosters', () => ({
  useRosters: () => ({
    rosters: [],
    activeRosterId: null,
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    setAbsentStudents: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCollections', () => ({
  useCollections: () => ({
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
  }),
}));

vi.mock('@/hooks/useSharedCollection', () => ({
  useSharedCollection: () => ({
    shareCollection: vi.fn().mockResolvedValue('mock-collection-share-id'),
    shareSubstituteCollection: vi
      .fn()
      .mockResolvedValue('mock-collection-sub-share-id'),
    loadSharedCollection: vi
      .fn()
      .mockResolvedValue({ ok: false, reason: 'not-found' }),
    loadSharedCollectionBoards: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
      __path: segments.join('/'),
    })),
    getDoc: vi.fn().mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    }),
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

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Annotation persistence + session-scoped undo
// ---------------------------------------------------------------------------

import type { DrawableObject, TextObject } from '@/types';
import { ANNOTATION_HARD_LIMIT_BYTES } from '@/utils/annotationSize';

interface Snap {
  objects: DrawableObject[];
  openAnnotation: () => void;
  closeAnnotation: () => void;
  addAnnotationObject: (o: DrawableObject) => void;
  undoAnnotation: () => void;
  clearAnnotation: () => void;
  annotationActive: boolean;
  toasts: { message: string; type?: string }[];
}

const Consumer: React.FC<{ stateRef: { current: Snap | null } }> = ({
  stateRef,
}) => {
  const ctx = useDashboard();
  useEffect(() => {
    stateRef.current = {
      objects: ctx.annotationState.objects,
      openAnnotation: ctx.openAnnotation,
      closeAnnotation: ctx.closeAnnotation,
      addAnnotationObject: ctx.addAnnotationObject,
      undoAnnotation: ctx.undoAnnotation,
      clearAnnotation: ctx.clearAnnotation,
      annotationActive: ctx.annotationActive,
      toasts: ctx.toasts,
    };
  });
  return null;
};

const rect = (id: string, authorUid?: string): DrawableObject => ({
  id,
  kind: 'rect',
  z: 1,
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  stroke: '#000',
  strokeWidth: 2,
  authorUid,
});

const board = (objects: DrawableObject[]): Dashboard => ({
  id: 'dash-1',
  name: 'Board',
  background: 'bg-slate-900',
  widgets: [] as WidgetData[],
  createdAt: 1000,
  updatedAt: 1000,
  annotationOverlay: { objects, updatedAt: 1000 },
});

async function mount(objects: DrawableObject[]) {
  const stateRef: { current: Snap | null } = { current: null };
  const get = (): Snap => {
    if (!stateRef.current) throw new Error('Consumer not mounted');
    return stateRef.current;
  };
  render(
    <DashboardProvider>
      <Consumer stateRef={stateRef} />
    </DashboardProvider>
  );
  await waitFor(() => expect(capturedSnapshotCb).not.toBeNull());
  const cb = capturedSnapshotCb;
  if (!cb) throw new Error('Provider not mounted');
  await act(async () => {
    cb([board(objects)], false);
    await Promise.resolve();
  });
  await waitFor(() => expect(get().objects).toHaveLength(objects.length));
  return get;
}

describe('DashboardContext annotation persistence', () => {
  beforeEach(() => {
    capturedSnapshotCb = null;
  });

  it('open and close keep existing ink on the board', async () => {
    const get = await mount([rect('old', 'test-user')]);
    act(() => get().openAnnotation());
    expect(get().annotationActive).toBe(true);
    expect(get().objects.map((o) => o.id)).toEqual(['old']);
    act(() => get().addAnnotationObject(rect('new')));
    act(() => get().closeAnnotation());
    expect(get().annotationActive).toBe(false);
    expect(get().objects.map((o) => o.id)).toEqual(['old', 'new']);
  });

  it('undo only reaches ink added in the current toolbar session', async () => {
    const get = await mount([rect('old', 'test-user')]);
    act(() => get().openAnnotation());
    act(() => get().addAnnotationObject(rect('a')));
    act(() => get().addAnnotationObject(rect('b')));
    act(() => get().undoAnnotation());
    expect(get().objects.map((o) => o.id)).toEqual(['old', 'a']);
    act(() => get().undoAnnotation());
    expect(get().objects.map((o) => o.id)).toEqual(['old']);
    // Pre-session ink is untouchable by undo.
    act(() => get().undoAnnotation());
    expect(get().objects.map((o) => o.id)).toEqual(['old']);
  });

  it('refuses ink that would push the overlay past the hard size limit', async () => {
    const get = await mount([]);
    act(() => get().openAnnotation());
    const huge: TextObject = {
      id: 'huge',
      kind: 'text',
      z: 1,
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      content: 'x'.repeat(ANNOTATION_HARD_LIMIT_BYTES),
      fontFamily: 'sans-serif',
      fontSize: 24,
      color: '#000',
    };
    act(() => get().addAnnotationObject(huge));
    expect(get().objects).toEqual([]);
    expect(get().toasts.some((t) => t.type === 'error')).toBe(true);
    // Normal ink still works.
    act(() => get().addAnnotationObject(rect('ok')));
    expect(get().objects.map((o) => o.id)).toEqual(['ok']);
  });

  it('trash clears everything, including pre-session ink', async () => {
    const get = await mount([rect('old', 'test-user')]);
    act(() => get().openAnnotation());
    act(() => get().clearAnnotation());
    expect(get().objects).toEqual([]);
  });
});
