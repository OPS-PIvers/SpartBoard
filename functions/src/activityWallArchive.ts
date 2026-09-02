/**
 * Server-driven Activity Wall media archive: Firebase Storage is a transit
 * buffer, the teacher's Google Drive is the durable home. Firestore triggers
 * (and the hourly sweep) run this with no teacher present, minting the access
 * token from the stored refresh token like `quizMediaArchive.ts` does.
 *
 * The old `archiveActivityWallPhoto` callable in `driveArchive.ts` stays for
 * the deployed client; both paths claim through `claimSubmissionForArchive`
 * so they can never upload the same object twice.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import {
  onDocumentCreated,
  onDocumentUpdated,
} from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { refreshGoogleAccessTokenForUid } from './googleOAuth';
import { GOOGLE_OAUTH_CLIENT_ID } from './secrets';
import './functionsInit';

const GOOGLE_OAUTH_CLIENT_SECRET = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');
const GOOGLE_OAUTH_REFRESH_TOKEN_KEY = defineSecret(
  'GOOGLE_OAUTH_REFRESH_TOKEN_KEY'
);

/** The Google OAuth trio every Drive entry point in this module needs. */
export const ACTIVITY_WALL_ARCHIVE_SECRETS = [
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
];

export const ACTIVITY_WALL_MEDIA_ROOT = 'activity_wall_media';
/** Pre-rebuild photo path; still archived and swept until P3-3 removes it. */
export const LEGACY_ACTIVITY_WALL_MEDIA_ROOT = 'activity_wall_photos';
export const SESSIONS_COLLECTION = 'activity_wall_sessions';
export const SUBMISSIONS_COLLECTION = 'submissions';

/** Mirrors the per-kind caps this brief specifies for `storage.rules`. */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Failed attempts before archival gives up and settles at the terminal 'lost'. */
export const MAX_ARCHIVE_ATTEMPTS = 5;
/** A 'syncing' claim younger than this still has a live owner. */
export const ARCHIVE_CLAIM_STALE_MS = 10 * 60 * 1000;
/** Transit objects older than this whose submission is gone are deleted. */
export const ORPHAN_OBJECT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Above this, the download is streamed to a temp file instead of buffered. */
export const STREAM_DOWNLOAD_THRESHOLD_BYTES = 50 * 1024 * 1024;

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';
const APP_DRIVE_FOLDER = 'SpartBoard';
const WALL_DRIVE_FOLDER = 'Activity Walls';

type Firestore = admin.firestore.Firestore;

export type ArchivableType = 'photo' | 'video' | 'file';

export interface ArchiveWallMediaRequest {
  sessionId: string;
  submissionId: string;
}

export interface DrivePermission {
  type: 'domain' | 'anyone';
  role: 'reader';
  domain?: string;
  allowFileDiscovery?: boolean;
}

export interface WallArchiveDeps {
  db: Firestore;
  statObject: (
    storagePath: string
  ) => Promise<{ size: number; contentType: string } | null>;
  downloadObject: (storagePath: string) => Promise<Buffer>;
  /** Large objects go to disk instead of into the instance's heap. */
  downloadObjectToTempFile: (storagePath: string) => Promise<string>;
  deleteObject: (storagePath: string) => Promise<void>;
  getAccessToken: (teacherUid: string) => Promise<string>;
  getUserEmail: (uid: string) => Promise<string | null>;
  uploadToDrive: (
    accessToken: string,
    bytes: Buffer,
    mimeType: string,
    fileName: string,
    folderPath: string
  ) => Promise<{ id: string }>;
  uploadFileToDrive: (
    accessToken: string,
    filePath: string,
    mimeType: string,
    fileName: string,
    folderPath: string
  ) => Promise<{ id: string }>;
  discardTempFile: (filePath: string) => Promise<void>;
  setDrivePermission: (
    accessToken: string,
    fileId: string,
    permission: DrivePermission
  ) => Promise<void>;
  now: () => number;
}

export interface WallArchiveResult {
  archiveStatus: 'archived' | 'syncing' | 'skipped';
  driveFileId?: string;
}

// ── Pure helpers (exported for tests) ──────────────────────────────────────

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
]);
const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);
const ALLOWED_FILE_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** Submission `type` if it names an archivable kind, else inferred from MIME. */
export function resolveArchivableType(
  rawType: unknown,
  mimeType: string
): ArchivableType | null {
  if (rawType === 'photo' || rawType === 'video' || rawType === 'file') {
    return rawType;
  }
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType.startsWith('video/')) return 'video';
  // Legacy photo submissions carry no `type` and no reliable MIME.
  return rawType === undefined || rawType === null ? 'photo' : null;
}

