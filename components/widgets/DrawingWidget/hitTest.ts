import {
  ArrowObject,
  DrawableObject,
  EllipseObject,
  ImageObject,
  LineObject,
  PathObject,
  Point,
  RectObject,
  TextObject,
} from '@/types';

// Pure hit-testing for the selection tool. All functions take canvas-space
// coordinates (the same space stored on DrawableObjects) and return either
// the hit object or a discriminator.

/** Tolerance (in canvas px) added to stroke-proximity tests so thin paths
 *  remain selectable. Matches the Phase 2 design spec §2.1c. */
const STROKE_HIT_PADDING = 4;

/** The 8 resize handles + the rotation handle. Names match the cardinal
 *  + ordinal compass points, plus 'rotate'. */
export type HandleName =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'rotate';

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Axis-aligned bounding box for any DrawableObject. Used by both the
 * selection chrome renderer and the hit-test pass. Line/arrow are
 * normalized so x/y are the min coords and w/h are non-negative.
 */
export const getBoundingBox = (obj: DrawableObject): BoundingBox => {
  switch (obj.kind) {
    case 'rect':
    case 'ellipse':
    case 'text':
    case 'image':
      return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    case 'line':
    case 'arrow':
      return {
        x: Math.min(obj.x1, obj.x2),
        y: Math.min(obj.y1, obj.y2),
        w: Math.abs(obj.x2 - obj.x1),
        h: Math.abs(obj.y2 - obj.y1),
      };
    case 'path': {
      if (obj.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = obj.points[0].x;
      let maxX = obj.points[0].x;
      let minY = obj.points[0].y;
      let maxY = obj.points[0].y;
      for (let i = 1; i < obj.points.length; i++) {
        const p = obj.points[i];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
  }
};

const distanceToSegment = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ddx = p.x - a.x;
    const ddy = p.y - a.y;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  // Project p onto the segment, clamped to [0, 1].
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const ddx = p.x - projX;
  const ddy = p.y - projY;
  return Math.sqrt(ddx * ddx + ddy * ddy);
};

const hitPath = (obj: PathObject, p: Point): boolean => {
  if (obj.points.length < 2) return false;
  const tolerance = obj.width / 2 + STROKE_HIT_PADDING;
  for (let i = 1; i < obj.points.length; i++) {
    if (distanceToSegment(p, obj.points[i - 1], obj.points[i]) <= tolerance) {
      return true;
    }
  }
  return false;
};

const hitLineLike = (obj: LineObject | ArrowObject, p: Point): boolean => {
  const tolerance = obj.strokeWidth / 2 + STROKE_HIT_PADDING;
  return (
    distanceToSegment(p, { x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }) <=
    tolerance
  );
};

const hitBbox = (
  obj: RectObject | TextObject | ImageObject,
  p: Point
): boolean =>
  p.x >= obj.x && p.x <= obj.x + obj.w && p.y >= obj.y && p.y <= obj.y + obj.h;

const hitEllipse = (obj: EllipseObject, p: Point): boolean => {
  const rx = obj.w / 2;
  const ry = obj.h / 2;
  if (rx === 0 || ry === 0) return false;
  const cx = obj.x + rx;
  const cy = obj.y + ry;
  const dx = (p.x - cx) / rx;
  const dy = (p.y - cy) / ry;
  return dx * dx + dy * dy <= 1;
};

/**
 * Hit-test a single object. Per-kind: shapes/text/image use bbox containment,
 * ellipse refines to the implicit-equation test, path/line/arrow use
 * stroke-proximity.
 */
export const hitTestObject = (obj: DrawableObject, p: Point): boolean => {
  switch (obj.kind) {
    case 'path':
      return hitPath(obj, p);
    case 'rect':
    case 'text':
    case 'image':
      return hitBbox(obj, p);
    case 'ellipse':
      return hitEllipse(obj, p);
    case 'line':
    case 'arrow':
      return hitLineLike(obj, p);
  }
};

/**
 * Iterate `objects` in reverse z-order (top-most first) and return the first
 * hit, or `null` if no object contains the point. Matches the "later object
 * wins" convention used by the renderer's draw pass.
 */
export const hitTestObjects = (
  objects: readonly DrawableObject[],
  p: Point
): DrawableObject | null => {
  const sorted = [...objects].sort((a, b) => b.z - a.z);
  for (const obj of sorted) {
    if (hitTestObject(obj, p)) return obj;
  }
  return null;
};

/**
 * Pixel size of a resize handle on screen. Multiplied by `1/scale` at the
 * call site so handles stay pointer-friendly at any canvas zoom. Square
 * resize handles are HANDLE_SIZE wide; the rotation handle is a circle of
 * the same diameter.
 */
export const HANDLE_SIZE = 10;
/** Distance (canvas px at 1× scale) from the bbox top edge to the rotation
 *  handle center. */
export const ROTATION_HANDLE_OFFSET = 24;

/**
 * Center coordinates for each of the 8 resize handles + the rotation handle.
 * Returns the same names used by `HandleName`. Coordinates are in canvas
 * space (no scaling applied).
 */
export const getHandlePositions = (
  bbox: BoundingBox
): Record<HandleName, Point> => {
  const { x, y, w, h } = bbox;
  const midX = x + w / 2;
  const midY = y + h / 2;
  return {
    nw: { x, y },
    n: { x: midX, y },
    ne: { x: x + w, y },
    e: { x: x + w, y: midY },
    se: { x: x + w, y: y + h },
    s: { x: midX, y: y + h },
    sw: { x, y: y + h },
    w: { x, y: midY },
    rotate: { x: midX, y: y - ROTATION_HANDLE_OFFSET },
  };
};

/**
 * Identify which handle (if any) sits under the given point. `scale` is the
 * current canvas-to-screen scale so a 10px screen handle still resolves to a
 * proportional canvas-space hit region. Handles take precedence over object
 * body hits — call this before `hitTestObjects` when an object is already
 * selected.
 */
export const hitTestHandle = (
  obj: DrawableObject,
  p: Point,
  scale: number
): HandleName | null => {
  const bbox = getBoundingBox(obj);
  const positions = getHandlePositions(bbox);
  // Handle hit region is a square of half-side = HANDLE_SIZE / scale. We add
  // a small padding (in canvas px) so the very-zoomed-out case still has a
  // pointer-friendly target without the handles overlapping each other.
  const half = (HANDLE_SIZE / Math.max(scale, 0.0001)) * 0.75;
  // Rotation handle uses a slightly larger radius for the same reason.
  const rotateRadius = (HANDLE_SIZE / Math.max(scale, 0.0001)) * 1.1;
  // Test rotation FIRST so it wins over the adjacent 'n' handle if both are
  // under the cursor (the rotation handle sits directly above 'n').
  {
    const rp = positions.rotate;
    const ddx = p.x - rp.x;
    const ddy = p.y - rp.y;
    if (ddx * ddx + ddy * ddy <= rotateRadius * rotateRadius) {
      return 'rotate';
    }
  }
  const handleOrder: HandleName[] = [
    'nw',
    'ne',
    'se',
    'sw',
    'n',
    'e',
    's',
    'w',
  ];
  for (const name of handleOrder) {
    const hp = positions[name];
    if (
      p.x >= hp.x - half &&
      p.x <= hp.x + half &&
      p.y >= hp.y - half &&
      p.y <= hp.y + half
    ) {
      return name;
    }
  }
  return null;
};
