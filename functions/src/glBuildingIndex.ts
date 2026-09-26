// Guided Learning building-set index (docs/plans/shipped/GUIDED_LEARNING_STUDIO.md P5-1): a slim, server-written library mirror.
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { ALLOWED_ORIGINS } from './classlinkShared';
import './functionsInit';

export const GL_BUILDING_COLLECTION = 'building_guided_learning';
export const GL_BUILDING_INDEX_COLLECTION = 'building_guided_learning_index';

const MODES = new Set(['structured', 'guided', 'explore']);
const BACKFILL_PAGE = 200;

export interface GlBuildingIndexEntry {
  id: string;
  title: string;
  description: string | null;
  stepCount: number;
  mode: string;
  thumbnail: string;
  createdAt: number;
  updatedAt: number;
  hasLiveTour: boolean;
  isHelpCenter: boolean;
  folderId: string | null;
  order: number | null;
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

// The 400px thumbnail written beside a Storage slide, when there is one.
function storedThumbnail(
  data: Record<string, unknown>,
  url: string
): string | null {
  const thumbs = data.slideThumbnails;
  if (!thumbs || typeof thumbs !== 'object') return null;
  const thumb = (thumbs as Record<string, unknown>)[url];
  return typeof thumb === 'string' ? thumb : null;
}

// First non-video slide (its stored thumbnail if any), matching the client builder.
function pickThumbnail(data: Record<string, unknown>): string {
  const urls = Array.isArray(data.imageUrls) ? data.imageUrls : [];
  const kinds = Array.isArray(data.imageKinds) ? data.imageKinds : [];
  for (let i = 0; i < urls.length; i++) {
    if ((kinds[i] ?? 'image') !== 'video' && typeof urls[i] === 'string') {
      return storedThumbnail(data, urls[i] as string) ?? (urls[i] as string);
    }
  }
  return '';
}

export function buildGlBuildingIndexEntry(
  id: string,
  data: unknown
): GlBuildingIndexEntry | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const steps = Array.isArray(d.steps) ? d.steps : [];
  const updatedAt = num(d.updatedAt, 0);
  return {
    id,
    title: typeof d.title === 'string' ? d.title : '',
    description: typeof d.description === 'string' ? d.description : null,
    stepCount: steps.length,
    mode:
      typeof d.mode === 'string' && MODES.has(d.mode) ? d.mode : 'structured',
    thumbnail: pickThumbnail(d),
    createdAt: num(d.createdAt, updatedAt),
    updatedAt,
    hasLiveTour:
      typeof d.hasLiveTour === 'boolean'
        ? d.hasLiveTour
        : steps.some(
            (s) =>
              !!s && typeof s === 'object' && !!(s as { tour?: unknown }).tour
          ),
    isHelpCenter: d.helpCenter === true,
    folderId: typeof d.folderId === 'string' ? d.folderId : null,
    order: typeof d.order === 'number' ? d.order : null,
  };
}

// Reads the live set inside a transaction, so out-of-order events can't leave a stale entry.
export async function syncGlBuildingIndexEntry(
  db: admin.firestore.Firestore,
  setId: string
): Promise<'written' | 'removed'> {
  const setRef = db.collection(GL_BUILDING_COLLECTION).doc(setId);
  const indexRef = db.collection(GL_BUILDING_INDEX_COLLECTION).doc(setId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(setRef);
    const entry = snap.exists
      ? buildGlBuildingIndexEntry(setId, snap.data())
      : null;
    if (!entry) {
      tx.delete(indexRef);
      return 'removed';
    }
    tx.set(indexRef, entry);
    return 'written';
  });
}

// Control docs in the index collection; never library entries.
export const GL_INDEX_META_ID = '_meta';
export const GL_INDEX_LOCK_ID = '_lock';
const CONTROL_IDS = new Set([GL_INDEX_META_ID, GL_INDEX_LOCK_ID]);
export const GL_INDEX_LOCK_STALE_MS = 10 * 60 * 1000;

