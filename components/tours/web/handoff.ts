// Builds the tour a page or the extension hands to playback; pure, so the extension can import it without Firebase.
import {
  WEB_TOUR_ATTR_KEYS,
  type WebTourAction,
  type WebTourCondition,
  type WebTourLocator,
  type WebTourStableAttrs,
  type TourMarkupShape,
} from '@/types';
import {
  isOpenableUrl,
  MAX_PICTURE_CHARS,
  MAX_PICTURE_TOTAL_CHARS,
  parseMarkupShapes,
  parsePictureTarget,
  type PictureTarget,
  type WebStepConditions,
  type WebTourPictureBytes,
  type WebTourStartStep,
  type WebTourStartTour,
} from './extensionProtocol';

/** The parts of a published web step a handoff reads. */
export interface HandoffTargetStep {
  id: string;
  label?: string;
  text?: string;
  web: {
    urlPattern: string;
    action: WebTourAction;
    locator: WebTourLocator;
    showWhen?: WebTourCondition;
    doneWhen?: WebTourCondition;
    /** The page Go and a start here open, set by the admin. */
    openUrl?: string;
    /** Only its markup is handed over; the picture itself travels as bytes. */
    picture?: { markup?: readonly TourMarkupShape[]; target?: unknown };
  };
}

/** A Message step (WEB_TOURS_CROSS_SITE.md X9): words only, no `web`. */
export interface HandoffMessageStep {
  id: string;
  label?: string;
  text?: string;
  message: true;
  web?: undefined;
}

export type HandoffStep = HandoffTargetStep | HandoffMessageStep;

const targetsOf = (steps: readonly HandoffStep[]): HandoffTargetStep[] =>
  steps.slice(0, MAX_STEPS).filter((s): s is HandoffTargetStep => !!s.web);

