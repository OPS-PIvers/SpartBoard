// The inbox request (functions/src/schoologyQuizImport.ts parseInboxPayload) built from a read quiz and its pictures (Q7).

import type { SchoologyItem } from './page';
import type { SchoologyRead } from './readResult';

// Match the server's caps: 5 MB per picture, 24 MB of base64 per request.
export const MAX_PICTURE_BYTES = 5 * 1024 * 1024;
export const MAX_PICTURE_CHARS = 24 * 1024 * 1024;
const PICTURE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export interface InboxPicture {
  id: string;
  mime: string;
  name: string;
  data: string;
}

export interface InboxRequest {
  source: {
    kind: SchoologyItem['kind'];
    itemId: string;
    sectionId?: string;
    url: string;
  };
  folderPath: string[];
  quiz: { title: string; questions: unknown[]; warnings: string[] };
  unsupported: number[];
  settings: SchoologyRead['settings'];
  pictures: InboxPicture[];
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Downloads each picture in the teacher's session; one that fails or is too big is left for the server to flag. */
export async function collectPictures(
  urls: readonly string[],
  get: (url: string) => Promise<Response>,
  origin: string
): Promise<InboxPicture[]> {
  const pictures: InboxPicture[] = [];
  let total = 0;
  for (const [i, url] of urls.entries()) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    // Only Schoology's own files; another site's picture would need its own sign-in.
    if (parsed.origin !== origin || url.length > 2048) continue;
    try {
      const res = await get(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const mime = blob.type.split(';')[0].trim().toLowerCase();
      if (!PICTURE_TYPES.has(mime) || blob.size > MAX_PICTURE_BYTES) continue;
      const data = toBase64(new Uint8Array(await blob.arrayBuffer()));
      if (total + data.length > MAX_PICTURE_CHARS) continue;
      total += data.length;
      pictures.push({ id: url, mime, name: `Picture ${i + 1}`, data });
    } catch {
      // Skipped; the question gets the missing-picture note.
    }
  }
  return pictures;
}

export function inboxRequest(
  item: SchoologyItem,
  read: SchoologyRead,
  courseName: string | null,
  pictures: InboxPicture[],
  url: string
): InboxRequest {
  return {
    source: {
      kind: item.kind,
      itemId: item.itemId,
      ...(item.sectionId ? { sectionId: item.sectionId } : {}),
      url,
    },
    folderPath: courseName ? [courseName.slice(0, 200)] : [],
    quiz: {
      title: read.quiz.title.slice(0, 500),
      questions: read.quiz.questions,
      warnings: read.quiz.warnings,
    },
    unsupported: read.unsupported,
    settings: read.settings,
    pictures,
  };
}
