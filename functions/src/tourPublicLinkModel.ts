// Public tour links (TOURS_10X.md S6): what a public Steps view shows and the confirmed picture fingerprint; tests/tourPublicLinkParity.test.ts keeps the app's copy equal.

/** The admin-only record per tour, at admin_settings/tour_public_links/tours/{setId}. */
export const PUBLIC_LINKS_DOC = 'admin_settings/tour_public_links';
export const PUBLIC_LINKS_SUBCOLLECTION = 'tours';
export const PUBLIC_TOKEN_RE = /^[0-9a-f]{32}$/;
export const PUBLIC_STEP_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
export const MAX_PUBLIC_STEPS = 200;
export const MAX_PUBLIC_PICTURE_BYTES = 8 * 1024 * 1024;
const MAX_MARKUP = 50;
const MAX_TEXT = 4000;
const WHOLE_BOARD_ANCHOR = 'board.whole';
const WEB_PICTURES_PREFIX = 'web_tour_pictures';
const LIVE_PICTURE_PATH =
  /^users\/[A-Za-z0-9_-]{1,128}\/hotspot_images\/[^/]{1,300}$/;

export type PublicTourKind = 'web' | 'live';
export type PublicLinkOffReason =
  'pictures' | 'unpublished' | 'confirmer' | 'admin';
const OFF_REASONS: readonly PublicLinkOffReason[] = [
  'pictures',
  'unpublished',
  'confirmer',
  'admin',
];
export const MAX_CONFIRMED_PICTURES = 400;

export interface PublicLinkRecord {
  token: string;
  fingerprint: string;
  kind: PublicTourKind;
  confirmedBy: string;
  confirmedAt: number;
  /** Each confirmed picture's Storage generation, by object path: the bytes the admin saw. */
  pictures: Record<string, string>;
  /** Why the link went off after the confirm; it stays off until confirmed again. */
  off?: { reason: PublicLinkOffReason; at: number };
}