/** Where each sent picture's control sits, for Show me where's ring (MARKUP_PROTOCOL). */
export function handoffTargets(
  steps: readonly HandoffStep[],
  sent: ReadonlySet<string>
): Record<string, PictureTarget> | undefined {
  const out: Record<string, PictureTarget> = {};
  for (const step of targetsOf(steps)) {
    if (!sent.has(step.id)) continue;
    const t = parsePictureTarget(step.web.picture?.target);
    if (t) out[step.id] = t;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Picture markup by step id, for an extension that draws it (MARKUP_PROTOCOL); only for steps whose picture is sent. */
export function handoffMarkup(
  steps: readonly HandoffStep[],
  sent: ReadonlySet<string>
): Record<string, TourMarkupShape[]> | undefined {
  const out: Record<string, TourMarkupShape[]> = {};
  for (const step of targetsOf(steps)) {
    if (!sent.has(step.id)) continue;
    const shapes = parseMarkupShapes(step.web.picture?.markup ?? []);
    if (shapes?.length) out[step.id] = shapes;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A condition the extension accepts, or undefined (a bad address pattern is dropped). */
const handoffCondition = (
  c: WebTourCondition | undefined
): WebTourCondition | undefined =>
  !c
    ? undefined
    : c.kind === 'target'
      ? { kind: 'target' }
      : isHandoffPattern(c.pattern)
        ? { kind: 'url', pattern: c.pattern }
        : undefined;

/** Step conditions by id, for an extension that plays them (CONDITIONS_PROTOCOL); undefined when there are none. */
export function handoffConditions(
  steps: readonly HandoffStep[]
): Record<string, WebStepConditions> | undefined {
  const out: Record<string, WebStepConditions> = {};
  for (const step of targetsOf(steps)) {
    const showWhen = handoffCondition(step.web.showWhen);
    const doneWhen = handoffCondition(step.web.doneWhen);
    if (showWhen || doneWhen)
      out[step.id] = {
        ...(showWhen ? { showWhen } : {}),
        ...(doneWhen ? { doneWhen } : {}),
      };
  }
  return Object.keys(out).length > 0 ? out : undefined;
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

/** An admin-set page the extension can open: https, no wildcard; else null. */
export const openablePage = (v: string | undefined): string | null =>
  v && !v.includes('*') && isOpenableUrl(v.trim())
    ? new URL(v.trim()).href
    : null;

/** The step whose page a step opens on: itself, or for a Message step the next targeted step, else the last one before it. */
function pageStepOf(
  steps: readonly HandoffStep[],
  index: number
): { step: HandoffTargetStep; ahead: boolean } | undefined {
  const own = steps[index];
  if (!own) return undefined;
  if (own.web) return { step: own, ahead: true };
  const next = steps.slice(index + 1).find((s) => !!s.web);
  if (next) return { step: next, ahead: true };
  const before = steps
    .slice(0, index)
    .reverse()
    .find((s) => !!s.web);
  return before ? { step: before, ahead: false } : undefined;
}

/** The address a step pattern guesses: itself, or its site when the path has wildcards. */
function patternPage(pattern: string | undefined): string | null {
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

/** The page a step opens on: its set page, else its address, or its site when the path has wildcards. */
export function pageUrlOf(
  steps: readonly HandoffStep[],
  index: number
): string | null {
  const page = pageStepOf(steps, index);
  if (!page) return null;
  // A page set on the step before would reopen it, e.g. make another new file, so only a step ahead's counts.
  const set = page.ahead ? openablePage(page.step.web.openUrl) : null;
  return set ?? patternPage(page.step.web.urlPattern);
}

/** The page a tour opens on: the admin's start page, else the first targeted step's (X8). */
export const startUrlOf = (
  steps: readonly HandoffStep[],
  startPage?: string
): string | null => openablePage(startPage) ?? pageUrlOf(steps, 0);

/** The page a start at `index` opens: the tour's start page up to its first targeted step, then that step's page. */
export function startUrlAt(
  steps: readonly HandoffStep[],
  index: number,
  startPage?: string
): string | null {
  const first = steps.findIndex((s) => !!s.web);
  return first < 0 || index <= first
    ? startUrlOf(steps, startPage)
    : pageUrlOf(steps, index);
}

/** Set pages by step id, for an extension that opens them (OPEN_URL_PROTOCOL); undefined when there are none. */
export function handoffOpenUrls(
  steps: readonly HandoffStep[]
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const step of targetsOf(steps)) {
    const url = openablePage(step.web.openUrl);
    if (url) out[step.id] = url;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The tour as the extension takes it, with pictures until the per-picture and total caps. */
export function buildStartTour(
  setId: string,
  version: number,
  title: string,
  steps: readonly HandoffStep[],
  pictures: ReadonlyMap<string, WebTourPictureBytes>,
  scored = false,
  /** Only an extension at protocol 12 (CONDITIONS_PROTOCOL, MARKUP_PROTOCOL) accepts conditions and markup. */
  withConditions = false,
  /** Only an extension at OPEN_URL_PROTOCOL accepts set step pages. */
  withOpenUrls = false
): WebTourStartTour {
  let total = 0;
  const sent = new Set<string>();
  const conditions = withConditions ? handoffConditions(steps) : undefined;
  const tour: WebTourStartTour = {
    ...(conditions ? { conditions } : {}),
    setId,
    version,
    title: title.slice(0, MAX_TITLE),
    steps: steps.slice(0, MAX_STEPS).map((step): WebTourStartStep => {
      if (!step.web)
        return {
          id: step.id,
          label: (step.label ?? '').slice(0, MAX_TEXT),
          text: (step.text ?? '').slice(0, MAX_TEXT),
          message: true,
        };
      const { urlPattern, action, locator } = step.web;
      const pic = pictures.get(step.id);
      const sized = !!pic && pic.w > 0 && pic.h > 0;
      const data = pic && sized ? pic.data : '';
      const fits =
        sized &&
        data.length <= MAX_PICTURE_CHARS &&
        total + data.length <= MAX_PICTURE_TOTAL_CHARS;
      if (fits) {
        total += data.length;
        sent.add(step.id);
      }
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
  const markup = withConditions ? handoffMarkup(steps, sent) : undefined;
  const targets = withConditions ? handoffTargets(steps, sent) : undefined;
  const openUrls = withOpenUrls
    ? handoffOpenUrls(steps.slice(0, MAX_STEPS))
    : undefined;
  return {
    ...tour,
    ...(markup ? { markup } : {}),
    ...(targets ? { targets } : {}),
    ...(openUrls ? { openUrls } : {}),
  };
}
