// Drive folder and upload mechanics for archiving into a teacher's own Drive under `SpartBoard/`.

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const APP_DRIVE_FOLDER = 'SpartBoard';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface DriveUploader {
  /** `ownerKey` (the teacher uid) dedupes concurrent lookups; tokens rotate per call. */
  getOrCreateFolder: (
    accessToken: string,
    folderName: string,
    parentId?: string,
    ownerKey?: string
  ) => Promise<string>;
  getFolderPath: (
    accessToken: string,
    folderPath: string,
    ownerKey?: string
  ) => Promise<string>;
  uploadBlob: (
    accessToken: string,
    bytes: Buffer,
    mimeType: string,
    fileName: string,
    folderPath: string,
    ownerKey?: string
  ) => Promise<{ id: string }>;
  deleteFile: (accessToken: string, fileId: string) => Promise<void>;
}

const jsonHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
});

export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function createDriveUploader(
  fetchImpl: FetchLike = (input, init) => fetch(input, init)
): DriveUploader {
  const inflight = new Map<string, Promise<string>>();

  const listFolders = async (
    accessToken: string,
    folderName: string,
    parentId?: string
  ): Promise<string[]> => {
    let query = `name = '${escapeDriveQueryValue(folderName)}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
    if (parentId)
      query += ` and '${escapeDriveQueryValue(parentId)}' in parents`;
    const url = new URL(`${DRIVE_API_URL}/files`);
    url.searchParams.set('q', query);
    url.searchParams.set('orderBy', 'createdTime');
    url.searchParams.set('fields', 'files(id,name,createdTime)');
    const response = await fetchImpl(url.toString(), {
      headers: jsonHeaders(accessToken),
    });
    if (!response.ok) {
      throw new Error(`Failed to list Drive files (${response.status})`);
    }
    const data = (await response.json()) as { files?: Array<{ id?: string }> };
    return (data.files ?? [])
      .map((f) => f.id)
      .filter((id): id is string => typeof id === 'string' && id !== '');
  };

  const lookUpOrCreate = async (
    accessToken: string,
    folderName: string,
    parentId?: string
  ): Promise<string> => {
    const existing = await listFolders(accessToken, folderName, parentId);
    if (existing[0]) return existing[0];
    const response = await fetchImpl(`${DRIVE_API_URL}/files`, {
      method: 'POST',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({
        name: folderName,
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to create Drive folder ${folderName}`);
    }
    const created = ((await response.json()) as { id: string }).id;
    // Another instance may have raced this create; everyone adopts the oldest. The loser is never deleted, since a racer may already have filed into it.
    const after = await listFolders(accessToken, folderName, parentId).catch(
      () => [] as string[]
    );
    return after[0] ?? created;
  };

  const getOrCreateFolder: DriveUploader['getOrCreateFolder'] = (
    accessToken,
    folderName,
    parentId,
    ownerKey
  ) => {
    const key = `${ownerKey ?? accessToken}\n${parentId ?? ''}\n${folderName}`;
    const pending = inflight.get(key);
    if (pending) return pending;
    const promise = lookUpOrCreate(accessToken, folderName, parentId).finally(
      () => inflight.delete(key)
    );
    inflight.set(key, promise);
    return promise;
  };

  const getFolderPath: DriveUploader['getFolderPath'] = async (
    accessToken,
    folderPath,
    ownerKey
  ) => {
    let parentId = await getOrCreateFolder(
      accessToken,
      APP_DRIVE_FOLDER,
      undefined,
      ownerKey
    );
    for (const part of folderPath.split('/').filter(Boolean)) {
      parentId = await getOrCreateFolder(accessToken, part, parentId, ownerKey);
    }
    return parentId;
  };

  const uploadBlob: DriveUploader['uploadBlob'] = async (
    accessToken,
    bytes,
    mimeType,
    fileName,
    folderPath,
    ownerKey
  ) => {
    const folderId = await getFolderPath(accessToken, folderPath, ownerKey);
    const createResponse = await fetchImpl(`${DRIVE_API_URL}/files`, {
      method: 'POST',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({ name: fileName, parents: [folderId] }),
    });
    if (!createResponse.ok) {
      throw new Error('Failed to create file metadata in Drive');
    }
    const driveFile = (await createResponse.json()) as { id: string };
    const uploadResponse = await fetchImpl(
      `${UPLOAD_API_URL}/files/${driveFile.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': mimeType,
        },
        body: new Uint8Array(bytes),
      }
    );
    if (!uploadResponse.ok) {
      throw new Error('Failed to upload file content to Drive');
    }
    return driveFile;
  };

  /** Permanent delete, not a trash move — this is a compliance delete. */
  const deleteFile: DriveUploader['deleteFile'] = async (
    accessToken,
    fileId
  ) => {
    const response = await fetchImpl(
      `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
    );
    // 404/410 means the file is already gone; the obligation is satisfied.
    if (response.ok || response.status === 404 || response.status === 410) {
      return;
    }
    throw new Error(`Drive responded ${response.status}`);
  };

  return { getOrCreateFolder, getFolderPath, uploadBlob, deleteFile };
}

export const defaultDriveUploader = createDriveUploader();
