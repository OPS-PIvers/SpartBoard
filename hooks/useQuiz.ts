/**
 * useQuiz hook
 *
 * Manages quiz metadata in Firestore and quiz content in Google Drive.
 * Teachers create/read/update/delete quizzes through this hook.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDoc,
  addDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db, isAuthBypass } from '../config/firebase';
import { useAuth } from '../context/useAuth';
import { useGoogleDrive } from './useGoogleDrive';
import { QuizData, QuizMetadata, type QuizMetadataSyncLinkage } from '../types';
import { QuizDriveService } from '../utils/quizDriveService';
import {
  MockQuizDriveService,
  QuizDriveLike,
} from '../utils/mockQuizDriveService';
import {
  publishSyncedQuiz,
  pullSyncedQuizContent,
  callLeaveSyncedQuizGroup,
  SyncedQuizVersionConflictError,
} from './useSyncedQuizGroups';
import { migrateQuizMetadataShape } from '../utils/quizSyncMigration';

const QUIZZES_COLLECTION = 'quizzes';

export interface UseQuizResult {
  quizzes: QuizMetadata[];
  loading: boolean;
  error: string | null;
  /**
   * Save or update a quiz (saves to Drive + upserts Firestore metadata).
   *
   * Synced-group propagation: if the existing `quiz_metadata` doc for this
   * quiz already carries a `syncGroupId`, this function ALSO publishes the
   * new content to `/synced_quizzes/{groupId}` via a version-bumping
   * transaction. Peers' `onSnapshot` listeners pick up the change and their
   * library cards surface a "Sync available" pill.
   *
   * Throws `SyncedQuizVersionConflictError` if the local Drive replica is
   * stale (a peer published a newer version since the editor last
   * pulled). The caller should prompt the teacher to pull-then-retry —
   * see QuizEditorModal's save handler.
   */
  saveQuiz: (
    quiz: QuizData,
    existingDriveFileId?: string
  ) => Promise<QuizMetadata>;
  /** Load full quiz data from Drive by its driveFileId */
  loadQuizData: (driveFileId: string) => Promise<QuizData>;
  /** Delete a quiz from Drive and Firestore */
  deleteQuiz: (quizId: string, driveFileId: string) => Promise<void>;
  /** Parse a Google Sheet URL and return quiz questions */
  importFromSheet: (sheetUrl: string, title: string) => Promise<QuizData>;
  /** Parse a CSV string and return quiz questions */
  importFromCSV: (csvContent: string, title: string) => Promise<QuizData>;
  /** Create a template Google Sheet for quiz imports in the user's Drive */
  createQuizTemplate: () => Promise<string>;
  /** Share a quiz publicly and return the share URL */
  shareQuiz: (quizMeta: QuizMetadata) => Promise<string>;
  /** Import a shared quiz into the current user's library */
  importSharedQuiz: (shareId: string) => Promise<void>;
  /**
   * Pull the latest canonical content for a synced quiz into the local
   * Drive file. Used by the "Sync available" pill on the library card.
   *
   * Reads `/synced_quizzes/{quizMeta.sync.groupId}` for the latest
   * questions/title, overwrites the local Drive replica, and bumps
   * `sync.lastSyncedVersion` on the local metadata. No-ops on quizzes
   * without a `sync` linkage (returns the same metadata).
   */
  pullSyncedQuiz: (quizMeta: QuizMetadata) => Promise<QuizMetadata>;
  /**
   * Detach the local quiz from its synced group ("Stop syncing"). Calls
   * `leaveSyncedQuizGroup` so the user is removed from the canonical
   * doc's participants list, then clears the `sync` sub-object on the
   * local metadata. The local Drive file stays — it becomes a
   * standalone copy.
   *
   * Other peers in the group remain connected; an empty group is
   * intentionally left in place so future paste of the same share URL
   * still resolves.
   */
  detachSyncedQuiz: (quizMeta: QuizMetadata) => Promise<QuizMetadata>;
  /**
   * Patch the local `quiz_metadata` doc with sync linkage. Used by the
   * import path: after `saveQuiz` writes a fresh copy, the importer calls
   * this to mark the local quiz as a participant of the synced group.
   * Idempotent — a no-op if the linkage is already present and matches.
   */
  attachSyncLinkage: (
    quizId: string,
    linkage: QuizMetadataSyncLinkage
  ) => Promise<void>;
  /** Is a Drive service available? */
  isDriveConnected: boolean;
}

