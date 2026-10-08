import { useCallback } from 'react';
import { useDialog } from '@/context/useDialog';

export interface LibraryItemNoun {
  one: string;
  other: string;
}

export const LIBRARY_ITEM_NOUNS = {
  quiz: { one: 'quiz', other: 'quizzes' },
  bank: { one: 'bank', other: 'banks' },
  videoActivity: { one: 'activity', other: 'activities' },
  guidedLearning: { one: 'set', other: 'sets' },
  miniApp: { one: 'app', other: 'apps' },
  flashcards: { one: 'set', other: 'sets' },
  project: { one: 'project', other: 'projects' },
} satisfies Record<string, LibraryItemNoun>;

export interface LibraryDeleteConfirmRequest {
  /** Titles of the items about to be deleted; one entry per item. */
  titles: string[];
  noun: LibraryItemNoun;
  /** Extra consequence sentence shown before "This cannot be undone." */
  detail?: string;
}

export interface LibraryDeleteConfirmCopy {
  title: string;
  message: string;
  confirmLabel: string;
}

export const libraryDeleteConfirmCopy = ({
  titles,
  noun,
  detail,
}: LibraryDeleteConfirmRequest): LibraryDeleteConfirmCopy => {
  const count = titles.length;
  const single = count === 1;
  const name = titles[0]?.trim() ?? '';
  const counted = `${count} ${single ? noun.one : noun.other}`;
  return {
    title: single
      ? name
        ? `Delete "${name}"?`
        : `Delete this ${noun.one}?`
      : `Delete ${counted}?`,
    message: [detail, 'This cannot be undone.'].filter(Boolean).join(' '),
    confirmLabel: single ? 'Delete' : `Delete ${counted}`,
  };
};

/** One confirm dialog for every library item delete, single or bulk. */
export const useLibraryDeleteConfirm = (): ((
  request: LibraryDeleteConfirmRequest
) => Promise<boolean>) => {
  const { showConfirm } = useDialog();
  return useCallback(
    (request: LibraryDeleteConfirmRequest) => {
      if (request.titles.length === 0) return Promise.resolve(false);
      const copy = libraryDeleteConfirmCopy(request);
      return showConfirm(copy.message, {
        title: copy.title,
        variant: 'danger',
        confirmLabel: copy.confirmLabel,
      });
    },
    [showConfirm]
  );
};
