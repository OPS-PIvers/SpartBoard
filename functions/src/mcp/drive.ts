// Teacher Drive access for Drive-backed content (quizzes, banks, video activities) via the stored offline grant.
import { publicOrigin } from './config';
import { ToolError } from './activity';
import { BoundedLruMap } from '../utils/boundedLruMap';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

const tokenCache = new BoundedLruMap<
  string,
  { token: string; expiresAt: number }
>(500);

export const needsDriveMessage = (): string =>
  `SpartBoard can't reach this teacher's Google Drive, where quizzes, question banks and video activities are saved. Ask them to open ${publicOrigin()} and choose "Keep Drive connected" when asked, or disconnect and reconnect SpartBoard in Claude's connector settings.`;

/** Access token from the teacher's stored refresh token, cached until a minute before expiry. */
export async function driveTokenFor(
  uid: string,
  now = Date.now()
): Promise<string> {
  const hit = tokenCache.get(uid);
  if (hit && hit.expiresAt > now + 60_000) return hit.token;
  const [{ refreshGoogleAccessTokenForUid }, { isNeedsConsentError }] =
    await Promise.all([
      import('../googleOAuth'),
      import('../quizMediaArchive'),
    ]);
  try {
    const { accessToken, expiresIn } =
      await refreshGoogleAccessTokenForUid(uid);
    tokenCache.set(uid, {
      token: accessToken,
      expiresAt: now + expiresIn * 1000,
    });
    return accessToken;
  } catch (err) {
    if (isNeedsConsentError(err)) throw new ToolError(needsDriveMessage());
    throw err;
  }
}

/** True when the teacher's stored Drive grant still yields an access token. */
export async function hasDriveGrant(uid: string): Promise<boolean> {
  try {
    await driveTokenFor(uid);
    return true;
  } catch (err) {
    if (err instanceof ToolError) return false;
    throw err;
  }
}

async function driveFetch(
  token: string,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401) {
    throw new ToolError(needsDriveMessage());
  }
  return res;
}

export async function readDriveJson(
  token: string,
  fileId: string
): Promise<unknown> {
  const res = await driveFetch(
    token,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`
  );
  if (res.status === 404) {
    throw new ToolError(
      "That item's file is missing from the teacher's Google Drive."
    );
  }
  if (!res.ok) throw new Error(`drive read ${res.status}`);
  return res.json();
}

/** Mirrors sanitizeDriveFileName in utils/quizDriveService.ts. */
export function sanitizeDriveFileName(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|]/g, '_').trim();
  return cleaned || 'untitled';
}

const escapeQuery = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function findOrCreateFolder(
  token: string,
  name: string,
  parentId?: string
): Promise<string> {
  const q = `name = '${escapeQuery(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${
    parentId ? ` and '${escapeQuery(parentId)}' in parents` : ''
  }`;
  const list = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&orderBy=createdTime`
  );
  if (!list.ok) throw new Error(`drive folder list ${list.status}`);
  const found = ((await list.json()) as { files?: { id: string }[] })
    .files?.[0];
  if (found) return found.id;
  const created = await driveFetch(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!created.ok) throw new Error(`drive folder create ${created.status}`);
  return ((await created.json()) as { id: string }).id;
}

async function patchMedia(
  token: string,
  fileId: string,
  body: string
): Promise<boolean> {
  const res = await driveFetch(
    token,
    `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }
  );
  return res.ok;
}

/** Mirrors QuizDriveService.saveQuiz: SpartBoard/Quizzes/<title>.<id8>.quiz.json. Returns the file id. */
export async function saveQuizJson(
  token: string,
  content: { id: string; title: string },
  existingFileId?: string | null
): Promise<string> {
  const body = JSON.stringify(content, null, 2);
  if (existingFileId && (await patchMedia(token, existingFileId, body))) {
    return existingFileId;
  }
  const root = await findOrCreateFolder(token, 'SpartBoard');
  const folderId = await findOrCreateFolder(token, 'Quizzes', root);
  const fileName = `${sanitizeDriveFileName(content.title)}.${content.id.slice(0, 8)}.quiz.json`;
  const q = `name = '${escapeQuery(fileName)}' and '${escapeQuery(folderId)}' in parents and trashed = false`;
  const list = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)`
  );
  if (list.ok) {
    const existing = ((await list.json()) as { files?: { id: string }[] })
      .files?.[0];
    if (existing && (await patchMedia(token, existing.id, body)))
      return existing.id;
  }
  const meta = await driveFetch(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: fileName,
      parents: [folderId],
      mimeType: 'application/json',
    }),
  });
  if (!meta.ok) throw new Error(`drive create ${meta.status}`);
  const { id } = (await meta.json()) as { id: string };
  if (!(await patchMedia(token, id, body)))
    throw new Error('drive upload failed');
  return id;
}
