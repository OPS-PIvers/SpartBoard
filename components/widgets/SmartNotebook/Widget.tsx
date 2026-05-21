import React, { useState, useEffect, useRef } from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  SmartNotebookConfig,
  NotebookItem,
  NotebookSection,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useStorage } from '@/hooks/useStorage';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  parseNotebookFile,
  NotebookTooLargeError,
} from '@/utils/notebookParser';
import {
  insertBlankPage,
  deletePage,
  movePage,
  canMovePage,
  blankPageSvg,
  PageListState,
} from '@/utils/notebookPages';

import { Library } from './components/Library';
import { Viewer } from './components/Viewer';
import { PageEditorOverlay } from './components/PageEditorOverlay';

export const SmartNotebookWidget: React.FC<{
  widget: WidgetData;
  isActive?: boolean;
}> = ({ widget, isActive = true }) => {
  const { updateWidget, addToast } = useDashboard();
  const { user } = useAuth();
  const { showConfirm } = useDialog();
  const { uploadFile, deleteFile } = useStorage();
  const config = widget.config as SmartNotebookConfig;
  const { activeNotebookId } = config;

  const [notebooks, setNotebooks] = useState<NotebookItem[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isPageOp, setIsPageOp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch notebooks from Firestore.
  // The subscription is gated on `isActive`: when the host Board is hidden by
  // the LRU cache we unsubscribe to avoid listener proliferation. Local state
  // retains the last-known list; it refreshes on the next snapshot after the
  // Board becomes active again — an acceptable trade-off vs. keeping an open
  // Firestore connection for every mounted-but-hidden Board.
  useEffect(() => {
    if (!user || !isActive) return;
    const q = query(
      collection(db, 'users', user.uid, 'notebooks'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: (data.title as string) ?? 'Untitled',
          pageUrls: (data.pageUrls as string[]) ?? [],
          pagePaths: (data.pagePaths as string[]) ?? [],
          assetUrls: (data.assetUrls as string[]) ?? [],
          createdAt: (data.createdAt as number) ?? 0,
          sections: data.sections as NotebookSection[] | undefined,
        } as NotebookItem;
      });
      setNotebooks(items);
    });
    return () => unsubscribe();
  }, [user, isActive]);

  // Derive active notebook directly — no redundant state
  const activeNotebook = React.useMemo(
    () => notebooks.find((n) => n.id === activeNotebookId) ?? null,
    [notebooks, activeNotebookId]
  );

  // Side effect: clear stale activeNotebookId from config when its notebook is deleted
  useEffect(() => {
    if (activeNotebookId && notebooks.length > 0 && !activeNotebook) {
      updateWidget(widget.id, {
        config: { ...config, activeNotebookId: null },
      });
    }
  }, [
    activeNotebookId,
    activeNotebook,
    notebooks.length,
    widget.id,
    updateWidget,
    config,
  ]);

  // Clamp currentPage when the active notebook changes or page count shrinks.
  // Uses React's "adjusting state during rendering" pattern instead of useEffect
  // to avoid the circular dependency (currentPage was in its own effect's deps).
  const pageCount = activeNotebook?.pageUrls.length ?? 0;
  const [prevNotebookId, setPrevNotebookId] = useState(activeNotebookId);
  const [prevPageCount, setPrevPageCount] = useState(pageCount);

  if (activeNotebookId !== prevNotebookId) {
    setPrevNotebookId(activeNotebookId);
    setPrevPageCount(pageCount);
    if (currentPage !== 0) {
      setCurrentPage(0);
    }
  } else if (pageCount !== prevPageCount) {
    setPrevPageCount(pageCount);
    if (currentPage >= pageCount && pageCount > 0) {
      setCurrentPage(pageCount - 1);
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Retrieve storage limit from admin configuration, fallback to 50MB
    const rawLimit = config?.storageLimitMb;
    const parsedLimit =
      typeof rawLimit === 'number' && Number.isFinite(rawLimit) ? rawLimit : 50;
    const limitMb = Math.max(0, parsedLimit);

    // Check file size (0 means no limit)
    if (limitMb > 0 && file.size > limitMb * 1024 * 1024) {
      addToast(`File is too large (max ${limitMb}MB)`, 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsImporting(true);
    try {
      const { title, pages, assets, sections } = await parseNotebookFile(file);
      const notebookId = crypto.randomUUID();

      // Helper to upload a set of blobs to a specific path structure
      const uploadBatch = async (
        items: { blob: Blob; extension: string }[],
        basePath: string,
        namePrefix: string
      ) => {
        return Promise.all(
          items.map(async (item, index) => {
            const fileName = `${namePrefix}${index}.${item.extension}`;
            const fileObj = new File([item.blob], fileName, {
              type: item.blob.type,
            });
            const path = `${basePath}/${fileName}`;
            const url = await uploadFile(path, fileObj);
            return { url, path };
          })
        );
      };

      // Upload pages and assets in parallel batches
      const notebookPath = `users/${user.uid}/notebooks/${notebookId}`;
      const [uploadedPages, uploadedAssets] = await Promise.all([
        uploadBatch(pages, notebookPath, 'page'),
        assets ? uploadBatch(assets, `${notebookPath}/assets`, 'asset') : [],
      ]);

      const uploadedUrls = uploadedPages.map((p) => p.url);
      const uploadedPaths = uploadedPages.map((p) => p.path);
      const uploadedAssetUrls = uploadedAssets.map((a) => a.url);

      const notebook: NotebookItem = {
        id: notebookId,
        title,
        pageUrls: uploadedUrls,
        pagePaths: uploadedPaths,
        assetUrls: uploadedAssetUrls,
        createdAt: Date.now(),
        // Only include `sections` when present — Firestore rejects `undefined`.
        ...(sections && sections.length > 0 ? { sections } : {}),
      };

      await setDoc(
        doc(db, 'users', user.uid, 'notebooks', notebookId),
        notebook
      );
      addToast('Notebook imported successfully', 'success');

      // Auto-select
      updateWidget(widget.id, {
        config: { ...config, activeNotebookId: notebookId },
      });
    } catch (err) {
      console.error(err);
      if (err instanceof NotebookTooLargeError) {
        const openConverter = await showConfirm(
          `This notebook is ${err.sizeMb}MB — too large to import directly. ` +
            `Open the SpartBoard Converter to shrink it (it runs right in your ` +
            `browser, nothing is uploaded), then import the smaller .spartnb file.`,
          {
            title: 'This file is too large',
            variant: 'warning',
            confirmLabel: 'Open Converter',
            cancelLabel: 'Cancel',
          }
        );
        if (openConverter) {
          window.open('/convert', '_blank', 'noopener,noreferrer');
        }
      } else {
        addToast('Failed to import notebook', 'error');
      }
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    const confirmed = await showConfirm('Delete this notebook?', {
      title: 'Delete Notebook',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (confirmed) {
      try {
        const notebookToDelete = notebooks.find((n) => n.id === id);
        if (notebookToDelete) {
          // Cleanup storage
          // Use direct URLs/Paths for deletion as they are most robust
          const deletePromises = (
            notebookToDelete.pagePaths || notebookToDelete.pageUrls
          ).map((pathOrUrl) =>
            deleteFile(pathOrUrl).catch((err) => {
              console.error('Failed to delete notebook page file:', err);
            })
          );
          await Promise.all(deletePromises);

          if (notebookToDelete.assetUrls) {
            const assetDeletePromises = notebookToDelete.assetUrls.map((url) =>
              deleteFile(url).catch((err) => {
                console.error('Failed to delete notebook asset file:', err);
              })
            );
            await Promise.all(assetDeletePromises);
          }
        }

        await deleteDoc(doc(db, 'users', user.uid, 'notebooks', id));
        if (activeNotebookId === id) {
          updateWidget(widget.id, {
            config: { ...config, activeNotebookId: null },
          });
        }
        addToast('Notebook deleted', 'success');
      } catch (err) {
        console.error('Failed to delete notebook', err);
        addToast('Failed to delete notebook', 'error');
      }
    }
  };

  const handleSelect = (id: string) => {
    updateWidget(widget.id, { config: { ...config, activeNotebookId: id } });
    setCurrentPage(0);
  };

  const handleClose = () => {
    updateWidget(widget.id, { config: { ...config, activeNotebookId: null } });
  };

  // Persist an edited page: re-upload the edited SVG to its Storage path and
  // point the page URL at the new upload. Only the edited page is written.
  const handleSavePageEdit = async (svgString: string) => {
    if (!user || !activeNotebook || !svgString) {
      setEditMode(false);
      return;
    }
    setIsSavingEdit(true);
    try {
      const notebookPath = `users/${user.uid}/notebooks/${activeNotebook.id}`;
      const path =
        activeNotebook.pagePaths?.[currentPage] ??
        `${notebookPath}/page${currentPage}.svg`;
      const file = new File([svgString], `page${currentPage}.svg`, {
        type: 'image/svg+xml',
      });
      const url = await uploadFile(path, file);

      const newPageUrls = [...activeNotebook.pageUrls];
      newPageUrls[currentPage] = url;
      const newPagePaths = [...(activeNotebook.pagePaths ?? [])];
      newPagePaths[currentPage] = path;

      await updateDoc(
        doc(db, 'users', user.uid, 'notebooks', activeNotebook.id),
        {
          pageUrls: newPageUrls,
          pagePaths: newPagePaths,
        }
      );
      addToast('Page saved', 'success');
      setEditMode(false);
    } catch (err) {
      console.error('Failed to save edited page', err);
      addToast('Failed to save page', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Persist a new page list (urls/paths/sections) to Firestore.
  const persistPageList = async (next: PageListState) => {
    if (!user || !activeNotebook) return;
    await updateDoc(
      doc(db, 'users', user.uid, 'notebooks', activeNotebook.id),
      {
        pageUrls: next.pageUrls,
        pagePaths: next.pagePaths,
        ...(next.sections ? { sections: next.sections } : {}),
      }
    );
  };

  // Insert a blank page after the current one and navigate to it.
  const handleAddPage = async () => {
    if (!user || !activeNotebook) return;
    setIsPageOp(true);
    try {
      const notebookPath = `users/${user.uid}/notebooks/${activeNotebook.id}`;
      const path = `${notebookPath}/page-blank-${crypto.randomUUID()}.svg`;
      const file = new File([blankPageSvg()], 'blank.svg', {
        type: 'image/svg+xml',
      });
      const url = await uploadFile(path, file);
      await persistPageList(
        insertBlankPage(activeNotebook, currentPage, url, path)
      );
      setCurrentPage(currentPage + 1);
      addToast('Blank page added', 'success');
    } catch (err) {
      console.error('Failed to add page', err);
      addToast('Failed to add page', 'error');
    } finally {
      setIsPageOp(false);
    }
  };

  // Delete the current page (with confirmation) and clean up its storage file.
  const handleDeletePage = async () => {
    if (!user || !activeNotebook) return;
    if (activeNotebook.pageUrls.length <= 1) {
      addToast('A notebook needs at least one page', 'error');
      return;
    }
    const confirmed = await showConfirm('Delete this page?', {
      title: 'Delete Page',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    setIsPageOp(true);
    try {
      const { state: next, removedPath } = deletePage(
        activeNotebook,
        currentPage
      );
      await persistPageList(next);
      if (removedPath) {
        await deleteFile(removedPath).catch((e) => console.error(e));
      }
      setCurrentPage((p) => Math.min(p, next.pageUrls.length - 1));
      addToast('Page deleted', 'success');
    } catch (err) {
      console.error('Failed to delete page', err);
      addToast('Failed to delete page', 'error');
    } finally {
      setIsPageOp(false);
    }
  };

  // Reorder the current page within its lesson, following it to the new spot.
  const handleMovePage = async (dir: -1 | 1) => {
    if (
      !user ||
      !activeNotebook ||
      !canMovePage(activeNotebook, currentPage, dir)
    )
      return;
    setIsPageOp(true);
    try {
      await persistPageList(movePage(activeNotebook, currentPage, dir));
      setCurrentPage(currentPage + dir);
    } catch (err) {
      console.error('Failed to move page', err);
      addToast('Failed to move page', 'error');
    } finally {
      setIsPageOp(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, url: string) => {
    const img = e.currentTarget.querySelector('img');
    const ratio = img ? img.naturalWidth / img.naturalHeight : 1;
    e.dataTransfer.setData(
      'application/sticker',
      JSON.stringify({ url, ratio })
    );
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Page editor (full-surface) when editing a page.
  if (activeNotebook && editMode && activeNotebook.pageUrls[currentPage]) {
    return (
      <PageEditorOverlay
        pageUrl={activeNotebook.pageUrls[currentPage]}
        pageNumber={currentPage + 1}
        totalPages={activeNotebook.pageUrls.length}
        isSaving={isSavingEdit}
        onSave={handleSavePageEdit}
        onClose={() => setEditMode(false)}
      />
    );
  }

  // Viewer
  if (activeNotebook) {
    const hasAssets =
      activeNotebook.assetUrls && activeNotebook.assetUrls.length > 0;

    return (
      <Viewer
        activeNotebook={activeNotebook}
        hasAssets={hasAssets}
        showAssets={showAssets}
        setShowAssets={setShowAssets}
        handleClose={handleClose}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        handleDragStart={handleDragStart}
        onEditPage={() => setEditMode(true)}
        onAddPage={() => void handleAddPage()}
        onDeletePage={() => void handleDeletePage()}
        onMovePage={(dir) => void handleMovePage(dir)}
        canMoveEarlier={canMovePage(activeNotebook, currentPage, -1)}
        canMoveLater={canMovePage(activeNotebook, currentPage, 1)}
        pageOpBusy={isPageOp}
      />
    );
  }

  // Library
  return (
    <Library
      notebooks={notebooks}
      isImporting={isImporting}
      handleImport={handleImport}
      handleSelect={handleSelect}
      handleDelete={handleDelete}
      fileInputRef={fileInputRef}
    />
  );
};
