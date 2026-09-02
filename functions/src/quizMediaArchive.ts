/**
 * `archiveQuizMediaArtifact` — transcodes one committed student audio take from
 * the Firebase Storage transit buffer to M4A/AAC and archives it into the
 * assigning teacher's own Google Drive, then deletes the Storage object.
 *
 * Firebase Storage is never the durable home for quiz media: Drive is. A failed
 * archive leaves `artifactArchive[id].archiveStatus` at `'failed'` (and
 * `hasStuckArchive: true` on the response) so the client retry and the hourly
 * `sweepStuckQuizArchives` sweep can pick it up, and so the student still sees
 * the question as not yet submitted.
 *
 * Modeled on `driveArchive.ts` (`archiveActivityWallPhoto`) for the Drive
 * folder/upload mechanics, with one deliberate difference: this callable mints
 * its own access token via `refreshGoogleAccessTokenForUid(teacherUid)` instead
 * of taking a client-supplied one, because archival must work with no teacher
 * present. `makeDriveFilePublic` is never called — playback is gated through a
 * callable (Brief 3.6), not a public link.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import {
  ALLOWED_ORIGINS,
  normalizeEmailDomain,
  resolveOrgIdForDomain,
} from './classlinkShared';
import { refreshGoogleAccessTokenForUid } from './googleOAuth';
import {
  loadTargetDirectory,
  uidForRef,
  type StudentTargetRef,
} from './studentAssignmentTargets';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  STUDENT_PSEUDONYM_HMAC_SECRET,
  GOOGLE_OAUTH_CLIENT_ID,
} from './secrets';
import './functionsInit';

const GOOGLE_OAUTH_CLIENT_SECRET = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');
const GOOGLE_OAUTH_REFRESH_TOKEN_KEY = defineSecret(
  'GOOGLE_OAUTH_REFRESH_TOKEN_KEY'
);

/** Every secret this module's entry points need, including the sweep's. */
export const QUIZ_MEDIA_ARCHIVE_SECRETS = [
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  STUDENT_PSEUDONYM_HMAC_SECRET,
];

/** Storage transit root. Mirrors the `storage.rules` path this brief specifies. */
export const QUIZ_MEDIA_STORAGE_ROOT = 'quiz_response_media';
/** Matches the 5 MB `storage.rules` cap; a 300 s 32 kbps take is ~1.2 MB. */
export const MAX_QUIZ_MEDIA_BYTES = 5 * 1024 * 1024;
/** Fail-closed `GlobalFeature` id; a missing permission record means denied. */
export const QUIZ_MEDIA_FEATURE_ID = 'quiz-media-response';
/** Output bitrate — plenty for a 32 kbps speech source, kept fixed on purpose. */
export const ARCHIVE_AUDIO_BITRATE = '64k';
/**
 * Hours, not days — the owner constraint that supersedes the map's 7-day text.
 * Lives here (not in the sweep) because the archival core's concurrency claim
 * needs the same window to tell a live sibling run from an abandoned one.
 */
export const STUCK_ARCHIVE_AGE_MS = 2 * 60 * 60 * 1000;
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';
const APP_DRIVE_FOLDER = 'SpartBoard';
const QUIZ_DRIVE_FOLDER = 'Quiz Responses';

type Firestore = admin.firestore.Firestore;

export interface ArchiveArtifactRequest {
  sessionId: string;
  responseKey: string;
  questionId: string;
  artifactId: string;
}

interface StoredArtifact {
  id?: unknown;
  kind?: unknown;
  storagePath?: unknown;
  mimeType?: unknown;
  uploadState?: unknown;
}

interface StoredAnswer {
  questionId?: unknown;
  artifacts?: unknown;
}

/** Name parts resolved server-side; never taken from the request payload. */
export interface StudentNameParts {
  givenName: string;
  familyName: string;
}

