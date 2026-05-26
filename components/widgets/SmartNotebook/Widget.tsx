import React, { useState, useEffect, useRef } from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  SmartNotebookConfig,
  NotebookItem,
  NotebookObjectLink,
  NotebookSection,
  PlacedNotebookAsset,
} from '@/types';
import {
  createPlacedAsset,
  updatePlacedAsset as updatePlacedAssetIn,
  removePlacedAsset as removePlacedAssetIn,
} from '@/utils/notebookPlacedAssets';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useStorage } from '@/hooks/useStorage';
import { useNotebookSharing } from '@/hooks/useNotebookSharing';
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
  clampPageIndex,
  blankPageSvg,
  PageListState,
} from '@/utils/notebookPages';

import { Library } from './components/Library';
import { Viewer } from './components/Viewer';
import { PageEditorOverlay } from './components/PageEditorOverlay';
import { NOTEBOOK_ASSET_MIME } from './components/PageCanvas';

export const SmartNotebookWidget: React.FC<{
  widget: WidgetData;
  isActive?: boolean;
}> = ({ widget, isActive = true }) => {
  const { updateWidget, addToast } = useDashboard();
  const { user } = useAuth();
  const { showConfirm, showPrompt } = useDialog();
  const { uploadFile, deleteFile } = useStorage();
  const { shareNotebook } = useNotebookSharing();
  const config = widget.config as SmartNotebookConfig;
  const { activeNotebookId } = config;
  const displayMode = config.libraryDisplayMode ?? 'cards';

  const [notebooks, setNotebooks] = useState<NotebookItem[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  // Open notebooks in edit mode by default — matches SMART Notebook's flow
  // (teachers edit, then optionally switch to a present view).
  const [presentMode, setPresentMode] = useState(false);
  // Pages with an in-flight save. Drives the editor's "Saving…" indicator.
  const [savingPages, setSavingPages] = useState<Set<number>>(new Set());
  const [saveErrorPage, setSaveErrorPage] = useState<number | null>(null);
  const [isPageOp, setIsPageOp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Per-page cache of locally-edited SVGs. Lives in a ref because PageEditor's
  // onChange fires on every stroke — promoting these to state would re-render
  // the whole widget tree on each keystroke. Reset when the active notebook
  // changes (see the "adjusting state during rendering" block below).
  const editedSvgsRef = useRef<Map<number, string>>(new Map());
  // Pending autosave timer. Cleared (and flushed immediately) on page nav,
  // present-mode toggle, and close — so jumping pages never loses edits.
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          objectLinks: data.objectLinks as NotebookObjectLink[] | undefined,
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
    // Switching notebooks must drop in-memory edits for the previous one and
    // land in edit mode again — anything else either leaks edits across
    // notebooks or surprises the teacher with "present" on a fresh open.
    editedSvgsRef.current = new Map();
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (savingPages.size > 0) setSavingPages(new Set());
    if (saveErrorPage !== null) setSaveErrorPage(null);
    if (presentMode) setPresentMode(false);
  } else if (pageCount !== prevPageCount) {
    setPrevPageCount(pageCount);
    const clamped = clampPageIndex(currentPage, pageCount);
    if (clamped !== currentPage) {
      setCurrentPage(clamped);
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
    // Track uploaded storage paths so we can clean up if a later step (e.g. the
    // Firestore write) fails, instead of leaking orphaned blobs (quota cost).
    let uploadedStoragePaths: string[] = [];
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
      uploadedStoragePaths = [
        ...uploadedPaths,
        ...uploadedAssets.map((a) => a.path),
      ];

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
        // Clean up any blobs uploaded before the failure (e.g. setDoc threw).
        if (uploadedStoragePaths.length > 0) {
          await Promise.all(
            uploadedStoragePaths.map((p) =>
              deleteFile(p).catch((e) => console.error(e))
            )
          );
        }
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
        // Strip the deleted notebook's placed assets so they don't linger in
        // the dashboard config forever (they're keyed by notebookId and would
        // otherwise accumulate as dead entries).
        const hadPlacedAssets = (config.placedAssets ?? []).some(
          (a) => a.notebookId === id
        );
        if (activeNotebookId === id || hadPlacedAssets) {
          updateWidget(widget.id, {
            config: {
              ...config,
              ...(hadPlacedAssets
                ? {
                    placedAssets: (config.placedAssets ?? []).filter(
                      (a) => a.notebookId !== id
                    ),
                  }
                : {}),
              ...(activeNotebookId === id ? { activeNotebookId: null } : {}),
            },
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

  const setDisplayMode = (mode: 'cards' | 'list') => {
    updateWidget(widget.id, {
      config: { ...config, libraryDisplayMode: mode },
    });
  };

  const handleRename = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    const notebook = notebooks.find((n) => n.id === id);
    if (!notebook) return;
    const next = await showPrompt('Enter a new name for this notebook', {
      title: 'Rename Notebook',
      defaultValue: notebook.title,
      confirmLabel: 'Save',
    });
    const trimmed = next?.trim();
    if (!trimmed || trimmed === notebook.title) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'notebooks', id), {
        title: trimmed,
      });
      addToast('Notebook renamed', 'success');
    } catch (err) {
      console.error('Failed to rename notebook', err);
      addToast('Failed to rename notebook', 'error');
    }
  };

  // Publish a notebook for staff sharing and copy the link to the clipboard.
  const handleShare = async (e: React.MouseEvent, notebook: NotebookItem) => {
    e.stopPropagation();
    try {
      const url = await shareNotebook(notebook);
      await navigator.clipboard.writeText(url);
      addToast('Share link copied — paste it onto another board', 'success');
    } catch (err) {
      console.error('Failed to share notebook', err);
      addToast('Failed to create share link', 'error');
    }
  };

  // Upload one page's edited SVG to its Storage path and update the page URL
  // in Firestore. Returns nothing — callers fire-and-forget; saving state is
  // tracked via `savingPages` / `saveErrorPage` for the UI indicator.
  const flushPage = async (page: number, svgString: string): Promise<void> => {
    if (!user || !activeNotebook || !svgString) return;
    setSavingPages((prev) => {
      const next = new Set(prev);
      next.add(page);
      return next;
    });
    if (saveErrorPage === page) setSaveErrorPage(null);
    try {
      const notebookPath = `users/${user.uid}/notebooks/${activeNotebook.id}`;
      const path =
        activeNotebook.pagePaths?.[page] ?? `${notebookPath}/page${page}.svg`;
      const file = new File([svgString], `page${page}.svg`, {
        type: 'image/svg+xml',
      });
      const url = await uploadFile(path, file);

      const newPageUrls = [...activeNotebook.pageUrls];
      newPageUrls[page] = url;
      const newPagePaths = [...(activeNotebook.pagePaths ?? [])];
      newPagePaths[page] = path;

      await updateDoc(
        doc(db, 'users', user.uid, 'notebooks', activeNotebook.id),
        {
          pageUrls: newPageUrls,
          pagePaths: newPagePaths,
        }
      );
    } catch (err) {
      console.error('Failed to save edited page', err);
      setSaveErrorPage(page);
      addToast('Autosave failed — your edits are kept locally', 'error');
    } finally {
      setSavingPages((prev) => {
        const next = new Set(prev);
        next.delete(page);
        return next;
      });
    }
  };

  // Cancel any pending autosave for `page` and fire the upload immediately.
  // Used on page navigation, present-mode toggle, and close so jumping never
  // strands edits in the debounce window.
  const flushPending = (page: number): void => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const svg = editedSvgsRef.current.get(page);
    if (svg) void flushPage(page, svg);
  };

  // PageEditor emits an updated SVG after each edit. Cache it (ref, no
  // re-render) and (re)start the autosave countdown. 1.5s feels responsive
  // without burning a Storage upload on every stroke of a long sketch.
  const AUTOSAVE_DEBOUNCE_MS = 1500;
  const handleEditChange = (svgString: string): void => {
    editedSvgsRef.current.set(currentPage, svgString);
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    const pageToSave = currentPage;
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      const latest = editedSvgsRef.current.get(pageToSave);
      if (latest) void flushPage(pageToSave, latest);
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  const navigateToPage = (newPage: number): void => {
    if (newPage === currentPage) return;
    flushPending(currentPage);
    setCurrentPage(newPage);
  };

  const togglePresentMode = (): void => {
    // Flush before showing the class — they shouldn't see a stale page.
    flushPending(currentPage);
    setPresentMode((p) => !p);
  };

  const handleClose = (): void => {
    flushPending(currentPage);
    updateWidget(widget.id, { config: { ...config, activeNotebookId: null } });
  };

  // Add or replace an object→page link. The same {objectId, sourcePage}
  // pair always maps to ONE hotspot, so we filter any prior entry out
  // before appending the new one.
  const handleSaveObjectLink = async (
    link: NotebookObjectLink
  ): Promise<void> => {
    if (!user || !activeNotebook) return;
    const others = (activeNotebook.objectLinks ?? []).filter(
      (l) => !(l.objectId === link.objectId && l.sourcePage === link.sourcePage)
    );
    const next = [...others, link];
    try {
      await updateDoc(
        doc(db, 'users', user.uid, 'notebooks', activeNotebook.id),
        { objectLinks: next }
      );
    } catch (err) {
      console.error('Failed to save object link', err);
      addToast('Could not save link', 'error');
    }
  };

  const handleRemoveObjectLink = async (linkId: string): Promise<void> => {
    if (!user || !activeNotebook) return;
    const next = (activeNotebook.objectLinks ?? []).filter(
      (l) => l.id !== linkId
    );
    try {
      await updateDoc(
        doc(db, 'users', user.uid, 'notebooks', activeNotebook.id),
        { objectLinks: next }
      );
    } catch (err) {
      console.error('Failed to remove object link', err);
      addToast('Could not remove link', 'error');
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
    const notebookPath = `users/${user.uid}/notebooks/${activeNotebook.id}`;
    const path = `${notebookPath}/page-blank-${crypto.randomUUID()}.svg`;
    try {
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
      // The blob may have uploaded before the Firestore write failed — clean it
      // up so we don't leak storage on a failed add.
      await deleteFile(path).catch((e) => console.error(e));
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

  // Assets drag onto the notebook PAGE (not the board), so they stay contained
  // in the widget and remain visible when maximized. A notebook-specific
  // dataTransfer type means the board's sticker-drop handler ignores it.
  const handleDragStart = (e: React.DragEvent, url: string) => {
    e.dataTransfer.setData(NOTEBOOK_ASSET_MIME, JSON.stringify({ url }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const placedAssets = config.placedAssets ?? [];

  const persistPlacedAssets = (next: PlacedNotebookAsset[]) => {
    updateWidget(widget.id, { config: { ...config, placedAssets: next } });
  };

  // Drop an asset onto the current page at a page-relative fraction point.
  const handlePlaceAsset = (url: string, xFrac: number, yFrac: number) => {
    if (!activeNotebook) return;
    persistPlacedAssets([
      ...placedAssets,
      createPlacedAsset({
        notebookId: activeNotebook.id,
        page: currentPage,
        url,
        xFrac,
        yFrac,
      }),
    ]);
  };

  const handleUpdatePlacedAsset = (
    id: string,
    patch: Partial<Pick<PlacedNotebookAsset, 'xFrac' | 'yFrac' | 'wFrac'>>
  ) => {
    persistPlacedAssets(updatePlacedAssetIn(placedAssets, id, patch));
  };

  const handleRemovePlacedAsset = (id: string) => {
    persistPlacedAssets(removePlacedAssetIn(placedAssets, id));
  };

  // Edit mode (default) — page nav + autosave live inside the editor overlay.
  if (activeNotebook && !presentMode && activeNotebook.pageUrls[currentPage]) {
    const saveStatus: 'idle' | 'saving' | 'error' = savingPages.has(currentPage)
      ? 'saving'
      : saveErrorPage === currentPage
        ? 'error'
        : 'idle';
    return (
      <PageEditorOverlay
        title={activeNotebook.title}
        pageUrls={activeNotebook.pageUrls}
        cachedSvg={editedSvgsRef.current.get(currentPage) ?? null}
        currentPage={currentPage}
        sections={activeNotebook.sections}
        objectLinks={activeNotebook.objectLinks}
        onSaveObjectLink={(link) => void handleSaveObjectLink(link)}
        onRemoveObjectLink={(linkId) => void handleRemoveObjectLink(linkId)}
        saveStatus={saveStatus}
        onEditChange={handleEditChange}
        onPageChange={navigateToPage}
        onAddPage={() => void handleAddPage()}
        onDeletePage={() => void handleDeletePage()}
        onMovePage={(dir) => void handleMovePage(dir)}
        canMoveEarlier={canMovePage(activeNotebook, currentPage, -1)}
        canMoveLater={canMovePage(activeNotebook, currentPage, 1)}
        pageOpBusy={isPageOp}
        onPresent={togglePresentMode}
        onClose={handleClose}
      />
    );
  }

  // Present mode (opt-in) — the original Viewer, opened explicitly via the
  // editor's "Present" toggle.
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
        onShare={(e) => void handleShare(e, activeNotebook)}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        handleDragStart={handleDragStart}
        placedAssets={placedAssets.filter(
          (a) => a.notebookId === activeNotebook.id && a.page === currentPage
        )}
        onPlaceAsset={handlePlaceAsset}
        onUpdatePlacedAsset={handleUpdatePlacedAsset}
        onRemovePlacedAsset={handleRemovePlacedAsset}
        onEditPage={togglePresentMode}
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
      handleRename={(e, id) => void handleRename(e, id)}
      handleShare={(e, id) => {
        const nb = notebooks.find((n) => n.id === id);
        if (nb) void handleShare(e, nb);
      }}
      displayMode={displayMode}
      onChangeDisplayMode={setDisplayMode}
      fileInputRef={fileInputRef}
    />
  );
};
