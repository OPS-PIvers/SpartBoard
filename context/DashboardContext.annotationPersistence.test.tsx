import React, { useEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import { Dashboard, WidgetData } from '@/types';

// ---------------------------------------------------------------------------
// Mocks (mirrors tests/DashboardContext_removeWidgets.test.tsx)
// ---------------------------------------------------------------------------

// Stable singleton — a fresh object per render churns identity-sensitive deps
// and pins `loading` true, which would trap the auto-save effect.
const authMock = {
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
  googleAccessToken: null,
  remoteControlEnabled: true,
  profileLoaded: true,
};

vi.mock('./useAuth', () => ({
  useAuth: () => authMock,
}));

const driveMock = {
  driveService: null,
  userDomain: 'example.com',
  isConnected: false,
};

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => driveMock,
}));

type SnapshotCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
let capturedSnapshotCb: SnapshotCb | null = null;
// Replayed on every re-subscribe, mirroring real Firestore — otherwise the
// load effect's re-subscriptions leave `loading` stuck true.
let latestSnapshot: Dashboard[] | null = null;

const mockSaveDashboard = vi.fn<(d: unknown) => Promise<number>>();

// Stable singleton for the same reason as authMock above.
const firestoreMock = {
  saveDashboard: mockSaveDashboard,
  saveDashboards: vi.fn().mockResolvedValue(undefined),
  deleteDashboard: vi.fn().mockResolvedValue(undefined),
  subscribeToDashboards: vi.fn((cb: SnapshotCb) => {
    capturedSnapshotCb = cb;
    if (latestSnapshot) cb(latestSnapshot, false);
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
};

vi.mock('@/hooks/useFirestore', () => ({
  useFirestore: () => firestoreMock,
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
import {
  ANNOTATION_HARD_LIMIT_BYTES,
  getAnnotationWorldRect,
} from '@/utils/annotationSize';

interface Snap {
  objects: DrawableObject[];
  openAnnotation: () => void;
  closeAnnotation: () => void;
  addAnnotationObject: (o: DrawableObject) => boolean;
  updateAnnotationState: (u: { objects?: DrawableObject[] }) => void;
  updateAnnotationObject: (o: DrawableObject) => void;
  undoAnnotation: () => void;
  redoAnnotation: () => void;
  canRedoAnnotation: boolean;
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
      updateAnnotationState: ctx.updateAnnotationState,
      updateAnnotationObject: ctx.updateAnnotationObject,
      undoAnnotation: ctx.undoAnnotation,
      redoAnnotation: ctx.redoAnnotation,
      canRedoAnnotation: ctx.canRedoAnnotation,
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
  latestSnapshot = [board(objects)];
  await act(async () => {
    cb(latestSnapshot ?? [], false);
    await Promise.resolve();
  });
  await waitFor(() => expect(get().objects).toHaveLength(objects.length));
  return get;
}

describe('DashboardContext annotation persistence', () => {
  beforeEach(() => {
    capturedSnapshotCb = null;
    latestSnapshot = null;
    mockSaveDashboard.mockReset();
    mockSaveDashboard.mockResolvedValue(Date.now());
  });

  // Regression: serializeDashboard hashed only widgets/background/name/
  // libraryOrder/settings, so an ink-only change never marked the board dirty
  // — it never autosaved and never armed the beforeunload flush.
  it('REGRESSION: an ink-only change autosaves the drawn objects', async () => {
    const get = await mount([]);
    mockSaveDashboard.mockClear();
    act(() => {
      get().addAnnotationObject(rect('ink'));
    });
    await waitFor(() => expect(mockSaveDashboard).toHaveBeenCalled(), {
      timeout: 4000,
    });
    const saved = mockSaveDashboard.mock.calls.at(-1)?.[0] as Dashboard;
    expect(saved.annotationOverlay?.objects.map((o) => o.id)).toEqual(['ink']);
  });

  // Regression: both merge branches took annotationOverlay straight from the
  // server doc, so any incoming snapshot erased ink that had not saved yet.
  it('REGRESSION: an incoming snapshot does not drop unsaved ink', async () => {
    const get = await mount([]);
    act(() => {
      get().addAnnotationObject(rect('unsaved'));
    });
    const cb = capturedSnapshotCb;
    if (!cb) throw new Error('Provider not mounted');
    await act(async () => {
      cb([board([])], false);
      await Promise.resolve();
    });
    expect(get().objects.map((o) => o.id)).toEqual(['unsaved']);
  });

  // Ink is stored in the canvas it was authored on so a projector scales it
  // instead of clipping it.
  it('stamps the authoring canvas size on the first stroke', async () => {
    const get = await mount([]);
    act(() => {
      get().addAnnotationObject(rect('ink'));
    });
    await waitFor(() => expect(mockSaveDashboard).toHaveBeenCalled(), {
      timeout: 4000,
    });
    const saved = mockSaveDashboard.mock.calls.at(-1)?.[0] as Dashboard;
    const expected = getAnnotationWorldRect(
      window.innerWidth,
      window.innerHeight
    );
    expect(saved.annotationOverlay?.canvasWidth).toBe(expected.width);
    expect(saved.annotationOverlay?.canvasHeight).toBe(expected.height);
  });

  it('open and close keep existing ink on the board', async () => {
    const get = await mount([rect('old', 'test-user')]);
    act(() => get().openAnnotation());
    expect(get().annotationActive).toBe(true);
    expect(get().objects.map((o) => o.id)).toEqual(['old']);
    act(() => {
      get().addAnnotationObject(rect('new'));
    });
    act(() => get().closeAnnotation());
    expect(get().annotationActive).toBe(false);
    expect(get().objects.map((o) => o.id)).toEqual(['old', 'new']);
  });

  it('undo only reaches ink added in the current toolbar session', async () => {
    const get = await mount([rect('old', 'test-user')]);
    act(() => get().openAnnotation());
    act(() => {
      get().addAnnotationObject(rect('a'));
    });
    act(() => {
      get().addAnnotationObject(rect('b'));
    });
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
    let added: boolean | undefined;
    act(() => {
      added = get().addAnnotationObject(huge);
    });
    expect(added).toBe(false);
    expect(get().objects).toEqual([]);
    expect(get().toasts.some((t) => t.type === 'error')).toBe(true);
    // Normal ink still works.
    act(() => {
      get().addAnnotationObject(rect('ok'));
    });
    expect(get().objects.map((o) => o.id)).toEqual(['ok']);
  });

  it('re-editing an existing object cannot push the overlay past the cap', async () => {
    const small: TextObject = {
      id: 'note',
      kind: 'text',
      z: 1,
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      content: 'short',
      fontFamily: 'sans-serif',
      fontSize: 24,
      color: '#000',
    };
    const get = await mount([small]);
    act(() => get().openAnnotation());
    const bloated = {
      ...small,
      content: 'x'.repeat(ANNOTATION_HARD_LIMIT_BYTES),
    };
    act(() => get().updateAnnotationState({ objects: [bloated] }));
    expect((get().objects[0] as TextObject).content).toBe('short');
    act(() => get().updateAnnotationObject(bloated));
    expect((get().objects[0] as TextObject).content).toBe('short');
    expect(get().toasts.some((t) => t.type === 'error')).toBe(true);
    // Shrinking or moving an object is never refused.
    act(() => get().updateAnnotationObject({ ...small, x: 50 }));
    expect((get().objects[0] as TextObject).x).toBe(50);
  });

  it('a redo refused by the size cap stays on the redo stack', async () => {
    const get = await mount([]);
    act(() => get().openAnnotation());
    act(() => {
      get().addAnnotationObject(rect('a'));
    });
    act(() => get().undoAnnotation());
    expect(get().canRedoAnnotation).toBe(true);
    // A collaborator fills the board (remote snapshot, so the redo stack
    // survives) so re-adding 'a' would exceed the cap.
    const filler: TextObject = {
      id: 'filler',
      kind: 'text',
      z: 1,
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      content: 'x'.repeat(ANNOTATION_HARD_LIMIT_BYTES - 100),
      fontFamily: 'sans-serif',
      fontSize: 24,
      color: '#000',
    };
    const cb = capturedSnapshotCb;
    if (!cb) throw new Error('Provider not mounted');
    await act(async () => {
      cb([board([filler])], false);
      await Promise.resolve();
    });
    expect(get().objects.map((o) => o.id)).toEqual(['filler']);
    act(() => get().redoAnnotation());
    expect(get().objects.map((o) => o.id)).toEqual(['filler']);
    expect(get().canRedoAnnotation).toBe(true);
  });

  it('trash clears everything, including pre-session ink', async () => {
    const get = await mount([rect('old', 'test-user')]);
    act(() => get().openAnnotation());
    act(() => get().clearAnnotation());
    expect(get().objects).toEqual([]);
  });
});
