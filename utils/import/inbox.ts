// Reads a stored Send (`users/{uid}/import_inbox/{id}`) defensively; the server already checked it on the way in.
import {
  YOUTUBE_VIDEO_ID,
  type ImportBlock,
  type ImportImage,
  type ImportInboxItem,
  type ImportVideoLesson,
  type ImportVideoStop,
} from './contract';

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

const time = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

function parseStop(v: unknown): ImportVideoStop | null {
  if (!isObj(v) || !str(v.text)) return null;
  const t = time(v.time);
  if (t === null) return null;
  if (v.kind === 'open' || v.kind === 'note')
    return { kind: v.kind, time: t, text: v.text };
  if (v.kind !== 'choice' || !Array.isArray(v.choices)) return null;
  const choices = v.choices
    .filter(isObj)
    .filter((c) => str(c.text))
    .map((c) => ({ text: c.text as string, correct: c.correct === true }));
  return choices.length
    ? { kind: 'choice', time: t, text: v.text, choices }
    : null;
}

function parseVideo(v: unknown): ImportVideoLesson | null {
  if (!isObj(v) || !str(v.youtubeId) || !YOUTUBE_VIDEO_ID.test(v.youtubeId))
    return null;
  const start = time(v.start);
  const end = time(v.end);
  return {
    youtubeId: v.youtubeId,
    ...(start !== null ? { start } : {}),
    ...(end !== null ? { end } : {}),
    stops: Array.isArray(v.stops)
      ? v.stops.map(parseStop).filter((s): s is ImportVideoStop => s !== null)
      : [],
  };
}

export function parseImportInboxItem(
  id: string,
  data: unknown
): ImportInboxItem | null {
  if (!isObj(data) || !str(data.url) || !str(data.title)) return null;
  const video = parseVideo(data.video);
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
    ...(video ? { video } : {}),
  };
}
