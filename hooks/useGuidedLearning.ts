/**
 * useGuidedLearning hook
 *
 * - Personal sets: metadata in Firestore, full data in Google Drive
 * - Admin building sets: full data in Firestore /building_guided_learning
 */

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useGoogleDrive } from './useGoogleDrive';
import { GuidedLearningSet, GuidedLearningSetMetadata } from '@/types';
import { GuidedLearningDriveService } from '@/utils/guidedLearningDriveService';
import {
  GuidedLearningDriveLike,
  MockGuidedLearningDriveService,
} from '@/utils/mockGuidedLearningDriveService';
import { normalizeGuidedLearningSet } from '@/components/widgets/GuidedLearning/utils/setMigration';

const GL_COLLECTION = 'guided_learning';
const BUILDING_GL_COLLECTION = 'building_guided_learning';

export interface UseGuidedLearningResult {
  sets: GuidedLearningSetMetadata[];
  buildingSets: GuidedLearningSet[];
  loading: boolean;
  buildingLoading: boolean;
  error: string | null;
  isDriveConnected: boolean;
  /** Save or update a personal set (saves to Drive + upserts Firestore metadata) */
  saveSet: (
    set: GuidedLearningSet,
    existingDriveFileId?: string
  ) => Promise<GuidedLearningSetMetadata>;
  /** Load full set data from Drive by driveFileId */
  loadSetData: (driveFileId: string) => Promise<GuidedLearningSet>;
  /** Delete a personal set from Drive and Firestore */
  deleteSet: (setId: string, driveFileId: string) => Promise<void>;
  /** Save an admin building set to Firestore */
  saveBuildingSet: (set: GuidedLearningSet) => Promise<void>;
  /** Delete an admin building set from Firestore */
  deleteBuildingSet: (setId: string) => Promise<void>;
}

export const useGuidedLearning = (
  userId: string | undefined
): UseGuidedLearningResult => {
  const { googleAccessToken, isAdmin } = useAuth();
  const { isConnected } = useGoogleDrive();
  const [sets, setSets] = useState<GuidedLearningSetMetadata[]>([]);
  const [buildingSets, setBuildingSets] = useState<GuidedLearningSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [buildingLoading, setBuildingLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real-time listener for personal set metadata
  useEffect(() => {
    if (!userId) {
      setTimeout(() => {
        setSets([]);
        setLoading(false);
      }, 0);
      return;
    }

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

  // Load building sets (one-time fetch — real-time listener not needed for admin content)
  useEffect(() => {
    const q = query(
      collection(db, BUILDING_GL_COLLECTION),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: GuidedLearningSet[] = snap.docs.map((d) =>
          normalizeGuidedLearningSet(d.data() as GuidedLearningSet)
        );
        setBuildingSets(list);
        setBuildingLoading(false);
      },
      (err) => {
        console.error('[useGuidedLearning] Building sets error:', err);
        setBuildingLoading(false);
      }
    );

    return unsub;
  }, []);

  const getDriveService = useCallback((): GuidedLearningDriveLike => {
    if (isAuthBypass) {
      if (!userId) throw new Error('Not authenticated');
      return new MockGuidedLearningDriveService(userId);
    }
    if (!googleAccessToken) {
      throw new Error(
        'Not connected to Google Drive. Please sign in again to grant access.'
      );
    }
    return new GuidedLearningDriveService(googleAccessToken);
  }, [googleAccessToken, userId]);

  const saveSet = useCallback(
    async (
      set: GuidedLearningSet,
      existingDriveFileId?: string
    ): Promise<GuidedLearningSetMetadata> => {
      if (!userId) throw new Error('Not authenticated');
      const drive = getDriveService();
      const updatedSet: GuidedLearningSet = normalizeGuidedLearningSet({
        ...set,
        updatedAt: Date.now(),
      });

      const driveFileId = await drive.saveSet(updatedSet, existingDriveFileId);

      const metadata: GuidedLearningSetMetadata = {
        id: set.id,
        title: set.title,
        description: set.description,
        stepCount: set.steps.length,
        mode: set.mode,
        imageUrl: updatedSet.imageUrls[0] ?? '',
        driveFileId,
        createdAt: set.createdAt,
        updatedAt: updatedSet.updatedAt,
      };

      await setDoc(doc(db, 'users', userId, GL_COLLECTION, set.id), metadata);

      return metadata;
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

  const saveBuildingSet = useCallback(
    async (set: GuidedLearningSet): Promise<void> => {
      if (!isAdmin) throw new Error('Admin access required');
      const updatedSet: GuidedLearningSet = {
        ...normalizeGuidedLearningSet(set),
        isBuilding: true,
        updatedAt: Date.now(),
      };
      await setDoc(doc(db, BUILDING_GL_COLLECTION, set.id), updatedSet);
    },
    [isAdmin]
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
    saveBuildingSet,
    deleteBuildingSet,
  };
};
