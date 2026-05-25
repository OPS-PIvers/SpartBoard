import { ImageObject } from '@/types';

// Module-level cache keyed on `src` so the renderer doesn't re-decode the
// same image every paint. The cache is process-wide intentionally: a teacher
// who places the same image in multiple widgets / pages / annotations gets a
// single decode. Stored values are either an in-flight `HTMLImageElement`
// (still loading) or a fully-loaded one.
const imageCache = new Map<string, HTMLImageElement>();

/**
 * Test-only escape hatch. The hook-level test runs ImageObjects through this
 * module and would otherwise carry a hot cache across tests in the same file.
 */
export const _clearImageCacheForTesting = (): void => {
  imageCache.clear();
};

/**
 * Ensure the given image source is in the module-level cache, optionally
 * resolving when it finishes loading. Used by the export pipeline
 * (`exportCanvas.preloadImages`) to populate the SAME cache the live
 * renderer reads from — without this, the export's allocated Image elements
 * would be GC'd before the offscreen paint runs and the rendered objects
 * would silently appear empty in the exported PNG/PDF.
 *
 * Failed loads resolve (do not reject) so a single bad image doesn't block
 * an export of an otherwise-fine page. The failed entry is dropped from the
 * cache the same way `renderImage`'s own error path drops it.
 */
export const ensureImageLoaded = (src: string): Promise<void> => {
  const existing = imageCache.get(src);
  if (existing) {
    if (existing.complete && existing.naturalWidth > 0)
      return Promise.resolve();
    if (existing.complete) {
      // `complete` is true but `naturalWidth === 0` — the load already
      // terminated (success would have naturalWidth > 0; the only other
      // way `complete` is true is after a load error or an aborted decode).
      // The error event has already fired (or will never fire because the
      // decode is done), so attaching new load/error listeners would hang
      // the export indefinitely. Resolve immediately — the renderer's
      // `cached.complete && cached.naturalWidth > 0` guard ensures we don't
      // paint an empty image, so resolving here is safe.
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const done = () => resolve();
      // Attach own listeners — the existing entry already has its own
      // onload set by `renderImage`, so we use addEventListener to avoid
      // clobbering that path.
      existing.addEventListener('load', done, { once: true });
      existing.addEventListener('error', done, { once: true });
    });
  }
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const done = () => resolve();
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', () => {
      imageCache.delete(src);
      resolve();
    });
    imageCache.set(src, img);
    img.src = src;
  });
};

/**
 * Pure Canvas 2D renderer for an ImageObject.
 *
 * - On first paint of a previously-unseen `src`, allocates an `HTMLImageElement`
 *   with `crossOrigin = 'anonymous'` (so the canvas stays exportable in Wave 7)
 *   and starts loading. Subsequent paints reuse the cached element.
 * - While the image is still loading, the renderer paints nothing — the next
 *   re-render after `onload` will paint it. Callers wire `onLoad` to a redraw
 *   trigger so a freshly-pasted image appears as soon as bytes arrive.
 * - If the image fails to load (e.g. CORS, 404), the renderer also paints
 *   nothing rather than leaving stale state. A future PR may surface a
 *   placeholder/error chip; for now we match the spec's "render nothing"
 *   guidance to keep the canvas clean for export.
 *
 * Rotation: when `obj.rotation` is non-zero, the canvas is rotated around
 * the bbox center BEFORE `drawImage` so the image (and its bbox) rotate
 * together. Lines/arrows ignore rotation (endpoint-defined) but image is a
 * bbox + rotation pair like rect/ellipse/text.
 */
export const renderImage = (
  ctx: CanvasRenderingContext2D,
  obj: ImageObject,
  onLoad?: () => void
): void => {
  const cached = imageCache.get(obj.src);
  if (cached) {
    if (cached.complete && cached.naturalWidth > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      const rot = obj.rotation ?? 0;
      if (Number.isFinite(rot) && rot !== 0) {
        const cx = obj.x + obj.w / 2;
        const cy = obj.y + obj.h / 2;
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.translate(-cx, -cy);
      }
      ctx.drawImage(cached, obj.x, obj.y, obj.w, obj.h);
      ctx.restore();
    }
    // If still loading, the cached element already has an onload that will
    // trigger redraw — nothing more to do here.
    return;
  }

  // First sighting of this src — allocate, wire callbacks, kick the load.
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    onLoad?.();
  };
  img.onerror = () => {
    // Drop the failed entry so a later retry (e.g. the user re-pastes the
    // image) can re-attempt the decode instead of being stuck on the bad
    // cached entry. We don't surface the error here — the canvas just stays
    // empty for this object until/unless the user replaces it.
    imageCache.delete(obj.src);
  };
  imageCache.set(obj.src, img);
  // Assign src AFTER wiring handlers so synchronous-cache-hit semantics in
  // some browsers don't fire before we'd hear them.
  img.src = obj.src;
};
