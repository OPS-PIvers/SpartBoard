// Regression: the rename-folder modal looked up the folder being renamed
// with `dockItems.find(...) as { folder: DockFolder }`, asserting it must
// exist. If the folder disappears from `dockItems` while the modal is open
// (e.g. deleted from another open tab/device — dock items sync in real
// time), `.find()` returns `undefined` and `.folder.name` throws, crashing
// the Dock's render. Fix: look the folder up without asserting, and render
// nothing (closing the modal) when it's gone instead of crashing.
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

// Exposes a button that fires the real `onRename(folder.id)` callback Dock
// passes down, so the test can drive Dock's internal `renamingFolderId`
// state exactly like a real click on FolderItem's popover "Rename" button.
vi.mock('@/components/layout/dock/FolderItem', () => ({
  FolderItem: ({
    folder,
    onRename,
  }: {
    folder: { id: string };
    onRename: (id: string) => void;
  }) => (
    <button data-testid="folder-item" onClick={() => onRename(folder.id)}>
      folder trigger
    </button>
  ),
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
  RenameFolderModal: ({ name }: { name: string }) => (
    <div data-testid="rename-folder-modal">{name}</div>
  ),
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
import type { DockFolder } from '@/types';

type MockDockItem =
  | { type: 'tool'; toolType: string }
  | { type: 'folder'; folder: DockFolder };

/** Wire up all required hook mocks; `dockItems` is the only thing this test varies. */
function setupMocks(dockItems: MockDockItem[]) {
  vi.mocked(useDashboard).mockReturnValue({
    addWidget: vi.fn(),
    removeWidget: vi.fn(),
    removeWidgets: vi.fn(),
    activeDashboard: null,
    updateWidget: vi.fn(),
    addToast: vi.fn(),
    setPendingQuizShareId: vi.fn(),
    setPendingAssignmentShareId: vi.fn(),
    annotationActive: false,
    annotationState: { activeTool: 'pen' },
  } as unknown as ReturnType<typeof useDashboard>);

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

const folder: DockFolder = {
  id: 'folder-1',
  name: 'My Folder',
  items: ['clock'],
};

describe('Dock — renaming a folder that disappears mid-edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not crash when the folder is deleted (e.g. another tab) while the rename modal is open', () => {
    setupMocks([{ type: 'folder', folder }]);
    const { rerender } = render(<Dock />);
    expandDock();

    // Open the rename modal for the folder — sets Dock's internal
    // `renamingFolderId` state, mirroring a real click on FolderItem's
    // popover "Rename" button.
    fireEvent.click(screen.getByTestId('folder-item'));
    expect(screen.getByTestId('rename-folder-modal')).toHaveTextContent(
      'My Folder'
    );

    // Simulate the folder vanishing from `dockItems` — a live sync update
    // from another tab/device deleting it — while the modal is still open.
    setupMocks([]);
    expect(() => rerender(<Dock />)).not.toThrow();

    // The modal has nothing left to rename, so it closes instead of
    // rendering with stale/undefined data.
    expect(screen.queryByTestId('rename-folder-modal')).not.toBeInTheDocument();
  });
});
