// Regression test for: closing the Widget Library while in edit mode left
// the Dock stuck in edit mode (jiggling items, no visible way out) because
// WidgetLibrary's onClose prop only reset showMoreMenu/showLibrary, never
// isEditMode. Fix: a shared closeLibraryAndEditMode callback resets all
// three together, reused by both click-outside and the library's onClose.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Dock } from '@/components/layout/Dock';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? key,
  }),
}));

vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('@/context/useToolVisibility', () => ({ useToolVisibility: vi.fn() }));
vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/context/useCustomWidgets', () => ({ useCustomWidgets: vi.fn() }));
vi.mock('@/context/useSavedWidgets', () => ({ useSavedWidgets: vi.fn() }));
vi.mock('@/context/useDialog', () => ({ useDialog: vi.fn() }));
vi.mock('@/hooks/useLiveSession', () => ({ useLiveSession: vi.fn() }));
vi.mock('@/hooks/useClickOutside', () => ({ useClickOutside: vi.fn() }));
vi.mock('@/hooks/useDragScroll', () => ({ useDragScroll: vi.fn() }));
vi.mock('@/hooks/useScreenRecord', () => ({ useScreenRecord: vi.fn() }));
vi.mock('@/hooks/useNotebookSharing', () => ({ useNotebookSharing: vi.fn() }));
vi.mock('@/hooks/useGoogleDrive', () => ({ useGoogleDrive: vi.fn() }));
vi.mock('@/hooks/useCatalystSets', () => ({ useCatalystSets: vi.fn() }));
vi.mock('@/hooks/useImageUpload', () => ({ useImageUpload: vi.fn() }));
vi.mock('@/utils/widgetDragFlag', () => ({
  beginWidgetDrag: vi.fn(),
  endWidgetDrag: vi.fn(),
}));

// A thin stand-in that exposes the live isEditMode prop via a data attribute
// (instead of a module-level mutable variable) so the test can both drive
// onEnterEditMode/onClose and assert on isEditMode purely through the DOM.
vi.mock('@/components/layout/dock/WidgetLibrary', () => {
  const WidgetLibraryMock = React.forwardRef<
    HTMLDivElement,
    {
      isEditMode: boolean;
      onEnterEditMode?: () => void;
      onClose: () => void;
    }
  >((props, ref) => {
    return (
      <div
        ref={ref}
        data-testid="widget-library"
        data-editmode={String(props.isEditMode)}
      >
        <button
          data-testid="library-enter-edit-mode"
          onClick={props.onEnterEditMode}
        >
          Edit
        </button>
        <button data-testid="library-close" onClick={props.onClose}>
          Close
        </button>
      </div>
    );
  });
  WidgetLibraryMock.displayName = 'WidgetLibrary';
  return { WidgetLibrary: WidgetLibraryMock };
});

vi.mock('@/components/layout/dock/ToolDockItem', () => ({
  ToolDockItem: ({
    tool,
    isEditMode,
  }: {
    tool: { type: string; label: string };
    isEditMode: boolean;
  }) => (
    <button
      data-testid={`dock-item-${tool.type}`}
      data-editmode={String(isEditMode)}
    >
      {tool.label}
    </button>
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

function setupMocks() {
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

  vi.mocked(useToolVisibility).mockReturnValue({
    visibleTools: ['clock'],
    dockItems: [{ type: 'tool', toolType: 'clock' }],
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
    canAccessWidget: vi.fn().mockReturnValue(true),
    canAccessFeature: vi.fn().mockReturnValue(true),
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

function expandDock() {
  const openButton = screen.getByTitle('sidebar.header.openTools');
  fireEvent.click(openButton);
}

describe('Dock – closing the Widget Library also exits edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resets isEditMode when the library is closed via its own close button', () => {
    setupMocks();
    render(<Dock />);
    expandDock();

    // Open the library via the "More" button (browse mode, isEditMode=false).
    fireEvent.click(screen.getByTitle('sidebar.header.moreWidgets'));
    expect(screen.getByTestId('widget-library')).toBeInTheDocument();

    // Long-press-equivalent: enter edit mode from inside the library.
    fireEvent.click(screen.getByTestId('library-enter-edit-mode'));
    expect(screen.getByTestId('widget-library')).toHaveAttribute(
      'data-editmode',
      'true'
    );
    expect(screen.getByTestId('dock-item-clock')).toHaveAttribute(
      'data-editmode',
      'true'
    );

    // Close the library via its own close (X) button.
    fireEvent.click(screen.getByTestId('library-close'));

    // The library itself must be gone...
    expect(screen.queryByTestId('widget-library')).not.toBeInTheDocument();
    // ...and edit mode must NOT still be active on the dock items left behind.
    // BUG (before fix): onClose only reset showMoreMenu/showLibrary, so
    // isEditMode stayed true and the dock item still reported edit mode.
    expect(screen.getByTestId('dock-item-clock')).toHaveAttribute(
      'data-editmode',
      'false'
    );
  });
});
