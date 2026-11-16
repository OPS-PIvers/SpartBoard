import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/config/firebase';

/** Mirrors the `storage.rules` cap on users/{uid}/flashcard_images. */
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

export const uploadFlashcardImage = async (
  uid: string,
  blob: Blob
): Promise<string> => {
  const ext = blob.type === 'image/gif' ? 'gif' : blob.type.split('/')[1];
  const path = `users/${uid}/flashcard_images/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const snapshot = await uploadBytes(ref(storage, path), blob, {
    contentType: blob.type,
    cacheControl: 'public, max-age=31536000, immutable',
  });
  return getDownloadURL(snapshot.ref);
};
