import type {
  RecordingConfig,
  RecordingPrepExpiry,
  WhiteboardInkStroke,
  WhiteboardPlacedImage,
  WhiteboardShapeKind,
  WhiteboardStartingImage,
  WhiteboardStartingPage,
  WhiteboardStartingPattern,
} from '@/types';
import { WHITEBOARD_PAGE } from '@/components/quiz/whiteboard/whiteboardLogTypes';

export const DEFAULT_PREP_SECONDS = 30;
export const DEFAULT_LIMIT_SECONDS = 60;
/** Audio ceiling (RR-A1 sub-decision 8). Video/whiteboard ceilings are not built. */
export const AUDIO_LIMIT_SECONDS_MAX = 300;
export const AUDIO_LIMIT_SECONDS_MIN = 5;
export const PREP_SECONDS_MAX = 300;
/** Whiteboard default take length (QUIZ_WHITEBOARD_RESPONSE D3); its ceiling is audio's. */
export const WHITEBOARD_DEFAULT_LIMIT_SECONDS = 180;
/** Polygon side bounds for a whiteboard starting shape. */
export const WHITEBOARD_POLYGON_SIDES_MIN = 3;
export const WHITEBOARD_POLYGON_SIDES_MAX = 12;
/** Starting page caps: placed images, teacher ink strokes and their total points. */
export const WHITEBOARD_STARTING_IMAGES_MAX = 6;
export const WHITEBOARD_INK_STROKES_MAX = 200;
export const WHITEBOARD_INK_POINTS_MAX = 6_000;
const INK_SIZE_MAX = 64;
const INK_COLOR = /^#[0-9a-fA-F]{3,8}$/;

/** Fraction of the limit spent in the wrap-up stretch; no grace tail follows it. */
export const WRAP_UP_FRACTION = 0.1;
/** Wrap-up never opens later than this, so a short take still gets a warning. */
export const WRAP_UP_MIN_SECONDS = 5;

const PREP_EXPIRY_VALUES: RecordingPrepExpiry[] = ['auto-start', 'armed'];
/** Retired choices that ended the question before the student could record; they now start recording. */
const RETIRED_PREP_EXPIRY: RecordingPrepExpiry[] = [
  'auto-advance',
  'unanswered',
];

/** The two choices the editor offers; a retired stored value reads as auto-start. */
export function effectivePrepExpiry(
  value: RecordingPrepExpiry | undefined
): RecordingPrepExpiry {
  if (value && RETIRED_PREP_EXPIRY.includes(value)) return 'auto-start';
  return value && PREP_EXPIRY_VALUES.includes(value)
    ? value
    : DEFAULT_RECORDING_CONFIG.prepExpiry;
}

export const DEFAULT_RECORDING_CONFIG: RecordingConfig = {
  prepSeconds: DEFAULT_PREP_SECONDS,
  limitSeconds: DEFAULT_LIMIT_SECONDS,
  prepExpiry: 'armed',
  takeLimit: null,
};

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Seconds at which the wrap-up warning opens for a given limit. */
export function wrapUpThresholdSeconds(limitSeconds: number): number {
  const tenth = Math.round(limitSeconds * WRAP_UP_FRACTION);
  return Math.min(limitSeconds, Math.max(WRAP_UP_MIN_SECONDS, tenth));
}

/**
 * Coerces a stored/authored block into a usable one. Returns `undefined` for
 * absent input so a legacy question stays legacy — never synthesise a block.
 * The rebuilt object drops the authoring-only `priorTimeLimit` by design.
 */
