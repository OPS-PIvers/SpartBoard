// Closes a teacher's Activity Walls to a Synced or View-Only board share.

import {
  arrayRemove,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';

/** Removes `boardShareId` from every wall of `uid`'s that isn't in `keepActivityIds`. */
export const closeWallsToBoard = async (
  uid: string,
  boardShareId: string,
  keepActivityIds: ReadonlySet<string>
): Promise<void> => {
  if (isAuthBypass) return;
  // Only walls ever opened to a board carry boardAccessAt.
  const sessions = await getDocs(
    query(
      collection(db, 'activity_wall_sessions'),
      where('teacherUid', '==', uid),
      where('boardAccessAt', '>', 0)
    )
  );
  await Promise.all(
    sessions.docs.map(async (session) => {
      const activityId: unknown = session.data().activityId;
      if (typeof activityId === 'string' && keepActivityIds.has(activityId)) {
        return;
      }
      // Same doc as wallBoardAccessDoc, inlined so the board shell skips the widget's chunk.
      const accessRef = doc(session.ref, 'boardAccess', 'boards');
      const access = await getDoc(accessRef);
      const ids: unknown = access.data()?.boardShareIds;
      // Entries are "shareId" or, once pinned to the host, "shareId/hostUid".
      const all: unknown[] = Array.isArray(ids) ? ids : [];
      const listed = all.filter(
        (id): id is string =>
          typeof id === 'string' &&
          (id === boardShareId || id.startsWith(`${boardShareId}/`))
      );
      if (listed.length === 0) return;
      const batch = writeBatch(db);
      batch.update(accessRef, { boardShareIds: arrayRemove(...listed) });
      // Changing boardAccessAt tells members to re-check; clearing it drops a closed wall from this query.
      batch.update(session.ref, {
        boardAccessAt:
          listed.length === all.length ? deleteField() : Date.now(),
      });
      await batch.commit();
    })
  );
};
