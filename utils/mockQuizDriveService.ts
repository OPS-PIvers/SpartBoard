/**
 * Dev-only mock of QuizDriveService for auth-bypass mode.
 *
 * When VITE_AUTH_BYPASS=true there is no Google access token, so the real
 * Drive service cannot save or load quizzes. This mock stores the full
 * QuizData blob in localStorage keyed by synthetic file IDs. Metadata
 * continues to live in Firestore under the normal quizzes path — only
 * the blob half of the storage pair is replaced.
 *
 * localStorage was chosen over a Firestore-backed mock path so no dev-only
 * rule has to be deployed to the shared production Firebase project.
 *
 * Only activated when isAuthBypass is true.
 */
import { QuizData, QuizQuestion } from '../types';

const STORAGE_PREFIX = 'mock_quiz_drive';

/** Structural surface of QuizDriveService consumed by useQuiz / useVideoActivity. */
export interface QuizDriveLike {
  saveQuiz(quiz: QuizData, existingFileId?: string): Promise<string>;
  loadQuiz(fileId: string): Promise<QuizData>;
  deleteQuizFile(fileId: string): Promise<void>;
  importFromGoogleSheet(
    sheetId: string,
    sheetName?: string
  ): Promise<QuizQuestion[]>;
  createQuizTemplate(): Promise<string>;
  createVideoActivityTemplate(title: string): Promise<string>;
}

export class MockQuizDriveService implements QuizDriveLike {
  constructor(private userId: string) {}

  private key(fileId: string): string {
    return `${STORAGE_PREFIX}:${this.userId}:${fileId}`;
  }

  saveQuiz(quiz: QuizData, existingFileId?: string): Promise<string> {
    const fileId = existingFileId ?? `mock-${crypto.randomUUID()}`;
    localStorage.setItem(this.key(fileId), JSON.stringify(quiz));
    return Promise.resolve(fileId);
  }

  loadQuiz(fileId: string): Promise<QuizData> {
    const raw = localStorage.getItem(this.key(fileId));
    if (!raw)
      return Promise.reject(new Error('Quiz file not found in mock drive'));
    return Promise.resolve(JSON.parse(raw) as QuizData);
  }

  deleteQuizFile(fileId: string): Promise<void> {
    localStorage.removeItem(this.key(fileId));
    return Promise.resolve();
  }

  importFromGoogleSheet(): Promise<QuizQuestion[]> {
    return Promise.reject(
      new Error(
        'Google Sheet import is not available in auth-bypass mode. Use CSV import instead.'
      )
    );
  }

  createQuizTemplate(): Promise<string> {
    return Promise.reject(
      new Error(
        'Template creation requires Google Drive. Not available in auth-bypass mode.'
      )
    );
  }

  createVideoActivityTemplate(): Promise<string> {
    return Promise.reject(
      new Error(
        'Template creation requires Google Drive. Not available in auth-bypass mode.'
      )
    );
  }
}