export function maxBytesForType(type: ArchivableType): number {
  if (type === 'video') return MAX_VIDEO_BYTES;
  if (type === 'file') return MAX_FILE_BYTES;
  return MAX_IMAGE_BYTES;
}

/** An unknown MIME on a photo is tolerated; the old client uploaded without one. */
export function isAllowedMimeForType(
  type: ArchivableType,
  mimeType: string
): boolean {
  if (!mimeType) return type === 'photo';
  if (type === 'photo') return ALLOWED_IMAGE_MIME.has(mimeType);
  if (type === 'video') return ALLOWED_VIDEO_MIME.has(mimeType);
  return ALLOWED_FILE_MIME.has(mimeType);
}

/** Storage paths are client-written, so every reader re-derives the prefix. */
export function hasActivityWallStoragePrefix(
  storagePath: string,
  sessionId: string,
  submissionId: string
): boolean {
  if (!storagePath || !sessionId || !submissionId) return false;
  if (storagePath.includes('..')) return false;
  const modern = `${ACTIVITY_WALL_MEDIA_ROOT}/${sessionId}/${submissionId}/`;
  if (storagePath.startsWith(modern)) {
    const tail = storagePath.slice(modern.length);
    return tail.length > 0 && !tail.includes('/');
  }
  const legacy = `${LEGACY_ACTIVITY_WALL_MEDIA_ROOT}/${sessionId}/`;
  if (!storagePath.startsWith(legacy)) return false;
  const tail = storagePath.slice(legacy.length);
  return tail === submissionId || tail.startsWith(`${submissionId}.`);
}

/** `{uid}_{activityId}` — the owner uid is the prefix of every session id. */
export function teacherUidFromSessionId(sessionId: string): string {
  const index = sessionId.indexOf('_');
  return index > 0 ? sessionId.slice(0, index) : '';
}

export function activityIdFromSessionId(sessionId: string): string {
  const index = sessionId.indexOf('_');
  return index >= 0 ? sessionId.slice(index + 1) : sessionId;
}

const FORBIDDEN_DRIVE_NAME_CHARS = new Set([
  '\\',
  '/',
  ':',
  '*',
  '?',
  '"',
  '<',
  '>',
  '|',
]);

/** Drive names must not carry path separators or leading dots. */
export function sanitizeDriveNameSegment(raw: string): string {
  return Array.from(raw)
    .filter(
      (ch) => ch.charCodeAt(0) >= 0x20 && !FORBIDDEN_DRIVE_NAME_CHARS.has(ch)
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 60);
}

/** `SpartBoard / Activity Walls / <title> (<activityId short>)`. */
export function buildWallFolderPath(
  wallTitle: string,
  sessionId: string
): string {
  const title = sanitizeDriveNameSegment(wallTitle) || 'Untitled Wall';
  const shortId = activityIdFromSessionId(sessionId).slice(0, 8);
  return `${WALL_DRIVE_FOLDER}/${title} (${shortId})`;
}

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
};

/** The student's own file name where there is one, else `{id}.{ext}`. */
export function buildArchiveFileName(
  submissionId: string,
  rawFileName: unknown,
  mimeType: string
): string {
  const provided =
    typeof rawFileName === 'string'
      ? sanitizeDriveNameSegment(rawFileName)
      : '';
  if (provided) return provided;
  const extension = EXTENSION_BY_MIME[mimeType] ?? 'bin';
  return `${sanitizeDriveNameSegment(submissionId) || 'submission'}.${extension}`;
}

/** Rendering URL per the brief; never the `lh3.googleusercontent.com` form. */
export function buildDriveUrl(type: ArchivableType, fileId: string): string {
  if (type === 'photo') {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
  }
  if (type === 'video') {
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Consumer webmail domains a "domain-restricted" share must never trust:
 * `driveVisibility: 'domain'` on one of these is effectively public, since
 * the domain isn't the school's and anyone with a Google account is on it.
 */
export const PUBLIC_WEBMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
]);

export type DrivePermissionValue = 'private' | 'domain' | 'anyone';

export interface ResolvedDrivePermission {
  /** `null` means: apply no Drive permission — the file stays private. */
  permission: DrivePermission | null;
  /** Persisted on the submission as `drivePermission`. */
  value: DrivePermissionValue;
}

