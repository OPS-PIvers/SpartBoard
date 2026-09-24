/**
 * useGuidedLearning hook
 *
 * - Personal sets: metadata in Firestore, full data in Google Drive
 * - Admin building sets: full data in Firestore /building_guided_learning;
 *   the library lists the server-written /building_guided_learning_index.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  runTransaction,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useGoogleDrive } from './useGoogleDrive';
import {
  GuidedLearningBuildingSetIndex,
  GuidedLearningSet,
  GuidedLearningSetMetadata,
} from '@/types';
import { assertGuidedLearningDocFits } from '@/utils/firestoreDocSize';
import {
  BUILDING_INDEX_CONTROL_IDS,
  BUILDING_INDEX_META_ID,
  buildBuildingIndexEntry,
} from '@/components/widgets/GuidedLearning/utils/buildingIndexEntry';
import { pickThumbnailUrl } from '@/utils/guidedLearningMedia';
import { GuidedLearningDriveService } from '@/utils/guidedLearningDriveService';
import {
  GuidedLearningDriveLike,
  MockGuidedLearningDriveService,
} from '@/utils/mockGuidedLearningDriveService';
import { normalizeGuidedLearningSet } from '@/components/widgets/GuidedLearning/utils/setMigration';
import { withSlideFileRefs } from '@/components/widgets/GuidedLearning/utils/slideMedia';
import { suggestDuplicateTitle } from '@/components/common/library/libraryDuplicate';
import { logError } from '@/utils/logError';
import {
  GuidedLearningSaveConflictError,
  type GuidedLearningSaveGuard,
  isStaleRevision,
} from '@/components/widgets/GuidedLearning/utils/saveConflict';

const GL_COLLECTION = 'guided_learning';
const BUILDING_GL_COLLECTION = 'building_guided_learning';
const BUILDING_GL_INDEX_COLLECTION = 'building_guided_learning_index';

export interface UseGuidedLearningResult {
  sets: GuidedLearningSetMetadata[];
  /** Library entries only; fetch the full set with `loadBuildingSet` on Play, Edit or preview. */
  buildingSets: GuidedLearningBuildingSetIndex[];
  loading: boolean;
  buildingLoading: boolean;
  error: string | null;
  isDriveConnected: boolean;
  /** Save or update a personal set (saves to Drive + upserts Firestore metadata) */
  saveSet: (
    set: GuidedLearningSet,
    existingDriveFileId?: string,
    guard?: GuidedLearningSaveGuard
  ) => Promise<GuidedLearningSetMetadata>;
  /** Load full set data from Drive by driveFileId */
  loadSetData: (driveFileId: string) => Promise<GuidedLearningSet>;
  /** Delete a personal set from Drive and Firestore */
  deleteSet: (setId: string, driveFileId: string) => Promise<void>;
  /**
   * Duplicate a personal set. Loads the source's JSON from Drive, mints
   * a new id + Drive file, and writes a fresh metadata doc with a
   * `(Copy)` title suffix. Firebase Storage image refs are shared with
   * the source — duplicating doesn't re-upload images, which keeps the
   * copy cheap and avoids stale image churn. The duplicate is
   * standalone (no PLC linkage carried over).
   */
  duplicateSet: (
    source: GuidedLearningSetMetadata
  ) => Promise<GuidedLearningSetMetadata>;
  /** Save an admin building set to Firestore */
  saveBuildingSet: (
    set: GuidedLearningSet,
    guard?: GuidedLearningSaveGuard
  ) => Promise<void>;
  /** Delete an admin building set from Firestore */
  deleteBuildingSet: (setId: string) => Promise<void>;
  /** Duplicate an admin building set by id into a new doc (Storage refs shared). */
  duplicateBuildingSet: (setId: string) => Promise<GuidedLearningSet>;
}

