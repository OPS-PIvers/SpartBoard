// Closes a teacher's Activity Walls to a Synced or View-Only board share.

import {
  arrayRemove,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
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
      const listed = Array.isArray(ids)
        ? ids.filter(
            (id): id is string =>
              typeof id === 'string' &&
              (id === boardShareId || id.startsWith(`${boardShareId}/`))
          )
        : [];
      if (listed.length === 0) return;
      await updateDoc(accessRef, { boardShareIds: arrayRemove(...listed) });
      // Tells the board's members to re-check access.
      await updateDoc(session.ref, { boardAccessAt: Date.now() });
    })
  );
};
