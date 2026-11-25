import type { GoogleDriveService } from './googleDriveService';
import { driveImageUrl, uploadDriveAsset } from './driveAssetUpload';

/** Keeps card pictures small enough to load quickly on student devices. */
export const MAX_FLASHCARD_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_SIDE_PX = 1200;
const UPLOAD_TYPES = /^image\/(png|jpeg|webp|gif)$/u;
const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });

/** Large stills shrink to 1200px WebP; GIFs keep their animation. Null when it can't be used. */
export const prepareFlashcardImage = async (
  file: File
): Promise<Blob | null> => {
  if (file.type === 'image/gif') {
    return file.size <= MAX_FLASHCARD_IMAGE_BYTES ? file : null;
  }
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return null;
  }
  const { naturalWidth: w, naturalHeight: h } = img;
  if (w === 0 || h === 0) return null;
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.85)
  );
  if (!blob || !UPLOAD_TYPES.test(blob.type)) return null;
  return blob.size <= MAX_FLASHCARD_IMAGE_BYTES ? blob : null;
};

/** Saves the picture in the teacher's Drive, viewable by link so students can see it. */
export const uploadFlashcardImage = async (
  drive: GoogleDriveService,
  blob: Blob
): Promise<string> => {
  const ext = blob.type.split('/')[1] ?? 'png';
  const file = await uploadDriveAsset(drive, {
    blob,
    name: `flashcard-${Date.now()}.${ext}`,
    folder: 'Assets/FlashcardImages',
    audience: 'anyone',
  });
  return driveImageUrl(file.id);
};
