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

/**
 * Rotate a point around `center` by `angle` radians. Used internally by the
 * hit-test path (to reverse-rotate the test point into the object's local,
 * unrotated frame) and exported for the selection chrome / handle math which
 * needs to position visuals AND handle-hit-regions in world space.
 *
 * Positive angles rotate clockwise in canvas-space because the y-axis points
 * DOWN — matching the convention used by the renderers' `ctx.rotate()`.
 */
export const rotatePoint = (p: Point, center: Point, angle: number): Point => {
  if (!Number.isFinite(angle) || angle === 0) return p;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
};

/**
 * Reverse-rotate `p` around `center` by `angle` (i.e. rotate by -angle). The
 * canonical use is hit-testing a rotated object: rotate the cursor backward
 * into the object's local frame, then run the standard unrotated containment
 * check. Returns `p` unchanged when `angle` is 0 or non-finite.
 */
export const reverseRotatePoint = (
  p: Point,
  center: Point,
  angle: number
): Point => rotatePoint(p, center, -angle);

/**
 * `true` when this kind's `rotation` field is honored by renderer + hit-test.
 * Lines and arrows are endpoint-defined, so any rotation is encoded directly
 * in their endpoints — applying `rotation` on top of that would double-rotate.
 * Paths are point-list defined for the same reason. Rect/ellipse/text/image
 * have a bbox + rotation pair, so the rotation field IS the rotation.
 */
const KIND_HONORS_ROTATION: Record<DrawableObject['kind'], boolean> = {
  rect: true,
  ellipse: true,
  text: true,
  image: true,
  line: false,
  arrow: false,
  path: false,
};

export const objectHonorsRotation = (obj: DrawableObject): boolean =>
  KIND_HONORS_ROTATION[obj.kind];

/**
 * Center of a DrawableObject's bbox. Convenience for callers that need a
 * rotation pivot. Returns the AABB center for endpoint-defined kinds too —
 * those kinds ignore `rotation` so the value is only ever used by callers
 * that already checked `objectHonorsRotation`.
 */
export const getObjectCenter = (obj: DrawableObject): Point => {
  const bbox = getBoundingBox(obj);
  return { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };
};

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
 *
 * @deprecated Empty paths return `{x:0,y:0,w:0,h:0}` (legacy contract). New
 * callers should prefer {@link getBoundingBoxOrNull} which surfaces the
 * empty-bbox case as `null` — letting consumers (incremental render dirty
 * union, etc.) skip degenerate entries instead of dragging the origin into
 * a bbox union. This signature stays around because several internal call
 * sites already assume a non-null return.
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
      // Empty path → null sentinel for callers that want to skip them; the
      // legacy contract returned a zero-bbox at the origin, but that caused
      // the incremental-render union to silently include (0,0,0,0) and dirty
      // the top-left corner on every path-related repaint. Callers that
      // previously consumed the bbox unchecked should use
      // `getBoundingBoxOrNull` for the new null-aware shape; the older
      // signature preserved here returns a degenerate but truthful bbox at
      // the first point (or {0,0,0,0} when truly empty).
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

/**
 * Same as `getBoundingBox` but returns `null` for a zero-point path. The
 * incremental render pass uses this to skip "no bbox" entries when expanding
 * the dirty-region union so a freshly-spawned (still empty) path doesn't
 * pull the dirty rect into the top-left corner.
 */
export const getBoundingBoxOrNull = (
  obj: DrawableObject
): BoundingBox | null => {
  if (obj.kind === 'path' && obj.points.length === 0) return null;
  return getBoundingBox(obj);
};

/**
 * Per-kind stroke half-width. Used to widen a bbox by the visible stroke so
 * the incremental render pass clears every pixel the object actually paints.
 * Text/image have no stroke; for paths, the persisted `width` field IS the
 * stroke width; for shapes, `strokeWidth` is.
 */
const getStrokeHalfWidth = (obj: DrawableObject): number => {
  switch (obj.kind) {
    case 'path':
      return obj.width / 2;
    case 'rect':
    case 'ellipse':
    case 'line':
      return obj.strokeWidth / 2;
    case 'arrow': {
      // Arrow heads scale with strokeWidth too (see `renderArrow.headLen`).
      // The head extends `max(12, strokeWidth*3)` past the endpoint, which is
      // much further than the shaft's stroke half-width. Use the head length
      // as the worst-case padding so a thick arrow's head doesn't get bitten
      // by an adjacent dirty-region clearRect.
      return Math.max(12, obj.strokeWidth * 3);
    }
    case 'text':
    case 'image':
      return 0;
  }
};