export const useGuidedLearning = (
  userId: string | undefined
): UseGuidedLearningResult => {
  const { googleAccessToken, isAdmin } = useAuth();
  const { isConnected } = useGoogleDrive();
  const [sets, setSets] = useState<GuidedLearningSetMetadata[]>([]);
  const [buildingSets, setBuildingSets] = useState<
    GuidedLearningBuildingSetIndex[]
  >([]);
  const [loading, setLoading] = useState(!!userId);
  const [buildingLoading, setBuildingLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prevUserId, setPrevUserId] = useState(userId);
  // Latest metadata snapshot, read by saveSet to return folderId and order.
  const setsRef = useRef<GuidedLearningSetMetadata[]>([]);

  // Adjusting-state-while-rendering: synchronously reset on userId transitions.
  if (prevUserId !== userId) {
    setPrevUserId(userId);
    if (!userId) {
      setSets([]);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  // Real-time listener for personal set metadata
  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'users', userId, GL_COLLECTION),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: GuidedLearningSetMetadata[] = snap.docs.map(
          (d) => d.data() as GuidedLearningSetMetadata
        );
        setsRef.current = list;
        setSets(list);
        setLoading(false);
      },
      (err) => {
        console.error('[useGuidedLearning] Firestore error:', err);
        setError('Failed to load guided learning sets');
        setLoading(false);
      }
    );

    return unsub;
  }, [userId]);

  // Null until the index's _meta marker is read; false means not backfilled yet.
  const [indexReady, setIndexReady] = useState<boolean | null>(null);
  useEffect(
    () =>
      onSnapshot(
        doc(db, BUILDING_GL_INDEX_COLLECTION, BUILDING_INDEX_META_ID),
        (snap) => setIndexReady(snap.exists()),
        (err) => {
          console.error('[useGuidedLearning] Index marker error:', err);
          setIndexReady(false);
        }
      ),
    []
  );

  // Listens to the slim index once backfilled, else derives entries from the full sets.
  useEffect(() => {
    if (indexReady === null) return;
    const q = query(
      collection(
        db,
        indexReady ? BUILDING_GL_INDEX_COLLECTION : BUILDING_GL_COLLECTION
      ),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.flatMap((d) => {
          if (BUILDING_INDEX_CONTROL_IDS.has(d.id)) return [];
          if (indexReady) return [d.data() as GuidedLearningBuildingSetIndex];
          const entry = buildBuildingIndexEntry(d.id, d.data());
          return entry ? [entry] : [];
        });
        setBuildingSets(list);
        setBuildingLoading(false);
      },
      (err) => {
        console.error('[useGuidedLearning] Building sets error:', err);
        setBuildingLoading(false);
      }
    );

    return unsub;
  }, [indexReady]);

  // One service per token, so its folder cache survives across saves.
  const driveService = useMemo((): GuidedLearningDriveLike | null => {
    if (isAuthBypass) {
      return userId ? new MockGuidedLearningDriveService(userId) : null;
    }
    return googleAccessToken
      ? new GuidedLearningDriveService(googleAccessToken)
      : null;
  }, [googleAccessToken, userId]);

  const getDriveService = useCallback((): GuidedLearningDriveLike => {
    if (driveService) return driveService;
    if (isAuthBypass) throw new Error('Not authenticated');
    throw new Error(
      'Not connected to Google Drive. Please sign in again to grant access.'
    );
  }, [driveService]);

  const saveSet = useCallback(
    async (
      set: GuidedLearningSet,
      existingDriveFileId?: string,
      guard?: GuidedLearningSaveGuard
    ): Promise<GuidedLearningSetMetadata> => {
      if (!userId) throw new Error('Not authenticated');
      const drive = getDriveService();
      const metaRef = doc(db, 'users', userId, GL_COLLECTION, set.id);
      // Drive can't be transacted, so check the metadata revision before touching it.
      const personalConflict = (stored: DocumentData) =>
        new GuidedLearningSaveConflictError(async () => {
          const latest = normalizeGuidedLearningSet(
            await drive.loadSet(String(stored.driveFileId))
          );
          const revision: unknown = stored.updatedAt;
          return {
            set: latest,
            updatedAt:
              typeof revision === 'number' ? revision : latest.updatedAt,
          };
        });
      if (guard) {
        const before = (await getDoc(metaRef)).data();
        if (before && isStaleRevision(before, guard))
          throw personalConflict(before);
      }
      // A guarded save keeps the editor's stamp so the editor knows the new revision.
      const updatedSet: GuidedLearningSet = withSlideFileRefs(
        normalizeGuidedLearningSet({
          ...set,
          updatedAt: guard ? set.updatedAt : Date.now(),
        })
      );

      const driveFileId = await drive.saveSet(updatedSet, existingDriveFileId);

      const metadata: GuidedLearningSetMetadata = {
        id: set.id,
        title: set.title,
        description: set.description,
        stepCount: set.steps.length,
        mode: set.mode,
        imageUrl: pickThumbnailUrl(updatedSet),
        driveFileId,
        createdAt: set.createdAt,
        updatedAt: updatedSet.updatedAt,
      };
      // Mirrored so file cleanup can see which slides a set owns.
      if (updatedSet.imagePaths) metadata.imagePaths = updatedSet.imagePaths;
      if (updatedSet.driveFileIds)
        metadata.driveFileIds = updatedSet.driveFileIds;

      // Merge keeps library-owned fields (folderId, order) the editor never sees.
      const metaWrite = {
        ...metadata,
        description: metadata.description ?? deleteField(),
        imagePaths: metadata.imagePaths ?? deleteField(),
        driveFileIds: metadata.driveFileIds ?? deleteField(),
      };
      if (guard) {
        await runTransaction(db, async (tx) => {
          const stored = (await tx.get(metaRef)).data();
          if (stored && isStaleRevision(stored, guard))
            throw personalConflict(stored);
          tx.set(metaRef, metaWrite, { merge: true });
        });
      } else {
        await setDoc(metaRef, metaWrite, { merge: true });
      }

      const existing = setsRef.current.find((m) => m.id === set.id);
      return {
        ...metadata,
        ...(existing?.folderId !== undefined
          ? { folderId: existing.folderId }
          : {}),
        ...(existing?.order !== undefined ? { order: existing.order } : {}),
      };
    },
    [userId, getDriveService]
  );

  const loadSetData = useCallback(
    async (driveFileId: string): Promise<GuidedLearningSet> => {
      const drive = getDriveService();
      const loadedSet = await drive.loadSet(driveFileId);
      return normalizeGuidedLearningSet(loadedSet);
    },
    [getDriveService]
  );

  const deleteSet = useCallback(
    async (setId: string, driveFileId: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const drive = getDriveService();

      await drive.deleteSetFile(driveFileId).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[useGuidedLearning] Drive delete warning:', msg);
      });

      await deleteDoc(doc(db, 'users', userId, GL_COLLECTION, setId));
    },
    [userId, getDriveService]
  );

  /**
   * Hand-rolled write (not via `saveSet`) so we can observe the
   * freshly-created Drive file id and roll it back on Firestore
   * failure — `saveSet` only surfaces the id on success and would
   * leak an orphan Drive file otherwise. Mirrors `useQuiz.duplicateQuiz`.
   * Reviewer flag from PR #1587.
   */
  const duplicateSet = useCallback(
    async (
      source: GuidedLearningSetMetadata
    ): Promise<GuidedLearningSetMetadata> => {
      if (!userId) throw new Error('Not authenticated');
      const drive = getDriveService();
      const sourceData = await loadSetData(source.driveFileId);
      const now = Date.now();
      const fresh: GuidedLearningSet = withSlideFileRefs(
        normalizeGuidedLearningSet({
          ...sourceData,
          id: crypto.randomUUID(),
          title: suggestDuplicateTitle(sourceData.title || source.title),
          createdAt: now,
          updatedAt: now,
          // Storage image refs are shared — see hook header doc. If
          // teachers report stale images after a delete, switch this to a
          // deep copy via the storage-clone helper.
        })
      );
      let createdDriveFileId: string | undefined;
      try {
        createdDriveFileId = await drive.saveSet(fresh);
        const metadata: GuidedLearningSetMetadata = {
          id: fresh.id,
          title: fresh.title,
          description: fresh.description,
          stepCount: fresh.steps.length,
          mode: fresh.mode,
          imageUrl: pickThumbnailUrl(fresh),
          driveFileId: createdDriveFileId,
          createdAt: fresh.createdAt,
          updatedAt: fresh.updatedAt,
          // Listed on the copy too, so cleanup keeps files the two share.
          ...(fresh.imagePaths ? { imagePaths: fresh.imagePaths } : {}),
          ...(fresh.driveFileIds ? { driveFileIds: fresh.driveFileIds } : {}),
          // Preserve folder placement on duplicate.
          ...(source.folderId !== undefined
            ? { folderId: source.folderId }
            : {}),
        };
        await setDoc(
          doc(db, 'users', userId, GL_COLLECTION, fresh.id),
          metadata
        );
        return metadata;
      } catch (err) {
        if (createdDriveFileId) {
          try {
            await drive.deleteSetFile(createdDriveFileId);
          } catch (rollbackErr) {
            logError('useGuidedLearning.duplicateSet.rollback', rollbackErr, {
              sourceSetId: source.id,
              orphanDriveFileId: createdDriveFileId,
            });
          }
        }
        throw err;
      }
    },
    [userId, getDriveService, loadSetData]
  );

  const saveBuildingSet = useCallback(
    async (
      set: GuidedLearningSet,
      guard?: GuidedLearningSaveGuard
    ): Promise<void> => {
      if (!isAdmin) throw new Error('Admin access required');
      const updatedSet: GuidedLearningSet = {
        ...withSlideFileRefs(normalizeGuidedLearningSet(set)),
        isBuilding: true,
        updatedAt: guard ? set.updatedAt : Date.now(),
      };
      assertGuidedLearningDocFits(
        `${BUILDING_GL_COLLECTION}/${set.id}`,
        updatedSet
      );
      await writeBuildingSet(
        doc(db, BUILDING_GL_COLLECTION, set.id),
        updatedSet,
        guard
      );
    },
    [isAdmin]
  );

  // Re-attributes authorUid to the duplicating admin; Storage refs stay shared.
  const duplicateBuildingSet = useCallback(
    async (setId: string): Promise<GuidedLearningSet> => {
      if (!isAdmin) throw new Error('Admin access required');
      if (!userId) throw new Error('Not authenticated');
      const source = await loadBuildingSet(setId);
      if (!source) throw new Error('Set not found');
      const now = Date.now();
      const fresh: GuidedLearningSet = normalizeGuidedLearningSet({
        ...source,
        id: crypto.randomUUID(),
        title: suggestDuplicateTitle(source.title),
        isBuilding: true,
        authorUid: userId,
        createdAt: now,
        updatedAt: now,
      });
      assertGuidedLearningDocFits(
        `${BUILDING_GL_COLLECTION}/${fresh.id}`,
        fresh
      );
      await setDoc(doc(db, BUILDING_GL_COLLECTION, fresh.id), fresh);
      return fresh;
    },
    [isAdmin, userId]
  );

  const deleteBuildingSet = useCallback(
    async (setId: string): Promise<void> => {
      if (!isAdmin) throw new Error('Admin access required');
      await deleteDoc(doc(db, BUILDING_GL_COLLECTION, setId));
    },
    [isAdmin]
  );

  return {
    sets,
    buildingSets,
    loading,
    buildingLoading,
    error,
    isDriveConnected: isAuthBypass || isConnected,
    saveSet,
    loadSetData,
    deleteSet,
    duplicateSet,
    duplicateBuildingSet,
    saveBuildingSet,
    deleteBuildingSet,
  };
};

