import type { FolderDeleteActions } from './FolderSidebar';
import {
  useLibraryDeleteConfirm,
  type LibraryItemNoun,
} from './useLibraryDeleteConfirm';

export interface LibraryDeletePolicy<T> {
  noun: LibraryItemNoun;
  titleOf: (item: T) => string;
  /** Removes one item and runs its kind's cleanup. */
  remove: (item: T) => Promise<void>;
  addToast: (message: string, tone: 'success' | 'error' | 'info') => void;
  /** True when the item can't be deleted right now (Quiz with a live assignment). */
  isBlocked?: (item: T) => boolean;
  /** Toast for items skipped by `isBlocked`. */
  blockedMessage?: (count: number) => string;
  /** Folder dialog reason, e.g. "2 quizzes have live assignments". */
  blockedReason?: (count: number) => string;
  /** Extra consequence sentence for the confirm. */
  detail?: (items: T[]) => string | undefined;
  /** Non-null while the policy can't decide yet; the message is shown and nothing is deleted. */
  notReady?: () => string | null;
  /** Success toast; defaults to '"<title>" deleted.' for one item and 'Deleted N <nouns>.' for several. */
  deletedMessage?: (count: number) => string;
  onError?: (err: unknown, item: T) => void;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const libraryDeleteToasts = (noun: LibraryItemNoun) => ({
  deleted: (count: number) =>
    count === 1
      ? `${capitalize(noun.one)} deleted.`
      : `Deleted ${count} ${noun.other}.`,
  failed: (count: number) =>
    `${count} ${count === 1 ? noun.one : noun.other} failed to delete.`,
});

/** The one delete path for library items: single, bulk and folder deletes share the policy. */
export function useLibraryDelete<T extends { id: string }>(
  policy: LibraryDeletePolicy<T>
) {
  const confirm = useLibraryDeleteConfirm();
  const {
    noun,
    titleOf,
    remove,
    addToast,
    isBlocked,
    blockedMessage,
    detail,
    notReady,
    onError,
  } = policy;
  const toasts = libraryDeleteToasts(noun);
  const deletedMessage = policy.deletedMessage ?? toasts.deleted;

  const skipBlocked = (items: T[]): T[] => {
    if (!isBlocked) return items;
    const blocked = items.filter(isBlocked);
    if (blocked.length > 0) {
      addToast(
        blockedMessage?.(blocked.length) ??
          `${blocked.length} ${blocked.length === 1 ? noun.one : noun.other} can't be deleted right now.`,
        'error'
      );
    }
    return items.filter((item) => !isBlocked(item));
  };

  /** Confirms and deletes; resolves true when a delete was attempted. */
  const deleteMany = async (items: T[]): Promise<boolean> => {
    if (items.length === 0) return false;
    const wait = notReady?.();
    if (wait) {
      addToast(wait, 'info');
      return false;
    }
    const deletable = skipBlocked(items);
    if (deletable.length === 0) return false;
    const ok = await confirm({
      titles: deletable.map(titleOf),
      noun,
      detail: detail?.(deletable),
    });
    if (!ok) return false;
    const results = await Promise.allSettled(deletable.map(remove));
    const failures: { item: T; reason: unknown }[] = [];
    results.forEach((result, idx) => {
      const item = deletable[idx];
      if (result.status === 'rejected' && item) {
        failures.push({ item, reason: result.reason });
        onError?.(result.reason, item);
      }
    });
    const succeeded = deletable.length - failures.length;
    if (succeeded > 0) {
      const title = deletable.length === 1 ? titleOf(deletable[0]).trim() : '';
      addToast(
        title && !policy.deletedMessage
          ? `"${title}" deleted.`
          : deletedMessage(succeeded),
        'success'
      );
    }
    if (failures.length === 1 && deletable.length === 1) {
      const { reason } = failures[0];
      addToast(
        reason instanceof Error && reason.message
          ? reason.message
          : toasts.failed(1),
        'error'
      );
    } else if (failures.length > 0) {
      addToast(toasts.failed(failures.length), 'error');
    }
    return true;
  };

  const deleteOne = (item: T): Promise<boolean> => deleteMany([item]);

  /** "Delete the folder and everything in it": the dialog keeps blocked items and confirms once. */
  const folderActions = (
    items: readonly T[],
    /** Guided Learning keeps open-assignment sets only in the folder delete. */
    folderBlock?: Pick<LibraryDeletePolicy<T>, 'isBlocked' | 'blockedReason'>
  ): FolderDeleteActions => {
    const byId = new Map(items.map((item) => [item.id, item]));
    const blockedFn = folderBlock?.isBlocked ?? isBlocked;
    const reason = folderBlock?.blockedReason ?? policy.blockedReason;
    return {
      ...(blockedFn
        ? {
            isBlocked: (id: string) => {
              const item = byId.get(id);
              return item ? blockedFn(item) : false;
            },
            blockedReason: reason,
          }
        : {}),
      deleteItems: async (ids: string[]) => {
        const wait = notReady?.();
        if (wait) throw new Error(wait);
        for (const id of ids) {
          const item = byId.get(id);
          if (item && !blockedFn?.(item)) await remove(item);
        }
      },
    };
  };

  return { deleteOne, deleteMany, folderActions };
}
