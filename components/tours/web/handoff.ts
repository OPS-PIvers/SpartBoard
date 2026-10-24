// Builds the tour a page or the extension hands to playback; pure, so the extension can import it without Firebase.
import {
  WEB_TOUR_ATTR_KEYS,
  type WebTourAction,
  type WebTourLocator,
  type WebTourStableAttrs,
} from '@/types';
import {
  MAX_PICTURE_CHARS,
  MAX_PICTURE_TOTAL_CHARS,
  type WebTourPictureBytes,
  type WebTourStartTour,
} from './extensionProtocol';

/** The parts of a published web step a handoff reads. */
export interface HandoffStep {
  id: string;
  label?: string;
  text?: string;
  web: { urlPattern: string; action: WebTourAction; locator: WebTourLocator };
}

// The extension's validator rejects a whole tour over these, so the hub clips first.
const MAX_TITLE = 500;
const MAX_TEXT = 4000;
const MAX_STEPS = 200;
const MAX_CLUE = 500;
const MAX_FRAMES = 10;

/** An address pattern the extension accepts. */
export const isHandoffPattern = (v: string): boolean =>
  v.length <= 2048 && v.startsWith('https://');

const unit = (v: number) => Number.isFinite(v) && v >= -1 && v <= 2;

// An extension before protocol 4 rejects a locator with the newer clues, so they go only to one that scores them.
function handoffLocator(
  locator: WebTourLocator,
  scored: boolean
): WebTourLocator {
  const out: WebTourLocator = {};
  for (const key of ['role', 'name', 'text', 'css'] as const) {
    const clue = locator[key];
    if (clue) out[key] = clue.slice(0, MAX_CLUE);
  }
  if (scored) {
    for (const key of ['heading', 'pageTitle'] as const) {
      const clue = locator[key];
      if (clue) out[key] = clue.slice(0, MAX_CLUE);
    }
    const attrs: WebTourStableAttrs = {};
    for (const key of WEB_TOUR_ATTR_KEYS) {
      const clue = locator.attrs?.[key];
      if (clue) attrs[key] = clue.slice(0, MAX_CLUE);
    }
    if (Object.keys(attrs).length) out.attrs = attrs;
  }
  if (locator.frames) {
    out.frames = locator.frames
      .filter(
        (f) => isHandoffPattern(f.urlPattern) && Number.isInteger(f.index)
      )
      .slice(0, MAX_FRAMES);
  }
  const box = locator.box;
  if (box && unit(box.x) && unit(box.y) && unit(box.w) && unit(box.h)) {
    out.box = { x: box.x, y: box.y, w: box.w, h: box.h };
  }
  return out;
}

/** The page a step opens on: its address, or its site when the path has wildcards. */
export function pageUrlOf(
  steps: readonly HandoffStep[],
  index: number
): string | null {
  const pattern = steps[index]?.web.urlPattern;
  // A wildcard in the host can't be opened.
  const host = pattern ? /^https:\/\/([^/?#]*)/.exec(pattern)?.[1] : undefined;
  if (!pattern || !host || host.includes('*')) return null;
  let url: URL;
  try {
    url = new URL(pattern.replace(/\*/g, '_'));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  return pattern.includes('*') ? `${url.origin}/` : url.href;
}

/** The page a tour opens on. */
export const startUrlOf = (steps: readonly HandoffStep[]): string | null =>
  pageUrlOf(steps, 0);

/** The tour as the extension takes it, with pictures until the per-picture and total caps. */
export function buildStartTour(
  setId: string,
  version: number,
  title: string,
  steps: readonly HandoffStep[],
  pictures: ReadonlyMap<string, WebTourPictureBytes>,
  scored = false
): WebTourStartTour {
  let total = 0;
  return {
    setId,
    version,
    title: title.slice(0, MAX_TITLE),
    steps: steps.slice(0, MAX_STEPS).map((step) => {
      const { urlPattern, action, locator } = step.web;
      const pic = pictures.get(step.id);
      const sized = !!pic && pic.w > 0 && pic.h > 0;
      const data = pic && sized ? pic.data : '';
      const fits =
        sized &&
        data.length <= MAX_PICTURE_CHARS &&
        total + data.length <= MAX_PICTURE_TOTAL_CHARS;
      if (fits) total += data.length;
      return {
        id: step.id,
        label: (step.label ?? '').slice(0, MAX_TEXT),
        text: (step.text ?? '').slice(0, MAX_TEXT),
        web: { urlPattern, action, locator: handoffLocator(locator, scored) },
        ...(pic && fits
          ? { picture: { mime: pic.mime, data, w: pic.w, h: pic.h } }
          : {}),
      };
    }),
  };
}
