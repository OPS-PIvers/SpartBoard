/**
 * Teacher-side playback of an archived take. The archived file lives in the
 * grading teacher's OWN Drive, so this is the same owner-authenticated
 * `alt=media` fetch the soundboard already uses — no share link is minted, no
 * file is made public, and no new callable is introduced.
 */

import { fetchDriveAudioBlobUrl } from '@/utils/soundboardAudioUrl';

/** Resolves an archived Drive file id to a blob URL the caller must revoke. */
export type TakeUrlResolver = (driveFileId: string) => Promise<string>;

export interface DriveTakeResolverDeps {
  getToken: () => string | null;
  /** AuthContext's `refreshGoogleToken`; used once on an auth failure. */
  refreshToken: (silent?: boolean) => Promise<string | null>;
  fetchBlobUrl?: (fileId: string, accessToken: string) => Promise<string>;
}

const AUTH_FAILURE = /\(40[13]\)/;

/**
 * One retry, and only on a 401/403 — a lapsed Google token is the expected
 * failure here (the app refreshes on a 1-hour TTL) and re-prompting the
 * teacher for every transient network error would be worse than failing.
 */
export function createDriveTakeUrlResolver(
  deps: DriveTakeResolverDeps
): TakeUrlResolver {
  const fetchBlobUrl = deps.fetchBlobUrl ?? fetchDriveAudioBlobUrl;
  return async (driveFileId: string) => {
    if (!driveFileId) throw new Error('missing-drive-file');
    const token = deps.getToken();
    if (!token) {
      const refreshed = await deps.refreshToken(true);
      if (!refreshed) throw new Error('no-google-token');
      return fetchBlobUrl(driveFileId, refreshed);
    }
    try {
      return await fetchBlobUrl(driveFileId, token);
    } catch (err) {
      if (!AUTH_FAILURE.test(err instanceof Error ? err.message : ''))
        throw err;
      const refreshed = await deps.refreshToken(true);
      if (!refreshed) throw err;
      return fetchBlobUrl(driveFileId, refreshed);
    }
  };
}
