/** Project uploads → Drive (D20, §5.3): the project-shaped wrapper around `activityWallArchive`. */

import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import {
  ACTIVITY_WALL_ARCHIVE_SECRETS,
  MAX_ARCHIVE_ATTEMPTS,
  STREAM_DOWNLOAD_THRESHOLD_BYTES,
  buildArchiveFileName,
  buildDefaultWallArchiveDeps,
  buildDriveUrl,
  claimSubmissionForArchive,
  effectiveArchiveStatus,
  isNeedsConsentError,
  resolveDrivePermission,
  resolveFailedArchiveStatus,
  sanitizeDriveNameSegment,
  type ArchivableType,
  type DrivePermissionValue,
  type WallArchiveDeps,
} from './activityWallArchive';

export const PROJECT_UPLOADS_ROOT = 'project_uploads';
export const RUNS_COLLECTION = 'project_runs';
export const GROUPS_COLLECTION = 'groups';
export const UPLOADS_COLLECTION = 'uploads';
const PROJECTS_DRIVE_FOLDER = 'Projects';

export interface ArchiveProjectUploadRequest {
  runId: string;
  groupId: string;
  uploadId: string;
}

export interface ProjectArchiveResult {
  archiveStatus: 'archived' | 'syncing' | 'skipped';
  driveFileId?: string;
}

// ── Pure helpers (exported for tests) ──────────────────────────────────────

/** The runId prefix is the only uid a Drive token is minted for, never the writable field. */
export function teacherUidFromRunId(runId: string): string {
  const index = runId.indexOf('_');
  return index <= 0 ? '' : runId.slice(0, index);
}

export function projectIdFromRunId(runId: string): string {
  const index = runId.indexOf('_');
  return index < 0 ? '' : runId.slice(index + 1);
}

/** The exact path `storage.rules` allows for this upload, and nothing else. */
export function hasProjectUploadStoragePrefix(
  storagePath: string,
  runId: string,
  groupId: string,
  uploadId: string
): boolean {
  const prefix = `${PROJECT_UPLOADS_ROOT}/${runId}/${groupId}/${uploadId}/`;
  if (!storagePath.startsWith(prefix)) return false;
  const tail = storagePath.slice(prefix.length);
  return tail.length > 0 && !tail.includes('/');
}

/** `Projects/{run title} ({shortId})/{group name}` under the app's Drive folder. */
export function buildProjectFolderPath(
  runTitle: string,
  runId: string,
  groupName: string
): string {
  const title = sanitizeDriveNameSegment(runTitle) || 'Untitled Project';
  const shortId = projectIdFromRunId(runId).slice(0, 8);
  const group = sanitizeDriveNameSegment(groupName) || 'Group';
  return `${PROJECTS_DRIVE_FOLDER}/${title} (${shortId})/${group}`;
}

