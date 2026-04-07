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
import { APP_NAME } from '@/config/constants';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';
const GL_FOLDER_NAME = 'Guided Learning';

function driveQueryEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function sanitizeDriveFileName(title: string): string {
  return title.replace(/[/\\:*?"<>|]/g, '_').trim() || 'untitled';
}

interface DriveFileCreateResponse {
  id: string;
  name: string;
}

interface DriveFileListResponse {
  files?: { id: string; name: string }[];
}

export class GuidedLearningDriveService {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private get authHeaders() {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  private get jsonHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async getOrCreateFolder(
    folderName: string,
    parentId?: string
  ): Promise<string> {
    let q = `name = '${driveQueryEscape(folderName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) q += ` and '${parentId}' in parents`;

    const listRes = await fetch(
      `${DRIVE_API_URL}/files?q=${encodeURIComponent(q)}&fields=files(id)`,
      { headers: this.authHeaders }
    );
    if (!listRes.ok) throw new Error('Failed to list Drive folders');
    const listData = (await listRes.json()) as DriveFileListResponse;
    if (listData.files && listData.files.length > 0)
      return listData.files[0].id;

    const body: { name: string; mimeType: string; parents?: string[] } = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) body.parents = [parentId];

    const createRes = await fetch(`${DRIVE_API_URL}/files`, {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify(body),
    });
    if (!createRes.ok)
      throw new Error(`Failed to create folder: ${folderName}`);
    const created = (await createRes.json()) as DriveFileCreateResponse;
    return created.id;
  }

  private async getGLFolderId(): Promise<string> {
    const appFolderId = await this.getOrCreateFolder(APP_NAME);
    return this.getOrCreateFolder(GL_FOLDER_NAME, appFolderId);
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
    const folderId = await this.getGLFolderId();
    const fileName = `${sanitizeDriveFileName(set.title)}.${set.id.slice(0, 8)}.gl.json`;
    const content = JSON.stringify(set, null, 2);

    // Try to update existing file
    if (existingFileId) {
      const updateRes = await fetch(
        `${UPLOAD_API_URL}/files/${existingFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
          body: content,
        }
      );
      if (updateRes.ok) return existingFileId;
      // Fall through to create if update fails
    }

    // Check if a file with the same name already exists in the folder
    const existingRes = await fetch(
      `${DRIVE_API_URL}/files?q=${encodeURIComponent(
        `name = '${driveQueryEscape(fileName)}' and '${folderId}' in parents and trashed = false`
      )}&fields=files(id)`,
      { headers: this.authHeaders }
    );
    if (existingRes.ok) {
      const existing = (await existingRes.json()) as DriveFileListResponse;
      if (existing.files && existing.files.length > 0) {
        const fileId = existing.files[0].id;
        const patchRes = await fetch(
          `${UPLOAD_API_URL}/files/${fileId}?uploadType=media`,
          {
            method: 'PATCH',
            headers: {
              ...this.authHeaders,
              'Content-Type': 'application/json',
            },
            body: content,
          }
        );
        if (patchRes.ok) return fileId;
      }
    }

    // Create new file
    const metaRes = await fetch(`${DRIVE_API_URL}/files`, {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
        mimeType: 'application/json',
      }),
    });
    if (!metaRes.ok)
      throw new Error('Failed to create guided learning file in Drive');
    const meta = (await metaRes.json()) as DriveFileCreateResponse;

    const uploadRes = await fetch(
      `${UPLOAD_API_URL}/files/${meta.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
        body: content,
      }
    );
    if (!uploadRes.ok)
      throw new Error('Failed to upload guided learning content to Drive');
    return meta.id;
  }

  /** Load full set data from Drive by file ID */
  async loadSet(driveFileId: string): Promise<GuidedLearningSet> {
    const res = await fetch(`${DRIVE_API_URL}/files/${driveFileId}?alt=media`, {
      headers: this.authHeaders,
    });
    if (!res.ok)
      throw new Error('Failed to load guided learning set from Drive');
    return (await res.json()) as GuidedLearningSet;
  }

  /** Delete a set file from Drive (ignores 404) */
  async deleteSetFile(driveFileId: string): Promise<void> {
    const res = await fetch(`${DRIVE_API_URL}/files/${driveFileId}`, {
      method: 'DELETE',
      headers: this.authHeaders,
    });
    if (!res.ok && res.status !== 404) {
      throw new Error('Failed to delete guided learning file from Drive');
    }
  }
}