export interface ArchiveDeps {
  db: Firestore;
  /** Reads object size + contentType; returns null when the object is gone. */
  statObject: (
    storagePath: string
  ) => Promise<{ size: number; contentType: string } | null>;
  downloadObject: (storagePath: string) => Promise<Buffer>;
  deleteObject: (storagePath: string) => Promise<void>;
  transcodeToM4a: (input: Buffer) => Promise<Buffer>;
  getAccessToken: (teacherUid: string) => Promise<string>;
  uploadToDrive: (
    accessToken: string,
    bytes: Buffer,
    mimeType: string,
    fileName: string,
    folderPath: string
  ) => Promise<{ id: string }>;
  resolveStudentName: (
    teacherUid: string,
    studentUid: string
  ) => Promise<StudentNameParts | null>;
  isFeatureGranted: (teacherUid: string) => Promise<boolean>;
  now: () => number;
}

// ── Pure helpers (exported for tests) ──────────────────────────────────────

/**
 * `artifacts[]` is student-written and Firestore rules cannot validate array
 * element shape, so every reader re-derives the expected prefix itself.
 */
export function hasQuizMediaStoragePrefix(
  storagePath: string,
  sessionId: string,
  studentUid: string
): boolean {
  if (!sessionId || !studentUid) return false;
  const prefix = `${QUIZ_MEDIA_STORAGE_ROOT}/${sessionId}/${studentUid}/`;
  if (!storagePath.startsWith(prefix)) return false;
  const tail = storagePath.slice(prefix.length);
  return tail.length > 0 && !tail.includes('/') && !tail.includes('..');
}

/** Committed takes for a question, excluding the one being archived right now. */
export function countCommittedTakes(
  answers: readonly StoredAnswer[],
  questionId: string,
  excludeArtifactId: string
): number {
  let count = 0;
  for (const answer of answers) {
    if (answer?.questionId !== questionId) continue;
    const artifacts = Array.isArray(answer.artifacts)
      ? (answer.artifacts as StoredArtifact[])
      : [];
    const committed = artifacts.filter(
      (a) => a?.uploadState !== 'failed' && a?.id !== excludeArtifactId
    );
    if (committed.length > 0) count++;
  }
  return count;
}

/** `null`/absent `takeLimit` is unlimited — the shipped default. */
export function exceedsTakeLimit(
  existingTakes: number,
  takeLimit: number | null | undefined
): boolean {
  if (typeof takeLimit !== 'number' || !Number.isFinite(takeLimit))
    return false;
  return existingTakes + 1 > takeLimit;
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
  const cleaned = Array.from(raw)
    .filter(
      (ch) => ch.charCodeAt(0) >= 0x20 && !FORBIDDEN_DRIVE_NAME_CHARS.has(ch)
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return cleaned.slice(0, 60);
}

/**
 * `{LastName}_{FirstName}__Q{n}.m4a`. The real name only exists once the file
 * crosses into Drive; Firebase transit stays pseudonymous.
 */
export function buildArchiveFileName(
  name: StudentNameParts | null,
  fallbackLabel: string,
  questionLabel: string
): string {
  const family = sanitizeDriveNameSegment(name?.familyName ?? '');
  const given = sanitizeDriveNameSegment(name?.givenName ?? '');
  const person =
    family || given
      ? [family, given].filter(Boolean).join('_').replace(/ /g, '')
      : sanitizeDriveNameSegment(fallbackLabel) || 'Student';
  return `${person}__${questionLabel}.m4a`;
}

/** 1-based position in `publicQuestions`, or the sanitized id when unknown. */
export function questionLabelFor(
  publicQuestions: readonly { id?: unknown }[] | undefined,
  questionId: string
): string {
  const index = (publicQuestions ?? []).findIndex((q) => q?.id === questionId);
  if (index >= 0) return `Q${index + 1}`;
  return `Q${sanitizeDriveNameSegment(questionId) || 'unknown'}`;
}

/** True when any entry in the merged map still needs the sweep's attention. */
export function computeHasStuckArchive(
  archive:
    | Record<
        string,
        { archiveStatus?: unknown; storageCleanupPending?: unknown }
      >
    | undefined
): boolean {
  return Object.values(archive ?? {}).some(
    (entry) =>
      entry?.archiveStatus === 'syncing' ||
      entry?.archiveStatus === 'failed' ||
      entry?.storageCleanupPending === true
  );
}

/** The one artifact this request addresses, or null when the id is unknown. */
export function findStoredArtifact(
  answers: readonly StoredAnswer[],
  questionId: string,
  artifactId: string
): StoredArtifact | null {
  for (const answer of answers) {
    if (answer?.questionId !== questionId) continue;
    const list = Array.isArray(answer.artifacts)
      ? (answer.artifacts as StoredArtifact[])
      : [];
    const match = list.find((a) => a?.id === artifactId);
    if (match) return match;
  }
  return null;
}

/** `classlink:{sourcedId}` / `test:{email}` — the inverse of `refKey()`. */
export function parseRefKey(key: string): StudentTargetRef | null {
  if (key.startsWith('classlink:')) {
    const sourcedId = key.slice('classlink:'.length);
    return sourcedId ? { kind: 'classlink', sourcedId } : null;
  }
  if (key.startsWith('test:')) {
    const email = key.slice('test:'.length);
    return email ? { kind: 'test', email } : null;
  }
  return null;
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

/** webm never survives to Drive; AAC in an M4A container always previews. */
export async function transcodeBufferToM4a(input: Buffer): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'quizmedia-'));
  const inputPath = path.join(dir, 'in.bin');
  const outputPath = path.join(dir, 'out.m4a');
  try {
    await fs.writeFile(inputPath, input);
    if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec('aac')
        .audioBitrate(ARCHIVE_AUDIO_BITRATE)
        .format('mp4')
        .outputOptions('-movflags', '+faststart')
        .on('error', (err: Error) => reject(err))
        .on('end', () => resolve())
        .save(outputPath);
    });
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Mirrors `BUILDING_ID_ALIASES` in `config/buildings.ts`; functions cannot import it. */
const BUILDING_ID_ALIASES: Readonly<Record<string, string>> = {
  'orono-high-school': 'high',
  'orono-middle-school': 'middle',
  'orono-intermediate-school': 'intermediate',
  'schumann-elementary': 'schumann',
};

