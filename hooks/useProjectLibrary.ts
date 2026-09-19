/** Teacher-owned project library at `/users/{uid}/projects/{projectId}` (D12). */

import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { ProjectDefinition } from '@/types';
import { logError } from '@/utils/logError';
import { MAX_STEPS } from '@/components/widgets/Projects/projectSteps';
import { suggestDuplicateTitle } from '@/components/common/library/libraryDuplicate';

const PROJECTS_COLLECTION = 'projects';

interface UseProjectLibraryResult {
  projects: ProjectDefinition[];
  loading: boolean;
  error: string | null;
  saveProject: (project: ProjectDefinition) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  setArchived: (projectId: string, archived: boolean) => Promise<void>;
  duplicateProject: (project: ProjectDefinition) => Promise<ProjectDefinition>;
  reorderProjects: (orderedIds: string[]) => Promise<void>;
}

const normalize = (project: ProjectDefinition): ProjectDefinition => {
  const next: ProjectDefinition = {
    ...project,
    title: project.title.trim() || 'Untitled project',
    description: project.description?.trim() ?? '',
    steps: project.steps.slice(0, MAX_STEPS),
    folderId: project.folderId ?? null,
    updatedAt: Date.now(),
  };
  // setDoc rejects an explicit undefined, and `order` stays unset until a drag.
  if (next.order === undefined) delete next.order;
  return next;
};

export function useProjectLibrary(
  userId: string | undefined
): UseProjectLibraryResult {
  const [projects, setProjects] = useState<ProjectDefinition[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  const [previousUserId, setPreviousUserId] = useState(userId);
  if (previousUserId !== userId) {
    setPreviousUserId(userId);
    setProjects([]);
    setLoading(Boolean(userId));
    setError(null);
  }

  useEffect(() => {
    if (!userId) return undefined;
    return onSnapshot(
      query(
        collection(db, 'users', userId, PROJECTS_COLLECTION),
        orderBy('updatedAt', 'desc')
      ),
      (snapshot) => {
        setProjects(
          snapshot.docs.map((snapshotDoc) => ({
            ...(snapshotDoc.data() as Omit<ProjectDefinition, 'id'>),
            id: snapshotDoc.id,
          }))
        );
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        logError('useProjectLibrary.onSnapshot', snapshotError, { userId });
        setError('Projects could not be loaded.');
        setLoading(false);
      }
    );
  }, [userId]);

  const saveProject = useCallback(
    async (project: ProjectDefinition) => {
      if (!userId) throw new Error('Sign in to save a project.');
      const normalized = normalize(project);
      await setDoc(
        doc(db, 'users', userId, PROJECTS_COLLECTION, normalized.id),
        normalized
      );
    },
    [userId]
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      if (!userId) throw new Error('Sign in to delete a project.');
      await deleteDoc(doc(db, 'users', userId, PROJECTS_COLLECTION, projectId));
    },
    [userId]
  );

  const setArchived = useCallback(
    async (projectId: string, archived: boolean) => {
      if (!userId) throw new Error('Sign in to archive a project.');
      await setDoc(
        doc(db, 'users', userId, PROJECTS_COLLECTION, projectId),
        { archivedAt: archived ? Date.now() : null, updatedAt: Date.now() },
        { merge: true }
      );
    },
    [userId]
  );

  const duplicateProject = useCallback(
    async (project: ProjectDefinition): Promise<ProjectDefinition> => {
      if (!userId) throw new Error('Sign in to duplicate a project.');
      const now = Date.now();
      // Fresh step ids: a copy's progress must never key against the original's.
      const copy: ProjectDefinition = {
        ...project,
        id: crypto.randomUUID(),
        title: suggestDuplicateTitle(project.title),
        steps: project.steps.map((step) => ({
          ...step,
          id: crypto.randomUUID(),
        })),
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      };
      await setDoc(
        doc(db, 'users', userId, PROJECTS_COLLECTION, copy.id),
        normalize(copy)
      );
      return copy;
    },
    [userId]
  );

  const reorderProjects = useCallback(
    async (orderedIds: string[]) => {
      if (!userId) throw new Error('Sign in to reorder projects.');
      // No updatedAt bump: reordering is a display choice, not an edit.
      const batch = writeBatch(db);
      orderedIds.forEach((projectId, index) => {
        batch.update(doc(db, 'users', userId, PROJECTS_COLLECTION, projectId), {
          order: index,
        });
      });
      await batch.commit();
    },
    [userId]
  );

  return {
    projects,
    loading,
    error,
    saveProject,
    deleteProject,
    setArchived,
    duplicateProject,
    reorderProjects,
  };
}
