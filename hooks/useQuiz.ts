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
import { db } from '../config/firebase';
import { useAuth } from '../context/useAuth';
import { useGoogleDrive } from './useGoogleDrive';
import { useQuizSessionTeacher } from './useQuizSession';
import { QuizData, QuizMetadata } from '../types';
import { QuizDriveService } from '../utils/quizDriveService';

const QUIZZES_COLLECTION = 'quizzes';

export interface UseQuizResult {
  quizzes: QuizMetadata[];
  loading: boolean;
  error: string | null;
  /** Save or update a quiz (saves to Drive + upserts Firestore metadata) */
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
  /** Is a Drive service available? */
  isDriveConnected: boolean;
}

export const useQuiz = (userId: string | undefined): UseQuizResult => {
  const { googleAccessToken } = useAuth();
  const { isConnected } = useGoogleDrive();
  const { session, endQuizSession } = useQuizSessionTeacher(userId);
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
        const list: QuizMetadata[] = snap.docs.map(
          (d) => d.data() as QuizMetadata
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

  const getDriveService = useCallback((): QuizDriveService => {
    if (!googleAccessToken) {
      throw new Error(
        'Not connected to Google Drive. Please sign in again to grant access.'
      );
    }
    return new QuizDriveService(googleAccessToken);
  }, [googleAccessToken]);

  const saveQuiz = useCallback(
    async (
      quiz: QuizData,
      existingDriveFileId?: string
    ): Promise<QuizMetadata> => {
      if (!userId) throw new Error('Not authenticated');
      const drive = getDriveService();
      const updatedQuiz: QuizData = { ...quiz, updatedAt: Date.now() };

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
      };

      await setDoc(
        doc(db, 'users', userId, QUIZZES_COLLECTION, quiz.id),
        metadata
      );

      return metadata;
    },
    [userId, getDriveService]
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

      // If this quiz is currently active, end the session first
      if (session && session.quizId === quizId) {
        await endQuizSession();
      }

      // Delete from Drive (ignore 404 — file may already be gone)
      await drive.deleteQuizFile(driveFileId).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[useQuiz] Drive delete warning:', msg);
      });

      // Delete metadata from Firestore
      await deleteDoc(doc(db, 'users', userId, QUIZZES_COLLECTION, quizId));
    },
    [userId, getDriveService, session, endQuizSession]
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
    isDriveConnected: isConnected,
  };
};