/**
 * A missing `driveVisibility` on a legacy session doc means domain-restricted.
 * A domain-restricted share on a public webmail domain gets no Drive
 * permission at all and settles at 'private' instead of leaking the file to
 * every Gmail/Outlook/etc. account holder.
 */
export function resolveDrivePermission(
  driveVisibility: unknown,
  teacherEmail: string | null
): ResolvedDrivePermission {
  if (driveVisibility === 'anyone') {
    return { permission: { type: 'anyone', role: 'reader' }, value: 'anyone' };
  }
  const domain = (teacherEmail ?? '').split('@')[1]?.toLowerCase() ?? '';
  if (!domain) {
    throw new HttpsError(
      'failed-precondition',
      'Cannot resolve the teacher email domain for a domain-restricted share.'
    );
  }
  if (PUBLIC_WEBMAIL_DOMAINS.has(domain)) {
    return { permission: null, value: 'private' };
  }
  return {
    permission: {
      type: 'domain',
      domain,
      role: 'reader',
      allowFileDiscovery: false,
    },
    value: 'domain',
  };
}

/** Where a failed attempt leaves the submission. 'lost' is terminal. */
export function resolveFailedArchiveStatus(
  attemptCount: number,
  unrecoverable: boolean
): 'failed' | 'lost' {
  if (unrecoverable) return 'lost';
  return attemptCount >= MAX_ARCHIVE_ATTEMPTS ? 'lost' : 'failed';
}

/** The deployed client writes `storagePath` with no status and means 'firebase'. */
export function effectiveArchiveStatus(
  data: Record<string, unknown> | undefined
): string | null {
  const status = data?.archiveStatus;
  if (typeof status === 'string' && status) return status;
  return typeof data?.storagePath === 'string' && data.storagePath
    ? 'firebase'
    : null;
}

/** `needs-consent` is the teacher's to fix, so it must not burn an attempt. */
export function isNeedsConsentError(error: unknown): boolean {
  const details = (error as { details?: { reason?: unknown } } | undefined)
    ?.details;
  if (details?.reason === 'needs-consent') return true;
  const message = error instanceof Error ? error.message : '';
  return message.includes('needs-consent');
}

export function isLostArchiveError(error: unknown): boolean {
  const details = (error as { details?: { submissionLost?: unknown } })
    ?.details;
  return details?.submissionLost === true;
}

// ── Transactional claim (shared with the legacy callable) ──────────────────

export type ArchiveClaim =
  | { kind: 'claimed' }
  | { kind: 'archived'; driveFileId?: string }
  | { kind: 'resume'; driveFileId: string }
  | { kind: 'skipped'; archiveStatus: string | null };

/**
 * Check-and-set in one transaction: a concurrent trigger, sweep or legacy
 * callable for the same submission must not reach Drive at all.
 */
