import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

/**
 * Default page size for the bounded read of a Firestore (sub)collection. The
 * naive unbounded `getDocs(collection(...))` pulls every doc in one round-trip
 * — a PLC-shared assignment with thousands of responses could read the whole
 * subcollection at once. Paging with `limit()` + a `documentId()` cursor caps
 * each round-trip at this many reads while still visiting every doc. Ordering
 * by `documentId()` needs no composite index and gives a stable cursor.
 */
export const FIRESTORE_PAGE_SIZE = 500;

/**
 * Read every doc in a (sub)collection in bounded pages, returning the
 * accumulated snapshots. Shared by the quiz / video-activity / guided-learning
 * score-publish paths so grading still sees the full response set while no
 * single Firestore query is unbounded.
 */
export async function readAllDocsPaged(
  coll: ReturnType<typeof collection>,
  pageSize: number = FIRESTORE_PAGE_SIZE
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const docs: QueryDocumentSnapshot<DocumentData>[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  for (;;) {
    const pageQuery: Query<DocumentData> = cursor
      ? query(coll, orderBy(documentId()), startAfter(cursor), limit(pageSize))
      : query(coll, orderBy(documentId()), limit(pageSize));
    const pageSnap = await getDocs(pageQuery);
    docs.push(...pageSnap.docs);
    if (pageSnap.docs.length < pageSize) break;
    cursor = pageSnap.docs[pageSnap.docs.length - 1];
  }
  return docs;
}
