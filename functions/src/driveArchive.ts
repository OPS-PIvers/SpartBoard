/**
 * Google Drive upload helpers + the `archiveActivityWallPhoto` callable
 * (F12 split out of the old monolithic `index.ts`). Archives an Activity Wall
 * photo submission from Firebase Storage to the teacher's Google Drive, makes
 * it publicly viewable, rewrites the submission doc to point at the Drive URL,
 * and deletes the Storage object.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { ALLOWED_ORIGINS } from './classlinkShared';
import './functionsInit';

interface ArchiveActivityWallPhotoData {
  accessToken?: string;
  sessionId?: string;
  submissionId?: string;
  activityId?: string;
  status?: 'approved' | 'pending';
}

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';
const APP_DRIVE_FOLDER = 'SpartBoard';

const getDriveHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
});

const listDriveFiles = async (
  accessToken: string,
  query: string
): Promise<Array<{ id: string; name: string }>> => {
  const url = new URL(`${DRIVE_API_URL}/files`);
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'files(id,name)');

  const response = await fetch(url.toString(), {
    headers: getDriveHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(`Failed to list Drive files (${response.status})`);
  }

  const data = (await response.json()) as {
    files?: Array<{ id: string; name: string }>;
  };
  return data.files ?? [];
};

const getOrCreateDriveFolder = async (
  accessToken: string,
  folderName: string,
  parentId?: string
): Promise<string> => {
  const escapedFolderName = folderName
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
  let query = `name = '${escapedFolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const existing = await listDriveFiles(accessToken, query);
  if (existing[0]?.id) return existing[0].id;

  const response = await fetch(`${DRIVE_API_URL}/files`, {
    method: 'POST',
    headers: getDriveHeaders(accessToken),
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Drive folder ${folderName}`);
  }

  const folder = (await response.json()) as { id: string };
  return folder.id;
};

const getDriveFolderPath = async (
  accessToken: string,
  path: string
): Promise<string> => {
  const parts = path.split('/').filter(Boolean);
  let parentId = await getOrCreateDriveFolder(accessToken, APP_DRIVE_FOLDER);

  for (const part of parts) {
    parentId = await getOrCreateDriveFolder(accessToken, part, parentId);
  }

  return parentId;
};

const uploadBlobToDrive = async (
  accessToken: string,
  blob: Buffer,
  mimeType: string,
  fileName: string,
  folderPath: string
): Promise<{ id: string }> => {
  const folderId = await getDriveFolderPath(accessToken, folderPath);

  const createResponse = await fetch(`${DRIVE_API_URL}/files`, {
    method: 'POST',
    headers: getDriveHeaders(accessToken),
    body: JSON.stringify({
      name: fileName,
      parents: [folderId],
    }),
  });

  if (!createResponse.ok) {
    throw new Error('Failed to create file metadata in Drive');
  }

  const driveFile = (await createResponse.json()) as { id: string };

  const uploadResponse = await fetch(
    `${UPLOAD_API_URL}/files/${driveFile.id}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType,
      },
      body: blob,
    }
  );

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file content to Drive');
  }

  return driveFile;
};

const makeDriveFilePublic = async (
  accessToken: string,
  fileId: string
): Promise<void> => {
  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}/permissions`, {
    method: 'POST',
    headers: getDriveHeaders(accessToken),
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  if (!response.ok) {
    throw new Error('Failed to share file in Drive');
  }
};

export const archiveActivityWallPhoto = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    const data = request.data as ArchiveActivityWallPhotoData;
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    const accessToken = data.accessToken?.trim();
    const sessionId = data.sessionId?.trim();
    const submissionId = data.submissionId?.trim();
    const activityId = data.activityId?.trim();
    const status = data.status === 'pending' ? 'pending' : 'approved';

    if (!accessToken || !sessionId || !submissionId || !activityId) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required archive parameters.'
      );
    }

    if (!sessionId.startsWith(`${request.auth.uid}_`)) {
      throw new HttpsError(
        'permission-denied',
        'You can only archive your own Activity Wall submissions.'
      );
    }

    const submissionRef = admin
      .firestore()
      .collection('activity_wall_sessions')
      .doc(sessionId)
      .collection('submissions')
      .doc(submissionId);

    await submissionRef.set(
      {
        status,
        archiveStatus: 'syncing',
        archiveStartedAt: Date.now(),
        archiveError: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );

    try {
      const submissionSnap = await submissionRef.get();
      if (!submissionSnap.exists) {
        throw new Error('Submission not found');
      }

      const submission = submissionSnap.data() as {
        storagePath?: unknown;
      };
      const storagePath =
        typeof submission.storagePath === 'string'
          ? submission.storagePath
          : null;

      if (!storagePath) {
        throw new Error('Missing Firebase storage path for photo submission');
      }

      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);

      // Size guard — `file.download()` buffers the entire object into the
      // 512MiB function instance's memory, so a misbehaving client could
      // OOM us with a giant photo. Audit doc item #4. Storage metadata
      // returns `size` as a string in some SDK versions, hence the coerce.
      // Fail closed on missing/non-numeric size — `NaN > limit` is `false`,
      // which would bypass the guard and reopen the OOM path.
      const [metadata] = await file.getMetadata();
      const sizeBytes = Number(metadata.size);
      const MAX_PHOTO_BYTES = 50 * 1024 * 1024;
      if (!Number.isFinite(sizeBytes) || sizeBytes > MAX_PHOTO_BYTES) {
        throw new HttpsError(
          'invalid-argument',
          Number.isFinite(sizeBytes)
            ? `Photo exceeds the 50 MB archive limit (${Math.round(sizeBytes / 1024 / 1024)} MB).`
            : 'Photo size unknown; cannot safely archive.'
        );
      }

      const [fileBuffer] = await file.download();
      const mimeType = metadata.contentType || 'image/jpeg';
      const extension =
        mimeType === 'image/png'
          ? 'png'
          : mimeType === 'image/gif'
            ? 'gif'
            : mimeType === 'image/webp'
              ? 'webp'
              : 'jpg';

      const driveFile = await uploadBlobToDrive(
        accessToken,
        fileBuffer,
        mimeType,
        `${submissionId}.${extension}`,
        `Activity Wall/${activityId}`
      );
      await makeDriveFilePublic(accessToken, driveFile.id);

      const driveUrl = `https://lh3.googleusercontent.com/d/${driveFile.id}`;

      await submissionRef.set(
        {
          content: driveUrl,
          status,
          archiveStatus: 'archived',
          archiveStartedAt: admin.firestore.FieldValue.delete(),
          driveFileId: driveFile.id,
          archivedAt: Date.now(),
          storagePath: admin.firestore.FieldValue.delete(),
          archiveError: admin.firestore.FieldValue.delete(),
        },
        { merge: true }
      );

      await file.delete({ ignoreNotFound: true });

      return {
        archiveStatus: 'archived',
        driveFileId: driveFile.id,
        driveUrl,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Drive archive failed';

      await submissionRef.set(
        {
          status,
          archiveStatus: 'failed',
          archiveStartedAt: admin.firestore.FieldValue.delete(),
          archiveError: message.slice(0, 180),
        },
        { merge: true }
      );

      // Preserve HttpsError codes so the client can distinguish
      // user-actionable failures (e.g. `invalid-argument` from the size
      // guard) from genuine server errors. Wrapping every error as
      // `internal` would tell a teacher whose photo is too large that
      // SpartBoard is broken when the real fix is to shrink the photo.
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', message);
    }
  }
);
