import { useCallback } from 'react';
import { addDoc, collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import { NotebookItem, SharedNotebook } from '@/types';

/** File extension for a fetched blob, derived from its MIME type. */
const extForBlob = (blob: Blob, fallback: string): string => {
  const subtype = blob.type.split('/')[1] ?? '';
  if (!subtype) return fallback;
  // image/svg+xml -> svg; image/jpeg -> jpeg, etc.
  return subtype.replace('+xml', '').split(';')[0] || fallback;
};

/**
 * Publish + import SMART Notebooks for staff sharing.
 *
 * Sharing writes a `/shared_notebooks/{shareId}` doc that references the
 * author's existing Storage download URLs (no file duplication — the token in
 * each URL grants cross-user read). Importing makes a self-contained COPY: the
 * shared pages/assets are downloaded and re-uploaded into the importer's own
 * Storage so their notebook is independent of the original (a future "synced"
 * mode would instead reference the share doc live).
 */
export const useNotebookSharing = () => {
  const { user } = useAuth();
  const { uploadFile, deleteFile } = useStorage();

  const shareNotebook = useCallback(
    async (notebook: NotebookItem): Promise<string> => {
      if (!user) throw new Error('Not authenticated');
      const payload: SharedNotebook = {
        title: notebook.title,
        pageUrls: notebook.pageUrls,
        assetUrls: notebook.assetUrls ?? [],
        originalAuthor: user.uid,
        sharedAt: Date.now(),
        // Firestore rejects `undefined`; only include optional arrays when present.
        ...(notebook.sections && notebook.sections.length > 0
          ? { sections: notebook.sections }
          : {}),
        ...(notebook.objectLinks && notebook.objectLinks.length > 0
          ? { objectLinks: notebook.objectLinks }
          : {}),
      };
      const ref = await addDoc(collection(db, 'shared_notebooks'), payload);
      return `${window.location.origin}/share/notebook/${ref.id}`;
    },
    [user]
  );

  const importSharedNotebookCopy = useCallback(
    async (shareId: string): Promise<string> => {
      if (!user) throw new Error('Not authenticated');
      const snap = await getDoc(doc(db, 'shared_notebooks', shareId));
      if (!snap.exists()) throw new Error('Shared notebook not found');
      const shared = snap.data() as SharedNotebook;

      const newId = crypto.randomUUID();
      const basePath = `users/${user.uid}/notebooks/${newId}`;

      // Track every blob we upload so we can delete them if a later step (a
      // failed upload, or the Firestore write) throws — otherwise a partial
      // import leaks orphaned Storage objects (quota cost).
      const uploadedStoragePaths: string[] = [];

      try {
        // Download each shared blob and re-upload it under the importer's path
        // so the copy is self-contained (independent of the original author).
        const copyBlobs = async (
          urls: string[],
          prefix: string,
          sub: string,
          fallbackExt: string
        ) =>
          Promise.all(
            urls.map(async (url, i) => {
              const res = await fetch(url);
              if (!res.ok) throw new Error(`Failed to fetch ${prefix}${i}`);
              const blob = await res.blob();
              const ext = extForBlob(blob, fallbackExt);
              const fileName = `${prefix}${i}.${ext}`;
              const path = `${basePath}${sub}/${fileName}`;
              const file = new File([blob], fileName, { type: blob.type });
              const newUrl = await uploadFile(path, file);
              uploadedStoragePaths.push(path);
              return { url: newUrl, path };
            })
          );

        const [pages, assets] = await Promise.all([
          copyBlobs(shared.pageUrls ?? [], 'page', '', 'svg'),
          copyBlobs(shared.assetUrls ?? [], 'asset', '/assets', 'webp'),
        ]);

        const notebook: NotebookItem = {
          id: newId,
          title: shared.title ?? 'Shared Notebook',
          pageUrls: pages.map((p) => p.url),
          pagePaths: pages.map((p) => p.path),
          assetUrls: assets.map((a) => a.url),
          createdAt: Date.now(),
          ...(shared.sections && shared.sections.length > 0
            ? { sections: shared.sections }
            : {}),
          ...(shared.objectLinks && shared.objectLinks.length > 0
            ? { objectLinks: shared.objectLinks }
            : {}),
        };

        await setDoc(doc(db, 'users', user.uid, 'notebooks', newId), notebook);
        return newId;
      } catch (err) {
        if (uploadedStoragePaths.length > 0) {
          await Promise.all(
            uploadedStoragePaths.map((p) =>
              deleteFile(p).catch((e) => console.error(e))
            )
          );
        }
        throw err;
      }
    },
    [user, uploadFile, deleteFile]
  );

  return { shareNotebook, importSharedNotebookCopy };
};
