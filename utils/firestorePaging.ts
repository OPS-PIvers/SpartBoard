import {
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
 * Read every doc matched by a (sub)collection reference OR an already-filtered
 * query in bounded pages, returning the accumulated snapshots. Shared by the
 * quiz / video-activity / guided-learning score-publish paths (which pass a
 * plain collection ref) and the collection delete-all cascade (which passes a
 * `where(...)`-filtered query) so the full result set is still visited while
 * no single Firestore query is unbounded. A `CollectionReference` is itself a
 * `Query`, so existing callers are unaffected; the `orderBy(documentId())` +
 * `startAfter` cursor composes onto whatever filters the caller already set.
 */
export async function readAllDocsPaged(
  coll: Query<DocumentData>,
  pageSize: number = FIRESTORE_PAGE_SIZE
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  if (!(pageSize >= 1)) {
    // Guard the exported API: a 0 / negative / NaN pageSize makes `limit()`
    // invalid and `pageSnap.docs.length < pageSize` never true, so the loop
    // would never terminate. Fail fast on misuse rather than spin forever.
    throw new RangeError(`pageSize must be >= 1 (received ${pageSize})`);
  }
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
