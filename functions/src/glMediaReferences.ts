// Every place a Guided Learning Storage file can be referenced (GUIDED_LEARNING_STUDIO.md P5-3).
import * as admin from 'firebase-admin';
import './functionsInit';

type Firestore = admin.firestore.Firestore;
type Query = admin.firestore.Query;

const PERSONAL_COLLECTION = 'guided_learning';
const BUILDING_COLLECTION = 'building_guided_learning';
const TOURS_COLLECTION = 'building_guided_learning_tours';
const SESSIONS_COLLECTION = 'guided_learning_sessions';
const TOMBSTONES_COLLECTION = 'gl_media_tombstones';
const ASSIGNMENTS_COLLECTION = 'guided_learning_assignments';
const MAX_DEPTH = 16;

// Custom metadata the client stamps on every GL upload; the sweep only considers marked files.
export const GL_MEDIA_MARKER = 'glMedia';
const GL_MEDIA_PATH = /^users\/([^/]+)\/hotspot_images\/.+$/s;

/** True for a GL media path, optionally only one owned by `ownerUid`. */
export function isGlMediaPath(path: string, ownerUid?: string): boolean {
  const owner = GL_MEDIA_PATH.exec(path)?.[1];
  if (!owner || path.includes('/../')) return false;
  return ownerUid === undefined || owner === ownerUid;
}

/** The object path behind a Firebase Storage download URL or a public GCS URL. */
export function storagePathFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const encoded =
    parsed.hostname === 'firebasestorage.googleapis.com'
      ? /\/o\/([^?#]+)/.exec(parsed.pathname)?.[1]
      : parsed.hostname === 'storage.googleapis.com'
        ? /^\/[^/]+\/(.+)$/.exec(parsed.pathname)?.[1]
        : undefined;
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** Adds every string in `value` (keys included) and the Storage path behind each URL. */
export function collectReferences(
  value: unknown,
  into: Set<string>,
  depth = 0
): void {
  if (depth > MAX_DEPTH || value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (!value) return;
    into.add(value);
    const path = storagePathFromUrl(value);
    if (path) into.add(path);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, into, depth + 1);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    collectReferences(key, into, depth + 1);
    collectReferences(item, into, depth + 1);
  }
}

async function scan(
  query: Query,
  visit: (doc: admin.firestore.QueryDocumentSnapshot) => void | Promise<void>
): Promise<void> {
  for await (const doc of query.stream() as unknown as AsyncIterable<admin.firestore.QueryDocumentSnapshot>) {
    await visit(doc);
  }
}

// A tombstone holds its files while any assignment it lists is still open; a malformed one always holds.
async function tombstoneHolds(
  db: Firestore,
  doc: admin.firestore.QueryDocumentSnapshot
): Promise<boolean> {
  const uid = doc.ref.parent.parent?.id;
  const ids: unknown = doc.get('assignmentIds');
  if (!uid || !Array.isArray(ids) || ids.length === 0) return true;
  if (!ids.every((id): id is string => typeof id === 'string' && id !== ''))
    return true;
  const snaps = await db.getAll(
    ...ids.map((id) => db.doc(`users/${uid}/${ASSIGNMENTS_COLLECTION}/${id}`))
  );
  return snaps.some((s) => s.exists && s.get('status') !== 'archived');
}

async function addTombstoneHolds(
  db: Firestore,
  into: Set<string>
): Promise<void> {
  await scan(db.collectionGroup(TOMBSTONES_COLLECTION), async (doc) => {
    if (await tombstoneHolds(db, doc)) collectReferences(doc.data(), into);
  });
}

async function addSessionReferences(
  db: Firestore,
  into: Set<string>
): Promise<void> {
  await scan(db.collection(SESSIONS_COLLECTION), async (doc) => {
    collectReferences(doc.data(), into);
    if (doc.get('stepsInContent') === true) {
      const content = await doc.ref.collection('content').doc('steps').get();
      collectReferences(content.data(), into);
    }
  });
}

// Sub-share bundles copy a personal set, tokenized URLs included, into shared_collections/{id}/keys.
async function addSubShareReferences(
  db: Firestore,
  into: Set<string>
): Promise<void> {
  await scan(db.collectionGroup('keys'), (doc) => {
    if (doc.ref.parent.parent?.parent.id !== 'shared_collections') return;
    collectReferences(doc.data(), into);
  });
}

export interface ReferenceScanOptions {
  /** A building set whose own listing does not count (its editor just removed the file). */
  ignoreBuildingSetId?: string;
}

/** Building and Help Center sets, published tours, sessions, sub-share keys and open tombstones. */
export async function loadSharedReferences(
  db: Firestore,
  opts: ReferenceScanOptions = {}
): Promise<Set<string>> {
  const refs = new Set<string>();
  await Promise.all([
    scan(db.collection(BUILDING_COLLECTION), (doc) => {
      if (doc.id !== opts.ignoreBuildingSetId)
        collectReferences(doc.data(), refs);
    }),
    // A published tour keeps showing its slides until it is republished.
    scan(db.collection(TOURS_COLLECTION), (doc) =>
      collectReferences(doc.data(), refs)
    ),
    addSessionReferences(db, refs),
    addSubShareReferences(db, refs),
    addTombstoneHolds(db, refs),
  ]);
  return refs;
}

/** Everything `loadSharedReferences` covers plus every personal set's metadata. */
export async function loadAllReferences(db: Firestore): Promise<Set<string>> {
  const [shared, personal] = await Promise.all([
    loadSharedReferences(db),
    (async () => {
      const refs = new Set<string>();
      await scan(db.collectionGroup(PERSONAL_COLLECTION), (doc) =>
        collectReferences(doc.data(), refs)
      );
      return refs;
    })(),
  ]);
  for (const ref of personal) shared.add(ref);
  return shared;
}

export interface IgnoredPersonalSet {
  uid: string;
  setId: string;
}

/** True when a personal set other than `ignore` lists `path` in its imagePaths. */
export async function personalSetListsPath(
  db: Firestore,
  path: string,
  ignore?: IgnoredPersonalSet
): Promise<boolean> {
  const snap = await db
    .collectionGroup(PERSONAL_COLLECTION)
    .where('imagePaths', 'array-contains', path)
    .limit(2)
    .get();
  return snap.docs.some(
    (doc) =>
      !ignore ||
      doc.id !== ignore.setId ||
      doc.ref.parent.parent?.id !== ignore.uid
  );
}

/** True when the owner has a personal set last saved by a client that did not record its files. */
export async function ownerHasUnrecordedSet(
  db: Firestore,
  uid: string
): Promise<boolean> {
  const snap = await db.collection(`users/${uid}/${PERSONAL_COLLECTION}`).get();
  return snap.docs.some((doc) => !Array.isArray(doc.get('driveFileIds')));
}

/** The uploading user of a GL media path. */
export function glMediaOwner(path: string): string | undefined {
  return GL_MEDIA_PATH.exec(path)?.[1];
}
