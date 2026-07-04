/**
 * Regression test for: Dock render loop uses canAccessWidget for InternalToolType
 *
 * Bug: The dock item render loop called `canAccessWidget(tool.type as WidgetType)`
 * for ALL tools, including InternalToolType tools like `record`, `magic`, and `remote`.
 * The correct check for those is `canAccessTool(type)` which routes them to
 * `canAccessFeature(...)`.
 *
 * Consequence: A FeaturePermission record for `record` with `enabled: false` would
 * suppress the Record button via the wrong widget permission check, even if
 * `canAccessFeature('screen-recording')` returns true (the correct gate).
 *
 * Fix: Replace `canAccessWidget(tool.type as WidgetType)` with `canAccessTool(tool.type)`
 * at the top of the dock items render loop.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Dock } from '@/components/layout/Dock';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? key,
  }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

// F9 — Dock now reads tool-visibility fields from a separate context.
vi.mock('@/context/useToolVisibility', () => ({
  useToolVisibility: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/context/useCustomWidgets', () => ({
  useCustomWidgets: vi.fn(),
}));

vi.mock('@/context/useSavedWidgets', () => ({
  useSavedWidgets: vi.fn(),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: vi.fn(),
}));

vi.mock('@/hooks/useLiveSession', () => ({
  useLiveSession: vi.fn(),
}));

vi.mock('@/hooks/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

vi.mock('@/hooks/useDragScroll', () => ({
  useDragScroll: vi.fn(),
}));

vi.mock('@/hooks/useScreenRecord', () => ({
  useScreenRecord: vi.fn(),
}));

vi.mock('@/hooks/useNotebookSharing', () => ({
  useNotebookSharing: vi.fn(),
}));

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: vi.fn(),
}));

vi.mock('@/hooks/useCatalystSets', () => ({
  useCatalystSets: vi.fn(),
}));

vi.mock('@/hooks/useImageUpload', () => ({
  useImageUpload: vi.fn(),
}));

vi.mock('@/utils/widgetDragFlag', () => ({
  beginWidgetDrag: vi.fn(),
  endWidgetDrag: vi.fn(),
}));

// Mock heavy sub-components to keep the test focused on the permission logic
vi.mock('@/components/layout/dock/WidgetLibrary', () => {
  const WidgetLibraryMock = React.forwardRef<HTMLDivElement>(() => (
    <div data-testid="widget-library" />
  ));
  WidgetLibraryMock.displayName = 'WidgetLibrary';
  return { WidgetLibrary: WidgetLibraryMock };
});

vi.mock('@/components/layout/dock/ToolDockItem', () => ({
  ToolDockItem: ({ tool }: { tool: { type: string; label: string } }) => (
    <button data-testid={`dock-item-${tool.type}`}>{tool.label}</button>
  ),
}));

vi.mock('@/components/layout/dock/FolderItem', () => ({
  FolderItem: () => <div data-testid="folder-item" />,
}));

vi.mock('@/components/layout/dock/DockIcon', () => ({
  DockIcon: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dock-icon">{children}</div>
  ),
}));

vi.mock('@/components/layout/dock/DockLabel', () => ({
  DockLabel: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@/components/layout/dock/QuickAccessButton', () => ({
  QuickAccessButton: () => <div data-testid="quick-access-button" />,
}));

vi.mock('@/components/layout/dock/SavedWidgetDockItem', () => ({
  SavedWidgetDockItem: () => <div data-testid="saved-widget-dock-item" />,
}));

vi.mock('@/components/layout/dock/RenameFolderModal', () => ({
  RenameFolderModal: () => <div data-testid="rename-folder-modal" />,
}));

vi.mock('@/components/layout/dock/MagicLayoutModal', () => ({
  MagicLayoutModal: () => <div data-testid="magic-layout-modal" />,
}));

vi.mock('@/components/layout/dock/SmartPastePickerModal', () => ({
  SmartPastePickerModal: () => <div data-testid="smart-paste-picker-modal" />,
}));

vi.mock('@/components/layout/dock/UrlPickerModal', () => ({
  UrlPickerModal: () => <div data-testid="url-picker-modal" />,
}));

vi.mock('@/components/layout/dock/ImagePastePickerModal', () => ({
  ImagePastePickerModal: () => <div data-testid="image-paste-picker-modal" />,
}));

vi.mock('@/components/layout/ClassRosterMenu', () => ({
  default: () => <div data-testid="class-roster-menu" />,
}));

vi.mock('@/components/layout/RemoteControlMenu', () => ({
  default: () => <div data-testid="remote-control-menu" />,
}));

vi.mock('@/components/widgets/Catalyst/CatalystSetPickerPopover', () => ({
  CatalystSetPickerPopover: () => (
    <div data-testid="catalyst-set-picker-popover" />
  ),
}));

vi.mock('@/components/common/GlassCard', () => {
  const GlassCardMock = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & {
      children?: React.ReactNode;
      globalStyle?: unknown;
      transparency?: number;
      allowInvisible?: boolean;
      cornerRadius?: unknown;
    }
  >(({ children, className, style }, ref) => (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  ));
  GlassCardMock.displayName = 'GlassCard';
  return { GlassCard: GlassCardMock };
});

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(),
  rectIntersection: vi.fn(() => []),
  MouseSensor: vi.fn(),
  TouchSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  DragOverlay: () => null,
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  horizontalListSortingStrategy: vi.fn(),
  verticalListSortingStrategy: vi.fn(),
  arrayMove: vi.fn(),
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useDashboard } from '@/context/useDashboard';
import { useToolVisibility } from '@/context/useToolVisibility';
import { useAuth } from '@/context/useAuth';
import { useCustomWidgets } from '@/context/useCustomWidgets';
import { useSavedWidgets } from '@/context/useSavedWidgets';
import { useDialog } from '@/context/useDialog';
import { useLiveSession } from '@/hooks/useLiveSession';
import { useScreenRecord } from '@/hooks/useScreenRecord';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useCatalystSets } from '@/hooks/useCatalystSets';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useNotebookSharing } from '@/hooks/useNotebookSharing';
import type { DockFolder } from '@/types';

type MockDockItem =
  | { type: 'tool'; toolType: string }
  | { type: 'folder'; folder: DockFolder };

// ── Helpers ───────────────────────────────────────────────────────────────

/** Wire up all required hook mocks with safe defaults. */
function setupMocks({
  canAccessWidget = vi.fn().mockReturnValue(true),
  canAccessFeature = vi.fn().mockReturnValue(true),
  dockItems = [] as MockDockItem[],
}: {
  canAccessWidget?: ReturnType<typeof vi.fn>;
  canAccessFeature?: ReturnType<typeof vi.fn>;
  dockItems?: MockDockItem[];
} = {}) {
  vi.mocked(useDashboard).mockReturnValue({
    addWidget: vi.fn(),
    removeWidget: vi.fn(),
    removeWidgets: vi.fn(),
    activeDashboard: null,
    updateWidget: vi.fn(),
    addToast: vi.fn(),
    setPendingQuizShareId: vi.fn(),
    setPendingAssignmentShareId: vi.fn(),
  } as unknown as ReturnType<typeof useDashboard>);

  // F9 — tool-visibility fields now live on their own context.
  vi.mocked(useToolVisibility).mockReturnValue({
    visibleTools: [],
    dockItems,
    libraryOrder: [],
    reorderDockItems: vi.fn(),
    toggleToolVisibility: vi.fn(),
    reorderLibrary: vi.fn(),
    addFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
    addItemToFolder: vi.fn(),
    moveItemOutOfFolder: vi.fn(),
    reorderFolderItems: vi.fn(),
  } as unknown as ReturnType<typeof useToolVisibility>);

  vi.mocked(useAuth).mockReturnValue({
    canAccessWidget,
    canAccessFeature,
    user: { uid: 'test-uid', email: 'test@test.com' },
    userGradeLevels: [],
    selectedBuildings: [],
    featurePermissions: [],
    dockPosition: 'bottom',
  } as unknown as ReturnType<typeof useAuth>);

  vi.mocked(useCustomWidgets).mockReturnValue({
    customWidgets: [],
  } as unknown as ReturnType<typeof useCustomWidgets>);

  vi.mocked(useSavedWidgets).mockReturnValue({
    savedWidgets: [],
    setPinnedToDock: vi.fn(),
    deleteSavedWidget: vi.fn(),
  } as unknown as ReturnType<typeof useSavedWidgets>);

  vi.mocked(useDialog).mockReturnValue({
    showConfirm: vi.fn(),
  } as unknown as ReturnType<typeof useDialog>);

  vi.mocked(useLiveSession).mockReturnValue({
    session: null,
    students: [],
  } as unknown as ReturnType<typeof useLiveSession>);

  vi.mocked(useScreenRecord).mockReturnValue({
    isRecording: false,
    duration: 0,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  } as unknown as ReturnType<typeof useScreenRecord>);

  vi.mocked(useGoogleDrive).mockReturnValue({
    driveService: null,
    isConnected: false,
  } as unknown as ReturnType<typeof useGoogleDrive>);

  vi.mocked(useCatalystSets).mockReturnValue({
    sets: [],
    executeRoutine: vi.fn(),
  } as unknown as ReturnType<typeof useCatalystSets>);

  vi.mocked(useImageUpload).mockReturnValue({
    processAndUploadImage: vi.fn(),
  } as unknown as ReturnType<typeof useImageUpload>);

  vi.mocked(useNotebookSharing).mockReturnValue({
    importSharedNotebookCopy: vi.fn(),
  } as unknown as ReturnType<typeof useNotebookSharing>);
}

