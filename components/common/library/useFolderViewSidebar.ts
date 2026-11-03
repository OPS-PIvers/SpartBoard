import { use, useContext } from 'react';
import { DashboardActionsContext } from '@/context/dashboardCanvasStore';
import { DashboardContext } from '@/context/DashboardContextValue';
import { logError } from '@/utils/logError';
import type { LibraryFolderColor } from '@/types';
import type { FolderDeleteConfig, FolderSidebarProps } from './FolderSidebar';

interface FolderViewSidebarOptions extends Omit<
  FolderDeleteConfig,
  'onDeleted'
> {
  setFolderColor: (
    folderId: string,
    color: LibraryFolderColor | null
  ) => Promise<void>;
  /** Shown as Move up and Move down in each folder menu. */
  reorderSiblings?: (
    parentId: string | null,
    orderedIds: string[]
  ) => Promise<void>;
}

/** FolderSidebar props for folder colours and the delete dialog. */
export function useFolderViewSidebar({
  setFolderColor,
  reorderSiblings,
  ...deleteConfig
}: FolderViewSidebarOptions): Pick<
  FolderSidebarProps,
  'onSetFolderColor' | 'folderDelete' | 'onReorderSiblings'
> {
  // PLC pages render outside DashboardProvider, where there is nowhere to toast.
  const addToast =
    useContext(DashboardActionsContext)?.addToast ??
    use(DashboardContext)?.addToast;
  return {
    onSetFolderColor: setFolderColor,
    onReorderSiblings: reorderSiblings,
    folderDelete: {
      ...deleteConfig,
      onDeleted: (message, undo) =>
        addToast?.(
          message,
          'success',
          undo
            ? {
                label: 'Undo',
                onClick: () => {
                  undo().catch((err: unknown) => {
                    logError('useFolderViewSidebar.undo', err);
                    addToast('Could not undo. Try again.', 'error');
                  });
                },
              }
            : undefined
        ),
    },
  };
}