/** Drive's preview URL shape depends on the kind of file, not on the widget. */
export function archivableTypeForMime(mimeType: string): ArchivableType {
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

/** True when a written upload doc is one this pipeline owns. */
export function shouldArchiveProjectUpload(
  data: Record<string, unknown> | undefined
): boolean {
  if (!data) return false;
  if (typeof data.storagePath !== 'string' || !data.storagePath) return false;
  if (!data.storagePath.startsWith(`${PROJECT_UPLOADS_ROOT}/`)) return false;
  return effectiveArchiveStatus(data) === 'firebase';
}

// ── Archive core ───────────────────────────────────────────────────────────

/** One upload, start to finish; the trigger catches rather than rethrowing into a retry loop. */
export async function archiveProjectUploadCore(
  deps: WallArchiveDeps,
  input: ArchiveProjectUploadRequest
): Promise<ProjectArchiveResult> {
  const { db } = deps;
  const { runId, groupId, uploadId } = input;

  const teacherUid = teacherUidFromRunId(runId);
  if (!teacherUid) {
    throw new HttpsError('failed-precondition', 'Run has no teacher.');
  }

  const runRef = db.collection(RUNS_COLLECTION).doc(runId);
  const runSnap = await runRef.get();
  if (!runSnap.exists) {
    throw new HttpsError('not-found', 'Project run not found.');
  }
  const run = (runSnap.data() ?? {}) as Record<string, unknown>;

  const groupRef = runRef.collection(GROUPS_COLLECTION).doc(groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) {
    throw new HttpsError('not-found', 'Project group not found.');
  }
  const group = (groupSnap.data() ?? {}) as Record<string, unknown>;

  const uploadRef = groupRef.collection(UPLOADS_COLLECTION).doc(uploadId);
  const uploadSnap = await uploadRef.get();
  if (!uploadSnap.exists) {
    throw new HttpsError('not-found', 'Upload not found.');
  }
  const upload = (uploadSnap.data() ?? {}) as Record<string, unknown>;
  const storagePath =
    typeof upload.storagePath === 'string' ? upload.storagePath : '';
  // A doc whose path points anywhere else is not this pipeline's to move, and
  // following it would hand an arbitrary bucket object to the teacher's Drive.
  if (!hasProjectUploadStoragePrefix(storagePath, runId, groupId, uploadId)) {
    throw new HttpsError('failed-precondition', 'Upload path is not its own.');
  }

  const claim = await claimSubmissionForArchive(db, uploadRef, deps.now());
  if (claim.kind === 'archived') {
    return { archiveStatus: 'archived', driveFileId: claim.driveFileId };
  }
  if (claim.kind === 'skipped') {
    return {
      archiveStatus: claim.archiveStatus === 'syncing' ? 'syncing' : 'skipped',
    };
  }

  let driveFileId: string | null =
    claim.kind === 'resume' ? claim.driveFileId : null;
  let drivePermissionValue: DrivePermissionValue = 'domain';

  /** Resolves true when this attempt settled the upload at 'lost'. */
  const writeFailure = async (error: unknown): Promise<boolean> => {
    const message =
      error instanceof Error ? error.message : 'Drive archive failed';
    const needsConsent = isNeedsConsentError(error);
    return db.runTransaction(async (tx) => {
      const fresh = await tx.get(uploadRef);
      const data = (fresh.data() ?? {}) as Record<string, unknown>;
      const previous =
        typeof data.attemptCount === 'number' ? data.attemptCount : 0;
      // A teacher who never connected Drive must not exhaust the attempts.
      const attemptCount = needsConsent ? previous : previous + 1;
      const status = resolveFailedArchiveStatus(attemptCount, false);
      tx.set(
        uploadRef,
        {
          archiveStatus: status,
          archiveError: message.slice(0, 300),
          attemptCount,
          lastAttemptAt: deps.now(),
          archiveStartedAt: admin.firestore.FieldValue.delete(),
        },
        { merge: true }
      );
      return status === 'lost';
    });
  };

  let mimeType = '';
  try {
    const stat = await deps.statObject(storagePath);
    if (!stat) {
      throw new HttpsError('not-found', 'The uploaded file is gone.');
    }
    mimeType =
      (typeof upload.contentType === 'string' ? upload.contentType : '') ||
      stat.contentType ||
      'application/octet-stream';

    const teacherEmail = await deps.getUserEmail(teacherUid);
    // A run carries no per-project visibility setting, so an upload always
    // takes the domain-restricted share: the group has to be able to open it.
    const resolved = resolveDrivePermission('domain', teacherEmail);
    drivePermissionValue = resolved.value;
    const accessToken = await deps.getAccessToken(teacherUid);

    if (!driveFileId) {
      const runTitle =
        typeof run.title === 'string' && run.title.trim()
          ? run.title
          : 'Untitled Project';
      const groupName =
        typeof group.name === 'string' && group.name.trim()
          ? group.name
          : 'Group';
      const fileName = buildArchiveFileName(
        uploadId,
        upload.fileName,
        mimeType
      );
      const folderPath = buildProjectFolderPath(runTitle, runId, groupName);

      let driveFile: { id: string };
      if (stat.size > STREAM_DOWNLOAD_THRESHOLD_BYTES) {
        const tempPath = await deps.downloadObjectToTempFile(storagePath);
        try {
          driveFile = await deps.uploadFileToDrive(
            accessToken,
            tempPath,
            mimeType,
            fileName,
            folderPath
          );
        } finally {
          await deps.discardTempFile(tempPath).catch(() => undefined);
        }
      } else {
        driveFile = await deps.uploadToDrive(
          accessToken,
          await deps.downloadObject(storagePath),
          mimeType,
          fileName,
          folderPath
        );
      }
      driveFileId = driveFile.id;
    }

    // Re-applied even when resuming: a prior attempt may have uploaded the
    // file and then failed to share it, so the permission was never set.
    if (resolved.permission) {
      await deps.setDrivePermission(
        accessToken,
        driveFileId,
        resolved.permission
      );
    }
  } catch (error: unknown) {
    const lost = await writeFailure(error);
    throw toProjectArchiveFailure(error, lost);
  }

  const uploadedId = driveFileId;
  if (!uploadedId) {
    const noIdError = new Error('Drive upload returned no file id.');
    throw toProjectArchiveFailure(noIdError, await writeFailure(noIdError));
  }

  const driveUrl = buildDriveUrl(archivableTypeForMime(mimeType), uploadedId);
  try {
    await uploadRef.set(
      {
        driveFileId: uploadedId,
        driveUrl,
        drivePermission: drivePermissionValue,
        archiveStatus: 'archived',
        archivedAt: deps.now(),
        storagePath: admin.firestore.FieldValue.delete(),
        archiveStartedAt: admin.firestore.FieldValue.delete(),
        archiveError: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );
    // Separate step: the Drive copy is durable, the transit delete is retryable.
    try {
      await deps.deleteObject(storagePath);
    } catch {
      await uploadRef
        .set({ storageCleanupPending: true }, { merge: true })
        .catch(() => undefined);
    }
    return { archiveStatus: 'archived', driveFileId: uploadedId };
  } catch (error: unknown) {
    const lost = await writeFailure(error);
    throw toProjectArchiveFailure(error, lost);
  }
}

function toProjectArchiveFailure(error: unknown, lost: boolean): HttpsError {
  const message =
    error instanceof Error ? error.message : 'Drive archive failed';
  if (!lost) {
    return error instanceof HttpsError
      ? error
      : new HttpsError('internal', message);
  }
  const code = error instanceof HttpsError ? error.code : 'internal';
  return new HttpsError(code, message, { uploadLost: true });
}

// ── Trigger ────────────────────────────────────────────────────────────────

async function runTriggerArchive(
  runId: string,
  groupId: string,
  uploadId: string
): Promise<void> {
  try {
    await archiveProjectUploadCore(buildDefaultWallArchiveDeps(), {
      runId,
      groupId,
      uploadId,
    });
  } catch (error) {
    // A trigger throw would only re-run the same failure; the attempt count on
    // the doc is what stops it, and at MAX_ARCHIVE_ATTEMPTS it settles 'lost'.
    console.error(
      '[projectUploadArchive] archive failed',
      runId,
      groupId,
      uploadId,
      error instanceof Error ? error.message : error
    );
  }
}

export const archiveProjectUploadOnCreate = onDocumentCreated(
  {
    document: `${RUNS_COLLECTION}/{runId}/${GROUPS_COLLECTION}/{groupId}/${UPLOADS_COLLECTION}/{uploadId}`,
    memory: '1GiB' as const,
    timeoutSeconds: 300,
    secrets: ACTIVITY_WALL_ARCHIVE_SECRETS,
  },
  async (event) => {
    const data = event.data?.data() as Record<string, unknown> | undefined;
    if (!shouldArchiveProjectUpload(data)) return;
    await runTriggerArchive(
      event.params.runId,
      event.params.groupId,
      event.params.uploadId
    );
  }
);

export { MAX_ARCHIVE_ATTEMPTS };