// Transactional revision check for a building set; unguarded callers write as before.
const writeBuildingSet = async (
  ref: DocumentReference,
  set: GuidedLearningSet,
  guard: GuidedLearningSaveGuard | undefined
): Promise<void> => {
  if (!guard) {
    await setDoc(ref, set);
    return;
  }
  await runTransaction(db, async (tx) => {
    const stored = (await tx.get(ref)).data();
    if (stored && isStaleRevision(stored, guard)) {
      const latest = normalizeGuidedLearningSet(stored as GuidedLearningSet);
      throw new GuidedLearningSaveConflictError(() =>
        Promise.resolve({ set: latest, updatedAt: latest.updatedAt })
      );
    }
    tx.set(ref, set);
  });
};

// Single shared-set read for surfaces that reference one set by id (Help center guides).
export const loadBuildingSet = async (
  setId: string
): Promise<GuidedLearningSet | null> => {
  const snap = await getDoc(doc(db, BUILDING_GL_COLLECTION, setId));
  if (!snap.exists()) return null;
  return normalizeGuidedLearningSet(snap.data() as GuidedLearningSet);
};

// Moves building sets out of the Guided Learning library and into the Help Center only.
export const markHelpCenterSets = async (
  setIds: readonly string[]
): Promise<void> => {
  await Promise.all(
    setIds.map((setId) =>
      updateDoc(doc(db, BUILDING_GL_COLLECTION, setId), { helpCenter: true })
    )
  );
};