export function normalizeRecordingConfig(
  raw: Partial<RecordingConfig> | undefined | null
): RecordingConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const prepExpiry = effectivePrepExpiry(raw.prepExpiry);
  const takeLimit =
    typeof raw.takeLimit === 'number' && Number.isFinite(raw.takeLimit)
      ? Math.max(1, Math.round(raw.takeLimit))
      : null;
  const config: RecordingConfig = {
    prepSeconds: clampInt(
      raw.prepSeconds,
      0,
      PREP_SECONDS_MAX,
      DEFAULT_PREP_SECONDS
    ),
    limitSeconds: clampInt(
      raw.limitSeconds,
      AUDIO_LIMIT_SECONDS_MIN,
      AUDIO_LIMIT_SECONDS_MAX,
      DEFAULT_LIMIT_SECONDS
    ),
    prepExpiry,
    takeLimit,
  };
  // Optional keys are omitted when absent, so a legacy block round-trips unchanged.
  if (raw.mode === 'whiteboard' || raw.mode === 'audio') config.mode = raw.mode;
  if (typeof raw.explainAloud === 'boolean') {
    config.explainAloud = raw.explainAloud;
  }
  if (typeof raw.review === 'boolean') config.review = raw.review;
  const startingPage = normalizeWhiteboardStartingPage(raw.startingPage);
  if (startingPage) config.startingPage = startingPage;
  return config;
}

/** `true` unless the block explicitly turned review off (D5). */
export function recordingReviewEnabled(config: RecordingConfig): boolean {
  return config.review !== false;
}

/** True when the block is a whiteboard question (absent mode means audio, C5). */
export function isWhiteboardRecording(
  config: RecordingConfig | undefined
): boolean {
  return config?.mode === 'whiteboard';
}

/** Whiteboard questions use the mic unless the teacher made them draw-only (D2). */
export function whiteboardUsesMic(config: RecordingConfig): boolean {
  return config.explainAloud !== false;
}

const SHAPE_KINDS: WhiteboardShapeKind[] = [
  'triangle',
  'rectangle',
  'circle',
  'polygon',
];

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Ordered `[lo, hi]` with a non-empty span; a reversed or empty range falls back. */
function orderedRange(
  lo: unknown,
  hi: unknown,
  fallback: [number, number]
): [number, number] {
  const a = finiteOr(lo, fallback[0]);
  const b = finiteOr(hi, fallback[1]);
  return a < b ? [a, b] : fallback;
}

function normalizePattern(raw: unknown): WhiteboardStartingPattern {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  switch (p.kind) {
    case 'grid':
    case 'lines':
    case 'dots':
      return { kind: p.kind };
    case 'coordinate-plane': {
      const [xMin, xMax] = orderedRange(p.xMin, p.xMax, [-10, 10]);
      const [yMin, yMax] = orderedRange(p.yMin, p.yMax, [-10, 10]);
      return { kind: 'coordinate-plane', xMin, xMax, yMin, yMax };
    }
    case 'number-line': {
      const [min, max] = orderedRange(p.min, p.max, [0, 10]);
      const step = finiteOr(p.step, 1);
      const span = max - min;
      // At most 100 ticks keeps the line legible; a bad step falls back to 1/10 of the span.
      const safeStep = step > 0 && span / step <= 100 ? step : span / 10;
      return { kind: 'number-line', min, max, step: safeStep };
    }
    case 'shape': {
      const shape = SHAPE_KINDS.includes(p.shape as WhiteboardShapeKind)
        ? (p.shape as WhiteboardShapeKind)
        : 'rectangle';
      if (shape !== 'polygon') return { kind: 'shape', shape };
      return {
        kind: 'shape',
        shape,
        sides: clampInt(
          p.sides,
          WHITEBOARD_POLYGON_SIDES_MIN,
          WHITEBOARD_POLYGON_SIDES_MAX,
          6
        ),
      };
    }
    default:
      return { kind: 'blank' };
  }
}

const DRIVE_FILE_ID = /^[A-Za-z0-9_-]+$/;
const STARTING_IMAGE_HOSTS = ['drive.google.com', 'lh3.googleusercontent.com'];

/** Students load this URL, so only the Drive hosts the stimulus upload produces pass. */
function isGoogleImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' && STARTING_IMAGE_HOSTS.includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function normalizeStartingImage(raw: unknown): WhiteboardStartingImage | null {
  const img = (raw && typeof raw === 'object' ? raw : null) as Record<
    string,
    unknown
  > | null;
  if (
    !img ||
    typeof img.driveFileId !== 'string' ||
    !DRIVE_FILE_ID.test(img.driveFileId) ||
    typeof img.url !== 'string' ||
    !isGoogleImageUrl(img.url) ||
    typeof img.mimeType !== 'string' ||
    !(finiteOr(img.width, 0) > 0) ||
    !(finiteOr(img.height, 0) > 0)
  ) {
    return null;
  }
  return {
    driveFileId: img.driveFileId,
    url: img.url,
    mimeType: img.mimeType,
    width: img.width as number,
    height: img.height as number,
  };
}

