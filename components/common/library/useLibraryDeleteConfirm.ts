import React, { useCallback, useState } from 'react';
import { LibraryDeleteConfirmDialog } from './LibraryDeleteConfirmDialog';
import {
  libraryDeleteConfirmCopy,
  type LibraryDeleteConfirmCopy,
  type LibraryDeleteConfirmRequest,
} from './libraryDeleteConfirmCopy';

export {
  LIBRARY_ITEM_NOUNS,
  libraryDeleteConfirmCopy,
} from './libraryDeleteConfirmCopy';
export type {
  LibraryDeleteConfirmRequest,
  LibraryItemNoun,
} from './libraryDeleteConfirmCopy';

interface PendingDelete {
  copy: LibraryDeleteConfirmCopy;
  resolve: (confirmed: boolean) => void;
}

export interface LibraryDeleteConfirm {
  confirmDelete: (request: LibraryDeleteConfirmRequest) => Promise<boolean>;
  /** Render once wherever the hook is used. */
  deleteConfirmDialog: React.ReactNode;
}

/** One confirm dialog for every library item delete, single or bulk. */
export const useLibraryDeleteConfirm = (): LibraryDeleteConfirm => {
  const [pending, setPending] = useState<PendingDelete | null>(null);

  const confirmDelete = useCallback((request: LibraryDeleteConfirmRequest) => {
    if (request.titles.length === 0) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      setPending({ copy: libraryDeleteConfirmCopy(request), resolve });
    });
  }, []);

  const settle = (confirmed: boolean): void => {
    pending?.resolve(confirmed);
    setPending(null);
  };

  const deleteConfirmDialog = pending
    ? React.createElement(LibraryDeleteConfirmDialog, {
        copy: pending.copy,
        onSettle: settle,
      })
    : null;

  return { confirmDelete, deleteConfirmDialog };
};
