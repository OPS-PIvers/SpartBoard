export interface LibraryItemNoun {
  one: string;
  other: string;
}

export const LIBRARY_ITEM_NOUNS = {
  quiz: { one: 'quiz', other: 'quizzes' },
  bank: { one: 'question bank', other: 'question banks' },
  videoActivity: { one: 'Video Activity', other: 'Video Activities' },
  guidedLearning: {
    one: 'Guided Learning set',
    other: 'Guided Learning sets',
  },
  miniApp: { one: 'Mini App', other: 'Mini Apps' },
  flashcards: { one: 'flashcard set', other: 'flashcard sets' },
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
