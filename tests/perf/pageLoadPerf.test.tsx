/**
 * Page-load performance baseline harness for the SpartBoard SPA.
 *
 * For every route that App.tsx mounts (keyed by `window.location.pathname`),
 * this harness mounts that route's REAL top-level entry component in isolation
 * inside a <React.Profiler>, with all Firebase / network / session
 * dependencies mocked so the component renders its real UI tree synchronously
 * (no perpetual loaders, no network). For each route it records:
 *
 *   - commits        — Profiler commit count for a single cold mount
 *                      (deterministic run-to-run)
 *   - medianMountMs  — median summed actualDuration across iterations 2..7
 *                      (iteration 1 is discarded as warm-up)
 *   - runsMs         — the raw per-iteration durations (all 7)
 *
 * Results are written to tests/perf/results/page-load-baseline.json — but only
 * when WRITE_PERF_BASELINE is set, so a normal run doesn't dirty git status
 * with the committed reference snapshot (see the afterAll guard). The test
 * asserts only that metrics were produced — NO duration thresholds, so this
 * can never be flaky on slow CI machines. (Read the committed JSON to evaluate
 * the <50ms-per-page goal.)
 *
 * Excluded from the default `pnpm test` suite (vitest.config.ts); run on demand
 * via `pnpm test:perf`, or `WRITE_PERF_BASELINE=1 pnpm test:perf` to also
 * regenerate the committed baseline.
 *
 * Mocking strategy (mirrors editorPerf.test.tsx / dashboardPerf.test.tsx and
 * the neighboring component tests, e.g. tests/components/quiz/
 * QuizStudentApp.selfPaced.test.tsx):
 *   - @/config/firebase + @/context/useDialog: already mocked globally in
 *     tests/setup.ts.
 *   - firebase/auth: signInAnonymously / onAuthStateChanged / signOut stubbed
 *     so the student apps' anonymous-auth bootstrap reaches `authReady`.
 *   - firebase/firestore: onSnapshot fires its callback once with a
 *     non-existent doc snapshot (then a no-op unsubscribe) and getDoc/getDocs
 *     resolve empty — so firestore-driven routes leave their loading spinner
 *     and render their real (empty / not-found) UI tree.
 *   - Per-route data/session hooks: stubbed to a stable "loaded, minimal"
 *     state so the component renders real UI, not a loader.
 *   - @/utils/youtube loadYouTubeApi: invokes its callback (no network), as in
 *     editorPerf.
 *   - ResizeObserver / getBoundingClientRect / naturalWidth|Height: stubbed so
 *     any canvas-geometry component computes a real footprint in jsdom.
 */

import React, { Profiler } from 'react';
import type { ComponentType, ProfilerOnRenderCallback } from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, render } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// ─── Mocks: firebase/auth ────────────────────────────────────────────────────

// Hoisted so the vi.mock factories (which are lifted to the top of the module)
// can reference these stable fixtures without a TDZ error.
const { fakeUser, emptyDocSnap, emptyQuerySnap } = vi.hoisted(() => ({
  // A stable fake "signed-in" user so the student apps' anonymous-auth
  // bootstrap (auth.authStateReady() → signInAnonymously) resolves and reaches
  // authReady.
  fakeUser: {
    uid: 'perf-anon-user',
    isAnonymous: true,
    getIdTokenResult: () => Promise.resolve({ claims: {} }),
  },
  // A non-existent document snapshot. Firestore-driven routes that wait on a
  // snapshot leave their loading state and render their real "not found /
  // empty" UI tree once this is delivered.
  emptyDocSnap: {
    exists: () => false,
    data: () => undefined,
    id: 'perf-empty',
  },
  emptyQuerySnap: {
    empty: true,
    size: 0,
    docs: [] as unknown[],
    forEach: () => undefined,
  },
}));

// Override the global @/config/firebase mock (tests/setup.ts) so the shared
// `auth` object's methods behave: onAuthStateChanged must fire the listener and
// return a real unsubscribe function (the global mock returns a bare vi.fn()
// whose result is undefined, which breaks consumers that call the unsubscribe —
// e.g. ActivityWallGalleryView's useAnonymousFirebaseUser).
vi.mock('@/config/firebase', () => {
  const auth = {
    currentUser: fakeUser,
    onAuthStateChanged: vi.fn((cb: (u: typeof fakeUser) => void) => {
      cb(fakeUser);
      return () => undefined;
    }),
    signInWithPopup: vi.fn().mockResolvedValue({ user: fakeUser }),
    signOut: vi.fn().mockResolvedValue(undefined),
    authStateReady: vi.fn().mockResolvedValue(undefined),
  };
  return {
    isConfigured: false,
    isAuthBypass: false,
    app: {},
    db: {},
    auth,
    storage: {},
    functions: {},
    GOOGLE_OAUTH_SCOPES: [] as string[],
    googleProvider: {},
  };
});

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue({ user: fakeUser }),
  // onAuthStateChanged fires the listener synchronously with the fake user and
  // returns a no-op unsubscribe (matches the global firebase mock's auth shape).
  onAuthStateChanged: vi.fn(
    (_auth: unknown, cb: (u: typeof fakeUser) => void) => {
      cb(fakeUser);
      return () => undefined;
    }
  ),
  signOut: vi.fn().mockResolvedValue(undefined),
  signInWithCustomToken: vi.fn().mockResolvedValue({ user: fakeUser }),
}));

