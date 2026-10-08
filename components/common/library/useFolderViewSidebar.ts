import { use, useContext } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
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
}

/** FolderSidebar props for folder colours and the delete dialog, behind the library-folder-view flag. */
export function useFolderViewSidebar({
  setFolderColor,
  ...deleteConfig
}: FolderViewSidebarOptions): Pick<
  FolderSidebarProps,
  'onSetFolderColor' | 'folderDelete'
> {
  // Read softly so library tests that render without AuthProvider see the flag off.
  const enabled =
    useContext(AuthContext)?.canAccessFeature('library-folder-view') ?? false;
  // PLC pages render outside DashboardProvider, where there is nowhere to toast.
  const addToast =
    useContext(DashboardActionsContext)?.addToast ??
    use(DashboardContext)?.addToast;
  if (!enabled) return {};
  return {
    onSetFolderColor: setFolderColor,
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
