// The inbox request (functions/src/schoologyQuizImport.ts parseInboxPayload) built from a read quiz and its pictures (Q7).

import type { SchoologyItem } from './page';
import type { SchoologyRead } from './readResult';

// Match the server's caps: 200 pictures, 5 MB each, 24 MB of base64 per request.
export const MAX_PICTURES = 200;
export const MAX_PICTURE_BYTES = 5 * 1024 * 1024;
export const MAX_PICTURE_CHARS = 24 * 1024 * 1024;

const startsWith = (b: Uint8Array, bytes: number[], at = 0) =>
  bytes.every((x, i) => b[at + i] === x);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** The picture's type from its first bytes, as the server checks it; Schoology labels files by name, not content. */
export function sniffPicture(b: Uint8Array): string | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(b, ascii('GIF8'))) return 'image/gif';
  if (startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8))
    return 'image/webp';
  return null;
}

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
    if (pictures.length >= MAX_PICTURES) break;
    try {
      const res = await get(url);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const mime = sniffPicture(bytes);
      if (!mime || bytes.length > MAX_PICTURE_BYTES) continue;
      const data = toBase64(bytes);
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
