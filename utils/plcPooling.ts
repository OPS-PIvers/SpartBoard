/**
 * Title-aware PLC pooling (docs/plans/PLC_ASSESSMENT_DATA.md §8.1).
 *
 * Sessions pool by `syncGroupId`. Each teacher's PLC assign used to mint its
 * own group, so one quiz split into one pool per teacher. These helpers pick
 * the PLC library group whose title matches so new runs land in one pool.
 */

/** Case/whitespace-insensitive key used to compare quiz titles. */
export function normalizePoolTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim();
}

interface PoolLibraryEntry {
  title: string;
  syncGroupId: string;
  deletedAt?: number | null;
}

/** First live library entry whose normalized title equals `quizTitle`. */
export function findPoolGroupByTitle<T extends PoolLibraryEntry>(
  entries: readonly T[],
  quizTitle: string
): T | undefined {
  const key = normalizePoolTitle(quizTitle);
  if (!key) return undefined;
  return entries.find(
    (e) => e.deletedAt == null && normalizePoolTitle(e.title) === key
  );
}

export interface ResolvePoolArgs {
  /** The quiz's own `sync.groupId`, when it is already synced. */
  quizSyncGroupId?: string;
  quizTitle: string;
  /** The PLC's live quiz library. */
  libraryEntries: readonly PoolLibraryEntry[];
}

/**
 * Pooling key override for `createAssignment`: the quiz's own group when it
 * is already in the PLC library, else the library group with the same title,
 * else `undefined` (caller keeps the template/minted group).
 */
export function resolvePlcPoolSyncGroupId(
  args: ResolvePoolArgs
): string | undefined {
  const { quizSyncGroupId, quizTitle, libraryEntries } = args;
  if (
    quizSyncGroupId &&
    libraryEntries.some(
      (e) => e.deletedAt == null && e.syncGroupId === quizSyncGroupId
    )
  ) {
    return quizSyncGroupId;
  }
  return findPoolGroupByTitle(libraryEntries, quizTitle)?.syncGroupId;
}

interface PoolAssessmentCandidate {
  syncGroupId: string;
  title: string;
  sourceQuizId?: string;
}

/**
 * Order existing assessments for the retroactive picker: same source quiz
 * first, then exact normalized title, then the rest in their given order.
 */
export function rankPoolCandidates<T extends PoolAssessmentCandidate>(
  assessments: readonly T[],
  target: { quizId: string; title: string }
): T[] {
  const key = normalizePoolTitle(target.title);
  const rank = (a: T): number =>
    a.sourceQuizId && a.sourceQuizId === target.quizId
      ? 0
      : normalizePoolTitle(a.title) === key
        ? 1
        : 2;
  return assessments
    .map((a, i) => ({ a, i, r: rank(a) }))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map((x) => x.a);
}
