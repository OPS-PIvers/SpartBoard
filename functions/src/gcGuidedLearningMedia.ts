/**
 * gcGuidedLearningMedia — delete Firebase Storage slides that nothing
 * references any more (GUIDED_LEARNING_STUDIO.md P5-3).
 *
 * A file is kept while any personal set lists it in `imagePaths`, any
 * building or Help Center set mentions it, any assignment session or
 * sub-share bundle points at it, or an open tombstone holds it. Duplicates
 * share files on purpose, so this check runs before every delete.
 */
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { isRulesAdmin } from './glBuildingIndex';
import {
  isGlMediaPath,
  loadSharedReferences,
  personalSetListsPath,
  type IgnoredPersonalSet,
} from './glMediaReferences';
import './functionsInit';

const PERSONAL_COLLECTION = 'guided_learning';
const BUILDING_COLLECTION = 'building_guided_learning';
const MAX_RELEASE_PATHS = 200;

export function readImagePaths(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const raw = (data as { imagePaths?: unknown }).imagePaths;
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.filter((p): p is string => typeof p === 'string' && p.length > 0)
    ),
  ];
}

export interface GcOptions {
  /** A personal set whose own listing does not count. */
  ignorePersonal?: IgnoredPersonalSet;
  /** A building set whose own listing does not count. */
  ignoreBuildingSetId?: string;
}

// Returns the paths that were deleted.
export async function gcOrphanedSlidePaths(
  paths: string[],
  opts: GcOptions = {}
): Promise<string[]> {
  if (paths.length === 0) return [];
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  let shared: Set<string>;
  try {
    shared = await loadSharedReferences(db, {
      ignoreBuildingSetId: opts.ignoreBuildingSetId,
    });
  } catch (err) {
    // Without a full reference picture nothing is provably unused.
    logger.warn('[gcGuidedLearningMedia] reference scan failed; kept all', {
      count: paths.length,
      err,
    });
    return [];
  }
  const deleted: string[] = [];
  for (const path of paths) {
    try {
      if (shared.has(path)) continue;
      if (await personalSetListsPath(db, path, opts.ignorePersonal)) continue;
      await bucket.file(path).delete({ ignoreNotFound: true });
      deleted.push(path);
    } catch (err) {
      logger.warn('[gcGuidedLearningMedia] failed to gc slide', { path, err });
    }
  }
  return deleted;
}

export const gcGuidedLearningMedia = onDocumentDeleted(
  {
    document: `users/{uid}/${PERSONAL_COLLECTION}/{setId}`,
    timeoutSeconds: 300,
  },
  async (event) => {
    const { uid, setId } = event.params;
    // A personal set can only release its owner's uploads.
    const paths = readImagePaths(event.data?.data()).filter((p) =>
      isGlMediaPath(p, uid)
    );
    const deleted = await gcOrphanedSlidePaths(paths);
    if (deleted.length > 0) {
      logger.info('[gcGuidedLearningMedia] deleted orphaned slides', {
        setId,
        paths: deleted,
      });
    }
  }
);

export const gcBuildingGuidedLearningMedia = onDocumentDeleted(
  { document: `${BUILDING_COLLECTION}/{setId}`, timeoutSeconds: 300 },
  async (event) => {
    const paths = readImagePaths(event.data?.data()).filter((p) =>
      isGlMediaPath(p)
    );
    const deleted = await gcOrphanedSlidePaths(paths);
    if (deleted.length > 0) {
      logger.info('[gcGuidedLearningMedia] deleted orphaned building slides', {
        setId: event.params.setId,
        paths: deleted,
      });
    }
  }
);

interface ReleaseRequest {
  setId?: unknown;
  building?: unknown;
  paths?: unknown;
}

// The editor's close flush: files its set no longer uses, deleted only if nothing else does.
export const releaseGuidedLearningMediaV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 300,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in required.');
    const data = (request.data ?? {}) as ReleaseRequest;
    const setId = typeof data.setId === 'string' ? data.setId : '';
    const rawPaths = Array.isArray(data.paths) ? data.paths : [];
    if (!setId || rawPaths.length > MAX_RELEASE_PATHS) {
      throw new HttpsError('invalid-argument', 'Bad release request.');
    }
    const uid = request.auth.uid;
    const db = admin.firestore();
    const building = data.building === true;
    const isAdmin =
      building ||
      rawPaths.some((p) => typeof p === 'string' && !isGlMediaPath(p, uid))
        ? await isRulesAdmin(db, request.auth.token)
        : false;
    if (building && !isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required.');
    }
    // Teachers release only their own uploads; admins edit sets that hold other admins' files.
    const paths = [
      ...new Set(
        rawPaths.filter(
          (p): p is string =>
            typeof p === 'string' && isGlMediaPath(p, isAdmin ? undefined : uid)
        )
      ),
    ];
    const deleted = await gcOrphanedSlidePaths(
      paths,
      building
        ? { ignoreBuildingSetId: setId }
        : { ignorePersonal: { uid, setId } }
    );
    if (deleted.length > 0) {
      logger.info('[gcGuidedLearningMedia] released editor media', {
        setId,
        by: uid,
        paths: deleted,
      });
    }
    return { deleted: deleted.length };
  }
);
