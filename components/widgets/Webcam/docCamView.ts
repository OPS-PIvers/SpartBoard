export type DocCamRotation = 0 | 90 | 180 | 270;

export interface DocCamView {
  zoom: number;
  rotation: DocCamRotation;
  panX: number;
  panY: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4];

export const DEFAULT_VIEW: DocCamView = {
  zoom: 1,
  rotation: 0,
  panX: 0,
  panY: 0,
};

export const clampZoom = (z: number): number =>
  Number.isFinite(z) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) : MIN_ZOOM;

export const normalizeRotation = (r: unknown): DocCamRotation => {
  if (typeof r !== 'number' || !Number.isFinite(r)) return 0;
  const steps = (((Math.round(r / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  return (steps * 90) as DocCamRotation;
};

export const nextRotation = (r: DocCamRotation): DocCamRotation =>
  normalizeRotation(r + 90);

/** Next preset step above (dir 1) or below (dir -1) a possibly off-step zoom. */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const eps = 0.001;
  if (dir === 1) return ZOOM_STEPS.find((s) => s > zoom + eps) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom - eps) ?? MIN_ZOOM;
}

/** Keeps the zoomed image covering the whole feed so no empty edge shows. */
export function clampPan(view: DocCamView, size: Size): DocCamView {
  const maxX = ((view.zoom - 1) * size.width) / 2;
  const maxY = ((view.zoom - 1) * size.height) / 2;
  return {
    ...view,
    panX: Math.min(maxX, Math.max(-maxX, view.panX)),
    panY: Math.min(maxY, Math.max(-maxY, view.panY)),
  };
}

/** Zooms to `zoom`, keeping the point `focal` (relative to the feed centre) still. */
export function zoomAt(
  view: DocCamView,
  zoom: number,
  focal: { x: number; y: number },
  size: Size
): DocCamView {
  const next = clampZoom(zoom);
  const ratio = next / view.zoom;
  return clampPan(
    {
      ...view,
      zoom: next,
      panX: focal.x - (focal.x - view.panX) * ratio,
      panY: focal.y - (focal.y - view.panY) * ratio,
    },
    size
  );
}

export const isDefaultView = (view: DocCamView): boolean =>
  view.zoom === 1 && view.rotation === 0;

export const isSideways = (r: DocCamRotation): boolean => r === 90 || r === 270;

/** Box the media element occupies before its transform, so a 90° turn still fills the feed. */
export function mediaBox(
  rotation: DocCamRotation,
  size: Size
): { left: number; top: number; width: number; height: number } {
  if (!isSideways(rotation)) {
    return { left: 0, top: 0, width: size.width, height: size.height };
  }
  return {
    left: (size.width - size.height) / 2,
    top: (size.height - size.width) / 2,
    width: size.height,
    height: size.width,
  };
}

export const mediaTransform = (view: DocCamView, mirrored: boolean): string =>
  `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom}) rotate(${view.rotation}deg)${mirrored ? ' scaleX(-1)' : ''}`;

/** Whole frame, turned and mirrored; once zoomed in, only the part the feed shows. */
export function renderView(
  source: CanvasImageSource,
  sourceSize: Size,
  view: DocCamView,
  mirrored: boolean,
  feedSize: Size
): HTMLCanvasElement | null {
  const { width: sw, height: sh } = sourceSize;
  if (!sw || !sh) return null;
  const canvas = document.createElement('canvas');
  const sideways = isSideways(view.rotation);
  const zoomed = view.zoom > 1 && feedSize.width > 0 && feedSize.height > 0;
  let cover = 1;
  let fw = sideways ? sh : sw;
  let fh = sideways ? sw : sh;
  let box = { width: sw, height: sh };
  if (zoomed) {
    fw = feedSize.width;
    fh = feedSize.height;
    box = mediaBox(view.rotation, feedSize);
    cover = Math.max(box.width / sw, box.height / sh);
  }
  const scale = zoomed ? cover * view.zoom : 1;
  canvas.width = Math.max(1, Math.round(fw / scale));
  canvas.height = Math.max(1, Math.round(fh / scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(canvas.width / fw, canvas.height / fh);
  ctx.translate(
    fw / 2 + (zoomed ? view.panX : 0),
    fh / 2 + (zoomed ? view.panY : 0)
  );
  if (zoomed) ctx.scale(view.zoom, view.zoom);
  ctx.rotate((view.rotation * Math.PI) / 180);
  if (mirrored) ctx.scale(-1, 1);
  ctx.beginPath();
  ctx.rect(-box.width / 2, -box.height / 2, box.width, box.height);
  ctx.clip();
  ctx.drawImage(
    source,
    (-sw * cover) / 2,
    (-sh * cover) / 2,
    sw * cover,
    sh * cover
  );
  return canvas;
}