/** Expand the dock so the tool items are visible. */
function expandDock() {
  const openButton = screen.getByTitle('sidebar.header.openTools');
  fireEvent.click(openButton);
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Dock – InternalToolType permission gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the Record button when canAccessFeature("screen-recording") is true, even when canAccessWidget returns false for "record"', () => {
    /**
     * Regression: Before the fix, the dock render loop called
     * `canAccessWidget(tool.type as WidgetType)` for ALL tools including
     * InternalToolType tools like `record`. When an admin created a
     * FeaturePermission record with widgetType='record' and enabled=false,
     * `canAccessWidget('record')` returned false — hiding the button even
     * though `canAccessFeature('screen-recording')` returned true.
     *
     * After the fix, `canAccessTool(tool.type)` is called instead, which
     * correctly routes 'record' → canAccessFeature('screen-recording').
     */
    const canAccessWidget = vi.fn().mockImplementation((type: string) => {
      // Simulate a FeaturePermission record for 'record' with enabled: false
      if (type === 'record') return false;
      return true;
    });
    const canAccessFeature = vi.fn().mockImplementation((feature: string) => {
      // screen-recording is accessible
      if (feature === 'screen-recording') return true;
      return false;
    });

    setupMocks({
      canAccessWidget,
      canAccessFeature,
      dockItems: [{ type: 'tool', toolType: 'record' }],
    });

    render(<Dock />);
    expandDock();

    // The Record dock item should be visible because the correct gate
    // (canAccessFeature('screen-recording')) returns true.
    expect(screen.getByTestId('dock-item-record')).toBeInTheDocument();
  });

  it('hides the Record button when canAccessFeature("screen-recording") is false', () => {
    const canAccessWidget = vi.fn().mockReturnValue(true);
    const canAccessFeature = vi.fn().mockImplementation((feature: string) => {
      if (feature === 'screen-recording') return false;
      return true;
    });

    setupMocks({
      canAccessWidget,
      canAccessFeature,
      dockItems: [{ type: 'tool', toolType: 'record' }],
    });

    render(<Dock />);
    expandDock();

    // When canAccessFeature('screen-recording') is false, the Record button
    // should NOT appear regardless of canAccessWidget.
    expect(screen.queryByTestId('dock-item-record')).not.toBeInTheDocument();
  });

  it('shows a regular widget button when canAccessWidget returns true', () => {
    const canAccessWidget = vi.fn().mockReturnValue(true);
    const canAccessFeature = vi.fn().mockReturnValue(true);

    setupMocks({
      canAccessWidget,
      canAccessFeature,
      dockItems: [{ type: 'tool', toolType: 'clock' }],
    });

    render(<Dock />);
    expandDock();

    expect(screen.getByTestId('dock-item-clock')).toBeInTheDocument();
  });

  it('hides a regular widget button when canAccessWidget returns false', () => {
    const canAccessWidget = vi.fn().mockImplementation((type: string) => {
      if (type === 'clock') return false;
      return true;
    });
    const canAccessFeature = vi.fn().mockReturnValue(true);

    setupMocks({
      canAccessWidget,
      canAccessFeature,
      dockItems: [{ type: 'tool', toolType: 'clock' }],
    });

    render(<Dock />);
    expandDock();

    expect(screen.queryByTestId('dock-item-clock')).not.toBeInTheDocument();
  });

  it('renders a folder when at least one of its items is accessible', () => {
    const canAccessWidget = vi.fn().mockImplementation((type: string) => {
      if (type === 'time-tool') return false;
      return true;
    });
    const canAccessFeature = vi.fn().mockReturnValue(true);
    const folder: DockFolder = {
      id: 'folder-1',
      name: 'My Folder',
      items: ['clock', 'time-tool'],
    };

    setupMocks({
      canAccessWidget,
      canAccessFeature,
      dockItems: [{ type: 'folder', folder }],
    });

    render(<Dock />);
    expandDock();

    expect(screen.getByTestId('folder-item')).toBeInTheDocument();
  });

  it('hides a folder entirely when every one of its items is inaccessible', () => {
    // Mirrors the top-level `if (!tool || !canAccessTool(tool.type)) return
    // null;` guard: a folder whose contents are all permission-gated must
    // be just as invisible as a single gated widget, not merely empty when
    // opened.
    const canAccessWidget = vi.fn().mockReturnValue(false);
    const canAccessFeature = vi.fn().mockReturnValue(false);
    const folder: DockFolder = {
      id: 'folder-1',
      name: 'My Folder',
      items: ['clock', 'time-tool'],
    };

    setupMocks({
      canAccessWidget,
      canAccessFeature,
      dockItems: [{ type: 'folder', folder }],
    });

    render(<Dock />);
    expandDock();

    expect(screen.queryByTestId('folder-item')).not.toBeInTheDocument();
  });
});

