// loadSubShareFilesV1: a substitute named on a live share gets its class lists
// and names file read from the teacher's Drive with the teacher's stored
// drive.file grant, so the sub needs no Picker. Names never touch Firestore.

import { onCall } from 'firebase-functions/v2/https';
import axios from 'axios';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import {
  shortId,
  denied,
  verifySubCaller,
  verifySubShare,
  type SubShareCaller,
} from './subShareAccess';
import { assertViewAsAllowed } from './viewAsGuard';
import {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
} from './secrets';

const MAX_ROSTERS = 50;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DRIVE_TIMEOUT_MS = 10_000;
const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,128}$/;
const CACHE_TTL_MS = 60_000;
const MAX_CACHED = 100;

type LoadedFiles = Extract<SubShareFilesResult, { status: 'ok' }>;
export type SubShareFilesCache = Map<
  string,
  { at: number; result: LoadedFiles }
>;

export interface SubShareFilesDeps {
  now: () => number;
  isStaff: (email: string) => Promise<boolean>;
  /** The teacher's drive.file token, or null when they must reconnect Drive. */
  getHostToken: (hostUid: string) => Promise<string | null>;
  /** The file's parsed JSON, or null when it cannot be read. */
  download: (token: string, fileId: string) => Promise<unknown>;
  /** Complete reads kept briefly, so reopening a share doesn't re-download every file. */
  cache: SubShareFilesCache;
}

export type SubShareFilesResult =
  | { status: 'needs-host' }
  | {
      status: 'ok';
      rosters: Array<{ id: string; body: unknown }>;
      names: unknown;
      /** Files the share lists that could not be read. */
      missing: number;
    };

export async function handleLoadSubShareFiles(
  db: admin.firestore.Firestore,
  caller: SubShareCaller | null,
  data: unknown,
  deps: SubShareFilesDeps
): Promise<SubShareFilesResult> {
  const { email } = verifySubCaller(caller ?? null);
  const shareId = shortId((data as { shareId?: unknown })?.shareId, 'shareId');
  if (!(await deps.isStaff(email))) denied('This is for staff accounts.');
  const { share, hostUid } = await verifySubShare(
    db,
    shareId,
    email,
    deps.now()
  );

  const listed: unknown[] = Array.isArray(share.sharedRosters)
    ? share.sharedRosters
    : [];
  const rosters = listed
    .flatMap((r) => {
      const entry = r as { id?: unknown; driveFileId?: unknown } | null;
      return typeof entry?.id === 'string' &&
        typeof entry.driveFileId === 'string' &&
        DRIVE_FILE_ID.test(entry.driveFileId)
        ? [{ id: entry.id, driveFileId: entry.driveFileId }]
        : [];
    })
    .slice(0, MAX_ROSTERS);
  const namesFileId =
    typeof share.namesFileId === 'string' &&
    DRIVE_FILE_ID.test(share.namesFileId)
      ? share.namesFileId
      : null;
  if (rosters.length === 0 && !namesFileId) {
    return { status: 'ok', rosters: [], names: null, missing: 0 };
  }

  const cacheKey = [
    shareId,
    namesFileId ?? '',
    ...rosters.map((r) => `${r.id}:${r.driveFileId}`),
  ].join('|');
  const cached = deps.cache.get(cacheKey);
  if (cached && deps.now() - cached.at < CACHE_TTL_MS) return cached.result;

  const token = await deps.getHostToken(hostUid);
  if (!token) return { status: 'needs-host' };

  const [bodies, names] = await Promise.all([
    Promise.all(rosters.map((r) => deps.download(token, r.driveFileId))),
    namesFileId ? deps.download(token, namesFileId) : Promise.resolve(null),
  ]);
  const loaded = rosters.flatMap((r, i) =>
    bodies[i] == null ? [] : [{ id: r.id, body: bodies[i] }]
  );
  const missing =
    rosters.length - loaded.length + (namesFileId && names == null ? 1 : 0);
  const result: LoadedFiles = {
    status: 'ok',
    rosters: loaded,
    names: names ?? null,
    missing,
  };
  if (missing === 0) {
    deps.cache.delete(cacheKey);
    const oldest = deps.cache.keys().next();
    if (deps.cache.size >= MAX_CACHED && !oldest.done) {
      deps.cache.delete(oldest.value);
    }
    deps.cache.set(cacheKey, { at: deps.now(), result });
  }
  return result;
}

const liveCache: SubShareFilesCache = new Map();

const liveDeps = (db: admin.firestore.Firestore): SubShareFilesDeps => ({
  now: () => Date.now(),
  cache: liveCache,
  isStaff: async (email) => {
    const { isDistrictStaffEmail } = await import('./districtStaff');
    return isDistrictStaffEmail(db, email);
  },
  getHostToken: async (hostUid) => {
    const { DRIVE_FILE_SCOPE, refreshGoogleAccessTokenForUid } =
      await import('./googleOAuth');
    const { isNeedsConsentError } = await import('./needsConsent');
    try {
      // A sub's request must never drop the teacher's stored grant.
      const { accessToken } = await refreshGoogleAccessTokenForUid(hostUid, {
        scope: DRIVE_FILE_SCOPE,
        keepStoredOnFailure: true,
      });
      return accessToken;
    } catch (err) {
      if (isNeedsConsentError(err)) return null;
      throw err;
    }
  },
  download: async (token, fileId) => {
    try {
      const res = await axios.get<unknown>(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { alt: 'media', supportsAllDrives: true },
          responseType: 'json',
          timeout: DRIVE_TIMEOUT_MS,
          maxContentLength: MAX_FILE_BYTES,
        }
      );
      return typeof res.data === 'object' ? res.data : null;
    } catch (err) {
      console.warn(
        '[loadSubShareFilesV1] file unreadable',
        axios.isAxiosError(err) ? err.response?.status : String(err)
      );
      return null;
    }
  },
});

export const loadSubShareFilesV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
    secrets: [
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
      GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
    ],
  },
  async (request) => {
    await assertViewAsAllowed(request, { read: true });
    const db = admin.firestore();
    return handleLoadSubShareFiles(
      db,
      request.auth
        ? {
            uid: request.auth.uid,
            email: request.auth.token.email ?? null,
            emailVerified: request.auth.token.email_verified === true,
            anonymous:
              request.auth.token.firebase?.sign_in_provider === 'anonymous',
            studentRole: request.auth.token.studentRole === true,
          }
        : null,
      request.data,
      liveDeps(db)
    );
  }
);
