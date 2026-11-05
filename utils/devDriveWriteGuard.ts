// Dev only: Google file writes may touch only files under the dev Drive folder or made in this tab, never a prod file.
import { DRIVE_APP_FOLDER, IS_DEV_PROJECT } from '@/config/devProject';

const FILE_API_HOSTS = new Set([
  'www.googleapis.com',
  'content.googleapis.com',
  'sheets.googleapis.com',
  'docs.googleapis.com',
  'slides.googleapis.com',
]);
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DRIVE_META_URL = 'https://www.googleapis.com/drive/v3/files';
const MAX_DEPTH = 8;

class MetadataAuthError extends Error {}

export class DevProdDriveWriteError extends Error {
  constructor() {
    super(
      'Dev can only change Drive files in the "SpartBoard Dev" folder. This file belongs to the live site.'
    );
    this.name = 'DevProdDriveWriteError';
  }
}

const FILE_PATTERNS = [
  /\/drive\/v[23]\/files\/([^/?#]+)(\/[^?#]*)?/,
  /\/v4\/spreadsheets\/([^/?#:]+)/,
  /\/v1\/documents\/([^/?#:]+)/,
  /\/v1\/presentations\/([^/?#:]+)/,
];

/** The existing file a Google API write changes, or null for a write that only makes a new file. */
export function writeTargetFileId(href: string): string | null {
  let path: string;
  try {
    path = new URL(href).pathname;
  } catch {
    return null;
  }
  for (const pattern of FILE_PATTERNS) {
    const match = pattern.exec(path);
    if (!match) continue;
    // files/{id}/copy only reads the source and makes a new file.
    if (match[2] === '/copy') return null;
    return decodeURIComponent(match[1]);
  }
  return null;
}

interface FileMeta {
  name?: string;
  parents?: string[];
  trashed?: boolean;
}

export type FetchMeta = (fileId: string) => Promise<FileMeta | null>;

/** True when the file is the dev folder or sits somewhere inside it. */
export async function isInDevFolder(
  fileId: string,
  fetchMeta: FetchMeta,
  devFolder: string = DRIVE_APP_FOLDER
): Promise<boolean> {
  let id: string | undefined = fileId;
  for (let depth = 0; id && depth < MAX_DEPTH; depth++) {
    const meta = await fetchMeta(id);
    if (!meta) return false;
    if (meta.name === devFolder && !meta.trashed) return true;
    id = meta.parents?.[0];
  }
  return false;
}

function authHeader(input: RequestInfo | URL, init?: RequestInit): string {
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined)
  );
  return headers.get('Authorization') ?? '';
}

function hrefOf(input: RequestInfo | URL): string {
  try {
    if (typeof input === 'string')
      return new URL(input, window.location.href).href;
    return input instanceof URL ? input.href : input.url;
  } catch {
    return '';
  }
}

/** True for a request that would change a Drive, Sheets, Docs or Slides file. */
export function isFileApiWrite(
  input: RequestInfo | URL,
  init?: RequestInit
): boolean {
  const method = (
    init?.method ?? (input instanceof Request ? input.method : 'GET')
  ).toUpperCase();
  if (READ_METHODS.has(method)) return false;
  try {
    return FILE_API_HOSTS.has(new URL(hrefOf(input)).hostname);
  } catch {
    return false;
  }
}

const NEW_FILE_ID_KEYS = [
  'id',
  'spreadsheetId',
  'documentId',
  'presentationId',
] as const;

/** Wraps fetch so a dev tab can read prod files but write only its own. */
export function installDevDriveWriteGuard(
  target: Pick<Window, 'fetch'> = window,
  devFolder: string = DRIVE_APP_FOLDER
): void {
  const original = target.fetch.bind(target);
  const createdHere = new Set<string>();
  const allowed = new Map<string, Promise<boolean>>();

  const metaFetcher =
    (auth: string): FetchMeta =>
    async (fileId) => {
      const res = await original(
        `${DRIVE_META_URL}/${encodeURIComponent(fileId)}?fields=name,parents,trashed&supportsAllDrives=true`,
        { headers: { Authorization: auth } }
      );
      if (res.status === 401) throw new MetadataAuthError();
      if (!res.ok) throw new Error(`Drive metadata ${res.status}`);
      return (await res.json()) as FileMeta;
    };

  const canWrite = (fileId: string, auth: string): Promise<boolean> => {
    if (createdHere.has(fileId)) return Promise.resolve(true);
    let check = allowed.get(fileId);
    if (!check) {
      check = isInDevFolder(fileId, metaFetcher(auth), devFolder);
      allowed.set(fileId, check);
      // A failed lookup is retried next time rather than remembered.
      check.catch(() => allowed.delete(fileId));
    }
    return check;
  };

  const rememberNewFile = async (res: Response): Promise<void> => {
    if (!res.ok) return;
    try {
      const body = (await res.clone().json()) as Record<string, unknown>;
      for (const key of NEW_FILE_ID_KEYS) {
        const value = body[key];
        if (typeof value === 'string') createdHere.add(value);
      }
    } catch {
      // Not a JSON body, so nothing to remember.
    }
  };

  target.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isFileApiWrite(input, init)) return original(input, init);
    const fileId = writeTargetFileId(hrefOf(input));
    if (fileId === null) {
      const res = await original(input, init);
      await rememberNewFile(res);
      return res;
    }
    let ok = false;
    try {
      ok = await canWrite(fileId, authHeader(input, init));
    } catch (err) {
      // An expired token fails the write itself too, and the caller's refresh-on-401 needs to see it.
      if (err instanceof MetadataAuthError) return original(input, init);
      ok = false;
    }
    if (!ok) throw new DevProdDriveWriteError();
    return original(input, init);
  };
}

if (IS_DEV_PROJECT && typeof window !== 'undefined') {
  installDevDriveWriteGuard();
}