// ── Regression: spurious processAndUploadImage dep in smart-paste useEffect ──
//
// Bug: `processAndUploadImage` was listed in the deps array of the smart-paste
// `useEffect` in Dock.tsx even though it is never called inside the effect
// body (it is only used in a JSX click handler at line ~839).
//
// `processAndUploadImage` is wrapped in `useCallback([user, uploadSticker,
// uploadFn])` inside `useImageUpload`, so it gets a NEW identity every time
// auth state changes (sign-in / sign-out).  Including it in the effect deps
// causes the paste listener to be torn down and re-registered on every auth
// state change — an unnecessary churn that briefly leaves the board without a
// paste handler.
//
// Fix: remove `processAndUploadImage` from the deps array.
// After the fix the listener must NOT be torn down when only
// `processAndUploadImage` changes identity.

describe('Dock smart-paste – processAndUploadImage is not a spurious dep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Restore window.addEventListener / removeEventListener spies even if a test
  // throws before reaching its assertions, so a failure can't leak the spy into
  // sibling tests.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT remove/re-add the paste listener when processAndUploadImage identity changes', () => {
    // Spy on the window event listener methods BEFORE rendering.
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    // setupMocks() internally mocks useImageUpload with a fresh vi.fn(), so it
    // must run BEFORE we set the fnA return value below — otherwise it would
    // overwrite fnA and the first render would not use it.
    setupMocks();

    // --- First render with processAndUploadImage = fnA ---
    const fnA = vi.fn();
    vi.mocked(useImageUpload).mockReturnValue({
      processAndUploadImage: fnA,
      uploading: false,
    } as unknown as ReturnType<typeof useImageUpload>);

    const { rerender } = render(<Dock />);

    // Count how many times the paste listener was added on initial render.
    const addCountAfterMount = addSpy.mock.calls.filter(
      ([event]) => event === 'paste'
    ).length;
    expect(addCountAfterMount).toBe(1);

    const removeCountAfterMount = removeSpy.mock.calls.filter(
      ([event]) => event === 'paste'
    ).length;
    expect(removeCountAfterMount).toBe(0);

    // Reset spy counts so we only measure what happens on the re-render.
    addSpy.mockClear();
    removeSpy.mockClear();

    // --- Re-render with processAndUploadImage = fnB (new identity) ---
    // This simulates what happens when the user signs in/out and useAuth
    // gives back a new `user` object, causing useImageUpload to return a
    // new `processAndUploadImage` callback reference.
    const fnB = vi.fn(); // different reference, same signature
    vi.mocked(useImageUpload).mockReturnValue({
      processAndUploadImage: fnB,
      uploading: false,
    } as unknown as ReturnType<typeof useImageUpload>);

    rerender(<Dock />);

    // BUG (before fix): the effect would see the new `processAndUploadImage`
    // reference in its deps, call cleanup (removeEventListener), then
    // re-register (addEventListener) — both counts would be 1.
    //
    // CORRECT (after fix): `processAndUploadImage` is NOT in the deps array,
    // so the effect does NOT re-run — both counts stay at 0.
    const removeCountAfterRerender = removeSpy.mock.calls.filter(
      ([event]) => event === 'paste'
    ).length;
    const addCountAfterRerender = addSpy.mock.calls.filter(
      ([event]) => event === 'paste'
    ).length;

    expect(removeCountAfterRerender).toBe(0);
    expect(addCountAfterRerender).toBe(0);
    // Spies are restored by the afterEach above (vi.restoreAllMocks).
  });
});