/** Mirrors `INTERNAL_TIER_DOMAINS` in `utils/userTier.ts`. */
const INTERNAL_TIER_DOMAINS: readonly string[] = ['orono.k12.mn.us'];

/** Mirrors the `free < org < internal` ordering in `utils/userTier.ts`. */
const TIER_RANK: Readonly<Record<string, number>> = {
  free: 0,
  org: 1,
  internal: 2,
};

/** Server twin of `canonicalizeBuildingIds` — legacy ids, de-duplicated. */
export function canonicalizeBuildingIdsServer(
  ids: readonly unknown[]
): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const canonical = BUILDING_ID_ALIASES[raw] ?? raw;
    if (!out.includes(canonical)) out.push(canonical);
  }
  return out;
}

/** Server twin of `meetsMinTier` — an unset floor imposes no restriction. */
export function meetsMinTierServer(tier: string, minTier: unknown): boolean {
  if (typeof minTier !== 'string' || !minTier) return true;
  return (TIER_RANK[tier] ?? 0) >= (TIER_RANK[minTier] ?? 0);
}

/** The teacher's `selectedBuildings`, canonicalized the way AuthContext does. */
export async function loadTeacherBuildings(
  db: Firestore,
  teacherUid: string
): Promise<string[]> {
  if (!teacherUid) return [];
  const snap = await db
    .doc(`users/${teacherUid}/userProfile/profile`)
    .get()
    .catch(() => null);
  const raw: unknown = snap?.data()?.selectedBuildings;
  return Array.isArray(raw) ? canonicalizeBuildingIdsServer(raw) : [];
}

/** Server twin of `deriveUserTier` — internal domain, else org member, else free. */
export async function deriveTeacherTier(
  db: Firestore,
  teacherEmail: string
): Promise<string> {
  const domain = teacherEmail.split('@')[1] ?? '';
  if (domain && INTERNAL_TIER_DOMAINS.includes(domain)) return 'internal';
  const domainWithAt = normalizeEmailDomain(teacherEmail);
  if (!domainWithAt) return 'free';
  const orgId = await resolveOrgIdForDomain(db, domainWithAt).catch(() => null);
  if (!orgId) return 'free';
  const member = await db
    .doc(`organizations/${orgId}/members/${teacherEmail}`)
    .get()
    .catch(() => null);
  return member?.exists ? 'org' : 'free';
}