// Claims the one-time rebuild; a lock older than 10 minutes is treated as abandoned.
export async function claimGlBuildingIndexRebuild(
  db: admin.firestore.Firestore,
  now: number = Date.now()
): Promise<boolean> {
  const index = db.collection(GL_BUILDING_INDEX_COLLECTION);
  const metaRef = index.doc(GL_INDEX_META_ID);
  const lockRef = index.doc(GL_INDEX_LOCK_ID);
  return db.runTransaction(async (tx) => {
    const [meta, lock] = await Promise.all([tx.get(metaRef), tx.get(lockRef)]);
    if (meta.exists) return false;
    const startedAt: unknown = lock.exists ? lock.get('startedAt') : undefined;
    if (
      typeof startedAt === 'number' &&
      now - startedAt < GL_INDEX_LOCK_STALE_MS
    ) {
      return false;
    }
    tx.set(lockRef, { startedAt: now });
    return true;
  });
}

// Runs the full rebuild once per project, the first time any set is written without a _meta marker.
export async function ensureGlBuildingIndexBackfilled(
  db: admin.firestore.Firestore
): Promise<boolean> {
  const meta = await db
    .collection(GL_BUILDING_INDEX_COLLECTION)
    .doc(GL_INDEX_META_ID)
    .get();
  if (meta.exists) return false;
  if (!(await claimGlBuildingIndexRebuild(db))) return false;
  const result = await rebuildGlBuildingIndex(db);
  logger.info('[glBuildingIndex] automatic backfill', result);
  return true;
}

export const glBuildingIndexMirror = onDocumentWritten(
  {
    document: `${GL_BUILDING_COLLECTION}/{setId}`,
    memory: '512MiB',
    timeoutSeconds: 540,
    maxInstances: 10,
  },
  async (event) => {
    const { setId } = event.params;
    if (CONTROL_IDS.has(setId)) return;
    const db = admin.firestore();
    await syncGlBuildingIndexEntry(db, setId);
    await ensureGlBuildingIndexBackfilled(db);
  }
);

export async function rebuildGlBuildingIndex(
  db: admin.firestore.Firestore
): Promise<{ written: number; removed: number; failed: number }> {
  const index = db.collection(GL_BUILDING_INDEX_COLLECTION);
  const writer = db.bulkWriter();
  const seen = new Set<string>();
  let written = 0;
  let removed = 0;
  let failed = 0;
  const ops: Promise<void>[] = [];
  const onFail = (id: string) => (err: unknown) => {
    failed++;
    logger.warn('[glBuildingIndex] backfill write failed', { id, err });
  };
  let cursor: admin.firestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db
      .collection(GL_BUILDING_COLLECTION)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(BACKFILL_PAGE);
    if (cursor) q = q.startAfter(cursor);
    const page = await q.get();
    for (const doc of page.docs) {
      seen.add(doc.id);
      if (CONTROL_IDS.has(doc.id)) continue;
      const entry = buildGlBuildingIndexEntry(doc.id, doc.data());
      if (!entry) continue;
      ops.push(
        writer.set(index.doc(doc.id), entry).then(() => {
          written++;
        }, onFail(doc.id))
      );
    }
    if (page.docs.length < BACKFILL_PAGE) break;
    cursor = page.docs[page.docs.length - 1];
  }
  await writer.close();
  await Promise.all(ops);
  // Re-check unseen entries against the live set, so a set created mid-rebuild keeps its entry.
  for (const ref of await index.listDocuments()) {
    if (seen.has(ref.id) || CONTROL_IDS.has(ref.id)) continue;
    try {
      if ((await syncGlBuildingIndexEntry(db, ref.id)) === 'removed') {
        removed++;
      }
    } catch (err) {
      onFail(ref.id)(err);
    }
  }
  const batch = db.batch();
  batch.set(index.doc(GL_INDEX_META_ID), { backfilledAt: Date.now() });
  batch.delete(index.doc(GL_INDEX_LOCK_ID));
  await batch.commit();
  return { written, removed, failed };
}

// Same test as the rules' isAdmin(): a verified email with a doc in /admins.
export async function isRulesAdmin(
  db: admin.firestore.Firestore,
  token: { email?: string; email_verified?: boolean } | undefined
): Promise<boolean> {
  if (!token || token.email_verified !== true || !token.email) return false;
  const snap = await db
    .collection('admins')
    .doc(token.email.toLowerCase())
    .get();
  return snap.exists;
}

export const rebuildGlBuildingIndexV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 540,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in required.');
    const db = admin.firestore();
    if (!(await isRulesAdmin(db, request.auth.token))) {
      throw new HttpsError('permission-denied', 'Admin access required.');
    }
    const result = await rebuildGlBuildingIndex(db);
    logger.info('[glBuildingIndex] rebuilt', {
      ...result,
      by: request.auth.uid,
    });
    return result;
  }
);
