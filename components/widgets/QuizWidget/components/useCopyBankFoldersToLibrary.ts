import { useEffect } from 'react';
import type { LibraryFolder, QuestionBankMetadata } from '@/types';
import type { UseFoldersResult } from '@/hooks/useFolders';
import { logError } from '@/utils/logError';

interface FolderSlot {
  name: string;
  parentId: string | null;
}

// One copy at a time per teacher in this tab; the next snapshot finds nothing pending.
const running = new Set<string>();

export const pendingBankCopies = (
  banks: readonly QuestionBankMetadata[],
  bankFolders: readonly LibraryFolder[]
): QuestionBankMetadata[] => {
  const ids = new Set(bankFolders.map((f) => f.id));
  return banks.filter(
    (b) =>
      b.libraryFolderId === undefined &&
      b.folderId != null &&
      ids.has(b.folderId)
  );
};

/** Copies each bank folder into the Quiz library (same name and nesting) and files its banks there. */
export async function copyBankFoldersToLibrary(
  pending: readonly QuestionBankMetadata[],
  bankFolders: readonly LibraryFolder[],
  quizFolders: readonly LibraryFolder[],
  createFolder: (name: string, parentId: string | null) => Promise<string>,
  move: (bankId: string, folderId: string | null) => Promise<void>
): Promise<void> {
  const bankById = new Map(bankFolders.map((f) => [f.id, f]));
  const known: (FolderSlot & { id: string })[] = quizFolders.map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
  }));
  const copies = new Map<string, Promise<string | null>>();
  const copyOf = (bankFolderId: string): Promise<string | null> => {
    const cached = copies.get(bankFolderId);
    if (cached) return cached;
    const task = (async (): Promise<string | null> => {
      const folder = bankById.get(bankFolderId);
      if (!folder) return null;
      const parentId =
        folder.parentId && bankById.has(folder.parentId)
          ? await copyOf(folder.parentId)
          : null;
      const name = folder.name.trim();
      const match = known.find(
        (f) => f.parentId === parentId && f.name.trim() === name
      );
      if (match) return match.id;
      const id = await createFolder(folder.name, parentId);
      known.push({ id, name, parentId });
      return id;
    })();
    copies.set(bankFolderId, task);
    return task;
  };
  for (const bank of pending) {
    if (!bank.folderId) continue;
    const target = await copyOf(bank.folderId);
    await move(bank.id, target);
  }
}

export function useCopyBankFoldersToLibrary({
  enabled,
  userId,
  banks,
  banksLoading,
  bankFolders,
  quizFolders,
  move,
}: {
  enabled: boolean;
  userId?: string;
  banks: readonly QuestionBankMetadata[];
  banksLoading: boolean;
  bankFolders: UseFoldersResult;
  quizFolders: UseFoldersResult;
  move?: (bankId: string, folderId: string | null) => Promise<void>;
}): void {
  const ready =
    enabled &&
    !!userId &&
    !!move &&
    !banksLoading &&
    !bankFolders.loading &&
    !quizFolders.loading &&
    !bankFolders.error &&
    !quizFolders.error;
  const pending = ready ? pendingBankCopies(banks, bankFolders.folders) : [];
  const pendingKey = pending.map((b) => b.id).join(',');
  const { createFolder } = quizFolders;

  useEffect(() => {
    if (!pendingKey || !userId || !move || running.has(userId)) return;
    running.add(userId);
    copyBankFoldersToLibrary(
      pending,
      bankFolders.folders,
      quizFolders.folders,
      createFolder,
      move
    )
      .catch((err: unknown) => logError('useCopyBankFoldersToLibrary', err))
      .finally(() => running.delete(userId));
    // Re-run only when the set of banks waiting to be copied changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, userId]);
}
