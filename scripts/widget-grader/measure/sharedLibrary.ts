// Per-account library collections are shared across boards by design, so their titles and row wording are not a G4 leak.

// Collections under `users/<uid>/` that hold a per-account library.
const ACCOUNT_LIBRARY_COLLECTIONS = new Set([
  'projects',
  'quizzes',
  'flashcard_sets',
]);

// Widget type mapped to the fixed row wording its library list shows.
const LIBRARY_ROW_WORDS: Record<string, string[]> = {
  projects: ['steps', 'Updated', 'Set up groups'],
};

/** Titles and row wording of fixture docs in a per-account library collection. */
export function accountLibraryText(
  docs: Record<string, Record<string, unknown>> | undefined,
  type = ''
): string {
  const words = new Set<string>();
  for (const [path, data] of Object.entries(docs ?? {})) {
    const [root, , collection] = path.split('/');
    if (root !== 'users' || !ACCOUNT_LIBRARY_COLLECTIONS.has(collection))
      continue;
    if (typeof data.title === 'string') words.add(data.title);
  }
  if (words.size && Object.hasOwn(LIBRARY_ROW_WORDS, type))
    for (const w of LIBRARY_ROW_WORDS[type]) words.add(w);
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