export async function claimSubmissionForArchive(
  db: Firestore,
  submissionRef: admin.firestore.DocumentReference,
  now: number
): Promise<ArchiveClaim> {
  return db.runTransaction<ArchiveClaim>(async (tx) => {
    const snap = await tx.get(submissionRef);
    if (!snap.exists) return { kind: 'skipped', archiveStatus: null };
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const status = effectiveArchiveStatus(data);
    const driveFileId =
      typeof data.driveFileId === 'string' ? data.driveFileId : undefined;
    if (status === 'archived') {
      return { kind: 'archived', driveFileId };
    }
    if (driveFileId) {
      // The Drive copy already exists from a prior attempt; only the
      // permission or the terminal Firestore write failed. Resume from
      // there instead of uploading a duplicate.
      tx.set(
        submissionRef,
        {
          archiveStatus: 'syncing',
          archiveStartedAt: now,
          archiveError: admin.firestore.FieldValue.delete(),
        },
        { merge: true }
      );
      return { kind: 'resume', driveFileId };
    }
    if (status === 'syncing') {
      const startedAt =
        typeof data.archiveStartedAt === 'number' ? data.archiveStartedAt : 0;
      if (now - startedAt < ARCHIVE_CLAIM_STALE_MS) {
        return { kind: 'skipped', archiveStatus: 'syncing' };
      }
    } else if (status !== 'firebase' && status !== 'failed') {
      return { kind: 'skipped', archiveStatus: status };
    }
    const attemptCount =
      typeof data.attemptCount === 'number' ? data.attemptCount : 0;
    if (status === 'failed' && attemptCount >= MAX_ARCHIVE_ATTEMPTS) {
      return { kind: 'skipped', archiveStatus: 'lost' };
    }
    tx.set(
      submissionRef,
      {
        archiveStatus: 'syncing',
        archiveStartedAt: now,
        archiveError: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );
    return { kind: 'claimed' };
  });
}

// ── Default dependency implementations ─────────────────────────────────────

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
  const escaped = folderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  let query = `name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) query += ` and '${parentId}' in parents`;
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
  folderPath: string
): Promise<string> => {
  let parentId = await getOrCreateDriveFolder(accessToken, APP_DRIVE_FOLDER);
  for (const part of folderPath.split('/').filter(Boolean)) {
    parentId = await getOrCreateDriveFolder(accessToken, part, parentId);
  }
  return parentId;
};

const uploadBlobToDrive = async (
  accessToken: string,
  bytes: Buffer,
  mimeType: string,
  fileName: string,
  folderPath: string
): Promise<{ id: string }> => {
  const folderId = await getDriveFolderPath(accessToken, folderPath);
  const createResponse = await fetch(`${DRIVE_API_URL}/files`, {
    method: 'POST',
    headers: getDriveHeaders(accessToken),
    body: JSON.stringify({ name: fileName, parents: [folderId] }),
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
      body: new Uint8Array(bytes),
    }
  );
  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file content to Drive');
  }
  return driveFile;
};

/** Streams a temp file into Drive so a 200 MB video never lands in the heap. */
const uploadStreamToDrive = async (
  accessToken: string,
  filePath: string,
  mimeType: string,
  fileName: string,
  folderPath: string
): Promise<{ id: string }> => {
  const folderId = await getDriveFolderPath(accessToken, folderPath);
  const createResponse = await fetch(`${DRIVE_API_URL}/files`, {
    method: 'POST',
    headers: getDriveHeaders(accessToken),
    body: JSON.stringify({ name: fileName, parents: [folderId] }),
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
      body: Readable.toWeb(
        createReadStream(filePath)
      ) as unknown as ReadableStream<Uint8Array>,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }
  );
  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file content to Drive');
  }
  return driveFile;
};

export async function setDriveFilePermission(
  accessToken: string,
  fileId: string,
  permission: DrivePermission
): Promise<void> {
  const response = await fetch(
    `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}/permissions`,
    {
      method: 'POST',
      headers: getDriveHeaders(accessToken),
      body: JSON.stringify(permission),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to share file in Drive (${response.status})`);
  }
}

export function buildDefaultWallArchiveDeps(): WallArchiveDeps {
  const bucket = () => admin.storage().bucket();
  return {
    db: admin.firestore(),
    statObject: async (storagePath) => {
      const file = bucket().file(storagePath);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [metadata] = await file.getMetadata();
      return {
        size: Number(metadata.size),
        contentType: metadata.contentType ?? '',
      };
    },
    downloadObject: async (storagePath) => {
      const [buffer] = await bucket().file(storagePath).download();
      return buffer;
    },
    downloadObjectToTempFile: async (storagePath) => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wallmedia-'));
      const destination = path.join(dir, 'media.bin');
      await bucket().file(storagePath).download({ destination });
      return destination;
    },
    deleteObject: async (storagePath) => {
      await bucket().file(storagePath).delete({ ignoreNotFound: true });
    },
    getAccessToken: async (teacherUid) =>
      (await refreshGoogleAccessTokenForUid(teacherUid)).accessToken,
    getUserEmail: async (uid) => {
      try {
        return (await admin.auth().getUser(uid)).email ?? null;
      } catch {
        return null;
      }
    },
    uploadToDrive: uploadBlobToDrive,
    uploadFileToDrive: uploadStreamToDrive,
    discardTempFile: async (filePath) => {
      await fs
        .rm(path.dirname(filePath), { recursive: true, force: true })
        .catch(() => undefined);
    },
    setDrivePermission: setDriveFilePermission,
    now: () => Date.now(),
  };
}

// ── Archive core ───────────────────────────────────────────────────────────

function toArchiveFailure(error: unknown, lost: boolean): HttpsError {
  const message =
    error instanceof Error ? error.message : 'Drive archive failed';
  if (!lost) {
    return error instanceof HttpsError
      ? error
      : new HttpsError('internal', message);
  }
  const code = error instanceof HttpsError ? error.code : 'internal';
  return new HttpsError(code, message, { submissionLost: true });
}