/**
 * Fail-closed gate, mirroring `resolvePermissionAccess` in
 * `context/AuthContext.tsx`: enabled → admin bypass → access level → `minTier`
 * → `buildings`. Unlike the generic `canAccessFeature` default, a missing
 * `global_permissions/quiz-media-response` record denies access. The subject is
 * always the session teacher, since the gate asks whether this teacher's org
 * turned the feature on.
 */
export async function isQuizMediaResponseGranted(
  db: Firestore,
  teacherEmail: string | null,
  teacherUid: string
): Promise<boolean> {
  const snap = await db
    .collection('global_permissions')
    .doc(QUIZ_MEDIA_FEATURE_ID)
    .get();
  if (!snap.exists) return false;
  const data = snap.data() ?? {};
  if (data.enabled !== true) return false;
  const email = (teacherEmail ?? '').toLowerCase();
  if (email) {
    const adminSnap = await db.collection('admins').doc(email).get();
    if (adminSnap.exists) return true;
  }
  if (data.accessLevel === 'beta') {
    if (!email) return false;
    const betaUsers = Array.isArray(data.betaUsers) ? data.betaUsers : [];
    const isBeta = betaUsers.some(
      (u: unknown) => typeof u === 'string' && u.toLowerCase() === email
    );
    if (!isBeta) return false;
  } else if (data.accessLevel !== 'public') {
    return false;
  }
  if (data.minTier !== undefined && data.minTier !== null) {
    const tier = email ? await deriveTeacherTier(db, email) : 'free';
    if (!meetsMinTierServer(tier, data.minTier)) return false;
  }
  // `buildings` is compared raw, exactly as the client does — only the user's
  // own selection is canonicalized on either side.
  const buildings = Array.isArray(data.buildings) ? data.buildings : [];
  if (buildings.length > 0) {
    const allowed = new Set(buildings);
    const selected = await loadTeacherBuildings(db, teacherUid);
    if (!selected.some((b) => allowed.has(b))) return false;
  }
  return true;
}

/**
 * Real name for the Drive filename, resolved through the same authorization
 * `setAssignmentTargetsV1` uses — a teacher can never name-resolve a student
 * they cannot target. Returns null for anonymous PIN joiners, whose names live
 * only in the teacher's Drive roster.
 */
export async function resolveStudentRealName(
  db: Firestore,
  teacherUid: string,
  studentUid: string
): Promise<StudentNameParts | null> {
  const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
  if (!hmacSecret) return null;
  let teacherEmail = '';
  try {
    teacherEmail = (await admin.auth().getUser(teacherUid)).email ?? '';
  } catch {
    return null;
  }
  if (!teacherEmail) return null;
  const { namesByRefKey } = await loadTargetDirectory(
    db,
    teacherUid,
    teacherEmail,
    {
      classlinkClientId: CLASSLINK_CLIENT_ID.value(),
      classlinkClientSecret: CLASSLINK_CLIENT_SECRET.value(),
      tenantUrl: CLASSLINK_TENANT_URL.value(),
    },
    () => {
      throw new Error('Roster service unavailable.');
    }
  );
  for (const [key, name] of namesByRefKey) {
    const ref = parseRefKey(key);
    if (!ref) continue;
    if (uidForRef(ref, hmacSecret) === studentUid) return name;
  }
  return null;
}

export function buildDefaultArchiveDeps(): ArchiveDeps {
  const db = admin.firestore();
  const bucket = () => admin.storage().bucket();
  return {
    db,
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
    deleteObject: async (storagePath) => {
      await bucket().file(storagePath).delete({ ignoreNotFound: true });
    },
    transcodeToM4a: transcodeBufferToM4a,
    getAccessToken: async (teacherUid) =>
      (await refreshGoogleAccessTokenForUid(teacherUid)).accessToken,
    uploadToDrive: uploadBlobToDrive,
    resolveStudentName: (teacherUid, studentUid) =>
      resolveStudentRealName(db, teacherUid, studentUid),
    isFeatureGranted: async (teacherUid) => {
      let email: string | null = null;
      try {
        email = (await admin.auth().getUser(teacherUid)).email ?? null;
      } catch {
        email = null;
      }
      return isQuizMediaResponseGranted(db, email, teacherUid);
    },
    now: () => Date.now(),
  };
}

