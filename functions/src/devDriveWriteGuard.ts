// Dev only: functions may write only Drive files under the dev folder or made by this instance, never a prod file. Mirrors utils/devDriveWriteGuard.ts.

function projectId(): string | undefined {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  try {
    return (
      JSON.parse(process.env.FIREBASE_CONFIG ?? '{}') as { projectId?: string }
    ).projectId;
  } catch {
    return undefined;
  }
}

export const IS_DEV_PROJECT = projectId() === 'spartboard-dev';

/** The root Drive folder the app files into; dev keeps its own so it never touches prod files. */
export const DRIVE_APP_FOLDER = IS_DEV_PROJECT
  ? 'SpartBoard Dev'
  : 'SpartBoard';

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
const FILE_PATTERNS = [
  /\/drive\/v[23]\/files\/([^/?#]+)(\/[^?#]*)?/,
  /\/v4\/spreadsheets\/([^/?#:]+)/,
  /\/v1\/documents\/([^/?#:]+)/,
  /\/v1\/presentations\/([^/?#:]+)/,
];
const NEW_FILE_ID_KEYS = [
  'id',
  'spreadsheetId',
  'documentId',
  'presentationId',
] as const;

class MetadataAuthError extends Error {}

export class DevProdDriveWriteError extends Error {
  constructor() {
    super(
      'Dev can only change Drive files in the "SpartBoard Dev" folder. This file belongs to the live site.'
    );
    this.name = 'DevProdDriveWriteError';
  }
}

function hrefOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

/** True for a request that would change a Drive, Sheets, Docs or Slides file. */
export function isFileApiWrite(
  input: string | URL | Request,
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

/** True when the file is the dev folder or sits somewhere inside it. */
export async function isInDevFolder(
  fileId: string,
  fetchMeta: (id: string) => Promise<FileMeta | null>,
  devFolder: string
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

function authHeader(input: string | URL | Request, init?: RequestInit): string {
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined)
  );
  return headers.get('Authorization') ?? '';
}

type Fetch = typeof fetch;

/** For Drive writes sent without fetch (axios): throws on dev unless the file is dev's own. */
export async function assertDevDriveWritable(
  accessToken: string,
  fileId: string
): Promise<void> {
  if (!IS_DEV_PROJECT) return;
  const ok = await isInDevFolder(
    fileId,
    async (id) => {
      const res = await fetch(
        `${DRIVE_META_URL}/${encodeURIComponent(id)}?fields=name,parents,trashed&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error(`Drive metadata ${res.status}`);
      return (await res.json()) as FileMeta;
    },
    DRIVE_APP_FOLDER
  ).catch(() => false);
  if (!ok) throw new DevProdDriveWriteError();
}

/** Wraps fetch so dev functions can read prod files but write only dev's own. */
export function installDevDriveWriteGuard(
  target: { fetch: Fetch } = globalThis,
  devFolder: string = DRIVE_APP_FOLDER
): void {
  const original = target.fetch.bind(target);
  const createdHere = new Set<string>();
  const allowed = new Map<string, Promise<boolean>>();

  const canWrite = (fileId: string, auth: string): Promise<boolean> => {
    if (createdHere.has(fileId)) return Promise.resolve(true);
    let check = allowed.get(fileId);
    if (!check) {
      check = isInDevFolder(
        fileId,
        async (id) => {
          const res = await original(
            `${DRIVE_META_URL}/${encodeURIComponent(id)}?fields=name,parents,trashed&supportsAllDrives=true`,
            { headers: { Authorization: auth } }
          );
          if (res.status === 401) throw new MetadataAuthError();
          if (!res.ok) throw new Error(`Drive metadata ${res.status}`);
          return (await res.json()) as FileMeta;
        },
        devFolder
      );
      allowed.set(fileId, check);
      check.catch(() => allowed.delete(fileId));
    }
    return check;
  };

  const guarded = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    if (!isFileApiWrite(input, init)) return original(input, init);
    const fileId = writeTargetFileId(hrefOf(input));
    if (fileId === null) {
      const res = await original(input, init);
      if (res.ok) {
        try {
          const body = (await res.clone().json()) as Record<string, unknown>;
          for (const key of NEW_FILE_ID_KEYS) {
            if (typeof body[key] === 'string') createdHere.add(body[key]);
          }
        } catch {
          // Not a JSON body, so nothing to remember.
        }
      }
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
  target.fetch = guarded;
}

if (IS_DEV_PROJECT) installDevDriveWriteGuard();