export interface UnitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PublicMarkupShape =
  | {
      id: string;
      kind: 'arrow';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | { id: string; kind: 'box'; x: number; y: number; w: number; h: number }
  | { id: string; kind: 'number'; x: number; y: number; n: number };

export interface PublicStepPicture {
  w: number;
  h: number;
  cssW: number;
  target: UnitRect | null;
  markup?: PublicMarkupShape[];
}

export interface PublicStep {
  id: string;
  title: string;
  text: string;
  onlyIfAppears: boolean;
  observe: boolean;
  picture: PublicStepPicture | null;
  /** A Message step: words only. */
  message?: true;
  /** The host this step is on when the tour just moved there from another site. */
  continueOn?: string;
}

export interface PublicTour {
  kind: PublicTourKind;
  title: string;
  steps: PublicStep[];
}

/** A picture the function may read from the default bucket, by step id. */
export type PublicPictureSources = Map<string, string>;

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : NaN;
const unit = (v: unknown) => num(v) >= 0 && num(v) <= 1;

/** A step condition: one test, or a list of them (stepsModel.ts hasCondition). */
const hasCondition = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : !!v && typeof v === 'object';

const isWeb = (set: Rec) => set.surface === 'web';
const isLive = (set: Rec) => set.mode === 'tour' && !isWeb(set);
const stepsOf = (set: Rec): Rec[] =>
  Array.isArray(set.steps)
    ? set.steps.map(rec).filter((s): s is Rec => s !== null)
    : [];

// Same rounding and order as pictureChange.ts markupKey.
const shapeKey = (s: Rec): string => {
  const r = (n: unknown) => Math.round(num(n) * 10000) / 10000;
  if (s.kind === 'arrow')
    return `a:${r(s.x1)},${r(s.y1)},${r(s.x2)},${r(s.y2)}`;
  if (s.kind === 'box') return `b:${r(s.x)},${r(s.y)},${r(s.w)},${r(s.h)}`;
  if (s.kind === 'number') return `n:${r(s.x)},${r(s.y)},${String(s.n)}`;
  return '';
};
const markupKey = (markup: unknown): string =>
  (Array.isArray(markup) ? markup : [])
    .map((s) => (rec(s) ? shapeKey(rec(s) as Rec) : ''))
    .join(';');

/** A web step's picture, or null. */
const webPicture = (step: Rec): Rec | null => rec(rec(step.web)?.picture);

/** A Live step as it plays: a whole-board step plays without its anchor (tourSession.ts runStep). */
const liveTour = (step: Rec): Rec | null => {
  const tour = rec(step.tour);
  return tour && tour.anchor !== WHOLE_BOARD_ANCHOR ? tour : null;
};

/** A Live step's thumbnail with a url (liveTour.ts tourThumbnail). */
const liveThumb = (step: Rec): Rec | null => {
  const thumb = rec(liveTour(step)?.thumbnail);
  return thumb && str(thumb.url) ? thumb : null;
};

/** The picture URL a Live step shows (liveTour.ts freshTourPictureUrl). */
export function livePictureUrl(step: Rec, set: Rec): string | null {
  const thumb = liveThumb(step);
  if (thumb)
    return thumb.anchor === liveTour(step)?.anchor ? str(thumb.url) : null;
  const index = typeof step.imageIndex === 'number' ? step.imageIndex : 0;
  const urls = Array.isArray(set.imageUrls) ? set.imageUrls : [];
  const kinds = Array.isArray(set.imageKinds) ? set.imageKinds : [];
  const url = str(urls[index]);
  return url && kinds[index] !== 'video' ? url : null;
}

/** A web set's steps by the set's surface: targeted steps and Message steps, in order (components/tours/web/tourSequence.ts). */
const isMessage = (s: Rec) => s.message === true && !rec(s.web);
const webSteps = (set: Rec) =>
  stepsOf(set).filter((s) => !!rec(s.web) || isMessage(s));

/** A web urlPattern's host, lowercased with any port; null when it isn't an http(s) address (tourSequence.ts hostOf). */
const hostOf = (urlPattern: unknown): string | null => {
  const m = /^https?:\/\/([^/?#]+)/i.exec(str(urlPattern).trim());
  return m ? m[1].toLowerCase() : null;
};

/** The host each step is on when the tour just moved there from another site, by step index (tourSequence.ts siteSwitchesOf). */
const switchHosts = (steps: readonly Rec[]): Map<number, string> => {
  const out = new Map<number, string>();
  let prev: string | null = null;
  let seen = false;
  steps.forEach((step, i) => {
    const web = rec(step.web);
    if (!web) return;
    const host = hostOf(web.urlPattern);
    if (seen && prev && host && host !== prev) out.set(i, host);
    prev = host;
    seen = true;
  });
  return out;
};
const liveSteps = (set: Rec) => stepsOf(set).filter((s) => !s.web);

/** Every picture a reader of this published tour would see, as one comparable string; null when it isn't a tour. */
export function pictureFingerprint(published: unknown): string | null {
  const set = rec(published);
  if (!set) return null;
  let keys: string[];
  if (isWeb(set)) {
    keys = webSteps(set).flatMap((step) => {
      const pic = webPicture(step);
      const path = str(pic?.path);
      return path ? [`w ${path} ${markupKey(pic?.markup)}`] : [];
    });
  } else if (isLive(set)) {
    keys = liveSteps(set).flatMap((step) => {
      const url = livePictureUrl(step, set);
      return url ? [`l ${url}`] : [];
    });
  } else return null;
  return ['v1', ...[...new Set(keys)].sort()].join('\n');
}

export const kindOf = (published: unknown): PublicTourKind | null => {
  const set = rec(published);
  return !set ? null : isWeb(set) ? 'web' : isLive(set) ? 'live' : null;
};

// Mirrors components/tours/web/pictureTarget.ts stagePlacement, from geometry only.
const MARGIN_PX = 200;
const MIN_CROP = { w: 640, h: 360 };
const ASSUMED_VIEWPORT = { w: 1440, h: 900 };
const ASPECT_TOLERANCE = 0.04;
const MIN_FRAC = 0.005;
const MAX_FRAC = 0.95;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const rectOf = (v: unknown): UnitRect | null => {
  const r = rec(v);
  if (!r) return null;
  const [x, y, w, h] = [num(r.x), num(r.y), num(r.w), num(r.h)];
  return [x, y, w, h].every(Number.isFinite) ? { x, y, w, h } : null;
};

const plausible = (r: UnitRect) =>
  r.x >= 0 &&
  r.y >= 0 &&
  r.x + r.w <= 1 &&
  r.y + r.h <= 1 &&
  r.w >= MIN_FRAC &&
  r.h >= MIN_FRAC &&
  r.w <= MAX_FRAC &&
  r.h <= MAX_FRAC;

function estimateCrop(box: UnitRect) {
  const v = ASSUMED_VIEWPORT;
  const t = { x: box.x * v.w, y: box.y * v.h, w: box.w * v.w, h: box.h * v.h };
  const cw = Math.min(Math.max(t.w + 2 * MARGIN_PX, MIN_CROP.w), v.w);
  const ch = Math.min(Math.max(t.h + 2 * MARGIN_PX, MIN_CROP.h), v.h);
  const cx = clamp(t.x + t.w / 2 - cw / 2, 0, v.w - cw);
  const cy = clamp(t.y + t.h / 2 - ch / 2, 0, v.h - ch);
  return {
    cw,
    ch,
    rect: { x: (t.x - cx) / cw, y: (t.y - cy) / ch, w: t.w / cw, h: t.h / ch },
  };
}

function webPlacement(
  pic: Rec,
  box: UnitRect | null
): { rect: UnitRect | null; cssW: number } {
  const w = num(pic.w);
  const h = num(pic.h);
  const cssW = num(pic.cssW) > 0 ? num(pic.cssW) : NaN;
  const fallbackCss = Math.min(w, 1280);
  const recorded = rectOf(pic.target);
  if (recorded && plausible(recorded))
    return { rect: recorded, cssW: cssW || fallbackCss };
  if (box && box.w > 0 && box.h > 0 && w > 0 && h > 0) {
    const { cw, ch, rect } = estimateCrop(box);
    const aspect = cw / ch / (w / h);
    if (plausible(rect) && Math.abs(aspect - 1) <= ASPECT_TOLERANCE)
      return { rect, cssW: cssW || cw };
    return { rect: null, cssW: cssW || cw };
  }
  return { rect: null, cssW: cssW || fallbackCss };
}

function markupOf(v: unknown): PublicMarkupShape[] {
  if (!Array.isArray(v)) return [];
  const out: PublicMarkupShape[] = [];
  for (const raw of v.slice(0, MAX_MARKUP)) {
    const s = rec(raw);
    const id = str(s?.id).slice(0, 64);
    if (!s || !id) continue;
    if (s.kind === 'arrow' && [s.x1, s.y1, s.x2, s.y2].every(unit))
      out.push({
        id,
        kind: 'arrow',
        x1: num(s.x1),
        y1: num(s.y1),
        x2: num(s.x2),
        y2: num(s.y2),
      });
    else if (s.kind === 'box' && [s.x, s.y, s.w, s.h].every(unit))
      out.push({
        id,
        kind: 'box',
        x: num(s.x),
        y: num(s.y),
        w: num(s.w),
        h: num(s.h),
      });
    else if (
      s.kind === 'number' &&
      [s.x, s.y].every(unit) &&
      Number.isInteger(s.n) &&
      num(s.n) >= 1 &&
      num(s.n) <= 99
    )
      out.push({ id, kind: 'number', x: num(s.x), y: num(s.y), n: num(s.n) });
  }
  return out;
}

const isWebPicturePath = (setId: string, path: string) => {
  const prefix = `${WEB_PICTURES_PREFIX}/${setId}/`;
  return (
    setId.length > 0 &&
    !setId.includes('/') &&
    path.startsWith(prefix) &&
    path.length > prefix.length &&
    !path.slice(prefix.length).includes('/')
  );
};

/** The object path of a Firebase Storage download URL in `bucket`, limited to tour thumbnail folders. */
export function livePicturePath(url: string, bucket: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'firebasestorage.googleapis.com'
  )
    return null;
  const m = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(parsed.pathname);
  if (!m || m[1] !== bucket) return null;
  let path: string;
  try {
    path = decodeURIComponent(m[2]);
  } catch {
    return null;
  }
  return LIVE_PICTURE_PATH.test(path) && !path.includes('..') ? path : null;
}

const text = (v: unknown) => str(v).slice(0, MAX_TEXT);
const title = (v: unknown) => str(v).slice(0, 300);

/** The published tour as the public page draws it, and where each step's picture is read from; null when it can't be served. */
export function publicTourOf(
  setId: string,
  published: unknown,
  bucket: string
): { tour: PublicTour; sources: PublicPictureSources } | null {
  const set = rec(published);
  const kind = kindOf(set);
  if (!set || !kind) return null;
  const sources: PublicPictureSources = new Map();
  const raw = kind === 'web' ? webSteps(set) : liveSteps(set);
  if (raw.length > MAX_PUBLIC_STEPS) return null;
  const steps: PublicStep[] = [];
  const served = raw.filter((s) => PUBLIC_STEP_ID_RE.test(str(s.id)));
  const joins =
    kind === 'web' ? switchHosts(served) : new Map<number, string>();
  for (const [at, step] of served.entries()) {
    const id = str(step.id);
    let picture: PublicStepPicture | null = null;
    let onlyIfAppears: boolean;
    let observe: boolean;
    if (kind === 'web' && isMessage(step)) {
      onlyIfAppears = false;
      observe = false;
    } else if (kind === 'web') {
      const web = rec(step.web) as Rec;
      onlyIfAppears = hasCondition(web.showWhen);
      observe = web.action === 'observe';
      const pic = webPicture(step);
      const path = str(pic?.path);
      if (
        pic &&
        num(pic.w) > 0 &&
        num(pic.h) > 0 &&
        isWebPicturePath(setId, path)
      ) {
        const placed = webPlacement(pic, rectOf(rec(web.locator)?.box));
        const markup = markupOf(pic.markup);
        picture = {
          w: num(pic.w),
          h: num(pic.h),
          cssW: placed.cssW,
          target: placed.rect,
          ...(markup.length ? { markup } : {}),
        };
        sources.set(id, path);
      }
    } else {
      const tour = liveTour(step);
      onlyIfAppears = hasCondition(tour?.showWhen);
      observe = tour?.action === 'observe';
      const url = livePictureUrl(step, set);
      const path = url ? livePicturePath(url, bucket) : null;
      if (path) {
        const thumb = liveThumb(step);
        const w = num(thumb?.w) > 0 ? num(thumb?.w) : 0;
        const h = num(thumb?.h) > 0 ? num(thumb?.h) : 0;
        const t = rectOf(thumb?.target);
        picture = {
          w,
          h,
          cssW: w,
          target: t && t.w > 0 && t.h > 0 ? t : null,
        };
        sources.set(id, path);
      }
    }
    steps.push({
      id,
      title: title(step.label),
      text: text(step.text),
      onlyIfAppears,
      observe,
      picture,
      ...(kind === 'web' && isMessage(step) ? { message: true as const } : {}),
      ...(joins.get(at) ? { continueOn: joins.get(at) } : {}),
    });
  }
  return { tour: { kind, title: title(set.title), steps }, sources };
}

/** A stored record, or null when it is malformed. */
export function parseLinkRecord(v: unknown): PublicLinkRecord | null {
  const r = rec(v);
  if (!r) return null;
  const kind = r.kind === 'web' || r.kind === 'live' ? r.kind : null;
  if (
    !PUBLIC_TOKEN_RE.test(str(r.token)) ||
    !str(r.fingerprint) ||
    !kind ||
    !str(r.confirmedBy)
  )
    return null;
  const off = rec(r.off);
  const raw = Object.entries(rec(r.pictures) ?? {});
  if (raw.length > MAX_CONFIRMED_PICTURES) return null;
  const pictures: Record<string, string> = {};
  for (const [path, generation] of raw)
    if (typeof generation === 'string' && generation)
      pictures[path] = generation;
  const reason = OFF_REASONS.find((r) => r === off?.reason) ?? 'pictures';
  return {
    token: str(r.token),
    fingerprint: str(r.fingerprint),
    kind,
    confirmedBy: str(r.confirmedBy).toLowerCase(),
    confirmedAt: num(r.confirmedAt) || 0,
    pictures,
    ...(off ? { off: { reason, at: num(off.at) || 0 } } : {}),
  };
}

/** The image type the bytes really are; anything else is refused. */
export function sniffImage(
  b: Uint8Array
): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'image/webp';
  return null;
}
