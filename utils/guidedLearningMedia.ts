/**
 * Media-intake helpers for the Guided Learning editor: file validation for
 * the expanded image/GIF/video pipeline, and client-side downscaling so
 * 4K screenshots don't ship multi-megabyte originals to every student.
 */

export type GuidedLearningMediaKind = 'image' | 'video';

/** `accept` attribute for the slide file input / drop zone. */
export const GL_MEDIA_ACCEPT =
  'image/*,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov';

/** Static images are re-encoded below this; GIFs upload as-is up to this cap. */
export const GL_MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB
export const GL_MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB

/** Longest edge after downscaling — plenty for projector + student screens. */
const MAX_IMAGE_DIMENSION = 2560;
/** Skip re-encoding when the original is already small. */
const REENCODE_THRESHOLD_BYTES = 600 * 1024;

const VIDEO_MIME_PREFIX = /^video\//;

export function getMediaKind(file: File): GuidedLearningMediaKind | null {
  if (VIDEO_MIME_PREFIX.test(file.type)) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  // Some OSes hand over screen recordings with an empty MIME type — fall
  // back to the extension so drag-dropped .mov/.mp4 files still work.
  if (/\.(mp4|webm|mov)$/i.test(file.name)) return 'video';
  if (/\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(file.name)) return 'image';
  return null;
}

/**
 * Validate a slide upload. Returns an error string (for the editor's error
 * strip) or null when the file is acceptable.
 */
export function validateSlideFile(file: File): string | null {
  const kind = getMediaKind(file);
  if (!kind) {
    return `"${file.name}" isn't a supported file. Use an image (PNG, JPG, GIF, WebP…) or a video (MP4, WebM, MOV).`;
  }
  if (kind === 'video' && file.size > GL_MAX_VIDEO_BYTES) {
    return `"${file.name}" is too large (max ${Math.round(GL_MAX_VIDEO_BYTES / 1024 / 1024)}MB for video). Trim it or record a shorter clip.`;
  }
  if (kind === 'image' && file.size > GL_MAX_IMAGE_BYTES) {
    return `"${file.name}" is too large (max ${Math.round(GL_MAX_IMAGE_BYTES / 1024 / 1024)}MB for images).`;
  }
  return null;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read "${file.name}" as an image.`));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Downscale + re-encode a static image before upload. Animated GIFs and
 * SVGs pass through untouched (re-encoding would flatten/rasterize them),
 * as do images that are already small. Returns the original file whenever
 * processing wouldn't actually shrink it.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (
    file.type === 'image/gif' ||
    file.type === 'image/svg+xml' ||
    typeof document === 'undefined'
  ) {
    return file;
  }

  let img: HTMLImageElement;
  try {
    img = await loadImageFromFile(file);
  } catch {
    // Unreadable as an image element (or a decode quirk) — let the raw
    // file through; upload-side limits still apply.
    return file;
  }

  const { naturalWidth: w, naturalHeight: h } = img;
  if (w === 0 || h === 0) return file;

  const needsResize = Math.max(w, h) > MAX_IMAGE_DIMENSION;
  if (!needsResize && file.size <= REENCODE_THRESHOLD_BYTES) return file;

  const scale = needsResize ? MAX_IMAGE_DIMENSION / Math.max(w, h) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // WebP keeps alpha (screenshots with transparency) at far smaller sizes
  // than PNG; fall back to JPEG if the browser can't encode WebP.
  let blob = await canvasToBlob(canvas, 'image/webp', 0.85);
  if (!blob || blob.type !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
  }
  if (!blob || blob.size >= file.size) return file;

  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${baseName}.${ext}`, { type: blob.type });
}

/**
 * Pick a thumbnail-safe URL for a set: the first slide whose kind is
 * `'image'`. `<img>` tags can't render a video URL, so video-first sets
 * would otherwise show a broken library card.
 */
export function pickThumbnailUrl(set: {
  imageUrls: string[];
  imageKinds?: ('image' | 'video')[];
}): string {
  const kinds = set.imageKinds ?? [];
  const idx = set.imageUrls.findIndex(
    (_, i) => (kinds[i] ?? 'image') !== 'video'
  );
  return idx >= 0 ? set.imageUrls[idx] : '';
}

/** File extension for an uploaded/recorded video blob's MIME type. */
export function videoExtensionForMime(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('quicktime')) return 'mov';
  return 'mp4';
}
