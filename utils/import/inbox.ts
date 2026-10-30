// Reads a stored Send (`users/{uid}/import_inbox/{id}`) defensively; the server already checked it on the way in.
import type { ImportBlock, ImportImage, ImportInboxItem } from './contract';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';

function parseBlock(v: unknown): ImportBlock | null {
  if (!isObj(v)) return null;
  if (v.type === 'table') {
    if (!Array.isArray(v.rows)) return null;
    const rows = v.rows.filter(isObj).map((r) => ({
      cells: Array.isArray(r.cells) ? r.cells.filter(str) : [],
    }));
    return { type: 'table', rows };
  }
  if (!str(v.text)) return null;
  if (v.type === 'heading')
    return {
      type: 'heading',
      level: typeof v.level === 'number' ? v.level : 2,
      text: v.text,
    };
  if (v.type === 'paragraph' || v.type === 'listItem' || v.type === 'quote')
    return { type: v.type, text: v.text };
  return null;
}

function parseImage(v: unknown): ImportImage | null {
  if (!isObj(v) || !str(v.url)) return null;
  return str(v.alt) ? { url: v.url, alt: v.alt } : { url: v.url };
}

export function parseImportInboxItem(
  id: string,
  data: unknown
): ImportInboxItem | null {
  if (!isObj(data) || !str(data.url) || !str(data.title)) return null;
  return {
    id,
    url: data.url,
    title: data.title,
    platform: str(data.platform) ? data.platform : 'generic',
    selectionOnly: data.selectionOnly === true,
    blocks: Array.isArray(data.blocks)
      ? data.blocks.map(parseBlock).filter((b): b is ImportBlock => b !== null)
      : [],
    images: Array.isArray(data.images)
      ? data.images.map(parseImage).filter((i): i is ImportImage => i !== null)
      : [],
    receivedAt: typeof data.receivedAt === 'number' ? data.receivedAt : 0,
  };
}
