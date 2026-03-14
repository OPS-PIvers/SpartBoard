import React, { useState, useEffect, useRef } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, SmartNotebookConfig, NotebookItem } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { parseNotebookFile } from '@/utils/notebookParser';

import { Library } from './components/Library';
import { Viewer } from './components/Viewer';

export const SmartNotebookWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast } = useDashboard();
  const { user } = useAuth();
  const { uploadFile, deleteFile } = useStorage();
  const config = widget.config as SmartNotebookConfig;
  const { activeNotebookId } = config;

  const [notebooks, setNotebooks] = useState<NotebookItem[]>([]);
  const [activeNotebook, setActiveNotebook] = useState<NotebookItem | null>(
    null
  );
  const [currentPage, setCurrentPage] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch notebooks
  useEffect(() => {
    if (!user) return;
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
        } as NotebookItem;
      });
      setNotebooks(items);
    });
    return () => unsubscribe();
  }, [user]);

  // Sync active notebook state
  useEffect(() => {
    if (activeNotebookId) {
      const found = notebooks.find((n) => n.id === activeNotebookId);
      if (found) {
        setActiveNotebook(found);
      } else if (notebooks.length > 0) {
        // If notebooks are loaded but the active one is missing, clear config
        setActiveNotebook(null);
        // Defer the update to avoid conflicts during render
        setTimeout(() => {
          updateWidget(widget.id, {
            config: { ...config, activeNotebookId: null },
          });
        }, 0);
      }
    } else {
      setActiveNotebook(null);
    }
  }, [activeNotebookId, notebooks, widget.id, updateWidget, config]);

  // Clamp current page index when notebook changes
  useEffect(() => {
    if (activeNotebook && currentPage >= activeNotebook.pageUrls.length) {
      setCurrentPage(Math.max(0, activeNotebook.pageUrls.length - 1));
    }
  }, [activeNotebook, currentPage]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Check file size (limit to 50MB)
    if (file.size > 50 * 1024 * 1024) {
      addToast('File is too large (max 50MB)', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsImporting(true);
    try {
      const { title, pages, assets } = await parseNotebookFile(file);
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
      addToast('Failed to import notebook', 'error');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    if (confirm('Delete this notebook?')) {
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

  const handleDragStart = (e: React.DragEvent, url: string) => {
    const img = e.currentTarget.querySelector('img');
    const ratio = img ? img.naturalWidth / img.naturalHeight : 1;
    e.dataTransfer.setData(
      'application/sticker',
      JSON.stringify({ url, ratio })
    );
    e.dataTransfer.effectAllowed = 'copy';
  };

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
