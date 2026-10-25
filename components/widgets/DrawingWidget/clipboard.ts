import type { DrawableObject, Point } from '@/types';

const MARK = 'spartboardDrawing';
const MAX_OBJECTS = 20;
const MAX_POINTS = 20000;
const MAX_TEXT = 10000;
const MAX_DATA_URL = 700_000;
const MAX_COORD = 1_000_000;
const IMAGE_HOSTS = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'lh3.googleusercontent.com',
];

/** Clipboard text for copied objects; other apps see plain JSON. */
export const writeClipboardObjects = (objects: readonly DrawableObject[]) =>
  JSON.stringify({ [MARK]: 1, objects });

type Raw = Record<string, unknown>;

const num = (v: unknown, min = -MAX_COORD, max = MAX_COORD): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
    ? v
    : null;
const str = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.length <= max ? v : null;

const safeImageSrc = (v: unknown): string | null => {
  const src = str(v, MAX_DATA_URL);
  if (!src) return null;
  if (/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(src)) {
    return src;
  }
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && IMAGE_HOSTS.includes(url.hostname)
      ? src
      : null;
  } catch {
    return null;
  }
};

const box = (o: Raw) => {
  const x = num(o.x);
  const y = num(o.y);
  const w = num(o.w, 1, MAX_COORD);
  const h = num(o.h, 1, MAX_COORD);
  return x === null || y === null || w === null || h === null
    ? null
    : { x, y, w, h };
};

const stroke = (o: Raw) => {
  const s = str(o.stroke);
  const sw = num(o.strokeWidth, 0.5, 200);
  return s === null || sw === null ? null : { stroke: s, strokeWidth: sw };
};

// Pasted text can come from anywhere: each object is rebuilt from known, bounded fields only.
const rebuild = (v: unknown): DrawableObject | null => {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Raw;
  const id = str(o.id);
  const z = num(o.z, -1e9, 1e9);
  if (id === null || z === null) return null;
  const rotation = o.rotation === undefined ? 0 : num(o.rotation, -1e3, 1e3);
  if (rotation === null) return null;
  const base = { id, z, ...(rotation ? { rotation } : {}) };
  switch (o.kind) {
    case 'path': {
      const color = str(o.color);
      const width = num(o.width, 0.5, 200);
      if (!Array.isArray(o.points) || o.points.length > MAX_POINTS) return null;
      const points: Point[] = [];
      for (const p of o.points as unknown[]) {
        if (typeof p !== 'object' || p === null) return null;
        const x = num((p as Raw).x);
        const y = num((p as Raw).y);
        if (x === null || y === null) return null;
        points.push({ x, y });
      }
      if (color === null || width === null) return null;
      return {
        ...base,
        kind: 'path',
        points,
        color,
        width,
        ...(o.highlight === true ? { highlight: true } : {}),
      };
    }
    case 'rect':
    case 'ellipse': {
      const b = box(o);
      const s = stroke(o);
      const fill = o.fill === undefined ? undefined : str(o.fill);
      if (!b || !s || fill === null) return null;
      return {
        ...base,
        kind: o.kind,
        ...b,
        ...s,
        ...(fill !== undefined ? { fill } : {}),
        ...(o.dashed === true ? { dashed: true } : {}),
      };
    }
    case 'line':
    case 'arrow': {
      const x1 = num(o.x1);
      const y1 = num(o.y1);
      const x2 = num(o.x2);
      const y2 = num(o.y2);
      const s = stroke(o);
      if (x1 === null || y1 === null || x2 === null || y2 === null || !s) {
        return null;
      }
      const ends = { x1, y1, x2, y2, ...s };
      const dashed = o.dashed === true ? { dashed: true } : {};
      return o.kind === 'line'
        ? { ...base, kind: 'line', ...ends, ...dashed }
        : {
            ...base,
            kind: 'arrow',
            ...ends,
            ...dashed,
            ...(o.startHead === true ? { startHead: true } : {}),
          };
    }
    case 'text': {
      const b = box(o);
      const content = str(o.content, MAX_TEXT);
      const fontFamily = str(o.fontFamily);
      const fontSize = num(o.fontSize, 6, 400);
      const color = str(o.color);
      const fill =
        typeof o.sticky === 'object' && o.sticky !== null
          ? str((o.sticky as Raw).fill)
          : undefined;
      if (
        !b ||
        content === null ||
        fontFamily === null ||
        fontSize === null ||
        color === null ||
        fill === null
      ) {
        return null;
      }
      return {
        ...base,
        kind: 'text',
        ...b,
        content,
        fontFamily,
        fontSize,
        color,
        ...(o.wrap === true ? { wrap: true } : {}),
        ...(fill !== undefined ? { sticky: { fill } } : {}),
      };
    }
    case 'image': {
      const b = box(o);
      const src = safeImageSrc(o.src);
      if (!b || !src) return null;
      return { ...base, kind: 'image', ...b, src };
    }
    default:
      return null;
  }
};

/** Objects copied from a Drawing widget, or null for any other clipboard text. */
export const readClipboardObjects = (text: string): DrawableObject[] | null => {
  if (!text.includes(MARK)) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { [MARK]: mark, objects } = parsed as Raw;
    if (mark !== 1 || !Array.isArray(objects)) return null;
    if (objects.length === 0 || objects.length > MAX_OBJECTS) return null;
    const rebuilt = (objects as unknown[]).map(rebuild);
    return rebuilt.every((o): o is DrawableObject => o !== null)
      ? rebuilt
      : null;
  } catch {
    return null;
  }
};