// ── Regression: unstable onError inline arrow causes startRecording churn ────
//
// Bug: `onError` was defined as an inline arrow function inside the
// `useScreenRecord(...)` call in Dock.tsx, giving it a new identity every
// render. useScreenRecord now owns stability via render-body refs so
// startRecording is unconditionally stable regardless of onError identity, but
// Dock.tsx still wraps handleRecordingError in useCallback([addToast]) as good
// practice — the test below guards that.
//
// The listener-stability test verifies the correct useEffect behavior: when
// startRecording / stopRecording / isRecording are all stable across a
// re-render, the spart-screen-record-toggle/-query listeners are not torn down
// and re-registered.

describe('Dock screen-record – startRecording identity is stable across unrelated re-renders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT remove/re-add the spart-screen-record-toggle listener when startRecording identity is stable', () => {
    // Spy on window event listener methods BEFORE rendering so we capture every
    // call made during mount and re-renders.
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    setupMocks();

    // Give useScreenRecord a stable startRecording reference (the fn identity
    // must NOT change between renders — simulating the fix being in place).
    const stableStartRecording = vi.fn();
    const stableStopRecording = vi.fn();
    vi.mocked(useScreenRecord).mockReturnValue({
      isRecording: false,
      duration: 0,
      startRecording: stableStartRecording,
      stopRecording: stableStopRecording,
      error: null,
    } as unknown as ReturnType<typeof useScreenRecord>);

    const { rerender } = render(<Dock />);

    // After initial mount the listeners should have been added exactly once.
    const addToggleAfterMount = addSpy.mock.calls.filter(
      ([event]) => event === 'spart-screen-record-toggle'
    ).length;
    const addQueryAfterMount = addSpy.mock.calls.filter(
      ([event]) => event === 'spart-screen-record-query'
    ).length;
    expect(addToggleAfterMount).toBe(1);
    expect(addQueryAfterMount).toBe(1);

    // No removals yet.
    expect(
      removeSpy.mock.calls.filter(
        ([event]) => event === 'spart-screen-record-toggle'
      ).length
    ).toBe(0);

    // Reset spy counts so we only measure what happens on the re-render.
    addSpy.mockClear();
    removeSpy.mockClear();

    // Trigger an unrelated Dock re-render by keeping the same mock for
    // useScreenRecord so that startRecording / stopRecording / isRecording are
    // all unchanged.
    vi.mocked(useScreenRecord).mockReturnValue({
      isRecording: false,
      duration: 0,
      startRecording: stableStartRecording, // same reference
      stopRecording: stableStopRecording, // same reference
      error: null,
    } as unknown as ReturnType<typeof useScreenRecord>);

    rerender(<Dock />);

    // BUG (before fix): startRecording was a new reference on every render
    // (because onError inline arrow → new options object → new startRecording).
    // The useEffect would see the new reference in its deps, call cleanup
    // (removeEventListener) and re-register (addEventListener) — counts each 1.
    //
    // CORRECT (after fix): startRecording identity is stable across unrelated
    // re-renders, so the useEffect does NOT re-run — both counts stay at 0.
    const removeToggleAfterRerender = removeSpy.mock.calls.filter(
      ([event]) => event === 'spart-screen-record-toggle'
    ).length;
    const removeQueryAfterRerender = removeSpy.mock.calls.filter(
      ([event]) => event === 'spart-screen-record-query'
    ).length;
    const addToggleAfterRerender = addSpy.mock.calls.filter(
      ([event]) => event === 'spart-screen-record-toggle'
    ).length;
    const addQueryAfterRerender = addSpy.mock.calls.filter(
      ([event]) => event === 'spart-screen-record-query'
    ).length;

    expect(removeToggleAfterRerender).toBe(0);
    expect(removeQueryAfterRerender).toBe(0);
    expect(addToggleAfterRerender).toBe(0);
    expect(addQueryAfterRerender).toBe(0);
  });

  it('passes a stable onError reference to useScreenRecord across unrelated re-renders', () => {
    setupMocks();

    // Capture the options object passed to useScreenRecord on each call so we
    // can assert onError identity is stable (i.e. handleRecordingError is a
    // stable useCallback, not a new inline arrow per render).
    const capturedOnError: Array<unknown> = [];
    vi.mocked(useScreenRecord).mockImplementation((opts = {}) => {
      capturedOnError.push(opts.onError);
      return {
        isRecording: false,
        duration: 0,
        startRecording: vi.fn(),
        stopRecording: vi.fn(),
        error: null,
      } as unknown as ReturnType<typeof useScreenRecord>;
    });

    const { rerender } = render(<Dock />);
    rerender(<Dock />);

    // handleRecordingError is defined via useCallback([addToast]) in Dock.tsx.
    // Its reference must be stable — an inline arrow would be a new ref every
    // render. With the old hook implementation, an unstable onError caused
    // startRecording to churn; with the current render-body-ref implementation
    // it no longer does, but stability here is still good practice.
    expect(capturedOnError.length).toBeGreaterThanOrEqual(2);
    expect(capturedOnError[0]).toBe(capturedOnError[1]);
  });
});

