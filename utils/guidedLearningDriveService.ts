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
import { authError } from '@/utils/driveAuthErrors';

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

const MAX_ATTEMPTS = 3;
const RECONNECT_MESSAGE =
  'Google Drive access expired. Reconnect Google Drive to keep saving.';

// Guided Learning folder id per access token, so repeat saves skip two lookups.
const glFolderIdByToken = new Map<string, Promise<string>>();

const isRetryable = (status: number, serverErrors: boolean) =>
  status === 429 || (serverErrors && status >= 500);

interface DriveServiceOptions {
  /** Base backoff delay; doubles per retry. */
  retryBaseMs?: number;
}

export class GuidedLearningDriveService {
  private accessToken: string;
  private retryBaseMs: number;

  constructor(accessToken: string, options: DriveServiceOptions = {}) {
    this.accessToken = accessToken;
    this.retryBaseMs = options.retryBaseMs ?? 500;
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

  // Retries 429 (and 5xx unless the request could create a duplicate); 401 throws a reconnect error.
  private async request(
    url: string,
    init: RequestInit,
    { retryServerErrors = true }: { retryServerErrors?: boolean } = {}
  ): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, init);
      if (res.status === 401) throw authError(RECONNECT_MESSAGE, '401');
      if (
        res.ok ||
        attempt >= MAX_ATTEMPTS ||
        !isRetryable(res.status, retryServerErrors)
      ) {
        return res;
      }
      const delay = this.retryBaseMs * 2 ** (attempt - 1);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
  }

  private async getOrCreateFolder(
    folderName: string,
    parentId?: string
  ): Promise<string> {
    let q = `name = '${driveQueryEscape(folderName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) q += ` and '${parentId}' in parents`;

    const listRes = await this.request(
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

    const createRes = await this.request(
      `${DRIVE_API_URL}/files`,
      { method: 'POST', headers: this.jsonHeaders, body: JSON.stringify(body) },
      { retryServerErrors: false }
    );
    if (!createRes.ok)
      throw new Error(`Failed to create folder: ${folderName}`);
    const created = (await createRes.json()) as DriveFileCreateResponse;
    return created.id;
  }

  private getGLFolderId(): Promise<string> {
    const cached = glFolderIdByToken.get(this.accessToken);
    if (cached) return cached;
    const lookup = this.getOrCreateFolder(APP_NAME).then((appFolderId) =>
      this.getOrCreateFolder(GL_FOLDER_NAME, appFolderId)
    );
    glFolderIdByToken.set(this.accessToken, lookup);
    lookup.catch(() => glFolderIdByToken.delete(this.accessToken));
    return lookup;
  }

  private patchContent(fileId: string, content: string): Promise<Response> {
    return this.request(`${UPLOAD_API_URL}/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
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
      const updateRes = await this.patchContent(existingFileId, content);
      if (updateRes.ok) return existingFileId;
      // Only a missing file may fall through to lookup/create; anything else would duplicate.
      if (updateRes.status !== 404) {
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
      { headers: this.authHeaders }
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

    const metaRes = await this.request(
      `${DRIVE_API_URL}/files`,
      {
        method: 'POST',
        headers: this.jsonHeaders,
        body: JSON.stringify({
          name: fileName,
          parents: [folderId],
          mimeType: 'application/json',
        }),
      },
      { retryServerErrors: false }
    );
    if (!metaRes.ok) {
      // A stale cached folder (deleted by the teacher) is looked up again next save.
      glFolderIdByToken.delete(this.accessToken);
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
      { headers: this.authHeaders }
    );
    if (!res.ok)
      throw new Error('Failed to load guided learning set from Drive');
    return (await res.json()) as GuidedLearningSet;
  }

  /** Delete a set file from Drive (ignores 404) */
  async deleteSetFile(driveFileId: string): Promise<void> {
    const res = await this.request(`${DRIVE_API_URL}/files/${driveFileId}`, {
      method: 'DELETE',
      headers: this.authHeaders,
    });
    if (!res.ok && res.status !== 404) {
      throw new Error('Failed to delete guided learning file from Drive');
    }
  }
}

// Test hook: forget cached folder ids.
export const resetGuidedLearningDriveFolderCache = (): void => {
  glFolderIdByToken.clear();
};