export const useQuiz = (userId: string | undefined): UseQuizResult => {
  const { googleAccessToken } = useAuth();
  const { isConnected } = useGoogleDrive();
  const [quizzes, setQuizzes] = useState<QuizMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real-time listener for quiz metadata from Firestore
  useEffect(() => {
    if (!userId) {
      setTimeout(() => {
        setQuizzes([]);
        setLoading(false);
      }, 0);
      return;
    }

    const q = query(
      collection(db, 'users', userId, QUIZZES_COLLECTION),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        // Pipe every doc through the legacy-shape mapper so consumers
        // see the canonical `sync` sub-object regardless of when the
        // doc was written.
        const list: QuizMetadata[] = snap.docs.map((d) =>
          migrateQuizMetadataShape(d.data())
        );
        setQuizzes(list);
        setLoading(false);
      },
      (err) => {
        console.error('[useQuiz] Firestore error:', err);
        setError('Failed to load quizzes');
        setLoading(false);
      }
    );

    return unsub;
  }, [userId]);

  const getDriveService = useCallback((): QuizDriveLike => {
    if (isAuthBypass) {
      if (!userId) throw new Error('Not authenticated');
      return new MockQuizDriveService(userId);
    }
    if (!googleAccessToken) {
      throw new Error(
        'Not connected to Google Drive. Please sign in again to grant access.'
      );
    }
    return new QuizDriveService(googleAccessToken);
  }, [googleAccessToken, userId]);

  const saveQuiz = useCallback(
    async (
      quiz: QuizData,
      existingDriveFileId?: string
    ): Promise<QuizMetadata> => {
      if (!userId) throw new Error('Not authenticated');
      const drive = getDriveService();
      const updatedQuiz: QuizData = { ...quiz, updatedAt: Date.now() };

      // Read the existing metadata so we know whether this quiz is part
      // of a synced group and what version we're publishing on top of.
      // The canonical doc's transaction asserts
      // `current.version === expectedVersion` — if a peer published in the
      // window between the editor opening and Save being clicked, we throw
      // SyncedQuizVersionConflictError so the editor can offer a pull.
      const metaRef = doc(db, 'users', userId, QUIZZES_COLLECTION, quiz.id);
      const existingMetaSnap = await getDoc(metaRef);
      const existingMeta = existingMetaSnap.exists()
        ? migrateQuizMetadataShape(existingMetaSnap.data())
        : null;
      const existingSync = existingMeta?.sync;

      // Order matters: publish to the canonical synced doc BEFORE writing
      // the Drive replica. If publish throws (peer beat us, network blip),
      // we want the local Drive file unchanged so the editor stays
      // recoverable — the teacher can pull the latest, re-apply, retry.
      // Once publish succeeds the version invariant guarantees no peer
      // can land between us and the Drive write; a Drive failure after
      // a successful publish leaves the canonical ahead of the local
      // replica, and the next "Sync available" pull reconciles it.
      let nextSyncedVersion: number | undefined = undefined;
      if (existingSync) {
        const result = await publishSyncedQuiz(existingSync.groupId, {
          title: updatedQuiz.title,
          questions: updatedQuiz.questions,
          expectedVersion: existingSync.lastSyncedVersion,
          uid: userId,
        });
        nextSyncedVersion = result.version;
      }

      const driveFileId = await drive.saveQuiz(
        updatedQuiz,
        existingDriveFileId
      );

      const metadata: QuizMetadata = {
        id: quiz.id,
        title: quiz.title,
        driveFileId,
        questionCount: quiz.questions.length,
        createdAt: quiz.createdAt,
        updatedAt: updatedQuiz.updatedAt,
        // Preserve folder assignment + synced linkage across saves so the
        // editor can't accidentally drop them by re-writing the metadata.
        ...(existingMeta?.folderId !== undefined
          ? { folderId: existingMeta.folderId }
          : {}),
        ...(existingSync
          ? {
              sync: {
                groupId: existingSync.groupId,
                lastSyncedVersion:
                  nextSyncedVersion ?? existingSync.lastSyncedVersion,
              },
            }
          : {}),
      };

      await setDoc(metaRef, metadata);

      return metadata;
    },
    [userId, getDriveService]
  );

  const pullSyncedQuiz = useCallback(
    async (quizMeta: QuizMetadata): Promise<QuizMetadata> => {
      if (!userId) throw new Error('Not authenticated');
      if (!quizMeta.sync) {
        // No-op for unsynced quizzes.
        return { ...quizMeta };
      }
      const drive = getDriveService();
      const canonical = await pullSyncedQuizContent(quizMeta.sync.groupId);

      // Overwrite the local Drive replica with the canonical content. We
      // keep the local quiz `id` + `createdAt` so the library entry's
      // identity and history don't churn — only the editable surface
      // (title + questions) is replaced.
      const now = Date.now();
      const refreshed: QuizData = {
        id: quizMeta.id,
        title: canonical.title,
        questions: canonical.questions,
        createdAt: quizMeta.createdAt,
        updatedAt: now,
      };
      const driveFileId = await drive.saveQuiz(refreshed, quizMeta.driveFileId);

      const metadata: QuizMetadata = {
        id: quizMeta.id,
        title: canonical.title,
        driveFileId,
        questionCount: canonical.questions.length,
        createdAt: quizMeta.createdAt,
        updatedAt: now,
        ...(quizMeta.folderId !== undefined
          ? { folderId: quizMeta.folderId }
          : {}),
        sync: {
          groupId: quizMeta.sync.groupId,
          lastSyncedVersion: canonical.version,
        },
      };
      await setDoc(
        doc(db, 'users', userId, QUIZZES_COLLECTION, quizMeta.id),
        metadata
      );
      return metadata;
    },
    [userId, getDriveService]
  );

  const attachSyncLinkage = useCallback(
    async (quizId: string, linkage: QuizMetadataSyncLinkage): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const metaRef = doc(db, 'users', userId, QUIZZES_COLLECTION, quizId);
      const snap = await getDoc(metaRef);
      if (!snap.exists()) {
        throw new Error(
          `Cannot attach sync linkage: quiz ${quizId} not in library.`
        );
      }
      const existing = migrateQuizMetadataShape(snap.data());
      if (
        existing.sync?.groupId === linkage.groupId &&
        existing.sync?.lastSyncedVersion === linkage.lastSyncedVersion
      ) {
        return;
      }
      await setDoc(
        metaRef,
        {
          ...existing,
          sync: {
            groupId: linkage.groupId,
            lastSyncedVersion: linkage.lastSyncedVersion,
          },
        } satisfies QuizMetadata,
        { merge: false }
      );
    },
    [userId]
  );

  const detachSyncedQuiz = useCallback(
    async (quizMeta: QuizMetadata): Promise<QuizMetadata> => {
      if (!userId) throw new Error('Not authenticated');
      if (!quizMeta.sync) {
        return { ...quizMeta };
      }
      // Remove the caller from the canonical doc's participant list
      // BEFORE clearing the local linkage. Letting the Cloud Function
      // failure short-circuit the whole detach is the right call here —
      // the prior swallow-and-warn behavior could leave the user as a
      // phantom server-side participant while the local UI claimed they
      // had stopped syncing, and rejoining the same group later would
      // silently re-link them to a slot they never knew they still
      // occupied. Surfacing the failure lets the caller (Widget.tsx
      // `onDetachSyncedQuiz`) toast a real error and lets the user
      // retry.
      await callLeaveSyncedQuizGroup(quizMeta.sync.groupId);
      const metadata: QuizMetadata = {
        id: quizMeta.id,
        title: quizMeta.title,
        driveFileId: quizMeta.driveFileId,
        questionCount: quizMeta.questionCount,
        createdAt: quizMeta.createdAt,
        updatedAt: Date.now(),
        ...(quizMeta.folderId !== undefined
          ? { folderId: quizMeta.folderId }
          : {}),
        // Intentionally omit `sync` so the metadata reverts to the
        // unsynced shape.
      };
      await setDoc(
        doc(db, 'users', userId, QUIZZES_COLLECTION, quizMeta.id),
        metadata
      );
      return metadata;
    },
    [userId]
  );

  const loadQuizData = useCallback(
    async (driveFileId: string): Promise<QuizData> => {
      const drive = getDriveService();
      return drive.loadQuiz(driveFileId);
    },
    [getDriveService]
  );

  const deleteQuiz = useCallback(
    async (quizId: string, driveFileId: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const drive = getDriveService();

      // Note: the old session-cascade lived here. With multi-assignment support,
      // ending a session is no longer tied to deleting a quiz from the library —
      // the caller (Widget.tsx) is responsible for warning the teacher if any
      // active assignments reference this quiz.

      // Delete from Drive (ignore 404 — file may already be gone)
      await drive.deleteQuizFile(driveFileId).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[useQuiz] Drive delete warning:', msg);
      });

      // Delete metadata from Firestore
      await deleteDoc(doc(db, 'users', userId, QUIZZES_COLLECTION, quizId));
    },
    [userId, getDriveService]
  );

  const importFromSheet = useCallback(
    async (sheetUrl: string, title: string): Promise<QuizData> => {
      const sheetId = QuizDriveService.extractSheetId(sheetUrl);
      if (!sheetId) {
        throw new Error(
          'Invalid Google Sheet URL. Copy the URL directly from your browser.'
        );
      }
      const drive = getDriveService();
      const questions = await drive.importFromGoogleSheet(sheetId);
      const now = Date.now();
      return {
        id: crypto.randomUUID(),
        title,
        questions,
        createdAt: now,
        updatedAt: now,
      };
    },
    [getDriveService]
  );

  const importFromCSV = useCallback(
    (csvContent: string, title: string): Promise<QuizData> => {
      const questions = QuizDriveService.parseCSVQuestions(csvContent);
      const now = Date.now();
      return Promise.resolve({
        id: crypto.randomUUID(),
        title,
        questions,
        createdAt: now,
        updatedAt: now,
      });
    },
    []
  );

  const createQuizTemplate = useCallback(async (): Promise<string> => {
    const drive = getDriveService();
    return drive.createQuizTemplate();
  }, [getDriveService]);

  const shareQuiz = useCallback(
    async (quizMeta: QuizMetadata): Promise<string> => {
      if (!userId) throw new Error('Not authenticated');
      const drive = getDriveService();
      const quizData = await drive.loadQuiz(quizMeta.driveFileId);
      const shareRef = await addDoc(collection(db, 'shared_quizzes'), {
        ...quizData,
        originalAuthor: userId,
        sharedAt: Date.now(),
      });
      return `${window.location.origin}/share/quiz/${shareRef.id}`;
    },
    [userId, getDriveService]
  );

  const importSharedQuiz = useCallback(
    async (shareId: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const snap = await getDoc(doc(db, 'shared_quizzes', shareId));
      if (!snap.exists()) throw new Error('Shared quiz not found');
      const shared = snap.data() as QuizData & {
        originalAuthor: string;
        sharedAt: number;
      };
      // Create a fresh copy for this user
      const newQuiz: QuizData = {
        id: crypto.randomUUID(),
        title: shared.title,
        questions: shared.questions,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveQuiz(newQuiz);
    },
    [userId, saveQuiz]
  );

  return {
    quizzes,
    loading,
    error,
    saveQuiz,
    loadQuizData,
    deleteQuiz,
    importFromSheet,
    importFromCSV,
    createQuizTemplate,
    shareQuiz,
    importSharedQuiz,
    pullSyncedQuiz,
    detachSyncedQuiz,
    attachSyncLinkage,
    isDriveConnected: isAuthBypass || isConnected,
  };
};

// Re-export the version-conflict error so consumers (e.g. QuizEditorModal)
// can `instanceof`-check it without importing from the synced-groups hook
// directly. Keeps useQuiz.ts the canonical surface for quiz operations.
export { SyncedQuizVersionConflictError };