/**
 * One submission, start to finish. Throws `HttpsError` on rejection; the
 * triggers and the sweep catch instead of rethrowing.
 */
export async function archiveActivityWallMediaCore(
  deps: WallArchiveDeps,
  input: ArchiveWallMediaRequest
): Promise<WallArchiveResult> {
  const { db } = deps;
  const { sessionId, submissionId } = input;

  const sessionRef = db.collection(SESSIONS_COLLECTION).doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Activity Wall session not found.');
  }
  const session = (sessionSnap.data() ?? {}) as Record<string, unknown>;
  // `session.teacherUid` is client-writable; the sessionId prefix is what
  // `firestore.rules` actually pins to the owner, so that is the only uid a
  // Drive token is ever minted for.
  const teacherUid = teacherUidFromSessionId(sessionId);
  if (!teacherUid) {
    throw new HttpsError('failed-precondition', 'Session has no teacher.');
  }

  const submissionRef = sessionRef
    .collection(SUBMISSIONS_COLLECTION)
    .doc(submissionId);
  const submissionSnap = await submissionRef.get();
  if (!submissionSnap.exists) {
    throw new HttpsError('not-found', 'Submission not found.');
  }
  const submission = (submissionSnap.data() ?? {}) as Record<string, unknown>;
  const storagePath =
    typeof submission.storagePath === 'string' ? submission.storagePath : '';

  const claim = await claimSubmissionForArchive(db, submissionRef, deps.now());
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
  let unrecoverable = false;
  let drivePermissionValue: DrivePermissionValue = 'domain';

  /** Resolves true when this attempt settled the submission at 'lost'. */
  const writeFailure = async (error: unknown): Promise<boolean> => {
    const message =
      error instanceof Error ? error.message : 'Drive archive failed';
    const needsConsent = isNeedsConsentError(error);
    return db.runTransaction(async (tx) => {
      const fresh = await tx.get(submissionRef);
      const data = (fresh.data() ?? {}) as Record<string, unknown>;
      const previous =
        typeof data.attemptCount === 'number' ? data.attemptCount : 0;
      // A teacher who never connected Drive must not exhaust the attempts.
      const attemptCount = needsConsent ? previous : previous + 1;
      const archiveStatus = needsConsent
        ? 'failed'
        : resolveFailedArchiveStatus(attemptCount, unrecoverable);
      tx.set(
        submissionRef,
        {
          archiveStatus,
          attemptCount,
          archiveError: needsConsent ? 'needs-consent' : message.slice(0, 180),
          lastAttemptAt: deps.now(),
          ...(driveFileId ? { driveFileId } : {}),
        },
        { merge: true }
      );
      return archiveStatus === 'lost';
    });
  };

  let type: ArchivableType = 'photo';
  try {
    if (!hasActivityWallStoragePrefix(storagePath, sessionId, submissionId)) {
      unrecoverable = true;
      throw new HttpsError(
        'permission-denied',
        'Submission storage path is outside this wall.'
      );
    }
    const stat = await deps.statObject(storagePath);
    if (!stat) {
      unrecoverable = true;
      throw new HttpsError(
        'not-found',
        'Uploaded file is no longer in Storage.'
      );
    }
    const mimeType =
      stat.contentType ||
      (typeof submission.mimeType === 'string' ? submission.mimeType : '');
    const resolvedType = resolveArchivableType(submission.type, mimeType);
    if (!resolvedType) {
      unrecoverable = true;
      throw new HttpsError('invalid-argument', 'Submission is not archivable.');
    }
    type = resolvedType;
    if (!isAllowedMimeForType(type, mimeType)) {
      unrecoverable = true;
      throw new HttpsError('invalid-argument', 'File type is not allowed.');
    }
    const limit = maxBytesForType(type);
    if (!Number.isFinite(stat.size) || stat.size > limit) {
      throw new HttpsError(
        'invalid-argument',
        Number.isFinite(stat.size)
          ? `File exceeds the ${Math.round(limit / 1024 / 1024)} MB archive limit.`
          : 'File size unknown; cannot safely archive.'
      );
    }

    const teacherEmail = await deps.getUserEmail(teacherUid);
    const resolved = resolveDrivePermission(
      session.driveVisibility,
      teacherEmail
    );
    drivePermissionValue = resolved.value;
    const accessToken = await deps.getAccessToken(teacherUid);

    if (!driveFileId) {
      const wallTitle =
        typeof session.title === 'string' && session.title.trim()
          ? session.title
          : 'Untitled Wall';
      const fileName = buildArchiveFileName(
        submissionId,
        submission.fileName,
        mimeType
      );
      const folderPath = buildWallFolderPath(wallTitle, sessionId);
      const contentType = mimeType || 'application/octet-stream';
      let driveFile: { id: string };
      if (stat.size > STREAM_DOWNLOAD_THRESHOLD_BYTES) {
        const tempPath = await deps.downloadObjectToTempFile(storagePath);
        try {
          driveFile = await deps.uploadFileToDrive(
            accessToken,
            tempPath,
            contentType,
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
          contentType,
          fileName,
          folderPath
        );
      }
      driveFileId = driveFile.id;
    }
    // Re-applied even when resuming: a prior attempt may have uploaded the
    // file and then failed to share it, so the permission was never set.
    // `null` (a public-webmail domain share) means no permission is added.
    if (resolved.permission) {
      await deps.setDrivePermission(
        accessToken,
        driveFileId,
        resolved.permission
      );
    }
  } catch (error: unknown) {
    throw toArchiveFailure(error, await writeFailure(error));
  }

  const uploadedId = driveFileId;
  if (!uploadedId) {
    const noIdError = new Error('Drive upload returned no file id.');
    throw toArchiveFailure(noIdError, await writeFailure(noIdError));
  }

  const driveUrl = buildDriveUrl(type, uploadedId);
  try {
    await submissionRef.set(
      {
        content: driveUrl,
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
  } catch (error: unknown) {
    throw toArchiveFailure(error, await writeFailure(error));
  }

  // Separate step: the Drive copy is durable, the transit delete is retryable.
  try {
    await deps.deleteObject(storagePath);
  } catch {
    await submissionRef
      .set({ storageCleanupPending: true }, { merge: true })
      .catch(() => undefined);
  }
  return { archiveStatus: 'archived', driveFileId: uploadedId };
}

/**
 * True when a written submission is one the archive pipeline owns. Gated to
 * the new client's `activity_wall_media/` prefix only: the deployed legacy
 * client still writes `activity_wall_photos/` submissions, and these triggers
 * write fields the current `firestore.rules` submissions update whitelist
 * does not allow, which would break the legacy client's own updates until the
 * separate rules PR (P1-4) lands. Legacy submissions stay on the existing
 * `archiveActivityWallPhoto` callable.
 */
export function shouldArchiveSubmission(
  data: Record<string, unknown> | undefined
): boolean {
  if (!data) return false;
  if (typeof data.storagePath !== 'string' || !data.storagePath) return false;
  if (!data.storagePath.startsWith(`${ACTIVITY_WALL_MEDIA_ROOT}/`)) {
    return false;
  }
  return effectiveArchiveStatus(data) === 'firebase';
}

async function runTriggerArchive(
  sessionId: string,
  submissionId: string
): Promise<void> {
  try {
    await archiveActivityWallMediaCore(buildDefaultWallArchiveDeps(), {
      sessionId,
      submissionId,
    });
  } catch (error) {
    // The sweep retries; a trigger throw would only re-run the same failure.
    console.error(
      '[activityWallArchive] archive failed',
      sessionId,
      submissionId,
      error instanceof Error ? error.message : error
    );
  }
}

const TRIGGER_OPTIONS = {
  document: `${SESSIONS_COLLECTION}/{sessionId}/${SUBMISSIONS_COLLECTION}/{submissionId}`,
  memory: '1GiB' as const,
  timeoutSeconds: 300,
  secrets: ACTIVITY_WALL_ARCHIVE_SECRETS,
};

export const archiveActivityWallSubmissionOnCreate = onDocumentCreated(
  TRIGGER_OPTIONS,
  async (event) => {
    const data = event.data?.data() as Record<string, unknown> | undefined;
    if (!shouldArchiveSubmission(data)) return;
    await runTriggerArchive(event.params.sessionId, event.params.submissionId);
  }
);

export const archiveActivityWallSubmissionOnUpdate = onDocumentUpdated(
  TRIGGER_OPTIONS,
  async (event) => {
    const before = event.data?.before.data() as
      | Record<string, unknown>
      | undefined;
    const after = event.data?.after.data() as
      | Record<string, unknown>
      | undefined;
    if (!shouldArchiveSubmission(after)) return;
    // Only a fresh transition into 'firebase' is a new job for the pipeline.
    if (effectiveArchiveStatus(before) === 'firebase') return;
    await runTriggerArchive(event.params.sessionId, event.params.submissionId);
  }
);