/** Shrinks a rect to fit the page, keeping its aspect ratio, then slides it inside. */
export function clampPlacedRect<
  T extends { x: number; y: number; w: number; h: number },
>(rect: T): T {
  const s = Math.min(1, WHITEBOARD_PAGE.w / rect.w, WHITEBOARD_PAGE.h / rect.h);
  const w = rect.w * s;
  const h = rect.h * s;
  return {
    ...rect,
    w,
    h,
    x: Math.min(Math.max(0, rect.x), WHITEBOARD_PAGE.w - w),
    y: Math.min(Math.max(0, rect.y), WHITEBOARD_PAGE.h - h),
  };
}

function normalizePlacedImage(raw: unknown): WhiteboardPlacedImage | null {
  const base = normalizeStartingImage(raw);
  if (!base) return null;
  const r = raw as Record<string, unknown>;
  const w = finiteOr(r.w, 0);
  const h = finiteOr(r.h, 0);
  if (!(w > 0) || !(h > 0)) return null;
  return clampPlacedRect({
    ...base,
    x: finiteOr(r.x, 0),
    y: finiteOr(r.y, 0),
    w,
    h,
  });
}

const clampTo = (v: number, max: number) =>
  Math.min(max, Math.max(0, Math.round(v)));

/** Valid strokes with integer points on the page, within the stroke and point caps. */
export function limitStartingInk(raw: unknown): WhiteboardInkStroke[] {
  if (!Array.isArray(raw)) return [];
  const out: WhiteboardInkStroke[] = [];
  let total = 0;
  for (const item of raw) {
    if (out.length >= WHITEBOARD_INK_STROKES_MAX) break;
    const s = (item && typeof item === 'object' ? item : {}) as Record<
      string,
      unknown
    >;
    if (typeof s.color !== 'string' || !INK_COLOR.test(s.color)) continue;
    if (!Array.isArray(s.points)) continue;
    const pts: number[] = [];
    for (let i = 0; i + 1 < s.points.length; i += 2) {
      const x: unknown = s.points[i];
      const y: unknown = s.points[i + 1];
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      pts.push(clampTo(x, WHITEBOARD_PAGE.w), clampTo(y, WHITEBOARD_PAGE.h));
    }
    if (pts.length < 2) continue;
    if (total + pts.length / 2 > WHITEBOARD_INK_POINTS_MAX) break;
    total += pts.length / 2;
    out.push({
      color: s.color,
      size: Math.min(INK_SIZE_MAX, Math.max(1, finiteOr(s.size, 4))),
      points: pts,
    });
  }
  return out;
}

/** Coerces a stored starting page; `undefined` for absent input (a blank page). */
export function normalizeWhiteboardStartingPage(
  raw: unknown
): WhiteboardStartingPage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as {
    pattern?: unknown;
    image?: unknown;
    images?: unknown;
    ink?: unknown;
  };
  const page: WhiteboardStartingPage = { pattern: normalizePattern(r.pattern) };
  if (Array.isArray(r.images)) {
    const images = r.images
      .map(normalizePlacedImage)
      .filter((img): img is WhiteboardPlacedImage => img !== null)
      .slice(0, WHITEBOARD_STARTING_IMAGES_MAX);
    if (images.length > 0) page.images = images;
  } else {
    const image = normalizeStartingImage(r.image);
    if (image) page.image = image;
  }
  const ink = limitStartingInk(r.ink);
  if (ink.length > 0) page.ink = ink;
  return page;
}

/** Advisory only — the archival callable is the authoritative `takeLimit` gate. */
export function takesRemaining(
  config: RecordingConfig,
  takesCommitted: number
): number | null {
  if (config.takeLimit == null) return null;
  return Math.max(0, config.takeLimit - takesCommitted);
}
