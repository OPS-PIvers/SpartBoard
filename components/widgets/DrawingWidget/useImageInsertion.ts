import { useCallback, useRef } from 'react';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import { useImageUpload } from '@/hooks/useImageUpload';

/**
 * Geometry handed back to `onImageReady` once an upload finishes. Coordinates
 * are in the canvas's internal pixel space (matching `DrawableObject` fields)
 * so callers can stamp the resulting ImageObject straight into the page.
 */
export interface ImageInsertionResult {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface UseImageInsertionOptions {
  /** Canvas the image will land on. Used for sizing + paste-point math. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Called once a file has uploaded and the renderer-ready geometry is known. */
  onImageReady: (result: ImageInsertionResult) => void;
}

interface UseImageInsertionResult {
  /** Open the hidden file picker. One-shot — does not change the active tool. */
  openPicker: () => void;
  /** Hidden `<input type="file">` to render somewhere stable in the tree. */
  fileInputProps: {
    ref: React.RefObject<HTMLInputElement | null>;
    type: 'file';
    accept: 'image/*';
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    className: 'hidden';
    'aria-hidden': true;
    tabIndex: -1;
  };
  /** Wire to `onPaste` on the canvas / widget root. */
  handlePaste: (e: React.ClipboardEvent) => void;
  /**
   * Variant that accepts a native `ClipboardEvent` — for consumers (e.g. the
   * AnnotationOverlay) that need to bind paste at the window level instead of
   * via React synthetic events. Behaviour is identical to `handlePaste`.
   */
  handleNativePaste: (e: ClipboardEvent) => void;
  /** Wire to `onDrop` on the canvas / widget root. */
  handleDrop: (e: React.DragEvent) => void;
  /** Wire to `onDragOver` so the browser actually fires `drop`. */
  handleDragOver: (e: React.DragEvent) => void;
  /** True while the upload pipeline is in flight (file upload + decode). */
  isUploading: boolean;
}

// Max width an inserted image takes on the canvas at insertion time. Capped at
// 50% of canvas width per the spec so a teacher pasting a 3000px reference
// image doesn't blow up the canvas; aspect ratio is preserved.
const INSERT_MAX_FRACTION = 0.5;

/**
 * Decode a `File` into its natural pixel dimensions. Used to preserve the
 * source image's aspect ratio when we clamp the placement size. Resolves to
 * `null` on decode failure so the caller can fall back to defaults.
 */
const readNaturalSize = (
  file: File
): Promise<{ width: number; height: number } | null> => {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
};

/**
 * Compute the on-canvas geometry for a freshly-decoded image. Clamps the
 * placement to at most half the canvas dimensions, preserves aspect ratio,
 * and centers on the supplied focal point (paste location / drop point /
 * canvas center).
 */
const computeGeometry = (
  natural: { width: number; height: number } | null,
  canvasWidth: number,
  canvasHeight: number,
  focal: { x: number; y: number } | null
): Pick<ImageInsertionResult, 'x' | 'y' | 'w' | 'h'> => {
  const nw = natural?.width && natural.width > 0 ? natural.width : 200;
  const nh = natural?.height && natural.height > 0 ? natural.height : 200;

  const maxW = Math.max(1, canvasWidth * INSERT_MAX_FRACTION);
  const maxH = Math.max(1, canvasHeight * INSERT_MAX_FRACTION);
  const scale = Math.min(1, maxW / nw, maxH / nh);
  const w = nw * scale;
  const h = nh * scale;

  const cx = focal?.x ?? canvasWidth / 2;
  const cy = focal?.y ?? canvasHeight / 2;
  return {
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
  };
};

/**
 * Translate a page-space client point into the canvas's internal coordinate
 * space (the space ImageObjects live in). Mirrors the math `useDrawingCanvas`
 * uses for pointer events.
 */
const pageToCanvas = (
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): { x: number; y: number } | null => {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
};

/**
 * Shared image-insertion pipeline for the DrawingWidget and AnnotationOverlay.
 *
 * Exposes the three entry points the spec calls out (paste / drag-and-drop /
 * file picker), all funnelling through `useImageUpload` with the background-
 * removal pipeline disabled (whiteboard images should keep their original
 * backgrounds — teachers paste diagrams and reference photos that need to
 * stay intact). Uploads land in `users/{uid}/display_images/...` via
 * `uploadDisplayImage` so they share storage policy with other display-grade
 * imagery on the dashboard.
 *
 * The hook is intentionally stateless w.r.t. the resulting `ImageObject`: the
 * caller assembles the final object (id + z + kind) so each consumer can pick
 * the right z-index and id source.
 */
export const useImageInsertion = ({
  canvasRef,
  onImageReady,
}: UseImageInsertionOptions): UseImageInsertionResult => {
  const { user } = useAuth();
  const { uploadDisplayImage } = useStorage();
  const { processAndUploadImage, uploading } = useImageUpload({
    uploadFn: async (file: File) => {
      if (!user) return null;
      return uploadDisplayImage(user.uid, file);
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared upload + geometry path for all three entry points.
  const ingestFile = useCallback(
    async (file: File, focal: { x: number; y: number } | null) => {
      if (!file.type.startsWith('image/')) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasW = canvas.width;
      const canvasH = canvas.height;

      // Kick natural-size decode + upload in parallel. Decode is local and
      // typically faster than upload, so neither blocks the other.
      const [natural, url] = await Promise.all([
        readNaturalSize(file),
        processAndUploadImage(file, { skipProcessing: true }),
      ]);
      if (!url) return;

      const geom = computeGeometry(natural, canvasW, canvasH, focal);
      onImageReady({ src: url, ...geom });
    },
    [canvasRef, onImageReady, processAndUploadImage]
  );

  const openPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset the input value so the same file can be re-selected later.
      e.target.value = '';
      if (!file) return;
      void ingestFile(file, null);
    },
    [ingestFile]
  );

  // Generic paste extraction shared by both the React and native handlers.
  // Returns true if it consumed the event (caller should suppress further
  // default handling — e.g. the Dock's smart-paste listener).
  const ingestFromClipboard = useCallback(
    (clipboardData: DataTransfer | null): boolean => {
      const items = clipboardData?.items;
      if (!items) return false;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          // No focal point for paste — drop in the canvas center.
          void ingestFile(file, null);
          return true;
        }
      }
      return false;
    },
    [ingestFile]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (ingestFromClipboard(e.clipboardData)) {
        e.preventDefault();
      }
    },
    [ingestFromClipboard]
  );

  const handleNativePaste = useCallback(
    (e: ClipboardEvent) => {
      // Skip if the paste is destined for a text input — we don't want to
      // intercept the user typing into a search box or contenteditable.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (ingestFromClipboard(e.clipboardData)) {
        e.preventDefault();
        // Stop other listeners (e.g. the Dock's smart-paste handler) from
        // re-processing the same image.
        e.stopImmediatePropagation?.();
      }
    },
    [ingestFromClipboard]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Suppress default so the browser fires the subsequent `drop`. Without
    // preventDefault here, drag-and-drop is a no-op in most browsers.
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      const focal = canvas ? pageToCanvas(canvas, e.clientX, e.clientY) : null;
      void ingestFile(file, focal);
    },
    [canvasRef, ingestFile]
  );

  return {
    openPicker,
    fileInputProps: {
      ref: fileInputRef,
      type: 'file',
      accept: 'image/*',
      onChange: handleFileInputChange,
      className: 'hidden',
      'aria-hidden': true,
      tabIndex: -1,
    },
    handlePaste,
    handleNativePaste,
    handleDrop,
    handleDragOver,
    isUploading: uploading,
  };
};