// ── Archive core (shared by the callable and the sweep) ────────────────────

export interface ArchiveResult {
  /** `'syncing'` means a concurrent invocation owns this artifact right now. */
  archiveStatus: 'archived' | 'syncing';
  driveFileId?: string;
}

type ArchiveEntryShape = {
  archiveStatus?: unknown;
  driveFileId?: unknown;
  archiveStartedAt?: unknown;
  storageCleanupPending?: unknown;
};

type ArchiveMap = Record<string, ArchiveEntryShape>;

const readArchiveMap = (
  data: Record<string, unknown> | undefined
): ArchiveMap => ({ ...((data?.artifactArchive ?? {}) as ArchiveMap) });

/** A `'syncing'` entry younger than the sweep window still has a live owner. */
function hasLiveOwner(
  entry: ArchiveEntryShape | undefined,
  now: number
): boolean {
  if (entry?.archiveStatus !== 'syncing') return false;
  if (typeof entry.archiveStartedAt !== 'number') return false;
  return now - entry.archiveStartedAt < STUCK_ARCHIVE_AGE_MS;
}

/**
 * One artifact, start to finish. Throws `HttpsError` on every rejection so the
 * student-triggered call surfaces an actionable code; the sweep catches instead
 * of rethrowing.
 */
export async function archiveQuizArtifactCore(
  input: ArchiveArtifactRequest & { callerUid: string | null },
  deps: ArchiveDeps
): Promise<ArchiveResult> {
  const { db } = deps;
  const { sessionId, responseKey, questionId, artifactId, callerUid } = input;

  const sessionRef = db.collection('quiz_sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Quiz session not found.');
  }
  const session = sessionSnap.data() ?? {};
  const teacherUid =
    typeof session.teacherUid === 'string' ? session.teacherUid : '';
  if (!teacherUid) {
    throw new HttpsError('failed-precondition', 'Session has no teacher.');
  }

  if (!(await deps.isFeatureGranted(teacherUid))) {
    throw new HttpsError(
      'permission-denied',
      'Media responses are not enabled for this account.'
    );
  }

  const responseRef = sessionRef.collection('responses').doc(responseKey);
  const responseSnap = await responseRef.get();
  if (!responseSnap.exists) {
    throw new HttpsError('not-found', 'Quiz response not found.');
  }
  const response = responseSnap.data() ?? {};
  const studentUid =
    typeof response.studentUid === 'string' ? response.studentUid : '';
  if (!studentUid) {
    throw new HttpsError('failed-precondition', 'Response has no studentUid.');
  }
  if (callerUid !== null && callerUid !== studentUid) {
    throw new HttpsError(
      'permission-denied',
      'You can only archive your own recordings.'
    );
  }

  const answers: StoredAnswer[] = Array.isArray(response.answers)
    ? (response.answers as StoredAnswer[])
    : [];
  const artifact = findStoredArtifact(answers, questionId, artifactId);
  if (!artifact) {
    throw new HttpsError('not-found', 'Artifact not found on this response.');
  }
  if (artifact.kind !== 'audio') {
    throw new HttpsError('invalid-argument', 'Only audio takes are archived.');
  }
  const storagePath =
    typeof artifact.storagePath === 'string' ? artifact.storagePath : '';
  if (!hasQuizMediaStoragePrefix(storagePath, sessionId, studentUid)) {
    throw new HttpsError(
      'permission-denied',
      'Artifact storage path is outside this response.'
    );
  }

  const alreadyArchived = readArchiveMap(response)[artifactId];
  if (
    alreadyArchived?.archiveStatus === 'archived' &&
    typeof alreadyArchived.driveFileId === 'string'
  ) {
    return {
      archiveStatus: 'archived',
      driveFileId: alreadyArchived.driveFileId,
    };
  }

  const publicQuestions = Array.isArray(session.publicQuestions)
    ? (session.publicQuestions as Array<{
        id?: unknown;
        recording?: { takeLimit?: number | null };
      }>)
    : [];
  const questionConfig = publicQuestions.find((q) => q?.id === questionId);
  const takeLimit = questionConfig?.recording?.takeLimit ?? null;
  const existingTakes = countCommittedTakes(answers, questionId, artifactId);
  if (exceedsTakeLimit(existingTakes, takeLimit)) {
    throw new HttpsError(
      'resource-exhausted',
      'This question has reached its take limit.'
    );
  }

  // Check-and-set in one transaction: a concurrent invocation for the same
  // artifact must not reach ffmpeg or Drive at all.
  const startedAt = deps.now();
  const claim = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(responseRef);
    const archive = readArchiveMap(fresh.data());
    const entry = archive[artifactId];
    if (
      entry?.archiveStatus === 'archived' &&
      typeof entry.driveFileId === 'string'
    ) {
      return { kind: 'archived' as const, driveFileId: entry.driveFileId };
    }
    if (hasLiveOwner(entry, startedAt)) return { kind: 'inflight' as const };
    archive[artifactId] = { archiveStatus: 'syncing' };
    tx.set(
      responseRef,
      {
        artifactArchive: {
          [artifactId]: {
            archiveStatus: 'syncing',
            archiveStartedAt: startedAt,
            archiveError: admin.firestore.FieldValue.delete(),
          },
        },
        hasStuckArchive: computeHasStuckArchive(archive),
      },
      { merge: true }
    );
    return { kind: 'claimed' as const };
  });
  if (claim.kind === 'archived') {
    return { archiveStatus: 'archived', driveFileId: claim.driveFileId };
  }
  if (claim.kind === 'inflight') return { archiveStatus: 'syncing' };

  try {
    const stat = await deps.statObject(storagePath);
    if (!stat) {
      throw new HttpsError(
        'not-found',
        'Recorded audio is no longer in Storage.'
      );
    }
    if (!Number.isFinite(stat.size) || stat.size > MAX_QUIZ_MEDIA_BYTES) {
      throw new HttpsError(
        'invalid-argument',
        Number.isFinite(stat.size)
          ? 'Recording exceeds the 5 MB archive limit.'
          : 'Recording size unknown; cannot safely archive.'
      );
    }
    if (stat.contentType && !stat.contentType.startsWith('audio/')) {
      throw new HttpsError('invalid-argument', 'Uploaded file is not audio.');
    }

    const sourceBytes = await deps.downloadObject(storagePath);
    const m4aBytes = await deps.transcodeToM4a(sourceBytes);

    const name = await deps.resolveStudentName(teacherUid, studentUid);
    const fallbackLabel =
      typeof response.pin === 'string' && response.pin
        ? `Pin${response.pin}`
        : `Student-${studentUid.slice(0, 8)}`;
    const fileName = buildArchiveFileName(
      name,
      fallbackLabel,
      questionLabelFor(publicQuestions, questionId)
    );
    const quizTitle =
      typeof session.quizTitle === 'string' && session.quizTitle.trim()
        ? sanitizeDriveNameSegment(session.quizTitle)
        : 'Untitled Quiz';

    const accessToken = await deps.getAccessToken(teacherUid);
    const driveFile = await deps.uploadToDrive(
      accessToken,
      m4aBytes,
      'audio/mp4',
      fileName,
      `${QUIZ_DRIVE_FOLDER}/${quizTitle}`
    );

    // `'archived'` is durable from here on: the Storage delete below is a
    // separate retryable step and can never demote this entry.
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(responseRef);
      const archive = readArchiveMap(fresh.data());
      archive[artifactId] = { archiveStatus: 'archived' };
      tx.set(
        responseRef,
        {
          artifactArchive: {
            [artifactId]: {
              archiveStatus: 'archived',
              driveFileId: driveFile.id,
              archivedAt: deps.now(),
              archiveStartedAt: admin.firestore.FieldValue.delete(),
              lastAttemptAt: admin.firestore.FieldValue.delete(),
              archiveError: admin.firestore.FieldValue.delete(),
            },
          },
          hasStuckArchive: computeHasStuckArchive(archive),
        },
        { merge: true }
      );
    });

    try {
      await deps.deleteObject(storagePath);
    } catch {
      await markStorageCleanupPending(db, responseRef, artifactId);
    }
    return { archiveStatus: 'archived', driveFileId: driveFile.id };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Drive archive failed';
    // `archiveStartedAt` survives and `lastAttemptAt` is stamped, so the sweep
    // measures from this attempt rather than retrying on its very next run.
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(responseRef);
      const archive = readArchiveMap(fresh.data());
      archive[artifactId] = {
        ...(archive[artifactId] ?? {}),
        archiveStatus: 'failed',
      };
      tx.set(
        responseRef,
        {
          artifactArchive: {
            [artifactId]: {
              archiveStatus: 'failed',
              archiveError: message.slice(0, 180),
              lastAttemptAt: deps.now(),
            },
          },
          hasStuckArchive: computeHasStuckArchive(archive),
        },
        { merge: true }
      );
    });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', message);
  }
}

