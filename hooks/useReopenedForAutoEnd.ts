import { useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizAssignment } from '@/types';

const ending = new Set<string>();
/** Firestore's `in` limit; larger picks wait for the teacher to End. */
const MAX_WATCHED = 30;

/** Ends a quiz reopened for selected students once every one of them has submitted again. */
export function useReopenedForAutoEnd(
  assignments: readonly QuizAssignment[],
  end: (assignmentId: string) => Promise<void>
): void {
  const watched = assignments
    .filter(
      (a) =>
        a.status === 'active' &&
        (a.reopenedFor?.length ?? 0) > 0 &&
        (a.reopenedFor?.length ?? 0) <= MAX_WATCHED
    )
    .map((a) => `${a.id}|${(a.reopenedFor ?? []).join(',')}`)
    .sort()
    .join(';');

  useEffect(() => {
    if (!watched) return;
    const unsubs = watched.split(';').map((entry) => {
      const [id, list] = entry.split('|');
      const uids = list.split(',');
      return onSnapshot(
        query(
          collection(db, 'quiz_sessions', id, 'responses'),
          where('studentUid', 'in', uids),
          where('status', '==', 'completed')
        ),
        (snap) => {
          const done = new Set<unknown>(
            snap.docs.map((d): unknown => d.get('studentUid'))
          );
          if (!uids.every((u) => done.has(u)) || ending.has(id)) return;
          ending.add(id);
          end(id)
            .catch((err: unknown) =>
              console.error('[useReopenedForAutoEnd] End failed:', err)
            )
            .finally(() => ending.delete(id));
        },
        (err) => console.error('[useReopenedForAutoEnd] listener:', err)
      );
    });
    return () => unsubs.forEach((u) => u());
  }, [watched, end]);
}
