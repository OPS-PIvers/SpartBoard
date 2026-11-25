/**
 * Guided Learning Drive Service
 *
 * Handles Google Drive API interactions for the Guided Learning widget:
 * - Saving full GuidedLearningSet JSON to "SpartBoard/Guided Learning/" folder
 * - Loading set data from Drive
 * - Deleting set files from Drive
 *
 * Admin-created building sets are stored in Firestore directly (no Drive needed).
 */

import { GuidedLearningSet } from '@/types';
import { DRIVE_APP_FOLDER } from '@/config/devProject';
import { DevProdDriveWriteError } from '@/utils/devDriveWriteGuard';
import { authError } from '@/utils/driveAuthErrors';
import {
  DRIVE_API_URL,
  DRIVE_UPLOAD_API_URL as UPLOAD_API_URL,
  DriveSession,
  driveQueryEscape,
  sanitizeDriveFileName,
  resetDriveRequestStateForTests,
  type DriveRequestOptions,
  type DriveTokenRefresher,
} from '@/utils/driveRequest';
import {
  GL_SLIDE_APP_PROPERTY,
  isInAppFolder,
  type DriveParentMeta,
} from '@/utils/driveAppFolder';

const GL_FOLDER_NAME = 'Guided Learning';
const GL_SLIDE_FOLDERS = ['Assets/HotspotImages'];

interface DriveFileCreateResponse {
  id: string;
  name: string;
}

interface DriveFileListResponse {
  files?: { id: string; name: string }[];
}

const RECONNECT_MESSAGE =
  'Google Drive access expired. Reconnect Google Drive to keep saving.';

export class GuidedLearningDriveService {
  private session: DriveSession;

  constructor(accessToken: string, refreshToken?: DriveTokenRefresher) {
    this.session = new DriveSession(accessToken, refreshToken);
  }

  private get jsonHeaders() {
    return { 'Content-Type': 'application/json' };
  }

  // A 401 the token refresh couldn't fix throws a reconnect error.
  private async request(
    url: string,
    init: RequestInit = {},
    opts?: DriveRequestOptions
  ): Promise<Response> {
    const res = await this.session.request(url, init, opts);
    if (res.status === 401) throw authError(RECONNECT_MESSAGE, '401');
    return res;
  }

  private getGLFolderId(): Promise<string> {
    return this.session.getOrCreateFolderPath(DRIVE_APP_FOLDER, [
      GL_FOLDER_NAME,
    ]);
  }

  private patchContent(fileId: string, content: string): Promise<Response> {
    return this.request(`${UPLOAD_API_URL}/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: content,
    });
  }

  /**
   * Save a guided learning set to Google Drive.
   * If existingFileId is provided, updates that file.
   * Returns the Drive file ID.
   */
  async saveSet(
    set: GuidedLearningSet,
    existingFileId?: string
  ): Promise<string> {
    const content = JSON.stringify(set);

    if (existingFileId) {
      const updateRes = await this.patchContent(existingFileId, content).catch(
        (err: unknown) => {
          // On dev, a set synced from the live site gets a dev copy and the caller repoints to it.
          if (err instanceof DevProdDriveWriteError) return null;
          throw err;
        }
      );
      if (updateRes?.ok) return existingFileId;
      // Only a missing file may fall through to lookup/create; anything else would duplicate.
      if (updateRes && updateRes.status !== 404) {
        throw new Error('Failed to save guided learning set to Drive');
      }
    }

    const folderId = await this.getGLFolderId();
    const fileName = `${sanitizeDriveFileName(set.title)}.${set.id.slice(0, 8)}.gl.json`;

    // Check if a file with the same name already exists in the folder
    const existingRes = await this.request(
      `${DRIVE_API_URL}/files?q=${encodeURIComponent(
        `name = '${driveQueryEscape(fileName)}' and '${folderId}' in parents and trashed = false`
      )}&fields=files(id)`,
      {}
    );
    if (!existingRes.ok) {
      throw new Error('Failed to look up guided learning file in Drive');
    }
    const existing = (await existingRes.json()) as DriveFileListResponse;
    if (existing.files && existing.files.length > 0) {
      const fileId = existing.files[0].id;
      const patchRes = await this.patchContent(fileId, content);
      if (patchRes.ok) return fileId;
      throw new Error('Failed to save guided learning set to Drive');
    }

    const metaRes = await this.request(`${DRIVE_API_URL}/files`, {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
        mimeType: 'application/json',
      }),
    });
    if (!metaRes.ok) {
      // A stale cached folder (deleted by the teacher) is looked up again next save.
      this.session.forgetFolders();
      throw new Error('Failed to create guided learning file in Drive');
    }
    const meta = (await metaRes.json()) as DriveFileCreateResponse;

    const uploadRes = await this.patchContent(meta.id, content);
    if (!uploadRes.ok)
      throw new Error('Failed to upload guided learning content to Drive');
    return meta.id;
  }

  /** Load full set data from Drive by file ID */
  async loadSet(driveFileId: string): Promise<GuidedLearningSet> {
    const res = await this.request(
      `${DRIVE_API_URL}/files/${driveFileId}?alt=media`,
      {}
    );
    if (!res.ok)
      throw new Error('Failed to load guided learning set from Drive');
    return (await res.json()) as GuidedLearningSet;
  }

  /** Deletes a slide image only when Drive shows it as a marked GL upload in the app's own slide folder. */
  async deleteSlideFile(driveFileId: string): Promise<void> {
    const owned = await isInAppFolder(
      driveFileId,
      GL_SLIDE_FOLDERS,
      async (id) => {
        const res = await this.request(
          `${DRIVE_API_URL}/files/${id}?fields=name,parents,trashed,appProperties`,
          {}
        );
        return res.ok ? ((await res.json()) as DriveParentMeta) : null;
      },
      GL_SLIDE_APP_PROPERTY
    );
    if (owned) await this.deleteSetFile(driveFileId);
  }

  /** Delete a set file from Drive (ignores 404) */
  async deleteSetFile(driveFileId: string): Promise<void> {
    const res = await this.request(`${DRIVE_API_URL}/files/${driveFileId}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) {
      throw new Error('Failed to delete guided learning file from Drive');
    }
  }
}

// Test hook: forget cached folder ids.
export const resetGuidedLearningDriveFolderCache = (): void => {
  resetDriveRequestStateForTests();
};