// ─── Mocks: firebase/firestore ───────────────────────────────────────────────

// Partial mock: spread the real module so any unmocked Firestore export still
// resolves, then override the transport functions so routes never hit the
// network and leave their loading state on mount.
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn(() => ({})),
    collection: vi.fn(() => ({})),
    query: vi.fn(() => ({})),
    where: vi.fn(() => ({})),
    orderBy: vi.fn(() => ({})),
    limit: vi.fn(() => ({})),
    // onSnapshot fires once with an empty snapshot, then returns a no-op
    // unsubscribe. Firestore has several overloads — the onNext callback can be
    // the 2nd, 3rd, or 4th argument depending on whether a reference/query,
    // options object, and/or error callback are passed. Find the first function
    // argument (the onNext callback) rather than assuming a fixed position, so
    // every overload resolves and no component is left in a perpetual loading
    // state.
    onSnapshot: vi.fn((...args: unknown[]) => {
      const cb = args.find(
        (arg): arg is (snap: unknown) => void => typeof arg === 'function'
      );
      if (cb) {
        cb(emptyDocSnap);
      }
      return () => undefined;
    }),
    getDoc: vi.fn().mockResolvedValue(emptyDocSnap),
    getDocs: vi.fn().mockResolvedValue(emptyQuerySnap),
    setDoc: vi.fn().mockResolvedValue(undefined),
    addDoc: vi.fn().mockResolvedValue({ id: 'perf-added' }),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    increment: vi.fn((n: number) => n),
    serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
    writeBatch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

// ─── Mocks: auth/context hooks ───────────────────────────────────────────────

// One stable value object — the real AuthContext memoizes its value and the
// callbacks are useCallbacks, so a fresh object per call would churn identity
// and cause extra commits (e.g. DashboardView reads canAccessFeature in
// useLiveSession's deps). `user` stays null (what the student/anonymous routes
// expect; DashboardView's mount render never dereferences user.uid — the hooks
// that take user?.uid are all mocked). The added fields below
// (featurePermissions / dockPosition / selectedBuildings / userGradeLevels /
// …) are the extra auth surface that Dock and Sidebar destructure, so the
// signed-in teacher route mounts cleanly. Non-teacher routes ignore them.
const { dashboardViewAuthValue } = vi.hoisted(() => ({
  dashboardViewAuthValue: {
    user: null as unknown,
    isAdmin: false,
    loading: false,
    roleResolved: true,
    roleId: null,
    isStudentRole: false,
    profileLoaded: true,
    setupCompleted: true,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    canAccessWidget: () => true,
    canAccessFeature: () => false,
    // Extra surface read by Dock / Sidebar so they mount cleanly.
    featurePermissions: [] as unknown[],
    globalPermissions: [] as unknown[],
    selectedBuildings: [] as string[],
    userGradeLevels: [] as string[],
    dockPosition: 'bottom',
    savedWidgetConfigs: {},
    saveWidgetConfig: vi.fn(),
    refreshGoogleToken: vi.fn().mockResolvedValue(null),
    disableCloseConfirmation: false,
    remoteControlEnabled: true,
    lastActiveCollectionId: null,
    lastBoardIdByCollection: {},
  },
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => dashboardViewAuthValue,
}));

