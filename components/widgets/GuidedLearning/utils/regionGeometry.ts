import type { GuidedLearningRegion } from '@/types';
import type {
  EffectiveRegion,
  PctPoint,
  PxRect,
  StageGeometry,
  StageStep,
} from '../types/stage';

/** The slice of StageGeometry the region maths needs. */
export type RegionGeometryInput = Pick<
  StageGeometry,
  'containerSize' | 'imgOffset' | 'renderedTransform' | 'imagePctToContainerPx'
>;

/** Smallest region edge, in image-%. */
export const MIN_REGION_PCT = 1.5;

/** Pin button size in unzoomed container px: `min(32px, 8cqmin)`. */
export function pinSizePx(containerSize: { w: number; h: number }): number {
  return Math.min(32, 0.08 * Math.min(containerSize.w, containerSize.h));
}

/** A step's hit / spotlight / keep-out area in container px, after pan-zoom. */
export function effectiveRegion(
  step: StageStep,
  geometry: RegionGeometryInput
): EffectiveRegion {
  const { containerSize, imgOffset, renderedTransform } = geometry;
  const scale = renderedTransform.scale;
  const centre = geometry.imagePctToContainerPx({
    xPct: step.xPct,
    yPct: step.yPct,
  });
  const region = step.region;
  if (!region) {
    const size = pinSizePx(containerSize) * scale;
    return { cx: centre.x, cy: centre.y, w: size, h: size, shape: 'pin' };
  }
  const imgW = containerSize.w * imgOffset.scaleX * scale;
  const imgH = containerSize.h * imgOffset.scaleY * scale;
  const w = (region.wPct / 100) * imgW;
  const h = (region.hPct / 100) * imgH;
  const out: EffectiveRegion = {
    cx: centre.x,
    cy: centre.y,
    w,
    h,
    shape: region.shape,
  };
  if (region.shape === 'rect') {
    const corner = Math.min(Math.max(region.cornerPct ?? 0, 0), 50);
    out.cornerPx = (corner / 100) * Math.min(w, h);
  }
  if (region.shape === 'polygon' && region.points) {
    out.points = region.points.map((p) =>
      geometry.imagePctToContainerPx({ xPct: p.x, yPct: p.y })
    );
  }
  return out;
}

/** Bounding box of an effective region in container px. */
export function regionRect(region: EffectiveRegion): PxRect {
  return {
    x: region.cx - region.w / 2,
    y: region.cy - region.h / 2,
    w: region.w,
    h: region.h,
  };
}

