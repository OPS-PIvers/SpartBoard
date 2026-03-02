import { APP_NAME } from '../config/constants';
import { Dashboard } from '../types';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';
const DEFAULT_TIMEOUT = 15000; // 15 seconds

// Consumer email domains that don't support Google Workspace domain-level sharing.
// Files shared with these domains fall back to anyone-with-link.
const CONSUMER_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
]);

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
}

interface DriveFileListResponse {
  files?: DriveFile[];
}

interface DriveFileCreateResponse {
  id: string;
  name: string;
}

export class GoogleDriveService {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Enhanced fetch with timeout to prevent indefinite hangs.
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          'Google Drive request timed out. Please check your connection.'
        );
      }
      throw error;
    }
  }

  /**
   * List files in the user's Google Drive.
   * @param query Google Drive API Q parameter (e.g., "mimeType = 'image/jpeg'")
   */
  async listFiles(query?: string): Promise<DriveFile[]> {
    const url = new URL(`${DRIVE_API_URL}/files`);
    url.searchParams.append(
      'fields',
      'files(id, name, mimeType, webViewLink, webContentLink, thumbnailLink)'
    );
    if (query) {
      url.searchParams.append('q', query);
    }

    const response = await this.fetchWithTimeout(url.toString(), {
      headers: this.headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Google Drive access expired. Please sign in again.');
      }
      throw new Error(
        `Failed to list Drive files: ${response.statusText} (${response.status})`
      );
    }

    const data = (await response.json()) as DriveFileListResponse;
    return data.files ?? [];
  }

  /**
   * Search for a folder by name within a parent folder.
   */
  async getOrCreateFolder(
    folderName: string,
    parentId?: string
  ): Promise<string> {
    let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    }

    const folders = await this.listFiles(query);

    if (folders.length > 0) {
      return folders[0].id;
    }

    // Create folder
    const body: { name: string; mimeType: string; parents?: string[] } = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) {
      body.parents = [parentId];
    }

    const response = await this.fetchWithTimeout(`${DRIVE_API_URL}/files`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to create folder ${folderName} in Drive`);
    }

    const folder = (await response.json()) as DriveFileCreateResponse;
    return folder.id;
  }

  /**
   * Get the main app folder.
   */
  async getAppFolder(): Promise<string> {
    return this.getOrCreateFolder(APP_NAME);
  }

  /**
   * Get a specific subfolder path (e.g., "Assets/Backgrounds")
   */
  async getFolderPath(path: string): Promise<string> {
    const parts = path.split('/').filter(Boolean);
    let parentId = await this.getAppFolder();

    for (const part of parts) {
      parentId = await this.getOrCreateFolder(part, parentId);
    }

    return parentId;
  }

  /**
   * Export a dashboard to Google Drive as a .spart file.
   */
  async exportDashboard(dashboard: Dashboard): Promise<string> {
    const folderId = await this.getFolderPath('Dashboards');
    const fileName = `${dashboard.name}.spart`;

    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/json',
    };

    const fileContent = JSON.stringify(dashboard, null, 2);

    // If we already have a driveFileId, try to update it directly
    if (dashboard.driveFileId) {
      try {
        // Update content
        const uploadResponse = await this.fetchWithTimeout(
          `${UPLOAD_API_URL}/files/${dashboard.driveFileId}?uploadType=media`,
          {
            method: 'PATCH',
            headers: {
              ...this.headers,
              'Content-Type': 'application/json',
            },
            body: fileContent,
          }
        );

        if (uploadResponse.ok) {
          return dashboard.driveFileId;
        }

        // If 404, the file might have been deleted from Drive, fallback to search/create
        if (uploadResponse.status !== 404) {
          const errorBody = await uploadResponse.text();
          console.error('Drive API Error (Update Content):', errorBody);
          throw new Error('Failed to update dashboard in Drive');
        }
      } catch (e) {
        console.warn('Direct Drive update failed, falling back to search:', e);
      }
    }

    // Fallback: Check if file exists by name to update or create
    const existingFiles = await this.listFiles(
      `name = '${fileName}' and '${folderId}' in parents and trashed = false`
    );

    if (existingFiles.length > 0) {
      // Update existing
      const fileId = existingFiles[0].id;

      // Update metadata (name might have changed)
      await this.fetchWithTimeout(`${DRIVE_API_URL}/files/${fileId}`, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({ name: fileName }),
      });

      // Update content
      const uploadResponse = await this.fetchWithTimeout(
        `${UPLOAD_API_URL}/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            ...this.headers,
            'Content-Type': 'application/json',
          },
          body: fileContent,
        }
      );

      if (!uploadResponse.ok) {
        const errorBody = await uploadResponse.text();
        console.error('Drive API Error (Update Content):', errorBody);
        throw new Error('Failed to update dashboard in Drive');
      }
      return fileId;
    } else {
      // Create new
      // First create metadata
      const createResponse = await this.fetchWithTimeout(
        `${DRIVE_API_URL}/files`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(metadata),
        }
      );

      if (!createResponse.ok) {
        const errorBody = await createResponse.text();
        console.error('Drive API Error (Create Metadata):', errorBody);
        throw new Error('Failed to create dashboard metadata in Drive');
      }
      const file = (await createResponse.json()) as DriveFileCreateResponse;

      // Then upload content
      const uploadResponse = await this.fetchWithTimeout(
        `${UPLOAD_API_URL}/files/${file.id}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            ...this.headers,
            'Content-Type': 'application/json',
          },
          body: fileContent,
        }
      );

      if (!uploadResponse.ok) {
        const errorBody = await uploadResponse.text();
        console.error('Drive API Error (Upload Content):', errorBody);
        throw new Error('Failed to upload dashboard content to Drive');
      }
      return file.id;
    }
  }

  /**
   * Upload a general file to a specific Drive folder path.
   */
  async uploadFile(
    file: File | Blob,
    fileName: string,
    folderPath: string = 'Misc'
  ): Promise<DriveFile> {
    const folderId = await this.getFolderPath(folderPath);

    const metadata = {
      name: fileName,
      parents: [folderId],
    };

    // Create metadata
    const createResponse = await this.fetchWithTimeout(
      `${DRIVE_API_URL}/files`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(metadata),
      }
    );

    if (!createResponse.ok) {
      throw new Error('Failed to create file metadata in Drive');
    }

    const driveFile = (await createResponse.json()) as DriveFile;

    // Upload content
    const uploadResponse = await this.fetchWithTimeout(
      `${UPLOAD_API_URL}/files/${driveFile.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          ...this.headers,
          'Content-Type': (file as File).type || 'application/octet-stream',
        },
        body: file,
      }
    );

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload file content to Drive');
    }

    // Get full file details (including links)
    const detailResponse = await this.fetchWithTimeout(
      `${DRIVE_API_URL}/files/${driveFile.id}?fields=id,name,mimeType,webViewLink,webContentLink,thumbnailLink`,
      {
        headers: this.headers,
      }
    );

    return (await detailResponse.json()) as DriveFile;
  }

  /**
   * Share a file with users in a Google Workspace domain, or with anyone
   * if no domain is provided or the domain is a consumer email provider.
   */
  async makePublic(fileId: string, domain?: string): Promise<void> {
    const permission =
      domain && !CONSUMER_DOMAINS.has(domain.toLowerCase())
        ? { role: 'reader', type: 'domain', domain }
        : { role: 'reader', type: 'anyone' };

    const response = await this.fetchWithTimeout(
      `${DRIVE_API_URL}/files/${fileId}/permissions`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(permission),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to share file:', error);
      throw new Error('Failed to share file in Drive');
    }
  }

  /**
   * Update the content of an existing Drive file in-place (PATCH media upload).
   * Use this instead of uploadFile when the file already exists to avoid
   * accumulating duplicate/orphaned files in Drive.
   */
  async updateFileContent(fileId: string, content: Blob): Promise<void> {
    const response = await this.fetchWithTimeout(
      `${UPLOAD_API_URL}/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': content.type || 'application/octet-stream',
        },
        body: content,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to update Drive file content:', error);
      throw new Error('Failed to update file content in Drive');
    }
  }

  /**
   * Delete a file from Google Drive.
   */
  async deleteFile(fileId: string): Promise<void> {
    const response = await this.fetchWithTimeout(
      `${DRIVE_API_URL}/files/${fileId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok && response.status !== 404) {
      const error = await response.text();
      console.error('Failed to delete Drive file:', error);
      throw new Error('Failed to delete file from Google Drive');
    }
  }

  /**
   * Import a dashboard from a Google Drive file.
   */
  async importDashboard(fileId: string): Promise<Dashboard> {
    const response = await this.fetchWithTimeout(
      `${DRIVE_API_URL}/files/${fileId}?alt=media`,
      {
        headers: this.headers,
      }
    );

    if (!response.ok) {
      throw new Error('Failed to download dashboard from Drive');
    }

    return (await response.json()) as Dashboard;
  }

  /**
   * Download a file from Drive as a Blob.
   */
  async downloadFile(fileId: string): Promise<Blob> {
    const response = await this.fetchWithTimeout(
      `${DRIVE_API_URL}/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to download file from Drive');
    }

    return response.blob();
  }

  /**
   * Get image files from Drive for backgrounds.
   */
  async getBackgroundImages(): Promise<DriveFile[]> {
    return this.listFiles("mimeType contains 'image/' and trashed = false");
  }
}