// Teacher-home dashboard context. We mock the `useDashboard()` hook directly
// (rather than booting the real DashboardProvider + all its Firestore
// subscription machinery) so DashboardView mounts with a stable, empty board.
// The SAME value is ALSO supplied through the real `DashboardContext.Provider`
// in the route's mount wrapper, because the canvas hot-slice hooks
// (useDashboardActions / useDashboardCanvasSelector / useIsActiveBoardReadOnly,
// used by BoardCanvas) fall back to reading the legacy DashboardContext via
// React 19's `use()` when no DashboardCanvasStoreContext is mounted (see
// context/dashboardCanvasStore.ts). With an empty widgets array no Draggable
// Window shells mount, so this exercises the real shell (Sidebar, Dock, empty
// BoardCanvas) — the teacher page-load skeleton — not loaded board content.
const { dashboardValue } = vi.hoisted(() => {
  const noop = (): void => undefined;
  const asyncNoop = (): Promise<void> => Promise.resolve();
  const emptyDashboard = {
    id: 'perf-empty-board',
    name: 'Perf Empty Board',
    background: 'bg-slate-900',
    widgets: [] as unknown[],
    createdAt: 1000,
    updatedAt: 1000,
  };
  // A permissive stub: every field DashboardView / Sidebar / Dock destructure,
  // plus the action/selection surface BoardCanvas reads via the legacy
  // fallback. Cast to the context type at the wrapper; mocks return `unknown`.
  const dashboardValue = {
    driveService: null,
    collectionsApi: {
      collections: [],
      loading: false,
      error: null,
      createCollection: noop,
      renameCollection: noop,
      moveCollection: noop,
      deleteCollection: noop,
      reorderSiblings: noop,
      setCollectionMetadata: noop,
      setCollectionDefaultBoard: noop,
    },
    dashboards: [emptyDashboard],
    activeDashboard: emptyDashboard,
    toasts: [],
    loading: false,
    isSaving: false,
    gradeFilter: 'all',
    setGradeFilter: noop,
    addToast: noop,
    removeToast: noop,
    createNewDashboard: () => Promise.resolve(undefined),
    saveCurrentDashboard: asyncNoop,
    deleteDashboard: asyncNoop,
    duplicateDashboard: asyncNoop,
    duplicateCollection: asyncNoop,
    renameDashboard: asyncNoop,
    loadDashboard: noop,
    reorderDashboards: asyncNoop,
    setDefaultDashboard: asyncNoop,
    moveBoardToCollection: asyncNoop,
    pinBoard: asyncNoop,
    unpinBoard: asyncNoop,
    setActiveCollectionId: noop,
    addWidget: noop,
    addWidgets: noop,
    removeWidget: noop,
    duplicateWidget: noop,
    removeWidgets: noop,
    clearAllStickers: noop,
    clearAllWidgets: noop,
    updateWidget: noop,
    updateWidgets: noop,
    bringToFront: noop,
    moveWidgetLayer: noop,
    minimizeAllWidgets: noop,
    restoreAllWidgets: noop,
    deleteAllWidgets: noop,
    resetWidgetSize: noop,
    setBackground: noop,
    setGlobalStyle: noop,
    updateDashboardSettings: noop,
    updateDashboard: noop,
    annotationActive: false,
    annotationState: {
      objects: [],
      color: '#000',
      width: 2,
      customColors: [],
      activeTool: 'pen',
      shapeFill: false,
    },
    openAnnotation: noop,
    closeAnnotation: noop,
    updateAnnotationState: noop,
    addAnnotationObject: noop,
    updateAnnotationObject: noop,
    removeAnnotationObject: noop,
    undoAnnotation: noop,
    redoAnnotation: noop,
    canRedoAnnotation: false,
    clearAnnotation: noop,
    zoom: 1,
    setZoom: noop,
    selectedWidgetId: null,
    setSelectedWidgetId: noop,
    groupWidgets: noop,
    ungroupWidgets: noop,
    selectedWidgetIds: [],
    setSelectedWidgetIds: noop,
    groupBuildMode: false,
    setGroupBuildMode: noop,
    shareDashboard: () => Promise.resolve(''),
    shareSubstituteDashboard: () =>
      Promise.resolve({ shareId: '', driveGrants: null }),
    loadSharedDashboard: () => Promise.resolve(null),
    pendingShareId: null,
    clearPendingShare: noop,
    pendingShareImport: null,
    cancelPendingShareImport: noop,
    importSharedBoard: asyncNoop,
    stopSharingDashboard: asyncNoop,
    isActiveBoardReadOnly: false,
    drawingWidgetsMigrating: new Set<string>(),
    pendingQuizShareId: null,
    clearPendingQuizShare: noop,
    pendingAssignmentShareId: null,
    setPendingAssignmentShareId: noop,
    clearPendingAssignmentShare: noop,
    pendingVideoActivityShareId: null,
    setPendingVideoActivityShareId: noop,
    clearPendingVideoActivityShare: noop,
    setPendingQuizShareId: noop,
    pendingAssignmentSetupId: null,
    setPendingAssignmentSetup: noop,
    clearPendingAssignmentSetup: noop,
    pendingAssignmentEditId: null,
    setPendingAssignmentEdit: noop,
    clearPendingAssignmentEdit: noop,
    shareCollection: () => Promise.resolve(''),
    shareSubstituteCollection: () => Promise.resolve(''),
    loadSharedCollection: () =>
      Promise.resolve({ ok: false, reason: 'not-found' }),
    loadSharedCollectionBoards: () => Promise.resolve([]),
    importSharedCollection: () => Promise.resolve(null),
    pendingSharedCollectionId: null,
    setPendingSharedCollectionId: noop,
    clearPendingSharedCollection: noop,
    rosters: [],
    activeRosterId: null,
    addRoster: () => Promise.resolve(''),
    updateRoster: asyncNoop,
    deleteRoster: asyncNoop,
    setActiveRoster: noop,
    setAbsentStudents: asyncNoop,
  };
  return { dashboardValue };
});

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => dashboardValue,
}));

