// Per-account library collections are shared across boards by design, so their titles and row wording are not a G4 leak.

// Collection under `users/<uid>/` mapped to the fixed row wording its library list shows.
const ACCOUNT_LIBRARY_ROW_WORDS: Record<string, string[]> = {
  projects: ['steps', 'Updated', 'Set up groups'],
  quizzes: [],
  flashcard_sets: [],
};

/** Titles and row wording of fixture docs in a per-account library collection. */
export function accountLibraryText(
  docs: Record<string, Record<string, unknown>> | undefined
): string {
  const words = new Set<string>();
  for (const [path, data] of Object.entries(docs ?? {})) {
    const [root, , collection] = path.split('/');
    if (
      root !== 'users' ||
      !Object.hasOwn(ACCOUNT_LIBRARY_ROW_WORDS, collection)
    )
      continue;
    if (typeof data.title === 'string') words.add(data.title);
    for (const w of ACCOUNT_LIBRARY_ROW_WORDS[collection]) words.add(w);
  }
  return [...words].join(' ');
}

// Fixed wording a roster-list widget shows for any roster; the rosters themselves are shared across boards.
const ROSTER_LIST_WORDS: Record<string, string[]> = {
  classes: ['Active', 'Students', 'Switch To'],
};

export const rosterListText = (type: string): string =>
  (Object.hasOwn(ROSTER_LIST_WORDS, type) ? ROSTER_LIST_WORDS[type] : []).join(
    ' '
  );
