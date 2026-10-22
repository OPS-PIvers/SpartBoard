// What the service worker asks the overlay to draw; checked like any other message (D3).

export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayState {
  title: string;
  /** Plain text, never HTML. */
  text: string;
  current: number;
  total: number;
  /** The matched target in viewport px, or null while it isn't found. */
  rect: OverlayRect | null;
}

export type OverlayAction = 'next' | 'back' | 'exit';

const MAX_TEXT = 4000;

const isText = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max;
const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const isCount = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 500;

const hasExactKeys = (o: object, keys: readonly string[]) => {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => own.includes(k));
};

function parseRect(raw: unknown): OverlayRect | null | undefined {
  if (raw === null) return null;
  if (
    typeof raw !== 'object' ||
    !hasExactKeys(raw, ['x', 'y', 'width', 'height'])
  ) {
    return undefined;
  }
  const { x, y, width, height } = raw as Record<string, unknown>;
  if (!isNum(x) || !isNum(y) || !isNum(width) || !isNum(height))
    return undefined;
  if (width < 0 || height < 0) return undefined;
  return { x, y, width, height };
}

/** The overlay state, or null when the payload doesn't match the schema exactly. */
export function parseOverlayState(raw: unknown): OverlayState | null {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !hasExactKeys(raw, ['title', 'text', 'current', 'total', 'rect'])
  ) {
    return null;
  }
  const { title, text, current, total, rect } = raw as Record<string, unknown>;
  const parsedRect = parseRect(rect);
  if (
    !isText(title, 200) ||
    !isText(text, MAX_TEXT) ||
    !isCount(current) ||
    !isCount(total) ||
    current < 1 ||
    current > total ||
    parsedRect === undefined
  ) {
    return null;
  }
  return { title, text, current, total, rect: parsedRect };
}
