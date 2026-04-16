/**
 * Dev-only mock of GuidedLearningDriveService for auth-bypass mode.
 *
 * When VITE_AUTH_BYPASS=true there is no Google access token, so the real
 * Drive service cannot save or load guided learning sets. This mock stores
 * the full GuidedLearningSet blob in localStorage keyed by synthetic file
 * IDs. Metadata continues to live in Firestore under the normal
 * guided_learning path — only the blob half of the storage pair is replaced.
 *
 * localStorage was chosen over a Firestore-backed mock path so no dev-only
 * rule has to be deployed to the shared production Firebase project.
 *
 * Only activated when isAuthBypass is true.
 */
import { GuidedLearningSet } from '../types';

const STORAGE_PREFIX = 'mock_gl_drive';

/** Structural surface of GuidedLearningDriveService consumed by useGuidedLearning. */
export interface GuidedLearningDriveLike {
  saveSet(set: GuidedLearningSet, existingFileId?: string): Promise<string>;
  loadSet(driveFileId: string): Promise<GuidedLearningSet>;
  deleteSetFile(driveFileId: string): Promise<void>;
}

export class MockGuidedLearningDriveService implements GuidedLearningDriveLike {
  constructor(private userId: string) {}

  private key(fileId: string): string {
    return `${STORAGE_PREFIX}:${this.userId}:${fileId}`;
  }

  saveSet(set: GuidedLearningSet, existingFileId?: string): Promise<string> {
    const fileId = existingFileId ?? `mock-${crypto.randomUUID()}`;
    localStorage.setItem(this.key(fileId), JSON.stringify(set));
    return Promise.resolve(fileId);
  }

  loadSet(driveFileId: string): Promise<GuidedLearningSet> {
    const raw = localStorage.getItem(this.key(driveFileId));
    if (!raw)
      return Promise.reject(
        new Error('Guided Learning set not found in mock drive')
      );
    return Promise.resolve(JSON.parse(raw) as GuidedLearningSet);
  }

  deleteSetFile(driveFileId: string): Promise<void> {
    localStorage.removeItem(this.key(driveFileId));
    return Promise.resolve();
  }
}