// ── Regression: handlePaste guard missing 'SELECT' ────────────────────────
//
// Bug: The isTypingField guard in handlePaste checked only INPUT and TEXTAREA
// (plus isContentEditable), but omitted SELECT.  Every other keyboard/paste
// guard in the codebase includes SELECT:
//   DashboardView.tsx – lines 1220-1222
//   SettingsPanel.tsx  – lines 170-173
//
// Consequence: pasting while a <select> element has focus fires the global
// paste handler, which tries to interpret clipboard text as a widget-creation
// command.  Because SELECT elements receive paste events that bubble to
// window, this causes accidental widget creation or smart-paste modal
// display when the user is merely interacting with a dropdown.
//
// Fix: add 'SELECT' to the tagName array so the guard is consistent with the
// rest of the codebase.

describe('Dock smart-paste – SELECT element is excluded from paste interception', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT intercept a paste event whose target is a SELECT element', () => {
    // Override canAccessFeature so the smart-paste useEffect actually registers,
    // and capture addWidget to assert it is never called.
    const addWidgetSpy = vi.fn();
    const addToastSpy = vi.fn();

    setupMocks();

    vi.mocked(useAuth).mockReturnValue({
      canAccessWidget: vi.fn().mockReturnValue(true),
      canAccessFeature: vi.fn().mockReturnValue(true),
      user: { uid: 'test-uid', email: 'test@test.com' },
      userGradeLevels: [],
      selectedBuildings: [],
      featurePermissions: [],
      dockPosition: 'bottom',
    } as unknown as ReturnType<typeof useAuth>);

    vi.mocked(useDashboard).mockReturnValue({
      addWidget: addWidgetSpy,
      removeWidget: vi.fn(),
      removeWidgets: vi.fn(),
      visibleTools: [],
      dockItems: [],
      reorderDockItems: vi.fn(),
      activeDashboard: null,
      updateWidget: vi.fn(),
      toggleToolVisibility: vi.fn(),
      reorderLibrary: vi.fn(),
      libraryOrder: [],
      addFolder: vi.fn(),
      renameFolder: vi.fn(),
      deleteFolder: vi.fn(),
      addItemToFolder: vi.fn(),
      moveItemOutOfFolder: vi.fn(),
      reorderFolderItems: vi.fn(),
      addToast: addToastSpy,
      setPendingQuizShareId: vi.fn(),
      setPendingAssignmentShareId: vi.fn(),
    } as unknown as ReturnType<typeof useDashboard>);

    render(<Dock />);

    // Simulate a paste event whose target is a <select> element.
    // JSDOM does not expose ClipboardEvent as a global constructor, so we
    // manually invoke the registered window 'paste' handler by spying on
    // window.addEventListener to capture it, then calling it directly.
    const selectEl = document.createElement('select');
    document.body.appendChild(selectEl);

    // Capture the paste handler that Dock registers via useEffect.
    const pasteHandlers: EventListenerOrEventListenerObject[] = [];
    const origAdd = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation(
      (
        type: string,
        handler: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
      ) => {
        if (type === 'paste') pasteHandlers.push(handler);
        origAdd(type, handler, options);
      }
    );

    // Re-render so that the useEffect fires and registers via our spy.
    const { unmount } = render(<Dock />);

    // We should have captured exactly one paste handler.
    expect(pasteHandlers.length).toBe(1);

    // Call it directly with a synthetic event object whose target is SELECT
    // and whose clipboardData would match a YouTube URL (normally widget-worthy).
    const fakeEvent = {
      target: selectEl,
      defaultPrevented: false,
      clipboardData: {
        files: { length: 0 },
        getData: () => 'https://youtu.be/dQw4w9WgXcQ',
      },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;

    const handler = pasteHandlers[0];
    if (typeof handler === 'function') {
      handler(fakeEvent);
    } else {
      handler.handleEvent(fakeEvent);
    }

    // With the bug: addWidget or addToast would be called because SELECT was
    // absent from the guard and the YouTube URL would be detected as a widget.
    // After the fix: neither must be called — the handler returns early.
    expect(addWidgetSpy).not.toHaveBeenCalled();
    expect(addToastSpy).not.toHaveBeenCalled();

    document.body.removeChild(selectEl);
    unmount();
  });
});