async function markStorageCleanupPending(
  db: Firestore,
  responseRef: admin.firestore.DocumentReference,
  artifactId: string
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(responseRef);
    const archive = readArchiveMap(fresh.data());
    archive[artifactId] = {
      ...(archive[artifactId] ?? {}),
      storageCleanupPending: true,
    };
    tx.set(
      responseRef,
      {
        artifactArchive: { [artifactId]: { storageCleanupPending: true } },
        hasStuckArchive: computeHasStuckArchive(archive),
      },
      { merge: true }
    );
  });
}

/**
 * Second-pass cleanup for an entry the sweep found with
 * `storageCleanupPending`: the Drive copy already exists, only the transit
 * object is owed. Throws when the delete still fails so the sweep counts it.
 */
export async function retryStorageCleanup(
  input: ArchiveArtifactRequest,
  deps: ArchiveDeps
): Promise<void> {
  const { db } = deps;
  const responseRef = db
    .collection('quiz_sessions')
    .doc(input.sessionId)
    .collection('responses')
    .doc(input.responseKey);
  const snap = await responseRef.get();
  if (!snap.exists) return;
  const data = snap.data() ?? {};
  const studentUid = typeof data.studentUid === 'string' ? data.studentUid : '';
  const answers: StoredAnswer[] = Array.isArray(data.answers)
    ? (data.answers as StoredAnswer[])
    : [];
  const artifact = findStoredArtifact(
    answers,
    input.questionId,
    input.artifactId
  );
  const storagePath =
    typeof artifact?.storagePath === 'string' ? artifact.storagePath : '';
  if (hasQuizMediaStoragePrefix(storagePath, input.sessionId, studentUid)) {
    await deps.deleteObject(storagePath);
  }
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(responseRef);
    const archive = readArchiveMap(fresh.data());
    const entry = { ...(archive[input.artifactId] ?? {}) };
    delete entry.storageCleanupPending;
    archive[input.artifactId] = entry;
    tx.set(
      responseRef,
      {
        artifactArchive: {
          [input.artifactId]: {
            storageCleanupPending: admin.firestore.FieldValue.delete(),
          },
        },
        hasStuckArchive: computeHasStuckArchive(archive),
      },
      { merge: true }
    );
  });
}