function pointInPolygon(
  pt: { x: number; y: number },
  points: { x: number; y: number }[]
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Hit test in container px; 'pin' and 'ellipse' test the inscribed ellipse. */
export function pointInRegion(
  pt: { x: number; y: number },
  region: EffectiveRegion
): boolean {
  const dx = pt.x - region.cx;
  const dy = pt.y - region.cy;
  const rx = region.w / 2;
  const ry = region.h / 2;
  if (rx <= 0 || ry <= 0) return false;
  if (region.shape === 'pin' || region.shape === 'ellipse') {
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
  }
  if (
    region.shape === 'polygon' &&
    region.points &&
    region.points.length >= 3
  ) {
    return pointInPolygon(pt, region.points);
  }
  if (Math.abs(dx) > rx || Math.abs(dy) > ry) return false;
  const r = Math.min(region.cornerPx ?? 0, rx, ry);
  if (r <= 0) return true;
  const ix = Math.abs(dx) - (rx - r);
  const iy = Math.abs(dy) - (ry - r);
  if (ix <= 0 || iy <= 0) return true;
  return ix * ix + iy * iy <= r * r;
}

const fmt = (n: number): string => String(Math.round(n * 100) / 100);

/** SVG path for a region, used by the spotlight mask and outlines. */
export function regionPath(region: EffectiveRegion): string {
  const { cx, cy } = region;
  const rx = region.w / 2;
  const ry = region.h / 2;
  if (
    region.shape === 'polygon' &&
    region.points &&
    region.points.length >= 3
  ) {
    const [first, ...rest] = region.points;
    return `M${fmt(first.x)},${fmt(first.y)} ${rest
      .map((p) => `L${fmt(p.x)},${fmt(p.y)}`)
      .join(' ')} Z`;
  }
  if (region.shape === 'pin' || region.shape === 'ellipse') {
    return `M${fmt(cx - rx)},${fmt(cy)} A${fmt(rx)},${fmt(ry)} 0 1,0 ${fmt(cx + rx)},${fmt(cy)} A${fmt(rx)},${fmt(ry)} 0 1,0 ${fmt(cx - rx)},${fmt(cy)} Z`;
  }
  const x = cx - rx;
  const y = cy - ry;
  const w = region.w;
  const h = region.h;
  const r = Math.min(region.cornerPx ?? 0, rx, ry);
  if (r <= 0) {
    return `M${fmt(x)},${fmt(y)} H${fmt(x + w)} V${fmt(y + h)} H${fmt(x)} Z`;
  }
  return [
    `M${fmt(x + r)},${fmt(y)}`,
    `H${fmt(x + w - r)}`,
    `A${fmt(r)},${fmt(r)} 0 0,1 ${fmt(x + w)},${fmt(y + r)}`,
    `V${fmt(y + h - r)}`,
    `A${fmt(r)},${fmt(r)} 0 0,1 ${fmt(x + w - r)},${fmt(y + h)}`,
    `H${fmt(x + r)}`,
    `A${fmt(r)},${fmt(r)} 0 0,1 ${fmt(x)},${fmt(y + h - r)}`,
    `V${fmt(y + r)}`,
    `A${fmt(r)},${fmt(r)} 0 0,1 ${fmt(x + r)},${fmt(y)}`,
    'Z',
  ].join(' ');
}

/** Bounding box of image-% points as a centre plus size. */
export function polygonBBox(points: { x: number; y: number }[]): {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
} {
  if (points.length === 0) return { xPct: 0, yPct: 0, wPct: 0, hPct: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    xPct: (minX + maxX) / 2,
    yPct: (minY + maxY) / 2,
    wPct: maxX - minX,
    hPct: maxY - minY,
  };
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(Math.max(n, lo), hi);

/** Keeps an image-% region (and its centre) inside 0–100 with a 1.5% minimum edge. */
export function clampRegion(
  centre: PctPoint,
  region: GuidedLearningRegion
): { centre: PctPoint; region: GuidedLearningRegion } {
  if (region.shape === 'polygon' && region.points && region.points.length > 0) {
    const box = polygonBBox(region.points);
    const dx =
      box.xPct - box.wPct / 2 < 0
        ? -(box.xPct - box.wPct / 2)
        : box.xPct + box.wPct / 2 > 100
          ? 100 - (box.xPct + box.wPct / 2)
          : 0;
    const dy =
      box.yPct - box.hPct / 2 < 0
        ? -(box.yPct - box.hPct / 2)
        : box.yPct + box.hPct / 2 > 100
          ? 100 - (box.yPct + box.hPct / 2)
          : 0;
    const points = region.points.map((p) => ({
      x: clamp(p.x + dx, 0, 100),
      y: clamp(p.y + dy, 0, 100),
    }));
    const next = polygonBBox(points);
    return {
      centre: { xPct: next.xPct, yPct: next.yPct },
      region: {
        ...region,
        points,
        wPct: Math.max(next.wPct, MIN_REGION_PCT),
        hPct: Math.max(next.hPct, MIN_REGION_PCT),
      },
    };
  }
  const wPct = clamp(region.wPct, MIN_REGION_PCT, 100);
  const hPct = clamp(region.hPct, MIN_REGION_PCT, 100);
  const next: GuidedLearningRegion = { ...region, wPct, hPct };
  if (region.cornerPct !== undefined) {
    next.cornerPct = clamp(region.cornerPct, 0, 50);
  }
  return {
    centre: {
      xPct: clamp(centre.xPct, wPct / 2, 100 - wPct / 2),
      yPct: clamp(centre.yPct, hPct / 2, 100 - hPct / 2),
    },
    region: next,
  };
}
