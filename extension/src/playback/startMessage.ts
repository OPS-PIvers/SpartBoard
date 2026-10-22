import type { WebLocatorClues } from './locate';
import type { PlaybackTour, WebStepAction } from './progress';

export interface WebTourPictureBytes {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Base64, no data: prefix. */
  data: string;
  w: number;
  h: number;
}

export interface ParsedStart {
  tour: PlaybackTour;
  stepIndex: number;
  version: number;
  pictures: Record<string, WebTourPictureBytes>;
}

const MAX_STEPS = 200;
const MAX_TEXT = 4000;
const MAX_PICTURE_CHARS = Math.ceil((2 * 1024 * 1024 * 4) / 3) + 4;
const MAX_PICTURE_TOTAL = 8 * 1024 * 1024;
const ACTIONS: readonly WebStepAction[] = ['observe', 'click', 'type', 'select'];
const MIMES: readonly WebTourPictureBytes['mime'][] = ['image/png', 'image/jpeg', 'image/webp'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = MAX_TEXT): string | null =>
  typeof v === 'string' && v.length <= max ? v : null;
const optStr = (v: unknown, max = MAX_TEXT): string | undefined | null =>
  v === undefined ? undefined : str(v, max);
const frac = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 2;

function httpsPage(v: unknown): string | null {
  const s = str(v, 2048);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

function parseClues(v: unknown): WebLocatorClues | null {
  if (!isObj(v)) return null;
  const clues: WebLocatorClues = {};
  for (const key of ['role', 'name', 'text', 'css'] as const) {
    const s = optStr(v[key], 500);
    if (s === null) return null;
    if (s) clues[key] = s;
  }
  if (v.box !== undefined) {
    const b = v.box;
    if (!isObj(b) || !frac(b.x) || !frac(b.y) || !frac(b.w) || !frac(b.h)) return null;
    clues.box = { x: b.x as number, y: b.y as number, w: b.w as number, h: b.h as number };
  }
  return clues;
}

function parsePicture(v: unknown): WebTourPictureBytes | null {
  if (!isObj(v)) return null;
  const mime = MIMES.find((m) => m === v.mime);
  const data = str(v.data, MAX_PICTURE_CHARS);
  if (!mime || !data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  if (typeof v.w !== 'number' || typeof v.h !== 'number' || v.w <= 0 || v.h <= 0) return null;
  return { mime, data, w: v.w, h: v.h };
}

/** Checks a `web-tour/start` message field by field; anything unexpected rejects the whole message. */
export function parseWebTourStart(msg: unknown): ParsedStart | null {
  if (!isObj(msg) || msg.type !== 'web-tour/start') return null;
  const startUrl = httpsPage(msg.startUrl);
  const t = msg.tour;
  if (!startUrl || !isObj(t) || !Array.isArray(t.steps)) return null;
  const setId = str(t.setId, 200);
  const title = str(t.title, 500);
  if (!setId || title === null || typeof t.version !== 'number') return null;
  if (t.steps.length === 0 || t.steps.length > MAX_STEPS) return null;
  const pictures: Record<string, WebTourPictureBytes> = {};
  let pictureChars = 0;
  const steps: PlaybackTour['steps'] = [];
  const ids = new Set<string>();
  for (const s of t.steps) {
    if (!isObj(s) || !isObj(s.web)) return null;
    const id = str(s.id, 200);
    const label = optStr(s.label);
    const text = optStr(s.text);
    const urlPattern = str(s.web.urlPattern, 2048);
    const action = ACTIONS.find((a) => a === (s.web as Obj).action);
    const locator = (s.web as Obj).locator;
    const clues = parseClues(locator);
    if (!id || ids.has(id) || label === null || text === null) return null;
    if (!urlPattern || !/^https:\/\//.test(urlPattern) || !action || !clues) return null;
    ids.add(id);
    const rawFrames = isObj(locator) ? locator.frames : undefined;
    const frames: PlaybackTour['steps'][number]['frames'] = [];
    if (rawFrames !== undefined) {
      if (!Array.isArray(rawFrames) || rawFrames.length > 10) return null;
      for (const f of rawFrames) {
        const p = isObj(f) ? str(f.urlPattern, 2048) : null;
        if (!p || !isObj(f) || !Number.isInteger(f.index)) return null;
        frames.push({ urlPattern: p, index: f.index as number });
      }
    }
    let hasPicture = false;
    if (s.picture !== undefined) {
      const pic = parsePicture(s.picture);
      if (!pic) return null;
      // Past the session store's room the step simply has no picture fallback.
      if (pictureChars + pic.data.length <= MAX_PICTURE_TOTAL) {
        pictures[id] = pic;
        pictureChars += pic.data.length;
        hasPicture = true;
      }
    }
    steps.push({
      id,
      title: label ?? '',
      text: text ?? '',
      urlPattern,
      frames,
      clues,
      action,
      hasPicture,
    });
  }
  const raw = typeof msg.stepIndex === 'number' && Number.isInteger(msg.stepIndex) ? msg.stepIndex : 0;
  return {
    tour: { id: setId, title, startUrl, steps },
    stepIndex: Math.min(Math.max(raw, 0), steps.length - 1),
    version: t.version,
    pictures,
  };
}
