// What the service worker asks the overlay to draw; checked like any other message (D3).
import type { WebTourPictureBytes } from '@/components/tours/web/extensionProtocol';

export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type OverlayStatus =
  'wrong-page' | 'seeking' | 'shown' | 'fallback' | 'done';

export interface OverlayState {
  title: string;
  /** Plain text, never HTML. */
  text: string;
  current: number;
  total: number;
  status: OverlayStatus;
  /** `top` draws the bar and tip; `target` is a frame holding the target and draws only the spotlight. */
  role: 'top' | 'target';
  /** The target is in this frame, so this overlay lights it. */
  targetHere: boolean;
  /** Learner presses Next instead of acting on the target. */
  observe: boolean;
  picture: WebTourPictureBytes | null;
}

export type OverlayAction = 'next' | 'back' | 'exit';

const MAX_TEXT = 4000;
const STATUSES: readonly OverlayStatus[] = [
  'wrong-page',
  'seeking',
  'shown',
  'fallback',
  'done',
];
const MIMES: readonly WebTourPictureBytes['mime'][] = [
  'image/png',
  'image/jpeg',
  'image/webp',
];

const isText = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max;
const isCount = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 500;

const hasExactKeys = (o: object, keys: readonly string[]) => {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => own.includes(k));
};

function parsePicture(raw: unknown): WebTourPictureBytes | null | undefined {
  if (raw === null) return null;
  if (
    typeof raw !== 'object' ||
    !hasExactKeys(raw, ['mime', 'data', 'w', 'h'])
  ) {
    return undefined;
  }
  const { mime, data, w, h } = raw as Record<string, unknown>;
  const m = MIMES.find((x) => x === mime);
  if (!m || typeof data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data))
    return undefined;
  if (typeof w !== 'number' || typeof h !== 'number' || !(w > 0 && h > 0))
    return undefined;
  return { mime: m, data, w, h };
}

const KEYS = [
  'title',
  'text',
  'current',
  'total',
  'status',
  'role',
  'targetHere',
  'observe',
  'picture',
];

/** The overlay state, or null when the payload doesn't match the schema exactly. */
export function parseOverlayState(raw: unknown): OverlayState | null {
  if (typeof raw !== 'object' || raw === null || !hasExactKeys(raw, KEYS)) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const status = STATUSES.find((s) => s === r.status);
  const picture = parsePicture(r.picture);
  if (
    !isText(r.title, 200) ||
    !isText(r.text, MAX_TEXT) ||
    !isCount(r.current) ||
    !isCount(r.total) ||
    r.current < 1 ||
    r.current > r.total ||
    !status ||
    (r.role !== 'top' && r.role !== 'target') ||
    typeof r.targetHere !== 'boolean' ||
    typeof r.observe !== 'boolean' ||
    picture === undefined
  ) {
    return null;
  }
  return {
    title: r.title,
    text: r.text,
    current: r.current,
    total: r.total,
    status,
    role: r.role,
    targetHere: r.targetHere,
    observe: r.observe,
    picture,
  };
}
