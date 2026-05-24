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
