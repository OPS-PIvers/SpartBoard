import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { NotebookItem } from '@/types';
import { ParsedNotebook } from './notebookParser';

/** The slice of `useStorage()` a notebook upload needs. */
export interface NotebookStorage {
  uploadFile: (path: string, file: File) => Promise<string>;
  deleteFile: (pathOrUrl: string) => Promise<void>;
}

const uploadBatch = async (
  storage: NotebookStorage,
  items: { blob: Blob; extension: string }[],
  basePath: string,
  namePrefix: string
): Promise<{ url: string; path: string }[]> =>
  Promise.all(
    items.map(async (item, index) => {
      const fileName = `${namePrefix}${index}.${item.extension}`;
      const path = `${basePath}/${fileName}`;
      const url = await storage.uploadFile(
        path,
        new File([item.blob], fileName, { type: item.blob.type })
      );
      return { url, path };
    })
  );

/**
 * Uploads a parsed notebook's pages and assets to Storage and writes its
 * Firestore doc. Shared by the SmartNotebook library import and the board
 * drop target. On failure any blob already uploaded is deleted, so a failed
 * import never leaks orphaned storage (quota cost).
 */
export const uploadParsedNotebook = async (
  userId: string,
  parsed: ParsedNotebook,
  storage: NotebookStorage
): Promise<NotebookItem> => {
  const { title, pages, assets, sections, objectLinks, hiddenPages } = parsed;
  const notebookId = crypto.randomUUID();
  const notebookPath = `users/${userId}/notebooks/${notebookId}`;
  let uploadedStoragePaths: string[] = [];

  try {
    const [uploadedPages, uploadedAssets] = await Promise.all([
      uploadBatch(storage, pages, notebookPath, 'page'),
      assets
        ? uploadBatch(storage, assets, `${notebookPath}/assets`, 'asset')
        : [],
    ]);
    uploadedStoragePaths = [
      ...uploadedPages.map((p) => p.path),
      ...uploadedAssets.map((a) => a.path),
    ];

    const notebook: NotebookItem = {
      id: notebookId,
      title,
      pageUrls: uploadedPages.map((p) => p.url),
      pagePaths: uploadedPages.map((p) => p.path),
      assetUrls: uploadedAssets.map((a) => a.url),
      createdAt: Date.now(),
      // Only include optional fields when populated — Firestore rejects
      // `undefined`, and empty arrays make noisy console diffs.
      ...(sections && sections.length > 0 ? { sections } : {}),
      ...(objectLinks && objectLinks.length > 0 ? { objectLinks } : {}),
      ...(hiddenPages && hiddenPages.length > 0 ? { hiddenPages } : {}),
    };

    await setDoc(doc(db, 'users', userId, 'notebooks', notebookId), notebook);
    return notebook;
  } catch (err) {
    await Promise.all(
      uploadedStoragePaths.map((p) =>
        storage.deleteFile(p).catch((e) => console.error(e))
      )
    );
    throw err;
  }
};