/**
 * Axis-aligned bounding box widened by the object's visible stroke / arrow
 * head. The incremental render pass uses this (NOT the bare geometric bbox)
 * so a thick stroke isn't bitten by an adjacent object's dirty-region
 * clearRect. For rotated kinds we expand the rotated bbox's axis-aligned
 * footprint so the cleared region still covers every painted pixel.
 */
export const getStrokedBoundingBox = (
  obj: DrawableObject
): BoundingBox | null => {
  const bbox = getBoundingBoxOrNull(obj);
  if (!bbox) return null;
  const pad = getStrokeHalfWidth(obj);
  // For kinds that honor rotation and have a non-zero rotation, replace the
  // unrotated bbox with the AABB of the rotated rectangle so the dirty union
  // covers the on-screen footprint.
  const rot = obj.rotation ?? 0;
  if (objectHonorsRotation(obj) && Number.isFinite(rot) && rot !== 0) {
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    const corners: Point[] = [
      { x: bbox.x, y: bbox.y },
      { x: bbox.x + bbox.w, y: bbox.y },
      { x: bbox.x + bbox.w, y: bbox.y + bbox.h },
      { x: bbox.x, y: bbox.y + bbox.h },
    ].map((p) => rotatePoint(p, { x: cx, y: cy }, rot));
    let minX = corners[0].x;
    let maxX = corners[0].x;
    let minY = corners[0].y;
    let maxY = corners[0].y;
    for (let i = 1; i < corners.length; i++) {
      const c = corners[i];
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
    return {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    };
  }
  return {
    x: bbox.x - pad,
    y: bbox.y - pad,
    w: bbox.w + pad * 2,
    h: bbox.h + pad * 2,
  };
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
 *
 * Rotation handling: kinds whose `rotation` field is honored (rect, ellipse,
 * text, image — see `objectHonorsRotation`) get their test point reverse-
 * rotated around the bbox center BEFORE the per-kind containment check, so
 * the user can click anywhere inside the visual rotated shape. Line, arrow,
 * and path encode their geometry in endpoints / points and ignore `rotation`
 * — applying it here would double-rotate.
 */
export const hitTestObject = (obj: DrawableObject, p: Point): boolean => {
  const rot = obj.rotation ?? 0;
  const testP =
    objectHonorsRotation(obj) && Number.isFinite(rot) && rot !== 0
      ? reverseRotatePoint(p, getObjectCenter(obj), rot)
      : p;
  switch (obj.kind) {
    case 'path':
      return hitPath(obj, testP);
    case 'rect':
    case 'text':
    case 'image':
      return hitBbox(obj, testP);
    case 'ellipse':
      return hitEllipse(obj, testP);
    case 'line':
    case 'arrow':
      return hitLineLike(obj, testP);
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
 * Standard ray-casting point-in-polygon test. Polygon is an ordered list of
 * vertices; edges are taken between consecutive vertices AND from last back
 * to first (implicit close). Behavior on edge / vertex is implementation-
 * defined and not stabilized — callers that need vertex inclusion should
 * pad the polygon.
 */
export const pointInPolygon = (
  p: Point,
  polygon: readonly Point[]
): boolean => {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

/**
 * True when an object is "fully enclosed" by the given lasso polygon. Uses
 * the object's (rotation-aware) bbox corners — all four must sit inside the
 * polygon. This is the deletion criterion for the lasso eraser mode and
 * matches the user-visible intuition "if I draw a loop around something, it
 * goes away".
 *
 * Caveat: with a non-convex polygon an object could have all 4 corners inside
 * but a center point outside (e.g. a banana-shaped lasso pinching the bbox).
 * A freehand-drawn loop is convex in practice, so we accept that edge case.
 */
export const isObjectEnclosedByPolygon = (
  obj: DrawableObject,
  polygon: readonly Point[]
): boolean => {
  const bbox = getBoundingBoxOrNull(obj);
  if (!bbox) return false;
  const rot = obj.rotation ?? 0;
  const corners: Point[] = [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.w, y: bbox.y },
    { x: bbox.x + bbox.w, y: bbox.y + bbox.h },
    { x: bbox.x, y: bbox.y + bbox.h },
  ];
  // For rotation-honoring kinds, transform the bbox corners into world space
  // before testing — the on-canvas visual is the rotated rect, not the AABB.
  const worldCorners =
    objectHonorsRotation(obj) && Number.isFinite(rot) && rot !== 0
      ? corners.map((c) =>
          rotatePoint(
            c,
            { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 },
            rot
          )
        )
      : corners;
  return worldCorners.every((c) => pointInPolygon(c, polygon));
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
 * space.
 *
 * When `rotation` is non-zero and finite, all handle positions are rotated
 * around the bbox center by `rotation` radians. This keeps the on-canvas
 * handle visuals AND the hit-test positions in agreement with a rotated
 * object's visual frame. Callers may omit `rotation` to keep the existing
 * unrotated semantics.
 */
export const getHandlePositions = (
  bbox: BoundingBox,
  rotation = 0
): Record<HandleName, Point> => {
  const { x, y, w, h } = bbox;
  const midX = x + w / 2;
  const midY = y + h / 2;
  const positions: Record<HandleName, Point> = {
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
  if (!Number.isFinite(rotation) || rotation === 0) return positions;
  const center = { x: midX, y: midY };
  const rotated: Record<HandleName, Point> = {} as Record<HandleName, Point>;
  (Object.keys(positions) as HandleName[]).forEach((name) => {
    rotated[name] = rotatePoint(positions[name], center, rotation);
  });
  return rotated;
};

/**
 * Hit-region multipliers around `HANDLE_SIZE`. Both intentionally exceed
 * `HANDLE_SIZE/2` so the user gets a few-px margin around the visible handle
 * — at scale=1 that's a ~7.5px half-side for resize handles (visible handle
 * is 5px from center) and an 11px radius for the rotation circle.
 */
const RESIZE_HANDLE_HIT_MULT = 0.75;
const ROTATE_HANDLE_HIT_MULT = 1.1;

/**
 * Identify which handle (if any) sits under the given point. `scale` is the
 * current canvas-to-screen scale so a 10px screen handle still resolves to a
 * proportional canvas-space hit region. Handles take precedence over object
 * body hits — call this before `hitTestObjects` when an object is already
 * selected.
 *
 * For kinds that honor `rotation`, the handle positions ARE rotated (so a
 * rotated rect's NW handle sits at the visually-rotated NW corner). The
 * hit-region itself stays an axis-aligned square in screen space — testing
 * with `reverseRotatePoint(p, center, rotation)` puts us back into the
 * object's local axes where the square-vs-point test is straightforward.
 */
export const hitTestHandle = (
  obj: DrawableObject,
  p: Point,
  scale: number
): HandleName | null => {
  const bbox = getBoundingBox(obj);
  const rot =
    objectHonorsRotation(obj) && Number.isFinite(obj.rotation ?? 0)
      ? (obj.rotation ?? 0)
      : 0;
  // Use UNROTATED handle positions and reverse-rotate the test point. This
  // lets us keep the axis-aligned-square hit math while still resolving
  // correctly for rotated objects.
  const positions = getHandlePositions(bbox);
  const testP =
    rot !== 0
      ? reverseRotatePoint(
          p,
          { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 },
          rot
        )
      : p;
  // Handle hit region is a square of half-side = HANDLE_SIZE / scale * mult.
  // Both multipliers (>= 0.5) ensure the hit area exceeds the visible handle
  // by a few px on each side for pointer-friendliness.
  const half = (HANDLE_SIZE / Math.max(scale, 0.0001)) * RESIZE_HANDLE_HIT_MULT;
  const rotateRadius =
    (HANDLE_SIZE / Math.max(scale, 0.0001)) * ROTATE_HANDLE_HIT_MULT;
  // Test rotation FIRST so it wins over the adjacent 'n' handle if both are
  // under the cursor (the rotation handle sits directly above 'n').
  {
    const rp = positions.rotate;
    const ddx = testP.x - rp.x;
    const ddy = testP.y - rp.y;
    if (ddx * ddx + ddy * ddy <= rotateRadius * rotateRadius) {
      return 'rotate';
    }
  }
  // Corners tested before edges so a hit on a corner handle's overlap with
  // an adjacent edge handle's hit region resolves to the corner.
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
      testP.x >= hp.x - half &&
      testP.x <= hp.x + half &&
      testP.y >= hp.y - half &&
      testP.y <= hp.y + half
    ) {
      return name;
    }
  }
  return null;
};
