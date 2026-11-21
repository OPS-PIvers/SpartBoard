// Teacher Drive access for Drive-backed content (quizzes, banks, video activities) via the stored offline grant.
import { publicOrigin } from './config';
import { DRIVE_APP_FOLDER } from '../devDriveWriteGuard';
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
  const [
    { DRIVE_FILE_SCOPE, refreshGoogleAccessTokenForUid },
    { isNeedsConsentError },
  ] = await Promise.all([import('../googleOAuth'), import('../needsConsent')]);
  try {
    const { accessToken, expiresIn } = await refreshGoogleAccessTokenForUid(
      uid,
      { scope: DRIVE_FILE_SCOPE }
    );
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
  return saveInFolder(token, content, 'Quizzes', 'quiz.json', body);
}

/** Mirrors GuidedLearningDriveService.saveSet: SpartBoard/Guided Learning/<title>.<id8>.gl.json. */
export async function createGuidedLearningJson(
  token: string,
  content: { id: string; title: string }
): Promise<string> {
  return saveInFolder(
    token,
    content,
    'Guided Learning',
    'gl.json',
    JSON.stringify(content)
  );
}

async function saveInFolder(
  token: string,
  content: { id: string; title: string },
  folderName: string,
  extension: string,
  body: string
): Promise<string> {
  const root = await findOrCreateFolder(token, DRIVE_APP_FOLDER);
  const folderId = await findOrCreateFolder(token, folderName, root);
  const fileName = `${sanitizeDriveFileName(content.title)}.${content.id.slice(0, 8)}.${extension}`;
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

/** Overwrites an existing Guided Learning file in place; never creates one, so a missing file is an error. */
export async function replaceDriveJson(
  token: string,
  fileId: string,
  content: unknown
): Promise<void> {
  if (!(await patchMedia(token, fileId, JSON.stringify(content)))) {
    throw new ToolError(
      "That set's file in Google Drive could not be saved. Open the set in SpartBoard and save it there."
    );
  }
}

/** appProperties mark the client checks before releasing a Guided Learning slide (utils/driveAppFolder.ts). */
const GL_SLIDE_APP_PROPERTIES = { spartboardGlSlide: '1' };

/** The teacher's SpartBoard/Assets/HotspotImages folder id, created when missing. */
export async function slideImageFolder(token: string): Promise<string> {
  const root = await findOrCreateFolder(token, DRIVE_APP_FOLDER);
  const assets = await findOrCreateFolder(token, 'Assets', root);
  return findOrCreateFolder(token, 'HotspotImages', assets);
}

/** The teacher's SpartBoard/Assets/Claude pictures folder, where pictures shared in a Claude chat land. */
export async function claudePictureFolder(token: string): Promise<string> {
  const root = await findOrCreateFolder(token, DRIVE_APP_FOLDER);
  const assets = await findOrCreateFolder(token, 'Assets', root);
  return findOrCreateFolder(token, 'Claude pictures', assets);
}

async function createImageFile(
  token: string,
  folderId: string,
  bytes: Buffer,
  mimeType: string,
  fileName: string,
  appProperties?: Record<string, string>
): Promise<string> {
  const boundary = `spartboard-${Date.now().toString(36)}`;
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
    ...(appProperties ? { appProperties } : {}),
  });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const created = await driveFetch(
    token,
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: new Uint8Array(body),
    }
  );
  if (!created.ok) throw new Error(`drive image upload ${created.status}`);
  return ((await created.json()) as { id: string }).id;
}

/** Makes a file viewable by link, trashing it if that fails. */
async function shareByLink(token: string, id: string): Promise<void> {
  try {
    const shared = await driveFetch(
      token,
      `${DRIVE_API}/files/${encodeURIComponent(id)}/permissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      }
    );
    if (!shared.ok) throw new Error(`drive slide share ${shared.status}`);
  } catch (err) {
    await trashDriveFile(token, id);
    throw err;
  }
}

/** Saves a picture privately in the teacher's Drive; returns its id. */
export async function uploadPrivateImage(
  token: string,
  folderId: string,
  bytes: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  return createImageFile(token, folderId, bytes, mimeType, fileName);
}

/** Saves a slide image in that folder, viewable by link; returns its id, and trashes it on any later failure. */
export async function uploadSlideImage(
  token: string,
  folderId: string,
  bytes: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const id = await createImageFile(
    token,
    folderId,
    bytes,
    mimeType,
    fileName,
    GL_SLIDE_APP_PROPERTIES
  );
  await shareByLink(token, id);
  return id;
}

/** The teacher's SpartBoard/Assets/<name> folder, the same one the app uploads into. */
export async function assetFolder(
  token: string,
  name: string
): Promise<string> {
  const root = await findOrCreateFolder(token, DRIVE_APP_FOLDER);
  const assets = await findOrCreateFolder(token, 'Assets', root);
  return findOrCreateFolder(token, name, assets);
}

/** Copies an uploaded picture into a folder as its own file, viewable by link. */
export async function copyPictureShared(
  token: string,
  folderId: string,
  pictureId: string,
  fileName: string,
  appProperties?: Record<string, string>
): Promise<string> {
  const copied = await driveFetch(
    token,
    `${DRIVE_API}/files/${encodeURIComponent(pictureId)}/copy?fields=id`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
        ...(appProperties ? { appProperties } : {}),
      }),
    }
  );
  if (copied.status === 404)
    throw new ToolError(
      "That picture is missing from the teacher's Google Drive. Add it again."
    );
  if (!copied.ok) throw new Error(`drive picture copy ${copied.status}`);
  const { id } = (await copied.json()) as { id: string };
  await shareByLink(token, id);
  return id;
}

/** Copies an uploaded picture into the slide folder as its own slide file, viewable by link. */
export const copyPictureToSlide = (
  token: string,
  folderId: string,
  pictureId: string,
  fileName: string
): Promise<string> =>
  copyPictureShared(
    token,
    folderId,
    pictureId,
    fileName,
    GL_SLIDE_APP_PROPERTIES
  );

/** Best-effort move to the teacher's Drive trash, for an upload whose save failed. */
export async function trashDriveFile(token: string, id: string): Promise<void> {
  await driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  }).catch(() => undefined);
}

/** Raw bytes and type of a Drive file, for slide images. */
export async function readDriveBytes(
  token: string,
  fileId: string
): Promise<{ data: Buffer; mimeType: string }> {
  const res = await driveFetch(
    token,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`
  );
  if (!res.ok) {
    throw new ToolError(
      res.status === 404
        ? "That slide's image is missing from the teacher's Google Drive."
        : 'That slide could not be read from Google Drive.'
    );
  }
  const mimeType = (res.headers.get('content-type') ?? '').split(';')[0];
  if (!/^image\/(png|jpeg|webp|gif)$/.test(mimeType))
    throw new ToolError('That slide is not an image Claude can show.');
  return { data: Buffer.from(await res.arrayBuffer()), mimeType };
}
