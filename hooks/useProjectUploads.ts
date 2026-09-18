/** One group's uploaded work (D19/D20); the object lands before the doc that points at it. */

import { useCallback, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/config/firebase';
import type { ProjectUpload } from '@/types';
import { logError } from '@/utils/logError';
// Pure filename sanitiser, no Activity Wall state — imported rather than
// copied so the two upload paths cannot drift on what they strip.
import { safeFileName } from '@/components/activityWall/submission/uploadLimits';
import {
  projectUploadStoragePath,
  validateProjectUpload,
} from '@/components/widgets/Projects/projectUploads';

export const RUNS_COLLECTION = 'project_runs';

interface UseProjectUploadsResult {
  uploads: ProjectUpload[];
  loading: boolean;
  error: string | null;
  uploadFile: (file: File, stepId?: string) => Promise<void>;
  removeUpload: (upload: ProjectUpload) => Promise<void>;
}

export class ProjectUploadError extends Error {}

export function useProjectUploads(
  runId: string | null | undefined,
  groupId: string | null | undefined,
  actorUid: string | undefined,
  actorRole: 'student' | 'teacher'
): UseProjectUploadsResult {
  const [uploads, setUploads] = useState<ProjectUpload[]>([]);
  const [loading, setLoading] = useState(Boolean(runId && groupId));
  const [error, setError] = useState<string | null>(null);

  const [previousKey, setPreviousKey] = useState(`${runId}:${groupId}`);
  if (previousKey !== `${runId}:${groupId}`) {
    setPreviousKey(`${runId}:${groupId}`);
    setUploads([]);
    setLoading(Boolean(runId && groupId));
    setError(null);
  }

  useEffect(() => {
    if (!runId || !groupId) return undefined;
    return onSnapshot(
      collection(db, RUNS_COLLECTION, runId, 'groups', groupId, 'uploads'),
      (snapshot) => {
        setUploads(
          snapshot.docs.map((snapshotDoc) => ({
            ...(snapshotDoc.data() as Omit<ProjectUpload, 'id'>),
            id: snapshotDoc.id,
          }))
        );
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        logError('useProjectUploads.subscribe', snapshotError, {
          runId,
          groupId,
        });
        setError('Files could not be loaded.');
        setLoading(false);
      }
    );
  }, [groupId, runId]);

  const uploadFile = useCallback(
    async (file: File, stepId?: string) => {
      if (!runId || !groupId || !actorUid) {
        throw new ProjectUploadError('Sign in to add a file.');
      }
      const invalid = validateProjectUpload(file);
      if (invalid) throw new ProjectUploadError(invalid);

      const uploadId = crypto.randomUUID();
      const fileName = safeFileName(file.name);
      const storagePath = projectUploadStoragePath(
        runId,
        groupId,
        uploadId,
        fileName
      );

      await uploadBytes(ref(storage, storagePath), file, {
        contentType: file.type,
      });

      const record: ProjectUpload = {
        id: uploadId,
        fileName,
        contentType: file.type,
        sizeBytes: file.size,
        uploadedByUid: actorUid,
        uploadedAt: Date.now(),
        storagePath,
        archiveStatus: 'firebase',
        ...(stepId ? { stepId } : {}),
      };

      try {
        await setDoc(
          doc(
            db,
            RUNS_COLLECTION,
            runId,
            'groups',
            groupId,
            'uploads',
            uploadId
          ),
          record
        );
      } catch (writeError) {
        // The object is already in the bucket and nothing references it, so a
        // failed doc write has to take it back out or it archives to nobody.
        await deleteObject(ref(storage, storagePath)).catch(() => undefined);
        throw writeError;
      }

      // D24 — the log is the teacher's audit trail; a failed entry must never
      // roll back the upload it describes.
      try {
        await addDoc(
          collection(db, RUNS_COLLECTION, runId, 'groups', groupId, 'events'),
          {
            at: Date.now(),
            actorUid,
            actorRole,
            kind: 'upload',
            ...(stepId ? { stepId } : {}),
            detail: fileName,
          }
        );
      } catch (eventError) {
        logError('useProjectUploads.logEvent', eventError, { runId, groupId });
      }
    },
    [actorRole, actorUid, groupId, runId]
  );

  const removeUpload = useCallback(
    async (upload: ProjectUpload) => {
      if (!runId || !groupId) {
        throw new ProjectUploadError('No project is running.');
      }
      await deleteDoc(
        doc(db, RUNS_COLLECTION, runId, 'groups', groupId, 'uploads', upload.id)
      );
      // Only the transit copy is the client's to remove; once the archive has
      // run there is nothing left in the bucket and Drive keeps the file.
      if (upload.storagePath) {
        await deleteObject(ref(storage, upload.storagePath)).catch(
          () => undefined
        );
      }
    },
    [groupId, runId]
  );

  return { uploads, loading, error, uploadFile, removeUpload };
}