vi.mock('@/context/useStudentAuth', () => ({
  useStudentAuth: () => ({
    status: 'authenticated',
    pseudonymUid: 'perf-student',
    orgId: 'perf-org',
    classIds: [] as string[],
    firstName: 'A',
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

// ─── Mocks: per-route data/session hooks ─────────────────────────────────────

vi.mock('@/utils/shortLinks', () => ({
  resolveShortLink: vi.fn().mockResolvedValue(null),
  recordShortLinkClick: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/useLiveSession', () => ({
  useLiveSession: () => ({
    session: null,
    students: [],
    loading: false,
    startSession: vi.fn(),
    updateSessionConfig: vi.fn().mockResolvedValue(undefined),
    updateSessionBackground: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    leaveSession: vi.fn().mockResolvedValue(undefined),
    removeStudent: vi.fn().mockResolvedValue(undefined),
    toggleFreezeStudent: vi.fn().mockResolvedValue(undefined),
    toggleGlobalFreeze: vi.fn().mockResolvedValue(undefined),
    joinSession: vi.fn().mockResolvedValue(''),
    studentId: null,
    studentPin: null,
    individualFrozen: false,
  }),
}));

vi.mock('@/hooks/usePreviewMode', () => ({
  usePreviewMode: () => ({ isPreview: false, previewData: null }),
}));

vi.mock('@/hooks/useFocusLossPoll', () => ({
  useFocusLossPoll: () => undefined,
}));

vi.mock('@/hooks/useResultsTabWarnings', () => ({
  useResultsTabWarnings: () => undefined,
}));

vi.mock('@/hooks/useQuizSession', () => ({
  useQuizSessionStudent: () => ({
    session: null,
    myResponse: null,
    loading: false,
    error: null,
    sessionIdRef: { current: null },
    lookupSession: vi.fn().mockResolvedValue(null),
    joinQuizSession: vi.fn().mockResolvedValue(''),
    subscribeForReview: vi.fn().mockResolvedValue(undefined),
    submitAnswer: vi.fn().mockResolvedValue(undefined),
    completeQuiz: vi.fn().mockResolvedValue(undefined),
    reportTabSwitch: vi.fn().mockResolvedValue(0),
    warningCount: 0,
  }),
  normalizeAnswer: (s: string) => s,
}));

vi.mock('@/hooks/useVideoActivitySession', () => ({
  useVideoActivitySessionStudent: () => ({
    session: null,
    myResponse: null,
    joinStatus: 'idle',
    error: null,
    lookupSession: vi.fn().mockResolvedValue(null),
    joinSession: vi.fn().mockResolvedValue(undefined),
    submitAnswer: vi.fn().mockResolvedValue(undefined),
    completeActivity: vi.fn().mockResolvedValue(undefined),
    reportTabSwitch: vi.fn().mockResolvedValue(0),
  }),
}));

vi.mock('@/hooks/useGuidedLearningSession', () => ({
  useGuidedLearningSessionStudent: () => ({
    session: null,
    loading: false,
    error: null,
    submitResponse: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/hooks/useStudentClassDirectory', () => ({
  useStudentClassDirectory: () => ({
    status: 'ready',
    classes: [],
    byId: {},
    retry: vi.fn(),
  }),
}));

vi.mock('@/hooks/useStudentAssignments', () => ({
  useStudentAssignments: () => ({
    loadState: 'ready',
    assignments: [],
    hasErrors: false,
    retry: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePlcInvitations', () => ({
  usePlcInvitations: () => ({
    pendingInvites: [],
    sentInvites: [],
    loading: false,
    inviteCount: 0,
    sendInvite: vi.fn().mockResolvedValue(undefined),
    acceptInvite: vi.fn().mockResolvedValue(undefined),
    declineInvite: vi.fn().mockResolvedValue(undefined),
    revokeInvite: vi.fn().mockResolvedValue(undefined),
  }),
}));

// ─── Mocks: teacher-home (DashboardView) hooks ───────────────────────────────
//
// The signed-in teacher route mounts the REAL DashboardView shell (Sidebar +
// Dock + empty BoardCanvas). DashboardView and its direct children (Sidebar,
// Dock) call ~15 Firebase-touching hooks on mount; we stub each to a stable,
// network-free "loaded, empty" value so the shell renders synchronously with
// no perpetual loader. This mirrors dashboardPerf.test.tsx's stubbing of the
// canvas machinery, extended to the wider shell. WidgetRegistry / WidgetLayout
// are stubbed below so widget internals never dominate (the board is empty
// anyway, so no shells mount). useLiveSession, firebase/firestore, useAuth, and
// useDialog are already mocked above / in tests/setup.ts.

// Tool-visibility context (Dock): empty dock so no widgets render.
vi.mock('@/context/useToolVisibility', () => ({
  useToolVisibility: () => ({
    visibleTools: [],
    dockItems: [],
    libraryOrder: [],
    toggleToolVisibility: vi.fn(),
    setAllToolsVisibility: vi.fn(),
    reorderTools: vi.fn(),
    reorderLibrary: vi.fn(),
    reorderDockItems: vi.fn(),
    resetDockToDefaults: vi.fn(),
    addFolder: vi.fn(),
    createFolderWithItems: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
    addItemToFolder: vi.fn(),
    removeItemFromFolder: vi.fn(),
    moveItemOutOfFolder: vi.fn(),
    reorderFolderItems: vi.fn(),
  }),
}));

vi.mock('@/context/useCustomWidgets', () => ({
  useCustomWidgets: () => ({
    customWidgets: [],
    customTools: [],
    loading: false,
    saveCustomWidget: vi.fn().mockResolvedValue('id'),
    setPublished: vi.fn().mockResolvedValue(undefined),
    deleteCustomWidget: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/context/useSavedWidgets', () => ({
  useSavedWidgets: () => ({
    savedWidgets: [],
    loading: false,
    saveSavedWidget: vi.fn().mockResolvedValue('id'),
    setPinnedToDock: vi.fn().mockResolvedValue(undefined),
    deleteSavedWidget: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: () => ({
    quizzes: [],
    loading: false,
    error: null,
    saveQuiz: vi.fn().mockResolvedValue({ id: 'q', driveFileId: null }),
    deleteQuiz: vi.fn().mockResolvedValue(undefined),
    importSharedQuiz: vi.fn().mockResolvedValue(undefined),
    attachSyncLinkage: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: () => ({
    importSharedAssignment: vi.fn().mockResolvedValue('assignment-id'),
    peekSharedAssignment: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('@/hooks/useVideoActivity', () => ({
  useVideoActivity: () => ({
    saveActivity: vi.fn().mockResolvedValue({ id: 'va' }),
    attachSyncLinkage: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/hooks/useVideoActivityAssignments', () => ({
  useVideoActivityAssignments: () => ({
    importSharedAssignment: vi.fn().mockResolvedValue('va-assignment-id'),
  }),
}));

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: [], loading: false }),
}));

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploadAndRegisterPdf: vi.fn().mockResolvedValue({
      id: 'pdf',
      storageUrl: '',
      name: 'doc.pdf',
    }),
    uploading: false,
  }),
  MAX_PDF_SIZE_BYTES: 50 * 1024 * 1024,
}));

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({
    driveService: null,
    isConnected: false,
    isInitialized: false,
    refreshGoogleToken: vi.fn().mockResolvedValue(null),
    userDomain: null,
    uploadBackgroundToDrive: vi.fn(),
    getUserBackgroundsFromDrive: vi.fn().mockResolvedValue([]),
    getDriveFileTextContent: vi.fn().mockResolvedValue(''),
    getDriveFileAsBlob: vi.fn().mockResolvedValue(null),
    saveDrawingToDrive: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCatalystSets', () => ({
  useCatalystSets: () => ({
    sets: [],
    loading: false,
    executeRoutine: vi.fn(),
  }),
}));

vi.mock('@/hooks/useNotebookSharing', () => ({
  useNotebookSharing: () => ({
    shareNotebook: vi.fn().mockResolvedValue('share-id'),
    importSharedNotebook: vi.fn().mockResolvedValue('notebook-id'),
  }),
}));

vi.mock('@/hooks/useScreenRecord', () => ({
  useScreenRecord: () => ({
    isRecording: false,
    duration: 0,
    error: null,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  }),
}));

vi.mock('@/hooks/useImageUpload', () => ({
  useImageUpload: () => ({
    processAndUploadImage: vi.fn().mockResolvedValue(''),
    uploading: false,
  }),
}));

// Partial mock: keep the real named exports Sidebar imports
// (readLastSeenVersion / WHATSNEW_* — localStorage-only, no network) and stub
// only the hook so its fetch('/changelog.json') never fires.
vi.mock('@/hooks/useChangelog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useChangelog')>();
  return {
    ...actual,
    useChangelog: () => ({
      entries: [],
      loading: false,
      error: null,
      latestVersion: null,
      entriesSinceCurrent: [],
    }),
  };
});

vi.mock('@/hooks/useAppVersion', () => ({
  useAppVersion: () => ({ updateAvailable: false, reloadApp: vi.fn() }),
}));

vi.mock('@/hooks/useScreenshot', () => ({
  useScreenshot: () => ({
    takeScreenshot: vi.fn(),
    isFlashing: false,
    isCapturing: false,
  }),
}));

// Stub widget bodies + scaling config so the (empty) board's machinery never
// pulls in real widget internals (mirrors dashboardPerf.test.tsx).
vi.mock('@/components/widgets/WidgetLayout', async () => {
  const ReactActual = await import('react');
  const Stub = ({ widget }: { widget: { id: string; type: string } }) =>
    ReactActual.createElement(
      'div',
      { 'data-testid': `stub-widget-${widget.id}` },
      widget.type
    );
  return { WidgetLayout: Stub, WidgetLayoutWrapper: Stub };
});

vi.mock('@/components/widgets/WidgetRegistry', () => ({
  WIDGET_COMPONENTS: {},
  WIDGET_SETTINGS_COMPONENTS: {},
  WIDGET_APPEARANCE_COMPONENTS: {},
  DEFAULT_SCALING_CONFIG: { baseWidth: 300, baseHeight: 200, canSpread: true },
  WIDGET_SCALING_CONFIG: {},
}));

vi.mock('@/utils/youtube', async () => {
  const actual =
    await vi.importActual<typeof import('@/utils/youtube')>('@/utils/youtube');
  return {
    ...actual,
    loadYouTubeApi: (callback: () => void) => callback(),
  };
});

// ─── jsdom environment stubs ─────────────────────────────────────────────────

class ResizeObserverMock {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
  constructor(_callback: ResizeObserverCallback) {
    /* noop */
  }
}

const originalGetBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getBoundingClientRect'
);

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  // jsdom does not implement matchMedia; MyAssignmentsPage (and other UI that
  // checks reduced-motion / breakpoints) reads it on mount.
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get: () => 1000,
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
    configurable: true,
    get: () => 1000,
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      return {
        width: 400,
        height: 200,
        top: 0,
        left: 0,
        right: 400,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    },
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
  if (originalGetBoundingClientRectDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getBoundingClientRect',
      originalGetBoundingClientRectDescriptor
    );
  }
});

// ─── Lazy entry-component imports (named exports, mirroring App.tsx) ──────────

import { ShortLinkRedirect } from '@/components/common/ShortLinkRedirect';
import { SpotifyCallback } from '@/components/spotify/SpotifyCallback';
import { ConverterPage } from '@/components/converter/ConverterPage';
import { PrivacyPolicyPage } from '@/components/legal/PrivacyPolicyPage';
import { TermsOfServicePage } from '@/components/legal/TermsOfServicePage';
import { SupportPage } from '@/components/legal/SupportPage';
import { RequestRolloutPage } from '@/components/landing/RequestRolloutPage';
import { LandingPage } from '@/components/landing/LandingPage';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { StudentApp } from '@/components/student/StudentApp';
import { QuizStudentApp } from '@/components/quiz/QuizStudentApp';
import { NextUpStudentApp } from '@/components/student/NextUpStudentApp';
import { VideoActivityStudentApp } from '@/components/videoActivity/VideoActivityStudentApp';
import { ActivityWallStudentApp } from '@/components/activityWall/ActivityWallStudentApp';
import { ActivityWallGalleryView } from '@/components/activityWall/ActivityWallGalleryView';
import { PollVoteApp } from '@/components/poll/PollVoteApp';
import { MiniAppStudentApp } from '@/components/miniApp/MiniAppStudentApp';
import { GuidedLearningStudentApp } from '@/components/guidedLearning/GuidedLearningStudentApp';
import { StudentLoginPage } from '@/components/student/StudentLoginPage';
import { MyAssignmentsPage } from '@/components/student/MyAssignmentsPage';
import { InviteAcceptance } from '@/components/auth/InviteAcceptance';
import { PlcInviteAcceptance } from '@/components/auth/PlcInviteAcceptance';
import { SubsApp } from '@/components/subs/SubsApp';
import { DashboardView } from '@/components/layout/DashboardView';
import { MobileRemoteView } from '@/components/remote/MobileRemoteView';
import { DashboardContext } from '@/context/DashboardContextValue';
import type { DashboardContextValue } from '@/context/DashboardContextValue';

// Teacher-home mount wrapper: render the REAL DashboardView shell inside the
// legacy DashboardContext.Provider so the canvas hot-slice hooks resolve via
// their `use(DashboardContext)` fallback (see the dashboardValue mock above).
const SignedInTeacherHome: React.FC<Record<string, never>> = () => (
  <DashboardContext.Provider
    value={dashboardValue as unknown as DashboardContextValue}
  >
    <DashboardView />
  </DashboardContext.Provider>
);

// ─── Profiler recorder ───────────────────────────────────────────────────────

interface PageMetric {
  route: string;
  component: string;
  commits?: number;
  medianMountMs?: number;
  runsMs?: number[];
  // First-commit (time-to-first-paint) duration. medianMountMs SUMS every
  // commit in the mount + settle window, so deferring work (React.lazy /
  // Suspense) does NOT lower it — the deferred commit still lands inside the
  // window. firstCommitMedianMs isolates the FIRST synchronous commit (what
  // the user sees painted first), which a lazy-split DOES lower. Recorded as
  // the median first-commit duration across iterations 2..7.
  firstCommitMedianMs?: number;
  firstCommitsMs?: number[];
  error?: string;
}

const metrics: PageMetric[] = [];

/**
 * Flush async work scheduled on mount (auth bootstraps, snapshot deliveries,
 * the fake YouTube onReady, promise chains) so commit attribution is identical
 * run-to-run. Real timers are in effect, so a short delay drains them.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

interface RouteSpec {
  route: string;
  component: string;
  Component: ComponentType<Record<string, never>>;
  /** Path to push before mounting (for pathname/search-driven routes). */
  url?: string;
}

const ITERATIONS = 7;

/**
 * Mount the route's entry component ITERATIONS times inside a <Profiler>,
 * unmounting between each. The first iteration is discarded as warm-up;
 * medianMountMs is the median summed actualDuration of iterations 2..ITERATIONS.
 * `commits` is the commit count from a single representative (final) mount.
 */
async function measureRoute(spec: RouteSpec): Promise<void> {
  const { route, component, Component, url } = spec;
  try {
    if (url) {
      window.history.pushState({}, '', url);
    } else {
      window.history.pushState({}, '', '/');
    }

    const runsMs: number[] = [];
    const firstCommitsMs: number[] = [];
    let lastCommits = 0;

    for (let i = 0; i < ITERATIONS; i++) {
      let commits = 0;
      let duration = 0;
      let firstCommitDuration = 0;
      const onRender: ProfilerOnRenderCallback = (
        _id,
        _phase,
        actualDuration
      ) => {
        // Capture only the FIRST commit's duration (time-to-first-paint).
        if (commits === 0) firstCommitDuration = actualDuration;
        commits += 1;
        duration += actualDuration;
      };

      let unmount: () => void = () => undefined;
      // Guarantee unmount even if render/settle throws, so a failure in one
      // iteration can't leave a component mounted in jsdom and pollute later
      // iterations (or other tests in the file).
      try {
        act(() => {
          const result = render(
            <Profiler id={component} onRender={onRender}>
              <Component />
            </Profiler>
          );
          unmount = result.unmount;
        });
        await settle();
      } finally {
        act(() => {
          unmount();
        });
      }

      runsMs.push(Number(duration.toFixed(3)));
      firstCommitsMs.push(Number(firstCommitDuration.toFixed(3)));
      lastCommits = commits;
    }

    // Discard iteration 1 (warm-up); median over the rest.
    const measured = runsMs.slice(1);
    const measuredFirst = firstCommitsMs.slice(1);
    metrics.push({
      route,
      component,
      commits: lastCommits,
      medianMountMs: Number(median(measured).toFixed(3)),
      runsMs,
      firstCommitMedianMs: Number(median(measuredFirst).toFixed(3)),
      firstCommitsMs,
    });
  } catch (err) {
    metrics.push({
      route,
      component,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Route table ─────────────────────────────────────────────────────────────

const ROUTES: RouteSpec[] = [
  {
    route: '/r/:code',
    component: 'ShortLinkRedirect',
    Component: ShortLinkRedirect as ComponentType<Record<string, never>>,
    url: '/r/abc123',
  },
  {
    route: '/spotify-callback',
    component: 'SpotifyCallback',
    Component: SpotifyCallback as ComponentType<Record<string, never>>,
    url: '/spotify-callback?code=x&state=y',
  },
  {
    route: '/convert',
    component: 'ConverterPage',
    Component: ConverterPage as ComponentType<Record<string, never>>,
    url: '/convert',
  },
  {
    route: '/privacy',
    component: 'PrivacyPolicyPage',
    Component: PrivacyPolicyPage as ComponentType<Record<string, never>>,
    url: '/privacy',
  },
  {
    route: '/terms',
    component: 'TermsOfServicePage',
    Component: TermsOfServicePage as ComponentType<Record<string, never>>,
    url: '/terms',
  },
  {
    route: '/support',
    component: 'SupportPage',
    Component: SupportPage as ComponentType<Record<string, never>>,
    url: '/support',
  },
  {
    route: '/request',
    component: 'RequestRolloutPage',
    Component: RequestRolloutPage as ComponentType<Record<string, never>>,
    url: '/request',
  },
  {
    route: '/',
    component: 'LandingPage',
    Component: LandingPage as ComponentType<Record<string, never>>,
    url: '/',
  },
  {
    route: '/ (signed-out remote)',
    component: 'LoginScreen',
    Component: LoginScreen as ComponentType<Record<string, never>>,
    url: '/remote',
  },
  {
    route: '/join',
    component: 'StudentApp',
    Component: StudentApp as ComponentType<Record<string, never>>,
    url: '/join?code=ABCDE',
  },
  {
    route: '/quiz',
    component: 'QuizStudentApp',
    Component: QuizStudentApp as ComponentType<Record<string, never>>,
    url: '/quiz?code=ABCDE',
  },
  {
    route: '/nextup',
    component: 'NextUpStudentApp',
    Component: NextUpStudentApp as ComponentType<Record<string, never>>,
    url: '/nextup?id=widget-1',
  },
  {
    route: '/activity',
    component: 'VideoActivityStudentApp',
    Component: VideoActivityStudentApp as ComponentType<Record<string, never>>,
    url: '/activity?code=ABCDE',
  },
  {
    route: '/activity-wall',
    component: 'ActivityWallStudentApp',
    Component: ActivityWallStudentApp as ComponentType<Record<string, never>>,
    url: '/activity-wall?data=e30=',
  },
  {
    route: '/activity-wall/gallery/:shareId',
    component: 'ActivityWallGalleryView',
    Component: ActivityWallGalleryView as ComponentType<Record<string, never>>,
    url: '/activity-wall/gallery/share-1',
  },
  {
    route: '/poll',
    component: 'PollVoteApp',
    Component: PollVoteApp as ComponentType<Record<string, never>>,
    url: '/poll?data=e30=',
  },
  {
    route: '/miniapp/:id',
    component: 'MiniAppStudentApp',
    Component: MiniAppStudentApp as ComponentType<Record<string, never>>,
    url: '/miniapp/app-1',
  },
  {
    route: '/guided-learning/:id',
    component: 'GuidedLearningStudentApp',
    Component: GuidedLearningStudentApp as ComponentType<Record<string, never>>,
    url: '/guided-learning/session-1',
  },
  {
    route: '/student/login',
    component: 'StudentLoginPage',
    Component: StudentLoginPage as ComponentType<Record<string, never>>,
    url: '/student/login',
  },
  {
    route: '/my-assignments',
    component: 'MyAssignmentsPage',
    Component: MyAssignmentsPage as ComponentType<Record<string, never>>,
    url: '/my-assignments',
  },
  {
    route: '/invite/:token',
    component: 'InviteAcceptance',
    Component: InviteAcceptance as ComponentType<Record<string, never>>,
    url: '/invite/token-1',
  },
  {
    route: '/plc-invite/:id',
    component: 'PlcInviteAcceptance',
    Component: PlcInviteAcceptance as ComponentType<Record<string, never>>,
    url: '/plc-invite/invite-1',
  },
  {
    route: '/subs',
    component: 'SubsApp',
    Component: SubsApp as ComponentType<Record<string, never>>,
    url: '/subs',
  },
  {
    route: '/ (signed-in teacher)',
    component: 'DashboardView',
    Component: SignedInTeacherHome,
    url: '/',
  },
  {
    // Signed-in /remote (App.tsx → AuthenticatedApp isRemote → MobileRemoteView).
    // Reads the same mocked useDashboard/useAuth as the teacher home; with an
    // empty board it renders the remote shell and no RemoteWidgetCard rows.
    // useRemoteConnection is self-contained (browser online/offline only, no
    // network), so it runs unmocked.
    route: '/remote (signed-in)',
    component: 'MobileRemoteView',
    Component: MobileRemoteView as ComponentType<Record<string, never>>,
    url: '/remote',
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('page-load performance baseline', () => {
  for (const spec of ROUTES) {
    it(`${spec.component} (${spec.route}) mounts and is measured`, async () => {
      await measureRoute(spec);
      const m = metrics.find(
        (x) => x.route === spec.route && x.component === spec.component
      );
      expect(m).toBeDefined();
      // Fail the test if a component couldn't mount. The catch in measureRoute
      // still records the message into the JSON (afterAll writes it even when a
      // test fails) so you can see WHICH route broke and why — but a harness
      // that hides render errors behind a green run is useless as a regression
      // guard, so the assertion must fail loudly when error is set.
      expect(m?.error).toBeUndefined();
      expect(m?.commits).toBeGreaterThan(0);
      expect(m?.runsMs).toHaveLength(ITERATIONS);
      expect(m?.medianMountMs).toBeGreaterThanOrEqual(0);
      expect(m?.firstCommitsMs).toHaveLength(ITERATIONS);
      expect(m?.firstCommitMedianMs).toBeGreaterThanOrEqual(0);
    }, 30000);
  }
});

// ─── Results file ────────────────────────────────────────────────────────────

afterAll(() => {
  // The baseline JSON is a committed reference snapshot. Rewriting it on every
  // run dirties git status with a fresh `generatedAt` + machine-dependent ms
  // values, so the write is opt-in: a plain `pnpm test:perf` only asserts the
  // metrics, and you regenerate the committed reference deliberately with
  // `WRITE_PERF_BASELINE=1 pnpm test:perf`.
  if (!process.env.WRITE_PERF_BASELINE) return;
  // Vitest serves test modules over a non-file URL, so import.meta.url can't be
  // used for paths — resolve from the repo root (vitest's cwd) instead.
  const resultsDir = resolve(process.cwd(), 'tests/perf/results');
  mkdirSync(resultsDir, { recursive: true });
  // Preserve the route-table order in the output regardless of test ordering.
  const ordered = ROUTES.map(
    (spec) =>
      metrics.find(
        (m) => m.route === spec.route && m.component === spec.component
      ) ?? { route: spec.route, component: spec.component, error: 'not run' }
  );
  writeFileSync(
    join(resultsDir, 'page-load-baseline.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        runCommand: 'WRITE_PERF_BASELINE=1 pnpm test:perf',
        note:
          'Profiler commit counts are the deterministic primary metric and ' +
          'must be identical across runs. Each page is mounted 7 times ' +
          '(unmounting between each); iteration 1 is discarded as warm-up and ' +
          'medianMountMs is the median summed actualDuration of iterations ' +
          '2..7. runsMs lists all 7 raw per-iteration durations. ' +
          'firstCommitMedianMs isolates the FIRST commit (time-to-first-' +
          'paint): unlike medianMountMs (which SUMS the whole settle window, ' +
          'so deferring work via React.lazy/Suspense does not lower it), the ' +
          'first-commit duration drops when synchronous mount work is split ' +
          'out behind Suspense. firstCommitsMs lists all 7 raw values. ' +
          'actualDurationMs is machine-dependent and indicative only — ' +
          'compare medians of 3 runs. All Firebase/session dependencies are ' +
          'mocked so each route renders its real (loaded/empty) UI tree ' +
          'synchronously, with no network and no perpetual loaders. ' +
          'The "/ (signed-in teacher)" page mounts the REAL DashboardView ' +
          'shell (Sidebar + Dock + empty BoardCanvas) with an EMPTY board ' +
          '(0 widgets), so it measures the teacher page-load skeleton, not ' +
          'loaded board content. It is mounted inside the legacy ' +
          'DashboardContext.Provider with a stubbed useDashboard() value so ' +
          'the canvas hot-slice hooks resolve via their use(DashboardContext) ' +
          'fallback; no DashboardProvider/Firestore subscriptions are booted.',
        pages: ordered,
      },
      null,
      2
    ) + '\n'
  );
});