function parseArchiveRequest(raw: unknown): ArchiveArtifactRequest {
  const data = (raw ?? {}) as Record<string, unknown>;
  const read = (key: string): string =>
    typeof data[key] === 'string' ? data[key].trim() : '';
  const sessionId = read('sessionId');
  const responseKey = read('responseKey');
  const questionId = read('questionId');
  const artifactId = read('artifactId');
  if (!sessionId || !responseKey || !questionId || !artifactId) {
    throw new HttpsError(
      'invalid-argument',
      'sessionId, responseKey, questionId and artifactId are required.'
    );
  }
  if ([sessionId, responseKey, artifactId].some((v) => v.includes('/'))) {
    throw new HttpsError('invalid-argument', 'Malformed identifier.');
  }
  return { sessionId, responseKey, questionId, artifactId };
}

export const archiveQuizMediaArtifact = onCall(
  {
    // ffmpeg needs headroom over the 5 MB source, and the memory tier also buys
    // the CPU share that keeps a transcode on the upload critical path short.
    memory: '1GiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    secrets: QUIZ_MEDIA_ARCHIVE_SECRETS,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const parsed = parseArchiveRequest(request.data);
    return archiveQuizArtifactCore(
      { ...parsed, callerUid: request.auth.uid },
      buildDefaultArchiveDeps()
    );
  }
);
