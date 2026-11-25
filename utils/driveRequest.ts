// The one request layer every Drive and Sheets client call goes through: auth header, timeout, retry, token refresh, folder cache.
import { authError } from './driveAuthErrors';

export const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD_API_URL =
  'https://www.googleapis.com/upload/drive/v3';

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
const TIMEOUT_MESSAGE =
  'Google Drive request timed out. Please check your connection.';

let retryBaseMs = 500;

export type DriveTokenRefresher = () => Promise<string | null>;

export interface DriveRequestOptions {
  timeoutMs?: number;
  /** Retry 5xx too; defaults to every method but POST, which could make a duplicate. */
  retryServerErrors?: boolean;
  timeoutMessage?: string;
}

/** Escape backslash then single quote for Drive q-string literals. */
export function driveQueryEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Drive disallows `/` and some OS-reserved characters in a file name. */
export function sanitizeDriveFileName(title: string): string {
  return title.replace(/[/\\:*?"<>|]/g, '_').trim() || 'untitled';
}

function withAuth(
  headers: HeadersInit | undefined,
  token: string
): HeadersInit {
  const auth = `Bearer ${token}`;
  if (headers instanceof Headers || Array.isArray(headers)) {
    const next = new Headers(headers);
    next.set('Authorization', auth);
    return next;
  }
  return { ...(headers ?? {}), Authorization: auth };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // A caller's own abort still cancels the request.
  const outer = init.signal;
  const onOuterAbort = () => controller.abort();
  outer?.addEventListener('abort', onOuterAbort);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'AbortError' &&
      !outer?.aborted
    ) {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuterAbort);
  }
}

// Folder id per access token and path, so repeat saves skip the lookups.
const folderIds = new Map<string, Promise<string>>();

/** One signed-in Drive connection: holds the token and refreshes it once on a 401. */
export class DriveSession {
  private token: string;
  private readonly refresh: DriveTokenRefresher | undefined;

  constructor(accessToken: string, refresh?: DriveTokenRefresher) {
    this.token = accessToken;
    this.refresh = refresh;
  }

  get accessToken(): string {
    return this.token;
  }

  /** Retries 429 (and 5xx when safe) with backoff; a 401 refreshes the token once, then returns the 401. */
  async request(
    url: string,
    init: RequestInit = {},
    opts: DriveRequestOptions = {}
  ): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    const retryServerErrors = opts.retryServerErrors ?? method !== 'POST';
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeoutMessage = opts.timeoutMessage ?? TIMEOUT_MESSAGE;
    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      const res = await fetchWithTimeout(
        url,
        { ...init, headers: withAuth(init.headers, this.token) },
        timeoutMs,
        timeoutMessage
      );
      if (res.status === 401 && this.refresh && !refreshed) {
        refreshed = true;
        const next = await this.refresh();
        if (!next) return res;
        this.token = next;
        attempt -= 1;
        continue;
      }
      const retryable =
        res.status === 429 || (retryServerErrors && res.status >= 500);
      if (res.ok || !retryable || attempt >= MAX_ATTEMPTS) return res;
      const delay = retryBaseMs * 2 ** (attempt - 1);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
  }

  /** Finds a folder by name under `parentId` (or anywhere when omitted); never creates it. */
  async findFolder(name: string, parentId?: string): Promise<string | null> {
    let q = `name = '${driveQueryEscape(name)}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`;
    if (parentId) q += ` and '${driveQueryEscape(parentId)}' in parents`;
    const res = await this.request(
      `${DRIVE_API_URL}/files?q=${encodeURIComponent(q)}&fields=files(id)`
    );
    if (res.status === 401 || res.status === 403) {
      throw authError('Google Drive access expired. Please sign in again.');
    }
    if (!res.ok) {
      throw new Error(`Failed to list Drive folders (${res.status})`);
    }
    const data = (await res.json()) as { files?: { id: string }[] };
    return data.files?.[0]?.id ?? null;
  }

  /** Finds or creates one folder; cached per token. */
  getOrCreateFolder(name: string, parentId?: string): Promise<string> {
    const key = `${this.token}\u0000${parentId ?? ''}\u0000${name}`;
    const cached = folderIds.get(key);
    if (cached) return cached;
    const lookup = (async () => {
      const found = await this.findFolder(name, parentId);
      if (found) return found;
      const res = await this.request(`${DRIVE_API_URL}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          mimeType: FOLDER_MIME_TYPE,
          ...(parentId ? { parents: [parentId] } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Failed to create folder ${name} in Drive`);
      return ((await res.json()) as { id: string }).id;
    })();
    folderIds.set(key, lookup);
    lookup.catch(() => folderIds.delete(key));
    return lookup;
  }

  /** Walks `segments` from `rootName` in My Drive, creating what's missing. */
  async getOrCreateFolderPath(
    rootName: string,
    segments: readonly string[]
  ): Promise<string> {
    let parentId = await this.getOrCreateFolder(rootName);
    for (const part of segments) {
      if (part) parentId = await this.getOrCreateFolder(part, parentId);
    }
    return parentId;
  }

  /** Drops cached folder ids for this token, for when one turns out to be gone. */
  forgetFolders(): void {
    const prefix = `${this.token}\u0000`;
    for (const key of folderIds.keys()) {
      if (key.startsWith(prefix)) folderIds.delete(key);
    }
  }
}

// Test hook: forget cached folders and skip backoff waits.
export const resetDriveRequestStateForTests = (backoffMs = 0): void => {
  folderIds.clear();
  retryBaseMs = backoffMs;
};
